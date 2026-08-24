---
spec: .context-index/specs/cross-cutting/review-block-auto-retry-rev-2-targeted-author-verify-loop.spec.md
plan: .context-index/specs/cross-cutting/review-block-auto-retry-rev-2-targeted-author-verify-loop.plan.md
date: 2026-08-23
overall_status: FAIL
rigor_tier: full
---

# Validation Report: Amendment: Live Spec: Auto-Retry Loop on Review BLOCK (targeting rev 2)

> **Date:** 2026-08-23
> **Spec:** .context-index/specs/cross-cutting/review-block-auto-retry-rev-2-targeted-author-verify-loop.spec.md
> **Plan:** .context-index/specs/cross-cutting/review-block-auto-retry-rev-2-targeted-author-verify-loop.plan.md
> **Overall Status:** FAIL

**Rigor tier:** `full` (resolved from `risk_level: high` → `risk-policies.yaml` → `validate_mode: full`; no `--tier` override, no routing signal).

**Retry note:** This is retry cycle 1 of the manual fix loop (not the automated max_retries loop). The prior FAIL — `npm test` asserting a hardcoded count of 19 cross-cutting `*.spec.md` files at `tests/governance/context-pack-consistency-glob.test.mjs:85` — was fixed and committed as `bc80cd95` (count bumped 19→20). This run is a full re-validation, not a rerun of only the previously-failed check.

---

## Check 1: Quality Gates — PASS (fast tier) / WARN (integration tier)

- **Check 1a (fast tier):** `npm test` — PASS. 7719 tests, 7717 pass, 0 fail, 2 pre-existing todo (~27.4s).
  - Gate `test` (`npm test`): PASS
  - Gate `quality-gate` (`npm test`): PASS
- **Check 1b (integration tier):** `npm run test:evals` — WARN (severity: warning, non-blocking). 394 tests, 382 pass, 12 fail (~14.8s). Failures are in `tests/evals/integration-sandbox/{build-with-db,build-without-db,reality-check}.test.mjs` and `tests/orders.integration.test.mjs` — all trace to the `pg` package not being installed in this sandbox (`ERR_MODULE_NOT_FOUND: pg`) and downstream reality-check fixture assertions that depend on it. None of these files are in this spec's `source-manifest.files`; this is a pre-existing environment gap in the integration-sandbox eval harness, not a regression introduced by this amendment.
- **Check 1c (e2e tier):** no gates configured — skipped.

Overall Check 1 verdict: **PASS_WITH_NOTES** (fast tier fully green; integration tier WARN is non-blocking per its declared `severity: warning`).

## Check 1.5: Source Manifest Verification — PASS

- `adev source-manifest verify` → `Check 1.5: PASS — source manifest matches (sha: b6f24f0)`.
- Implementation-existence check: all 34 files listed in `source-manifest.files` confirmed present in `git ls-files` (tracked/committed) — none staged-only or untracked.

## Check 1.6: Code-Side Drift Warning — PASS

- `adev verify spec --check-drift` → `{"drifted":false,"drift_source":null,"drift_at":null}`. No drift detected.

## Check 2: Spec Compliance — FAIL

11 of 13 numbered acceptance criteria PASS with strong, non-gamed, deterministic test coverage, and the amendment's central defect (base spec's hardcoded blanket-acknowledgement in `reviseSpec()`) is genuinely and convincingly fixed (criterion 5, verified against real per-anchor text-diff logic with rollback-on-failure splice validation at `lib/specify-revise.mjs:495-577`). However:

- **AC12 — FAIL.** `tests/evals/convergence/run-convergence-eval.mjs --baseline-ref <commit>` A/B comparison was never run to completion. `tests/evals/convergence/results/convergence-eval-2026-08-23.md:43-47`'s own "What was NOT completed" section states the full comparison was never executed (only a single-arm smoke trial; full run estimated 2-3 hours, out of session budget). The one trial that did run reports `verdict: UNKNOWN` and `cost: $0.000`. This is honestly self-documented but the literal, checklist-listed acceptance criterion is unmet.
- **AC6 — PARTIAL (implementation gap).** `lib/diagnostics/tier2/mechanism-existence.mjs:48-53` only defines `FILE_LINE_RE`/`FILE_SYMBOL_RE` — no regex extracts CLI flags or error codes, despite the module docstring (line 7) and BEH-6's spec text both claiming that extraction. `tests/diagnostics/tier2/mechanism-existence.test.mjs:121-131` only asserts `result.fired === false`, which cannot distinguish "checked and found nothing wrong" from "never extracted at all" — masking the gap.
- **Scope Expansion Sub-Finding — detected.** `lib/token-pricing.mjs` and `tests/evals/token-optimization/run-ab-eval.mjs` were both modified in commit `34b709c6` (Task 1's commit, adding pricing rows for `claude-sonnet-5`/`claude-opus-5`/`claude-fable-5`/`claude-opus-4-8`/`claude-mythos-5`) but are **not** listed in `source-manifest.files`. This is a real, substantive, unrelated change bundled into the task commit. (Provider-mirror files under `providers/codex/skills/**` and `providers/opencode/skills/**`, and the mechanical `tests/governance/context-pack-consistency-glob.test.mjs` count bump, are expected/trivial fallout per CLAUDE.md and are not treated as concerning scope drift.)
- **Issue-close criterion — PARTIAL.** `adev-plugin-revise-loop-no-content-edits-q6q0` is closed, correctly referencing this spec. `adev-plugin-j7pq.1` remains open in the canonical (main-repo) issue store — blocked by a dependency guard on unrelated open issue `adev-plugin-j7pq.2`, not by unfinished work in this spec.

All other criteria (1, 2, 3, 4, 7, 8, 9, 10, 11, 13) — PASS with file:line citations; quality-gate and no-inline-Node checks also PASS. Full per-criterion detail is preserved in this run's Check 2 subagent transcript.

**Remediation before re-running Check 2:**
1. Run `run-convergence-eval.mjs --baseline-ref <pre-implementation-commit>` to completion (satisfies AC12), or formally descope it via a spec amendment if judged prohibitively expensive.
2. Implement CLI-flag/error-code extraction in `lib/diagnostics/tier2/mechanism-existence.mjs` (or narrow BEH-6's text if that's deliberately out of scope), and replace the vacuous `result.fired === false`-only test with one that actually exercises extraction.
3. Add `lib/token-pricing.mjs` (and `tests/evals/token-optimization/run-ab-eval.mjs` if intentional) to `source-manifest.files`, or split that change into its own commit.
4. Resolve `adev-plugin-j7pq.2` so `adev-plugin-j7pq.1` can close as the spec's own acceptance checklist requires.

## Check 4: Constitution Compliance — PASS

- **Architecture boundaries:** PASS — no new dependencies (`package.json` deps diff empty vs `main`), no new `skills/<name>/SKILL.md` added to the lifecycle order (only companion `.md` files inside existing skill directories: `skills/build/blocker-auto-retry-loop.md`, `skills/specify/revise-mode-authoring-dispatch.md`), `.claude-plugin/plugin.json` untouched, version parity intact (`0.27.8` in both manifests).
- **Non-negotiable principles:** PASS — zero new deps; ESM-only (`grep "require(\|module.exports"` across sampled files: 0 matches); zero inline-Node patterns across all 5 touched skill files; the one new fenced JS block in `skills/review-specs/SKILL.md:384-388` is explicitly commented as reference-only, not executable.
- **Coding standards:** PASS — kebab-case files, camelCase exports, Node-builtins-first import ordering confirmed at `lib/blockers-writer.mjs:24-28` and `lib/specify-revise.mjs:34-41`, coded-error/exit-code conventions followed in CLI entry points.
- **Commit trailers:** PASS — 12 sampled implementation commits all carry `Spec:`/`Plan-task:`/`Author-type:`/`Operator:` trailers matching this spec's path and plan tasks.

## Check 8: Boundary Compliance — PASS

- `adev boundaries check --json` → verdict `PASS`, reason "no boundary violations in 21 changed file(s) against 3 rule(s)".
- Disabled: `no-manual-version-bump` — "the boundary evaluator matches file content, not diffs; a version field is not a version bump, so this rule would fire on package.json forever. Needs a diff-aware evaluator."
- Registry warnings: none.

## Check 9: Transition Gates — PASS

- Transition: `implement-to-validate`.
- `adev gate transitions --transition implement-to-validate --json` → verdict `PASS`, reason "every required gate has a fresh, attested, passing outcome".
- `test`: pass — reason `recorded-pass`, `command_attested: true`.

## Check 11: Visual Verification — N/A (SKIP)

No UI files (`*.tsx`/`*.jsx`/`*.vue`/`*.svelte`/`*.css`/`*.scss`/`*.html`, or files under `components/`, `pages/`, `views/`, `public/`, `app/**/page.*`, `app/**/layout.*`) present in `source-manifest.files` (all 34 files are `.mjs`/`.md`/`.yaml`). Case A/D of the trigger guard — not applicable.

## Check 14: Gate Executability and Test Collection — PASS

- `adev gate doctor --json` → 0 errors, 4 warnings: `runner-unknown` ×3 (no known test runner identified for `npm test` / `npm run test:evals` command strings — collection not verified, reported rather than silently passed) and `ci-gate-not-invoked` ×1 (`integration-test` gate not textually matched in `.github/workflows/*.yml`).
- No error-severity findings; no gates missing a command or referencing a nonexistent/gitignored path.

---

**Summary:** 7 passed (1, 1.5, 1.6, 4, 8, 9, 14), 1 failed (2), 1 skipped/N-A (11) checks.

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 11 (when no UI files), 12, and 13 have been relocated by `check-set-restructure.spec.md`. See:
>
> - `/adev:review-specs` — for ADR compliance (formerly Check 5), cross-cutting compliance (formerly Check 6), specialist review (formerly Check 7), and charter consistency (formerly Check 3, now covered by Check 2's scope-expansion sub-finding).
> - `/adev:hygiene` Audit Pass 20 — for platform drift (formerly Check 10).
> - `/adev:reconcile` lifecycle-sync — for lifecycle reconciliation (formerly Check 12, with `--fix` as the default mode).
> - `hooks/post-validate-extract-heuristics.{sh,mjs}` — for heuristic extraction (formerly Check 13 / `check-12-heuristic-extraction`), now a non-blocking Stop-event hook.
>
> Historic `.validate.md` reports continue to use the pre-restructure numbering; the gaps in the surviving inventory (Checks 1, 1.5, 1.6, 2, 4, optionally 8 and 9) are intentional to preserve report readability.
