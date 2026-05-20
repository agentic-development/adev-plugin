<!-- partial_schema: plan@1 -->

# Implementation Plan: Auto-Retry Loop on Review BLOCK

> **Methodology:** adev
> **Charter:** cross-cutting — affects [agent-reliable-state-artifacts, spec-lifecycle, strategic-planning]
> **Spec:** .context-index/specs/cross-cutting/review-block-auto-retry.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-19) — 0 blockers, 5 warnings, 4 suggestions across structural-architect, security-reviewer, consistency-analyzer
> **Platform:** Node.js (ESM, `.mjs`), node:test, npm

**Goal:** Reinstate the `/adev:build --full` BLOCK→revise auto-retry loop with a real `/adev:specify --revise` workflow, per-revision lifecycle events, canonical reviewer blocker IDs, a convergence detector, and the lockstep sibling-spec amendments (adev-build-skill.spec.md Behaviors 17-18, lifecycle-event-log.spec.md projection shape) required for the contract to land coherently.

**Architecture:** Three-charter cross-cutting work. `agent-reliable-state-artifacts` owns the new event variants (`spec_revised`, `human_approval_required`) and the optional `revision:` field on `reviewer_report` / `step_completed`, plus the `byRevision[N]` projection in `lib/lifecycle-state.mjs` and the canonical `blocker_id` emitter (`lib/blocker-id.mjs`). `spec-lifecycle` owns `/adev:specify --revise` as a sixth workflow axis (companion `lib/specify-revise.mjs`, CLI verb `adev specify revise` with path-containment per SEC-1, plus the `adev/revision-monotonic` diagnostic). `strategic-planning` owns the loop reinstatement in `skills/build/SKILL.md`, the convergence detector (`lib/loop-convergence.mjs`), the `--require-human-final-pass` flag, and the `build.max_review_retries` default flip with manifest validation. Reviewer subagent prompts (review module) gain canonical `blocker_id` emission; `.blockers.md` writer keys entries by ID and carries the implicated `<spec-section-anchor>` for the revise workflow. All path inputs use the existing `assertWithin` / `resolveContained` patterns. Sibling-spec amendments to `adev-build-skill.spec.md` and `lifecycle-event-log.spec.md` are first-class plan tasks (acceptance gates from review notes SA-2 / CON-1), not module-impact prose.

---

## File Structure

**Create:**
- `lib/blocker-id.mjs` — deterministic canonical `blocker_id` builder `<reviewer-slug>:<finding-type>:<location-hash>`; input validation (kebab-case slugs); SHA-256(`<spec-section-anchor>:<truncated-finding-text>`) → first 8 hex chars.
- `tests/lib/blocker-id.test.mjs` — unit tests for determinism, slug/finding-type allowlist (SEC-2), location-hash truncation.
- `lib/specify-revise.mjs` — companion library for `/adev:specify --revise`: reads spec rev N, `.review.md`, `.blockers.md`; produces targeted-patch rev N+1; emits `spec_revised`; atomic write per `incremental-artifact-writes.spec.md`; path-containment per SEC-1.
- `tests/lib/specify-revise.test.mjs` — unit tests for frontmatter byte-identical preservation, body-section byte-identical preservation, revision increment, `.blockers.md` clear/rewrite logic.
- `lib/cli/specify.mjs` — new CLI verb file (or extension if a `specify.mjs` exists elsewhere): `adev specify revise --spec <path>` invoking `lib/specify-revise.mjs`. SEC-1 path-containment re-asserted.
- `tests/cli/specify-revise.test.mjs` — CLI integration tests including path-traversal rejection (SEC-1).
- `lib/diagnostics/revision-monotonic.mjs` — `adev/revision-monotonic` diagnostic gate ensuring `revision:` strictly increments on `--revise` writes; rejects non-increments and decrements with `REVISION_NOT_INCREMENTED`.
- `tests/lib/diagnostics/revision-monotonic.test.mjs` — unit tests for the diagnostic.
- `lib/loop-convergence.mjs` — convergence detector: `partitionBlockers(prev, curr) → { addressed, persistent, new_ }`; `evaluateStopCondition({ addressed, persistent, new_, prev_blockers, retries_remaining, verdict, human_final_pass }) → { stop: bool, verdict: PASS|NO_PROGRESS|REGRESSED|BUDGET_EXHAUSTED|PASS_PENDING_HUMAN|CONTINUE }`. Owned by `strategic-planning` (SA-3).
- `tests/lib/loop-convergence.test.mjs` — unit tests for partition correctness, no-progress, regression, budget exhaustion, PASS_PENDING_HUMAN.
- `tests/integration/build-loop-auto-retry.test.mjs` — end-to-end fixture: synthetic reviewer subagent that emits BLOCK on rev 1 with blocker_id `x:y:abc`, BLOCK on rev 2 with new `x:y:def` (addressed `x:y:abc`), PASS on rev 3. Verify lifecycle events, sidecar contents, final verdict.
- `tests/integration/build-loop-legacy-reviewer-fallback.test.mjs` — reviewer output without `blocker_id` → loop falls back to sidecar+fail-loud, logs `LEGACY_REVIEWER_OUTPUT`, no auto-retry.

**Modify:**
- `lib/lifecycle-events.mjs` — register new event variants `spec_revised` (payload: `{ from_revision, to_revision, addressed_blocker_ids, unresolved_blocker_ids }`) and `human_approval_required` (payload: `{ spec, revision, reason }`). Add optional `revision:` field to `reviewer_report` and `step_completed` variants. Snake_case payload field naming consistent with CON-2 from lifecycle-event-log.spec.md.
- `lib/lifecycle-state.mjs` — extend `StateProjection`: `state.steps.<step>.byRevision[N] = { verdict, score, blockers, completed_at }`. Legacy events without `revision:` fold as revision 1. Top-level `state.steps.<step>` remains the latest revision (no breaking change). `reportSpecRevised()` / `reportHumanApprovalRequired()` write helpers.
- `tests/lib/lifecycle-state.test.mjs` — extend coverage: `byRevision[N]` projection, legacy-fold-as-rev-1, latest-revision-wins for top-level.
- `lib/manifest.mjs` — manifest validation: `build.max_review_retries` default 2 (was effectively 0 under the 7e333fd guard); reject negative values with `INVALID_MAX_REVIEW_RETRIES` at load time. Validation runs at load, not lazily.
- `tests/lib/manifest.test.mjs` — coverage for default value, negative-value rejection.
- `skills/review-specs/structural-architect-prompt.md`, `skills/review-specs/security-reviewer-prompt.md`, `skills/review-specs/consistency-analyzer-prompt.md` — reviewer JSON output schema gains required `blocker_id` and `section_anchor` per finding when verdict is BLOCK. Reviewers compute IDs via `lib/blocker-id.mjs` (or the CLI verb wrapping it).
- `skills/review-specs/SKILL.md` — aggregates findings, validates `blocker_id` shape (rejects malformed → `INVALID_BLOCKER_ID` advisory, fall through to LEGACY_REVIEWER_OUTPUT), writes `.blockers.md` keyed by `blocker_id`, carries `section_anchor` per entry (SA-1), includes IDs in `reviewer_report` event payload. Reuses existing Step 4 redaction set (SEC-3 cross-reference).
- `skills/specify/SKILL.md` — add sixth workflow axis: `--revise <spec>`. Mutually exclusive with `--extract` / `--refactor` / `--from-diff` / `--cross-cutting`. New Step-set names the CLI verb `adev specify revise`; SKILL.md contains no inline Node (cli-driver-surface compliance).
- `skills/build/SKILL.md` — Behaviors 17-18 replaced with the loop semantics from this spec: BLOCK → dispatch `/adev:specify --revise <spec>` → re-run `/adev:review-specs` → convergence detector decides PASS / CONTINUE / NO_PROGRESS / REGRESSED / BUDGET_EXHAUSTED. Add `--require-human-final-pass` flag handling. `build.max_review_retries` default 2 used directly (guard removed).
- `.context-index/specs/features/strategic-planning/adev-build-skill.spec.md` — **Sibling-spec amendment** (CON-1 acceptance gate). Revise to rev 8: remove Behaviors 17 (sidecar-only/no auto-retry) and 18 (max_review_retries warn-and-behave-as-0); replace with loop semantics aligned with this cross-cutting spec; bump revision; recompute source-manifest after implementation.
- `.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md` — **Sibling-spec amendment** (SA-2 acceptance gate). Add `byRevision[N]` to documented StateProjection shape; add optional `revision:` field to canonical `reviewer_report` and `step_completed` event variants; bump revision.
- `skills/status/SKILL.md` — render `byRevision` history when present (consumes new projection field, non-breaking).
- `skills/retro/SKILL.md` — surface per-revision review history in retro reports.

