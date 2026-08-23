---
rigor-tier: full
aggregate-verdict: PASS_WITH_NOTES
---

# Validation Report: Beads Board Git Topology

> **Date:** 2026-08-22
> **Spec:** .context-index/specs/features/task-management/beads-board-git-topology.spec.md
> **Plan:** .context-index/specs/features/task-management/beads-board-git-topology.plan.md
> **Overall Status:** PASS_WITH_NOTES

**Rigor tier:** `full` — resolved from `risk_level: medium` via `.context-index/governance/risk-policies.yaml` (`policies.medium.validate_mode: full`). No `--tier` override, no routing "easy" signal. Full check set ran: 1, 1.5, 1.6, 2, 4, 8, 9, 11, 14.

---

## Check 1: Quality Gates — PASS_WITH_NOTES

- **Check 1a (fast tier):** `npm test` — technically **fail** (exit non-zero): 7740 tests, 7697 pass, **11 fail**, 30 cancelled, 2 todo (45.1s).
  - All 11 failures are pre-existing and unrelated to this spec:
    - `tests/repomap/index.test.mjs`, `tests/repomap/parse.test.mjs`, `tests/repomap/non-code-references.integration.test.mjs`, `tests/repomap/render-non-code-sections.test.mjs` (multiple subtests) — all fail with `ENOENT: node_modules/tree-sitter-typescript/tree-sitter-typescript.wasm` (missing binary artifact in this environment, unrelated to beads-board work).
    - `tests/skills/plan-task-immutability.test.mjs` — a stale pre-existing fixture (`bug-selection-and-eligibility-rev-8-configurable-priority-floor.plan.md` mutation timestamp) unrelated to this spec.
  - Zero failures in any beads-board-git-topology-related suite. Scoped re-run confirms: `node --test tests/cli-install-board-bootstrap.test.mjs tests/lib/board-migrate-state.test.mjs tests/lib/board-worktree.test.mjs tests/lib/cli-issues-board-migrate.test.mjs tests/lib/gitignore-paths.test.mjs tests/lib/issues-resolve-root.test.mjs` → **53/53 pass, 0 fail**.
  - `test` and `quality-gate` gates (both resolve to `npm test`, identical `command_sha`) are attested `fail` in `gate_outcomes` (honest, matches the raw exit code) — see below. Given the failures are demonstrably pre-existing and unrelated to this spec's scope, this check's aggregate verdict is recorded PASS_WITH_NOTES rather than a blocking FAIL, per this run's operating instruction to judge quality-gate pass/fail against tests relevant to this spec's own work.
- **Check 1b (integration tier):** `npm run test:evals` — fail: 396 tests, 384 pass, 12 fail (severity: warning, non-blocking). Failures are in `tests/evals/integration-sandbox/reality-check.test.mjs` (Postgres-backed / sandbox fixture tests requiring infra not present in this environment) and `tests/orders.integration.test.mjs` (`Cannot find package 'pg'`) — none touch beads-board files.
- **Check 1c (e2e tier):** no gates configured — SKIP.
- **Gate outcomes attestation** (`gate_outcomes` on the `validate.check-1-quality-gates` validator_report):
  | id | verdict | tier | command_sha |
  |---|---|---|---|
  | test | fail | fast | 527c484b...c0ce3177d4 |
  | quality-gate | fail | fast | 527c484b...c0ce3177d4 |
  | integration-test | fail | integration | 9e6a54d2...6735e941e |

## Check 1.5: Source Manifest Verification — PASS

- `adev source-manifest verify --spec beads-board-git-topology.spec.md` → `PASS — source manifest matches (sha: 9c5902a)`.
- All 12 listed files confirmed committed via `git log --oneline -1 -- <file>` (each returns exactly one commit — none untracked/staged-only).

## Check 1.6: Code-Side Drift Warning — PASS

- `adev verify spec --check-drift` → `{"drifted":false,"drift_source":null,"drift_at":null}`. No drift detected.

## Check 2: Spec Compliance — PASS_WITH_NOTES

All 9 behaviors (BEH-1 through BEH-9) verified against actual source and tests, via a dedicated Read-grounded review pass (subagent dispatch, anti-fabrication contract enforced):

