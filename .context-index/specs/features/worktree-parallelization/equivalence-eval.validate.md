# Validation Report: Equivalence Eval

> **Date:** 2026-07-19
> **Spec:** .context-index/specs/features/worktree-parallelization/equivalence-eval.spec.md
> **Plan:** .context-index/specs/features/worktree-parallelization/equivalence-eval.plan.md
> **Overall Status:** PASS

---

## Check 1: Quality Gates — PASS
- Tests (`npm test`): PASS — 4306 pass, 0 fail. New eval tests: divergence (8), state-check (4), report (6), fixture (1), harness smoke (2).

## Check 1.5: Source Manifest Verification — PASS
- `adev source-manifest verify` → matches (sha: dd75314). All manifest files committed.

## Check 1.6: Code-Side Drift — PASS
- `drifted: false`.

## Check 2: Spec Compliance — PASS
- **Behavioral equivalence + determinism gate (SA-2):** `lib/parallel/eval/divergence.mjs::judge` returns `inconclusive` on non-empty control divergence, `equivalent` only on exact behavioral match; tests cover all three verdicts + `divergence_kind`.
- **Group-selection assertion (SA-3):** `lib/parallel/eval/state-check.mjs::assertGroupSelection` raises `OVERLAP_PARALLELIZED` when a sequential group got a worktree.
- **Success-scoped orphaned-state (SA-5):** `scanOrphanedState`/`assertNoOrphans` (`ORPHANED_STATE`).
- **Report + rubric scoring:** `lib/parallel/eval/report.mjs` renders results + Layer-1/3 (50/50) scoring; WARN gates for wall-clock/tokens.
- **Fixture coverage/determinism (SA-1/SA-4):** deterministic fixture with 2 independent + 1 sequential group; meta-test asserts the shape.
- **[live] 3-arm harness:** `tests/evals/worktree-parallelization/run-ab-eval.mjs` (serial-A / serial-B control / parallel), `--dry-run` smoke-tested; the full 3-arm run is agent-driven (documented, per [pure]/[live] split).

## Check 4: Constitution Compliance — PASS
- Zero new deps (Node built-ins only); pure ESM; the harness mirrors `run-ab-eval.mjs`; no inline-Node.

## Check 8: Boundary Compliance — PASS
- No active boundary rules.

## Check 9: Transition Gates — SKIP
- No active transitions configured.

## Check 11: Visual Verification — N/A
- No UI files.

---

**Summary:** 6 passed, 0 failed, 2 skipped (transition N/A, visual N/A). The equivalence-eval gate is built and validated: pure helpers unit-tested, the [live] 3-arm harness scaffolded + smoke-tested. It is the load-bearing parallel≡serial gate; the full [live] run is the ship check for `--parallel`.
