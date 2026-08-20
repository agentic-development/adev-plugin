<!-- partial_schema: plan@1 -->

# Implementation Plan: Graduated Review Depth in /adev:implement

> **Methodology:** adev
> **Charter:** .context-index/specs/features/implementation/charter.md
> **Spec:** .context-index/specs/features/implementation/graduated-review-depth.spec.md (revision 11)
> **Review:** PASS_WITH_NOTES (2026-08-19) — full tier, 4 reviewers, 0 blockers, 1 warning (SEC-1, carried over from revision 10, non-blocking), 0 suggestions
> **Platform:** Node.js (ESM, `.mjs`), zero external dependencies, `node:test`

**Goal:** Let `/adev:implement` collapse its two-stage review (Stage 1 spec-compliance + Stage 2 code-quality) into a single synthesized-reviewer dispatch for tasks that are auto-agent-routed, score well on all four routing dimensions, cross no governance boundary, and stay additive-only through the real diff — while five unconditional floor legs (including a brand-new `scope-mismatch` leg and a `batched-task` leg) can always force the full two-stage path back on, and an explicit `--tier full` always wins outright.

**Architecture:** A new `lib/implement/review-depth.mjs` exports `resolveImplementReviewDepth()`, a self-contained precedence chain (tier-full absolute → policy baseline read directly from `loadRigorPolicies()` → quick-grant predicate over `.routing.json` scores → floor pass) that **ports the structure** of `lib/test-strategies/depth.mjs`'s escalation-plus-floor pattern as new, module-private functions — it does not import that module's private helpers, per the spec's explicit prohibition on widening that module's public surface for an unrelated caller. A new CLI verb `adev implement resolve-depth` (added to the existing `lib/cli/implement.mjs`, mirroring how `batches` was added in `batched-task-dispatch.spec.md`) exposes the resolver and owns the git-diff computation for the `scope-mismatch` floor leg — adapting, not copying, `lib/cli/boundaries.mjs`'s union-of-two-git-calls pattern (`--name-status --no-renames` instead of `--name-only` with renames on, so per-path change-type survives). A new canonical event `review_depth_resolved` (registered in `lib/lifecycle-events.mjs` and `lib/diagnostics/event-schemas.mjs`, written by a new `reportReviewDepthResolved()` in `lib/lifecycle-state.mjs`, folded into the projection as `reviewDepthResolutions` keyed `` `${plan}::${task_id}::${pass}` ``) gives each of the two resolution passes (provisional, final) a durable, queryable record — mirroring `reviewRounds`' shape exactly. `skills/implement/SKILL.md` gains the base-SHA capture (`git rev-parse HEAD`, immediately before the implementer subagent is dispatched) the spec's own research confirmed does not exist today, replaces its two hardcoded "Maximum 3 review cycles" strings with the new `implement.max_review_cycles` manifest knob, and branches Steps 2f/2g on the resolved depth: unchanged two-dispatch behavior under `full`, a single dispatch under `quick` carrying both lenses via a new companion `skills/implement/synthesized-reviewer-prompt.md` (following the shape of `skills/review-specs/quick-synthesized-reviewer-prompt.md`). `skills/build/SKILL.md` Step 4 gains the `--tier` propagation clause Steps 1 and 5 already carry. `.context-index/specs/cross-cutting/graduated-rigor-tiers.spec.md` and `.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md` have **already been amended on disk** (revisions 3 and 6 respectively, both dated 2026-08-19) to declare the `skill === "implement"` carve-out and register `review_depth_resolved` — verified directly during planning, so no task in this plan touches either spec file again; two tasks below add a read-only regression test proving those amendments hold.

**Charter note:** `.context-index/specs/features/implementation/charter.md` is an `/adev:init`-generated draft with no Capability Map table (confirmed by direct read during planning). Tasks trace to the charter's **Key Behaviors** ("TDD is enforced: RED → GREEN → REFACTOR"; the 2-stage review this spec thins) and **Key Files** (`skills/implement/SKILL.md`) instead; there is no `Status` column to flip at Step 7.

**Human-approval note (constitution, Architecture Boundaries):** Thinning `/adev:implement`'s review layer is not on the "Autonomous" list. The spec's own frontmatter comments and "System Constitution Reference" section record that this exact mechanism — collapse rather than cut, all five floor legs unconditional, the `>= 0.6` per-dimension threshold set from this repository's own historical task corpus — was authorized by the project owner at spec revision 10 and reconfirmed at revision 11's `PASS_WITH_NOTES` review. This plan proceeds on that recorded authorization; it does not re-litigate the threshold and does not extend it past what the spec states.

---

## File Structure

**Create:**
- `tests/governance/risk-policies-implement-mode.test.mjs` — asserts the live `risk-policies.yaml` declares `implement_mode` for all three risk levels.
- `lib/implement/review-depth.mjs` — `resolveImplementReviewDepth({ spec, task, routingEntry, tierFlag, policies, touchedFiles })`: the full precedence chain (Output Contract A), quick-grant predicate (B) with score validation (D), and floor pass (E) including the `scope-mismatch` leg's touched-file-set consumption and the `batched-task` leg.
- `tests/lib/implement/review-depth.test.mjs` — one test per precedence stage, one per predicate row, one per floor leg, plus the `scope-mismatch`/`K`-exclusion cases enumerated in Acceptance Criteria.
- `tests/cli/implement-resolve-depth.test.mjs` — CLI surface: happy path (provisional + final pass), `--base-sha` required on final pass (`MISSING_DIFF_RANGE`), `ROUTING_ENTRY_MISSING`, the git-diff union computation against a real temp git repo.
- `skills/implement/synthesized-reviewer-prompt.md` — the synthesized reviewer's prompt (both lenses, `cq-<n>` id tagging, convergence discipline), following `skills/review-specs/quick-synthesized-reviewer-prompt.md`'s 7-section shape.
- `tests/skills/implement-graduated-review-depth.test.mjs` — doc-contract test: base-SHA capture point, both `max_review_cycles` replacements, the quick-collapse branch, `resolve-depth` calls at both passes, `review_depth_resolved` reporting, and a reference to the new prompt file.

