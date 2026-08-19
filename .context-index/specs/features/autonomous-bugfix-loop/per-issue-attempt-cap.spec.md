<!-- partial_schema: spec@1 -->

---
charter: autonomous-bugfix-loop
status: review-pending
kind: behavioral
risk_level: high
milestone: 1
revision: 2
charter-revision: 4
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
- **The "blocker" analog for a debug attempt is its set of failing quality-gate check IDs.** `/adev:debug --auto`'s Phase 6 step 1 ("Run quality gates") surfaces failures as a stable, comparable set of IDs (e.g., failing test names) per the sibling `debug-completion-and-auto` spec's BEH-8, which this spec consumes.
- **The `--auto` flag itself is a dependency on the sibling `debug-completion-and-auto` spec**, not yet present in `skills/debug/SKILL.md` today — every behavior below that references `/adev:debug --issue <id> --auto` depends on that sibling spec landing first (or alongside).
- The per-issue attempt cap value is read from manifest key **`tasks.bugfix_loop.attempt_cap`**, defaulting to 2 when unset — the same number `build.max_review_retries` currently defaults to (note: `manifest.yaml` currently carries two conflicting `build:` blocks with `max_review_retries` values of 9 and 2 respectively, an existing drift bug unrelated to this spec; this spec's own key is independent and unaffected by that drift).
- **The `AttemptRecord` write itself (BEH-1/2/3) is invoked by the sibling `/adev:bugfix-loop` skill**, immediately after it reads the `ADEV-DEBUG:` token each turn (`bugfix-loop-skill.spec.md`'s Output Contract names this call site). `/adev:debug` itself never calls it (BEH-7).

### Behaviors

<!-- retired-behavior-ids: (none) -->

- **BEH-1** — **When** `/adev:debug --issue <id> --auto` completes with `ADEV-DEBUG: FIXED` **then** the issue's `AttemptRecord.attempts` increments by 1 and `last_verdict` is set to `PASS`.
- **BEH-2** — **When** `/adev:debug --issue <id> --auto` completes with `ADEV-DEBUG: PARKED` **then** `AttemptRecord.attempts` increments, the attempt's failing quality-gate check IDs are recorded as `curr_blockers`, and `partitionBlockers(prev_blockers, curr_blockers)` is computed **unconditionally** — using an empty `prev_blockers`/`persistent` set when no prior `AttemptRecord` exists, exactly as BEH-5 already assumes — then passed to `evaluateStopCondition` (imported directly, not reimplemented) with `retries_remaining = cap - attempts`, producing `last_verdict` ∈ `{CONTINUE, NO_PROGRESS, REGRESSED, BUDGET_EXHAUSTED}`. This is unconditional specifically so a `cap`-of-1 (or any cap) first attempt that already exhausts `retries_remaining` correctly yields `BUDGET_EXHAUSTED` rather than an unset verdict — gating the call on "a prior attempt exists" would silently skip that case.
- **BEH-3** — **When** `/adev:debug --issue <id> --auto` completes with `ADEV-DEBUG: UNREPRODUCIBLE` **then** `AttemptRecord.attempts` increments, `last_verdict` is set to `BUDGET_EXHAUSTED` immediately (treated as terminal — a same-context retry has no expected value), and `parked_reason` is set to `"does not reproduce"`. `parked_reason` is diagnostic/audit-only metadata — human-readable via direct inspection of the `lifecycle-state/` JSONL, with no programmatic reader in this charter; it exists so a human clearing a capped issue (BEH-4) can see why without re-running `/adev:debug`.
- **BEH-4 (consumed by the sibling `bug-selection-and-eligibility` spec — authoritative exclusion set)** — **When** an `AttemptRecord.last_verdict` is `NO_PROGRESS`, `REGRESSED`, or `BUDGET_EXHAUSTED` **then** the issue is excluded from `adev issues next`'s candidacy until a human clears the record. This spec is the sole source of truth for which verdicts exclude an issue; the selection verb's BEH-5 must exclude on exactly this three-value set — `{NO_PROGRESS, REGRESSED, BUDGET_EXHAUSTED}`, not a subset — and any future change to this set is made here first, then propagated to that spec.
- **BEH-5** — **When** no `AttemptRecord` exists for an issue **then** it is treated as zero attempts with an empty `prev_blockers` set — matching `evaluateStopCondition`'s existing `prevSet.size > 0` guard, so a first attempt never triggers `NO_PROGRESS` or `REGRESSED`.
- **BEH-6** — **When** `attempts >= cap` without a `PASS` verdict having been reached **then** `evaluateStopCondition`'s `retries_remaining <= 0` branch fires, producing `BUDGET_EXHAUSTED` — this is the existing function's behavior, verified against, not reimplemented.
- **BEH-7** — **When** `/adev:debug --issue <id> --auto` is invoked for an issue **then** `/adev:debug` itself has no awareness of the attempt cap or `AttemptRecord` — enforcement is entirely the eligibility filter's responsibility (BEH-4 above), keeping the cap's bounding logic in one place rather than duplicated across the worker and the selector.

### Postconditions

- Every completed `/adev:debug --issue --auto` invocation produces exactly one `AttemptRecord` update (create-if-absent, increment, set `last_verdict`).
- `AttemptRecord` state persists in `.context-index/lifecycle-state/bugfix-loop-attempts.jsonl` as an append-only event log (per ADR-0015's dual-format convention — this file and its owning module must be added to ADR-0015's Decision-section ownership table as part of implementation), independent of the issue board schema — `task-management`'s `WorkItem` gains no new fields from this spec.
- `AttemptRecord`'s persisted fields are `issue_id, attempts, last_verdict, curr_blockers, parked_reason, updated_at` — extending the charter's Domain Model with `curr_blockers` (the current attempt's failing check-ID set, or its bounded hash in degraded mode — see Error Cases), persisted specifically so the *next* attempt can read it back as `prev_blockers` for BEH-2's diffing.
- A `BUDGET_EXHAUSTED`, `NO_PROGRESS`, or `REGRESSED` verdict is durable across loop runs and machine restarts — it is read from disk, not held only in a running loop's memory.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Quality-gate failure output has no stable/comparable check-ID shape (only raw stdout, no discrete IDs) | Falls back to a coarse "did the failure output change at all since the last attempt" comparison, computed over `crypto.createHash('sha256')` of the raw output (bounded, matching the existing precedent in `lib/blocker-id.mjs`) — **never the raw output itself** — before it is persisted to the git-tracked JSONL; `NO_PROGRESS` fires only when consecutive hashes match | `NO_STABLE_CHECK_IDS` (degraded mode, not a hard error) |
| `AttemptRecord` state file is corrupted or unparseable | Treated as if no record exists (fails open to "zero attempts"); logs a warning; never silently blocks the loop | — |
| Cap value not configured in manifest | Defaults to 2, mirroring `build.max_review_retries`'s existing default | — |

## System Constitution Reference

- **Principle:** "Minimize external dependencies — prefer Node.js built-ins." — Applies because this spec reuses `lib/loop-convergence.mjs`'s existing pure functions rather than writing new bounding logic from scratch.
- **Architecture Boundary:** No item in "Requires Human Approval" is triggered — this spec adds a new caller of an existing internal module; it does not change the hook protocol, the CLI installation structure, or add an external dependency.
- **Coordination note (not a constitution citation, a risk flag):** `lib/loop-convergence.mjs` is owned by a `risk_level: high`, `status: validated` spec. This spec's implementer must not modify that module's exports' signatures or behavior — only call them. Any future need to change the module itself is out of scope here and requires explicit coordination with that spec's owner.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Define `AttemptRecord` read/write helpers | New small module wrapping the JSONL event log at `.context-index/lifecycle-state/bugfix-loop-attempts.jsonl`, schema `issue_id, attempts, last_verdict, curr_blockers, parked_reason, updated_at` | small |
| Add ADR-0015 Decision-table entry | Register `bugfix-loop-attempts.jsonl` and its owning module in ADR-0015's ownership table, per that ADR's stated requirement | small |
| Call `partitionBlockers`/`evaluateStopCondition` per completed attempt, unconditionally | Map debug-attempt outcomes onto the existing function signatures (BEH-1–3, BEH-6), always calling on `PARKED` regardless of prior-attempt existence (BEH-2) | medium |
| Add `tasks.bugfix_loop.attempt_cap` manifest config | Defaults to 2 | small |
| Implement bounded-hash degraded-mode fallback | `crypto.createHash('sha256')` over raw failure output when no stable check-ID shape is available, never persisting raw output (BD-6) | small |
| Tests | `node:test` coverage for the full verdict matrix (PASS, CONTINUE, NO_PROGRESS, REGRESSED, BUDGET_EXHAUSTED, UNREPRODUCIBLE-as-immediate-terminal, cap-1-first-attempt), corrupted-state fallback, degraded-mode hash fallback | medium |

## Acceptance Criteria

- [ ] `AttemptRecord` increments and updates `last_verdict` correctly for FIXED, PARKED, and UNREPRODUCIBLE outcomes
- [ ] `NO_PROGRESS`/`REGRESSED`/`BUDGET_EXHAUSTED` verdicts are computed via `lib/loop-convergence.mjs`'s existing functions, not reimplemented
- [ ] A first attempt on an issue never triggers `NO_PROGRESS` or `REGRESSED` (matches the underlying function's guard)
- [ ] A `cap`-of-1 (or any cap) first attempt that already exhausts `retries_remaining` correctly yields `BUDGET_EXHAUSTED`, not an unset verdict (BEH-2's unconditional call)
- [ ] `UNREPRODUCIBLE` sets `BUDGET_EXHAUSTED` immediately without waiting for further attempts
- [ ] `AttemptRecord` state persists in `.context-index/lifecycle-state/` and survives process restarts
- [ ] `curr_blockers` is persisted per attempt and correctly read back as the next attempt's `prev_blockers`
- [ ] Degraded-mode fallback persists only a bounded SHA-256 hash of failure output, never raw stdout
- [ ] ADR-0015's Decision-section table includes an entry for this spec's new artifact
- [ ] `lib/loop-convergence.mjs` itself is unmodified by this work — verified by diff review, not just test pass
- [ ] Corrupted state file fails open (treated as zero attempts) rather than blocking the loop
- [ ] All quality gates pass (`npm test`)
- [ ] No constitutional violations introduced
