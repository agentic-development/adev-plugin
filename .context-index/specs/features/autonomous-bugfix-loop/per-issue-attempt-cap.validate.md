---
spec: .context-index/specs/features/autonomous-bugfix-loop/per-issue-attempt-cap.spec.md
plan: .context-index/specs/features/autonomous-bugfix-loop/per-issue-attempt-cap.plan.md
rigor_tier: full
---

# Validation Report: Per-Issue Attempt Cap

> **Date:** 2026-08-19
> **Spec:** .context-index/specs/features/autonomous-bugfix-loop/per-issue-attempt-cap.spec.md
> **Plan:** .context-index/specs/features/autonomous-bugfix-loop/per-issue-attempt-cap.plan.md
> **Overall Status:** PASS_WITH_NOTES

---

## Check 1: Quality Gates — PASS_WITH_NOTES

Gate source: `.context-index/governance/gates.yaml` (materialized), resolved via `adev domain load-gates`.

**Check 1a (fast tier):**
- `test` (`npm test`, severity: error): PASS — 7166 pass / 0 fail / 2 todo (pre-existing, unrelated), duration ~30-42s.
- `quality-gate` (`npm test`, severity: error): PASS — same run.

**Check 1b (integration tier):**
- `integration-test` (`npm run test:evals`, severity: warning): FAIL (non-blocking, warning severity) — 381 pass / 12 fail out of 393 tests. All 12 failures trace to `tests/evals/integration-sandbox/reality-check.test.mjs` and related Postgres-integration-sandbox suites requiring a live PostgreSQL instance on port 5433, which is not running in this environment ("PostgreSQL IS running on port 5433" assertion fails, cascading into dependent gaming-detection and reality-check assertions). This is a pre-existing environment/infra dependency unrelated to the per-issue-attempt-cap feature — no file touched by this spec's implementation (`lib/bugfix-loop-attempts.mjs`, its test, the ADR, the manifest template, the ADR decision-table test) appears in the failure stack traces. Recorded as WARN per its declared `severity: warning`; does not block validation.

**Check 1c (e2e tier):** no gates configured — skipped.

Gate outcomes recorded via `adev report --type validator --gate-outcomes`:
- `test`: pass (tier: fast)
- `quality-gate`: pass (tier: fast)
- `integration-test`: fail (tier: integration, severity: warning — non-blocking)

