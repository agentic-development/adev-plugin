---
spec: .context-index/specs/features/implementation/review-provenance.spec.md
plan: .context-index/specs/features/implementation/review-provenance.plan.md
kind: validate
overall_status: PASS_WITH_NOTES
rigor_tier: full
date: 2026-08-18
---

# Validation Report: Skill Spec: Review-Round Provenance

> **Date:** 2026-08-18
> **Spec:** .context-index/specs/features/implementation/review-provenance.spec.md (revision 4)
> **Plan:** .context-index/specs/features/implementation/review-provenance.plan.md
> **Rigor tier:** full (risk_level: medium → policies.medium.validate_mode: full; no routing-easy override)
> **Overall Status:** PASS_WITH_NOTES

---

## Check 1: Quality Gates — PASS_WITH_NOTES

Gate source: `.context-index/governance/gates.yaml` (materialized, resolved via `adev domain load-gates`). 3 gates resolved: `test` (fast), `quality-gate` (fast, identical command to `test` — same `command_sha`), `integration-test` (integration, severity `warning`). No e2e-tier gates configured.

- **Check 1a (fast tier):** `npm test` — PASS (59.1s). 7232 tests, 7230 pass, 0 fail, 0 cancelled, 0 skipped, 2 pre-existing `todo`. Both `test` and `quality-gate` gate ids resolve to the identical command (`command_sha` match); executed once, outcome applied to both ids.
- **Check 1b (integration tier):** `npm run test:evals` — FAIL, severity `warning` (non-blocking, does not fail-fast). 403 tests, 380 pass, 23 fail, 0 skipped. All 23 failures are in `tests/evals/work-tracking/work-tracking.test.mjs` (reverse-index / file-tracing eval fixtures) — unrelated to any file in this spec's `source-manifest.files` and pre-existing on this branch.
- **Check 1c (e2e tier):** no gates configured — skipped.

Gate outcomes attested: `test=pass`, `quality-gate=pass`, `integration-test=fail` (warning severity, non-blocking). `manifest-sha: 5e853c4`.

## Check 1.5: Source Manifest Verification — PASS

`adev source-manifest verify --spec review-provenance.spec.md` → `Check 1.5: PASS — source manifest matches (sha: 5e853c4)`. All 15 files listed in the spec's `source-manifest.files` frontmatter were independently confirmed committed via `git log --oneline -1 -- <file>` (none untracked/staged-only):

367dacd3, c6176cc5, 1b1feffe (×2), b8b0d7cc (×2), e0e42d9e, a18df6f0 (×2), f68fba1e (×3) cover all 15 files.

## Check 1.6: Code-Side Drift — PASS

`adev verify spec --check-drift` → `{"drifted":false,"drift_source":null,"drift_at":null}`. No drift flag set.

## Check 14: Gate Executability and Test Collection — PASS_WITH_NOTES

`adev gate doctor --json` → 0 errors, 4 warnings: `runner-unknown` ×3 (`test`, `quality-gate`, `integration-test` all invoke `npm` scripts the doctor's static analysis doesn't resolve to a known collect-only runner) and `ci-gate-not-invoked` ×1 (`integration-test` / `npm run test:evals` not referenced in `.github/workflows/*.yml`). Pre-existing project-wide gate configuration; not introduced by this spec's changes.

## Check 2: Spec Compliance — PASS_WITH_NOTES

All 18 acceptance criteria in the spec verified PASS by reading actual source and test files (not plan checkboxes):

