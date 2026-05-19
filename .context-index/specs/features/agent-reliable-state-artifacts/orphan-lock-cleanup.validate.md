# Validation Report: Orphan-lock cleanup for the JSON issue board CAS layer

> **Date:** 2026-05-18
> **Spec:** .context-index/specs/features/agent-reliable-state-artifacts/orphan-lock-cleanup.spec.md
> **Plan:** .context-index/specs/features/agent-reliable-state-artifacts/orphan-lock-cleanup.plan.md
> **Milestone:** 0.27.0
> **Overall Status:** PASS

---

## Check 1: Quality Gates — PASS

- Tier `fast` — `quality-gate` (`npm test`): **PASS** (3420 pass / 0 fail / 0 cancelled / 0 skipped / 2 todo; duration ≈ 198 s)
- No `integration` or `e2e` tier gates configured — SKIP per "no gates configured" rule.
- Domain gate load warning (informational): `INVALID_GATE` — legacy `test` gate in `governance/gates.yaml` uses a string command and was skipped; the domain default `quality-gate` (argv form) ran instead with identical effect.

## Check 1.5: Source Manifest Verification — PASS

- `adev source-manifest verify --spec .../orphan-lock-cleanup.spec.md` → `PASS — source manifest matches (sha: 8af72f4)`.
- Implementation-existence (git-tracked) check:
  - `lib/issues/json-adapter.mjs`: committed (HEAD `12dd7a7`).
  - `tests/issues/json-adapter-orphan-lock.test.mjs`: committed (HEAD `12dd7a7`).
- `computed-at: 2026-05-19T12:09:25.442Z` stamped in spec frontmatter.

## Check 1.6: Code-Side Drift Warning — PASS

- `adev verify spec --check-drift` → `{"drifted":false,"drift_source":null,"drift_at":null}`.
- No drift recorded since the source manifest was stamped.

## Check 2: Spec Compliance — PASS

All 8 Acceptance Criteria satisfied. Citations from files read in this validation run.

- **AC #1 — `_acquireLock` helper exists, single call site for `openSync(wx)`**: PASS.
  - `lib/issues/json-adapter.mjs:536` declares `_acquireLock(lockPath)`.
  - `lib/issues/json-adapter.mjs:665` calls `this._acquireLock(lockPath)` from `_write` — the only `openSync(lockPath, "wx")` call site is now inside `_acquireLock` (lines 539, 558, 606).
- **AC #2 — aged orphan lock → CAS mutation succeeds + single stderr warning**: PASS.
  - `_acquireLock` EEXIST branch: stat → age check → unlink → retry once (`lib/issues/json-adapter.mjs:544-616`).
  - One-time warning emission at `lib/issues/json-adapter.mjs:621-627` uses literal `tasks.json.lock` (SEC-1).
  - End-to-end test `adapter.create() succeeds against a seeded orphan lock` at `tests/issues/json-adapter-orphan-lock.test.mjs:333-365`.
- **AC #3 — fresh lock (age ≤ threshold) → no recovery; `STALE_BOARD_WRITE_RETRY`**: PASS.
  - Branch `lib/issues/json-adapter.mjs:574-581` throws `STALE_BOARD_WRITE_RETRY` without unlinking.
  - Test `B1 + B5: fresh lock (age <= threshold) does NOT recover` at `tests/issues/json-adapter-orphan-lock.test.mjs:201-223` asserts both the error code and that the lock file remains on disk.
- **AC #4 — two recoveries in one process → only first emits warning**: PASS.
  - Instance flag `_orphanRecoveryWarningEmitted` declared at `lib/issues/json-adapter.mjs:242` and gates the stderr write at `lib/issues/json-adapter.mjs:621-627`.
  - Test `B3 (one-time): second orphan recovery in same process emits no warning` at `tests/issues/json-adapter-orphan-lock.test.mjs:225-250` asserts `second.stderr === ''`.
- **AC #5 — manifest `cas_lock_stale_seconds: 3` rejected with `BOARD_INVALID_LOCK_STALE_SECONDS`**: PASS.
  - Validation block at `lib/issues/json-adapter.mjs:268-302` enforces strict-integer-≥-5 with explicit error code.
  - Test `manifest with cas_lock_stale_seconds: 3 (< floor 5) rejects at construction` at `tests/issues/json-adapter-orphan-lock.test.mjs:78-88`. Additional rejection tests cover string (`thirty`), float (`5.5`), boolean (`true`), and `null` literals.
