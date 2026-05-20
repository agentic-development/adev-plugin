# Validation Report: JSONL Drift Events

> **Date:** 2026-05-18
> **Spec:** .context-index/specs/features/spec-drift-detection/jsonl-drift-events.spec.md
> **Plan:** .context-index/specs/features/spec-drift-detection/jsonl-drift-events.plan.md
> **Overall Status:** PASS

---

## Check 1: Quality Gates — PASS

- Tier 1a (fast): `npm test` — PASS (3219/3219 pass, 0 fail, 2 todo, 37.2s)
- Tier 1b (integration): SKIP — no integration gates configured
- Tier 1c (e2e): SKIP — no e2e gates configured

## Check 1.5: Source Manifest Verification — PASS

- Manifest sha `735c4c4` matches current SHA-256 of the 9 listed files (verified via `verifyManifest()` in `lib/source-manifest.mjs`).
- Note: `adev source-manifest verify --spec` CLI returned SKIP (parser did not recognize the block under `kind: refactor` + `mode: refactor`). Direct lib call confirmed `matches: true, currentSha: 735c4c4`. Validator-side git-tracked check confirms all 9 files committed:
  - `lib/cli/verify.mjs` — committed `067a71f`
  - `lib/diagnostics/event-schemas.mjs` — committed `c8c1794`
  - `lib/lifecycle-events.mjs` — committed `c8c1794`
  - `lib/spec-drift.mjs` — committed `5397d7c`
  - `scripts/migrate-drift-fields.mjs` — committed `0826d41`
  - `tests/cli/verify.test.mjs` — committed `067a71f`
  - `tests/integration/spec-drift-no-merge-conflict.test.mjs` — committed `0f7101d`
  - `tests/lib/spec-drift.test.mjs` — committed `5397d7c`
  - `tests/scripts/migrate-drift-fields.test.mjs` — committed `0826d41`

## Check 1.6: Code-Side Drift — PASS

- `adev verify spec --check-drift --spec <this>` → `{drifted: false, drift_source: null, drift_at: null}`

## Check 2: Spec Compliance — PASS

All 11 acceptance criteria from spec rev 2 verified:

- **AC1** All existing `tests/lib/spec-drift.test.mjs` cases pass — PASS (run dedicated, 0 fail)
- **AC2** New tests cover all required categories — PASS
  - JSONL emission on stamp (`code_drift_detected appended` in `tests/lib/spec-drift.test.mjs`)
  - JSONL emission on clear (`code_drift_cleared` cases)
  - Multi-source append (separate-events test)
  - `hasDrift` reads inline boolean (regression cases)
  - `verify check-drift` sources from JSONL (`tests/cli/verify.test.mjs` 3-case suite)
  - Migration idempotency (`tests/scripts/migrate-drift-fields.test.mjs` already-migrated / needs-migration / partial-state cases)
  - Migration dry-run side-effect-free (SEC-5)
  - Path canonicalization + `PATH_TRAVERSAL_REJECTED` (SEC-1)
  - Concurrent migration + hook race (SEC-3, in migrate-drift-fields.test.mjs)
  - Legacy frontmatter validation (SEC-4)
  - Per-spec lock-scope (SEC-6, concurrent-stamps test)
- **AC3** No `drift_source:` / `drift_at:` fields remain in any `.context-index/specs/**/*.spec.md` frontmatter — PASS (grep returns 0 matches)
- **AC4** Two-branch concurrent stamp merges with zero conflicts (Behavior 8 — headline) — PASS (`tests/integration/spec-drift-no-merge-conflict.test.mjs` passes)
- **AC5** Charter rev 3, Invariant 4 rewritten, "Multi-file Drift Tracking" REMOVED from Deferred and added to active Capability Map — PASS (charter `revision: 3`; capability appears once in active map, zero times in Deferred; Invariant 4 rewritten as "Every detection appends a `code_drift_detected` event…")
- **AC6** `lifecycle-event-log.spec.md` canonical event-variant table contains `code_drift_detected` and `code_drift_cleared` — PASS (both rows present)
- **AC7** All quality gates pass — PASS (Check 1 above)
- **AC8** `/adev:validate` passes for this spec — PASS (this run)
- **AC9** No constitutional violations — PASS (see Check 4)
- **AC10** `adev verify check-drift` JSON output shape `{drifted, drift_source, drift_at}` unchanged — PASS (confirmed via CLI)
- **AC11** `adev verify check-drift` <100ms on a spec with 100 accumulated JSONL events (CON-5) — PASS (perf test in `tests/cli/verify.test.mjs:570` passes within budget)

## Check 4: Constitution Compliance — PASS

- **No new external dependencies:** `git diff package.json package-lock.json` shows no changes between `origin/main` and `HEAD`.
- **Pure ESM:** All 9 modified/created code files are `.mjs` (Principle 3).
- **Hook protocol compliance:** No `hooks/` files modified — `sync-trigger.sh` unchanged. (Principle 4)
- **Version parity:** `package.json` and `.claude-plugin/plugin.json` both at `0.26.0` (Principle 5).
- **Architecture boundaries:** Only existing skills' prose updated (`validate`, `plan`, `hygiene`). No new skills added to lifecycle order. No CLI installation path change. No plugin registration format change.
- **Coding standards:** camelCase functions (`stampDrift`, `clearDrift`, `hasDrift`); kebab-case filenames (`migrate-drift-fields.mjs`); files placed correctly per CLAUDE.md context routing.

## Check 8: Boundary Compliance — PASS

- `.context-index/governance/boundaries.yaml` is configured with `boundaries: []` (no rules defined).
- Nothing to violate.

## Check 9: Transition Gates — SKIP

- `.context-index/governance/gates.yaml` has `transitions: {}` (none configured).

## Check 11: Visual Verification — N/A

- No UI files in implementation diff (no `.tsx`, `.jsx`, `.css`, `.scss`, `.html`, or `components/`/`pages/`/`views/`/`app/**/page.*` files modified).
- Trigger guard Case A: SKIP.

---

**Summary:** 7 passed, 0 failed, 2 skipped (Check 9 — no transitions; Check 11 — no UI). The implementation satisfies the spec, stays within charter scope, respects the constitution, and passes all quality gates.

---

> Validator events emitted (8 events): `check-1-quality-gates`, `check-1.5-source-manifest`, `check-1.6-code-drift`, `check-2-spec-compliance`, `check-4-constitution`, `check-8-boundaries`, `check-9-transition-gates`, `check-11-visual-verification`. Each event was stamped severity=warning by the lib (defaulted because validators are not yet declared in domain "software" `validate.yaml` — operational note, not a validation finding).
