---
partial_schema: validate-report@1
spec: .context-index/specs/cross-cutting/mode-resolution-core.spec.md
plan: .context-index/specs/cross-cutting/mode-resolution-core.plan.md
date: 2026-09-11
overall_status: PASS_WITH_NOTES
rigor_tier: full
---

# Validation Report: Implementation Mode — Resolution Core

> **Date:** 2026-09-11
> **Spec:** .context-index/specs/cross-cutting/mode-resolution-core.spec.md
> **Plan:** .context-index/specs/cross-cutting/mode-resolution-core.plan.md
> **Overall Status:** PASS_WITH_NOTES
> **Rigor tier:** full (risk_level: medium → validate_mode: full)

---

## Check 1: Quality Gates — PASS_WITH_NOTES

Gate source: project's materialized `.context-index/governance/gates.yaml` (3 gates: `test`, `quality-gate`, `integration-test`), resolved via `adev domain load-gates --module implementation-mode`.

**Check 1a (fast tier):**
- `test` (npm test): PASS — 7845 pass / 0 fail / 2 todo, 51.0s
- `quality-gate` (npm test, identical `command_sha`): PASS (same run)

**Check 1b (integration tier):**
- `integration-test` (npm run test:evals), severity: warning: WARN — 369 pass / 25 fail, 21.8s. All 25 failures are in `tests/evals/integration-sandbox/` (Postgres-dependent integration-sandbox and `/adev:review-specs` install fixtures — e.g. "PostgreSQL IS running on port 5433", "reality-check: integration-sandbox fixture"), pre-existing and unrelated to this spec's 13 manifest files (none of the failing tests touch `cli/`, `lib/implementation-modes/`, `lib/cli/implementation-mode*`, or `skills/init/`). Severity is `warning` (governance/gates.yaml explicit), so non-blocking per Check 1 semantics.

**Check 1c (e2e tier):** no gates configured — skipped.

No `--fix` requested; no fast-tier lint/format failures to auto-fix.

## Check 1.5: Source Manifest Verification — PASS

`adev source-manifest verify` → PASS, sha `7fe2146` matches current file contents for all 13 manifest files. Git-tracked check: `git log --oneline -1 -- <file>` confirmed a commit exists for every one of the 13 listed files (no untracked/uncommitted-only files).

## Check 1.6: Code-Side Drift Warning — PASS

`adev verify spec --check-drift` → `{"drifted":false,"drift_source":null,"drift_at":null}`. No drift detected.

## Check 2: Spec Compliance — PASS_WITH_NOTES

All 14 acceptance criteria, all 6 behaviors (BEH-1..BEH-6), and both error cases (`UNKNOWN_IMPLEMENTATION_MODE`, `MANIFEST_PARSE_ERROR`) verified by reading all 13 source-manifest files directly, cross-checked against the plan's task breakdown (not plan checkboxes), and independently confirmed with live CLI smoke tests against scratch temp directories (`node cli/index.mjs implementation-mode resolve --mode ...`) — the real `.context-index/manifest.yaml` was never touched during verification.

