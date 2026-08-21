---
partial_schema: validate@1
---

# Validation Report: Tracker Provider Bridge

> **Date:** 2026-08-20
> **Spec:** .context-index/specs/features/autonomous-bugfix-loop/tracker-provider-bridge.spec.md
> **Plan:** .context-index/specs/features/autonomous-bugfix-loop/tracker-provider-bridge.plan.md
> **Rigor tier:** full (resolved from risk_level: medium → policies.medium.validate_mode: full; no explicit --tier or routing override)
> **Overall Status:** PASS (aggregate verdict: PASS_WITH_NOTES — no FAILs, multiple PASS_WITH_NOTES)

---

## Check 1: Quality Gates — PASS_WITH_NOTES

**Check 1a (fast tier):**
- `test` (npm test): PASS — 7319 tests, 7317 pass, 0 fail, 2 todo (pre-existing, unrelated)
- `quality-gate` (npm test): PASS — same command, same run

**Check 1b (integration tier):**
- `integration-test` (npm run test:evals): WARN (severity: warning, does not block) — 4 failures:
  - `tests/orders.integration.test.mjs` → `tests/evals/integration-sandbox/build-without-db.test.mjs:274` — `ERR_MODULE_NOT_FOUND: Cannot find package 'pg'`. Environmental: the sandbox fixture's no-DB test expects an `ECONNREFUSED`-style connection error but the `pg` package itself isn't installed in this environment.
  - `tests/evals/integration-sandbox/reality-check.test.mjs` (3 failures) — `verifySpecImplemented` against the fixture `customer-orders` spec returns `implemented:false` instead of the expected `true`.
  - **Root-cause investigation:** confirmed pre-existing and unrelated to this spec's implementation. Reran `node --test tests/evals/integration-sandbox/reality-check.test.mjs` directly against the main repo checkout on an unrelated branch (`fix/ci/bootstrap-version-driver-on-next`, no tracker-provider-bridge changes present) — identical 3 failures reproduce there. `lib/reality-check.mjs` is not in this spec's source-manifest and was not touched by the 24c52aa7..07cd1b6d commit range. Environmental/pre-existing gap, not a regression introduced by this implementation.

**Check 1c (e2e tier):** SKIP — no gates configured for the e2e tier.

**Tier summary:**
| Tier | Gate | Result | Notes |
|---|---|---|---|
| fast | test | PASS | 7317/7319 pass, 2 pre-existing todo |
| fast | quality-gate | PASS | same command as `test` |
| integration | integration-test | WARN (fail, severity: warning) | pre-existing, confirmed on unrelated branch |
| e2e | — | SKIP | no gates configured |

Gate outcomes recorded via `--gate-outcomes`: `test: pass`, `quality-gate: pass`, `integration-test: fail` (tier: integration, severity warning — non-blocking).

## Check 1.5: Source Manifest Verification — PASS

`adev source-manifest verify --spec ...` → `Check 1.5: PASS — source manifest matches (sha: 55e587f)`.

Implementation-existence check: all 22 files listed in the spec's `source-manifest.files` verified present in `git log --oneline -1 -- <file>` (none untracked/uncommitted-only).

## Check 1.6: Code-Side Drift Warning — PASS

`adev verify spec --check-drift` → `{"drifted":false,"drift_source":null,"drift_at":null}`. No drift detected.

## Check 2: Spec Compliance — PASS_WITH_NOTES

Dispatched as a subagent review against all 19 Acceptance Criteria bullets in the spec. 18/19 criteria PASS with file:line citations (see full subagent trace in the lifecycle log `validator_report` for `validate.check-2-spec-compliance`); summary:

- Criteria 1, 2, 4-19: **PASS** — inbound-sync idempotency, title/body caps + nonce-scoped fence, `affected_modules: []`, outbound comment-only writeback, unreachable/oversized 5-turn persisted counters, `escapeField` scoping bullet accuracy, label-removal non-retroactivity, ADR-0015 registration, single-adapter registry, registry-resolution-not-hardcoded, `accepted_at`/`last_synced_at`/`last_comment_id` readers, stale-link once-per-run dedup, no `provider` field on `TrackerSyncLink`, end-to-end test coverage, `npm test` green, no constitutional violations — all cited against actual `Read`-tool file content (e.g. `lib/tracker-provider-bridge/inbound-sync.mjs:94-136`, `lib/provider/tracker-providers/github-tracker-adapter.mjs:97-131`, `lib/tracker-sync-links.mjs:102-114`, `lib/bugfix-loop-run.mjs:218-289`, `.context-index/adrs/0015-lifecycle-state-dual-format-coexistence.md:50`).
- Criterion 3 (fence-collision detection): **PARTIAL** — the collision-detection code and neutralization are correctly implemented and tested (`github-tracker-adapter.mjs:114-121`; `tests/lib/github-tracker-adapter.test.mjs:57-63` asserts `collided === true` and no unescaped forged prefix in the stored text), but no test in the repo asserts that the collision warning is actually logged (`console.warn` naming the issue number) — part (b) of the AC's own "verified by" clause is unmet. This is a test-coverage gap, not a code defect.

### Scope Expansion Sub-Finding — WARN

