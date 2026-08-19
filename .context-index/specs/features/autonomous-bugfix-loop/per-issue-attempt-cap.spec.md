<!-- partial_schema: spec@1 -->

---
charter: autonomous-bugfix-loop
status: review-blocked
kind: behavioral
risk_level: high
milestone: 1
revision: 1
charter-revision: 2
created: 2026-08-19
updated: 2026-08-19
---

# Live Spec: Per-Issue Attempt Cap

<!-- Live Spec within the autonomous-bugfix-loop charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/autonomous-bugfix-loop/charter.md -->

## Behavioral Contract

### Preconditions

- **This spec is a new caller of `lib/loop-convergence.mjs`, not a modification of it.** That module is owned by `review-block-auto-retry.spec.md` (`status: validated`, `risk_level: high`) and its two exports — `partitionBlockers(prev, curr)` and `evaluateStopCondition({...})` — are imported and called as-is, with debug-attempt data mapped onto their existing parameter shape (blocker-ID sets, `retries_remaining`, `verdict`). This spec does not propose changing that module's implementation; if a future need to do so arises, that is a separate, coordinated change per the charter's Dependencies table.
- **The "blocker" analog for a debug attempt is its set of failing quality-gate check IDs.** `/adev:debug --auto`'s Phase 6 step 1 ("Run quality gates") must surface failures as a stable, comparable set of IDs (e.g., failing test names) for this spec's diffing to be meaningful — this is a new requirement on that step's output shape, tracked as an implementation dependency on the sibling `debug-completion-and-auto` spec, not something Phase 6 currently produces in structured form.
- The per-issue attempt cap value defaults to the same default already used for `build.max_review_retries` (2), reusing existing manifest precedent rather than inventing a new default.

### Behaviors

<!-- retired-behavior-ids: (none) -->

- **BEH-1** — **When** `/adev:debug --issue <id> --auto` completes with `ADEV-DEBUG: FIXED` **then** the issue's `AttemptRecord.attempts` increments by 1 and `last_verdict` is set to `PASS`.
- **BEH-2** — **When** `/adev:debug --issue <id> --auto` completes with `ADEV-DEBUG: PARKED` **then** `AttemptRecord.attempts` increments, the attempt's failing quality-gate check IDs are recorded as `curr_blockers`, and — if a prior attempt exists — `partitionBlockers(prev_blockers, curr_blockers)` is computed and passed to `evaluateStopCondition` (imported directly, not reimplemented) with `retries_remaining = cap - attempts`, producing `last_verdict` ∈ `{CONTINUE, NO_PROGRESS, REGRESSED, BUDGET_EXHAUSTED}`.
- **BEH-3** — **When** `/adev:debug --issue <id> --auto` completes with `ADEV-DEBUG: UNREPRODUCIBLE` **then** `AttemptRecord.attempts` increments, `last_verdict` is set to `BUDGET_EXHAUSTED` immediately (treated as terminal — a same-context retry has no expected value), and `parked_reason` is set to `"does not reproduce"`.
- **BEH-4 (consumed by the sibling `bug-selection-and-eligibility` spec)** — **When** an `AttemptRecord.last_verdict` is `NO_PROGRESS`, `REGRESSED`, or `BUDGET_EXHAUSTED` **then** the issue is excluded from `adev issues next`'s candidacy until a human clears the record. This spec defines the state; the selection verb's BEH-5 consumes it.
- **BEH-5** — **When** no `AttemptRecord` exists for an issue **then** it is treated as zero attempts with an empty `prev_blockers` set — matching `evaluateStopCondition`'s existing `prevSet.size > 0` guard, so a first attempt never triggers `NO_PROGRESS` or `REGRESSED`.
- **BEH-6** — **When** `attempts >= cap` without a `PASS` verdict having been reached **then** `evaluateStopCondition`'s `retries_remaining <= 0` branch fires, producing `BUDGET_EXHAUSTED` — this is the existing function's behavior, verified against, not reimplemented.
- **BEH-7** — **When** `/adev:debug --issue <id> --auto` is invoked for an issue **then** `/adev:debug` itself has no awareness of the attempt cap or `AttemptRecord` — enforcement is entirely the eligibility filter's responsibility (BEH-4 above), keeping the cap's bounding logic in one place rather than duplicated across the worker and the selector.