**Reference (read, do not modify):**
- `.context-index/specs/cross-cutting/review-block-auto-retry.spec.md` — the spec being implemented.
- `.context-index/specs/cross-cutting/review-block-auto-retry.review.md` — review notes (SA-1, SA-2, SA-3, SEC-1, SEC-2, SEC-3, CON-1, CON-2, CON-3, CON-4) that constrain plan-task design.
- `.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md` — canonical event schema; CON-1 naming conventions; SEC-1/SEC-4 path-containment patterns.
- `.context-index/specs/features/agent-reliable-state-artifacts/plan-task-events.spec.md` — CON-8 sidecar peer enumeration; `.blockers.md` is on the enum.
- `.context-index/adrs/0012-plan-adjacent-sidecar-artifacts.md` — sidecar pattern (Accepted); `.blockers.md` enumerated.
- `.context-index/specs/cross-cutting/incremental-artifact-writes.spec.md` — temp-then-rename atomic-write protocol for the revise workflow.
- `lib/lifecycle-state.mjs` — existing path-containment patterns to reuse; `currentState()` projector to extend.
- `lib/cli/report.mjs`, `lib/cli/gate.mjs` — existing CLI verb structure to follow for `lib/cli/specify.mjs`.

---

## Context Packets

### Task 1 Context (lib/blocker-id.mjs — canonical blocker ID emitter)
- Spec: `.context-index/specs/cross-cutting/review-block-auto-retry.spec.md` (Behavior 3, Acceptance Criterion "Reviewer subagents emit canonical `blocker_id`")
- Charter: `.context-index/specs/features/agent-reliable-state-artifacts/charter.md` (Capability: canonical blocker IDs)
- Review notes: SEC-2 (slug/finding-type allowlist `[a-z0-9-]+`)
- Source: `lib/lifecycle-state.mjs` (signatures only — existing path-containment / slug-allowlist patterns to reuse)
- Heuristics: 2 entries for module `agent-reliable-state-artifacts` (IDs: token-measurement, cache-context)

### Task 2 Context (lib/lifecycle-events.mjs — new variants + optional revision)
- Spec: Behavior 4 (optional `revision:`), Behavior 9 (`human_approval_required`), Behavior 1-2 (`spec_revised` payload)
- Source: `lib/lifecycle-events.mjs` (full read — register new variants in existing taxonomy)
- Sibling spec: `lifecycle-event-log.spec.md` (CON-1 naming conventions, canonical event schema)

### Task 3 Context (lib/lifecycle-state.mjs — byRevision[N] projection)
- Spec: Behavior 5, Acceptance Criterion "`currentState(spec).steps.<step>.byRevision[N]`"
- Review notes: SA-2 (lockstep amendment to lifecycle-event-log.spec.md is a separate task)
- Source: `lib/lifecycle-state.mjs` (full read — extend StateProjection fold)
- Tests: `tests/lib/lifecycle-state.test.mjs` (signatures — extend existing projection tests)

### Task 4 Context (sibling-spec amendment to lifecycle-event-log.spec.md)
- Spec: review-block-auto-retry.spec.md (SA-2 acceptance gate)
- Sibling spec: `.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md` (full read — to be amended)
- ADR: `.context-index/adrs/0012-plan-adjacent-sidecar-artifacts.md` (sidecar enumeration cross-reference)

### Task 5 Context (.blockers.md writer keyed by blocker_id + section_anchor)
- Spec: Behavior 2 (`.blockers.md` clear/rewrite), Behavior 3 (canonical ID), Error Cases (BLOCKER_ID_COLLISION advisory)
- Review notes: SA-1 (blocker-to-section mapping → `<spec-section-anchor>` carried per entry), SEC-3 (sanitization cross-reference)
- Source: `skills/review-specs/SKILL.md` Step 4 (full read — existing redaction set; add ID-keyed writer)

### Task 6 Context (reviewer subagent prompt updates)
- Spec: Behavior 3, Acceptance Criterion "Reviewer subagents emit canonical `blocker_id`"
- Source: `skills/review-specs/structural-architect-prompt.md`, `security-reviewer-prompt.md`, `consistency-analyzer-prompt.md` (full read each)
- Sibling lib: `lib/blocker-id.mjs` (signatures from Task 1)

### Task 7 Context (lib/specify-revise.mjs — companion library)
- Spec: Behavior 1 (targeted patch, frontmatter preservation), Behavior 2 (event emission, `.blockers.md` clear), Error Cases (NO_REVIEW_SIDECARS, SPEC_NOT_BLOCKED, REVISION_NOT_INCREMENTED)
- Review notes: SA-1 (`section_anchor` per blocker drives byte-identical preservation)
- Source: `lib/lifecycle-state.mjs` (signatures — `reportSpecRevised` from Task 2), `lib/partial-artifact.mjs` (full read — atomic-write pattern)
- Cross-cutting: `.context-index/specs/cross-cutting/incremental-artifact-writes.spec.md` (temp-then-rename protocol)

### Task 8 Context (lib/diagnostics/revision-monotonic.mjs)
- Spec: Error Cases (REVISION_NOT_INCREMENTED)
- Source: `lib/diagnostics/` (signatures — follow existing diagnostic patterns)

### Task 9 Context (lib/cli/specify.mjs — `adev specify revise` CLI verb)
- Spec: Behavior 1, Acceptance Criterion "`/adev:specify --revise <spec>` exists as a workflow axis flag"
- Review notes: SEC-1 (path-containment per `assertWithin` / `resolveContained`)
- Source: `lib/cli/report.mjs`, `lib/cli/gate.mjs` (signatures — verb structure to follow); `lib/specify-revise.mjs` (signatures from Task 7)
- Sibling spec: `cli-driver-surface` charter (verb naming, SEC-1 containment contract)