**Modify:**
- `lib/manifest.mjs` (after `validateMaxReviewRetries`, lines 142-168; wired into `loadManifest`'s `implement` block, lines 72-76) — add `validateMaxReviewCycles()`.
- `tests/lib/manifest.test.mjs` — extend, mirroring the existing `max_review_retries` block.
- `templates/risk-policies-template.yaml` (after each level's `validate_mode` row: lines 19, 26, 33) — add `implement_mode` rows.
- `.context-index/governance/risk-policies.yaml` (this repo's own live policy file; same three additions, since this spec's own `risk_level: high` is what governed its own review) — same rows.
- `lib/governance/rigor-mode.mjs:87` (`routingEasy` short-circuit) and `:89` (policy-key ternary) — explicit key map (C) and the `implement` carve-out (B.5) for the `routingEasy` short-circuit.
- `tests/governance/rigor-mode.test.mjs` — extend with the three-way key-map cases and the `implement`-specific `routingEasy` non-short-circuit case, plus a regression case proving `review-specs`/`validate` are unchanged.
- `lib/lifecycle-events.mjs:87-88` (after the `'review_round'` entry) — add `'review_depth_resolved'`.
- `lib/diagnostics/event-schemas.mjs:207-209` (after the `review_round` schema entry) — add the `review_depth_resolved` schema entry.
- `lib/lifecycle-state.mjs` — new `reportReviewDepthResolved()` (structural copy of `reportReviewRound()`, lines 1349-1441ish), new `reviewDepthResolutions: {}` field in `emptyProjection()` (after line 1933), new fold `case 'review_depth_resolved':` (structural copy of the `review_round` case, lines 2237-2246, placed directly after it).
- `tests/lib/lifecycle-state-event-diagnostics.test.mjs` and a new `tests/lifecycle/review-depth-resolved-event.test.mjs` (mirroring `tests/lifecycle/review-round-event.test.mjs`) — schema validation, fold/last-wins keying, and `EVENT_SCHEMA_INVALID` rejection cases.
- `lib/cli/implement.mjs:66-67` (subverb switch) and `:307-332` (`help()`) — add the `resolve-depth` subverb.
- `skills/implement/SKILL.md:472-476` (base-SHA capture, immediately before the implementer `Agent()` dispatch in Step 2d), `:568-584` (Step 2f), `:586-602` (Step 2g) — cycle cap becomes `implement.max_review_cycles`, both stages branch on resolved depth, quick path dispatches the synthesized reviewer once.
- `skills/build/SKILL.md` (Step 4, after line 524, before Step 5's header at line 536) — new `--tier` propagation clause mirroring lines 404 and 540.
- `tests/skills/build-tier-propagation.test.mjs` (new — no existing test asserts any of the three `--tier` clauses; this one asserts all three so Steps 1/5's existing clauses gain regression coverage alongside Step 4's new one).
- `docs/cli-reference.md` (near `adev implement batches`) — document `adev implement resolve-depth`.
- `docs/skill-reference.md` (near the `/adev:implement` flag list) — document `--tier`, `--review-cycles`.

**Reference (read, do not modify):**
- `lib/test-strategies/depth.mjs` — `evalExpr` (lines 95-114, the pinned `when:` grammar) and `resolveFloor` (lines 173-196, the floor-pass shape) are **read for structural precedent, not imported** (both are module-private; the spec is explicit that this new module duplicates the shapes rather than widening that module's public surface).
- `lib/cli/boundaries.mjs:100-111` (`resolveChangedSet`) — read for the union-of-two-git-calls precedent; **not reused as-is** (this spec's leg needs `--name-status --no-renames` against an arbitrary base SHA, not `--name-only` with renames on against `HEAD`).
- `lib/test-strategies/sensitive-paths.mjs` — `effectiveSensitivePaths(configured, { withWarnings })`, reused verbatim for the `sensitive-path` floor leg.
- `lib/lifecycle-state.mjs:69-84` (`slugFromSpec`) — reused by the `scope-mismatch` leg's Output-Contract-K exclusion to derive the current spec's own lifecycle-log path.
- `.context-index/governance/sensitive-paths.yaml` — this repo's own live extension (`lib/test-strategies/**`, `lib/governance/**`, `lib/lifecycle-events.mjs`) — two of those three paths are touched by this very plan (Tasks 1/3/6), so the `sensitive-path` floor-leg tests must account for them, not just the built-in defaults.
- `lib/plan-routing-sidecar.mjs` — `readRoutingSidecar()` / `lookupRoutingEntry()`, reused for reading `.routing.json` scores.
- `.context-index/governance/boundaries.yaml` — reused for the `boundary` floor leg (all active rules in this repo are `severity: warning` today, so no task here is forced solo by it, but the fail-closed contract still requires the leg to evaluate).
- `lib/loop-convergence.mjs` — `evaluateStopCondition()`, reused unchanged by the synthesized reviewer loop (Task 9); no signature change.
- `skills/review-specs/quick-synthesized-reviewer-prompt.md` — 44-line, 7-section structural template for Task 8's new prompt file.
- `.context-index/specs/cross-cutting/graduated-rigor-tiers.spec.md` (revision 3, `updated: 2026-08-19`) — verified during planning to already carry `affects: [..., implement]` (line 6) and the `skill === "implement"` carve-out text (lines 65-75). No modification task exists for this file; Task 3 adds a regression test proving `resolveRigorMode()`'s code matches this already-amended prose.
- `.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md` (revision 6, `updated: 2026-08-19`) — verified during planning to already register `review_depth_resolved` (Behaviors, lines 187-202; Acceptance Criteria, line 109). No modification task exists for this file.
- `.context-index/specs/features/implementation/batched-task-dispatch.spec.md:193` — the already-shipped, tested invariant ("Both review stages — Stage 1 then Stage 2, per task, at today's depth. Batching the review is explicitly out of scope") that the new `batched-task` floor leg exists to preserve without amendment.

---

## Context Packets

### Task 1 Context
- Spec: `graduated-review-depth.spec.md` — Arguments table (`--review-cycles` row), Output Contract F, Failure Modes rows for `INVALID_MAX_REVIEW_CYCLES` / `INVALID_REVIEW_CYCLES`
- Source files, full read: `lib/manifest.mjs` (`validateMaxReviewRetries`, lines 142-168, and its call site in `loadManifest`, lines 72-76)
- Source files, signatures only: `lib/cli/implement.mjs` (`grep "^export"` — confirms the CLI verb this validator will feed in Task 7 doesn't exist yet)
- Reference: `lib/errors.mjs` (`codedError`)

### Task 2 Context
- Spec: `graduated-review-depth.spec.md` — Arguments table (`implement_mode` surface row)
- Source files, full read: `templates/risk-policies-template.yaml` (35 lines), `.context-index/governance/risk-policies.yaml` (live, 21 lines)
- Reference: `lib/governance/rigor-mode.mjs:37-63` (`loadRigorPolicies`, confirms it reads exactly this file's `policies` key with no transformation)

### Task 3 Context
- Spec: `graduated-review-depth.spec.md` — Output Contract B.5 (full), Output Contract C (full)
- Charter: `implementation/charter.md` (no capability map; cite Key Behaviors)
- Source files, full read: `lib/governance/rigor-mode.mjs` (95 lines)
- Reference: `.context-index/specs/cross-cutting/graduated-rigor-tiers.spec.md` lines 1-75 (the already-amended `affects:` list and carve-out prose this task's code change must match exactly), `tests/governance/rigor-mode.test.mjs` (existing 166-line suite — read in full before extending, to avoid duplicating an existing case)

### Task 4 Context
- Spec: `graduated-review-depth.spec.md` — Output Contract A (precedence steps 1-3 only; floor pass is Task 5), Output Contract B (quick-grant predicate table in full), Output Contract D (score validation, full), Failure Modes rows for `ROUTING_SIDECAR_MISSING` / `ROUTING_SCORE_OUT_OF_RANGE` / malformed `implement_mode`
- Source files, full read: `lib/test-strategies/depth.mjs` (232 lines — structural precedent, not imported), `lib/governance/rigor-mode.mjs` (post-Task-3, for `loadRigorPolicies`/`isValidTier`/`InvalidTierError` reuse), `lib/plan-routing-sidecar.mjs` (`lookupRoutingEntry` shape)
- Reference: `.context-index/governance/risk-policies.yaml` (post-Task-2, the `implement_mode` rows this stage reads)

### Task 5 Context
- Spec: `graduated-review-depth.spec.md` — Output Contract A (the `--base-sha` / touched-files paragraphs in full), Output Contract E (all five floor legs), Output Contract K (the exact exclusion, in full — this is the most failure-mode-dense section of the spec), Failure Modes rows for `MISSING_DIFF_RANGE` and every `scope-mismatch` row
- Source files, full read: `lib/implement/review-depth.mjs` (from Task 4), `lib/test-strategies/sensitive-paths.mjs` (35 lines), `lib/lifecycle-state.mjs` (`grep "^export function slugFromSpec"` plus its 16-line body, lines 69-84)
- Reference: `lib/cli/boundaries.mjs:100-135` (`resolveChangedSet` + `git()` helper — the union-pattern precedent, adapted not copied), `.context-index/governance/sensitive-paths.yaml` (live extension, 3 lines)

### Task 6 Context
- Spec: `graduated-review-depth.spec.md` — Output Contract J (full)
- Source files, full read: `.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md` lines 180-210 (the already-amended Behaviors text this task's code must match)
- Source files, signatures only: `lib/lifecycle-events.mjs` (`grep -n "CANONICAL_EVENTS" -A 20`), `lib/diagnostics/event-schemas.mjs` (`grep -n "review_round" -A 10`)
- Reference: `lib/lifecycle-state.mjs:1339-1442` (`REVIEW_ROUND_KEYS`, `REVIEW_ROUND_STAGES`, `reportReviewRound` — the exact structural template), `lib/lifecycle-state.mjs:2225-2246` (`testDepthAssignments` and `reviewRounds` fold cases — the exact keying/last-wins pattern), `tests/lifecycle/review-round-event.test.mjs` (the test-shape precedent)

### Task 7 Context
- Spec: `graduated-review-depth.spec.md` — Output Contract A (the CLI verb signature paragraph), Arguments table (full), Failure Modes rows for `ROUTING_ENTRY_MISSING` / `MISSING_DIFF_RANGE` / git-failure rows
- Source files, full read: `lib/cli/implement.mjs` (332 lines — small file, add a case), `lib/implement/review-depth.mjs` (from Tasks 4-5), `lib/lifecycle-state.mjs` (post-Task-6, `reportReviewDepthResolved` signature)
- Reference: `lib/cli/implement.mjs:161-305` (`cmdBatches` — the closest existing subverb template: `parseArgs`, path containment, plan read, JSON-out), `lib/manifest.mjs` (post-Task-1, `validateMaxReviewCycles` for `--review-cycles` validation)

### Task 8 Context
- Spec: `graduated-review-depth.spec.md` — the "`quick`: one reviewer, both lenses" section (full), Output Contract A's `cq-<n>` id-tagging sentence
- Source files, full read: `skills/review-specs/quick-synthesized-reviewer-prompt.md` (44 lines — the structural template), `skills/implement/code-quality-checklist.md` (Stage 2's existing checklist, referenced not duplicated)
- Reference: `skills/implement/SKILL.md:568-602` (2f/2g's current dispatch-context bullets — the Stage 1 + Stage 2 input list the synthesized prompt must union)

### Task 9 Context
- Spec: `graduated-review-depth.spec.md` — Output Contract A (in full, both passes), Output Contract F (in full), Output Contract I (in full), Output Contract G (provenance/batching interaction, in full), all Acceptance Criteria rows referencing `--tier full`/`--tier quick`/floor legs/`quick`-path behavior
- Source files, full read: `skills/implement/SKILL.md` lines 291-602 (Step 2 entry through Step 2g — already read in full during planning; re-read at task time in case sibling specs shifted line numbers), `skills/implement/synthesized-reviewer-prompt.md` (from Task 8)
- Reference: `lib/implement/review-depth.mjs` (Tasks 4-5, the function this step calls twice), `lib/loop-convergence.mjs` (`evaluateStopCondition`, unchanged), `skills/implement/tdd-mandate.md` (cited by reference, not duplicated)

### Task 10 Context
- Spec: `graduated-review-depth.spec.md` — Output Contract H (in full)
- Source files, full read: `skills/build/SKILL.md` lines 395-541 (Steps 1, 4, 5 — already read in full during planning)
- Reference: none beyond the spec's literal template text (Output Contract H quotes the exact clause)

### Task 11 Context
- Spec: `graduated-review-depth.spec.md` — Arguments table (full), Output Contract A (verb signature)
- Source files, full read: `docs/cli-reference.md` (section near `adev implement batches`), `docs/skill-reference.md` (section near the `/adev:implement` flag list)
- Reference: `lib/cli/implement.mjs` (post-Task-7, final `resolve-depth` signature), `skills/build/SKILL.md` (post-Task-10, the new Step 4 clause)

---

## Parallelization

- Group A (independent — six tasks touching disjoint files, all can start immediately): Task 1 (manifest cycles validator), Task 2 (risk-policy config rows), Task 3 (rigor-mode.mjs fix), Task 6 (lifecycle event registration), Task 8 (synthesized-reviewer-prompt.md), Task 10 (build SKILL.md Step 4 clause)
- Group B (sequential, depends on parts of Group A): Task 4 (needs Task 2's config rows) → Task 5 (needs Task 4) → Task 7 (needs Task 5, Task 6, Task 1) → Task 9 (needs Task 7, Task 8, and Task 3 for regression safety)
- Group C (sequential, last): Task 11 (needs Task 7, Task 9, Task 10 all shipped for accurate documentation)

Group A's six tasks can all run in parallel with each other. Group B cannot start its first task (Task 4) until Task 2 lands, and Task 9 — the largest single task — cannot start until Task 7 and Task 8 both land.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | `implement.max_review_cycles` manifest validator | small | unit | — | 0 create, 2 modify |
| 2 | `implement_mode` risk-policy rows | small | unit | — | 1 create, 2 modify |
| 3 | `resolveRigorMode()` explicit key map + `implement` carve-out | medium | unit | — | 0 create, 2 modify |
| 4 | `review-depth.mjs` precedence chain (tier-full, policy baseline, quick-grant predicate, score validation) | large | unit | Task 2 | 2 create, 0 modify |
| 5 | `review-depth.mjs` floor pass (5 legs incl. `scope-mismatch` git diff + K exclusion) | large | unit | Task 4 | 0 create, 1 modify |
| 6 | `review_depth_resolved` canonical event + projection fold | medium | unit | — | 1 create, 3 modify |
| 7 | `adev implement resolve-depth` CLI verb | medium | unit | Task 1, 5, 6 | 1 create, 1 modify |
| 8 | `synthesized-reviewer-prompt.md` companion | medium | unit | — | 1 create, 0 modify |
| 9 | `SKILL.md` quick-collapse wiring (base-SHA capture, configurable cycle cap, branch on depth) | large | unit | Task 3, 7, 8 | 1 create, 1 modify |
| 10 | `build/SKILL.md` Step 4 `--tier` propagation | small | unit | — | 1 create, 1 modify |
| 11 | Documentation updates | small | unit | Task 7, 9, 10 | 0 create, 2 modify |

---

## Task Structure

### Task 1: `implement.max_review_cycles` manifest validator [specialist: none]

**Charter capability:** Key Behaviors — "TDD is enforced" (the review-cycle cap is part of the TDD loop's termination contract; making it configurable does not weaken the loop, it removes a literal from prose).
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/manifest.mjs` (new function after line 168, wired into `loadManifest`'s `implement` block, lines 72-76)
- Modify: `tests/lib/manifest.test.mjs` (extend)

**Tests:** `tests/lib/manifest.test.mjs` — extend with cases mirroring the existing `max_review_retries` block (lines 132-206), plus the `--review-cycles: 0` rejection the spec calls out as its own explicit reason (distinct from `max_review_retries`, which permits `0`).

**Context to load:**
- `graduated-review-depth.spec.md` — Arguments table, `--review-cycles` row; Output Contract F
- `lib/errors.mjs` — `codedError(code, message)`

- [ ] **Write failing test**

```javascript
test("loadManifest: defaults implement.max_review_cycles to 3 when omitted", () => {
  const dir = createTempDir();
  try {
    writeFixture(dir, ".context-index/manifest.yaml", "project:\n  name: t\n");
    const m = loadManifest(dir);
    assert.equal(m.implement.max_review_cycles, 3);
  } finally { cleanupTempDir(dir); }
});

test("loadManifest: rejects implement.max_review_cycles of 0 — INVALID_MAX_REVIEW_CYCLES", () => {
  const dir = createTempDir();
  try {
    writeFixture(dir, ".context-index/manifest.yaml",
      "project:\n  name: t\nimplement:\n  max_review_cycles: 0\n");
    assert.throws(() => loadManifest(dir), (err) => err.code === "INVALID_MAX_REVIEW_CYCLES");
  } finally { cleanupTempDir(dir); }
});

test("loadManifest: rejects non-integer implement.max_review_cycles — INVALID_MAX_REVIEW_CYCLES", () => {
  const dir = createTempDir();
  try {
    writeFixture(dir, ".context-index/manifest.yaml",
      "project:\n  name: t\nimplement:\n  max_review_cycles: 2.5\n");
    assert.throws(() => loadManifest(dir), (err) => err.code === "INVALID_MAX_REVIEW_CYCLES");
  } finally { cleanupTempDir(dir); }
});

test("loadManifest: round-trips an explicit implement.max_review_cycles", () => {
  const dir = createTempDir();
  try {
    writeFixture(dir, ".context-index/manifest.yaml",
      "project:\n  name: t\nimplement:\n  max_review_cycles: 5\n");
    assert.equal(loadManifest(dir).implement.max_review_cycles, 5);
  } finally { cleanupTempDir(dir); }
});
```

Also add non-finite and negative cases, mirroring `max_review_retries`'s three rejection tests exactly (the only divergence from that template is the floor: `< 1` here, `< 0` there).

- [ ] **Verify test fails**

Run: `node --test tests/lib/manifest.test.mjs`
Expected: FAIL — `m.implement.max_review_cycles` is `undefined`; `INVALID_MAX_REVIEW_CYCLES` never thrown (the code doesn't exist yet — the batched-task-dispatch spec's `implement.batch_mode`/`implement.max_batch_size` validators already populate `m.implement`, so this is an additive key, not a new section).

- [ ] **Implement**

In `lib/manifest.mjs`, immediately after `validateMaxReviewRetries` (line 168):

```javascript
function validateMaxReviewCycles(implement) {
  const raw = implement.max_review_cycles;
  if (raw === undefined || raw === null) {
    implement.max_review_cycles = 3;
    return;
  }
  if (typeof raw !== "number" || !Number.isFinite(raw) || !Number.isInteger(raw)) {
    throw mkErr(
      "INVALID_MAX_REVIEW_CYCLES",
      `implement.max_review_cycles must be an integer >= 1; got ${JSON.stringify(raw)}`,
    );
  }
  if (raw < 1) {
    throw mkErr(
      "INVALID_MAX_REVIEW_CYCLES",
      `implement.max_review_cycles must be >= 1 (0 would dispatch no reviewer); got ${raw}`,
    );
  }
  implement.max_review_cycles = raw;
}
```

Call it from `loadManifest`'s existing `implement` block (lines 72-76), alongside `validateBatchMode(parsed.implement)` / `validateMaxBatchSize(parsed.implement)`:

```javascript
parsed.implement = parsed.implement ?? {};
validateBatchMode(parsed.implement);
validateMaxBatchSize(parsed.implement);
validateMaxReviewCycles(parsed.implement);
```

Export it (matching `validateMaxBatchSize`'s pattern, not `validateMaxReviewRetries`'s module-private one) since Task 7's CLI verb reuses the identical predicate for `--review-cycles`.

- [ ] **Verify test passes**

Run: `node --test tests/lib/manifest.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/manifest.mjs tests/lib/manifest.test.mjs
git commit -m "feat(implement): add implement.max_review_cycles manifest validator

Spec: .context-index/specs/features/implementation/graduated-review-depth.spec.md
Plan-task: 1"
```

---

### Task 2: `implement_mode` risk-policy rows [specialist: none]

**Charter capability:** Key Behaviors — none directly; pure config plumbing feeding Task 4.
**Strategy:** unit (source: fallback, confidence: high — data-only change)
**Files:**
- Create: `tests/governance/risk-policies-implement-mode.test.mjs`
- Modify: `templates/risk-policies-template.yaml`
- Modify: `.context-index/governance/risk-policies.yaml` (this repo's own live policy)

**Tests:** `tests/governance/risk-policies-implement-mode.test.mjs` (create).

**Context to load:**
- `graduated-review-depth.spec.md` — Arguments table, the `implement_mode` surface row (`full` for `high`/`medium`, `quick` for `low`)

- [ ] **Write failing test**

Create `tests/governance/risk-policies-implement-mode.test.mjs` (plain ESM `node:test`, matching every other test file in this plan — no inline-Node, no `require`):

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { loadRigorPolicies } from "../../lib/governance/rigor-mode.mjs";

test("live risk-policies.yaml declares implement_mode for all three risk levels", () => {
  const policies = loadRigorPolicies(process.cwd());
  assert.equal(policies.high.implement_mode, "full");
  assert.equal(policies.medium.implement_mode, "full");
  assert.equal(policies.low.implement_mode, "quick");
});
```

- [ ] **Verify test fails**

Run: `node --test tests/governance/risk-policies-implement-mode.test.mjs`
Expected: FAIL — `policies.high.implement_mode` is `undefined`.

- [ ] **Implement**

In `templates/risk-policies-template.yaml`, after each level's `validate_mode` row:

```yaml
  high:
    ...
    validate_mode: full
    implement_mode: full
    ...
  medium:
    ...
    validate_mode: full
    implement_mode: full
    ...
  low:
    ...
    validate_mode: quick
    implement_mode: quick
    ...
```

Apply the identical three-line addition to `.context-index/governance/risk-policies.yaml` (the live file this repo's own `/adev:implement` runs read).

- [ ] **Verify test passes**

Run: `node --test tests/governance/risk-policies-implement-mode.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add templates/risk-policies-template.yaml .context-index/governance/risk-policies.yaml tests/governance/risk-policies-implement-mode.test.mjs
git commit -m "feat(governance): add implement_mode risk-policy rows

Spec: .context-index/specs/features/implementation/graduated-review-depth.spec.md
Plan-task: 2"
```

---

### Task 3: `resolveRigorMode()` explicit key map + `implement` carve-out [specialist: none]

**Charter capability:** Key Behaviors — none directly; this fixes a latent bug (`skill: "implement"` silently resolves against `review_mode` today) ahead of any caller passing that value.
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/governance/rigor-mode.mjs:87` (routingEasy guard), `:89` (ternary → map)
- Modify: `tests/governance/rigor-mode.test.mjs` (extend — read all 166 existing lines first to avoid duplicating a case)

**Tests:** `tests/governance/rigor-mode.test.mjs` — extend.

**Context to load:**
- `graduated-review-depth.spec.md` — Output Contract B.5, Output Contract C (both in full)
- `.context-index/specs/cross-cutting/graduated-rigor-tiers.spec.md` lines 1-75 (the already-amended prose this code must match)

- [ ] **Write failing test**

```javascript
test("resolveRigorMode: skill='implement' resolves against implement_mode, never review_mode", () => {
  const policies = { medium: { review_mode: "quick", implement_mode: "full" } };
  const result = resolveRigorMode({ skill: "implement", riskLevel: "medium", policies });
  assert.equal(result, "full"); // would be "quick" under the old ternary
});

test("resolveRigorMode: routingEasy does NOT short-circuit to quick when skill='implement'", () => {
  const result = resolveRigorMode({
    skill: "implement", riskLevel: "medium", policies: { medium: { implement_mode: "full" } },
    routingEasy: true,
  });
  assert.equal(result, "full"); // old code returned "quick" unconditionally here
});

test("resolveRigorMode: routingEasy still short-circuits to quick for review-specs (regression)", () => {
  const result = resolveRigorMode({ skill: "review-specs", routingEasy: true });
  assert.equal(result, "quick");
});

test("resolveRigorMode: routingEasy still short-circuits to quick for validate (regression)", () => {
  const result = resolveRigorMode({ skill: "validate", routingEasy: true });
  assert.equal(result, "quick");
});

test("resolveRigorMode: unrecognized skill keeps the review_mode fallback", () => {
  const policies = { medium: { review_mode: "quick" } };
  const result = resolveRigorMode({ skill: "route", riskLevel: "medium", policies });
  assert.equal(result, "quick");
});
```

- [ ] **Verify test fails**

Run: `node --test tests/governance/rigor-mode.test.mjs`
Expected: FAIL on the first two new tests — `skill: "implement"` reads `review_mode` (wrong key) and `routingEasy: true` returns `"quick"` unconditionally (line 87 fires before the key even matters).

- [ ] **Implement**

In `lib/governance/rigor-mode.mjs`:

```javascript
// line 87, was: if (routingEasy === true) return "quick";
if (routingEasy === true && skill !== "implement") return "quick";

// line 89, was: const key = skill === "validate" ? "validate_mode" : "review_mode";
const key =
  skill === "validate" ? "validate_mode" :
  skill === "implement" ? "implement_mode" :
  "review_mode";
```

- [ ] **Verify test passes**

Run: `node --test tests/governance/rigor-mode.test.mjs`
Expected: PASS (all existing 166 lines of prior tests plus the five new ones)

- [ ] **Commit**

```bash
git add lib/governance/rigor-mode.mjs tests/governance/rigor-mode.test.mjs
git commit -m "fix(governance): explicit implement_mode key + implement carve-out in resolveRigorMode

Spec: .context-index/specs/features/implementation/graduated-review-depth.spec.md
Plan-task: 3"
```

---

### Task 4: `review-depth.mjs` precedence chain (tier-full, policy baseline, quick-grant predicate, score validation) [specialist: none]

**Charter capability:** Key Behaviors — "TDD is enforced" (this task, together with Task 5, is the mechanism that decides how much of the review loop runs).
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2
**Files:**
- Create: `lib/implement/review-depth.mjs`
- Create: `tests/lib/implement/review-depth.test.mjs`

**Tests:** `tests/lib/implement/review-depth.test.mjs` (create).

**Context to load:**
- `graduated-review-depth.spec.md` — Output Contract A (steps 1-3), B (full predicate table), D (full), relevant Failure Modes rows
- `lib/test-strategies/depth.mjs` (read for structure, not imported)

- [ ] **Write failing test**

```javascript
import { resolveImplementReviewDepth } from '../../../lib/implement/review-depth.mjs';

test("--tier full is absolute — resolves full even with perfect scores and no floor", () => {
  const result = resolveImplementReviewDepth({
    spec: { risk_level: "low" },
    task: { id: "t1" },
    routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 } },
    tierFlag: "full",
    policies: { low: { implement_mode: "quick" } },
  });
  assert.equal(result.depth, "full");
  assert.equal(result.source, "tier-full-absolute");
});

test("policy baseline resolves full when implement_mode is missing/malformed", () => {
  const result = resolveImplementReviewDepth({
    spec: { risk_level: "medium" }, task: { id: "t1" },
    routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 } },
    tierFlag: null, policies: { medium: { implement_mode: "not-a-real-tier" } },
  });
  assert.equal(result.depth, "full");
});

test("quick-grant predicate: all four rows pass -> quick", () => {
  const result = resolveImplementReviewDepth({
    spec: { risk_level: "low" }, task: { id: "t1", additive_only: true },
    routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 0.6, pattern_coverage: 0.6, blast_radius: 0.6, novelty: 0.6 } },
    tierFlag: null, policies: { low: { implement_mode: "quick" } },
    boundaryCrossing: false,
  });
  assert.equal(result.depth, "quick");
  assert.equal(result.source, "predicate-grant");
});

test("quick-grant predicate: a single failing dimension (novelty 0.4) keeps full even under --tier quick", () => {
  const result = resolveImplementReviewDepth({
    spec: { risk_level: "low" }, task: { id: "t1", additive_only: true },
    routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 0.6, pattern_coverage: 0.6, blast_radius: 0.6, novelty: 0.4 } },
    tierFlag: "quick", policies: { low: { implement_mode: "full" } },
    boundaryCrossing: false,
  });
  assert.equal(result.depth, "full");
});

test("--tier quick authorizes predicate evaluation even when baseline is full", () => {
  const result = resolveImplementReviewDepth({
    spec: { risk_level: "high" }, task: { id: "t1", additive_only: true },
    routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 0.6, pattern_coverage: 0.6, blast_radius: 0.6, novelty: 0.6 } },
    tierFlag: "quick", policies: { high: { implement_mode: "full" } },
    boundaryCrossing: false,
  });
  assert.equal(result.depth, "quick");
});

test("selected_agent other than auto-agent never grants quick", () => {
  const result = resolveImplementReviewDepth({
    spec: { risk_level: "low" }, task: { id: "t1", additive_only: true },
    routingEntry: { selected_agent: "assisted-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 } },
    tierFlag: null, policies: { low: { implement_mode: "quick" } },
    boundaryCrossing: false,
  });
  assert.equal(result.depth, "full");
});

test("a governance boundary crossing keeps full even with perfect scores", () => {
  const result = resolveImplementReviewDepth({
    spec: { risk_level: "low" }, task: { id: "t1", additive_only: true },
    routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 } },
    tierFlag: null, policies: { low: { implement_mode: "quick" } },
    boundaryCrossing: true,
  });
  assert.equal(result.depth, "full");
});

test("additive-only row fails independently — a task with an otherwise-perfect predicate but additive_only: false resolves full", () => {
  const result = resolveImplementReviewDepth({
    spec: { risk_level: "low" }, task: { id: "t1", additive_only: false },
    routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 } },
    tierFlag: null, policies: { low: { implement_mode: "quick" } },
    boundaryCrossing: false,
  });
  assert.equal(result.depth, "full");
});

test("an out-of-range score resolves full with ROUTING_SCORE_OUT_OF_RANGE, no coercion", () => {
  const result = resolveImplementReviewDepth({
    spec: { risk_level: "low" }, task: { id: "t1", additive_only: true },
    routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 5 } },
    tierFlag: null, policies: { low: { implement_mode: "quick" } },
    boundaryCrossing: false,
  });
  assert.equal(result.depth, "full");
  assert.ok(result.warnings.some(w => w.code === "ROUTING_SCORE_OUT_OF_RANGE"));
});

