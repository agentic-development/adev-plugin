# Validation Report: Live Spec: Cost-Checkpoint Lifecycle Events

> **Date:** 2026-05-24
> **Spec:** .context-index/specs/features/session-awareness/cost-checkpoint-events.spec.md
> **Plan:** .context-index/specs/features/session-awareness/cost-checkpoint-events.plan.md
> **Overall Status:** PASS_WITH_NOTES

---

## Check 1: Quality Gates — PASS

- **Tests (fast tier — `npm test`):** PASS — 4135/4137 pass, 0 fail, 2 todo (pre-existing)
- **Duration:** ~202 seconds

Check 1a (fast): npm test — PASS (201.9s)
Check 1b (integration): no integration-tier gates configured — SKIPPED
Check 1c (e2e): no e2e-tier gates configured — SKIPPED

## Check 1.5: Source Manifest Verification — PASS

`adev source-manifest verify` output: `Check 1.5: PASS — source manifest matches (sha: 1990758)`

All 8 manifest files verified present and committed to git:
- `.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md` — committed c1fd4f27
- `lib/cli/report.mjs` — committed b89feb13
- `lib/diagnostics/event-schemas.mjs` — committed de35bda2
- `lib/lifecycle-events.mjs` — committed 9da353d4
- `lib/lifecycle-state.mjs` — committed 594f030f
- `skills/build/SKILL.md` — committed 25444781
- `tests/cli/report-cost-checkpoint.test.mjs` — committed b89feb13
- `tests/lib/lifecycle-state-cost-checkpoint.test.mjs` — committed 184dd525

## Check 1.6: Code-Side Drift — PASS

`adev verify spec --check-drift` output: `{"drifted":false,"drift_source":null,"drift_at":null}`
No drift detected.

## Check 2: Spec Compliance — PASS_WITH_NOTES

### Acceptance Criteria Results

**AC 1: `lib/lifecycle-events.mjs::CANONICAL_EVENTS` contains `'cost_checkpoint'`** — PASS
- `lib/lifecycle-events.mjs:64`: `'cost_checkpoint'` present in the `CANONICAL_EVENTS` Set, with inline comment referencing the spec.
- Test: `tests/lib/lifecycle-state-cost-checkpoint.test.mjs:43-45` — strict `has()` assertion.

**AC 2: `REQUIRED_FIELDS_BY_EVENT.cost_checkpoint` equals `['event', 'ts', 'step', 'totals']`** — PASS
- `lib/diagnostics/event-schemas.mjs:176`: `cost_checkpoint: Object.freeze([...UNIVERSAL_REQUIRED, 'step', 'totals'])` where `UNIVERSAL_REQUIRED = ['event', 'ts']`.
- Test: `tests/lib/lifecycle-state-cost-checkpoint.test.mjs:49-53` — `deepStrictEqual`.

**AC 3: `reportCostCheckpoint(projectRoot, specPath, payload)` exported from `lib/lifecycle-state.mjs`** — PASS
- `lib/lifecycle-state.mjs:1147-1164`: function exported with correct signature. Appends `cost_checkpoint` event via `appendEvent`. Mirrors `reportStep` API contract.
- Test: `tests/lib/lifecycle-state-cost-checkpoint.test.mjs:67-89` — appends event with correct shape and `ts` field.

**AC 4: `adev report --type cost-checkpoint --totals-json` appends event; exit 0 silent** — PASS
- `lib/cli/report.mjs:353-434`: `--type cost-checkpoint` arm implemented with `--totals-json` mode.
- Test: `tests/cli/report-cost-checkpoint.test.mjs:89-112` — exit 0, silent stdout, one event appended.

**AC 5: `adev report --type cost-checkpoint --from-summary` reads aggregator and appends** — PASS
- `lib/cli/report.mjs:396-411`: `--from-summary` mode calls `aggregate()` and delegates to `reportCostCheckpoint`.
- Test: `tests/cli/report-cost-checkpoint.test.mjs:116-157` — fixture `.session-tracking.jsonl` produces event.

**AC 6: `--from-summary` with no data → no event appended; exit 0** — PASS
- `lib/cli/report.mjs:399-402`: `if (result.totals === null) return;` — silent exit 0.
- Test: `tests/cli/report-cost-checkpoint.test.mjs:161-184` — no events in JSONL.

**AC 7: `--totals-json` mutually exclusive with `--from-summary` → exit 1** — PASS
- `lib/cli/report.mjs:375-378`: mutual exclusion guard.
- Test: `tests/cli/report-cost-checkpoint.test.mjs:188-206` — exit 1, message matches `/mutually exclusive/i`.

**AC 8: `--step` outside allowed set → exit 1** — PASS
- `lib/cli/report.mjs:366-372`: `VALID_CHECKPOINT_STEPS` set check.
- Test: `tests/cli/report-cost-checkpoint.test.mjs:230-247` — exit 1, allowed values in message.

**AC 9: Spec path traversal or non-existence → exit 1 with `INVALID_SPEC_PATH`** — PASS
- `lib/cli/report.mjs:384-394`: `resolveContained` + `existsSync` guards.
- Tests: `tests/cli/report-cost-checkpoint.test.mjs:317-352` — path traversal + spec not found cases.

**AC 10: Tier-1 `adev/event-schema-valid` recognises `cost_checkpoint`; asserts `step` + `totals` presence** — PASS
- `lib/diagnostics/event-schemas.mjs:176`: entry added to `REQUIRED_FIELDS_BY_EVENT`.
- Test: `tests/lib/lifecycle-state-cost-checkpoint.test.mjs:208-238` — strict mode fixture rejects `cost_checkpoint` missing `step`, throws `GateError`.