### Postconditions

- Every completed `/adev:debug --issue --auto` invocation produces exactly one `AttemptRecord` update (create-if-absent, increment, set `last_verdict`).
- `AttemptRecord` state persists in `.context-index/lifecycle-state/bugfix-loop-attempts.jsonl` as an append-only event log (per ADR-0015's dual-format convention), independent of the issue board schema — `task-management`'s `WorkItem` gains no new fields from this spec.
- A `BUDGET_EXHAUSTED`, `NO_PROGRESS`, or `REGRESSED` verdict is durable across loop runs and machine restarts — it is read from disk, not held only in a running loop's memory.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Quality-gate failure output has no stable/comparable check-ID shape (only raw stdout, no discrete IDs) | Falls back to a coarse "did the failure output change at all since the last attempt" boolean; `NO_PROGRESS` only fires on byte-identical failure output | `NO_STABLE_CHECK_IDS` (degraded mode, not a hard error) |
| `AttemptRecord` state file is corrupted or unparseable | Treated as if no record exists (fails open to "zero attempts"); logs a warning; never silently blocks the loop | — |
| Cap value not configured in manifest | Defaults to 2, mirroring `build.max_review_retries`'s existing default | — |

## System Constitution Reference

- **Principle:** "Minimize external dependencies — prefer Node.js built-ins." — Applies because this spec reuses `lib/loop-convergence.mjs`'s existing pure functions rather than writing new bounding logic from scratch.
- **Architecture Boundary:** No item in "Requires Human Approval" is triggered — this spec adds a new caller of an existing internal module; it does not change the hook protocol, the CLI installation structure, or add an external dependency.
- **Coordination note (not a constitution citation, a risk flag):** `lib/loop-convergence.mjs` is owned by a `risk_level: high`, `status: validated` spec. This spec's implementer must not modify that module's exports' signatures or behavior — only call them. Any future need to change the module itself is out of scope here and requires explicit coordination with that spec's owner.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Define `AttemptRecord` read/write helpers | New small module wrapping the JSONL event log at `.context-index/lifecycle-state/bugfix-loop-attempts.jsonl` | small |
| Wire `/adev:debug --auto` Phase 6 to emit stable check-ID sets on failure | Structured failure output for BEH-2's diffing (coordinate with `debug-completion-and-auto` spec) | medium |
| Call `partitionBlockers`/`evaluateStopCondition` per completed attempt | Map debug-attempt outcomes onto the existing function signatures (BEH-1–3, BEH-6) | medium |
| Add manifest config for the attempt cap | Reuse `build.max_review_retries`'s default; new key scoped to this feature | small |
| Tests | `node:test` coverage for the full verdict matrix (PASS, CONTINUE, NO_PROGRESS, REGRESSED, BUDGET_EXHAUSTED, UNREPRODUCIBLE-as-immediate-terminal), corrupted-state fallback, degraded-mode check-ID fallback | medium |

## Acceptance Criteria

- [ ] `AttemptRecord` increments and updates `last_verdict` correctly for FIXED, PARKED, and UNREPRODUCIBLE outcomes
- [ ] `NO_PROGRESS`/`REGRESSED`/`BUDGET_EXHAUSTED` verdicts are computed via `lib/loop-convergence.mjs`'s existing functions, not reimplemented
- [ ] A first attempt on an issue never triggers `NO_PROGRESS` or `REGRESSED` (matches the underlying function's guard)
- [ ] `UNREPRODUCIBLE` sets `BUDGET_EXHAUSTED` immediately without waiting for further attempts
- [ ] `AttemptRecord` state persists in `.context-index/lifecycle-state/` and survives process restarts
- [ ] `lib/loop-convergence.mjs` itself is unmodified by this work — verified by diff review, not just test pass
- [ ] Corrupted state file fails open (treated as zero attempts) rather than blocking the loop
- [ ] All quality gates pass (`npm test`)
- [ ] No constitutional violations introduced