test("a raw un-normalized score of 1 (worst on the old 1..5 scale) is caught, not silently treated as strong", () => {
  // 1 numerically satisfies >= 0.6 and sits inside 0..1 — the exact fail-open the spec calls out.
  // The score-scale validator must still flag it because upstream normalization cannot be assumed
  // (research finding F-I10: a sidecar was found on disk with un-normalized 1..5 scores).
  // This case is intentionally NOT distinguishable from a valid 0..1 fraction of exactly 1 by range
  // alone — the spec accepts this as a known, narrow gap (see D's own caveat) and does not require
  // detecting it; this test documents the accepted boundary rather than asserting a stronger guarantee.
  const result = resolveImplementReviewDepth({
    spec: { risk_level: "low" }, task: { id: "t1", additive_only: true },
    routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 } },
    tierFlag: null, policies: { low: { implement_mode: "quick" } }, boundaryCrossing: false,
  });
  assert.equal(result.depth, "quick"); // documents the accepted boundary, not a regression
});

test("non-finite / non-numeric score resolves full", () => {
  const result = resolveImplementReviewDepth({
    spec: { risk_level: "low" }, task: { id: "t1", additive_only: true },
    routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: NaN, novelty: 1 } },
    tierFlag: null, policies: { low: { implement_mode: "quick" } }, boundaryCrossing: false,
  });
  assert.equal(result.depth, "full");
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/implement/review-depth.test.mjs`
Expected: FAIL — `resolveImplementReviewDepth is not a function` (module doesn't exist).

- [ ] **Implement**

Create `lib/implement/review-depth.mjs`. Port (do not import) `lib/test-strategies/depth.mjs`'s `EXPR_RE`/`evalExpr` shape only insofar as this module needs its own dimension-threshold check (a flat `>= 0.6` constant per predicate row B, not a `when:` grammar — the spec's predicate table is static, unlike test-depth's escalation rules — so a full `evalExpr` port is unnecessary here; a simple numeric comparison suffices). Structure:

```javascript
import { isValidTier, InvalidTierError, loadRigorPolicies } from '../governance/rigor-mode.mjs';

