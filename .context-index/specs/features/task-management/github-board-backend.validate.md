---
spec: .context-index/specs/features/task-management/github-board-backend.spec.md
verdict: FAIL
tier: full
validated-at: 2026-11-27
source-manifest-sha: 41b00bf
---

# Validation Report: GitHub Board Backend

> **Spec:** .context-index/specs/features/task-management/github-board-backend.spec.md
> **Plan:** .context-index/specs/features/task-management/github-board-backend.plan.md
> **Rigor tier:** full (risk_level high)
> **Verdict:** FAIL (Check 1 quality gates, fail-fast)

## Summary

| Check | Result | Notes |
|---|---|---|
| Preflight | PASS | gh CLI present; GH_TOKEN no longer listed as required (commit 4451c2ef) |
| 1a Quality gates (fast) | FAIL | `npm test`: 10020 tests, 9993 pass, 7 fail, 18 cancelled |
| 1b Quality gates (integration) | SKIP | prior tier failed |
| 1.5 Source manifest | PASS | sha 41b00bf, 84 files, all committed |
| 1.6 Code drift | PASS | no drift flag |
| 2 Spec compliance | SKIP | Skipped — prerequisite 'validate.check-1-quality-gates' failed |
| 4 Constitution | SKIP | Skipped — prerequisite 'validate.check-1-quality-gates' failed |
| 8 Boundaries | PASS | no violations in 45 changed files against 3 rules; `no-manual-version-bump` disabled by the registry |
| 9 Transition gates | FAIL | `implement-to-validate`: gate `test` recorded-fail |
| 11 Visual verification | SKIP | no UI files |
| 14 Gate executability | PASS_WITH_NOTES | 4 warnings: runner-unknown for `test`, `quality-gate`, `integration-test`; `integration-test` not invoked in CI |

## Check 1a: failing tests

| File | Failures | Cause | From this branch? |
|---|---|---|---|
| `tests/repomap/index.test.mjs` | 19 subtests | repomap pipeline | No: also fails at the merge base cf263817 |
| `tests/repomap/non-code-references.integration.test.mjs` | 5 subtests | repomap pipeline | No: also fails at the merge base cf263817 |
| `tests/lib/prototype-server.test.mjs` | 1 | the test started a server on 127.0.0.1:3210 and did not exit for 71 minutes; it was stopped by hand. Earlier runs' `EADDRINUSE 3210` came from a hung copy of the same test | No: environmental / test hygiene |
| `tests/skills/plan-task-immutability.test.mjs` | 1 (`real repo has no violations`) | `github-board-backend.plan.md` modified at 2026-11-26T17:09:50-03:00 (commit 34e1f43c, "reconcile github board plan with spec rev 6 and migration amendment") after its first pending task event at 2026-11-26T04:33:18Z | **Yes** |

## Remedy

1. Plan immutability: either record commit 34e1f43c as an exemption in `.context-index/manifest.yaml` (`ci.plan_immutability.exempt_patch_ids`, with its reason inline), or move the reconciled task text to a routing sidecar. This is a governance decision for the maintainer.
2. The repomap and prototype-server failures exist without this branch; Check 1 cannot pass while they fail.
3. Re-run `/adev:validate --spec <spec>` once `npm test` is green; Checks 2 and 4 run then.

## Migration orientation

Concerns validate no longer checks: charter consistency, ADR compliance and cross-cutting drift live in `/adev:hygiene`; lifecycle mismatches in `/adev:reconcile`; spec review in `/adev:review-specs`.
