# Validation Report: Hook Config Generator with Translation Table and Drift Test

> **Date:** 2026-05-17
> **Spec:** .context-index/specs/features/cursor-provider/hook-config-generator.spec.md
> **Plan:** .context-index/specs/features/cursor-provider/hook-config-generator.plan.md
> **Overall Status:** FAIL (fail-fast on Check 1 — unrelated test flake; see notes)

---

## Check 1: Quality Gates — FAIL

- Tests (`npm test`, fast tier, severity: error): **FAIL** — 3209 passed, **1 failed**, 2 todo.
  - Failure location: `tests/cli-e2e.test.mjs:91` — test name `installs both providers with multiple --provider flags`.
  - Failure mode: `ENOTEMPTY` in `afterEach` cleanup (`tests/helpers.mjs:30` — `cleanupTempDir`). The `init --provider claude-code --provider opencode` install completes successfully; teardown then fails to `rmSync` the temp dir.
  - Reproducibility: failed in two consecutive runs with the same root cause (different temp dir suffix).
  - **Relationship to this spec:** None. The failing test does not exercise any cursor-provider code path. It tests the multi-provider `--provider` flag handling for `claude-code` + `opencode`. The cursor-provider hook generator (`scripts/build-cursor-hooks.mjs`) and its 14 dedicated tests (`tests/cursor-hooks-sync.test.mjs`) all pass cleanly in isolation and in the full run.
  - **Latest touch on `tests/cli-e2e.test.mjs`:** commit `97c928c` (`fix(tests): set cwd to temp dir in CLI e2e tests`) — pre-dates every cursor-provider commit (earliest cursor-provider commit: `1d5ba77`).

Per the fail-fast protocol in `skills/validate/SKILL.md`, Checks 2–9 are skipped after a Check 1 failure. Check 11 follows independent UI-file trigger guard rules (see below).

## Check 1.5: Source Manifest Verification — PASS

- `adev source-manifest verify` returned: `PASS — source manifest matches (sha: 0d49109)`.
- Frontmatter-listed files all verified committed:
  - `package.json` → commit `aa2581c` (`feat(cursor-provider): wire build:cursor-hooks npm script`)
  - `providers/cursor/hooks.json` → commit `efac73c` (`feat(cursor-provider): commit initial providers/cursor/hooks.json`)
  - `scripts/build-cursor-hooks.mjs` → commit `3ccd8e8` (`feat(cursor-provider): implement buildCursorHooks transform with atomic write`)
  - `tests/cursor-hooks-sync.test.mjs` → commit `8c8c449` (`feat(cursor-provider): add drift test for cursor hooks generator`)
- No untracked-but-existing files in the manifest set.

## Check 1.6: Code-Side Drift Warning — PASS

- `adev verify spec --check-drift` returned: `{"drifted":false,"drift_source":null,"drift_at":null}`.
- No code-side drift flagged on the spec frontmatter.

## Check 2: Spec Compliance — SKIPPED

Skipped per Check 1 fail-fast.

Note (informational, not a verdict): the spec's 14 dedicated tests in `tests/cursor-hooks-sync.test.mjs` all PASS in isolation (`node --test tests/cursor-hooks-sync.test.mjs` → 14 pass / 0 fail). The acceptance criteria appear satisfied by reading the implementation files, but a full Check 2 walk-through is reserved for the re-run after the unrelated flake is addressed.

## Check 4: Constitution Compliance — SKIPPED

Skipped per Check 1 fail-fast.

## Check 8: Boundary Compliance — SKIPPED

Skipped per Check 1 fail-fast.

## Check 9: Transition Gates — SKIPPED

Skipped per Check 1 fail-fast.

## Check 11: Visual Verification — N/A

No UI files in the implementation diff. Spec touches only `scripts/`, `tests/`, `providers/cursor/hooks.json`, and `package.json`. Case A of the Check 11 trigger guard: SKIP — "No UI files in implementation diff — visual verification not applicable."

---

**Summary:** 0 passed, 1 failed, 5 skipped (2/4/8/9 fail-fast; 11 N/A), 2 advisory PASS (1.5, 1.6). The Check 1 failure is an unrelated test-infrastructure flake in `tests/cli-e2e.test.mjs` and is **not caused by any file touched by this spec**. Recommended next action: address the `cleanupTempDir` ENOTEMPTY in the cli-e2e suite (separate spec/issue), then re-run `/adev:validate`. The cursor-provider hook-config-generator implementation itself passes its own 14 tests cleanly and shows no source-manifest drift.

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 11 (when no UI files), 12, and 13 have been relocated by `check-set-restructure.spec.md`. See:
>
> - `/adev:review-specs` — for ADR compliance (formerly Check 5), cross-cutting compliance (formerly Check 6), specialist review (formerly Check 7), and charter consistency (formerly Check 3, now covered by Check 2's scope-expansion sub-finding).
> - `/adev:hygiene` Audit Pass 20 — for platform drift (formerly Check 10).
> - `/adev:reconcile` lifecycle-sync — for lifecycle reconciliation (formerly Check 12, with `--fix` as the default mode).
> - `hooks/post-validate-extract-heuristics.{sh,mjs}` — for heuristic extraction (formerly Check 13 / `check-12-heuristic-extraction`), now a non-blocking Stop-event hook.
>
> Historic `.validate.md` reports continue to use the pre-restructure numbering; the gaps in the surviving inventory (Checks 1, 1.5, 1.6, 2, 4, optionally 8 and 9) are intentional to preserve report readability.