- Trailer shape, one-per-stage, commit-count=1 test: PASS — `lib/lifecycle-state.mjs` (`buildReviewRoundTrailer`), `skills/implement/SKILL.md:630`, `tests/skills/implement-review-provenance.test.mjs:36-68`.
- First-pass encoded positively (`=1`, no absence-inference): PASS — `tests/lifecycle/review-round-trailer.test.mjs:15-17`, `tests/lifecycle/review-round-event.test.mjs:45-55`.
- `cycles` = initial + fix passes, multi/single-cycle coverage: PASS — `tests/skills/implement-review-provenance.test.mjs:36-68`.
- `review_round` registered in `CANONICAL_EVENTS` + `REQUIRED_FIELDS_BY_EVENT`, accepted under `tag` and `strict`: PASS — `lib/lifecycle-events.mjs:87`, `lib/diagnostics/event-schemas.mjs:205-208`, `tests/diagnostics/tier1/event-schema-valid.test.mjs:131-165`, `tests/lifecycle/review-round-event.test.mjs:145-154`.
- `plan_task` payload unchanged (regression guard): PASS — `lib/lifecycle-state.mjs:1182-1194`, `tests/specs/review-provenance-amendments.test.mjs:53-63`.
- Producer-test fixtures (step 4): PASS — `tests/diagnostics/event-schemas.test.mjs:152-160`, `tests/diagnostics/tier1/event-schema-valid.test.mjs:131-165`.
- `reviewRounds` projection, last-wins, not in `unknownEvents[]`: PASS — `lib/lifecycle-state.mjs:2116-2124`, `tests/lifecycle/review-round-event.test.mjs:160-198`.
- `docs/cli-reference.md` enum parity: PASS — `docs/cli-reference.md:306`, `tests/cli/report-review-round.test.mjs:325-354`.
- `buildReviewRoundTrailer` sole producer, named in SKILL.md, rejection tests (CR/LF, control/ANSI, cap, enum, cycles<1): PASS — `lib/lifecycle-state.mjs:1408-1507`, `skills/implement/SKILL.md:634-636`, `tests/lifecycle/review-round-trailer.test.mjs` (265 lines).
- `reportReviewRound` closed allow-list + stage enum in the lib, rejects forged key/stage/cycles/findings regardless of caller: PASS — `lib/lifecycle-state.mjs:1267-1334`, `tests/lifecycle/review-round-event.test.mjs:93-120`, `tests/cli/report-review-round.test.mjs:186-229`.
- `findings` accepted for `code-quality`/`synthesized`, rejected for `spec-compliance` citing 2f: PASS — `lib/lifecycle-state.mjs:1235,1317-1323`, `tests/lifecycle/review-round-event.test.mjs:79-91`.
- `adev report --type review-round` emits and refuses loudly on malformed input: PASS — `lib/cli/report.mjs:517-603`, `tests/cli/report-review-round.test.mjs:112-229`.
- Missing `review_round` reads as unknown, never coerced to zero: PASS — `lib/lifecycle-state.mjs:1812` (`reviewRounds: {}`), `tests/lifecycle/review-round-event.test.mjs:200-207`.
- Last event per `(plan, task_id, stage)` authoritative: PASS — `lib/lifecycle-state.mjs:2123`, `tests/lifecycle/review-round-event.test.mjs:187-198`.
- Cross-spec amendments (`lifecycle-event-log.spec.md`, `plan-task-events.spec.md`) landed with this spec: PASS — both files amended, `tests/specs/review-provenance-amendments.test.mjs`.
- No `diagnostics.yaml` entry, no `TIER1_WRITE_TIME_RUNNERS` runner added: PASS — confirmed by grep (zero matches) and `tests/diagnostics/event-schemas.test.mjs:162-171`.
- Existing lifecycle logs validate unchanged, no migration: PASS — additive-only change; full `npm test` green.
- Dispatch counts / review outcomes unchanged (no behavior change): PASS — `tests/skills/implement-review-provenance.test.mjs:70-77` asserts Stage 1/Stage 2 prose and existing caps survive verbatim.
- `skills/implement/SKILL.md` step 2h item 4 updated to name the artifacts: PASS — `skills/implement/SKILL.md:631-649`.

**Test integrity:** No loose matchers, conditional skips, tautological assertions, or weakened tests found. `tests/lifecycle/review-round-trailer.test.mjs` includes defense-in-depth tests temporarily widening the frozen stage `Set` to exercise guards unreachable behind the enum check.

**Scope Expansion Sub-Finding (warning — raises this check from PASS to PASS_WITH_NOTES):** 3 files outside the spec's declared `source-manifest.files` (15 entries) and outside the plan's File Structure list:
1. `providers/codex/skills/implement/SKILL.md` (commit f68fba1e) — mirrors the `skills/implement/SKILL.md` step 2h change.
2. `providers/opencode/skills/implement/SKILL.md` (commit f68fba1e) — same mirror.
3. `tests/lifecycle/gate-outcomes.test.mjs` (commit c6176cc5) — one-line `EXPECTED_VARIANTS` pin-list update forced by the `CANONICAL_EVENTS` growth this spec explicitly authorizes.

