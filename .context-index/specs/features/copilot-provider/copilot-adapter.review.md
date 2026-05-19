---
spec: .context-index/specs/features/copilot-provider/copilot-adapter.spec.md
charter: .context-index/specs/features/copilot-provider/charter.md
date: 2026-05-19
verdict: BLOCK
last-reviewed-revision: 1
file-sha: 6ef2a2183d12c4d1cb1f304e765844665e59d28a086621d8242e4b45aaf52542
---

# Architecture Review: copilot-adapter

> **Verdict:** BLOCK (3 blockers, 9 warnings, 7 suggestions)

## Reviewers Dispatched

| ID | Mode | Profile | Prompt |
|----|------|---------|--------|
| structural-architect | subagent | reviewer-reasoning | `plugin:review-specs/structural-architect-prompt.md` |
| security-reviewer | subagent | reviewer-capable | `plugin:review-specs/security-reviewer-prompt.md` |
| consistency-analyzer | subagent | reviewer-fast | `plugin:review-specs/consistency-analyzer-prompt.md` |

## Blockers (must fix before planning)

- **CON-1 — Missing peer-adapter exports.** Every existing `providers/*/adapter.mjs` exports `name`, `pluginRoot`, `version`, and a `detect()` method, in addition to `install`/`uninstall`/`status`. The spec's Acceptance Criteria and Behaviors do not require these. Without them, `cli/index.mjs` install-dispatch will not find Copilot — the dispatcher keys off `adapter.name` and `detect()`.
  - **Fix:** Add Behavior 0 covering `detect()` semantics (e.g., `process.env.COPILOT === "true" || existsSync(".github/copilot-instructions.md")`) and an acceptance criterion that the adapter exports the four constants plus `detect()`.
- **SEC-3 — State-record forgery enables arbitrary path deletion on uninstall.** `.github/.adev-copilot-install.json` is a tracked, committable JSON file. A malicious PR could rewrite it to list `["../../../etc"]` or `["/Users/victim/.ssh"]`. On the next `adev uninstall --target copilot`, the adapter would attempt to remove those paths.
  - **Fix:** Specify that uninstall MUST (a) re-validate each state-record skill entry against `^[a-z0-9-]{1,64}$`, (b) `path.resolve` + `startsWith(<projectRoot>/.github/skills/)` containment-check before any `rm`, (c) refuse deletions outside that prefix and add such entries to `residual` with a `SUSPICIOUS_STATE_ENTRY` annotation. Add a `STATE_RECORD_TAMPERED` error code.
- **SEC-5 — Absolute `PLUGIN_ROOT` path leaks into committed config.** Hook scripts under `PLUGIN_ROOT/hooks/*.sh` are referenced by **absolute path** in the generated `.github/hooks/adev-hooks.json`, which is committed. This (a) leaks the operator's username and filesystem layout into repo history, (b) breaks for every other contributor who clones the repo (the path is meaningless on their machine), and (c) is a supply-chain-adjacent risk if a colleague has different code at the same path.
  - **Fix:** Specify that the adapter MUST resolve hook script paths to a relative form (e.g., `./hooks/<name>.sh` relative to `.github/`) and either (a) copy the scripts into `.github/hooks/scripts/` so they are self-contained, or (b) reference them via a documented env var (`${ADEV_PLUGIN_ROOT}/hooks/<name>.sh`) the consumer's shell expands.

## Structural Architect — PASS_WITH_NOTES

**Warnings:**

- **SA-1 — `$COPILOT_HOME`-under-`$HOME` constraint is invented overreach.** The constraint has no basis in GitHub Copilot CLI docs and no peer-adapter precedent. It will break legitimate setups (CI containers, managed-laptop fleets).
  - **Fix:** Remove the constraint and `INVALID_COPILOT_HOME` error path; `getCopilotHome()` simply honors `$COPILOT_HOME || join(os.homedir(), '.copilot')`. Alternatively, cite an ADR.
- **SA-2 — Partial-rollback semantics on `INVALID_COPILOT_HOME`.** Repo-scope writes are not rolled back if user-scope fails. Leaves the consuming repo half-installed without any signal in `status`.
  - **Fix:** Validate `getCopilotHome()` BEFORE any repo-scope writes when `user: true`. Either both legs succeed or neither writes. Moot if SA-1 is resolved.

**Suggestions:**

- **SA-3 — `status.syncOutputPresent` cross-module reporting.** Clarify that `syncOutputPresent` is reported independently of `installed` (adapter is a read-only observer of sync-output files; no `status` outcome blocks on sync-output state).
- **SA-4 — State-record schema gap.** Uninstall depends on a `skills: string[]` field that install §1 does not guarantee to write. Either extend §1's state-record schema to include `skills` and `hookConfig` fields, or rephrase §4 to enumerate skills by reading `.github/skills/` directly. Pick one source of truth. (Also relevant to SEC-3 mitigation.)
- **SA-5 — Empty `~/.copilot/instructions/` directory is dead structure.** `--user` seeds skills/hooks but never seeds instructions (sync writes those per-repo). Either remove the empty-directory creation or extend `copilot-sync-output` to honor a user-scope flag.

## Security Reviewer — FAIL

**Warnings:**