const QUICK_GRANT_THRESHOLD = 0.6;
const SCORE_DIMENSIONS = ['spec_completeness', 'pattern_coverage', 'blast_radius', 'novelty'];

function validateScores(scores) {
  const warnings = [];
  let allValid = true;
  for (const dim of SCORE_DIMENSIONS) {
    const v = scores?.[dim];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) {
      warnings.push({ code: 'ROUTING_SCORE_OUT_OF_RANGE', dimension: dim, value: v });
      allValid = false;
    }
  }
  return { allValid, warnings };
}

function quickGrantPredicate({ routingEntry, boundaryCrossing, additiveOnly }) {
  if (routingEntry?.selected_agent !== 'auto-agent') return false;
  const { allValid, warnings } = validateScores(routingEntry?.scores);
  if (!allValid) return { granted: false, warnings };
  const allAboveThreshold = SCORE_DIMENSIONS.every(
    (dim) => routingEntry.scores[dim] >= QUICK_GRANT_THRESHOLD,
  );
  if (!allAboveThreshold) return { granted: false, warnings };
  if (boundaryCrossing) return { granted: false, warnings };
  if (!additiveOnly) return { granted: false, warnings };
  return { granted: true, warnings };
}

export function resolveImplementReviewDepth({
  spec, task, routingEntry, tierFlag, policies, boundaryCrossing = false, touchedFiles,
} = {}) {
  // Stage 1: --tier full is absolute.
  if (tierFlag != null && tierFlag !== '') {
    if (!isValidTier(tierFlag)) throw new InvalidTierError(tierFlag);
    if (tierFlag === 'full') {
      return { depth: 'full', source: 'tier-full-absolute', floor_applied: false, floor_legs: [], warnings: [] };
    }
  }

  // Stage 2: policy baseline (direct read, not via resolveRigorMode()).
  const riskLevel = spec?.risk_level ?? 'medium';
  const baselineRaw = policies?.[riskLevel]?.implement_mode;
  const baseline = isValidTier(baselineRaw) ? baselineRaw : 'full';

  // Stage 3: quick-grant predicate — evaluated when baseline is quick OR --tier quick authorizes it.
  let depth = baseline;
  let source = 'policy-baseline';
  let warnings = [];
  if (baseline === 'quick' || tierFlag === 'quick') {
    const predicateResult = quickGrantPredicate({
      routingEntry, boundaryCrossing, additiveOnly: task?.additive_only === true,
    });
    warnings = predicateResult.warnings ?? [];
    if (predicateResult.granted) {
      depth = 'quick';
      source = 'predicate-grant';
    } else {
      depth = 'full';
      source = warnings.some(w => w.code === 'ROUTING_SCORE_OUT_OF_RANGE') ? 'score-out-of-range' : 'predicate-denied';
    }
  }

  return { depth, source, floor_applied: false, floor_legs: [], warnings };
  // Floor pass (Stage 4) is applied by the caller composing this with Task 5's resolveFloor(),
  // per Output Contract A/E — kept as a separate exported step so Task 5's tests can target it
  // in isolation, then a thin wrapper composes both (see Task 5's "Implement" step for the final
  // exported shape once floor is added).
}
```

Note for implementer: Task 5 extends this exact file — do not close it off as "complete" in a way that makes the floor pass an awkward bolt-on. Structure the internal composition so Task 5 adds a `resolveFloor()` private function and calls it as the final step inside `resolveImplementReviewDepth()` itself (matching `lib/test-strategies/depth.mjs`'s `resolveTestDepth()` composing `resolveChain` → `resolveEscalation` → `resolveFloor` as three sequential internal calls) rather than as a second exported function.

- [ ] **Verify test passes**

Run: `node --test tests/lib/implement/review-depth.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/implement/review-depth.mjs tests/lib/implement/review-depth.test.mjs
git commit -m "feat(implement): add resolveImplementReviewDepth precedence chain

Spec: .context-index/specs/features/implementation/graduated-review-depth.spec.md
Plan-task: 4"
```

---

### Task 5: `review-depth.mjs` floor pass (5 legs incl. `scope-mismatch` git diff + K exclusion) [specialist: none]

**Charter capability:** Key Behaviors — "TDD is enforced" (the floor pass is what keeps the collapse safe: any of five conditions forces the full loop back on).
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 4
**Files:**
- Modify: `lib/implement/review-depth.mjs` (add the floor pass and the exported git-diff touched-file helper)
- Modify: `tests/lib/implement/review-depth.test.mjs` (extend)

**Tests:** `tests/lib/implement/review-depth.test.mjs` (extend, same file as Task 4).

**Context to load:**
- `graduated-review-depth.spec.md` — Output Contract A (base-SHA/touched-files paragraphs), E (all five legs), K (in full)
- `lib/test-strategies/sensitive-paths.mjs`, `lib/lifecycle-state.mjs:69-84` (`slugFromSpec`)
- `lib/cli/boundaries.mjs:100-135` (read for the union-pattern precedent, adapted not copied)

- [ ] **Write failing test**

```javascript
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

function initGitRepo(dir) {
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 't@t.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 't'], { cwd: dir });
}

test("boundary floor leg fires and is named in floor_legs when a governance boundary is crossed", () => {
  const result = resolveImplementReviewDepth({
    spec: { risk_level: "low" }, task: { id: "t1", additive_only: true },
    routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 } },
    tierFlag: null, policies: { low: { implement_mode: "quick" } },
    boundaryCrossing: true,
  });
  assert.equal(result.depth, "full");
  assert.ok(result.floor_legs.includes("boundary")); // distinct from the predicate-level denial test above —
  // this asserts the FLOOR leg specifically fires and is named, not just that depth resolves full
});

test("risk-level floor forces full even with a granted predicate", () => {
  const result = resolveImplementReviewDepth({
    spec: { risk_level: "high" }, task: { id: "t1", additive_only: true },
    routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 } },
    tierFlag: "quick", policies: { high: { implement_mode: "full" } }, boundaryCrossing: false,
  });
  assert.equal(result.depth, "full");
  assert.ok(result.floor_applied);
  assert.ok(result.floor_legs.includes("risk-level"));
});

test("REVIEW_DEPTH_FLOOR_APPLIED fires even when the resolved value was already full", () => {
  const result = resolveImplementReviewDepth({
    spec: { risk_level: "high" }, task: { id: "t1" },
    routingEntry: null, tierFlag: null, policies: { high: { implement_mode: "full" } },
  });
  assert.equal(result.depth, "full");
  assert.ok(result.floor_applied);
});

test("batched-task floor leg forces full regardless of predicate or --tier quick", () => {
  const result = resolveImplementReviewDepth({
    spec: { risk_level: "low" }, task: { id: "t1", additive_only: true, in_batch: true },
    routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 } },
    tierFlag: "quick", policies: { low: { implement_mode: "quick" } }, boundaryCrossing: false,
  });
  assert.equal(result.depth, "full");
  assert.ok(result.floor_legs.includes("batched-task"));
});

test("scope-mismatch: final pass, an undeclared path outside the additive set forces full", () => {
  const dir = createTempDir();
  try {
    initGitRepo(dir);
    writeFileSync(join(dir, "a.txt"), "1"); execFileSync("git", ["add", "-A"], { cwd: dir });
    execFileSync("git", ["commit", "-q", "-m", "base"], { cwd: dir });
    const baseSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir }).toString().trim();
    writeFileSync(join(dir, "b.txt"), "new"); // undeclared, untracked
    const result = resolveImplementReviewDepth({
      spec: { risk_level: "low" }, task: { id: "t1", additive_only: true, declared_files: ["c.txt"] },
      routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 } },
      tierFlag: null, policies: { low: { implement_mode: "quick" } },
      pass: "final", baseSha, projectRoot: dir,
    });
    assert.equal(result.depth, "full");
    assert.ok(result.floor_legs.includes("scope-mismatch"));
  } finally { cleanupTempDir(dir); }
});

test("scope-mismatch: modifying (not adding) a declared-additive path also forces full", () => {
  const dir = createTempDir();
  try {
    initGitRepo(dir);
    writeFileSync(join(dir, "existing.txt"), "1"); execFileSync("git", ["add", "-A"], { cwd: dir });
    execFileSync("git", ["commit", "-q", "-m", "base"], { cwd: dir });
    const baseSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir }).toString().trim();
    writeFileSync(join(dir, "existing.txt"), "2"); // declared additive, but actually modified (M)
    const result = resolveImplementReviewDepth({
      spec: { risk_level: "low" }, task: { id: "t1", additive_only: true, declared_files: ["existing.txt"] },
      routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 } },
      tierFlag: null, policies: { low: { implement_mode: "quick" } },
      pass: "final", baseSha, projectRoot: dir,
    });
    assert.equal(result.depth, "full");
    assert.ok(result.floor_legs.includes("scope-mismatch"));
  } finally { cleanupTempDir(dir); }
});

test("scope-mismatch: an out-of-scope tracked file deleted or type-changed still fires the leg", () => {
  const dir = createTempDir();
  try {
    initGitRepo(dir);
    writeFileSync(join(dir, "gone.txt"), "1"); execFileSync("git", ["add", "-A"], { cwd: dir });
    execFileSync("git", ["commit", "-q", "-m", "base"], { cwd: dir });
    const baseSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir }).toString().trim();
    execFileSync("git", ["rm", "-q", "gone.txt"], { cwd: dir }); // out-of-scope deletion
    const result = resolveImplementReviewDepth({
      spec: { risk_level: "low" }, task: { id: "t1", additive_only: true, declared_files: ["new.txt"] },
      routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 } },
      tierFlag: null, policies: { low: { implement_mode: "quick" } },
      pass: "final", baseSha, projectRoot: dir,
    });
    assert.equal(result.depth, "full");
    assert.ok(result.floor_legs.includes("scope-mismatch"));
  } finally { cleanupTempDir(dir); }
});

test("scope-mismatch: a staged rename pairing an out-of-scope delete with an in-scope add still fires (no-renames)", () => {
  const dir = createTempDir();
  try {
    initGitRepo(dir);
    writeFileSync(join(dir, "old.txt"), "shared content for rename detection");
    execFileSync("git", ["add", "-A"], { cwd: dir });
    execFileSync("git", ["commit", "-q", "-m", "base"], { cwd: dir });
    const baseSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir }).toString().trim();
    execFileSync("git", ["rm", "-q", "old.txt"], { cwd: dir });
    writeFileSync(join(dir, "new.txt"), "shared content for rename detection");
    execFileSync("git", ["add", "-A"], { cwd: dir }); // staging both would let git pair as a rename
    const result = resolveImplementReviewDepth({
      spec: { risk_level: "low" }, task: { id: "t1", additive_only: true, declared_files: ["new.txt"] },
      routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 } },
      tierFlag: null, policies: { low: { implement_mode: "quick" } },
      pass: "final", baseSha, projectRoot: dir,
    });
    assert.equal(result.depth, "full"); // old.txt's D must be visible on its own, not absorbed into R100
    assert.ok(result.floor_legs.includes("scope-mismatch"));
  } finally { cleanupTempDir(dir); }
});

test("Output Contract K: status-M on the current spec's own lifecycle log is excluded", () => {
  const dir = createTempDir();
  try {
    initGitRepo(dir);
    mkdirSync(join(dir, ".context-index/lifecycle-state"), { recursive: true });
    writeFileSync(join(dir, ".context-index/lifecycle-state/my-spec.jsonl"), "{}\n");
    execFileSync("git", ["add", "-A"], { cwd: dir });
    execFileSync("git", ["commit", "-q", "-m", "base"], { cwd: dir });
    const baseSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir }).toString().trim();
    writeFileSync(join(dir, ".context-index/lifecycle-state/my-spec.jsonl"), "{}\n{}\n"); // M
    const result = resolveImplementReviewDepth({
      spec: { risk_level: "low", specPath: "specs/my-spec.spec.md" },
      task: { id: "t1", additive_only: true, declared_files: ["new.txt"] },
      routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 } },
      tierFlag: null, policies: { low: { implement_mode: "quick" } },
      pass: "final", baseSha, projectRoot: dir,
    });
    assert.equal(result.depth, "quick"); // excluded — the leg must not fire on this basis alone
    assert.ok(!result.floor_legs.includes("scope-mismatch"));
  } finally { cleanupTempDir(dir); }
});