Risk assessed as low — all three are mechanically coupled to the sanctioned change and introduce no independent behavior. Recommended action: on the next spec revision, add these three paths to `source-manifest.files`, or document the provider-mirror-sync convention as an implicit companion to any `skills/**/SKILL.md` edit.

## Check 4: Constitution Compliance — PASS

- Architecture boundaries: PASS — `lib/lifecycle-events.mjs:84-86` and `lib/diagnostics/event-schemas.mjs:204` both carry `[BOUNDARY: human-approved] … governed by ADR-0009` comments matching the existing `spec_amended` / `test_depth_assigned` convention. No new services, DB tables, auth changes, or dependencies.
- Non-negotiable principles (all 5): PASS — no new deps (`package.json` diff empty); no inline-Node in `skills/implement/SKILL.md` step 2h; pure ESM throughout (no `require`/`module.exports` in any touched file); hook protocol not applicable; version parity intact (`0.27.8` unbumped across `package.json`, `.claude-plugin/plugin.json`, `.cursor-plugin/plugin.json`).
- Commit-trailer convention (novel `key=value` shape, reject-not-coerce): PASS — `buildReviewRoundTrailer` (`lib/lifecycle-state.mjs:1408-1507`) rejects CR/LF, control/ANSI, out-of-enum stage, non-integer/`<1` cycles, and over-cap length; every branch throws `EVENT_SCHEMA_INVALID`, none rewrites input.
- Coding standards: PASS — camelCase functions, kebab-case `.mjs` files, Node-builtins-first import ordering, thrown-error-with-`.code` error handling.
- No inline-Node / no both-forms violation in SKILL.md: PASS — grep for `node -e`/`node --input-type`/`Run inline Node` against `skills/implement/SKILL.md` returned zero matches; step 2h names the helper and CLI verb only.

## Check 8: Boundary Compliance — PASS

`adev boundaries check --json` → verdict `PASS`, reason "no boundary violations in 19 changed file(s) against 3 rule(s)". `no-manual-version-bump` recorded as `disabled` (documented reason: evaluator is content-based, not diff-aware). No findings, no warnings.

## Check 9: Transition Gates — PASS

`adev gate transitions --transition implement-to-validate --json` → verdict `PASS`, reason "every required gate has a fresh, attested, passing outcome". Gate `test`: `pass` / `recorded-pass` / `command_attested: true`.

## Check 11: Visual Verification — N/A

No UI files (`*.tsx`, `*.jsx`, `*.vue`, `*.svelte`, `*.css`, `*.scss`, `*.html`, `components/`, `pages/`, `views/`, `public/`, `app/**/page.*`, `app/**/layout.*`) appear in this spec's `source-manifest.files` or the plan's file list. SKIP — "No UI files in implementation diff — visual verification not applicable."

---

**Summary:** 7 checks PASS, 0 checks FAIL, 3 checks PASS_WITH_NOTES (Check 1 — integration-tier warning-severity failure unrelated to spec scope; Check 2 — scope-expansion warning on 3 low-risk files; Check 14 — pre-existing gate-doctor warnings), 1 check N/A (Check 11, no UI files).

No blocking issues. The implementation satisfies all 18 acceptance criteria with verified file:line evidence, respects the constitution, and passes all error-severity quality gates. The two PASS_WITH_NOTES findings (integration-tier eval failures, scope-expansion on provider mirrors + a pin-list test) are advisory and pre-existing / low-risk respectively — recommended as follow-up, not blockers.

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 11 (when no UI files), 12, and 13 have been relocated by `check-set-restructure.spec.md`. See:
>
> - `/adev:review-specs` — for ADR compliance (formerly Check 5), cross-cutting compliance (formerly Check 6), specialist review (formerly Check 7), and charter consistency (formerly Check 3, now covered by Check 2's scope-expansion sub-finding).
> - `/adev:hygiene` Audit Pass 20 — for platform drift (formerly Check 10).
> - `/adev:reconcile` lifecycle-sync — for lifecycle reconciliation (formerly Check 12, with `--fix` as the default mode).
> - `hooks/post-validate-extract-heuristics.{sh,mjs}` — for heuristic extraction (formerly Check 13 / `check-12-heuristic-extraction`), now a non-blocking Stop-event hook.