- **BEH-1** (`.beads/` `--no-db` fallback) — PASS. `tests/lib/board-worktree.test.mjs:200-219` — real `BeadsAdapter` against a fresh worktree, no `SYNC_CONFLICT`, no `.db` file created.
- **BEH-2** (existing branch → plain `worktree add`) — PASS. `lib/issues/board-worktree.mjs:140-150`; tested for both local-branch (`tests/lib/board-worktree.test.mjs:54-66`) and remote-tracking-only (`:68-101`) cases.
- **BEH-3** (no branch → orphan `worktree add --orphan`) — PASS. `lib/issues/board-worktree.mjs:152-160`; tested `tests/lib/board-worktree.test.mjs:42-52`.
- **BEH-4** (`resolveStorageRoot()` needs no change) — PASS. Real regression test `tests/lib/issues-resolve-root.test.mjs:62-74` provisions a real `.beads/` worktree and asserts correct resolution; no source change (confirmed absent from source-manifest.files).
- **BEH-5** (`.beads/` gitignored) — PASS. `lib/gitignore-paths.mjs:66-69`; tested `tests/lib/gitignore-paths.test.mjs:33-59`; end-to-end confirmation `tests/lib/cli-issues-board-migrate.test.mjs:105-106`.
- **BEH-6** (CLI install/upgrade auto-provisions) — PASS. `cli/index.mjs:1081-1101` (`maybeProvisionBoardWorktree`), called at both `cmdInstall` (`:1287-1288`) and `cmdUpgrade` (`:1422-1423`); tested `tests/cli-install-board-bootstrap.test.mjs:69-101` including second-call idempotency.
- **BEH-7** (`board migrate` main-tracked → migrated) — PASS. `lib/cli/issues-board.mjs:157-219`; tested end-to-end against a real bare origin + clone, `tests/lib/cli-issues-board-migrate.test.mjs:93-110`.
- **BEH-8** (`--dry-run` never mutates) — PARTIAL. Tested for the "main-tracked" (`:112-123`) and "already-migrated" (`:136-144`) preconditions. The checkpoint-present precondition's dry-run branch (`lib/cli/issues-board.mjs:111-117`) has **no test** — a real, if narrow, coverage gap against the acceptance criterion's "under any precondition state" language. Code looks correct by inspection (early `return 0` before any mutation) but is unverified by test.
- **BEH-9** (already-migrated → no-op) — PASS. `lib/cli/issues-board.mjs:142-145`; tested live and dry-run, `tests/lib/cli-issues-board-migrate.test.mjs:125-144`.

**Error Cases (8 rows):** 7 of 8 PASS cleanly (rows 1, 3, 4, 5, 6, 7, 8 — see full citations in the dispatched Check 2 review). Row 2 (`BOARD_NO_BRANCH`) is **PARTIAL / spec-code naming mismatch**: a repo-wide grep for `BOARD_NO_BRANCH` across all `.mjs` production files returns zero hits — the code is never implemented or produced anywhere; it exists only in a test's name/comments (`tests/lib/board-worktree.test.mjs:156-181`). The underlying safety behavior is correctly implemented and tested (`provisionBoardWorktree()` always falls through to orphan creation rather than hitting the raw-git dead end, and the test proves the raw bypass command does fail), but the spec's literal error-code contract for this row is not honored by any code. Recommend reconciling the spec text (mark the code as bypass-only/non-implemented) rather than treating this as a functional defect — no user-facing behavior is broken.

**Acceptance Criteria:** all PASS except the two notes above (BEH-8 dry-run+checkpoint gap, BOARD_NO_BRANCH naming mismatch), which are non-blocking documentation/coverage gaps, not functional defects.

## Cross-Repo Dependency Validation — N/A

No cross-repo `depends-on` references in this spec's frontmatter.

## Check 4: Constitution Compliance — PASS

- **Architecture boundaries:** PASS. `maybeProvisionBoardWorktree` (`cli/index.mjs:1081-1101`) operates only on `projectRoot`/`process.cwd()`; a grep for `\.claude|homedir|os\.home` across all 6 new/changed implementation files returned zero matches — the "Modifying the CLI installation path structure" boundary (requires human approval) is not crossed, confirming the spec's own out-of-scope claim by code inspection.
- **Non-negotiable principles:** PASS. Principle 1 (minimize deps): `git diff main -- package.json` empty — no new dependency. Principle 3 (pure ESM): grep for `require(\|module.exports` across the 6 new/changed files returns zero matches. Subprocess safety: every `git` call in `lib/issues/board-worktree.mjs` and `lib/cli/issues-board.mjs` goes through a local `git(args, cwd)` wrapper using `execFileSync` with argv arrays (`lib/issues/board-worktree.mjs:31-33`, `lib/cli/issues-board.mjs:31-33`) — no shell interpolation anywhere.
- **Coding standards:** PASS. Kebab-case files, camelCase exports (`provisionBoardWorktree`, `recoverBeforeAdd`, `writeBoardMigrateCheckpoint`, etc.). `lib/cli/issues-board.mjs` exports both `run` and `help`, wired into the dispatcher at `lib/cli/issues.mjs:106-113`. The two non-`lib/cli/` helper modules (`lib/issues/board-migrate-state.mjs`, `lib/issues/board-worktree.mjs`) are correctly exempt from the "every `lib/cli/*.mjs` exports run/help" invariant — `tests/cli-driver-pattern.test.mjs` only scans `lib/cli/`, never `lib/issues/`.
- Commit trailers: PASS. Spot-checked 6 implementation commits — each carries a `Spec:` trailer pointing at this spec, a `Plan-task:` trailer, and `Author-type`/`Operator` trailers per CLAUDE.md's Commit Trailers format.