### Task 10 Context (skills/specify/SKILL.md — sixth workflow axis)
- Spec: Behavior 1, Acceptance Criterion (mutually exclusive with `--extract` / `--refactor` / `--from-diff` / `--cross-cutting`)
- Source: `skills/specify/SKILL.md` (full read — locate the workflow-axis dispatch block; add sixth axis)
- Constitution: "Skills are primarily markdown — no inline Node" (CLAUDE.md)

### Task 11 Context (lib/loop-convergence.mjs)
- Spec: Behavior 7 (partition `addressed`/`persistent`/`new`), Behavior 8 (regression: `|new| > |addressed|`), Acceptance Criterion (PASS/NO_PROGRESS/REGRESSED/BUDGET_EXHAUSTED)
- Review notes: SA-3 (`strategic-planning`-owned)
- Source: `lib/lifecycle-state.mjs` (signatures — `currentState().steps.review.byRevision`)

### Task 12 Context (manifest validation: max_review_retries default + negative reject)
- Spec: Behavior 10, Error Cases (INVALID_MAX_REVIEW_RETRIES)
- Source: `lib/manifest.mjs` (full read — extend load-time validation)
- Tests: `tests/lib/manifest.test.mjs` (signatures)

### Task 13 Context (skills/build/SKILL.md — loop reinstatement + --require-human-final-pass)
- Spec: Behavior 6 (loop dispatch), Behavior 9 (human-final-pass), Behavior 10 (default flip)
- Review notes: CON-1 (sibling-spec amendment required in lockstep)
- Source: `skills/build/SKILL.md` (full read — Behaviors 17-18 replacement, new flag plumbing)
- Sibling lib: `lib/loop-convergence.mjs` (signatures from Task 11)

### Task 14 Context (sibling-spec amendment to adev-build-skill.spec.md)
- Spec: review-block-auto-retry.spec.md (CON-1 acceptance gate)
- Sibling spec: `.context-index/specs/features/strategic-planning/adev-build-skill.spec.md` (full read — Behaviors 17-18 to revise; bump revision rev 7 → rev 8; recompute source-manifest post-implementation)

### Task 15 Context (integration test: 2-revision auto-retry)
- Spec: Acceptance Criterion "Integration test exercises a 2-revision auto-retry on a synthetic BLOCK fixture"
- Source: `tests/integration/` (signatures — existing integration test patterns); `skills/build/SKILL.md` (signatures from Task 13)

### Task 16 Context (integration test: legacy reviewer fallback)
- Spec: Acceptance Criterion "Reviewer outputs without `blocker_id` trigger fallback to sidecar+fail-loud (current 7e333fd behavior) with `LEGACY_REVIEWER_OUTPUT` log; no silent loop"

### Task 17 Context (status/retro consumers of byRevision)
- Spec: Postcondition "`currentState().steps.review.byRevision` enumerates the per-revision verdicts; downstream consumers (hygiene, retro, `/adev:status`) can render the revision history"
- Source: `skills/status/SKILL.md`, `skills/retro/SKILL.md` (full read — extend rendering)

### Task 18 Context (charter capability map flip)
- Spec: Acceptance Criterion "`agent-reliable-state-artifacts` charter Capability Map "Per-revision lifecycle event schema *(rev 7)*" row flips from `—` to `specified (review-block-auto-retry.spec.md)`"
- Source: `.context-index/specs/features/agent-reliable-state-artifacts/charter.md` (full read — locate Capability Map row)

---

## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `/adev:implement` reads from the live heuristic store.

### Heuristic: Summarized skill output produces equivalent artifact quality (confidence: medium)
- **Pattern:** When a skill writes an artifact to disk (plan, review, validation report), instruct it to return only a structured summary to the conversation. The artifact on disk will be equally complete — the summarization instruction affects echo volume, not reasoning.
- **Anti-pattern:** Assume that shorter output means lower quality artifacts.

### Heuristic: First-run PASS for adev:build Orchestrator (confidence: medium)
- **Pattern:** First-run PASS for adev:build Orchestrator: one-step-per-invocation dispatch model correctly isolates pipeline steps via state-driven re-invocation and fresh context boundaries.

---

## Parallelization

- Group A (sequential — `agent-reliable-state-artifacts` foundation): Task 1 (blocker-id) → Task 2 (event variants) → Task 3 (byRevision projection) → Task 4 (lifecycle-event-log.spec.md sibling amendment) → Task 5 (.blockers.md writer) → Task 6 (reviewer prompts)
- Group B (sequential — `spec-lifecycle` workflow, depends on Group A Tasks 1, 5): Task 7 (lib/specify-revise.mjs) → Task 8 (revision-monotonic diagnostic) → Task 9 (CLI verb) → Task 10 (SKILL.md axis)
- Group C (sequential — `strategic-planning` loop, depends on Group A Task 3 + Group B): Task 11 (lib/loop-convergence.mjs) → Task 12 (manifest validation) → Task 13 (skills/build/SKILL.md) → Task 14 (adev-build-skill.spec.md sibling amendment)
- Group D (independent integration tests, depend on full Group C): Task 15 (auto-retry integration test), Task 16 (legacy-reviewer fallback test). Can run in parallel after Task 13.
- Group E (consumer/cosmetic updates, depend on Task 3): Task 17 (status/retro), Task 18 (charter capability map flip). Can run in parallel after Task 3.

Tasks 1, 11 (after Task 3), and 18 (after Task 3) have no inter-group file overlap and could be authored in parallel by separate subagents once their prerequisites land. The dominant critical path is Group A → Group B → Group C → Group D.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | `lib/blocker-id.mjs` — canonical blocker_id emitter | small | unit | — | 1 create, 1 test |
| 2 | Lifecycle event variants: `spec_revised`, `human_approval_required`, optional `revision:` | medium | unit | Task 1 (consumer of IDs) | 1 modify, tests in Task 3 |
| 3 | `currentState()` projection: `state.steps.<step>.byRevision[N]` | medium | unit | Task 2 | 1 modify, 1 test |
| 4 | Sibling-spec amendment: `lifecycle-event-log.spec.md` (SA-2 acceptance gate) | small | unit (spec-doc) | Task 3 | 1 modify (spec) |
| 5 | `.blockers.md` writer keyed by `blocker_id` + `section_anchor` | medium | unit | Task 1, Task 4 | 1 modify (SKILL.md), 1 modify (lib if exists), 1 test |
| 6 | Reviewer subagent prompts emit canonical `blocker_id` + `section_anchor` | medium | unit | Task 1, Task 5 | 3 modify (prompts), 1 modify (SKILL.md) |
| 7 | `lib/specify-revise.mjs` companion library | large | unit | Task 1, Task 2, Task 5 | 1 create, 1 test |
| 8 | `adev/revision-monotonic` diagnostic | small | unit | Task 7 | 1 create, 1 test |
| 9 | `adev specify revise` CLI verb (SEC-1 path-containment) | small | unit | Task 7, Task 8 | 1 create, 1 test |
| 10 | `skills/specify/SKILL.md` — sixth workflow axis `--revise` | small | unit (skill-doc) | Task 9 | 1 modify (SKILL.md) |
| 11 | `lib/loop-convergence.mjs` — convergence detector | medium | unit | Task 3 | 1 create, 1 test |
| 12 | `build.max_review_retries` default flip + manifest validation | small | unit | — | 1 modify, 1 test |
| 13 | `skills/build/SKILL.md` — loop reinstatement + `--require-human-final-pass` | medium | unit (skill-doc) | Task 10, Task 11, Task 12 | 1 modify (SKILL.md) |
| 14 | Sibling-spec amendment: `adev-build-skill.spec.md` (CON-1 acceptance gate) | small | unit (spec-doc) | Task 13 | 1 modify (spec) |
| 15 | Integration test: 2-revision auto-retry on synthetic BLOCK | medium | integration | Task 13 | 1 create |
| 16 | Integration test: legacy reviewer fallback (no `blocker_id`) | small | integration | Task 13 | 1 create |
| 17 | `/adev:status` + `/adev:retro` render `byRevision` history | small | unit (skill-doc) | Task 3 | 2 modify (SKILL.md each) |
| 18 | Charter Capability Map flip: `agent-reliable-state-artifacts` row | small | unit (spec-doc) | Task 3 | 1 modify (charter) |