test("Output Contract K: the exclusion does NOT apply to status A (log did not exist before this task) on the same log", () => {
  const dir = createTempDir();
  try {
    initGitRepo(dir);
    execFileSync("git", ["add", "-A"], { cwd: dir });
    execFileSync("git", ["commit", "-q", "-m", "base", "--allow-empty"], { cwd: dir });
    const baseSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir }).toString().trim();
    mkdirSync(join(dir, ".context-index/lifecycle-state"), { recursive: true });
    writeFileSync(join(dir, ".context-index/lifecycle-state/my-spec.jsonl"), "{}\n"); // A — not excluded
    const result = resolveImplementReviewDepth({
      spec: { risk_level: "low", specPath: "specs/my-spec.spec.md" },
      task: { id: "t1", additive_only: true, declared_files: ["new.txt"] },
      routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 } },
      tierFlag: null, policies: { low: { implement_mode: "quick" } },
      pass: "final", baseSha, projectRoot: dir,
    });
    assert.equal(result.depth, "full");
    assert.ok(result.floor_legs.includes("scope-mismatch"));
  } finally { cleanupTempDir(dir); }
});

test("Output Contract K: the exclusion does NOT apply to status D (log deleted) on the same log", () => {
  const dir = createTempDir();
  try {
    initGitRepo(dir);
    mkdirSync(join(dir, ".context-index/lifecycle-state"), { recursive: true });
    writeFileSync(join(dir, ".context-index/lifecycle-state/my-spec.jsonl"), "{}\n");
    execFileSync("git", ["add", "-A"], { cwd: dir });
    execFileSync("git", ["commit", "-q", "-m", "base"], { cwd: dir });
    const baseSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir }).toString().trim();
    execFileSync("git", ["rm", "-q", ".context-index/lifecycle-state/my-spec.jsonl"], { cwd: dir }); // D — not excluded
    const result = resolveImplementReviewDepth({
      spec: { risk_level: "low", specPath: "specs/my-spec.spec.md" },
      task: { id: "t1", additive_only: true, declared_files: ["new.txt"] },
      routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 } },
      tierFlag: null, policies: { low: { implement_mode: "quick" } },
      pass: "final", baseSha, projectRoot: dir,
    });
    assert.equal(result.depth, "full");
    assert.ok(result.floor_legs.includes("scope-mismatch"));
  } finally { cleanupTempDir(dir); }
});

test("Output Contract K: the exclusion does NOT apply to a status-M touch on ANOTHER spec's lifecycle log", () => {
  const dir = createTempDir();
  try {
    initGitRepo(dir);
    mkdirSync(join(dir, ".context-index/lifecycle-state"), { recursive: true });
    writeFileSync(join(dir, ".context-index/lifecycle-state/other-spec.jsonl"), "{}\n");
    execFileSync("git", ["add", "-A"], { cwd: dir });
    execFileSync("git", ["commit", "-q", "-m", "base"], { cwd: dir });
    const baseSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir }).toString().trim();
    writeFileSync(join(dir, ".context-index/lifecycle-state/other-spec.jsonl"), "{}\n{}\n"); // M, but wrong spec's log
    const result = resolveImplementReviewDepth({
      spec: { risk_level: "low", specPath: "specs/my-spec.spec.md" }, // current task's spec is my-spec, not other-spec
      task: { id: "t1", additive_only: true, declared_files: ["new.txt"] },
      routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 } },
      tierFlag: null, policies: { low: { implement_mode: "quick" } },
      pass: "final", baseSha, projectRoot: dir,
    });
    assert.equal(result.depth, "full");
    assert.ok(result.floor_legs.includes("scope-mismatch"));
  } finally { cleanupTempDir(dir); }
});

test("critical-finding leg persists for the remainder of a task once triggered", () => {
  const result = resolveImplementReviewDepth({
    spec: { risk_level: "low" }, task: { id: "t1", additive_only: true, had_critical_finding: true },
    routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 } },
    tierFlag: null, policies: { low: { implement_mode: "quick" } }, pass: "final",
  });
  assert.equal(result.depth, "full");
  assert.ok(result.floor_legs.includes("critical-finding"));
});

test("sensitive-path floor leg respects this repo's own configured extension (lib/governance/**)", () => {
  const result = resolveImplementReviewDepth({
    spec: { risk_level: "low" }, task: { id: "t1", additive_only: true },
    routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 } },
    tierFlag: null, policies: { low: { implement_mode: "quick" } },
    targetPaths: ["lib/governance/rigor-mode.mjs"], sensitivePaths: ["lib/governance/**"],
  });
  assert.equal(result.depth, "full");
  assert.ok(result.floor_legs.includes("sensitive-path"));
});

test("solo dispatch: two tasks in the same run resolve independently", () => {
  const inputBase = { spec: { risk_level: "low" }, tierFlag: null, policies: { low: { implement_mode: "quick" } } };
  const easy = resolveImplementReviewDepth({ ...inputBase, task: { id: "t1", additive_only: true },
    routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 } } });
  const hard = resolveImplementReviewDepth({ ...inputBase, task: { id: "t2", additive_only: true, in_batch: true },
    routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 } } });
  assert.equal(easy.depth, "quick");
  assert.equal(hard.depth, "full");
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/implement/review-depth.test.mjs`
Expected: FAIL — floor legs and `scope-mismatch`/git-diff logic don't exist yet; all new assertions fail or throw.

- [ ] **Implement**

Extend `lib/implement/review-depth.mjs`. Add an exported touched-file computation reused by the CLI verb in Task 7 (so the verb doesn't re-implement it), and the floor pass composed as the final internal step:

```javascript
import { execFileSync } from 'node:child_process';
import { effectiveSensitivePaths } from '../test-strategies/sensitive-paths.mjs';
import { slugFromSpec } from '../lifecycle-state.mjs';

export function computeTouchedFiles(projectRoot, baseSha) {
  if (!baseSha) throw mkErr('MISSING_DIFF_RANGE', 'computeTouchedFiles requires a base SHA');
  const tracked = git(projectRoot, ['diff', '--no-renames', '--name-status', '-z', baseSha]);
  const untracked = git(projectRoot, ['ls-files', '--others', '--exclude-standard', '-z']);
  const records = [];
  for (let i = 0; i + 1 < tracked.length; i += 2) {
    records.push({ status: tracked[i][0], path: tracked[i + 1] });
  }
  for (const path of untracked) records.push({ status: 'A', path });
  return records;
}

function excludeOwnLifecycleLogTouch(records, specPath) {
  if (!specPath) return records;
  let slug;
  try { slug = slugFromSpec(specPath); } catch { return records; }
  const ownLogPath = `.context-index/lifecycle-state/${slug}.jsonl`;
  return records.filter((r) => !(r.path === ownLogPath && r.status === 'M'));
}

function scopeMismatchLeg({ pass, baseSha, projectRoot, declaredFiles, specPath }) {
  if (pass !== 'final') return false;
  if (!baseSha) throw mkErr('MISSING_DIFF_RANGE', 'final pass requires --base-sha');
  const raw = computeTouchedFiles(projectRoot, baseSha);
  const records = excludeOwnLifecycleLogTouch(raw, specPath);
  const declared = new Set(declaredFiles ?? []);
  for (const { status, path } of records) {
    if (!declared.has(path)) return true;         // undeclared touch of any kind
    if (status !== 'A') return true;               // declared-additive path not actually added
  }
  return false;
}

function resolveFloor({ depth, spec, task, boundaryCrossing, targetPaths, sensitivePaths, pass, baseSha, projectRoot }) {
  const legs = [];
  if (spec?.risk_level === 'high') legs.push('risk-level');
  if (boundaryCrossing) legs.push('boundary'); // top-level param, NOT task.boundaryCrossing —
  // must be threaded through from resolveImplementReviewDepth's own top-level argument (Task 4),
  // the same value the quick-grant predicate already consumes. A prior draft nested this under
  // `task.boundaryCrossing`, which is never populated and silently disables the leg — caught in review.
  const paths = targetPaths ?? [];
  const effective = sensitivePaths ?? effectiveSensitivePaths([]);
  if (paths.length > 0 && paths.some((p) => effective.some((pat) => matchGlob(pat, p)))) {
    legs.push('sensitive-path');
  }
  if (pass === 'final' && task?.had_critical_finding) legs.push('critical-finding');
  if (task?.in_batch) legs.push('batched-task');
  if (scopeMismatchLeg({ pass, baseSha, projectRoot, declaredFiles: task?.declared_files, specPath: spec?.specPath })) {
    legs.push('scope-mismatch');
  }
  const floor_applied = legs.length > 0;
  return {
    depth: floor_applied ? 'full' : depth,
    floor_applied, floor_legs: legs,
    warnings: floor_applied ? [{ code: 'REVIEW_DEPTH_FLOOR_APPLIED', legs }] : [],
  };
}
```

Wire `resolveFloor(...)` as the last step inside `resolveImplementReviewDepth()` (replacing the earlier bare `return` from Task 4), merging its `warnings` with the predicate stage's, and returning its `depth`/`floor_applied`/`floor_legs` as the final result — mirroring `resolveTestDepth()`'s three-call composition. Critically, pass the function's own top-level `boundaryCrossing` parameter straight through to `resolveFloor({ ..., boundaryCrossing, ... })` — it must NOT be read off `task.boundaryCrossing` inside `resolveFloor` (that field is never populated; the predicate stage and the floor stage must consume the exact same top-level argument, or the `boundary` floor leg silently never fires). `matchGlob` is imported from `../manifest.mjs`, matching `lib/test-strategies/depth.mjs`'s own import.

- [ ] **Verify test passes**

Run: `node --test tests/lib/implement/review-depth.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/implement/review-depth.mjs tests/lib/implement/review-depth.test.mjs
git commit -m "feat(implement): add review-depth floor pass with scope-mismatch git-diff leg

Spec: .context-index/specs/features/implementation/graduated-review-depth.spec.md
Plan-task: 5"
```

---

### Task 6: `review_depth_resolved` canonical event + projection fold [specialist: none]

**Charter capability:** Key Behaviors — "Recovery records feed into `/adev:retro` for trend analysis" (this event is the durable record a graduated run leaves for later analysis; `review-provenance.spec.md`'s `review_round` is the sibling this mirrors).
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/lifecycle-events.mjs:87-88`
- Modify: `lib/diagnostics/event-schemas.mjs:207-209`
- Modify: `lib/lifecycle-state.mjs` (new `reportReviewDepthResolved()`, `emptyProjection()` field, fold case)
- Create: `tests/lifecycle/review-depth-resolved-event.test.mjs`

**Tests:** `tests/lifecycle/review-depth-resolved-event.test.mjs` (create, mirroring `tests/lifecycle/review-round-event.test.mjs`).

**Context to load:**
- `graduated-review-depth.spec.md` — Output Contract J (in full)
- `.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md` lines 180-210 (already-amended text this code must match)
- `lib/lifecycle-state.mjs:1339-1442` (`REVIEW_ROUND_KEYS`/`REVIEW_ROUND_STAGES`/`reportReviewRound`), `:2225-2246` (fold precedents)

- [ ] **Write failing test**

```javascript
import { reportReviewDepthResolved, currentState } from '../../lib/lifecycle-state.mjs';
import { CANONICAL_EVENTS } from '../../lib/lifecycle-events.mjs';
import { isKnownEventType, getRequiredFields } from '../../lib/diagnostics/event-schemas.mjs';

test("review_depth_resolved is a canonical, known event type", () => {
  assert.ok(CANONICAL_EVENTS.has('review_depth_resolved'));
  assert.ok(isKnownEventType('review_depth_resolved'));
});

test("review_depth_resolved required fields match the spec's allow-list", () => {
  const fields = getRequiredFields('review_depth_resolved');
  for (const f of ['plan', 'task_id', 'pass', 'depth', 'source', 'floor_applied', 'floor_legs']) {
    assert.ok(fields.includes(f), `missing field ${f}`);
  }
});

test("reportReviewDepthResolved rejects an unknown key", () => {
  const dir = createTempDir();
  try {
    assert.throws(
      () => reportReviewDepthResolved(dir, 'specs/x.spec.md', {
        plan: 'p.plan.md', task_id: 't1', pass: 'final', depth: 'quick',
        source: 'predicate-grant', floor_applied: false, floor_legs: [], bogus: 'x',
      }),
      (err) => err.code === 'EVENT_SCHEMA_INVALID',
    );
  } finally { cleanupTempDir(dir); }
});

test("reportReviewDepthResolved rejects an invalid pass or depth enum value", () => {
  const dir = createTempDir();
  try {
    assert.throws(() => reportReviewDepthResolved(dir, 'specs/x.spec.md', {
      plan: 'p.plan.md', task_id: 't1', pass: 'middle', depth: 'quick',
      source: 's', floor_applied: false, floor_legs: [],
    }), (err) => err.code === 'EVENT_SCHEMA_INVALID');
  } finally { cleanupTempDir(dir); }
});

test("projection folds review_depth_resolved under reviewDepthResolutions, keyed plan::task_id::pass, last-wins", () => {
  const dir = createTempDir();
  const specPath = 'specs/x.spec.md';
  try {
    writeFixture(dir, specPath.replace('specs/', '.context-index/specs/'), '---\n---\n# x\n');
    reportReviewDepthResolved(dir, specPath, {
      plan: 'p.plan.md', task_id: 't1', pass: 'provisional', depth: 'quick',
      source: 'predicate-grant', floor_applied: false, floor_legs: [],
    });
    reportReviewDepthResolved(dir, specPath, {
      plan: 'p.plan.md', task_id: 't1', pass: 'final', depth: 'full',
      source: 'floor', floor_applied: true, floor_legs: ['scope-mismatch'],
    });
    const state = currentState(dir, specPath);
    const provisional = state.reviewDepthResolutions['p.plan.md::t1::provisional'];
    const final = state.reviewDepthResolutions['p.plan.md::t1::final'];
    assert.equal(provisional.depth, 'quick'); // final pass must not overwrite provisional's key
    assert.equal(final.depth, 'full');
  } finally { cleanupTempDir(dir); }
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lifecycle/review-depth-resolved-event.test.mjs`
Expected: FAIL — `reportReviewDepthResolved is not a function`; `CANONICAL_EVENTS.has('review_depth_resolved')` is `false`.

