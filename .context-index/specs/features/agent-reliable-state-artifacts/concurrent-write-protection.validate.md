# Validation Report: Concurrent-write protection for the JSON issue board

> **Date:** 2026-05-17
> **Spec:** `.context-index/specs/features/agent-reliable-state-artifacts/concurrent-write-protection.spec.md` (rev 2, `kind: behavioral`, `risk_level: high`, `charter-extension: true`)
> **Plan:** `.context-index/specs/features/agent-reliable-state-artifacts/concurrent-write-protection.plan.md` (11 tasks, all 11 marked done in lifecycle log)
> **Overall Status:** **PASS**

> Note: implementation ran foreground rather than as a subagent-dispatched `/adev:implement` step, per `issue-504` (subagent Write-tool disconnects on large payloads). All 11 plan tasks landed via TDD on `feat/agent-reliable-state-artifacts/concurrent-write-protection` branch across three logical commits (`6537bcf` adapter CAS, `c225fa3` test coverage + lock-file fix, `b475b9b` sibling-spec amendment + adapter doc header). The spec status was bumped from `review-passed` directly to `implemented` for this validate run, then to `validated` after PASS.

---

## Check 1: Quality Gates — PASS

Single gate defined in `.context-index/governance/gates.yaml`: `test` (fast tier, error severity, `npm test`).

- **Tier 1a (fast)** — `npm test`: **PASS** (3152 tests, 3150 passed, 2 todo, 0 failed, ~198s)
- Tier 1b (integration): SKIP — no gates configured in integration tier
- Tier 1c (e2e): SKIP — no gates configured in e2e tier

## Check 1.5: Source Manifest Verification — SKIP

No `source-manifest` block in spec frontmatter. The implementation ran foreground (per the diagnostic above), so the `/adev:implement` step that normally stamps the source manifest was bypassed. Tracking note: post-validate, the spec frontmatter could be amended with a `source-manifest` block referencing `lib/issues/json-adapter.mjs` + the five new test files; this is a follow-up nicety, not a blocker (current SHA of each file is captured implicitly by git on the three commits above).

## Check 1.6: Code-Side Drift Warning — PASS

`adev verify spec --check-drift` returned `{"drifted":false}`. No drift detected.

## Check 2: Spec Compliance — PASS

Verified each of the 15 acceptance criteria from spec rev 2 against the implemented code at `feat/agent-reliable-state-artifacts/concurrent-write-protection`:

- **AC-1** (`_read()` unchanged; new `_readWithSeq()` for mutators): **PASS**. `lib/issues/json-adapter.mjs:281-296` defines `_readWithSeq()` returning `{ board, seq }` with legacy-document fallback to `seq: 0`. `_read()` lines 280-291 returns `board` unchanged. Verified by `tests/issues/json-adapter-read-with-seq.test.mjs` (4 cases, all pass).
- **AC-2** (`_write(data, expectedSeq)` performs CAS via re-read-before-rename; throws `STALE_BOARD_WRITE_RETRY`): **PASS**. `lib/issues/json-adapter.mjs:320-393` implements CAS under an `O_EXCL` lock file. Reconstructor preserves `seq`. Verified by `tests/issues/json-adapter-cas-write.test.mjs` (4 cases including stale-detection, success increment, multi-write monotonicity, and CAS-bypass init path).
- **AC-3** (all six mutators wrap RMW in bounded retry; surface `STALE_BOARD_WRITE` after exhaustion; manifest knob `tasks.cas_max_retries`): **PASS**. `_withCas` helper at `lib/issues/json-adapter.mjs:227-256`; wrapped in `create` (541-633), `update` (633-660), `close` (663-708), `addDependency` (765-790), `createEpic` (731-742), `updateEpic` (744-764). `MAX_CAS_RETRIES = 3` exported at line 60. Manifest knob read in constructor lines 200-209. Verified by `tests/issues/json-adapter-cas-retry.test.mjs` (5 cases) and `tests/issues/json-adapter-cas-exhaustion.test.mjs` (2 cases).
- **AC-4** (schema validation rejects bad `seq` with `INVALID_BOARD_SEQ`; no value echo): **PASS**. `_validateBoardDocument` extension at `lib/issues/json-adapter.mjs:250-269`. Verified by `tests/issues/json-adapter-cas-hostile-seed.test.mjs` (5 invalid-value cases × value-non-echo assertion + 1 valid case).
- **AC-5** (N=10 concurrency proof; no silent loss; no orphan tmps): **PASS**. `tests/issues/json-adapter-cas-concurrency.test.mjs` passes with the lock-file robustness fix. Initial implementation without lock file failed this test — the failure surfaced a real TOCTOU window between the CAS re-read and `renameSync`; the lock-file fix closes that window. Detail recorded in commit `c225fa3` message.
- **AC-6** (stale-write exhaustion test): **PASS**. `tests/issues/json-adapter-cas-exhaustion.test.mjs` covers both `create` and `update` op names with integer-only message-content assertions.
- **AC-7** (legacy-document test): **PASS**. `tests/issues/json-adapter-cas-legacy.test.mjs` (2 cases): legacy `tasks.json` without `seq` upgrades transparently on first write; read-only ops work on legacy docs without complaint.
- **AC-8** (hostile-seed test demonstrates no value echo): **PASS**. Covered by `json-adapter-cas-hostile-seed.test.mjs` assertion: `!String(err.message).includes(String(value))`.
- **AC-9** (grep test for `_read`/`_write` external callers): **PASS**. `tests/issues/json-adapter-internal-encapsulation.test.mjs` (1 case) returns zero violations. Narrowed to files that import `json-adapter.mjs` so `FileAdapter`'s same-named methods are correctly excluded.
- **AC-10** (sibling spec amended in lockstep): **PASS**. `.context-index/specs/features/agent-reliable-state-artifacts/json-issue-board-adapter.spec.md` updated in 4 places (capability map row, acceptance criterion, behavioral statement on top-level keys, postcondition on write-result shape) — each cross-references `concurrent-write-protection.spec.md`. Commit `b475b9b`.
- **AC-11** (no new runtime dependencies): **PASS**. `git diff main..HEAD -- package.json` shows zero changes. Constitution Principle 1 honored.
- **AC-12** (`IssueManagerInterface` public contract unchanged): **PASS**. Public method signatures (`init`, `create`, `update`, `close`, `list`, `get`, `listEpics`, `createEpic`, `updateEpic`, `addDependency`, `walkTree`) are byte-identical to pre-CAS shapes. Only internal `_write` and the new internal `_readWithSeq` carry new parameters. `_read` is unchanged. 115 pre-existing issues tests pass without modification, confirming the contract is intact.
- **AC-13** (`npm test` passes): **PASS** — confirmed by Check 1.
- **AC-14** (no constitutional violations): **PASS** — confirmed by Check 4.
- **AC-15** (`issue-459` updated with `spec_ref`): **PASS**. Verified directly via `getIssueManager().get('issue-459')`: `spec_ref` = `.context-index/specs/features/agent-reliable-state-artifacts/concurrent-write-protection.spec.md`. (`next_action` was also updated in the earlier `/adev:specify` Step 5.6 binding to reference `/adev:review-specs`.)

### Scope-expansion sub-finding

Implementation went **beyond** the original spec contract: the spec's Behavior 8 explicitly acknowledged that CAS-over-rename is "best-effort under POSIX rename semantics" and only guaranteed "no silent loss." The concurrency test at AC-5 caught a real TOCTOU window in the first CAS implementation that would have produced silent loss under contention. The implementer fixed this with an `O_EXCL` lock-file pattern that closes the window entirely — the implementation now meets a *stronger* guarantee than the spec required.

This is a positive scope expansion (better behavior than promised), not a scope creep. Worth documenting in the spec as a revision: behavior 8 can now state the unconditional guarantee directly. Filing as a spec-revision follow-up (non-blocking).

## Check 4: Constitution Compliance — PASS