---

## Task Structure

> **Note on task status.** The per-task checkboxes are authoring guides for human reviewers only — skills read authoritative task state from the spec's lifecycle event log (`plan_task` events) via `currentState(projectRoot, specPath).planTasks`.

### Task 1: `lib/blocker-id.mjs` — canonical blocker_id emitter [specialist: none]

**Charter capability:** Canonical blocker IDs (`agent-reliable-state-artifacts` charter, "Per-revision lifecycle event schema *(rev 7)*" row).
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** —
**Files:**
- Create: `lib/blocker-id.mjs`
- Test: `tests/lib/blocker-id.test.mjs`

**Tests:** `tests/lib/blocker-id.test.mjs` — determinism, slug/finding-type allowlist (SEC-2), location-hash truncation.

**Context to load:**
- Spec Behavior 3 (canonical `blocker_id` format)
- Review notes SEC-2 (kebab-case `[a-z0-9-]+` for reviewer slug + finding type)
- `lib/lifecycle-state.mjs` slug-allowlist precedent

- [ ] **Write failing test** — covering: (a) `buildBlockerId({reviewer, type, sectionAnchor, findingText})` returns `<reviewer>:<type>:<8-hex-sha-prefix>`; (b) regenerating against same inputs is byte-identical; (c) reviewer or finding-type containing non-`[a-z0-9-]` chars throws `INVALID_BLOCKER_ID`; (d) `truncateForHash(findingText, 200)` is applied; (e) location-hash is `sha256(sectionAnchor + ':' + truncatedFindingText)` first 8 hex.
- [ ] **Verify test fails** — Run: `node --test tests/lib/blocker-id.test.mjs`. Expected: FAIL — module not found.
- [ ] **Implement** — `lib/blocker-id.mjs` exporting `buildBlockerId`, `validateBlockerIdComponent`, `truncateForHash`. Use `crypto.createHash('sha256')` (Node built-in; no external deps).
- [ ] **Verify test passes** — Run: `node --test tests/lib/blocker-id.test.mjs`. Expected: PASS.
- [ ] **Commit**

Branch: `feat/agent-reliable-state-artifacts/blocker-id-emitter`

```bash
git add lib/blocker-id.mjs tests/lib/blocker-id.test.mjs
git commit -m "feat(agent-reliable-state-artifacts): add canonical blocker_id emitter

Spec: .context-index/specs/cross-cutting/review-block-auto-retry.spec.md
Plan-task: 1"
```

---

### Task 2: Lifecycle event variants `spec_revised`, `human_approval_required`, optional `revision:` [specialist: none]

**Charter capability:** Per-revision lifecycle event schema (`agent-reliable-state-artifacts` charter rev 8).
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1 (event payloads reference blocker IDs).
**Files:**
- Modify: `lib/lifecycle-events.mjs` — register new variants in the existing taxonomy; add optional `revision:` field to `reviewer_report` and `step_completed`.

**Tests:** Coverage lives in `tests/lib/lifecycle-state.test.mjs` (extended in Task 3); for this task add focused variant-schema tests in `tests/lib/lifecycle-events.test.mjs` if that file exists, otherwise inline in `tests/lib/lifecycle-state.test.mjs`.

**Context to load:**
- Spec Behaviors 1, 2, 4, 9 (event payloads)
- `lifecycle-event-log.spec.md` CON-1 (snake_case event-only fields)

- [ ] **Write failing test** — covering: (a) `spec_revised` event with payload `{from_revision, to_revision, addressed_blocker_ids, unresolved_blocker_ids}` round-trips through `appendEvent` / `readEvents`; (b) `human_approval_required` with `{spec, revision, reason}` round-trips; (c) `reviewer_report` and `step_completed` accept optional `revision: N`; (d) events without `revision:` continue to round-trip unchanged.
- [ ] **Verify test fails** — Run: `node --test tests/lib/lifecycle-events.test.mjs`. Expected: FAIL — variants unknown.
- [ ] **Implement** — Extend the variant registry / discriminator handler in `lib/lifecycle-events.mjs` to recognize the new events; keep snake_case payload fields per CON-1.
- [ ] **Verify test passes**
- [ ] **Commit**

Branch: `feat/agent-reliable-state-artifacts/per-revision-events`

```bash
git add lib/lifecycle-events.mjs tests/lib/lifecycle-events.test.mjs
git commit -m "feat(agent-reliable-state-artifacts): add spec_revised + human_approval_required event variants

Spec: .context-index/specs/cross-cutting/review-block-auto-retry.spec.md
Plan-task: 2"
```

---

### Task 3: `currentState()` projection — `state.steps.<step>.byRevision[N]` [specialist: none]

**Charter capability:** Per-revision lifecycle event schema projection.
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2.
**Files:**
- Modify: `lib/lifecycle-state.mjs` — extend the fold to populate `byRevision[N]` per step; top-level `state.steps.<step>` continues to reflect the latest revision.
- Modify: `tests/lib/lifecycle-state.test.mjs` — new cases.

**Tests:** `tests/lib/lifecycle-state.test.mjs`.

**Context to load:**
- Spec Behavior 5
- Review note SA-2 (lockstep amendment to `lifecycle-event-log.spec.md` is Task 4)
- `lib/lifecycle-state.mjs` existing projection structure (full read)

- [ ] **Write failing test** — covering: (a) events tagged `revision: 1` and `revision: 2` produce `state.steps.review.byRevision[1]` and `byRevision[2]` with distinct verdict/score/blockers/completed_at; (b) top-level `state.steps.review` reflects the latest revision (no breaking change); (c) legacy events without `revision:` fold into `byRevision[1]`; (d) all four steps (`specify`, `review`, `plan`, `implement`, `validate`) honor the new projection field.
- [ ] **Verify test fails** — Run: `node --test tests/lib/lifecycle-state.test.mjs`.
- [ ] **Implement** — Extend the projector to bucket events by their `revision:` (default 1). Maintain backwards-compat for the top-level step projection.
- [ ] **Verify test passes**
- [ ] **Commit**