- **AC #6 — `unlinkSync` failure raises `BOARD_ORPHAN_LOCK_UNLINK_FAILED` with original error on `.cause`**: PASS.
  - Error construction at `lib/issues/json-adapter.mjs:584-598` sets `e.code = "BOARD_ORPHAN_LOCK_UNLINK_FAILED"` and `e.cause = unlinkErr`; message uses literal `tasks.json.lock` (SEC-1).
  - Test `EC: unlink failure surfaces BOARD_ORPHAN_LOCK_UNLINK_FAILED with original error on .cause` at `tests/issues/json-adapter-orphan-lock.test.mjs:289-328` chmods the lock directory to `0o555` to trigger EACCES, then asserts both the code and `err.cause.code`.
- **AC #7 — unit tests cover all 6 behaviors and 6 error cases; run under `npm test` without external deps**: PASS.
  - 16 tests in `tests/issues/json-adapter-orphan-lock.test.mjs` (single suite, 0 external dependencies — uses only `node:test`, `node:assert/strict`, `node:fs`, `node:path`, and project helpers from `tests/helpers.mjs`).
  - B4 and B6 carry documented structural-coverage compromises per the plan's "Notes on test coverage" — accepted as part of the plan's contract (the racing-writer and ENOENT branches are structurally identical to other tested branches; full execution coverage requires an `_setFsHooks` seam that is out of scope).
- **AC #8 — quality gates pass**: PASS via Check 1 above.

Test integrity review (sample): assertions are strict (`assert.equal`, `assert.match`, `assert.throws` with predicate functions), use deterministic seed values (`ageLock` sets mtime to a fixed offset), and explicitly reject SEC-1 leakage (`!stderr.includes(lockPath)` / `!err.message.includes(lockPath)`). No loose matchers, no `>= 0` style trivial assertions, no try/catch around assertions.

## Check 4: Constitution Compliance — PASS

- **Architecture boundaries**: PASS. No human-approval boundary crossed — implementation touches only `lib/issues/json-adapter.mjs` and adds a sibling test file. No new dependencies, no hook protocol changes, no CLI installation path changes, no plugin registration changes.
- **Non-Negotiable Principles**:
  - "Minimize external dependencies — prefer Node.js built-ins": PASS. New code uses only `node:fs` (`statSync`, `unlinkSync`, `openSync`, `utimesSync`) — `statSync` added to the existing destructure at `lib/issues/json-adapter.mjs:59-69`.
  - "Pure ESM": PASS. Both files are `.mjs` with `import` syntax.
  - Other principles (skills are markdown, hook protocol, version parity) — N/A for this change.
- **Coding standards**:
  - Naming: PASS — `_acquireLock`, `casLockStaleSeconds`, `DEFAULT_CAS_LOCK_STALE_SECONDS`, `_orphanRecoveryWarningEmitted` follow camelCase / SCREAMING_SNAKE_CASE for exported constants.
  - File structure: PASS — implementation in `lib/issues/`, test in `tests/issues/`, both kebab-case file names.
  - Import ordering: PASS — `lib/issues/json-adapter.mjs:59-71` lists `node:fs`, `node:path`, `node:crypto` before relative imports.
  - Commit trailer: PASS — head commit `12dd7a7` lands with `Spec:` trailer pointing at the spec file.

## Check 8: Boundary Compliance — PASS

- `.context-index/governance/boundaries.yaml` exists but `boundaries: []` (only commented examples). No rules to evaluate.

## Check 9: Transition Gates — PASS

- `governance/gates.yaml::transitions: {}` — no `implement-to-validate` or `validate-to-merge` transition configured. Nothing to verify.

## Check 11: Visual Verification — N/A

- No UI files in implementation diff (`lib/issues/json-adapter.mjs`, `tests/issues/json-adapter-orphan-lock.test.mjs` — both pure-Node, no `*.tsx`/`*.jsx`/`*.css`/etc.).
- Trigger guard outcome: Case A (no UI files in diff, Playwright unavailable) → SKIP.

---

**Summary:** 7 PASS, 0 FAIL, 1 N/A (Check 11). All dispatched checks green. Implementation satisfies the spec, stays within charter scope, respects the constitution, and passes all quality gates.

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 12, and 13 have been relocated by `check-set-restructure.spec.md`. See:
>
> - `/adev:review-specs` — for ADR compliance (formerly Check 5), cross-cutting compliance (formerly Check 6), specialist review (formerly Check 7), and charter consistency (formerly Check 3, now covered by Check 2's scope-expansion sub-finding).
> - `/adev:hygiene` Audit Pass 20 — for platform drift (formerly Check 10).
> - `/adev:reconcile` lifecycle-sync — for lifecycle reconciliation (formerly Check 12, with `--fix` as the default mode).
> - `hooks/post-validate-extract-heuristics.{sh,mjs}` — for heuristic extraction (formerly Check 13 / `check-12-heuristic-extraction`), now a non-blocking Stop-event hook.
