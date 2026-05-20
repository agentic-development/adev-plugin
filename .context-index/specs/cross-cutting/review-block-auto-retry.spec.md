# Live Spec: Auto-Retry Loop on Review BLOCK

<!-- Cross-cutting Live Spec spanning agent-reliable-state-artifacts (per-revision events,
     reviewer-emitted blocker IDs), spec-lifecycle (/adev:specify --revise workflow), and
     strategic-planning (/adev:build loop reintegration).
     Resolves issue-527 (HIGH PRIORITY) — restore the blocker-fix loop that commit
     7e333fd removed when it replaced the broken --revise + --blocker-context invocation
     with the sidecar+fail-loud fallback.
     Related artifacts:
       - .context-index/adrs/0012-plan-adjacent-sidecar-artifacts.md (sidecar pattern)
       - .context-index/specs/features/agent-reliable-state-artifacts/plan-task-events.spec.md (CON-8)
       - .context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md (event schema)
       - Commit history: c080e13, e384afe, 7e333fd, ee41a5f -->

---
affects: [agent-reliable-state-artifacts, spec-lifecycle, strategic-planning]
kind: behavioral
mode: cross-cutting
status: validated
risk_level: high
revision: 1
created: 2026-05-19
updated: 2026-05-20
tracker-ref: issue-527
source-manifest:
  sha: "2111755"
  files:
    - cli/index.mjs
    - lib/blocker-id.mjs
    - lib/blockers-writer.mjs
    - lib/cli/specify.mjs
    - lib/diagnostics/event-schemas.mjs
    - lib/diagnostics/revision-monotonic.mjs
    - lib/lifecycle-events.mjs
    - lib/lifecycle-state.mjs
    - lib/loop-convergence.mjs
    - lib/manifest.mjs
    - lib/specify-revise.mjs
    - skills/build/SKILL.md
    - skills/retro/SKILL.md
    - skills/review-specs/SKILL.md
    - skills/review-specs/consistency-analyzer-prompt.md
    - skills/review-specs/security-reviewer-prompt.md
    - skills/review-specs/structural-architect-prompt.md
    - skills/specify/SKILL.md
    - skills/status/SKILL.md
    - tests/cli/specify-revise.test.mjs
    - tests/integration/build-loop-auto-retry.test.mjs
    - tests/integration/build-loop-legacy-reviewer-fallback.test.mjs
    - tests/lib/blocker-id.test.mjs
    - tests/lib/blockers-writer.test.mjs
    - tests/lib/diagnostics/revision-monotonic.test.mjs
    - tests/lib/lifecycle-events.test.mjs
    - tests/lib/loop-convergence.test.mjs
    - tests/lib/specify-revise.test.mjs
    - tests/skills/review-specs-blocker-id-emission.test.mjs
  computed-at: "2026-05-20T04:27:36.454Z"
---

## Behavioral Contract

When `/adev:review-specs` returns BLOCK, the `/adev:build --full` orchestrator (under `--auto` or `build.max_review_retries > 0`) MUST be able to dispatch a real `/adev:specify --revise <spec>` invocation that reads the spec's current revision N together with the sidecar `<spec-stem>.review.md` and `<spec-stem>.blockers.md`, produces revision N+1 as a targeted patch (not a rewrite), bumps `revision: N → N+1` atomically, and emits a `spec_revised` lifecycle event. Reviewers MUST emit stable, deterministic blocker IDs alongside their prose findings so the loop can compare blocker sets across revisions. Lifecycle events from reviewers and step transitions MUST carry an optional `revision: N` field so `currentState()` can expose per-revision verdicts. The loop converges by partitioning blocker IDs across revisions into `addressed`, `persistent`, and `new` sets, and stops on PASS, budget exhaustion, no-progress (`persistent ∪ new == prev_blockers AND addressed == ∅`), or regression (`new ⊋ ∅ AND |new| > |addressed|`). `build.max_review_retries` default flips back to 2, and BLOCK under `--auto` no longer fails immediately — it runs through the budget. LLM-judgment non-determinism is acknowledged: capped retries plus an optional `--require-human-final-pass` gate are the convergence-safety contract.

### Preconditions