Branch: `feat/agent-reliable-state-artifacts/by-revision-projection`

```bash
git add lib/lifecycle-state.mjs tests/lib/lifecycle-state.test.mjs
git commit -m "feat(agent-reliable-state-artifacts): expose state.steps.<step>.byRevision[N]

Spec: .context-index/specs/cross-cutting/review-block-auto-retry.spec.md
Plan-task: 3"
```

---

### Task 4: Sibling-spec amendment — `lifecycle-event-log.spec.md` [specialist: none]

**Charter capability:** Lockstep paired amendment (SA-2 acceptance gate; see incremental-artifact-writes.spec.md precedent).
**Strategy:** unit (spec-doc) (source: fallback, confidence: high)
**Depends on:** Task 3 (the projection field must exist when documented).
**Files:**
- Modify: `.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md` — declare `byRevision[N]` on the canonical StateProjection shape; declare optional `revision:` field on `reviewer_report` and `step_completed` variants; bump `revision:` field; update `updated:` to today.

**Tests:** None required for a spec amendment; the test side ships with Task 3.

**Context to load:**
- This spec's SA-2 review finding
- `lifecycle-event-log.spec.md` current revision (2)

- [ ] **Write failing test** — N/A (spec amendment); confirm test from Task 3 already covers the documented behavior.
- [ ] **Verify test fails** — N/A.
- [ ] **Implement** — Patch the spec doc; preserve byte-identical content for unaffected sections per the targeted-patch protocol.
- [ ] **Verify** — `adev verify spec --spec .context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md` succeeds; the previously-PASS review still applies (drift recomputed on next review cycle).
- [ ] **Commit**

Branch: `docs/agent-reliable-state-artifacts/lifecycle-event-log-byrevision-amendment`

```bash
git add .context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md
git commit -m "docs(agent-reliable-state-artifacts): amend lifecycle-event-log spec with byRevision projection

Spec: .context-index/specs/cross-cutting/review-block-auto-retry.spec.md
Plan-task: 4"
```

---

### Task 5: `.blockers.md` writer keyed by `blocker_id` + `section_anchor` [specialist: none]

**Charter capability:** Canonical blocker IDs writer (`agent-reliable-state-artifacts`); SA-1 blocker-to-section mapping.
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1 (ID emitter), Task 4 (event schema documented).
**Files:**
- Modify: `skills/review-specs/SKILL.md` — Step 4 rewritten to write `.blockers.md` keyed by `blocker_id` with `section_anchor` per entry; reuse existing redaction set per SEC-3; tolerate ID collisions with `BLOCKER_ID_COLLISION` advisory.
- Modify (if exists): `lib/blockers-writer.mjs` or equivalent companion; otherwise the writer logic lives inline in the existing review-specs Step 4 CLI verb.
- Test: `tests/skills/review-specs-blockers-writer.test.mjs` (or co-located with existing review-specs tests).

**Tests:** `tests/skills/review-specs-blockers-writer.test.mjs`.

**Context to load:**
- Spec Behaviors 2, 3
- Review notes SA-1, SEC-3
- `skills/review-specs/SKILL.md` Step 4 current implementation

- [ ] **Write failing test** — covering: (a) writer emits entries grouped by `blocker_id`, prose preserved; (b) `section_anchor` carried per entry; (c) two reviewers emitting the same `blocker_id` are deduplicated with advisory log; (d) existing redaction set (`.env*`, `*.pem`, etc.) applied; (e) 8 KiB truncation cap honored.
- [ ] **Verify test fails**
- [ ] **Implement** — Update SKILL.md prose + supporting CLI verb (no inline Node per CLAUDE.md).
- [ ] **Verify test passes**
- [ ] **Commit**

Branch: `feat/agent-reliable-state-artifacts/blockers-md-keyed-by-id`

```bash
git add skills/review-specs/SKILL.md tests/skills/review-specs-blockers-writer.test.mjs lib/blockers-writer.mjs
git commit -m "feat(agent-reliable-state-artifacts): key .blockers.md entries by canonical blocker_id

Spec: .context-index/specs/cross-cutting/review-block-auto-retry.spec.md
Plan-task: 5"
```

---

### Task 6: Reviewer subagent prompts emit canonical `blocker_id` + `section_anchor` [specialist: none]

**Charter capability:** Reviewer subagent protocol (`review` module).
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1 (ID emitter), Task 5 (sidecar writer consumes the new schema).
**Files:**
- Modify: `skills/review-specs/structural-architect-prompt.md`
- Modify: `skills/review-specs/security-reviewer-prompt.md`
- Modify: `skills/review-specs/consistency-analyzer-prompt.md`
- Modify: `skills/review-specs/SKILL.md` — aggregator validates `blocker_id` shape; rejects malformed → `INVALID_BLOCKER_ID` (advisory); falls through to `LEGACY_REVIEWER_OUTPUT` when missing.
- Test: extend `tests/skills/review-specs-*.test.mjs` for the JSON schema gain.

**Tests:** `tests/skills/review-specs-blocker-id-emission.test.mjs`.

**Context to load:**
- Spec Behavior 3
- Review note SEC-2 (slug/finding-type allowlist)
- `lib/blocker-id.mjs` (signatures)

- [ ] **Write failing test** — covering: (a) reviewer JSON output schema includes required `blocker_id` and `section_anchor` per finding when verdict is BLOCK; (b) aggregator rejects entries missing `blocker_id` with `LEGACY_REVIEWER_OUTPUT`; (c) malformed `blocker_id` produces `INVALID_BLOCKER_ID` advisory.
- [ ] **Verify test fails**
- [ ] **Implement** — Patch each reviewer prompt's JSON schema section; add validation in SKILL.md / aggregator CLI verb.
- [ ] **Verify test passes**
- [ ] **Commit**

Branch: `feat/review/reviewer-blocker-id-emission`

```bash
git add skills/review-specs/structural-architect-prompt.md skills/review-specs/security-reviewer-prompt.md skills/review-specs/consistency-analyzer-prompt.md skills/review-specs/SKILL.md tests/skills/review-specs-blocker-id-emission.test.mjs
git commit -m "feat(review): emit canonical blocker_id + section_anchor from reviewer subagents

Spec: .context-index/specs/cross-cutting/review-block-auto-retry.spec.md
Plan-task: 6"
```

---

### Task 7: `lib/specify-revise.mjs` companion library [specialist: none]

**Charter capability:** `/adev:specify --revise` workflow (`spec-lifecycle` charter).
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1 (blocker IDs), Task 2 (event variants), Task 5 (`.blockers.md` schema with section_anchor).
**Files:**
- Create: `lib/specify-revise.mjs` — `reviseSpec({specPath, projectRoot, autoMode}) → {newRevision, addressed, unresolved, eventPath}`; reads `<spec>.review.md` + `<spec>.blockers.md`; produces targeted patch; bumps `revision:` and `updated:`; atomic temp-then-rename; emits `spec_revised`.
- Create: `tests/lib/specify-revise.test.mjs`

**Tests:** `tests/lib/specify-revise.test.mjs`.

