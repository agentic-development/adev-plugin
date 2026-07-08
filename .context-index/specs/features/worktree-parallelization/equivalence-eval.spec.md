---
charter: worktree-parallelization
kind: behavioral
status: review-pending
milestone: v1
revision: 1
charter-revision: 2
created: 2026-07-08
updated: 2026-07-08
---

# Live Spec: Equivalence Eval

<!-- Standard mode. Defines the A/B equivalence eval that is the LOAD-BEARING
     correctness gate for /adev:implement --parallel (parallel-implement.spec.md
     names it as the gate; the runtime verifications are only fail-fast sanity
     checks). Covers charter capability: equivalence-eval. Builds on the adev
     4-layer eval design and the existing tests/evals/worktree-parallelization/
     TEST-PLAN.md + rubrics/parallel-implement.yaml. -->

## Behavioral Contract

The equivalence eval proves the one property the whole feature rests on: **a `--parallel`
run of a plan produces a result behaviorally identical to a serial run of the same plan.**
Parallel execution may change wall-clock; it may not change the result. Because the runtime
verifications in `parallel-implement.spec.md` (`ORCHESTRATOR_POLLUTED`, `COMMITS_NOT_VERIFIED`)
are fail-fast sanity gates rather than proofs of isolation, this eval is the actual correctness
gate — a `--parallel` feature is not "shipped" until it passes.

It is an **A/B eval** in the style of `tests/evals/token-optimization/run-ab-eval.mjs`: run the
same fixture plan twice — baseline serial, variant parallel — from identical clean checkouts, then
compare. It scores on the adev 4-layer graduated harness (`/adev:eval`), with **result equivalence**
as the prime Layer-3 dimension.

### Equivalence, operationally

A parallel run is equivalent to the serial baseline when ALL hold:
1. **Same tests pass** — the test suite result (pass/fail set) is identical in both branches.
2. **Impl diff empty or explained** — `git diff <serial-branch> <parallel-branch>` over
   implementation files is empty, or differs only in non-semantic ways (formatting, comment
   whitespace) that a reviewer explicitly accepts.
3. **Same public surface** — no exported symbol / CLI verb / file exists in one branch and not the
   other.

### Behaviors

- **When** the eval runs **then** it executes the fixture plan serially from a clean checkout
  (baseline) and via `/adev:implement --parallel` from an identical clean checkout (variant),
  capturing for each: the test result set, the set of changed implementation files, the exported
  public surface, wall-clock, and token cost (from session JSONL).
- **When** the two runs are compared **then** the eval computes the three equivalence checks above
  and reports `equivalent: true|false` with the specific divergence when false.
- **When** the fixture plan contains a deliberately **overlapping** (non-disjoint) group **then** the
  eval asserts the variant serialized that group (did not force-merge it) — parallelism must never be
  applied to file-overlapping work.
- **When** the runs complete **then** the eval asserts **0 orphaned state**: no leftover
  `.adev/worktrees/` entries, no dangling `adev/*` branches, and no stale `tasks.json.lock`.
- **When** wall-clock and cost are compared **then** the eval records `t_parallel < t_serial` (else
  parallelism has no benefit) and `tokens_parallel ≤ 1.15 × tokens_serial` (isolation overhead
  bounded) — these are reported and gated as WARN, not hard failures (equivalence is the hard gate).
- **When** scored on the 4-layer harness **then**: Layer 1 (deterministic) = the primitive + parallel
  test suites pass; Layer 2 (architectural) = zero-dep / ESM / contract conformance; Layer 3
  (LLM-judge) = the `result_equivalence` dimension is the prime score (with merge-ordering, failure
  semantics, no-orphaned-state); Layer 4 (HITL) = human confirms data integrity of the merged result.
- **When** `equivalent: false` **then** the eval exits non-zero and the `--parallel` feature is
  **not** considered shippable — the divergence is the blocker.

## Preconditions