manifest-sha: `967dd8f` (matches spec's `source-manifest.sha`)

Because Check 1 concluded PASS at error-severity (only a warning-severity gate failed), Checks 2 onward ran in full.

## Check 1.5: Source Manifest Verification — PASS

`adev source-manifest verify --spec ...` → `Check 1.5: PASS — source manifest matches (sha: 967dd8f)`.

Git-tracked implementation-existence check (validator-side, post-CLI) — all 5 manifest files are committed:
- `.context-index/adrs/0015-lifecycle-state-dual-format-coexistence.md` — commit `c51874fc`
- `lib/bugfix-loop-attempts.mjs` — commit `49b41f89` (latest touching commit)
- `templates/manifest-template.yaml` — commit `9dc5ae61`
- `tests/adrs/0015-decision-table.test.mjs` — commit `c51874fc`
- `tests/lib/bugfix-loop-attempts.test.mjs` — commit `49b41f89`

## Check 1.6: Code-Side Drift Warning — PASS (non-blocking)

`adev verify spec --check-drift` → `{"drifted":false,"drift_source":null,"drift_at":null}`. No drift detected.

## Check 2: Spec Compliance — PASS

Dispatched as a subagent-review check (profile `reviewer-capable`) per the registry. Full findings:

**Acceptance Criteria (13/13 PASS):**
1. `AttemptRecord` increments/updates `last_verdict` for FIXED/PARKED/UNREPRODUCIBLE — PASS (`lib/bugfix-loop-attempts.mjs:150,153-195`; tests `tests/lib/bugfix-loop-attempts.test.mjs:53-83`).
2. NO_PROGRESS/REGRESSED/BUDGET_EXHAUSTED computed via `lib/loop-convergence.mjs`, not reimplemented — PASS (`lib/bugfix-loop-attempts.mjs:23,178-187`; single call site, no local verdict logic).
3. First attempt never triggers NO_PROGRESS/REGRESSED — PASS (empty `prevBlockers` default + `loop-convergence.mjs`'s `prevSet.size > 0` guard; test `test.mjs:71-83`).
4. cap-1 first attempt → `BUDGET_EXHAUSTED`, not unset — PASS (test `test.mjs:85-95`; unconditional PARKED branch confirmed — no `if (prior)` gate).
5. UNREPRODUCIBLE → immediate `BUDGET_EXHAUSTED` — PASS (`bugfix-loop-attempts.mjs:162-169`; test `test.mjs:62-69`).
6. `AttemptRecord` persists in `lifecycle-state/`, survives restarts — PASS (disk-backed, no in-memory cache; `readAllRaw` re-reads from disk every call).
7. `curr_blockers` persisted and read back as next attempt's `prev_blockers` — PASS (round-trip test `test.mjs:97-106`).
8. Degraded-mode fallback persists only bounded SHA-256 hash, never raw output — PASS (`computeDegradedBlockerHash`, 8 hex chars; `rawOutput` never written to the record; test `test.mjs:108-119`).
9. ADR-0015 Decision-table entry for new artifact — PASS (`.context-index/adrs/0015-lifecycle-state-dual-format-coexistence.md:48`; test `tests/adrs/0015-decision-table.test.mjs:11-16` passes).
10. `lib/loop-convergence.mjs` unmodified — verified by diff review — PASS (`git diff` across the full feature commit range and `git log` show zero touches to the file; it was created in an unrelated prior commit `954a14f8`).
11. Corrupted state file fails open — PASS (`try/catch` around `JSON.parse`, warns, continues; test `test.mjs:22-29`).
12. All quality gates pass (`npm test`) — PASS (7166/7166 pass at time of Check 2's own run; matches Check 1).
13. No constitutional violations introduced — PASS (built-ins + local imports only; no dependency changes).

**Behaviors (7/7 PASS):** BEH-1 through BEH-7 all verified against source, including BEH-2's unconditional-call requirement and BEH-7's confirmation (via `grep -rn "attempt_cap\|AttemptRecord" skills/debug/SKILL.md` → zero matches, and `grep -rln` across `lib/` → only `lib/bugfix-loop-attempts.mjs` references these terms) that `/adev:debug` has no cap/AttemptRecord awareness. BEH-4 (sibling-spec exclusion set) is structurally consistent but not independently testable within this spec's own files (expected — it's consumed by a sibling spec).

**`lib/loop-convergence.mjs` unmodified — git evidence:** `git log --oneline -10 -- lib/loop-convergence.mjs` shows a single unrelated prior commit (`954a14f8`); `git diff` across this feature's full commit range for that file is empty.

**Scope Expansion Sub-Finding:** No finding. The plan's declared File Structure (5 files) and the actual diff across the six `Plan-task: 1`-`6` commits match exactly — no additions, no omissions, no `package.json`/`package-lock.json` changes.

**Test-integrity note (non-blocking):** the PARKED→REGRESSED path is not directly exercised through `recordDebugAttempt` in this module's own test file (REGRESSED logic itself is covered by `lib/loop-convergence.mjs`'s own suite). Recommended as a follow-up, does not affect the PASS verdict — all present assertions are exact-value, no loose matchers, no conditional skips, no assertions on non-deterministic data.

## Check 4: Constitution Compliance — PASS

Dispatched as a subagent-review check (profile `reviewer-capable`) per the registry, under the Evidence Contract (every finding cites file:line or grep evidence).

- **Architecture Boundaries — PASS.** `lib/bugfix-loop-attempts.mjs:19-23` imports only `node:fs`, `node:crypto`, `node:path`, and local `./errors.mjs`/`./loop-convergence.mjs`. `git diff` over the feature's commit range shows `package.json` untouched. No skill, hook-protocol, CLI-install-path, or plugin-registration file touched.
- **Non-Negotiable Principles — PASS.** Minimize-dependencies: built-ins + local imports only (`bugfix-loop-attempts.mjs:19-23`). Pure ESM: `grep -n "require(\|module.exports"` over the new/modified files returned no matches; all files are `.mjs` using `import`/`export`. `lib/loop-convergence.mjs` unmodified (`git diff`/`git log` empty over the feature range).
- **Coding Standards — PASS.** Kebab-case filename (`bugfix-loop-attempts.mjs`); import ordering (built-ins before relative imports, lines 19-23); camelCase naming throughout; `codedError` convention used (`mkErr('INVALID_ISSUE_ID', ...)` and `mkErr('UNSUPPORTED_OUTCOME', ...)`).
- **Commit trailer compliance — PASS.** All six feature commits (`ddeeb4d7`, `9dc5ae61`, `f4befa7c`, `a1407b7a`, `49b41f89`, `c51874fc`) carry both `Spec: .context-index/specs/features/autonomous-bugfix-loop/per-issue-attempt-cap.spec.md` and `Plan-task: <n>` trailers.

No `UNCITED_FINDING`s.

## Check 8: Boundary Compliance — PASS

`adev boundaries check --json` → verdict `PASS`, reason "no boundary violations in 255 changed file(s) against 3 rule(s)". One rule (`no-manual-version-bump`) is disabled with a documented reason (diff-unaware evaluator limitation) — unrelated to this spec. No registry warnings.

## Check 9: Transition Gates — PASS

`adev gate transitions --transition implement-to-validate --json` → verdict `PASS`, reason: "every required gate has a fresh, attested, passing outcome". Gate `test`: pass, `command_attested: true`.

## Check 11: Visual Verification — N/A (SKIP)

No UI files in the implementation diff (`lib/*.mjs`, an ADR, a YAML template, and `.test.mjs` files only — no `.tsx/.jsx/.vue/.svelte/.css/.scss/.html`, no `components/pages/views/public/app` paths). Case A of the trigger-guard matrix: "No UI files in implementation diff — visual verification not applicable."

## Check 14: Gate Executability and Test Collection — PASS (with warnings)

`adev gate doctor --json` → exit 0, 0 error-severity findings, 4 warning-severity findings:
- `runner-unknown` × 3 (gates `test`, `quality-gate`, `integration-test` all run via `npm test`/`npm run test:evals`, whose underlying runner `node:test` composition through `scripts/run-tests.mjs` isn't statically identifiable to the doctor).
- `ci-gate-not-invoked` × 1 (`integration-test` / `npm run test:evals` does not appear in any of the three discovered CI workflow files).

These are pre-existing, project-wide characteristics of the gate configuration, not introduced by this spec's implementation. Registry severity for this check is `warning`, so it does not affect the aggregate verdict.

---

**Summary:** 8 checks ran with a verdict (1, 1.5, 1.6, 2, 4, 8, 9, 14); 1 additional check (11) recorded N/A/SKIP by design (no UI files). 7 PASS, 1 PASS_WITH_NOTES (Check 1 — non-blocking warning-tier integration-test failure due to missing local Postgres infra), 0 FAIL.

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 12, and 13 have been relocated by `check-set-restructure.spec.md`. See:
>
> - `/adev:review-specs` — for ADR compliance (formerly Check 5), cross-cutting compliance (formerly Check 6), specialist review (formerly Check 7), and charter consistency (formerly Check 3, now covered by Check 2's scope-expansion sub-finding).
> - `/adev:hygiene` Audit Pass 20 — for platform drift (formerly Check 10).
> - `/adev:reconcile` lifecycle-sync — for lifecycle reconciliation (formerly Check 12, with `--fix` as the default mode).
> - `hooks/post-validate-extract-heuristics.{sh,mjs}` — for heuristic extraction (formerly Check 13 / `check-12-heuristic-extraction`), now a non-blocking Stop-event hook.
>
> Historic `.validate.md` reports continue to use the pre-restructure numbering; the gaps in the surviving inventory (Checks 1, 1.5, 1.6, 2, 4, 8, 9, 11, 14) are intentional to preserve report readability.