**Context to load:**
- Spec Behaviors 1, 2; Error Cases (NO_REVIEW_SIDECARS, SPEC_NOT_BLOCKED, REVISION_NOT_INCREMENTED)
- Review note SA-1 (`section_anchor`-driven byte-identical preservation)
- `lib/partial-artifact.mjs` (atomic-write protocol)
- `lib/lifecycle-state.mjs` (`reportSpecRevised` helper from Task 2)

- [ ] **Write failing test** — covering: (a) on a spec with `.review.md` + `.blockers.md`, revision N → N+1; (b) frontmatter fields not implicated by blockers byte-identical; (c) body sections whose anchor is NOT in any blocker entry byte-identical; (d) `spec_revised` event emitted with correct payload; (e) `.blockers.md` cleared when all blockers addressed, or rewritten with `unresolved_blocker_ids` only; (f) `<spec>.review.md` NOT cleared (next review rewrites it); (g) missing sidecars → `NO_REVIEW_SIDECARS`; (h) non-blocked status + auto mode → reject with `SPEC_NOT_BLOCKED`; (i) write is atomic (interrupted mid-write does not leave the spec corrupted).
- [ ] **Verify test fails**
- [ ] **Implement** — `lib/specify-revise.mjs`. Use `lib/partial-artifact.mjs` for atomic-rename. SEC-1 path-containment via `assertWithin`. Apply `section_anchor`-keyed patching so non-implicated sections are byte-preserved.
- [ ] **Verify test passes**
- [ ] **Commit**

Branch: `feat/spec-lifecycle/specify-revise-library`

```bash
git add lib/specify-revise.mjs tests/lib/specify-revise.test.mjs
git commit -m "feat(spec-lifecycle): add specify-revise companion library

Spec: .context-index/specs/cross-cutting/review-block-auto-retry.spec.md
Plan-task: 7"
```

---

### Task 8: `adev/revision-monotonic` diagnostic [specialist: none]

**Charter capability:** Revision-bump diagnostic (`spec-lifecycle`).
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 7 (writes that this diagnostic guards).
**Files:**
- Create: `lib/diagnostics/revision-monotonic.mjs`
- Create: `tests/lib/diagnostics/revision-monotonic.test.mjs`
- Modify (if applicable): `.context-index/governance/diagnostics.yaml` to register the new gate.

**Tests:** `tests/lib/diagnostics/revision-monotonic.test.mjs`.

**Context to load:**
- Spec Error Cases (REVISION_NOT_INCREMENTED)
- `lib/diagnostics/` existing diagnostics for pattern

- [ ] **Write failing test** — covering: (a) write where new `revision:` = old + 1 → OK; (b) new = old → reject with `REVISION_NOT_INCREMENTED`; (c) new < old → reject; (d) new = old + 2 or higher → reject (strict monotonic-by-one for `--revise`); (e) preserves prior revision on the disk-level rollback.
- [ ] **Verify test fails**
- [ ] **Implement** — Diagnostic module exporting a check function consumed by `lib/specify-revise.mjs` before commit.
- [ ] **Verify test passes**
- [ ] **Commit**

Branch: `feat/spec-lifecycle/revision-monotonic-diagnostic`

```bash
git add lib/diagnostics/revision-monotonic.mjs tests/lib/diagnostics/revision-monotonic.test.mjs .context-index/governance/diagnostics.yaml
git commit -m "feat(spec-lifecycle): add revision-monotonic diagnostic for --revise writes

Spec: .context-index/specs/cross-cutting/review-block-auto-retry.spec.md
Plan-task: 8"
```

---

### Task 9: `adev specify revise` CLI verb (SEC-1 path-containment) [specialist: none]

**Charter capability:** CLI driver surface (`cli-driver-surface` row in spec Module Impact Map).
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 7, Task 8.
**Files:**
- Create: `lib/cli/specify.mjs` — CLI verb file dispatching to `lib/specify-revise.mjs`. SEC-1 path-containment re-asserted (matches `lib/lifecycle-state.mjs` patterns).
- Modify: `cli/index.mjs` — register the new verb route.
- Create: `tests/cli/specify-revise.test.mjs`

**Tests:** `tests/cli/specify-revise.test.mjs`.

**Context to load:**
- Spec Behavior 1 + Acceptance Criterion (mutual exclusion with other workflow axes)
- Review note SEC-1 (path-containment)
- `lib/cli/report.mjs`, `lib/cli/gate.mjs` (existing verb pattern)

- [ ] **Write failing test** — covering: (a) `adev specify revise --spec <valid-path>` exits 0 on a properly-blocked spec; (b) `--spec ../../etc/passwd` → `INVALID_SPEC_PATH` (path-traversal defense); (c) `--spec <path>` outside `<projectRoot>` rejected; (d) slug not matching `[a-z0-9._-]+` rejected; (e) flag mutual-exclusion: passing both `--revise` and `--extract` exits with `CONFLICTING_FLAGS`.
- [ ] **Verify test fails**
- [ ] **Implement** — `lib/cli/specify.mjs` with `argparse` consistent with existing verbs. Path-containment via existing helper.
- [ ] **Verify test passes**
- [ ] **Commit**

Branch: `feat/cli-driver-surface/specify-revise-verb`

```bash
git add lib/cli/specify.mjs cli/index.mjs tests/cli/specify-revise.test.mjs
git commit -m "feat(cli-driver-surface): add adev specify revise CLI verb

Spec: .context-index/specs/cross-cutting/review-block-auto-retry.spec.md
Plan-task: 9"
```

---

### Task 10: `skills/specify/SKILL.md` — sixth workflow axis `--revise` [specialist: none]

**Charter capability:** `/adev:specify --revise` workflow axis (`spec-lifecycle`).
**Strategy:** unit (skill-doc) (source: fallback, confidence: high)
**Depends on:** Task 9 (CLI verb exists).
**Files:**
- Modify: `skills/specify/SKILL.md`

**Tests:** None directly — covered by Task 9's CLI tests and Task 15's integration test.

**Context to load:**
- Spec Behavior 1, Acceptance Criterion (mutual exclusion)
- CLAUDE.md "no inline Node in SKILL.md" rule
- `skills/specify/SKILL.md` current workflow-axis dispatch block

- [ ] **Write failing test** — N/A (skill-doc); verified by `tests/cli/specify-revise.test.mjs` from Task 9.
- [ ] **Implement** — Add a sixth workflow-axis section "Step-set: Revise (`--revise`)". The section names the CLI verb `adev specify revise`. No inline Node. Document the mutual-exclusion contract and the prerequisites (`.review.md` + `.blockers.md` present, spec status `review-blocked`).
- [ ] **Verify** — Pre-commit hook `pre-commit-no-inline-node` passes.
- [ ] **Commit**

Branch: `feat/spec-lifecycle/specify-skill-revise-axis`

```bash
git add skills/specify/SKILL.md
git commit -m "feat(spec-lifecycle): add --revise workflow axis to /adev:specify

Spec: .context-index/specs/cross-cutting/review-block-auto-retry.spec.md
Plan-task: 10"
```

---

### Task 11: `lib/loop-convergence.mjs` — convergence detector [specialist: none]

