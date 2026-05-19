---
spec: .context-index/specs/features/copilot-provider/copilot-adapter.spec.md
charter: .context-index/specs/features/copilot-provider/charter.md
date: 2026-05-19
verdict: PASS_WITH_NOTES
last-reviewed-revision: 2
file-sha: 1f47f5c25bc9cc5db51bbcc6e736b983860e92367fd7151a2008a725ed5d9bd3
---

# Architecture Review: copilot-adapter (rev 2)

> **Spec revision:** 2 (was 1 in prior BLOCK pass)
> **Verdict:** PASS_WITH_NOTES (0 blockers, 3 warnings, 6 suggestions)

## Reviewers Dispatched

| ID | Mode | Profile |
|----|------|---------|
| structural-architect | subagent | reviewer-reasoning |
| security-reviewer | subagent | reviewer-capable |
| consistency-analyzer | subagent | reviewer-fast |

## Prior Findings — All Resolved

**Blockers (3, all resolved):** CON-1 (peer-adapter exports), SEC-3 (state-record forgery / arbitrary deletion), SEC-5 (absolute-path leak in committed config).

**Warnings (9, all resolved):** SA-1 (`$COPILOT_HOME` overreach), SA-2 (partial-rollback), SEC-1 (validation ordering), SEC-2 (symlink following), SEC-4 (`$COPILOT_HOME` platform fragility — moot via SA-1), SEC-6 (downgrade attack), CON-2 (hook filename pivot rationale), CON-6 (`status` shape charter drift), CON-8 (argument convention divergence).

**Suggestions (7, all resolved or addressed):** SA-3, SA-4, SA-5, SEC-7, SEC-8, CON-3, CON-7.

## Structural Architect — PASS_WITH_NOTES

**New suggestions (all editorial):**

- **SA-1 — Install-Surface Map row wording.** The "Repo-wide instructions" row's `(n/a — user-level uses ~/.copilot/instructions/*.instructions.md only)` parenthetical implies user-scope materializes those files; Behavior §2 confirms it does not. Rephrase to `(n/a — user-scope instructions, if any, are owned by /adev:sync, not this adapter)`.
- **SA-2 — `getCopilotHome()` export rationale.** Add one sentence noting the export exists for `--user` testability, not as a pattern to backport to peer adapters.
- **SA-3 — Uninstall idempotency.** Add postcondition: "Uninstall is idempotent — state-record entries whose target no longer exists are skipped silently and do not populate `residual`."
- **SA-4 — User-scope hook-config rewrite resolution.** Add to Behavior §2 that the absolute→relative rewrite applies independently to both surfaces; user-scope `hooks.json` references resolve relative to `~/.copilot/hooks/`.

## Security Reviewer — PASS_WITH_NOTES

**New warnings:**

- **SEC-9 — `rmSync` symlink-following defense gap.** Behavior §4(e)'s parenthetical claim that "`rmSync` does not follow symlinks at the recursion root by default" is incorrect as a defense. If a state-record entry's resolved path is itself a symlink to a directory, behavior is platform-dependent.
  - **Fix:** Add Behavior §4(d-bis): `If fs.lstatSync(resolved).isSymbolicLink() returns true, refuse with SUSPICIOUS_STATE_ENTRY: <entry> (symlink)`. Add matching acceptance criterion. Remove the misleading `rmSync`-defaults parenthetical.
- **SEC-10 — User-scope partial-failure leaves orphaned `~/.copilot/` tree, no record.** When `user: true`, user-scope writes complete first; if repo-scope subsequently fails, the user has files under `~/.copilot/` with no inventory and no uninstall path. Shifts the same SEC-3 forgery surface to user-scope.
  - **Fix:** Either (a) write an equivalent schema-versioned state record at `~/.copilot/.adev-copilot-install.json` for symmetry, OR (b) explicitly declare user-scope uninstall out-of-scope for this spec and track in a follow-up issue with the same defense-in-depth requirements.

**New suggestion:**

- **SEC-11 — Windows `path.sep` containment portability.** `startsWith(<base> + path.sep)` is fragile across separators. Use `path.relative(base, resolved)` and require the result to be non-empty, not start with `..`, and not be absolute. Low priority (adev has no Windows quality gate yet).

## Consistency Analyzer — PASS

**New warning:**

- **CON-9 — Hook config filename idiom note.** Copilot documents `.github/hooks/*.json` as a wildcard scan with per-feature filenames; the spec collapses everything to a single `.github/hooks/hooks.json`. Wildcard-compatible (it matches), but novel.
  - **Fix:** One-line note under Install-Surface Map: "adev emits a single aggregated hooks file because adev's canonical `hooks/hooks.json` is single-file by design."

**New suggestion:**

- **CON-11 — Sibling-spec traceability.** Add an acceptance criterion: "The `copilot-hook-generator` sibling spec is implemented and `tests/copilot-hooks-sync.test.mjs` is green before this adapter is merged."

**Verified consistent:** CON-10 — relative hook-script path scheme `./scripts/<name>.sh` matches Copilot's documented hook schema example verbatim.

---

## Summary

**Total findings:** 9 (0 blockers, 3 warnings, 6 suggestions)

**Spec is unblocked for `/adev:plan`.** All three rev-1 blockers and all nine rev-1 warnings are confirmed resolved. The three new warnings (SEC-9 `rmSync` symlink check, SEC-10 user-scope inventory asymmetry, CON-9 filename idiom note) are all polish — none require structural rework. SEC-9 and SEC-10 are 5-minute edits.

**Recommended quick fixes before planning (optional):**
1. SEC-9: Add `lstatSync` symlink check in Behavior §4 + acceptance criterion.
2. SEC-10: Declare user-scope uninstall out-of-scope OR add a symmetric state record at `~/.copilot/.adev-copilot-install.json`.
3. CON-9: One-line note explaining the single-file aggregation choice.

After these (or proceeding as-is), the spec is ready for `/adev:plan`.