- The spec being revised has `status: review-blocked` with a `<spec-stem>.review.md` containing the latest reviewer findings and a `<spec-stem>.blockers.md` listing the canonical blocker IDs that caused BLOCK.
- The reviewer subagents have been updated to emit canonical blocker IDs (per Behavior 3 below) — pre-update reviewer outputs are not loop-eligible and trigger graceful fallback to the current sidecar+fail-loud path.
- The lifecycle event log for the spec exists and is readable; `currentState()` returns a projection that exposes `state.steps.review.byRevision`.
- `/adev:build --full` is invoked with `--auto` OR the manifest's `build.max_review_retries > 0` (default flipped back to 2 by this spec).

### Behaviors

1. **When** `/adev:specify --revise <spec>` is invoked **then** it loads spec revision N + the most-recent `<spec-stem>.review.md` (rev-N reviewer findings) + `<spec-stem>.blockers.md` (canonical blocker IDs from rev N), produces a TARGETED patch addressing each blocker (preserving frontmatter fields not implicated by blockers, preserving spec body sections not implicated by blockers), bumps `revision: N → N+1` and `updated:` to today, and writes the result atomically (temp-then-rename per `incremental-artifact-writes.spec.md`).
2. **When** `/adev:specify --revise <spec>` completes successfully **then** it emits a `spec_revised` lifecycle event carrying `{ from_revision: N, to_revision: N+1, addressed_blocker_ids: […], unresolved_blocker_ids: […] }` and clears the `.blockers.md` sidecar (or rewrites it with `unresolved_blocker_ids` only). The `<spec-stem>.review.md` sidecar is NOT cleared — the next `/adev:review-specs` invocation rewrites it.
3. **When** any reviewer subagent emits a finding **then** the finding carries a canonical `blocker_id` of the form `<reviewer-slug>:<finding-type>:<location-hash>` where `<reviewer-slug>` is the subagent slug, `<finding-type>` is a stable category (e.g., `missing-precondition`, `ambiguous-behavior`, `constitution-violation`), and `<location-hash>` is the first 8 hex chars of SHA-256(`<spec-section-anchor>:<truncated-finding-text>`). The same finding regenerated against the same spec rev MUST produce the same `blocker_id` (deterministic). Reviewer prose is preserved alongside the ID; consumers join on ID.
4. **When** any `reviewer_report` or `step_completed` event is appended to a spec's lifecycle log **then** the event carries an optional `revision: N` field equal to the spec's `revision:` frontmatter at write time. Legacy events without `revision:` are treated as revision 1 at fold time (backwards-compatibility).
5. **When** `currentState(projectRoot, specPath)` is folded **then** the projection exposes `state.steps.<step>.byRevision[N]` as a map of revision number → `{ verdict, score, blockers, completed_at }`. The current top-level `state.steps.<step>` remains the verdict of the latest revision (no breaking change to existing reads).
6. **When** `/adev:build --full` runs the review phase against a spec **and** review returns BLOCK **and** `build.max_review_retries > 0` (or `--auto` is set with the new default of 2) **then** the build dispatches `/adev:specify --revise <spec>` and re-runs `/adev:review-specs` against revision N+1. The loop continues until PASS, until `max_review_retries` is exhausted, until no-progress is detected (Behavior 7), or until regression is detected (Behavior 8).
7. **When** the loop compares revision N and N+1 reviewer outputs **then** it partitions blocker IDs into three sets: `addressed` (in rev N, absent from rev N+1), `persistent` (in both), `new` (absent from rev N, present in rev N+1). No-progress is defined as `addressed == ∅ AND new == ∅ AND persistent == prev_blockers` (the LLM produced the identical set with no change). On no-progress, the loop stops with verdict NO_PROGRESS, writes the sidecar+fail-loud path, and exits.
8. **When** the loop detects regression — defined as `|new| > |addressed|` (the revision introduced more new blockers than it resolved) — **then** the loop stops with verdict REGRESSED, preserves the rev N+1 spec (does NOT roll back), writes the sidecar+fail-loud path, and exits. The build operator decides whether to manually revert.
9. **When** `--require-human-final-pass` is passed to `/adev:build --full` AND the loop converges on PASS at rev N+1 **then** the build halts with verdict PASS_PENDING_HUMAN, writes a `human_approval_required` lifecycle event, and exits non-zero with a clear "review revision N+1 and run `/adev:build --resume`" message. This is the hybrid mode for risk-averse domains.
10. **When** `build.max_review_retries` is read from manifest with no explicit value **then** the default is 2. Setting it to 0 disables the loop entirely (current 7e333fd behavior — sidecar+fail-loud on first BLOCK). Negative values are rejected at manifest load with `INVALID_MAX_REVIEW_RETRIES`.