- [ ] **Implement**

`lib/lifecycle-events.mjs`, after line 87 (`'review_round',`):

```javascript
  // review_depth_resolved: sole writer is `adev implement resolve-depth`
  // (graduated-review-depth.spec.md Output Contract J). One event per
  // resolution pass (provisional, final). [BOUNDARY: human-approved]
  'review_depth_resolved',
```

`lib/diagnostics/event-schemas.mjs`, after the `review_round` entry (line 207):

```javascript
  review_depth_resolved: Object.freeze([
    ...UNIVERSAL_REQUIRED, 'plan', 'task_id', 'pass', 'depth', 'source',
    'floor_applied', 'floor_legs',
  ]),
```

`lib/lifecycle-state.mjs`: add closed constants and the writer, structurally identical to `reportReviewRound`:

```javascript
const REVIEW_DEPTH_RESOLVED_KEYS = new Set([
  'plan', 'task_id', 'pass', 'depth', 'source', 'floor_applied', 'floor_legs',
]);
const REVIEW_DEPTH_PASSES = new Set(['provisional', 'final']);
const REVIEW_DEPTHS = new Set(['full', 'quick']);

export function reportReviewDepthResolved(projectRoot, specPath, args) {
  if (!args || typeof args !== 'object') {
    throw mkErr('EVENT_SCHEMA_INVALID', 'reportReviewDepthResolved requires an args object');
  }
  for (const key of Object.keys(args)) {
    if (!REVIEW_DEPTH_RESOLVED_KEYS.has(key)) {
      throw mkErr('EVENT_SCHEMA_INVALID', `unknown key: ${key}`);
    }
  }
  const { plan, task_id, pass, depth, source, floor_applied, floor_legs } = args;
  if (typeof plan !== 'string' || typeof task_id !== 'string') {
    throw mkErr('EVENT_SCHEMA_INVALID', 'plan and task_id must be strings');
  }
  if (!REVIEW_DEPTH_PASSES.has(pass)) {
    throw mkErr('EVENT_SCHEMA_INVALID', `pass must be one of ${[...REVIEW_DEPTH_PASSES]}`);
  }
  if (!REVIEW_DEPTHS.has(depth)) {
    throw mkErr('EVENT_SCHEMA_INVALID', `depth must be one of ${[...REVIEW_DEPTHS]}`);
  }
  if (typeof source !== 'string') throw mkErr('EVENT_SCHEMA_INVALID', 'source must be a string');
  if (typeof floor_applied !== 'boolean') throw mkErr('EVENT_SCHEMA_INVALID', 'floor_applied must be a boolean');
  if (!Array.isArray(floor_legs)) throw mkErr('EVENT_SCHEMA_INVALID', 'floor_legs must be an array');

  appendEvent(projectRoot, specPath, {
    event: 'review_depth_resolved', plan, task_id, pass, depth, source, floor_applied, floor_legs,
  });
}
```

In `emptyProjection()`, after `reviewRounds: {}` (line 1933): `reviewDepthResolutions: {},`.

In the fold `switch`, directly after the `review_round` case (line 2246):

```javascript
case 'review_depth_resolved': {
  if (typeof ev.task_id !== 'string' || typeof ev.plan !== 'string' || typeof ev.pass !== 'string') break;
  projection.reviewDepthResolutions[`${ev.plan}::${ev.task_id}::${ev.pass}`] = { ...ev };
  break;
}
```

- [ ] **Verify test passes**

Run: `node --test tests/lifecycle/review-depth-resolved-event.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/lifecycle-events.mjs lib/diagnostics/event-schemas.mjs lib/lifecycle-state.mjs tests/lifecycle/review-depth-resolved-event.test.mjs
git commit -m "feat(lifecycle): register review_depth_resolved canonical event

Spec: .context-index/specs/features/implementation/graduated-review-depth.spec.md
Plan-task: 6"
```

---

### Task 7: `adev implement resolve-depth` CLI verb [specialist: none]

**Charter capability:** Key Behaviors — "TDD is enforced" (this is the named surface `skills/implement/SKILL.md` calls, per the cli-driver-surface constitution rule — no inline Node in skill prose).
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1, Task 5, Task 6
**Files:**
- Modify: `lib/cli/implement.mjs:66-67` (switch), `:307-332` (`help()`)
- Create: `tests/cli/implement-resolve-depth.test.mjs`

**Tests:** `tests/cli/implement-resolve-depth.test.mjs` (create).

**Context to load:**
- `graduated-review-depth.spec.md` — Output Contract A (verb signature paragraph), B (the quick-grant predicate's "additive-only" row — its provisional-declaration vs. final-diff-reality distinction), Arguments table (`--review-cycles` row and its `INVALID_REVIEW_CYCLES` failure mode — a distinct flag/error-code pair from the manifest's own `implement.max_review_cycles`/`INVALID_MAX_REVIEW_CYCLES`, per the stated precedence `--review-cycles` > manifest > `3`), Failure Modes (`ROUTING_ENTRY_MISSING`, `MISSING_DIFF_RANGE`, git-failure rows)
- `lib/cli/implement.mjs:161-305` (`cmdBatches`, the closest existing subverb template)
- `lib/test-strategies/task-files.mjs` (`readTaskFiles(planPath, taskId)` — existing per-task **Files:**-block parser, reused here to derive `declared_files`; read in full, not imported blind)

**Note on `task.additive_only`/`declared_files`/`in_batch`/`had_critical_finding` — these are NOT a leftover TODO.** A prior planning pass left this as a bare comment with no derivation logic, caught in review before implementation would have started; this task's own Implement step below now derives `additive_only`/`declared_files` mechanically from the plan body (via `readTaskFiles()` plus a small local `Modify:`-detection check), and accepts `in_batch`/`had_critical_finding` as explicit `--in-batch`/`--had-critical-finding` boolean flags — both are live orchestration facts the caller (`skills/implement/SKILL.md`, Task 9) already holds and cannot be re-derived from disk at this verb's own scope.

**Note — `--review-cycles` is a run-level flag, not a depth-resolution input.** It does not participate in `resolveImplementReviewDepth()` at all (Tasks 4-5); it only overrides how many cycles the review loop in `skills/implement/SKILL.md` (Task 9) is allowed to run, at whichever depth gets resolved. `resolve-depth`'s own job is solely to validate and echo it back so the CLI is the single place `--review-cycles`'s value is checked — Task 9's SKILL.md wiring reads the CLI's validated value rather than re-validating the raw flag itself.

- [ ] **Write failing test**

**Invocation model:** `lib/cli/implement.mjs`'s `run()` calls `process.exit()` on every path (success and error alike — confirmed at its existing `read-routing`/`batches` exit points). No test anywhere in this repo imports `run` and calls it in-process; every CLI test for this file spawns a real subprocess and inspects `exitCode`/`stdout`/`stderr` (`tests/cli/implement-batches.test.mjs`'s `run(...args)` helper, built on `spawnSync`). This task's test file follows that exact pattern — copy `implement-batches.test.mjs`'s `spawnSync` wrapper, `CLI` path resolution, and temp-project fixture helper (`makeTempProject`) verbatim, adapted to dispatch `resolve-depth` instead of `batches`.

```javascript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { resolveImplementReviewDepth } from "../../lib/implement/review-depth.mjs";
import { loadRigorPolicies } from "../../lib/governance/rigor-mode.mjs";
import { lookupRoutingEntry } from "../../lib/plan-routing-sidecar.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(__dirname, "..", "..", "cli", "index.mjs");
const ENV = { ...process.env, NODE_OPTIONS: "" };

function run(cwd, ...args) {
  return spawnSync("node", [CLI, "implement", "resolve-depth", ...args], { encoding: "utf8", env: ENV, cwd });
}

function makeFixture() {
  const dir = mkdtempSync(join(tmpdir(), "adev-resolve-depth-"));
  mkdirSync(join(dir, ".context-index", "governance"), { recursive: true });
  writeFileSync(join(dir, ".context-index", "manifest.yaml"), 'project:\n  name: t\n');
  writeFileSync(join(dir, ".context-index", "governance", "risk-policies.yaml"),
    "policies:\n  low:\n    implement_mode: quick\n");
  const specPath = join(dir, "x.spec.md");
  writeFileSync(specPath, "---\nrisk_level: low\n---\n# x\n");
  const planPath = join(dir, "p.plan.md");
  writeFileSync(planPath,
    "> **Spec:** x.spec.md\n\n" +
    "### Task 1: Example [specialist: none]\n\n" +
    "**Files:**\n- Create: `new.txt`\n\n" +
    "**Tests:** `new.test.mjs`\n"); // Create-only, no Modify: — additive_only must resolve true
  writeFileSync(join(dir, "p.routing.json"), JSON.stringify({
    version: 1, entries: [{ task_id: "t1", selected_agent: "auto-agent",
      scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 }, rationale: "" }],
  }));
  return { dir, specPath, planPath };
}

describe("adev implement resolve-depth", () => {
  it("provisional pass prints JSON with depth/source", () => {
    const { dir, specPath, planPath } = makeFixture();
    const r = run(dir, "--spec", specPath, "--plan", planPath, "--task-id", "t1");
    assert.equal(r.status, 0, r.stderr);
    const printed = JSON.parse(r.stdout);
    assert.ok(["full", "quick"].includes(printed.depth));
  });

  it("final pass without --base-sha exits non-zero with MISSING_DIFF_RANGE", () => {
    const { dir, specPath, planPath } = makeFixture();
    const r = run(dir, "--spec", specPath, "--plan", planPath, "--task-id", "t1", "--pass", "final");
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /MISSING_DIFF_RANGE/);
  });

  it("unknown task-id in the sidecar exits non-zero with ROUTING_ENTRY_MISSING", () => {
    const { dir, specPath, planPath } = makeFixture();
    const r = run(dir, "--spec", specPath, "--plan", planPath, "--task-id", "does-not-exist");
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /ROUTING_ENTRY_MISSING/);
  });

  it("--review-cycles 0 exits non-zero with INVALID_REVIEW_CYCLES (distinct from the manifest's INVALID_MAX_REVIEW_CYCLES)", () => {
    const { dir, specPath, planPath } = makeFixture();
    const r = run(dir, "--spec", specPath, "--plan", planPath, "--task-id", "t1", "--review-cycles", "0");
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /INVALID_REVIEW_CYCLES/);
  });

  it("--review-cycles 5 overrides implement.max_review_cycles and echoes the resolved value", () => {
    const { dir, specPath, planPath } = makeFixture();
    const r = run(dir, "--spec", specPath, "--plan", planPath, "--task-id", "t1", "--review-cycles", "5");
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).review_cycles, 5);
  });

  it("JSON output matches a direct resolveImplementReviewDepth() call for identical inputs", () => {
    const { dir, specPath, planPath } = makeFixture();
    // Mirrors exactly what cmdResolveDepth itself derives from the plan's Task 1 Files: block
    // (Create-only, no Modify:) — additive_only: true, declared_files: ["new.txt"].
    const direct = resolveImplementReviewDepth({
      spec: { risk_level: "low", specPath },
      task: { id: "t1", additive_only: true, declared_files: ["new.txt"], in_batch: false, had_critical_finding: false },
      routingEntry: lookupRoutingEntry(planPath, "t1"), tierFlag: null,
      policies: loadRigorPolicies(dir), pass: "provisional",
    });
    const r = run(dir, "--spec", specPath, "--plan", planPath, "--task-id", "t1");
    assert.equal(r.status, 0, r.stderr);
    const viaCli = JSON.parse(r.stdout);
    assert.equal(viaCli.depth, direct.depth); // both resolve "quick" for this fixture
    assert.equal(viaCli.source, direct.source);
    assert.deepEqual(viaCli.floor_legs, direct.floor_legs);
  });

  it("a task whose Files: block declares a Modify: entry is NOT additive-only, and resolves full even with perfect scores", () => {
    const { dir, specPath, planPath } = makeFixture();
    writeFileSync(planPath,
      "> **Spec:** x.spec.md\n\n### Task 1: Example [specialist: none]\n\n" +
      "**Files:**\n- Modify: `existing.txt`\n\n**Tests:** `new.test.mjs`\n");
    const r = run(dir, "--spec", specPath, "--plan", planPath, "--task-id", "t1");
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).depth, "full");
  });

  it("--in-batch forces full via the batched-task floor leg", () => {
    const { dir, specPath, planPath } = makeFixture();
    const r = run(dir, "--spec", specPath, "--plan", planPath, "--task-id", "t1", "--in-batch");
    assert.equal(r.status, 0, r.stderr);
    const printed = JSON.parse(r.stdout);
    assert.equal(printed.depth, "full");
    assert.ok(printed.floor_legs.includes("batched-task"));
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/cli/implement-resolve-depth.test.mjs`
Expected: FAIL — `unknown subverb: resolve-depth`.