**Charter capability:** Convergence detector (`strategic-planning`; SA-3 ownership note).
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 3 (`byRevision` projection).
**Files:**
- Create: `lib/loop-convergence.mjs`
- Create: `tests/lib/loop-convergence.test.mjs`

**Tests:** `tests/lib/loop-convergence.test.mjs`.

**Context to load:**
- Spec Behaviors 7, 8, 9
- Review note SA-3 (ownership boundary)
- `lib/lifecycle-state.mjs` `currentState().steps.review.byRevision` projection

- [ ] **Write failing test** — covering: (a) `partitionBlockers({prevIds, currIds})` returns `{addressed, persistent, new_}` correctly; (b) `evaluateStopCondition({...})` returns `PASS` when curr verdict is PASS; (c) `NO_PROGRESS` when `addressed.length === 0 && new_.length === 0 && persistent.length === prevIds.length`; (d) `REGRESSED` when `new_.length > addressed.length`; (e) `BUDGET_EXHAUSTED` when retries_remaining === 0 and not PASS; (f) `PASS_PENDING_HUMAN` when verdict PASS + human_final_pass true; (g) `CONTINUE` otherwise.
- [ ] **Verify test fails**
- [ ] **Implement** — Pure functions over blocker-ID sets. No I/O.
- [ ] **Verify test passes**
- [ ] **Commit**

Branch: `feat/strategic-planning/loop-convergence-detector`

```bash
git add lib/loop-convergence.mjs tests/lib/loop-convergence.test.mjs
git commit -m "feat(strategic-planning): add loop-convergence detector

Spec: .context-index/specs/cross-cutting/review-block-auto-retry.spec.md
Plan-task: 11"
```

---

### Task 12: `build.max_review_retries` default flip + manifest validation [specialist: none]

**Charter capability:** `/adev:build --full` loop reinstatement (`strategic-planning`).
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** —
**Files:**
- Modify: `lib/manifest.mjs` — set default for `build.max_review_retries` to 2 (was effectively 0 under the 7e333fd guard); reject negative values at load time with `INVALID_MAX_REVIEW_RETRIES`.
- Modify: `tests/lib/manifest.test.mjs`

**Tests:** `tests/lib/manifest.test.mjs`.

**Context to load:**
- Spec Behavior 10, Error Cases (INVALID_MAX_REVIEW_RETRIES)
- `lib/manifest.mjs` existing load-time validation pattern

- [ ] **Write failing test** — covering: (a) loading manifest without `build.max_review_retries` → resolves to 2; (b) explicit 0 → 0 (disables loop); (c) negative value → `INVALID_MAX_REVIEW_RETRIES` thrown at load; (d) non-integer → reject; (e) default exposed via `loadManifest().build.max_review_retries`.
- [ ] **Verify test fails**
- [ ] **Implement** — Extend manifest validation; preserve all other manifest semantics.
- [ ] **Verify test passes**
- [ ] **Commit**

Branch: `feat/strategic-planning/max-review-retries-default-flip`

```bash
git add lib/manifest.mjs tests/lib/manifest.test.mjs
git commit -m "feat(strategic-planning): flip build.max_review_retries default to 2 and validate at load

Spec: .context-index/specs/cross-cutting/review-block-auto-retry.spec.md
Plan-task: 12"
```

---

### Task 13: `skills/build/SKILL.md` — loop reinstatement + `--require-human-final-pass` [specialist: none]

**Charter capability:** `/adev:build --full` orchestration (`strategic-planning`).
**Strategy:** unit (skill-doc) (source: fallback, confidence: high)
**Depends on:** Task 10 (`/adev:specify --revise` available), Task 11 (convergence detector), Task 12 (manifest default flip).
**Files:**
- Modify: `skills/build/SKILL.md` — replace Behaviors 17-18 region: BLOCK → dispatch `/adev:specify --revise <spec>` → re-run `/adev:review-specs` against rev N+1 → call `lib/loop-convergence.mjs` → stop on PASS / NO_PROGRESS / REGRESSED / BUDGET_EXHAUSTED. Wire `--require-human-final-pass` flag through skill arg parsing. Remove the "max_review_retries > 0 → warn and behave as 0" guard.

**Tests:** Covered by Tasks 15 and 16 (integration tests). Author-time gate: pre-commit hook `pre-commit-no-inline-node`.

**Context to load:**
- Spec Behaviors 6, 7, 8, 9, 10
- Review note CON-1 (sibling-spec amendment in lockstep — Task 14)
- `skills/build/SKILL.md` current Behaviors 17-18 region

- [ ] **Write failing test** — N/A directly; covered by Tasks 15-16.
- [ ] **Implement** — Rewrite the BLOCK-handling region of `skills/build/SKILL.md`. The skill names the dispatch verb (`adev build dispatch-revise` or direct delegation to `/adev:specify` via the existing skill-orchestration pattern; no inline Node). Document the partitioning vocabulary (addressed/persistent/new).
- [ ] **Verify** — Inline-Node detector passes; manual review confirms the BLOCK→revise→review loop dispatch is described.
- [ ] **Commit**

Branch: `feat/strategic-planning/build-skill-loop-reinstatement`

```bash
git add skills/build/SKILL.md
git commit -m "feat(strategic-planning): reinstate BLOCK->revise auto-retry loop in /adev:build

Spec: .context-index/specs/cross-cutting/review-block-auto-retry.spec.md
Plan-task: 13"
```

---

### Task 14: Sibling-spec amendment — `adev-build-skill.spec.md` [specialist: none]

**Charter capability:** Lockstep paired amendment (CON-1 acceptance gate).
**Strategy:** unit (spec-doc) (source: fallback, confidence: high)
**Depends on:** Task 13 (skill change landed first; the spec amendment documents the new reality).
**Files:**
- Modify: `.context-index/specs/features/strategic-planning/adev-build-skill.spec.md` — bump revision rev 7 → rev 8 + `updated:` today; remove Behaviors 17 (sidecar-only / no auto-retry) and 18 (max_review_retries warn-and-behave-as-0); replace with loop semantics consistent with this cross-cutting spec; remove the source-manifest entry and let it re-stamp after `/adev:validate` since the sibling skill code changed in Task 13.

**Tests:** None directly; the sibling spec's source-manifest verification re-stamps via Task 13's `/adev:validate` cycle.

**Context to load:**
- This cross-cutting spec (Behaviors 6-10 are the replacement text source)
- Review note CON-1 (acceptance gate)
- `adev-build-skill.spec.md` current Behaviors 17-18 (full read)

- [ ] **Implement** — Patch the sibling spec doc; bump revision; ensure no other behaviors are inadvertently mutated (preserve byte-identical content for unaffected sections).
- [ ] **Verify** — `adev verify spec --spec .context-index/specs/features/strategic-planning/adev-build-skill.spec.md`. Note: source-manifest will be `drift_detected: true` until `/adev:validate` re-stamps after Task 13 + Task 15 ship.
- [ ] **Commit**

Branch: `docs/strategic-planning/adev-build-skill-loop-amendment`

```bash
git add .context-index/specs/features/strategic-planning/adev-build-skill.spec.md
git commit -m "docs(strategic-planning): amend adev-build-skill spec — remove behaviors 17-18, add loop semantics

Spec: .context-index/specs/cross-cutting/review-block-auto-retry.spec.md
Plan-task: 14"
```

