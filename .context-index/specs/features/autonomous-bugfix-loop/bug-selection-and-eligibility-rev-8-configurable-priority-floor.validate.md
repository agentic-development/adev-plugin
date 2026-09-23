---
spec: .context-index/specs/features/autonomous-bugfix-loop/bug-selection-and-eligibility-rev-8-configurable-priority-floor.spec.md
plan: .context-index/specs/features/autonomous-bugfix-loop/bug-selection-and-eligibility-rev-8-configurable-priority-floor.plan.md
kind: validate
status: FAIL
---

# Validation Report: Amendment: Live Spec: Bug Selection Verb and Eligibility Filter (targeting rev 8)

> **Date:** 2026-08-21
> **Spec:** .context-index/specs/features/autonomous-bugfix-loop/bug-selection-and-eligibility-rev-8-configurable-priority-floor.spec.md
> **Plan:** .context-index/specs/features/autonomous-bugfix-loop/bug-selection-and-eligibility-rev-8-configurable-priority-floor.plan.md
> **Overall Status:** FAIL

---

## Check 1: Quality Gates — FAIL

- Fast tier (`npm test`, gate ids `test` + `quality-gate`, same underlying command): **FAIL**
  - `tests 7632 / suites 1007 / pass 7589 / fail 11 / cancelled 30 / skipped 0 / todo 2` (duration 29.2s)
  - All 11 failures + 30 cancellations fall into two pre-existing, unrelated clusters, both independently confirmed via `git stash` by the implement step and re-confirmed here by inspecting the failure output:
    1. **repomap/tree-sitter asset missing** — `ENOENT: node_modules/tree-sitter-typescript/tree-sitter-typescript.wasm` crashes `tests/repomap/parse.test.mjs`, `tests/repomap/index.test.mjs`, `tests/repomap/render-non-code-sections.test.mjs`, and the tree-sitter integration/pagerank/doc-reference suites. This is a missing build asset in `node_modules`, unrelated to this spec's changes (`lib/issues/eligibility.mjs`, `lib/cli/issues-next.mjs`, `docs/cli-reference.md`, `tests/issues/next.test.mjs`).
    2. **plan-immutability false positive on this plan's own mtime** — `tests/skills/plan-task-immutability.test.mjs:63` (`plan-immutability: real repo has no violations`) flags `bug-selection-and-eligibility-rev-8-configurable-priority-floor.plan.md` itself as mutated after a pending marker, because the implement step for *this spec* legitimately updated its own plan file's task checkboxes during this session. This is a scanner false-positive on in-flight work, not a regression in this spec's implementation.
  - Feature-specific suite `tests/issues/next.test.mjs` (covering this spec's `lib/issues/eligibility.mjs` / `lib/cli/issues-next.mjs` changes) is fully green — no failures attributable to this spec appear anywhere in the 11 failed / 30 cancelled test names.
  - Integration tier (`npm run test:evals`, warning severity): **SKIP** — not run; fast tier failed with error severity (intra-Check-1 fail-fast).
  - E2E tier: no gates configured — SKIP.

**Quality gates failed. Checks 2, 4, 8, 9 skipped per fail-fast policy. Fix the above and re-run `/adev:validate`.**

## Check 1.5: Source Manifest Verification — PASS

- `adev source-manifest verify` → `Check 1.5: PASS — source manifest matches (sha: 67d8285)`.
- All 4 manifest files (`docs/cli-reference.md`, `lib/cli/issues-next.mjs`, `lib/issues/eligibility.mjs`, `tests/issues/next.test.mjs`) verified committed to git:
  - `docs/cli-reference.md` — commit `7b4b5e31`
  - `lib/cli/issues-next.mjs` — commits `7a6058a6`
  - `lib/issues/eligibility.mjs` — commit `0f110810`
  - `tests/issues/next.test.mjs` — commit `7a6058a6`

## Check 1.6: Code-Side Drift Warning — PASS

- `adev verify spec --check-drift` → `{"drifted":false,"drift_source":null,"drift_at":null}`. No drift detected.

## Check 2: Spec Compliance — SKIP
Skipped — Check 1 failed with error severity (fail-fast; Checks 2–13 skipped per policy).

## Check 4: Constitution Compliance — SKIP
Skipped — Check 1 failed with error severity (fail-fast).

## Check 8: Boundary Compliance — SKIP
Skipped — Check 1 failed with error severity (fail-fast).

## Check 9: Transition Gates — SKIP
Skipped — Check 1 failed with error severity (fail-fast).

## Check 11: Visual Verification — N/A
No UI files in the implementation diff (`docs/cli-reference.md`, `lib/cli/issues-next.mjs`, `lib/issues/eligibility.mjs`, `tests/issues/next.test.mjs`) — visual verification not applicable (Case A of the trigger guard). This holds independently of the Check 1 fail-fast.

---

**Summary:** 3 passed (1, 1.5, 1.6), 1 failed (1), 5 skipped/N-A (2, 4, 8, 9, 11) checks.

**Note on the Check 1 failure:** the failing/cancelled tests are pre-existing and unrelated to this spec's implementation — verified via `git stash` during `/adev:implement` and re-verified here by reading the failure output directly (tree-sitter wasm asset absence; plan-immutability scanner flagging its own plan file's legitimate in-session edits). This spec's own feature tests (`tests/issues/next.test.mjs`, 41/41) and the code paths it touches are unaffected. Re-run `/adev:validate` after either (a) restoring/installing the missing `tree-sitter-typescript.wasm` asset, and (b) resolving the plan-immutability false positive (e.g. by excluding a plan's own in-flight file from the "no violations" assertion, or running the check against a clean checkout of the plan file) — neither of which is in scope for this spec's changes.

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 11 (when no UI files), 12, and 13 have been relocated by `check-set-restructure.spec.md`. See:
>
> - `/adev:review-specs` — for ADR compliance (formerly Check 5), cross-cutting compliance (formerly Check 6), specialist review (formerly Check 7), and charter consistency (formerly Check 3, now covered by Check 2's scope-expansion sub-finding).
> - `/adev:hygiene` Audit Pass 20 — for platform drift (formerly Check 10).
> - `/adev:reconcile` lifecycle-sync — for lifecycle reconciliation (formerly Check 12, with `--fix` as the default mode).
> - `hooks/post-validate-extract-heuristics.{sh,mjs}` — for heuristic extraction (formerly Check 13 / `check-12-heuristic-extraction`), now a non-blocking Stop-event hook.
>
> Historic `.validate.md` reports continue to use the pre-restructure numbering; the gaps in the surviving inventory (Checks 1, 1.5, 1.6, 2, 4, optionally 8 and 9) are intentional to preserve report readability.