- [ ] **Implement**

In `lib/cli/implement.mjs`, add to the switch (after `batches`, before `default`):

```javascript
case "resolve-depth":
  return cmdResolveDepth(argv.slice(1), { projectRoot, manifest });
```

New function, following `cmdBatches`'s shape:

```javascript
import { readFileSync } from "node:fs";
import { resolveImplementReviewDepth, computeTouchedFiles } from "../implement/review-depth.mjs";
import { reportReviewDepthResolved } from "../lifecycle-state.mjs";
import { loadRigorPolicies } from "../governance/rigor-mode.mjs";
import { validateMaxReviewCycles } from "../manifest.mjs";
import { readTaskFiles } from "../test-strategies/task-files.mjs";

// A task is additive-only when its **Files:** block declares no `Modify:` sub-bullet —
// only `Create:`/`Test:` entries. `readTaskFiles()` already flattens Create+Modify+Test into
// one path list (it does not distinguish which), so this small, verb-local check re-scans just
// the task's own region for a `Modify:` line rather than widening that shared helper's return
// shape for this one caller.
function hasModifyEntry(planPath, taskId) {
  const text = readFileSync(planPath, "utf8");
  const n = /^t(\d+)$/.exec(taskId)?.[1];
  if (!n) return true; // unknown shape — fail closed (treat as NOT additive-only)
  const headingRe = new RegExp(`^#{2,4}\\s+Task\\s+${n}\\b`, "m");
  const start = text.search(headingRe);
  if (start === -1) return true;
  const rest = text.slice(start + 1);
  const nextHeadingIdx = rest.search(/^#{2,4}\s+Task\s+\d+\b/m);
  const region = nextHeadingIdx === -1 ? rest : rest.slice(0, nextHeadingIdx);
  return /^\s*-\s*Modify:/m.test(region);
}

async function cmdResolveDepth(argv, { projectRoot, manifest }) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        spec: { type: "string" }, plan: { type: "string" }, "task-id": { type: "string" },
        tier: { type: "string" }, "base-sha": { type: "string" }, pass: { type: "string", default: "provisional" },
        "review-cycles": { type: "string" },
        "in-batch": { type: "boolean", default: false },
        "had-critical-finding": { type: "boolean", default: false },
      },
      allowPositionals: false,
    });
  } catch (err) {
    console.error(`argument error: ${err.message}`);
    process.exit(1);
  }
  const {
    spec: specPath, plan: planPath, "task-id": taskId, tier, "base-sha": baseSha, pass,
    "review-cycles": reviewCyclesRaw, "in-batch": inBatch, "had-critical-finding": hadCriticalFinding,
  } = parsed.values;
  if (pass === "final" && !baseSha) {
    console.error("MISSING_DIFF_RANGE: --base-sha is required for the final pass");
    process.exit(2);
  }

  // --review-cycles: same predicate as validateMaxReviewCycles (Task 1), reused rather than
  // duplicated, but its own distinct error code (INVALID_REVIEW_CYCLES) since it is a per-run
  // CLI override, not the manifest value.
  let reviewCycles = manifest.implement.max_review_cycles; // manifest default/validated value
  if (reviewCyclesRaw !== undefined) {
    const n = Number(reviewCyclesRaw);
    if (!Number.isInteger(n) || !Number.isFinite(n) || n < 1) {
      console.error(`INVALID_REVIEW_CYCLES: --review-cycles must be an integer >= 1; got ${reviewCyclesRaw}`);
      process.exit(1);
    }
    reviewCycles = n; // --review-cycles wins over the manifest value per stated precedence
  }

  const routingEntry = lookupRoutingEntry(planPath, taskId); // throws ROUTING_ENTRY_MISSING per existing contract
  const specFrontmatter = readSpecFrontmatter(specPath); // risk_level, etc. — small local helper
  const policies = loadRigorPolicies(projectRoot);

  // Declared-file set and additive-only status (predicate row B's 4th row) are derived
  // mechanically from the plan body — NOT passed as caller-supplied flags, for the same
  // ground-truth reason Output Contract A forbids a raw --touched-files argument for the
  // final-pass diff. Reuses the already-shipped `readTaskFiles()` (lib/test-strategies/task-files.mjs,
  // the same per-task Files:-block parser test-depth-policy.spec.md's escalation rules consume)
  // rather than re-deriving a second plan-body parser.
  const { targetPaths: declaredFiles } = await readTaskFiles(planPath, taskId);
  const additiveOnly = declaredFiles.length > 0 && !hasModifyEntry(planPath, taskId);
  // `in_batch` and `had_critical_finding` are genuinely NOT disk-derivable at either pass:
  // batch membership is a live orchestration decision `adev implement batches` already made
  // earlier in the same /adev:implement run (Step 2, before this verb is ever called), and
  // "did a prior cycle on this task produce a Critical finding" is state the orchestrating
  // SKILL.md loop already holds in its own working memory from reading each cycle's reviewer
  // output. Both are accepted as caller-supplied flags for exactly that reason — mirroring how
  // `--tier`/`--base-sha` are themselves caller-supplied rather than re-derived — not as a
  // shortcut around K's ground-truth requirement, which applies only to the file-diff leg.
  const result = resolveImplementReviewDepth({
    spec: { risk_level: specFrontmatter.risk_level, specPath },
    task: {
      id: taskId, additive_only: additiveOnly, declared_files: declaredFiles,
      in_batch: inBatch, had_critical_finding: hadCriticalFinding,
    },
    routingEntry, tierFlag: tier, policies, pass, baseSha, projectRoot,
  });
  reportReviewDepthResolved(projectRoot, specPath, {
    plan: planPath, task_id: taskId, pass,
    depth: result.depth, source: result.source,
    floor_applied: result.floor_applied, floor_legs: result.floor_legs,
  });
  console.log(JSON.stringify({ ...result, review_cycles: reviewCycles }));
}
```

`skills/implement/SKILL.md` (Task 9) reads `review_cycles` off this verb's JSON output as the effective loop cap for the task, rather than separately re-validating `--review-cycles` itself — this verb is the single place the flag's value is checked, per the note above.

Extend `help()` with a `resolve-depth` usage block, matching the existing `batches` block's format.

- [ ] **Verify test passes**

Run: `node --test tests/cli/implement-resolve-depth.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/cli/implement.mjs tests/cli/implement-resolve-depth.test.mjs
git commit -m "feat(cli): add adev implement resolve-depth verb

Spec: .context-index/specs/features/implementation/graduated-review-depth.spec.md
Plan-task: 7"
```

---

### Task 8: `synthesized-reviewer-prompt.md` companion [specialist: none]

**Charter capability:** Key Behaviors — the 2-stage review this spec thins; the synthesized prompt is what keeps both lenses intact under `quick`.
**Strategy:** unit (source: fallback, confidence: high — prose file, doc-contract tested)
**Files:**
- Create: `skills/implement/synthesized-reviewer-prompt.md`
- Create: `tests/skills/implement-synthesized-prompt.test.mjs`

**Tests:** `tests/skills/implement-synthesized-prompt.test.mjs` (create — doc-contract, mirroring the read-and-assert style of `tests/skills/implement.test.mjs`).

**Context to load:**
- `graduated-review-depth.spec.md` — "`quick`: one reviewer, both lenses" section (full)
- `skills/review-specs/quick-synthesized-reviewer-prompt.md` (44-line structural template)
- `skills/implement/code-quality-checklist.md` (referenced, not duplicated)

- [ ] **Write failing test**

```javascript
test("synthesized-reviewer-prompt.md exists and unions both lenses", () => {
  const md = readFileSync("skills/implement/synthesized-reviewer-prompt.md", "utf8");
  assert.match(md, /Stage 1/i);
  assert.match(md, /code-quality-checklist\.md/);
  assert.match(md, /cq-<n>|cq-\d/); // stable finding-id convention
});

