# Implementation Plan: Equivalence Eval

> **Methodology:** adev
> **Charter:** .context-index/specs/features/worktree-parallelization/charter.md
> **Spec:** .context-index/specs/features/worktree-parallelization/equivalence-eval.spec.md
> **Review:** PASS_WITH_NOTES (2026-07-08) — rev 2 folded in SA-1..SA-4 (control arm, coverage/determinism, reframed overlap, sub-codes)
> **Platform:** Node.js (ESM, .mjs), zero-dependency, node:test

**Goal:** Build the A/B equivalence eval that proves `--parallel ≡ serial` — the load-bearing ship gate — as pure, unit-tested comparator/state/report helpers plus a live 3-arm harness.

**Architecture:** The `[pure]` helpers (divergence comparator, state checks, report/scoring) are deterministic, computed from git + plan artifacts, and fully TDD-unit-tested under `lib/parallel/eval/`. The `[live]` harness (`run-ab-eval.mjs`) orchestrates three real agent runs (serial-A, serial-B control, parallel) from clean checkouts and feeds their captured signals through the pure helpers; it is exercised end-to-end, not by a unit test (per spec [pure]/[live] split, SA-6). The fixture is a static spec+plan with ≥2 disjoint `independent` groups + 1 `sequential` group.

---

## File Structure

**Create:**
- `lib/parallel/eval/divergence.mjs` — behavioral divergence (test-set + public-surface signals), determinism gate, `divergence_kind` `[pure]`
- `lib/parallel/eval/state-check.mjs` — group-selection assertion + success-scoped orphaned-state scan `[pure]`
- `lib/parallel/eval/report.mjs` — results renderer (`eval-<date>.md` + `last-run.json`) + rubric Layer-1/3 scoring `[pure]`
- `tests/lib/parallel/eval/divergence.test.mjs`, `state-check.test.mjs`, `report.test.mjs`
- `tests/evals/worktree-parallelization/run-ab-eval.mjs` — the 3-arm live harness `[live]`
- `tests/evals/worktree-parallelization/fixture/` — the fixture spec + plan (deterministic, task-covering)

**Reference (read, do not modify):**
- `tests/evals/token-optimization/run-ab-eval.mjs` — A/B harness pattern (clean-checkout worktree, session-JSONL token capture)
- `tests/evals/worktree-parallelization/rubrics/parallel-implement.yaml` — Layer-1/3 rubric to score against
- `lib/parallel/*` — the feature under test (groups/config/verify/baseline)

## Parallelization

- Group A (independent): Task 2 — `lib/parallel/eval/divergence.mjs` (+test)
- Group B (independent): Task 3 — `lib/parallel/eval/state-check.mjs` (+test)
- Group C (independent): Task 5+6 — `lib/parallel/eval/report.mjs` (+test)
- Group D (sequential): Task 1 → Task 4 — fixture, then the live harness that consumes the fixture + all helpers (shared wiring)

Groups A–C are file-disjoint `[pure]` units (parallelizable). Group D is `[live]`/sequential.

## Task Summary

| # | Title | Kind | Complexity | Strategy | Depends On | Files |
|---|-------|------|-----------|----------|------------|-------|
| 2 | divergence comparator + determinism gate | pure | M | unit | — | 2 create |
| 3 | group-selection + orphaned-state checks | pure | M | unit | — | 2 create |
| 5+6 | results renderer + rubric scoring | pure | M | unit | — | 2 create |
| 1 | deterministic fixture (spec+plan, disjoint+sequential groups) | pure | S | unit | — | fixture dir |
| 4 | 3-arm live harness (run-ab-eval.mjs) | live | L | — | 1,2,3,5 | 1 create |

---

## Task Structure

### Task 2: divergence comparator + determinism gate `[pure]`
**Charter capability:** equivalence-eval
**Files:** Create `lib/parallel/eval/divergence.mjs`, `tests/lib/parallel/eval/divergence.test.mjs`
**Tests:** `tests/lib/parallel/eval/divergence.test.mjs`

