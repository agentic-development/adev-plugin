---
charter: worktree-parallelization
kind: behavioral
status: validated
milestone: v1
revision: 2
charter-revision: 2
created: 2026-07-08
updated: 2026-07-08
source-manifest:
  sha: "dd75314"
  files:
    - lib/parallel/eval/divergence.mjs
    - lib/parallel/eval/report.mjs
    - lib/parallel/eval/state-check.mjs
    - tests/evals/worktree-parallelization/fixture/example.plan.md
    - tests/evals/worktree-parallelization/run-ab-eval.mjs
    - tests/evals/worktree-parallelization/run-ab-eval.smoke.test.mjs
    - tests/lib/parallel/eval/divergence.test.mjs
    - tests/lib/parallel/eval/fixture.test.mjs
    - tests/lib/parallel/eval/report.test.mjs
    - tests/lib/parallel/eval/state-check.test.mjs
  computed-at: "2026-07-08T11:17:20.645Z"
---

# Live Spec: Equivalence Eval

<!-- Standard mode. The A/B equivalence eval that is the LOAD-BEARING correctness
     gate for /adev:implement --parallel. Covers charter capability: equivalence-eval.
     rev 2: folds in review warnings SA-1..SA-4 (+ SA-5/6/7, CON-2). Builds on the
     adev 4-layer eval design + tests/evals/worktree-parallelization/ TEST-PLAN.md
     + rubrics/parallel-implement.yaml. -->

## Behavioral Contract

The equivalence eval proves the property the feature rests on: **a `--parallel` run of a plan
produces a result behaviorally identical to a serial run of the same plan.** Parallel execution may
change wall-clock; it may not change the *result*. The runtime checks in `parallel-implement.spec.md`
(`ORCHESTRATOR_POLLUTED`, `COMMITS_NOT_VERIFIED`) are fail-fast sanity gates, not proofs of
isolation — so this eval is the actual correctness gate: `--parallel` is not shippable until it
passes.

### Equivalence is BEHAVIORAL, measured against a noise floor (SA-2)

Both arms are **live agent runs**; two independent LLM implementations of the same plan differ in
naming and structure even serial-vs-serial. Textual diff is therefore *not* a valid equivalence
signal. Equivalence is judged on two **behavioral** signals only:
1. **Same tests pass** — the pass/fail set of the fixture suite is identical.
2. **Same public surface** — the set of exported symbols / CLI verbs / created files is identical.

To separate parallelism-induced divergence from ordinary LLM variance, the eval runs a **third
control arm — serial run B** — as a **determinism gate**:
- `d_ctrl = divergence(serialB, serialA)` on the behavioral signals is computed first. If it is
  **non-empty**, two independent *serial* runs already disagree — the fixture is not deterministic
  enough to judge parallelism, and the eval is **INCONCLUSIVE** (neither pass nor fail).
- Only when `d_ctrl` is empty (the fixture is behaviorally deterministic) does the eval judge the
  parallel arm, and then it requires an **exact behavioral match**: `d_par = divergence(parallel,
  serialA)` must be **empty** on both signals. (Formally `d_par ⊆ d_ctrl`, which — since a valid
  judgement requires `d_ctrl = ∅` — reduces to `d_par = ∅`. The control arm grants no tolerance
  band; it gates *whether* a verdict is meaningful, not *how much* slack the parallel arm gets.)
- The textual impl diff is captured and reported for human context only — it is **advisory, never a
  gate**.

### Behaviors

- **When** the eval runs **then** it executes the fixture plan three times from identical clean
  checkouts of the same base commit: **serial-A** (baseline), **serial-B** (control), and
  **parallel** (variant via `/adev:implement --parallel`); capturing for each: the fixture test
  pass/fail set, the exported public surface, wall-clock, token cost (from session JSONL), and the
  set of adev worktrees/branches created.