### Postconditions

- After a successful loop run, the spec is at revision N+M (M ≤ `max_review_retries`) with status `review-passed`, and the lifecycle log carries M `spec_revised` events plus M+1 `reviewer_report` events keyed by their respective revisions.
- After a no-progress / regression / budget-exhaustion exit, the latest spec revision and its `<spec-stem>.review.md` + `<spec-stem>.blockers.md` are preserved on disk; the lifecycle log records the terminating verdict; the build exits non-zero with operator-facing guidance.
- `currentState().steps.review.byRevision` enumerates the per-revision verdicts; downstream consumers (hygiene, retro, `/adev:status`) can render the revision history.
- Reviewer subagents that emit canonical blocker IDs are forward-compatible: legacy (pre-update) review outputs without `blocker_id` fields fall back to the sidecar+fail-loud path with a clear log message — no silent loop.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `/adev:specify --revise` invoked on a spec without `.review.md` or `.blockers.md` sidecar | Reject; print "no BLOCK to revise — run `/adev:review-specs` first" and exit non-zero | `NO_REVIEW_SIDECARS` |
| `/adev:specify --revise` invoked on a spec whose status is not `review-blocked` | Warn; ask for confirmation in interactive mode; reject in `--auto` mode | `SPEC_NOT_BLOCKED` |
| Reviewer subagent emits a finding without a `blocker_id` | Loop falls back to sidecar+fail-loud path for that BLOCK; log `LEGACY_REVIEWER_OUTPUT`; do not loop | `LEGACY_REVIEWER_OUTPUT` |
| Two reviewers emit the same `blocker_id` for distinct findings (collision) | Treat as one canonical blocker; both prose entries are preserved in `.blockers.md`; log advisory | `BLOCKER_ID_COLLISION` (advisory) |
| `/adev:specify --revise` produces a spec where `revision:` did not increment | Reject the write at the diagnostic gate (`adev/revision-monotonic`); preserve prior revision; exit non-zero | `REVISION_NOT_INCREMENTED` |
| Loop detects no-progress between rev N and rev N+1 | Stop with verdict NO_PROGRESS; write sidecar+fail-loud; exit non-zero with message | `LOOP_NO_PROGRESS` |
| Loop detects regression (`|new| > |addressed|`) | Stop with verdict REGRESSED; preserve rev N+1 (no rollback); write sidecar+fail-loud; exit non-zero | `LOOP_REGRESSED` |
| `max_review_retries` exhausted without convergence | Stop with verdict BUDGET_EXHAUSTED; sidecar+fail-loud; exit non-zero | `LOOP_BUDGET_EXHAUSTED` |
| `manifest.build.max_review_retries` is negative | Reject manifest at load time | `INVALID_MAX_REVIEW_RETRIES` |
| `--require-human-final-pass` passed AND loop converges on PASS | Halt with PASS_PENDING_HUMAN; write `human_approval_required` event; exit non-zero with "review and `/adev:build --resume`" guidance | `PASS_PENDING_HUMAN` (advisory) |

## System Constitution Reference