- [ ] **Write failing test** — `testSetDivergence(a, b)` and `surfaceDivergence(a, b)` return the symmetric delta; `judge({ serialA, serialB, parallel })` returns `{ verdict: 'equivalent'|'not_equivalent'|'inconclusive', divergence_kind?: 'tests'|'surface', delta? }`: INCONCLUSIVE when `d_ctrl` non-empty; `equivalent` only when `d_ctrl` empty AND `d_par` empty on both signals; else `not_equivalent` with `divergence_kind`.
- [ ] **Verify test fails** · **Implement** (pure set logic) · **Verify test passes**
- [ ] **Commit** — `feat(worktree): equivalence divergence comparator + determinism gate` (branch `feat/adev-worktrees`)

### Task 3: group-selection + orphaned-state checks `[pure]`
**Charter capability:** equivalence-eval, merge-back-semantics
**Files:** Create `lib/parallel/eval/state-check.mjs`, `tests/lib/parallel/eval/state-check.test.mjs`
**Tests:** `tests/lib/parallel/eval/state-check.test.mjs`

- [ ] **Write failing test** (temp git repo) — `assertGroupSelection({ independentGroups, sequentialGroups, worktrees })` throws `OVERLAP_PARALLELIZED` when a sequential group has a worktree, passes otherwise; `scanOrphanedState(cwd)` returns leftover `.adev/worktrees/` + dangling `adev/*` branches + stale lock; on all-success it must be empty (`ORPHANED_STATE` when not).
- [ ] **Verify fails · Implement · Verify passes**
- [ ] **Commit** — `feat(worktree): eval group-selection + orphaned-state checks`

### Task 5+6: results renderer + rubric scoring `[pure]`
**Charter capability:** equivalence-eval
**Files:** Create `lib/parallel/eval/report.mjs`, `tests/lib/parallel/eval/report.test.mjs`
**Tests:** `tests/lib/parallel/eval/report.test.mjs`

- [ ] **Write failing test** — `renderReport(runData)` produces the markdown (`equivalent`/`INCONCLUSIVE`, `d_par` vs `d_ctrl`, per-arm sets, wall-clock/token WARN, advisory diff) + a `last-run.json` object; `scoreRubric(rubric, runData)` computes Layer-1 (required_elements) + Layer-3 (quality_dimensions incl. `result_equivalence`) 50/50.
- [ ] **Verify fails · Implement · Verify passes**
- [ ] **Commit** — `feat(worktree): eval results renderer + rubric scoring`

### Task 1: deterministic fixture `[pure]`
**Charter capability:** equivalence-eval
**Files:** Create `tests/evals/worktree-parallelization/fixture/` (a small spec + plan with ≥2 `independent` groups + 1 `sequential` group; a deterministic, task-covering test suite)
**Tests:** the fixture's own suite is deterministic (order-independent); a meta-test asserts the fixture plan parses into the expected group shape via `lib/parallel/groups.mjs`.

- [ ] **Write failing test** — meta-test: `parseParallelizationSection(fixturePlan)` yields ≥2 independent + 1 sequential group.
- [ ] **Verify fails · Create fixture · Verify passes**
- [ ] **Commit** — `test(worktree): equivalence-eval fixture (disjoint + sequential groups)`

### Task 4: 3-arm live harness `[live]`
**Charter capability:** equivalence-eval
**Depends on:** Task 1, 2, 3, 5
**Files:** Create `tests/evals/worktree-parallelization/run-ab-eval.mjs`
**Tests:** a smoke test asserts the harness wiring (arm setup, helper invocation, report emission) without a full agent run; the end-to-end 3-arm run is `[live]` (documented invocation), not a unit test.

- [ ] **Write failing test** — smoke: `run-ab-eval.mjs --dry-run` prints the 3-arm plan + which helpers it calls, exits 0, writes no results.
- [ ] **Verify fails · Implement** — mirror `token-optimization/run-ab-eval.mjs`: clean-checkout worktree per arm, run serial-A / serial-B / parallel, capture test set + surface + wall-clock + tokens (session JSONL), re-run-to-confirm on candidate divergence, feed through Task 2/3/5 helpers. **Verify smoke passes**
- [ ] **Commit** — `feat(worktree): 3-arm equivalence eval harness (run-ab-eval)`

---

## Quality Gates

- Tests pass: `npm test` (all new `lib/parallel/eval/*` + fixture meta + harness smoke tests green; full suite stays green).
- All spec acceptance criteria satisfied; the `[pure]` tasks are unit-tested, the `[live]` arm is exercised end-to-end by the harness.
- No constitutional violations (zero-dep, ESM). The `[live]` run is the actual ship gate for `--parallel`.
