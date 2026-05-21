# Validation Report: Backend Migration

> **Date:** 2026-05-19
> **Spec:** .context-index/specs/features/task-management/backend-migration.spec.md
> **Plan:** .context-index/specs/features/task-management/backend-migration.plan.md
> **Overall Status:** PASS_WITH_NOTES

---

## Check 1: Quality Gates — PASS_WITH_NOTES
- Tests (`npm test`): 3475/3478 pass, 1 fail, 2 todo
  - **Failure:** `tests/skills/plan-task-immutability.test.mjs` — flags `orphan-lock-cleanup.plan.md` modification (firstPendingTs 2026-05-18T21:58:47.878Z, lastModifiedTs 2026-05-19T17:00:58-03:00).
  - **Attribution:** This file belongs to the **agent-reliable-state-artifacts** charter and was last modified by commit `bad36e0` (milestone rename 0.27.0→0.27.1) and `12dd7a7` (orphan-lock-recovery docs), both unrelated to the backend-migration spec.
  - **Severity classification:** The implement summary acknowledged "3 pre-existing failures unrelated"; this is one of them (the other two appear to have been resolved by intervening fixes). Since this failure pre-dates and is independent of the backend-migration implementation, the validator records it as a known pre-existing condition rather than a regression introduced by this spec.
  - **Backend-migration test isolation:** `tests/lib/cli-issues-migrate.test.mjs` runs in isolation with 44/44 PASS (zero failures across all 9 plan-task behavior groups + coverage sweep).
- Lint: not configured in `governance/gates.yaml` (only `test` gate present)
- Typecheck: not configured (Node.js ESM project, no TypeScript)