**AC 11: Unknown discriminators continue to project under `unknownEvents[]`** — PASS
- Test: `tests/lib/lifecycle-state-cost-checkpoint.test.mjs:177-205` — `cost_foo` event preserved in `readEvents()` output.

**AC 12: `skills/build/SKILL.md` step 5/6 prose contains exactly one invocation of `adev report --type cost-checkpoint --from-summary`** — PASS
- `skills/build/SKILL.md:313`: exactly one invocation present in step 6.
- Test: `tests/lib/lifecycle-state-cost-checkpoint.test.mjs:135-146` — `match()` count === 1.

**AC 13: End-to-end test runs `/adev:build` against a fixture spec and asserts one `cost_checkpoint` per executed step** — PARTIAL
- No such end-to-end integration test was found in the test suite.
- The plan (Task 7) did not include this test in its coverage list (the spec AC was present but not reflected in the plan's task-7 test inventory). The plan listed 8 tests for Task 7; the e2e build integration test was the AC item not carried into the plan.
- Impact: Low. The CLI arm is tested end-to-end (CLI → aggregate → reportCostCheckpoint → JSONL), and the build skill prose is verified by a text-presence test. The missing test is a higher-level orchestration test that would require running `/adev:build` infrastructure.

**AC 14: Cost-summary verb read-only contract preserved** — PASS
- `tests/cli/cost-summary.test.mjs:209-244`: snapshot test before/after `adev cost summary` asserts no `.context-index/` mutation.

**AC 15: `lifecycle-event-log.spec.md` canonical-events table includes `cost_checkpoint`** — PASS
- `.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md:41,70,75`: `cost_checkpoint` present in the canonical-events naming table, the variants table, and the convenience-writers table.
- Test: `tests/lib/lifecycle-state-cost-checkpoint.test.mjs:119-131` — `includes('cost_checkpoint')` assertion.

**AC 16: `npm test` passes** — PASS
- 4135 pass, 0 fail, 2 todo (pre-existing).

**AC 17: No constitutional violations** — PASS (see Check 4)

### Summary

15 of 16 non-test acceptance criteria satisfied. 1 PARTIAL: the end-to-end build integration test (AC 13) was not implemented. The plan did not include this test in Task 7 scope. All core behaviors (emitter, CLI arm, schema registration, skill integration, read-only contract) are implemented and tested.

## Cross-Repo Dependency Validation — N/A

No workspace detected; no cross-repo `depends-on` references in spec frontmatter. Advisory: running repo-scoped inside workspace — cross-repo validation skipped (no cross-repo depends-on references).

## Check 4: Constitution Compliance — PASS

- **Architecture boundaries:** PASS — No new services, database tables, or unauthorized components introduced. The `cost_checkpoint` discriminator is an additive extension to the existing event lifecycle infrastructure.
- **Non-negotiable principles:**
  - "Minimize external dependencies" — PASS: `lib/cli/report.mjs` imports `aggregate` from `../cost-summary.mjs` (internal) and `reportCostCheckpoint` from `../lifecycle-state.mjs` (internal). Zero new external dependencies. `package.json` diff shows only version bump.
  - "Skills are primarily markdown" — PASS: `skills/build/SKILL.md` step 6 uses a plain `bash` code block with a CLI invocation (`adev report --type cost-checkpoint --from-summary`). No executable inline Node.js.
  - "Pure ESM" — PASS: both new test files use `.mjs` extension and `import`/`export`. No `require()` calls found in modified files.
  - "Hook protocol compliance" — PASS: new CLI arm follows exit 0 (success), exit 1 (arg errors), exit 2 (gate-blocked) contract.
  - "Version parity" — PASS: `package.json` and `.claude-plugin/plugin.json` both at `0.27.2`.
- **Coding standards:**
  - Naming: PASS — `reportCostCheckpoint` (camelCase function), `report-cost-checkpoint.test.mjs` (kebab-case file), `lifecycle-state-cost-checkpoint.test.mjs` (kebab-case file).
  - Import ordering: PASS — Node.js built-ins first, then relative imports in both test files.
  - Commit trailers: PASS — all 8 commits include `Spec:` and `Plan-task:` trailers.

## Check 8: Boundary Compliance — PASS

`.context-index/governance/boundaries.yaml` contains no boundary rules (`boundaries: []`). No patterns to evaluate.

## Check 9: Transition Gates — PASS (N/A)

`governance/gates.yaml` has `transitions: {}` (empty). No `implement-to-validate` or `implement-to-merge` transitions configured.

## Check 11: Visual Verification — PASS (N/A)

No UI files (`*.tsx`, `*.jsx`, `*.vue`, `*.svelte`, `*.css`, `*.html`, or files under `components/`, `pages/`, `views/`, `public/`) in the implementation diff. Visual verification not applicable.

---

**Summary:** 5 checks dispatched; 4 PASS, 1 PASS_WITH_NOTES (Check 2 — AC 13 e2e test missing), 0 FAIL, 2 SKIPPED/N/A (Check 8 no rules, Check 9 no transitions). Check 11 PASS (no UI files).

Missing test coverage (PARTIAL AC 13): The end-to-end test that runs `/adev:build` against a fixture spec and asserts `cost_checkpoint` events per executed step was not implemented. All other behaviors are fully tested. This is a low-severity gap since the CLI arm and skill prose integration are tested separately.

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 12, and 13 have been relocated by `check-set-restructure.spec.md`. See `/adev:review-specs`, `/adev:hygiene` Audit Pass 20, `/adev:reconcile`, and `hooks/post-validate-extract-heuristics.*` for the relocated checks.