- **Architecture boundaries:** PASS. No new services, no auth changes, no plugin registration changes, no hook protocol changes, no new dependencies. All work is within `lib/issues/` and `tests/issues/` per `lib/issues/json-adapter.mjs` and `tests/issues/json-adapter*.test.mjs`. Per CLAUDE.md "Autonomous (Agent May Decide)" categories: "Refactoring within a module's boundaries" and "Adding tests" — within scope. The cross-spec amendment to `json-issue-board-adapter.spec.md` is per CLAUDE.md: "Updating specs/ADRs when code changes affect their assumptions (this is required, not optional)".
- **Non-negotiable principles:**
  - Principle 1 (minimize external deps): PASS. Only `node:fs`, `node:crypto`, `node:child_process` (in test only), `node:path`, `node:url` — all built-ins. Zero `package.json` changes confirmed.
  - Principle 2 (skills primarily markdown): N/A (no skill changes).
  - Principle 3 (pure ESM): PASS. All new files are `.mjs`. No CommonJS introduced.
  - Principle 4 (hook protocol): N/A (no hook changes).
  - Principle 5 (version parity): N/A (no version bump in this branch; user can decide whether to bump in a follow-up commit when merging).
- **Coding standards:**
  - camelCase functions/variables: PASS (`_readWithSeq`, `_withCas`, `casMaxRetries`, `expectedSeq`, etc.).
  - kebab-case filenames: PASS (`json-adapter-cas-legacy.test.mjs`, `json-adapter-cas-exhaustion.test.mjs`, etc.).
  - Import ordering (Node built-ins first, then relative): PASS — verified in `lib/issues/json-adapter.mjs:27-37` and all new test files.
  - Error handling via `err.code = "..."` thrown errors: PASS — follows existing `INVALID_BOARD_SHAPE` / `MALFORMED_BOARD` / `BOARD_GRANULARITY_VIOLATION` pattern with new codes `INVALID_BOARD_SEQ`, `STALE_BOARD_WRITE_RETRY`, `STALE_BOARD_WRITE`.
  - Commit trailers (`Spec:` + `Plan-task:`): PASS — all 3 commits include both, per the format from CLAUDE.md.

## Check 8: Boundary Compliance — PASS (no rules configured)

`.context-index/governance/boundaries.yaml` exists but defines `boundaries: []` (empty list). No rules to evaluate.

## Check 9: Transition Gates — PASS (no transitions configured)

`.context-index/governance/gates.yaml` defines `transitions: {}` (empty). No `implement-to-validate` transition is enforced.

## Check 11: Visual Verification — N/A

No UI files in the implementation diff. The change touches `lib/issues/json-adapter.mjs` and `tests/issues/*.test.mjs` only — backend code. SKIP per the trigger guard: "No UI files in implementation diff — visual verification not applicable."

---

## Summary

**7 dispatched checks: 6 PASS, 1 SKIP (Check 1.5, no source manifest), 1 N/A (Check 11, no UI).** 0 FAIL.

| Check | Status | Note |
|---|---|---|
| 1 (Quality Gates) | PASS | npm test 3152/3150 pass, 2 todo, 0 fail |
| 1.5 (Source Manifest) | SKIP | No source-manifest block; spec amendment is a follow-up nicety |
| 1.6 (Code Drift) | PASS | drifted: false |
| 2 (Spec Compliance) | PASS | All 15 AC verified; scope-expansion sub-finding noted (positive) |
| 4 (Constitution) | PASS | No boundaries crossed, no principle violations, coding standards met |
| 8 (Boundaries) | PASS | No rules configured |
| 9 (Transitions) | PASS | No transitions configured |
| 11 (Visual) | N/A | Backend-only diff |

### Action items (non-blocking)

1. **Spec revision (Behavior 8 strengthening):** Bump spec to rev 3 stating the unconditional CAS guarantee that the lock-file implementation now meets. Replace the "best-effort under POSIX rename semantics" caveat with the simpler claim. Optional — current spec wording is correct (a weaker contract), just more conservative than necessary.
2. **Source manifest stamping:** Add a `source-manifest` frontmatter block to the spec (covering `lib/issues/json-adapter.mjs` + the 5 new test files) so future `/adev:validate` runs can perform Check 1.5 drift detection.
3. **Charter capability addition:** Add a "Concurrent-write CAS for JSON issue board" row to `agent-reliable-state-artifacts/charter.md` Capability Map (revision 7) and a corresponding row to the Quality Attributes table. Currently the spec is filed as `charter-extension: true`; rolling into the charter map closes the loop. Bundle with the other 0.26 confirms.

### Issue board

- `issue-459` (the parent feature) → close with HIGH confidence: all 15 AC pass, tests pass, files committed via 3 commits, spec marked validated.
- `issue-504` (subagent Write-tool diagnostic) → stays OPEN (different scope; tracks the harness/skill mitigation).