- **When** the arms are compared **then** the eval first checks the determinism gate (`d_ctrl`
  empty on both signals); only if the fixture is deterministic does it report `equivalent: true`
  iff `d_par = divergence(parallel, serialA)` is empty on BOTH signals, otherwise `equivalent:
  false` with a `divergence_kind` of `tests` or `surface` (SA-7) naming the specific delta.
- **When** `d_ctrl` is non-empty on either signal **then** the fixture is non-deterministic; the eval
  reports `INCONCLUSIVE` and does not declare a parallel pass or failure (SA-4).
- **When** a candidate `NOT_EQUIVALENT` is detected **then** the eval re-runs the divergent arm once
  to confirm before declaring failure (guards against a single flaky/order-dependent test; SA-4).
- **When** the fixture plan is constructed **then** it MUST contain a group the plan marked
  **sequential** (file-overlapping) alongside ≥2 `independent` groups; the eval asserts `--parallel`
  created worktrees **only** for the `independent` groups and ran the sequential group in the serial
  lane (no `adev/<slug>-<seq>` worktree/branch). This tests `--parallel`'s actual group-*selection*
  behavior — it does not assume `--parallel` re-checks disjointness (that is `/adev:plan`'s job;
  SA-3).
- **When** the parallel arm completes with **all groups succeeding** **then** the eval asserts 0
  orphaned state: no leftover `.adev/worktrees/` entries, no dangling `adev/*` branches, no stale
  `tasks.json.lock`. Retained worktrees after a *failed* group are by-design (per
  parallel-implement.spec.md) and are NOT counted as orphaned (SA-5).