Key evidence:
- BEH-1/BEH-2/BEH-3 (explicit mode ignores manifest; no-mode+no-value → `tdd` default; no-mode+stored-value → resolves stored): `lib/implementation-modes/resolve.mjs:25-37`; tests `tests/implementation-modes/resolve.test.mjs:25-41`.
- BEH-4 (result always exactly `{dispatch_red, ordering_enforced, coverage_check}`): `lib/implementation-modes/constants.mjs:19-23`; tests assert `Object.keys(...).sort()` deep-equal exactly the 3 names (exact-match, not loose).
- BEH-5/BEH-6 (agent-default listed first, no silent accept-on-enter, bypass warning before write): `lib/cli/init-prompt-implementation-mode.mjs:44-50,164-175,225-230,259-265`; golden/scripted-input tests `tests/cli/init-prompt-implementation-mode.test.mjs:33-102` assert real stdout ordering, not manual QA.
- Error cases: `UNKNOWN_IMPLEMENTATION_MODE` (`resolve.mjs:68-74`, exit 1) and `MANIFEST_PARSE_ERROR` (`resolve.mjs:50-59`, catches `loadManifest()`'s uncoded `YamlParseError` and re-codes it, exit 2) both verified live and by `resolve.test.mjs` + `tests/cli/implementation-mode.test.mjs`.
- Write-then-read round trip: `tests/integration/implementation-mode-round-trip.test.mjs` — 3 real integration tests driving the actual `run()` + resolver against a temp dir, not a fixture-preset value.
- No test-integrity anti-patterns found (no loose matchers, conditional skips, unfalsifiable assertions, or weakened tests) across all 6 test files read.

**Finding (does not block — non-blocking scope-expansion sub-finding, severity warning):** commit `486021c9` ("docs(cli): close implementation-mode quality-gate drift from tasks 3 and 6") also touched `docs/cli-reference.md`, `providers/codex/skills/init/SKILL.md`, and `providers/opencode/skills/init/SKILL.md` — none of which match (by prefix or glob) any `source-manifest.files` entry. The content added (CLI reference row + provider-mirror parity) is accurate and low-risk; no code change is required. Recommend either folding `docs/cli-reference.md` + the two provider-mirror paths into this spec's manifest going forward, or routing such parity updates through a dedicated `/adev:sync`-style step outside spec-scoped commits.

## Check 4: Constitution Compliance — PASS

- **Architecture boundaries:** No unauthorized boundary crossed — no new services/DB tables, no auth-flow changes, no new external dependencies. `package.json`/`.claude-plugin/plugin.json` versions unchanged (`0.27.8`, confirmed no diff in this spec's commit range).
- **Non-negotiable principles:** Minimize external dependencies — PASS, all new/touched files import only Node builtins + internal modules (`lib/implementation-modes/resolve.mjs:16-18`, `lib/cli/init-prompt-implementation-mode.mjs:26-32`). Skills are primarily markdown — PASS, `skills/init/SKILL.md:753-776` (Step 8b) is prose delegating all logic to `adev init prompt implementation-mode`, no executable fenced JS added. Pure ESM — PASS, `grep -rn "require(\|module.exports"` across touched files returns zero matches. Hook protocol compliance — N/A (spec touches no `hooks/` files). Version parity — PASS, no bump in this spec's commit range.
- **Coding standards:** camelCase functions/kebab-case files confirmed (`resolveImplementationMode`, `validateModeName`, `menuOrder`, `writeImplementationMode`; files `implementation-mode.mjs`, `init-prompt-implementation-mode.mjs`); Node-builtins-then-relative import ordering confirmed in all 3 new lib files; no inline-Node patterns in `skills/init/SKILL.md` Step 8b (single `adev` invocation, no co-occurring inline-Node); no `// Spec:`/`// Plan-task:` provenance comments found in source (the one spec-reference line in `templates/manifest-template.yaml:135` is a "further reading" doc-link following fully-stated constraint prose, matching a pre-existing convention, not bare provenance narration).
- **Commit trailer compliance:** spot-checked 8 commits (`f8548292`, `53951641`, `e6c55dad`, `12218198`, `fd9b25d7`, `ecc7abf2`, `eb6a71ed`, `486021c9`) — all carry `Spec:` trailers; the 7 plan-task implementation commits carry sequential `Plan-task:` trailers; `486021c9` correctly omits `Plan-task:` as a post-hoc quality-gate-drift fix rather than a numbered task.

## Check 8: Boundary Compliance — PASS

`adev boundaries check --json` → verdict `PASS`, reason "no boundary violations in 50 changed file(s) against 3 rule(s)". 0 findings. 1 rule disabled (`no-manual-version-bump`) with its `disabled_reason` recorded (not this spec's concern). No registry warnings.

## Check 9: Transition Gates — PASS

`adev gate transitions --transition implement-to-validate --spec <path> --json` → verdict `PASS`, reason "every required gate has a fresh, attested, passing outcome". Gate `test`: verdict `pass`, reason `recorded-pass`, `command_attested: true`.

## Check 11: Visual Verification — N/A

No UI files in the implementation diff (all 13 manifest files are `.mjs`, `.md`, or `.yaml` under `cli/`, `lib/`, `skills/`, `templates/`, `tests/`). SKIP per Case A of the trigger guard: "No UI files in implementation diff — visual verification not applicable."

## Check 14: Gate Executability and Test Collection — PASS_WITH_NOTES

`adev gate doctor --json` → 0 errors, 4 warnings: `gate-doctor/runner-unknown` for all 3 declared gates (`test`, `quality-gate`, `integration-test` all shell out via `npm`/`npm run`, so the doctor cannot verify collection through a recognized runner query — reported, not silently passed), and `gate-doctor/ci-gate-not-invoked` for `integration-test` (not referenced in any `.github/workflows/*.yml`). No error-severity findings; this check's registry severity is `warning` and does not affect the aggregate verdict.

---

**Summary:** 8 passed, 0 failed, 1 skipped (Check 11, N/A — no UI files) checks; 3 of the 8 passes carry non-blocking notes (Check 1's warning-severity integration-tier failures — pre-existing, infra-dependent, unrelated to this spec; Check 2's provider-mirror/docs scope-expansion finding; Check 14's runner-unknown/ci-gate-not-invoked advisories).

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 11 (when no UI files), 12, and 13 have been relocated by `check-set-restructure.spec.md`. See:
>
> - `/adev:review-specs` — for ADR compliance (formerly Check 5), cross-cutting compliance (formerly Check 6), specialist review (formerly Check 7), and charter consistency (formerly Check 3, now covered by Check 2's scope-expansion sub-finding).
> - `/adev:hygiene` Audit Pass 20 — for platform drift (formerly Check 10).
> - `/adev:reconcile` lifecycle-sync — for lifecycle reconciliation (formerly Check 12, with `--fix` as the default mode).
> - `hooks/post-validate-extract-heuristics.{sh,mjs}` — for heuristic extraction (formerly Check 13 / `check-12-heuristic-extraction`), now a non-blocking Stop-event hook.
>
> Historic `.validate.md` reports continue to use the pre-restructure numbering; the gaps in the surviving inventory (Checks 1, 1.5, 1.6, 2, 4, optionally 8, 9, and 14) are intentional to preserve report readability.