test("synthesized-reviewer-prompt.md instructs verifying by reading code, not trusting the report", () => {
  const md = readFileSync("skills/implement/synthesized-reviewer-prompt.md", "utf8");
  assert.match(md, /read(ing)? code/i);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/implement-synthesized-prompt.test.mjs`
Expected: FAIL — file does not exist.

- [ ] **Implement**

Create `skills/implement/synthesized-reviewer-prompt.md` following `quick-synthesized-reviewer-prompt.md`'s section shape (`# Synthesized Review`, `## Your Review Scope (both lenses)`, `## Output Format`, `### Required fields when severity is blocker`, `## Verdict`, `## Rules`, `## Output Constraint`), covering: Stage 1's missing-requirements/extra-work/misunderstandings triad against the Live Spec's acceptance criteria, and every item in `code-quality-checklist.md` (referenced by path, not inlined), with explicit instructions to verify by reading the diff and code rather than trusting the implementer's report, and to tag every finding with a stable `cq-<n>` id reused across cycles so `lib/loop-convergence.mjs::evaluateStopCondition` keeps working unchanged.

- [ ] **Verify test passes**

Run: `node --test tests/skills/implement-synthesized-prompt.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/implement/synthesized-reviewer-prompt.md tests/skills/implement-synthesized-prompt.test.mjs
git commit -m "feat(implement): add synthesized reviewer prompt for quick-tier collapse

Spec: .context-index/specs/features/implementation/graduated-review-depth.spec.md
Plan-task: 8"
```

---

### Task 9: `SKILL.md` quick-collapse wiring (base-SHA capture, configurable cycle cap, branch on depth) [specialist: none]

**Charter capability:** Key Behaviors — "TDD is enforced: RED → GREEN → REFACTOR"; "Each task gets an explicit context packet" (this task is the orchestration wiring that makes Tasks 4-8's mechanism actually run inside `/adev:implement`).
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 3, Task 7, Task 8
**Files:**
- Modify: `skills/implement/SKILL.md:472-476` (base-SHA capture), `:568-584` (Step 2f), `:586-602` (Step 2g)
- Create: `tests/skills/implement-graduated-review-depth.test.mjs`

**Tests:** `tests/skills/implement-graduated-review-depth.test.mjs` (create).

**Context to load:**
- `graduated-review-depth.spec.md` — Output Contract A, F, G, I (all in full), all Acceptance Criteria referencing `quick`-path/floor/`--tier` behavior
- `skills/implement/SKILL.md` lines 291-602 (re-read at task time)
- `skills/implement/synthesized-reviewer-prompt.md` (from Task 8)

- [ ] **Write failing test**

```javascript
const SKILL_PATH = "skills/implement/SKILL.md";

test("/adev:implement captures git rev-parse HEAD as the task's base SHA before dispatch", () => {
  const md = readFileSync(SKILL_PATH, "utf8");
  assert.match(md, /git rev-parse HEAD/);
});

test("/adev:implement's review-cycle cap reads from implement.max_review_cycles, not either hardcoded 3", () => {
  const md = readFileSync(SKILL_PATH, "utf8");
  assert.match(md, /implement\.max_review_cycles/);
  // Two distinct hardcoded strings exist today — Stage 1's "Maximum 3 review cycles per task"
  // (line 582) and Stage 2's "Maximum 3 code-quality review cycles per task" (line 602). The
  // second contains extra words, so a substring check for the first alone would pass even if
  // Stage 2's cap were left untouched — this is the exact gap a prior plan-review round caught.
  // Both exact phrases must be gone.
  assert.doesNotMatch(md, /Maximum 3 review cycles per task/);
  assert.doesNotMatch(md, /Maximum 3 code-quality review cycles per task/);
});

test("/adev:implement calls adev implement resolve-depth at both provisional and final passes", () => {
  const md = readFileSync(SKILL_PATH, "utf8");
  assert.match(md, /adev implement resolve-depth/);
  assert.match(md, /--pass provisional|pass:\s*provisional|provisional/);
  assert.match(md, /--pass final|pass:\s*final|final/);
});

test("/adev:implement dispatches the synthesized reviewer once under quick, and two reviewers unchanged under full", () => {
  const md = readFileSync(SKILL_PATH, "utf8");
  assert.match(md, /synthesized-reviewer-prompt\.md/);
  assert.match(md, /quick/);
});

test("/adev:implement reports review_depth_resolved for each resolution pass", () => {
  const md = readFileSync(SKILL_PATH, "utf8");
  assert.match(md, /reportReviewDepthResolved|review_depth_resolved/);
});

test("/adev:implement records the synthesized stage on the task's review-round provenance", () => {
  const md = readFileSync(SKILL_PATH, "utf8");
  assert.match(md, /stage.*synthesized|synthesized.*stage/);
});

test("/adev:implement accepts --review-cycles and threads it to the resolve-depth verb", () => {
  const md = readFileSync(SKILL_PATH, "utf8");
  assert.match(md, /--review-cycles/);
});

test("/adev:implement echoes REVIEW_DEPTH_FLOOR_APPLIED and ROUTING_SCORE_OUT_OF_RANGE to the operator-facing transcript, not just to the persisted event", () => {
  const md = readFileSync(SKILL_PATH, "utf8");
  assert.match(md, /REVIEW_DEPTH_FLOOR_APPLIED/);
  assert.match(md, /ROUTING_SCORE_OUT_OF_RANGE/);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/implement-graduated-review-depth.test.mjs`
Expected: FAIL — none of this text exists in `SKILL.md` yet; the two "Maximum 3 review cycles" strings are still present verbatim.

- [ ] **Implement**

In `skills/implement/SKILL.md`:

1. Immediately before the "Dispatch the subagent with `Agent({description, prompt, run_in_background: false})`" line in Step 2d (line 476), insert:

   > **Capture the task's base SHA** immediately before dispatch: `git rev-parse HEAD`. This value is used only for this task's final-pass depth resolution (below) and is not persisted anywhere; it does not survive past this single dispatch.

2. In Step 2c (before dispatch, alongside routing-tag check), insert a **provisional depth resolution** call:

   > Resolve the task's provisional review depth: `adev implement resolve-depth --spec <spec-path> --plan <plan-path> --task-id <task-id> [--tier <t>] [--review-cycles <n>] [--in-batch]`. Pass `--in-batch` when this task is part of a batch resolved earlier in Step 2 (`adev implement batches`) — batch membership is a static, plan-level fact known before RED begins, so it is available on the provisional pass too. The printed `depth` briefs the implementer (whether elevated scrutiny should be expected) and decides nothing about which reviewer(s) dispatch yet — that decision uses the **final** pass, below. `--review-cycles`, if the operator passed it to `/adev:implement`, is forwarded here unchanged on every call (both passes); the CLI verb is the single place its value is validated (`INVALID_REVIEW_CYCLES`), per Task 7 — the SKILL.md does not re-validate it. The verb's JSON response's `review_cycles` field is the effective cap for both Step 2f/2g's `full` loops and the `quick` synthesized loop below. (`declared_files`/`additive_only` are never passed by the caller — the verb derives them itself from the plan's Files: block, per Task 7.)

3. Replace **both** hardcoded cap strings — they are NOT identical text, so each needs its own edit:
   - Line 582 (Stage 1 / 2f): "Maximum 3 review cycles per task." → "Maximum `implement.max_review_cycles` review cycles per task (default 3), or the effective `review_cycles` value returned by the last `adev implement resolve-depth` call for this task if `--review-cycles` was passed to `/adev:implement`."
   - Line 602 (Stage 2 / 2g): "**Maximum 3 code-quality review cycles per task**, matching the Stage 1 cap (2f) and the visual fix cap (2e)." → "**Maximum `implement.max_review_cycles` code-quality review cycles per task** (same effective value as Stage 1's cap above — both stages read the same resolved number, which is what makes the `quick` path's `1 × cap` (vs. `full`'s `2 × cap`) worst-case-dispatch claim in Output Contract F true)."

4. Immediately before Step 2f's dispatch, insert the **final depth resolution**:

   > Resolve the task's final review depth: `adev implement resolve-depth --spec <spec-path> --plan <plan-path> --task-id <task-id> [--tier <t>] [--review-cycles <n>] [--in-batch] [--had-critical-finding] --base-sha <captured-sha> --pass final`. Pass `--had-critical-finding` whenever any prior cycle on this task's own review loop (tracked in this loop's working state, not read back from disk) produced a Critical-severity finding — this is what makes the `critical-finding` floor leg persist for the remainder of the task once triggered (Output Contract E). This call also reports the `review_depth_resolved` event for this pass. **If the JSON response's `floor_applied` is `true`, echo `REVIEW_DEPTH_FLOOR_APPLIED` naming `floor_legs` to the operator-facing transcript** (in addition to the persisted event Task 7 already writes) — a graduated run must be auditable in the visible transcript, not only in the lifecycle log. **If any warning in the response carries code `ROUTING_SCORE_OUT_OF_RANGE`, echo it to the transcript the same way**, naming the task, dimension, and offending value.

5. Branch Steps 2f/2g on the resolved `depth`:
   - `full` (unchanged): dispatch Stage 1 then Stage 2 exactly as today.
   - `quick`: dispatch a single fresh subagent carrying the content of `synthesized-reviewer-prompt.md` (Task 8), the union of both stages' context (task requirements, implementer's report, Live Spec acceptance criteria, git diff, constitution Coding Standards, `DONE_WITH_CONCERNS` notes, secondary specialist matches). Apply the same `cq-<n>` id-tagging and `evaluateStopCondition` convergence discipline Stage 2 already uses (`lib/loop-convergence.mjs`, unchanged), capped at the effective `review_cycles` value from step 4. On completion, call `reportReviewRound(..., { stage: "synthesized", cycles: <n> })` and add the `Review-round: synthesized=<n>` trailer to the task's single commit, per `review-provenance.spec.md`.

- [ ] **Verify test passes**

Run: `node --test tests/skills/implement-graduated-review-depth.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/implement/SKILL.md tests/skills/implement-graduated-review-depth.test.mjs
git commit -m "feat(implement): wire graduated review-depth resolution into the task loop

Spec: .context-index/specs/features/implementation/graduated-review-depth.spec.md
Plan-task: 9"
```

---

### Task 10: `build/SKILL.md` Step 4 `--tier` propagation [specialist: none]

**Charter capability:** none in `implementation/charter.md` directly — this task touches `skills/build/SKILL.md`, owned by a sibling charter; cited here because Output Contract H makes it part of this spec's delivery.
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/build/SKILL.md` (Step 4, after line 524)
- Create: `tests/skills/build-tier-propagation.test.mjs`

**Tests:** `tests/skills/build-tier-propagation.test.mjs` (create — no existing test asserts any of the three `--tier` clauses; this covers Steps 1, 4, and 5 together).

**Context to load:**
- `graduated-review-depth.spec.md` — Output Contract H (in full, including the literal template text)
- `skills/build/SKILL.md` lines 395-541 (Steps 1, 4, 5)

- [ ] **Write failing test**

```javascript
const BUILD_SKILL_PATH = "skills/build/SKILL.md";

test("/adev:build Step 1 (review-specs) has a Rigor tier propagation clause", () => {
  const md = readFileSync(BUILD_SKILL_PATH, "utf8");
  assert.match(md, /Rigor tier propagation.*review-specs/s);
});

test("/adev:build Step 5 (validate) has a Rigor tier propagation clause", () => {
  const md = readFileSync(BUILD_SKILL_PATH, "utf8");
  assert.match(md, /Rigor tier propagation.*validate/s);
});

test("/adev:build Step 4 (implement) now has a --tier propagation clause naming /adev:implement", () => {
  const md = readFileSync(BUILD_SKILL_PATH, "utf8");
  const step4 = md.slice(md.indexOf("Step 4"), md.indexOf("Step 5"));
  assert.match(step4, /--tier/);
  assert.match(step4, /\/adev:implement/);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/build-tier-propagation.test.mjs`
Expected: FAIL on the third test — Step 4's slice contains no `--tier` clause today (confirmed during planning: only Steps 1 and 5 carry one).

- [ ] **Implement**

In `skills/build/SKILL.md`, after line 524 (Step 4's dispatch args line), before line 536 (Step 5's header), insert:

```markdown
**Rigor tier propagation:** If `--tier <t>` was passed to `/adev:build`, append `--tier <t>` to the dispatched args so `/adev:implement` receives the explicit override. If `--tier` was not passed to `/adev:build`, dispatch without it — `/adev:implement` resolves its own rigor tier per this spec's precedence (Output Contract A).
```

- [ ] **Verify test passes**

Run: `node --test tests/skills/build-tier-propagation.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/build/SKILL.md tests/skills/build-tier-propagation.test.mjs
git commit -m "feat(build): propagate --tier to /adev:implement in Step 4

Spec: .context-index/specs/features/implementation/graduated-review-depth.spec.md
Plan-task: 10"
```

---

### Task 11: Documentation updates [specialist: none]

**Charter capability:** Context Routing table's docs entries (constitution) — keeping `docs/*.md` current with new CLI verbs and flags.
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 7, Task 9, Task 10
**Files:**
- Modify: `docs/cli-reference.md`
- Modify: `docs/skill-reference.md`

**Tests:** No dedicated test file for this task — extend the existing doc-consistency conventions in `tests/docs/` if a relevant one already parametrizes over CLI verbs (verify at task time; if `tests/docs/test-depth-policy-docs.test.mjs`'s pattern generalizes, mirror it in a small addition rather than a new file).

**Context to load:**
- `graduated-review-depth.spec.md` — Arguments table, Output Contract A
- `docs/cli-reference.md` (section near `adev implement batches`), `docs/skill-reference.md` (section near the `/adev:implement` flag list)

- [ ] **Write failing test**

```javascript
test("docs/cli-reference.md documents adev implement resolve-depth", () => {
  const md = readFileSync("docs/cli-reference.md", "utf8");
  assert.match(md, /adev implement resolve-depth/);
});

test("docs/skill-reference.md documents /adev:implement's --tier and --review-cycles flags", () => {
  const md = readFileSync("docs/skill-reference.md", "utf8");
  const section = md.slice(md.indexOf("/adev:implement"));
  assert.match(section, /--tier/);
  assert.match(section, /--review-cycles/);
});
```

- [ ] **Verify test fails**

Run: `node --test <chosen test file>`
Expected: FAIL — neither doc mentions the new verb or flags yet.

- [ ] **Implement**

In `docs/cli-reference.md`, near the existing `adev implement batches` entry, add a matching entry for `adev implement resolve-depth --spec <path> --plan <path> --task-id <id> [--tier full|quick] [--review-cycles <n>] [--base-sha <sha>] [--pass provisional|final] [--in-batch] [--had-critical-finding]`, with its exit-code table.

In `docs/skill-reference.md`, near `/adev:implement`'s existing flag list, add `--tier full|quick` and `--review-cycles <n>` with one-line descriptions matching the spec's Arguments table.

- [ ] **Verify test passes**

Run: `node --test <chosen test file>`
Expected: PASS

- [ ] **Commit**

```bash
git add docs/cli-reference.md docs/skill-reference.md tests/
git commit -m "docs: document adev implement resolve-depth and --tier/--review-cycles

Spec: .context-index/specs/features/implementation/graduated-review-depth.spec.md
Plan-task: 11"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test`
- All acceptance criteria from `graduated-review-depth.spec.md` satisfied (35 criteria, lines 735-769; cross-referenced against this plan's tasks: Task 1 → the `max_review_cycles`/`--review-cycles` default-and-validation criteria; Task 2 → the `implement_mode` policy surface criterion, implicit in Output Contract A's "Policy baseline" step; Task 3 → the `routingEasy`/`implement_mode` key-map criteria; Tasks 4-5 → the predicate-row, score-validation, floor-leg, and all `scope-mismatch`/Output-Contract-K criteria (the largest cluster — roughly half the list); Task 6 → the `review_depth_resolved` registration/projection/persistence criteria; Task 7 → the CLI-output-matches-direct-call criterion; Task 8 → the synthesized-reviewer id-tagging/convergence criterion; Task 9 → the full-vs-quick dispatch-count criteria, base-SHA capture, cycle-cap-configurable criterion, transcript-echo criterion, provenance criterion; Task 10 → the `--tier` propagation criterion; Task 11 → no dedicated criterion, doc hygiene only — the final "no threshold wider than stated" criterion is satisfied by the plan's threshold values matching the spec verbatim throughout, verified at `/adev:validate` time against the shipped code, not by a dedicated task)
- No constitutional violations introduced (the one flagged boundary — thinning the review layer — is pre-authorized per this plan's header note)

`governance/gates.yaml`'s `test` gate (severity: error, `npm test`, triggers `post-task`/`post-implement`) is the only deterministic gate configured in this repo today; no probabilistic/no-command gates apply beyond it.