- **Principle: "Minimize external dependencies — prefer Node.js built-ins."** — The revision workflow and convergence detector use `fs.readFile` / `fs.writeFile` / `crypto.createHash('sha256')` (for blocker location hashes). No new dependency.
- **Principle: "Skills are primarily markdown — companion code allowed but must not be required for the skill to function."** — `/adev:specify --revise` is a new SKILL.md workflow axis (alongside `--extract`, `--refactor`, `--from-diff`, `--cross-cutting`). The companion lib (`lib/specify-revise.mjs` or equivalent) is invoked via a named CLI verb per the `cli-driver-surface` charter; skill prose names the verb, never inline Node.
- **`agent-reliable-state-artifacts` charter invariant: "Lifecycle events are append-only and per-spec."** — `spec_revised` and `human_approval_required` are new event variants; `reviewer_report` and `step_completed` gain an OPTIONAL `revision:` field. No existing event schemas are mutated; legacy events fold as revision 1.
- **`spec-lifecycle` charter invariant: "Spec status auto-transitions by skills."** — `/adev:specify --revise` transitions `review-blocked → review-pending` atomically with the `revision:` bump.
- **`strategic-planning` charter scope: "End-to-end build orchestration."** — The `/adev:build --full` loop is the orchestrator for the auto-retry; this spec gives it real flags to dispatch instead of the undocumented `--revise --blocker-context` combination that commit `7e333fd` removed.

## Module Impact Map

| Module | Impact | Changes Required |
|--------|--------|-----------------|
| `agent-reliable-state-artifacts` | High | New `spec_revised` and `human_approval_required` event variants; `reviewer_report` and `step_completed` gain optional `revision:`; `currentState()` exposes `state.steps.<step>.byRevision[N]`; reviewer-subagent protocol updated to emit canonical `blocker_id` alongside prose. |
| `spec-lifecycle` | High | New `--revise <spec>` workflow flag on `/adev:specify` (orthogonal to `--kind`); SKILL.md adds a sixth Step-set for the revise path; revision bump + frontmatter merge logic in companion lib. |
| `strategic-planning` | High | `/adev:build --full` loop reinstated with real `/adev:specify --revise` dispatch; convergence detector + stop-condition logic; `--require-human-final-pass` flag; `build.max_review_retries` default flipped 0 → 2. |
| `review` (skills/review-specs) | Medium | Reviewer subagent prompts updated to emit canonical `blocker_id` in their JSON output schema; `.blockers.md` writer keys entries by `blocker_id`. |
| `cli-driver-surface` | Low | New CLI verbs registered (e.g., `adev specify revise`, `adev build resume-after-pending-human`). No skill-prose inline Node added. |

## Integration Points

1. **`/adev:build --full` ↔ `/adev:specify`**: build dispatches `/adev:specify --revise <spec>` on BLOCK; revise emits `spec_revised`; build reads `state.steps.review.byRevision` to compare blocker sets.
2. **`/adev:specify --revise` ↔ `lib/lifecycle-state.mjs`**: revise calls `appendEvent('spec_revised', { from_revision, to_revision, addressed_blocker_ids, unresolved_blocker_ids })`.
3. **`/adev:review-specs` ↔ reviewer subagents**: subagent JSON output schema gains a required `blocker_id` field per finding when the verdict is BLOCK. `/adev:review-specs` aggregates findings, writes `.blockers.md` keyed by `blocker_id`, and includes the IDs in the `reviewer_report` event payload.
4. **Convergence detector ↔ `currentState()`**: detector reads `state.steps.review.byRevision[N]` and `state.steps.review.byRevision[N+1]`, partitions blocker IDs (`addressed`, `persistent`, `new`), evaluates stop conditions.
5. **`--require-human-final-pass` ↔ `/adev:build --resume`**: when the loop converges on PASS but human gate is on, build halts and the operator runs `/adev:build --resume <spec>` to acknowledge the final revision and proceed to plan/implement.

## Actionable Task Map

<!-- Preliminary breakdown. /adev:plan refines into TDD-ordered tasks under one or more plans. -->