## Check 8: Boundary Compliance — PASS

- `adev boundaries check --json` → `verdict: PASS`, reason: "no boundary violations in 81 changed file(s) against 3 rule(s)".
- Disabled: `no-manual-version-bump` — "the boundary evaluator matches file content, not diffs; a version field is not a version bump, so this rule would fire on package.json forever. Needs a diff-aware evaluator." (pre-existing disable, unrelated to this spec).
- No registry warnings.

## Check 9: Transition Gates — FAIL (severity: warning, non-blocking)

- Transition: `implement-to-validate`.
- `test`: blocked, reason `recorded-fail` (`command_attested: true`) — reflects Check 1's honest `gate_outcomes` attestation of the `npm test` gate's actual exit code (see Check 1 above: 11 pre-existing, unrelated failures). This check's registry severity is `warning`, so it does not force the aggregate verdict below PASS_WITH_NOTES — it is recorded here for full transparency rather than suppressed.

## Check 11: Visual Verification — SKIP (N/A)

- No UI files in the implementation diff — all 12 changed files are `.mjs` (CLI/lib/test). Trigger-guard Case A/D: SKIP, "No UI files in implementation diff — visual verification not applicable."

## Check 14: Gate Executability and Test Collection — PASS_WITH_NOTES

- `adev gate doctor --json` → 0 errors, 4 warnings:
  - `gate-doctor/runner-unknown` ×3 (`test`, `quality-gate`, `integration-test` — `npm test` / `npm run test:evals` are not a runner this doctor recognizes by name, so collection could not be independently verified; pre-existing project-wide condition, not introduced by this spec).
  - `gate-doctor/ci-gate-not-invoked` ×1 (`integration-test` does not appear in any CI workflow file — pre-existing, unrelated to this spec).
- This check's registry severity is `warning`; findings are advisory only.

---

**Summary:** 9 checks dispatched. 5 clean PASS (1.5, 1.6, 4, 8, 11-SKIP-as-PASS). 3 PASS_WITH_NOTES (1, 2, 14) carrying non-blocking notes (pre-existing unrelated test failures; a narrow untested dry-run+checkpoint combination; a spec/code error-code naming mismatch; gate-doctor advisories). 1 warning-severity FAIL (9 — transition gate blocked by Check 1's honest fail attestation on `test`, non-blocking per its own registry severity). **Aggregate verdict: PASS_WITH_NOTES.**

Two follow-up items worth tracking (non-blocking, both documentation/coverage, not functional defects):
1. Add a test for `adev issues board migrate --dry-run` when a `.board-migrate-state.json` checkpoint is present (the `lib/cli/issues-board.mjs:111-117` branch).
2. Reconcile the spec's Error Cases row 2 (`BOARD_NO_BRANCH`) — the code is never implemented; the safety behavior it names is fully covered by BEH-3's orphan-fallback, but the literal error-code contract in the spec text does not match any code in the repo.

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 11 (when no UI files), 12, and 13 have been relocated by `check-set-restructure.spec.md`. See:
>
> - `/adev:review-specs` — for ADR compliance (formerly Check 5), cross-cutting compliance (formerly Check 6), specialist review (formerly Check 7), and charter consistency (formerly Check 3, now covered by Check 2's scope-expansion sub-finding).
> - `/adev:hygiene` Audit Pass 20 — for platform drift (formerly Check 10).
> - `/adev:reconcile` lifecycle-sync — for lifecycle reconciliation (formerly Check 12, with `--fix` as the default mode).
> - `hooks/post-validate-extract-heuristics.{sh,mjs}` — for heuristic extraction (formerly Check 13 / `check-12-heuristic-extraction`), now a non-blocking Stop-event hook.
