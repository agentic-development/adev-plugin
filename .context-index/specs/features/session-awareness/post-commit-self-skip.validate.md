# Validation Report: Post-commit hook self-skips on session-capture-only commits

> **Date:** 2026-05-18
> **Spec:** .context-index/specs/features/session-awareness/post-commit-self-skip.spec.md
> **Plan:** .context-index/specs/features/session-awareness/post-commit-self-skip.plan.md
> **Overall Status:** PASS

---

## Check 1: Quality Gates — PASS

- Check 1a (fast): `npm test` — PASS (3426 pass / 0 fail / 0 cancelled / 0 skipped / 2 todo, 252.5s)
- Check 1b (integration): SKIP — no gates configured
- Check 1c (e2e): SKIP — no gates configured

Loader warning: `INVALID_GATE: Gate 'test' command must be an argv list (array), not a string — skipped.` The domain-default `quality-gate` ran in its place (also `npm test`). The govern-level `gates.yaml` `test` gate is string-form, so it was skipped in favor of the equivalent domain default. Functionally equivalent for this validation run.

## Check 1.5: Source Manifest Verification — PASS

- Manifest sha: `16779ee` — matches current file SHAs.
- Files (both committed via `c34e7dd`):
  - `.githooks/post-commit`
  - `tests/hooks/post-commit-self-skip.test.mjs`

## Check 1.6: Code Drift — PASS

- `drift_detected` flag absent / false; no JSONL `code_drift_detected` events outstanding.
- Source-manifest fallback also clean (see Check 1.5).

## Check 2: Spec Compliance — PASS

Acceptance criteria (from spec, lines 120-127):

1. **Sessions-only early-exit, no capture written** — PASS
   - `.githooks/post-commit:30-44` implements the guard: when `$CHANGED_FILES` non-empty and every line matches `case .context-index/sessions/* )`, the hook prints the diagnostic to stderr and `exit 0`.
   - Test coverage: `tests/hooks/post-commit-self-skip.test.mjs:47-61` ("skips capture when all changed files are inside .context-index/sessions/") — asserts `captureCount` unchanged and stderr diagnostic.

2. **Capture written unchanged for any commit with non-session files** — PASS
   - `.githooks/post-commit:34-37` — non-matching glob sets `SESSIONS_ONLY=0` and breaks; hook falls through to the existing capture write path at lines 47-127.
   - Test coverage: `tests/hooks/post-commit-self-skip.test.mjs:63-77` (mixed commit) and `:79-89` (non-session commit) — both assert `captureCount(before+1)`.

3. **Strict prefix match — `.context-index/sessions-archive/` and `.context-index/sessions.bak` do NOT trigger skip** — PASS
   - `.githooks/post-commit:35` uses `case "$CHANGED_PATH" in .context-index/sessions/* )` with the trailing `/` — `sessions-archive/...` and `sessions.bak` fall through to the catch-all `*) SESSIONS_ONLY=0; break ;;`.
   - Test coverage: `tests/hooks/post-commit-self-skip.test.mjs:91-105` (prefix-collision) — asserts capture IS written.

4. **`git diff-tree` failure → fall through to capture (fail-open)** — PASS
   - `.githooks/post-commit:24` already has `|| echo ""` fallback. `.githooks/post-commit:30` then guards `if [ -n "$CHANGED_FILES" ]` — empty `CHANGED_FILES` skips the guard entirely and proceeds to the capture write path.
   - Test coverage: indirectly verified by the non-session test (the empty/missing CHANGED_FILES path exercises the same fall-through). The spec explicitly notes (plan task 2, line 314) that synthesizing `git diff-tree` failure in a real tempdir is brittle; the fail-open posture is inherited from the existing `|| echo ""` fallback.

5. **Diagnostic stderr line emitted on skip path** — PASS
   - `.githooks/post-commit:41` — `echo "session-capture skipped: sessions-only commit" >&2`.
   - Test coverage: `tests/hooks/post-commit-self-skip.test.mjs:107-118` (diagnostic on stderr without affecting exit status).