---

### Task 15: Integration test — 2-revision auto-retry on synthetic BLOCK [specialist: none]

**Charter capability:** End-to-end auto-retry verification (`strategic-planning`).
**Strategy:** integration (source: spec-declared, confidence: high)
**Depends on:** Task 13.
**Files:**
- Create: `tests/integration/build-loop-auto-retry.test.mjs`

**Tests:** Self.

**Context to load:**
- Spec Acceptance Criterion "Integration test exercises a 2-revision auto-retry on a synthetic BLOCK fixture"
- `skills/build/SKILL.md` (post-Task-13)
- `lib/loop-convergence.mjs` (from Task 11)

- [ ] **Write failing test** — Fixture: synthetic reviewer subagent. Rev 1 emits BLOCK with `blocker_id` `x:y:abc`. Rev 2 emits BLOCK with no `x:y:abc` but new `x:y:def`. Rev 3 emits PASS. Verify: (a) loop runs through 3 revisions; (b) `spec_revised` events emitted ×2 with correct `addressed_blocker_ids`/`unresolved_blocker_ids`; (c) `reviewer_report` events carry `revision: 1`, `2`, `3`; (d) `.blockers.md` sidecar state matches the unresolved IDs at each step; (e) final verdict PASS; (f) build exit code 0.
- [ ] **Verify test fails** — Initial run fails because the loop isn't fully wired.
- [ ] **Implement** — Test fixture authoring; no production code changes (depends on Task 13 being landed).
- [ ] **Verify test passes**
- [ ] **Commit**

Branch: `test/strategic-planning/build-loop-auto-retry-integration`

```bash
git add tests/integration/build-loop-auto-retry.test.mjs
git commit -m "test(strategic-planning): integration test for 2-revision auto-retry loop

Spec: .context-index/specs/cross-cutting/review-block-auto-retry.spec.md
Plan-task: 15"
```

---

### Task 16: Integration test — legacy reviewer fallback [specialist: none]

**Charter capability:** Legacy reviewer graceful fallback (`strategic-planning`).
**Strategy:** integration (source: spec-declared, confidence: high)
**Depends on:** Task 13.
**Files:**
- Create: `tests/integration/build-loop-legacy-reviewer-fallback.test.mjs`

**Tests:** Self.

**Context to load:**
- Spec Acceptance Criterion "Reviewer outputs without `blocker_id` trigger fallback to sidecar+fail-loud"
- Spec Error Cases (LEGACY_REVIEWER_OUTPUT)

- [ ] **Write failing test** — Fixture: reviewer subagent that emits a BLOCK finding without `blocker_id`. Verify: (a) `LEGACY_REVIEWER_OUTPUT` log emitted; (b) build writes the existing `.blockers.md` sidecar (current 7e333fd behavior); (c) no `/adev:specify --revise` dispatch; (d) build exit code non-zero with manual-revision-required message; (e) no silent loop.
- [ ] **Verify test fails**
- [ ] **Implement** — Test fixture authoring.
- [ ] **Verify test passes**
- [ ] **Commit**

Branch: `test/strategic-planning/build-loop-legacy-fallback-integration`

```bash
git add tests/integration/build-loop-legacy-reviewer-fallback.test.mjs
git commit -m "test(strategic-planning): integration test for legacy-reviewer fallback path

Spec: .context-index/specs/cross-cutting/review-block-auto-retry.spec.md
Plan-task: 16"
```

---

### Task 17: `/adev:status` + `/adev:retro` render `byRevision` history [specialist: none]

**Charter capability:** `/adev:status` aggregation (`strategic-planning`); retro consumer.
**Strategy:** unit (skill-doc) (source: fallback, confidence: high)
**Depends on:** Task 3 (`byRevision` projection exists).
**Files:**
- Modify: `skills/status/SKILL.md` — render the `byRevision` map per spec when present (non-breaking).
- Modify: `skills/retro/SKILL.md` — surface per-revision review history in retro output.

**Tests:** Existing status/retro tests; extend with a fixture that has `byRevision` populated.

**Context to load:**
- Spec Postcondition (downstream consumers render revision history)
- `skills/status/SKILL.md`, `skills/retro/SKILL.md` (current rendering)

- [ ] **Write failing test** — Status rendering of a spec with 3 revisions includes a per-revision verdict line. Retro rendering shows revision count and final verdict.
- [ ] **Verify test fails**
- [ ] **Implement** — Patch SKILL.md prose; supporting CLI verbs (if needed) extended in `lib/cli/state.mjs`.
- [ ] **Verify test passes**
- [ ] **Commit**

Branch: `feat/strategic-planning/status-retro-render-byrevision`

```bash
git add skills/status/SKILL.md skills/retro/SKILL.md
git commit -m "feat(strategic-planning): render byRevision history in /adev:status and /adev:retro

Spec: .context-index/specs/cross-cutting/review-block-auto-retry.spec.md
Plan-task: 17"
```

---

### Task 18: Charter Capability Map flip — `agent-reliable-state-artifacts` row [specialist: none]

**Charter capability:** Capability-map row "Per-revision lifecycle event schema *(rev 7)*".
**Strategy:** unit (spec-doc) (source: fallback, confidence: high)
**Depends on:** Task 3 (the capability is implemented).
**Files:**
- Modify: `.context-index/specs/features/agent-reliable-state-artifacts/charter.md` — flip the Capability Map row's Status from `—` to `specified (review-block-auto-retry.spec.md)`. Status will subsequently move to `validated` after `/adev:validate` of this plan; the flip here covers the spec-stage handoff per the acceptance criterion.

**Tests:** None.

**Context to load:**
- Spec Acceptance Criterion (charter row flip)
- `agent-reliable-state-artifacts/charter.md` Capability Map (full read — locate the row)

- [ ] **Implement** — Patch the Capability Map row.
- [ ] **Verify** — Constitution validator (`adev sync` no-op confirmation; row appears in `/adev:status`).
- [ ] **Commit**

Branch: `docs/agent-reliable-state-artifacts/capability-map-flip`

```bash
git add .context-index/specs/features/agent-reliable-state-artifacts/charter.md
git commit -m "docs(agent-reliable-state-artifacts): flip per-revision-event-schema capability row to specified

Spec: .context-index/specs/cross-cutting/review-block-auto-retry.spec.md
Plan-task: 18"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test`
- Lint passes: `npm run lint` (project may not declare; defer to `npm test` plus pre-commit hook chain)
- Type check passes: not applicable (project is JavaScript-only)
- All 14 acceptance criteria from the spec satisfied (see spec)
- `adev verify spec --spec .context-index/specs/cross-cutting/review-block-auto-retry.spec.md` reports no drift; source-manifest re-stamped
- Sibling spec `adev-build-skill.spec.md` source-manifest re-stamped (Behaviors 17-18 removed, replaced with loop semantics)
- Sibling spec `lifecycle-event-log.spec.md` shows `byRevision[N]` in the documented StateProjection shape
- Pre-commit hook `pre-commit-no-inline-node` accepts all SKILL.md changes
- No constitutional boundary violations introduced (no new external deps; ESM-only; hooks respect protocol)