[Note: Quality-gate failure is recorded as PASS_WITH_NOTES because it is pre-existing and external to this spec's scope. Checks 1.5 through 11 proceeded based on this attribution.]

## Check 1.5: Source Manifest Verification — PASS
- `adev source-manifest verify` exit 0
- `Check 1.5: PASS — source manifest matches (sha: fc0c9a5)`
- All 6 manifest files exist on disk and SHAs match:
  - `.context-index/adrs/0014-backend-migration-stderr-policy.md`
  - `.gitignore`
  - `cli/index.mjs`
  - `lib/cli/issues-migrate.mjs`
  - `lib/cli/issues.mjs`
  - `tests/lib/cli-issues-migrate.test.mjs`

## Check 1.6: Code-Side Drift Warning — PASS
- `adev verify spec --check-drift` → `{"drifted":false,"drift_source":null,"drift_at":null}`
- No drift detected. Spec frontmatter `drift_detected` flag is absent/false.

## Check 2: Spec Compliance — PASS

**All 19 Behaviors verified against actual source files:**

- **Behavior 1** (`--from` absent → use manifest `tasks.backend`): PASS — `lib/cli/issues-migrate.mjs:836-839` `resolveSource()` reads `manifest.tasks.backend`. Test `tests/lib/cli-issues-migrate.test.mjs:1303` ("uses manifest tasks.backend as source when --from is absent").
- **Behavior 2** (`--from <backend>` overrides): PASS — `lib/cli/issues-migrate.mjs:836` checks `opts.from` first.
- **Behavior 3** (source == target → `MIGRATE_NOOP`): PASS — `lib/cli/issues-migrate.mjs:929-934`.
- **Behavior 4** (`--to` missing → `MIGRATE_MISSING_TARGET`): PASS — `lib/cli/issues-migrate.mjs:897-904`.
- **Behavior 5** (unknown backend → `MIGRATE_UNKNOWN_BACKEND`): PASS — `lib/cli/issues-migrate.mjs:908-914`, sources from `SUPPORTED_BACKENDS` per SEC-2.
- **Behavior 6** (`--to file` → `MIGRATE_TARGET_READONLY`): PASS — `lib/cli/issues-migrate.mjs:917-923`, `READONLY_BACKENDS` set at line 31.
- **Behavior 7** (br not on PATH → `BEADS_NOT_AVAILABLE` before source read): PASS — `lib/cli/issues-migrate.mjs:946-951` calls `validateEnvForTarget()` (lines 848-876) before `readSource()`.
- **Behavior 8** (malformed source → `MIGRATE_SOURCE_INVALID`): PASS — `lib/cli/issues-migrate.mjs:131-160` wraps adapter errors with `MIGRATE_SOURCE_INVALID`.
- **Behavior 9** (json → beads: create/createEpic field-passthrough): PASS — `lib/cli/issues-migrate.mjs:418-426` `projectIssueForCreate` strips id/dependencies but preserves title, type, priority, notes, epicId, parent_id, planRef, spec_ref, next_action. Test `tests/lib/cli-issues-migrate.test.mjs` ("passes the documented field set verbatim to target create()").
- **Behavior 10** (beads → json: same field set): PASS — same path; plus original_id marker injected at `lib/cli/issues-migrate.mjs:481-488`.
- **Behavior 11** (already-on-target → skip + increment counter): PASS — `lib/cli/issues-migrate.mjs:464-475` checks `alreadyMigratedIssueIds`.
- **Behavior 12** (scope filter default-excludes closed; `--include-closed` retains): PASS — `lib/cli/issues-migrate.mjs:162-165`.
- **Behavior 13** (replay edges via `addDependency`): PASS — `lib/cli/issues-migrate.mjs:633-678` `replayDependencies()`.
- **Behavior 14** (out-of-scope edge → warn + skip, no abort): PASS — `lib/cli/issues-migrate.mjs:636-643` emits warning to stderr.
- **Behavior 15** (`--dry-run` → read-only, JSON to stdout, exit 0): PASS — `lib/cli/issues-migrate.mjs:990-1001`.
- **Behavior 16** (live success → JSON stdout + manifest-update stderr + exit 0): PASS — `lib/cli/issues-migrate.mjs:1082-1096`.
- **Behavior 17** (live failure → `MIGRATE_PARTIAL_FAILURE` + `.migrate-state.json`): PASS — `lib/cli/issues-migrate.mjs:501-528`; stderr forwarded verbatim per SEC-1/ADR-0014.
- **Behavior 18** (resume from `.migrate-state.json` on re-invocation): PASS — `lib/cli/issues-migrate.mjs:326-373` `loadResumeState()`. Test "resumes from next index on re-invocation after partial failure".
- **Behavior 19** (`--auto` does NOT modify manifest): PASS — `lib/cli/issues-migrate.mjs:813-816` accepts `--auto` but no manifest write occurs; only `manifestUpdateSuggestion()` printed to stderr (line 1091). Test ("manifest.yaml is byte-equal before and after a live run under --auto") at `tests/lib/cli-issues-migrate.test.mjs:1336-1386`.

**All 8 Postconditions verified:**

1. Target board fully populated: PASS — field passthrough at `lib/cli/issues-migrate.mjs:418-426`.
2. Idempotency map (json→beads): PASS — `BeadsAdapter.create()` writes `.beads-map.json`; verb reads it at `lib/cli/issues-migrate.mjs:93-101`.
3. Idempotency match (beads→json): PASS — `(title, spec_ref)` + `original_id` index at `lib/cli/issues-migrate.mjs:253-272`.
4. Dependency graph replayed: PASS — `replayDependencies()` (line 598).
5. Manifest preserved (no auto-write): PASS — no `writeFileSync` of manifest.yaml exists in `lib/cli/issues-migrate.mjs`; only `loadManifest` consumers. Test asserts byte-equality.
6. Resumable on failure: PASS — `writeMigrateState()` per-item (lines 463-500), `loadResumeState()` (lines 326-373).
7. Dry-run leaves no state: PASS — early exit at line 999 before any write path.
8. `.migrate-state.json` gitignored: PASS — `.gitignore:80` contains `.context-index/tasks/.migrate-state.json`.

**All Error Cases verified** — see Behaviors 3-8, 17 above.

**Acceptance Criteria:**
- [x] `adev issues migrate --to <backend>` registered in `cli/index.mjs:1339`.
- [x] All postconditions hold (above).
- [x] Error cases return documented exit-non-zero + error code.
- [x] `--dry-run` writes nothing (Behavior 15 evidence).
- [x] Idempotent re-runs (json→beads and beads→json) — tested in coverage sweep.
- [x] Partial-failure path resumable — test "resumes from next index on re-invocation after partial failure".
- [x] `.gitignore` contains `.migrate-state.json` (line 80).
- [x] manifest.yaml byte-equal — test "manifest.yaml is byte-equal before and after a live run under --auto".
- [x] Dependency edges to out-of-scope: warnings, not silent drops — `replayDependencies` line 636-643.
- [x] BeadsAdapter and JsonAdapter interfaces unchanged — verb imports existing methods only; no adapter file modifications in source manifest.
- [x] All existing task-management tests pass — backend-migration test suite 44/44; full suite single unrelated failure (see Check 1).
- [x] Constitution gates pass (see Check 4).

## Check 4: Constitution Compliance — PASS

- **Architecture boundaries:** PASS — no new services, no DB tables, no auth changes, no new external dependencies. Existing adapter contracts (`BeadsAdapter`, `JsonAdapter`, `FileAdapter`) composed via `getIssueManager()` from `lib/issues/registry.mjs` (read-only consumer).
- **Non-Negotiable Principles:**
  - **Principle 1 (Minimize external dependencies):** PASS — `lib/cli/issues-migrate.mjs:18-29` imports only Node.js built-ins (`node:fs`, `node:path`, `node:crypto`) and project-local modules.
  - **Principle 2 (Skills primarily markdown):** N/A — no SKILL.md added; CLI verb only.
  - **Principle 3 (Pure ESM):** PASS — `lib/cli/issues-migrate.mjs` and `lib/cli/issues.mjs` use ESM `import`/`export`; `.mjs` extension; no `require`.
  - **Principle 4 (Hook protocol compliance):** N/A — no hooks added.
  - **Principle 5 (Version parity):** N/A — no version bump in this spec.
- **Coding Standards:**
  - Naming: camelCase functions (`readSource`, `replayDependencies`, etc.), kebab-case files (`issues-migrate.mjs`).
  - File structure: CLI helpers in `lib/cli/`, tests in `tests/lib/`.
  - Import ordering: Node built-ins first (lines 18-27), then relative (line 29).
  - Error handling: `process.exit` returned via numeric return codes; descriptive error codes (`MIGRATE_NOOP`, `MIGRATE_PARTIAL_FAILURE`, etc.) on stderr.
  - Logging: `console.log` for JSON stdout reports, `console.error` for diagnostics/warnings.
- **Commit Trailers:** verified via implement-step commits 89ac799, c9764e8, 98c6fca, c73e8a1, 03817b2, e1e3936, 4ec3ae1, 7ed55db, 3639a42 — all include `Spec:` + `Plan-task:` trailers per `/adev:implement` requirement.
- **Anti-patterns avoided:** No inline-Node in SKILL.md (no SKILL.md added); no hardcoded `~/.claude/` paths; no CommonJS.

## Check 8: Governance Boundaries — PASS
- `.context-index/governance/boundaries.yaml` has empty `boundaries: []` list. No rules to evaluate. PASS (no rules configured).

## Check 9: Transition Gates — PASS
- `.context-index/governance/gates.yaml` has empty `transitions: {}` block. No transitions configured. PASS (no transitions configured).

## Check 11: Visual Verification — N/A (SKIP)
- No UI files (`*.tsx`, `*.jsx`, `*.vue`, etc.) in implementation diff.
- Diff scope: `.context-index/adrs/0014-…`, `.gitignore`, `cli/index.mjs`, `lib/cli/issues-migrate.mjs`, `lib/cli/issues.mjs`, `tests/lib/cli-issues-migrate.test.mjs`.
- Visual verification not applicable.

---

**Summary:** 7 passed, 0 failed, 1 skipped, 1 PASS_WITH_NOTES (Check 1 — pre-existing unrelated test failure documented above).

The backend-migration implementation fully satisfies the spec contract:
- All 19 behaviors, 8 postconditions, and 9 error cases evidenced against actual source code.
- 44/44 dedicated tests pass in `tests/lib/cli-issues-migrate.test.mjs`.
- Source manifest SHA matches (no drift since stamping).
- Constitution principles upheld (Pure ESM, zero new deps, board-granularity invariant preserved).
- ADR-0014 documents the SEC-1 stderr-passthrough decision.

The single npm-test failure (plan-immutability check on `orphan-lock-cleanup.plan.md` in the agent-reliable-state-artifacts module) is unrelated to this spec — it stems from milestone-rename and orphan-lock-recovery commits in a different charter. This is noted in the implement summary as pre-existing test debt.

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 11 (when no UI files), 12, and 13 have been relocated by `check-set-restructure.spec.md`. See:
>
> - `/adev:review-specs` — for ADR compliance (formerly Check 5), cross-cutting compliance (formerly Check 6), specialist review (formerly Check 7), and charter consistency (formerly Check 3, now covered by Check 2's scope-expansion sub-finding).
> - `/adev:hygiene` Audit Pass 20 — for platform drift (formerly Check 10).
> - `/adev:reconcile` lifecycle-sync — for lifecycle reconciliation (formerly Check 12, with `--fix` as the default mode).
> - `hooks/post-validate-extract-heuristics.{sh,mjs}` — for heuristic extraction (formerly Check 13 / `check-12-heuristic-extraction`), now a non-blocking Stop-event hook.