6. **Integration tests cover sessions-only, mixed, non-session, and prefix-collision** — PASS
   - All four cases plus diagnostic-emission plus CON-1 (JSONL preservation) covered in six tests in `tests/hooks/post-commit-self-skip.test.mjs`.

7. **All quality gates pass (`npm test`)** — PASS (see Check 1).

8. **No constitutional violations introduced** — PASS (see Check 4).

Bonus: review note CON-1 (skip-path does NOT truncate `.session-tracking.jsonl`) — verified by `tests/hooks/post-commit-self-skip.test.mjs:120-147` ("preserves .session-tracking.jsonl on the skip path (NOT truncated)").

Test integrity: assertions use `assert.equal` / `assert.match` against exact strings and counts; no loose matchers, no conditional skips, no `>= 0`-style toothless assertions. The one acknowledged gap (synthesizing `git diff-tree` failure) is documented in the plan and inherits coverage from the existing `|| echo ""` fallback.

## Check 4: Constitution Compliance — PASS

- **Architecture boundaries (`.context-index/constitution.md:70-89`):** Hook protocol contract not modified (the hook continues to read no JSON stdin and exit 0); no CLI installation path change; no plugin registration change; no new external dependency. The autonomous-decision set ("Adding tests", "Refactoring within a module's boundaries") covers this change.
- **Non-Negotiable Principles:**
  - Principle 1 ("Minimize external dependencies") — PASS. Guard uses only `case` / `read` / `echo` / `exit` builtins and the already-present `git diff-tree`. No new dependency.
  - Principle 3 ("Pure ESM") — N/A. The change is bash; no `.mjs` modules introduced. The test file is `.mjs` and matches existing ESM conventions.
  - Principle 4 ("Hook protocol compliance — hooks ... exit 0 (allow) or 2 (block)") — PASS. The guard exits 0 on the skip path; failure paths fall through to the existing exit-0 capture flow. The diagnostic line goes to stderr, not stdout (no JSON-output contract for git hooks).
- **Coding standards:** Bash hook conventions match the rest of `.githooks/*`; test file uses `node:test`, `node:assert/strict`, ESM imports, kebab-case filename — matches existing `tests/hooks/*.test.mjs` style.

## Check 8: Boundary Compliance — N/A

`.context-index/governance/boundaries.yaml` declares `boundaries: []` — no rules configured.

## Check 9: Transition Gates — N/A

`.context-index/governance/gates.yaml` declares `transitions: {}` — no transitions configured.

## Check 11: Visual Verification — N/A

No UI files in implementation diff (the change touches `.githooks/post-commit` and a test file under `tests/hooks/`). Per the trigger-guard matrix Case A/D, SKIP with note: "No UI files in implementation diff — visual verification not applicable."

---

**Summary:** 7 passed, 0 failed, 2 N/A (boundaries, transitions) checks. Visual verification N/A.

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 11 (when no UI files), 12, and 13 have been relocated by `check-set-restructure.spec.md`. See:
>
> - `/adev:review-specs` — for ADR compliance (formerly Check 5), cross-cutting compliance (formerly Check 6), specialist review (formerly Check 7), and charter consistency (formerly Check 3, now covered by Check 2's scope-expansion sub-finding).
> - `/adev:hygiene` Audit Pass 20 — for platform drift (formerly Check 10).
> - `/adev:reconcile` lifecycle-sync — for lifecycle reconciliation (formerly Check 12, with `--fix` as the default mode).
> - `hooks/post-validate-extract-heuristics.{sh,mjs}` — for heuristic extraction (formerly Check 13 / `check-12-heuristic-extraction`), now a non-blocking Stop-event hook.
>
> Historic `.validate.md` reports continue to use the pre-restructure numbering; the gaps in the surviving inventory (Checks 1, 1.5, 1.6, 2, 4, optionally 8 and 9) are intentional to preserve report readability.