- The worktree primitive and `/adev:implement --parallel` are implemented (this eval verifies them).
- A fixture: a spec + reviewed plan whose `## Parallelization` section has **≥2 file-disjoint groups
  and one deliberately overlapping group** (to exercise both the parallel and the forced-serial path).
- Clean git state; the eval runs each arm from a fresh checkout/worktree of the same base commit.
- Token measurement reads real session JSONL (never byte-size estimates) per the project heuristic.

## Postconditions

- A results artifact at `tests/evals/worktree-parallelization/results/eval-<date>.md` (+
  `results/last-run.json`) records: `equivalent`, per-arm test result sets, the impl diff summary,
  wall-clock, token cost, orphaned-state check, and the overlapping-group serialization assertion.
- On `equivalent: true` and 0 orphaned state: the eval passes; the feature's prime ship gate is green.
- On any divergence: non-zero exit; the results artifact names the exact divergence.

## Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Test result sets differ between arms | `equivalent: false`; report the differing tests | `NOT_EQUIVALENT` |
| Impl diff non-empty and not reviewer-accepted | `equivalent: false`; show the diff | `NOT_EQUIVALENT` |
| A symbol/verb/file exists in one arm only | `equivalent: false`; name the surface delta | `NOT_EQUIVALENT` |
| Overlapping group was run in parallel (not serialized) | Fail — parallelism applied to shared files | `OVERLAP_PARALLELIZED` |
| Orphaned worktree / dangling `adev/*` branch / stale lock remains | Fail | `ORPHANED_STATE` |
| Fixture plan has no overlapping group to test the serial path | Skip that assertion with a logged note | (advisory) |
| `t_parallel ≥ t_serial` or `tokens_parallel > 1.15×` | WARN (recorded, not a hard failure) | (advisory) |

## System Constitution Reference

- **Principle 1 (minimize dependencies)** — ✓ The eval harness uses Node built-ins + git only,
  mirroring `run-ab-eval.mjs`; no new deps.
- **Principle 3 (pure ESM)** — ✓ `.mjs` harness.
- **Heuristic: token measurement from session JSONL, not byte estimates** — the cost arm parses real
  `message.usage` fields, not `bytes/4`.
- **`equivalence-eval` is the charter's prime Quality Attribute (Correctness/equivalence)** — this
  spec operationalizes that attribute into a runnable gate.

## Actionable Task Map

<!-- Preliminary — /adev:plan owns the full decomposition. -->

| Task | Description | Complexity |
|------|-------------|------------|
| 1 | Fixture: a spec + plan with ≥2 disjoint groups + 1 overlapping group | S |
| 2 | `run-ab-eval.mjs`: run serial + parallel arms from clean checkouts; capture test set, surface, diff, wall-clock, tokens | L |
| 3 | Equivalence comparator (same-tests, impl-diff, public-surface) → `equivalent` + divergence | M |
| 4 | Assertions: overlapping-group serialized; 0 orphaned state (worktrees/branches/lock) | M |
| 5 | Results renderer → `results/eval-<date>.md` + `last-run.json` (token-optimization format) | S |
| 6 | Wire the rubric (`rubrics/parallel-implement.yaml`) Layer-1/Layer-3 scoring into the report | M |

## Acceptance Criteria

- [ ] Runs the same fixture plan serial (baseline) and `--parallel` (variant) from clean checkouts.
- [ ] Computes equivalence via all three checks (same tests, impl diff, public surface) and reports
      `equivalent` + the divergence when false.
- [ ] Asserts an overlapping group is serialized, never force-merged (`OVERLAP_PARALLELIZED`).
- [ ] Asserts 0 orphaned worktrees / dangling `adev/*` branches / stale locks (`ORPHANED_STATE`).
- [ ] Records wall-clock (`t_parallel < t_serial`) and token cost (`≤ 1.15×`, from session JSONL) as WARN gates.
- [ ] Writes the results artifact + `last-run.json`; scores on the 4-layer harness with
      `result_equivalence` as the prime dimension.
- [ ] `equivalent: false` exits non-zero and blocks shipping `--parallel`.
- [ ] All quality gates pass; no constitutional violations.