6 files touched in the 24c52aa7..07cd1b6d range fall outside the spec's declared `source-manifest.files` (22 entries):
- `.context-index/specs/features/autonomous-bugfix-loop/charter.md` — status-stamp update (planned → implemented), not new source
- `.context-index/lifecycle-state/tracker-provider-bridge.jsonl` — adev lifecycle event log, process metadata
- `providers/codex/skills/bugfix-loop/SKILL.md`, `providers/codex/skills/debug/SKILL.md`, `providers/opencode/skills/bugfix-loop/SKILL.md`, `providers/opencode/skills/debug/SKILL.md` — auto-regenerated mirrors of the in-scope `skills/bugfix-loop/SKILL.md` / `skills/debug/SKILL.md` (commit `0f41ee87`); CLAUDE.md itself notes provider mirrors are out of scope for related sweeps
- `tests/adrs/0015-decision-table.test.mjs`, `tests/lib/bugfix-loop-run.test.mjs` — companion test extensions for already-declared source files (ADR-0015, `lib/bugfix-loop-run.mjs`)

None represent unreviewed new capability — all are process bookkeeping, generated mirrors, or test companions to declared files. Recommended: update `source-manifest.files` to include the two test-companion files and the charter/lifecycle-log paths on a future revision (non-blocking).

## Check 4: Constitution Compliance — PASS

Dispatched as a subagent review against `.context-index/constitution.md` / CLAUDE.md with an evidence contract requiring file:line or grep citations for every finding.

- **Architecture boundaries:** PASS — `package.json` and `.claude-plugin/plugin.json` diffs empty across the full commit range (no new dependency); `gh` CLI reuse via argv-array `execFileSync`, never shell-interpolated (`lib/provider/tracker-providers/github-tracker-adapter.mjs:46-53,75-79,145`). No new service/DB/auth-flow change — new surface is one CLI verb registration (`cli/index.mjs:1971`), one `issues show` subcommand (`lib/cli/issues.mjs:96-101`), and an append-only JSONL log matching existing ADR-0015 precedent.
- **Non-negotiable principles:** PASS — dependency minimization confirmed (empty `package.json` diff, no `require`/`module.exports` in new files); no inline-Node in edited `skills/bugfix-loop/SKILL.md` / `skills/debug/SKILL.md` or their provider mirrors (grep for `node -e`/`Run inline Node` — no matches); all new lib files are pure ESM `.mjs`; version parity untouched (no manual bump).
- **Coding standards:** PASS — kebab-case files, camelCase exports, correct Node-builtins-then-relative import ordering verified in `github-tracker-adapter.mjs:25-27`, `tracker-sync-links.mjs:25-26`, `tracker-sync.mjs:20-22`.
- **Commit trailers:** PASS — all 15 commits in the 24c52aa7..07cd1b6d range carry the `Spec:` trailer; task-implementing commits carry sequential `Plan-task: N` trailers (2 through 13).

## Check 8: Boundary Compliance — PASS

`adev boundaries check --json` → verdict PASS, reason "no boundary violations in 311 changed file(s) against 3 rule(s)". 1 rule disabled (`no-manual-version-bump`, documented reason: evaluator is content-match not diff-aware). No findings, no registry warnings.

## Check 9: Transition Gates — PASS

`adev gate transitions --transition implement-to-validate --spec ... --json` → verdict PASS, reason "every required gate has a fresh, attested, passing outcome". Gate `test`: pass, `command_attested: true`.

## Check 11: Visual Verification — N/A

Trigger guard evaluated: no UI file patterns (`*.tsx`, `*.jsx`, `*.vue`, `*.svelte`, `*.css`, `*.scss`, `*.html`, `components/`, `pages/`, `views/`, `public/`, `app/**/page.*`, `app/**/layout.*`) present in the `git diff --stat 24c52aa7..07cd1b6d` output. Case A (no UI files, Playwright status irrelevant) → SKIP. This is a CLI/backend integration spec.

## Check 14: Gate Executability and Test Collection — PASS_WITH_NOTES

`adev gate doctor --json` → 0 errors, 4 warnings (all pre-existing, project-wide, not introduced by this spec):
- `runner-unknown` × 3 (gates `test`, `quality-gate`, `integration-test` — doctor cannot identify `npm test` / `npm run test:evals` as a known runner, so collection isn't independently verified)
- `ci-gate-not-invoked` (gate `integration-test` does not appear in `.github/workflows/ci.yml`, `propagate-to-next.yml`, or `release.yml`)

---

**Summary:** 9 checks dispatched (1, 1.5, 1.6, 2, 4, 8, 9, 11, 14). 6 PASS, 3 PASS_WITH_NOTES (Check 1 — pre-existing integration-tier warning; Check 2 — one PARTIAL AC + scope-expansion advisory; Check 14 — pre-existing gate-doctor warnings), 0 FAIL, 0 SKIP-with-blocking-implication (Check 1c and Check 11 SKIP for legitimate non-applicability — no e2e gates configured, no UI files touched). Aggregate lifecycle projection (`adev state current`) confirms verdict: **PASS_WITH_NOTES**.

No FAILs were recorded, so this run does not trigger the heuristics-on-FAIL step.

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 11 (when no UI files), 12, and 13 have been relocated by `check-set-restructure.spec.md`. See:
>
> - `/adev:review-specs` — for ADR compliance (formerly Check 5), cross-cutting compliance (formerly Check 6), specialist review (formerly Check 7), and charter consistency (formerly Check 3, now covered by Check 2's scope-expansion sub-finding).
> - `/adev:hygiene` Audit Pass 20 — for platform drift (formerly Check 10).
> - `/adev:reconcile` lifecycle-sync — for lifecycle reconciliation (formerly Check 12, with `--fix` as the default mode).
> - `hooks/post-validate-extract-heuristics.{sh,mjs}` — for heuristic extraction (formerly Check 13 / `check-12-heuristic-extraction`), now a non-blocking Stop-event hook.
>
> Historic `.validate.md` reports continue to use the pre-restructure numbering; the gaps in the surviving inventory (Checks 1, 1.5, 1.6, 2, 4, 8, 9, 11, 14) are intentional to preserve report readability.