- **When** wall-clock and cost are compared **then** the eval records `t_parallel < t_serialA` and
  `tokens_parallel ≤ 1.15 × tokens_serialA` — **WARN only, never a hard fail** (equivalence is the
  hard gate; the charter's Performance attribute is advisory here — CON-2).
- **When** scored on the 4-layer harness **then**: Layer 1 = the fixture suite + the eval's own unit
  tests pass; Layer 3 = the rubric's `result_equivalence` dimension (prime) + merge-ordering +
  failure-semantics + no-orphaned-state (rubric supplies Layers 1 & 3 at 50/50; Layers 2 & 4 come
  from `/adev:eval` — CON-3).
- **When** `equivalent: false` (confirmed on re-run) **then** the eval exits non-zero and `--parallel`
  is not shippable — the `divergence_kind` + delta is the blocker.

## Preconditions

- The worktree primitive and `/adev:implement --parallel` are implemented (this eval verifies them).
- **Fixture coverage (SA-1):** the fixture suite's tests cover each plan task's behavior — otherwise
  "same tests pass" is vacuous and the gate proves little.
- **Fixture determinism (SA-4):** the fixture suite is order-independent and deterministic; the
  serial-B control arm exists precisely to detect when this precondition is violated.
- The fixture plan has ≥2 file-disjoint `independent` groups AND one `sequential` (overlapping) group.
- Each arm runs from a fresh checkout/worktree of the same base commit; clean git state.
- Token measurement reads real session JSONL (`message.usage`), never byte-size estimates.

## Postconditions

- A results artifact at `tests/evals/worktree-parallelization/results/eval-<date>.md` (+
  `results/last-run.json`) records: `equivalent` (or `INCONCLUSIVE`), the noise-floor comparison
  (`d_par` vs `d_ctrl`) per signal, per-arm test sets + public surface, the advisory impl diff,
  wall-clock, token cost, the group-selection assertion, and (on full success) the orphaned-state
  check.
- On `equivalent: true` + deterministic fixture + 0 orphaned state (full success): the eval passes;
  the prime ship gate is green.
- On confirmed divergence: non-zero exit; the artifact names the `divergence_kind` and delta.

## Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Parallel diverges beyond the serial noise floor on the test set (confirmed on re-run) | Fail | `NOT_EQUIVALENT` (`divergence_kind: tests`) |
| Parallel diverges beyond the noise floor on the public surface | Fail | `NOT_EQUIVALENT` (`divergence_kind: surface`) |
| Serial-B vs serial-A already diverges (non-deterministic fixture) | Inconclusive; not a parallel pass/fail | `INCONCLUSIVE` |
| `--parallel` created a worktree for a sequential (overlapping) group | Fail — parallelized file-overlapping work | `OVERLAP_PARALLELIZED` |
| After an all-success parallel run, a worktree / `adev/*` branch / lock remains | Fail | `ORPHANED_STATE` |
| `t_parallel ≥ t_serialA` or `tokens_parallel > 1.15×` | WARN (recorded, not a hard failure) | (advisory) |
| Impl diff non-empty | Recorded for human context | (advisory, never a gate) |

## System Constitution Reference

- **Principle 1 (minimize dependencies)** — ✓ Node built-ins + git only, mirroring `run-ab-eval.mjs`.
- **Principle 3 (pure ESM)** — ✓ `.mjs` harness.
- **Heuristic: token measurement from session JSONL, not byte estimates** — the cost arm parses real
  `message.usage` fields.
- **Charter Quality Attribute (Correctness/equivalence is the prime ship gate)** — operationalized
  here; the charter's Performance attribute is advisory in this eval (WARN), not a blocker (CON-2).

## Actionable Task Map

<!-- Preliminary — /adev:plan owns the full decomposition.
     [pure] = deterministically unit-testable from git/plan artifacts (TDD).
     [live] = requires a live agent run; verified by the harness end-to-end, not a unit test (SA-6). -->

| Task | Description | Kind | Complexity |
|------|-------------|------|------------|
| 1 | Fixture: spec + plan with ≥2 disjoint `independent` groups + 1 `sequential` overlapping group; deterministic, task-covering test suite | [pure] | S |
| 2 | Divergence comparator: test-set + public-surface signals; `d_par ⊆ d_ctrl` noise-floor logic; `divergence_kind` | [pure] | M |
| 3 | Group-selection assertion (only independent groups get worktrees) + success-scoped orphaned-state scan | [pure] | M |
| 4 | `run-ab-eval.mjs`: run serial-A / serial-B / parallel arms from clean checkouts; capture signals + wall-clock + tokens; re-run-to-confirm on candidate divergence | [live] | L |
| 5 | Results renderer → `results/eval-<date>.md` + `last-run.json` (token-optimization format) | [pure] | S |
| 6 | Wire rubric (`rubrics/parallel-implement.yaml`) Layer-1/Layer-3 scoring into the report | [pure] | M |

## Acceptance Criteria

- [ ] Runs three arms (serial-A, serial-B control, parallel) from identical clean checkouts.
- [ ] Judges equivalence on behavioral signals only (test set + public surface); impl diff is advisory.
- [ ] `equivalent` iff parallel diverges no more than the serial-vs-serial noise floor on both signals.
- [ ] A non-deterministic fixture (non-empty control divergence) yields `INCONCLUSIVE`, not a false fail.
- [ ] Re-runs the divergent arm once to confirm before declaring `NOT_EQUIVALENT`.
- [ ] Asserts `--parallel` worktrees only `independent` groups; a sequential group runs serial (`OVERLAP_PARALLELIZED`).
- [ ] Asserts 0 orphaned state **on all-success runs only** (retained-on-failure worktrees are by design).
- [ ] `NOT_EQUIVALENT` carries a `divergence_kind` (`tests` | `surface`).
- [ ] Records wall-clock + token cost (from session JSONL) as WARN gates, not hard fails.
- [ ] Writes the results artifact + `last-run.json`; scores on the 4-layer harness (rubric = Layers 1 & 3).
- [ ] `equivalent: false` (confirmed) exits non-zero and blocks shipping `--parallel`.
- [ ] The [pure] tasks are unit-tested (TDD); the [live] arm is exercised end-to-end by the harness.
- [ ] All quality gates pass; no constitutional violations.