| Task | Description | Estimated Complexity | Owner Module |
|------|-------------|---------------------|--------------|
| Per-revision event schema + projection | Add optional `revision:` to `reviewer_report` and `step_completed`; new variants `spec_revised`, `human_approval_required`; `currentState()` exposes `byRevision[N]`. | medium | agent-reliable-state-artifacts |
| Canonical blocker ID emission | Reviewer subagent JSON schema gains `blocker_id`; `lib/blocker-id.mjs` computes `<reviewer>:<type>:<sha256-prefix>`; deterministic on identical input. | medium | agent-reliable-state-artifacts |
| `.blockers.md` writer keyed by blocker_id | Update writer to organize entries by ID; preserve prose; tolerate ID collisions with advisory. | small | agent-reliable-state-artifacts |
| `/adev:specify --revise` workflow | New workflow axis flag; reads spec rev N + .review.md + .blockers.md; produces rev N+1 with targeted patch; emits `spec_revised`. | large | spec-lifecycle |
| Revision-bump diagnostic | `adev/revision-monotonic` gate ensures `revision:` increments on `--revise` write; rejects non-incrementing writes. | small | spec-lifecycle |
| `/adev:build --full` loop reinstatement | Re-enable BLOCK→revise loop dispatch with real flags; remove the "max_review_retries > 0 → warn and behave as 0" guard. | medium | strategic-planning |
| Convergence detector | `lib/loop-convergence.mjs` computes `addressed` / `persistent` / `new`; evaluates stop conditions (PASS / no-progress / regression / budget). | medium | strategic-planning |
| `--require-human-final-pass` flag | New `/adev:build` flag; halts on convergence with PASS_PENDING_HUMAN; emits `human_approval_required`. | small | strategic-planning |
| `max_review_retries` default flip + manifest validation | Default 0 → 2; reject negative values at manifest load with `INVALID_MAX_REVIEW_RETRIES`. | small | strategic-planning |
| Integration test: 2-revision auto-retry on synthetic BLOCK | Fixture: reviewer subagent that emits BLOCK on rev 1 with ID `x:y:abc`, BLOCK on rev 2 with no `x:y:abc` (addressed) but new `x:y:def`, PASS on rev 3. Verify loop runs through budget, emits correct events, ends with PASS. | medium | strategic-planning |
| Legacy reviewer fallback test | Reviewer without `blocker_id` → loop falls back to sidecar+fail-loud, logs `LEGACY_REVIEWER_OUTPUT`. | small | strategic-planning |
| Hygiene + retro updates | `byRevision` projection consumed by `/adev:status` and `/adev:retro` to render revision history. | small | strategic-planning |

## Acceptance Criteria

- [ ] `/adev:specify --revise <spec>` exists as a workflow axis flag, mutually exclusive with `--extract` / `--refactor` / `--from-diff` / `--cross-cutting`.
- [ ] `/adev:specify --revise` produces a spec where `revision:` is exactly `N+1` and `updated:` is today; frontmatter fields not implicated by blockers are preserved byte-identically; non-blocked body sections are preserved byte-identically.
- [ ] `spec_revised` lifecycle event is emitted on successful revise with `from_revision`, `to_revision`, `addressed_blocker_ids`, `unresolved_blocker_ids`.
- [ ] Reviewer subagents emit canonical `blocker_id` (`<reviewer>:<type>:<8-hex-sha-prefix>`) for every BLOCK finding; same finding regenerated on same spec rev produces same ID.
- [ ] `reviewer_report` and `step_completed` events carry optional `revision:` when emitted by skills that know the spec revision; legacy events without `revision:` fold as revision 1.
- [ ] `currentState(spec).steps.<step>.byRevision[N]` exposes per-revision verdicts for every revision present in the log.
- [ ] `/adev:build --full` dispatches `/adev:specify --revise <spec>` on BLOCK when `build.max_review_retries > 0` or `--auto` is set with the new default of 2.
- [ ] Loop stops correctly on PASS, NO_PROGRESS, REGRESSED, and BUDGET_EXHAUSTED. Each terminal verdict writes the sidecar+fail-loud artifacts and exits non-zero (except PASS).
- [ ] `--require-human-final-pass` halts on convergence with PASS_PENDING_HUMAN and emits `human_approval_required`.
- [ ] `build.max_review_retries` manifest default is 2; negative values rejected with `INVALID_MAX_REVIEW_RETRIES`.
- [ ] Reviewer outputs without `blocker_id` trigger fallback to sidecar+fail-loud (current 7e333fd behavior) with `LEGACY_REVIEWER_OUTPUT` log; no silent loop.
- [ ] Integration test exercises a 2-revision auto-retry on a synthetic BLOCK fixture and verifies events, sidecars, and final verdict.
- [ ] All quality gates pass (tests, lint, typecheck).
- [ ] No constitutional violations introduced.
- [ ] `agent-reliable-state-artifacts` charter Capability Map "Per-revision lifecycle event schema *(rev 7)*" row flips from `—` to `specified (review-block-auto-retry.spec.md)`.