- **SEC-1 — Path traversal validation ordering.** The regex DOES reject `..` and `/`, but the spec doesn't explicitly state that path construction uses only names returned by `validateSkillNames()`. State the ordering explicitly and add `path.resolve` + `startsWith` as a documented second defense layer per-write.
- **SEC-2 — Symlink following during recursive skill copy.** The spec does not specify symlink handling. The peer `opencode/adapter.mjs` uses `execSync("cp -r ...")` which preserves symlinks. A skill containing `leak.txt -> /etc/passwd` could exfiltrate into a committed `.github/skills/` tree.
  - **Fix:** Specify `fs.cpSync(src, dest, { recursive: true, dereference: false, verbatimSymlinks: false })` and throw `SKILL_CONTAINS_SYMLINK: <path>` on any symlink under `PLUGIN_ROOT/skills/`. Forbid `execSync("cp -r")`.
- **SEC-4 — `$COPILOT_HOME` containment fragile across platforms.** Windows casing/short-name aliases, macOS `/private/var/...` symlinks, legitimately-symlinked `$HOME` setups all defeat a literal `startsWith` check. Specify `fs.realpathSync` on both sides before compare; document Windows case normalization. (Moot if SA-1 is resolved by removing the constraint.)
- **SEC-6 — Downgrade attack surface on uninstall version drift.** Distinguish minor/patch drift (proceed with warning) from major drift OR missing schema-version field (require explicit `--force`, otherwise exit 1 with `STATE_RECORD_VERSION_INCOMPATIBLE`). Add a `schemaVersion: 1` field to the state record itself.

**Suggestions:**

- **SEC-7 — Partial-failure cleanup gap.** Either perform user-scope writes BEFORE repo-scope writes, or write the state record LAST after both surfaces complete. Document the chosen ordering.
- **SEC-8 — Frontmatter parsing trust boundary.** Specify allocation-bounded YAML parsing, regex-validate `name:` before equality check against dirname, NFC-normalize both sides or reject non-ASCII.

## Consistency Analyzer — FAIL

**Warnings:**

- **CON-2 — Hook config filename pivot lacks rationale.** Sibling spec emits `providers/copilot/hooks.json`; this spec writes `.github/hooks/adev-hooks.json`. Either document the deliberate `adev-` prefix (to avoid collision with user-authored sibling hook configs) or drop the prefix for byte-equivalence with the sibling.
- **CON-6 — `status` return shape drifts from charter Interface Contract.** Spec returns `{ installed, version, location, userSeeded, skillCount, hookConfigPresent, syncOutputPresent, agentsMd }`; charter line 128 documents only the first four fields. Bump charter revision 4 → 5 to document the richer shape; share the Spec trailer commit with the adapter implementation.
- **CON-8 — `install(opts)` argument convention divergence.** Peer adapters take `opts.scope`; this spec uses `opts.projectRoot` + `opts.user`. The divergence is principled (Copilot is repo-scoped, peers are user-scoped) but the spec must explicitly justify it in the Behavioral Contract preamble.

**Suggestions:**

- **CON-3 — AGENTS.md auto-load hint should reflect `chat.useAgentsMdFile` setting gate.** Research §Q1 qualifies auto-load as setting-gated. Soften the hint string to: `"VS Code Copilot (when chat.useAgentsMdFile enabled) and Copilot CLI auto-load AGENTS.md at the repo root"`.
- **CON-7 — `.github/.adev-copilot-install.json` is a novel naming convention.** Acceptable (Copilot has no plugin home) but call out as a deliberate deviation in the Install-Surface Map preamble.

**Verified consistent (no action):** CON-4 (skill-name regex matches research §Q10), CON-5 ("no plugin home" framing matches charter and constitution anti-pattern).

---

## Summary

**Total findings:** 19 (3 blockers, 9 warnings, 7 suggestions)

**Action required:** The spec is **BLOCKED** for planning. The three blockers (CON-1 missing peer-adapter exports, SEC-3 state-record forgery, SEC-5 absolute-path leak in committed config) must be resolved before `/adev:plan`. The warnings should be folded in during the same revision pass — most resolve trivially alongside the blockers.

**Suggested revision pass:**

1. **CON-1:** Add `detect()`, `name`, `pluginRoot`, `version` to adapter exports + acceptance criteria.
2. **SEC-3:** Tighten uninstall path-confinement with re-validation + `startsWith` check + `SUSPICIOUS_STATE_ENTRY` annotation.
3. **SEC-5:** Switch to relative hook-script paths (copy scripts into `.github/hooks/scripts/` or use `${ADEV_PLUGIN_ROOT}` env var).
4. **SA-1 + SEC-4:** Remove the invented `$COPILOT_HOME`-under-`$HOME` constraint and its error path entirely.
5. **SA-2 + SEC-7:** Move user-scope validation/writes before repo-scope writes so partial-failure leaves no state record.
6. **SA-4:** Extend state-record schema with `skills: string[]` and `hookConfig: string` for SEC-3 mitigation.
7. **SEC-2:** Specify `fs.cpSync({ dereference: false })` and `SKILL_CONTAINS_SYMLINK`.
8. **SEC-6:** Add `schemaVersion: 1` to state record + version-drift gating.
9. **CON-2/CON-6/CON-8:** Add rationale paragraphs for the documented pivots; bump charter rev 4 → 5 for the richer `status` shape.

After revisions, re-run `/adev:review-specs --spec .context-index/specs/features/copilot-provider/copilot-adapter.spec.md`.
