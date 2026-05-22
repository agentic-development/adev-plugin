# Live Spec: CopilotAdapter — install / uninstall / status

<!-- Live Spec within the copilot-provider charter.
     Parent Charter: .context-index/specs/features/copilot-provider/charter.md
     Covers: CopilotAdapter install/uninstall/status, Skill name compliance check,
     CLI install integration, CLI charter revision, --user flag seeding,
     AGENTS.md compat confirmation, Smoke install verification. -->

---
charter: copilot-provider
kind: behavioral
status: validated
risk_level: medium
milestone: v1
revision: 3
charter-revision: 6
created: 2026-05-19
updated: 2026-05-19
source-manifest:
  sha: "4995177"
  files:
    - .context-index/specs/features/cli/charter.md
    - cli/index.mjs
    - docs/smoke-install-copilot.md
    - lib/provider/registry.mjs
    - lib/providers/copilot/README.md
    - lib/providers/copilot/hook-config-rewriter.mjs
    - lib/providers/copilot/skill-validator.mjs
    - lib/providers/copilot/symlink-scanner.mjs
    - providers/copilot/adapter.mjs
    - tests/copilot-adapter-uninstall-defense.test.mjs
    - tests/copilot-adapter.test.mjs
    - tests/copilot-hook-config-rewriter.test.mjs
    - tests/copilot-skill-validator.test.mjs
    - tests/copilot-symlink-scanner.test.mjs
  computed-at: "2026-05-19T20:22:00.045Z"
drift_detected: true
---

## Behavioral Contract

`CopilotAdapter` is adev's fifth peer provider adapter. Unlike Claude Code, OpenCode, Codex, and Cursor — all of which install to a per-user plugin home — Copilot has **no plugin home**. The customization surface is the consuming project's `.github/` tree, materialized at install time. Optionally, an opt-in `--user` flag mirrors a subset of the install to `~/.copilot/*` for personal-scope coverage across all repos. The adapter validates Copilot's skill-name regex pre-install and refuses installs that would write non-conforming names rather than silently rewriting them.

**Argument-convention divergence from peers.** Peer adapters take `opts.scope`; `CopilotAdapter.install` takes `opts.projectRoot` + `opts.user`. This is principled: Copilot's customization is repo-scoped by design (files live in the consuming project's `.github/` tree), while Claude Code / OpenCode / Codex are fundamentally user-scoped (files live in `~/.claude/`, `~/.config/opencode/`, etc.). The divergence is documented in `lib/providers/<name>/README.md` (added alongside the implementation) so future adapter authors understand the boundary.

### Peer-Adapter Surface (required exports)

`CopilotAdapter` MUST export the four named-constant fields and the `detect()` method that every other peer adapter exports — `cli/index.mjs` install-dispatch keys off `adapter.name` and `adapter.detect()`. Without them the dispatcher cannot find Copilot.

| Export | Value / Signature |
|---|---|
| `name` | `"copilot"` (string) |
| `pluginRoot` | resolved absolute path of the running plugin (mirrors `PLUGIN_ROOT` in peer adapters) |
| `version` | read from `package.json:version` at module load (mirrors peer adapters) |
| `detect()` | returns `true` if `process.env.COPILOT === "true"` OR `existsSync(join(cwd, '.github/copilot-instructions.md'))` OR `existsSync(getCopilotHome())` |
| `install(opts)` | see Behaviors §1–§3 |
| `uninstall(opts)` | see Behavior §4 |
| `status(opts)` | see Behavior §5 |
| `getCopilotHome()` | returns `process.env.COPILOT_HOME || join(os.homedir(), '.copilot')` (no further validation) |
| `validateSkillNames(skillsDir)` | see Behavior §6 |

### Preconditions

- The current working directory is a git repository (the consuming project) — required because the install writes into `.github/`, which is a per-repo convention.
- The plugin source tree is resolvable from the running adapter (`pluginRoot` per peer-adapter pattern).
- Every adev skill under `skills/` has a `SKILL.md` whose `name:` frontmatter matches `^(adev:)?[a-z0-9-]{1,64}$`. The frontmatter name MAY carry an `adev:` namespace prefix (the project convention — `skills/init/SKILL.md` declares `name: adev:init`); the parent directory name MUST byte-equal the frontmatter name **after stripping any leading `adev:` prefix**. Skills whose frontmatter has no `adev:` prefix (e.g., `using-adev`) are validated against the un-prefixed dirname directly.
- The committed `providers/copilot/hooks.json` deep-equals the output of the hook generator (enforced by `tests/copilot-hooks-sync.test.mjs` from the sibling spec; this adapter only consumes the committed file).
- Node.js runtime is available; no external dependencies are required.

### Install-Surface Map

Every emitted file destination is sourced from exactly one of two surfaces. The adapter writes only **skills, hook config, hook scripts, and the state record**. The sync-output files (`.github/copilot-instructions.md` and `.github/instructions/*.instructions.md`) are owned by the `copilot-sync-output` sibling spec; the adapter is silent on them in `install`/`uninstall` and only observes their presence in `status`. The state record at `.github/.adev-copilot-install.json` is the only adev-managed file outside the documented Copilot surface — required because Copilot has no plugin home to record install metadata in.

| Surface | Path (repo) | Path (user, `--user` flag) | Source |
|---|---|---|---|
| Skills | `<projectRoot>/.github/skills/<skill>/SKILL.md` (recursive copy of skill dir) | `~/.copilot/skills/<skill>/SKILL.md` | adev's `skills/<skill>/` |
| Hook config | `<projectRoot>/.github/hooks/hooks.json` | `~/.copilot/hooks/hooks.json` | adev's committed `providers/copilot/hooks.json` (byte-equivalent copy, filename matches sibling spec output for symmetry) |
| Hook scripts | `<projectRoot>/.github/hooks/scripts/<name>.sh` (copied; referenced by relative path inside `hooks.json`) | `~/.copilot/hooks/scripts/<name>.sh` | adev's `hooks/*.sh` |
| Repo-wide instructions | `<projectRoot>/.github/copilot-instructions.md` | (n/a — user-level uses `~/.copilot/instructions/*.instructions.md` only) | written by `/adev:sync`; the adapter only verifies presence in `status` |
| Per-module instructions | `<projectRoot>/.github/instructions/<module>.instructions.md` | (n/a) | written by `/adev:sync`; adapter verifies presence in `status` |
| Adapter state record | `<projectRoot>/.github/.adev-copilot-install.json` | n/a | adapter itself |

### State Record Schema

The state record at `<projectRoot>/.github/.adev-copilot-install.json` is a JSON object with exactly the following shape. All paths inside are **relative to `<projectRoot>/.github/`** and use forward slashes. This schema is the source of truth for uninstall — uninstall enumerates only paths listed here, after re-validating them per Behavior §4.

```json
{
  "schemaVersion": 1,
  "pluginVersion": "0.27.0",
  "installedAt": "2026-05-19T...Z",
  "user": false,
  "skills": ["init", "brainstorm", "..."],
  "hookConfig": "hooks/hooks.json",
  "hookScripts": ["hooks/scripts/check-merge-protect.sh", "..."]
}
```

The state record is the only source of truth for what uninstall touches. Skill directories not listed in `skills[]` are NOT removed (they may have been added by the user). Hook scripts and config not listed are NOT removed. This is the core mitigation for SEC-3 (state-record forgery): even if an attacker tampered with the file to list paths outside `.github/skills/` or `.github/hooks/`, uninstall's containment check rejects them before any `rm`.

### Behaviors

0. **When** `CopilotAdapter.detect()` runs, **then** it returns `true` if any of: (a) `process.env.COPILOT === "true"`, (b) the consuming project contains `.github/copilot-instructions.md`, or (c) `getCopilotHome()` resolves to an existing directory. Returns `false` otherwise. Pure (no writes).
1. **When** `CopilotAdapter.install({ projectRoot, dryRun: false, user: false })` runs against a git-repository `projectRoot`, **then** the adapter (a) runs `validateSkillNames()` over every skill in `pluginRoot/skills/` and uses only validated names for path construction, (b) for each skill directory, scans for symlinks via `fs.lstatSync` and throws `SKILL_CONTAINS_SYMLINK: <path>` on any encountered, (c) creates `.github/skills/`, `.github/hooks/`, `.github/hooks/scripts/`, and `.github/` directories as needed, (d) copies each skill into `.github/skills/<skill>/` using `fs.cpSync(src, dest, { recursive: true, dereference: false, verbatimSymlinks: false, errorOnExist: false })`, (e) copies `providers/copilot/hooks.json` to `.github/hooks/hooks.json` and rewrites every script reference inside it — replacing both absolute `pluginRoot/hooks/<name>.sh` substrings AND `${CLAUDE_PLUGIN_ROOT}/hooks/<name>.sh` runtime-placeholder substrings with repo-relative `./scripts/<name>.sh`, (f) copies each referenced `hooks/*.sh` to `.github/hooks/scripts/<name>.sh` and chmods them executable, (g) writes the state record **last** with the actual skill list, hook config path, and hook script list emitted in this run, and (h) returns `{ installed: true, version, location: <projectRoot>/.github, userSeeded: false }`.
2. **When** `CopilotAdapter.install({ ..., user: true })` runs, **then** the adapter performs the user-scope writes **before** any repo-scope writes — materializing a parallel tree under `getCopilotHome()`: `~/.copilot/skills/<skill>/SKILL.md`, `~/.copilot/hooks/hooks.json` (with the same path-rewrite covering both absolute and `${CLAUDE_PLUGIN_ROOT}` forms), and `~/.copilot/hooks/scripts/<name>.sh`. The repo-scope leg then runs identically to §1. The state record records `user: true`. User-scope writes never produce a state record (uninstall does not touch user-scope by default; see §4).
3. **When** `CopilotAdapter.install({ ..., dryRun: true })` runs, **then** the adapter performs all validation (including `validateSkillNames` and symlink detection) and computes the full list of paths it would write, returns a `{ wouldWrite: string[], skipped: string[], errors: string[] }` summary, and writes nothing to disk.
4. **When** `CopilotAdapter.uninstall({ projectRoot })` runs, **then** the adapter reads `.github/.adev-copilot-install.json`, validates `schemaVersion` (see Behavior §4a), and for every entry in `skills[]`, `hookConfig`, and `hookScripts[]`: (a) re-validates the entry against `^[a-z0-9-]{1,64}$` for skills (full path constraint for hook entries), (b) `path.resolve`s the absolute target, (c) asserts the resolved path `startsWith(<projectRoot>/.github/skills/ + path.sep)` for skills or `startsWith(<projectRoot>/.github/hooks/ + path.sep)` for hook entries, (d) refuses to remove anything that fails (a) or (c) and adds those entries to `residual` annotated `SUSPICIOUS_STATE_ENTRY: <entry>`, (e) `fs.rmSync(target, { recursive: true, force: true })` without symlink-following (`{ ...other-opts, force: true }` — note `rmSync` does not follow symlinks at the recursion root by default). Then removes the state record itself. Leaves untouched `.github/copilot-instructions.md` and `.github/instructions/*.instructions.md`. Returns `{ removed: true, residual: string[] }`.
4a. **When** the state record's `schemaVersion` is not exactly `1`, **then** uninstall fails closed: it writes `STATE_RECORD_VERSION_INCOMPATIBLE: <found-schemaVersion>` to stderr and exits with code `1` unless `--force` is passed. With `--force` it proceeds with a warning. Plugin-version mismatch (state record from an older `pluginVersion`) is treated as a non-fatal warning regardless of `--force`.
5. **When** `CopilotAdapter.status({ projectRoot })` runs, **then** it reads `.github/.adev-copilot-install.json` (if present) and reports `{ installed: bool, version, location, userSeeded, skillCount, hookConfigPresent: bool, syncOutputPresent: { repoInstructions: bool, moduleInstructions: bool }, agentsMd: { exists: bool, autoLoadHint: string } }`. **The `syncOutputPresent` block is reported independently of `installed`** — the adapter is a read-only observer of sync-output files and never blocks a `status` outcome on them. The `agentsMd.autoLoadHint` string is the literal: `"VS Code Copilot (when chat.useAgentsMdFile is enabled) and Copilot CLI auto-load AGENTS.md at the repo root."`
6. **When** `validateSkillNames(skillsDir)` runs, **then** it (a) lists every entry in `skillsDir`, skipping non-directory entries (e.g., stray loose files) without warning, (b) reads each `SKILL.md` frontmatter using an allocation-bounded parser (input capped at 64 KiB; reject on overflow), (c) NFC-normalizes the directory name and the frontmatter `name:` value, (d) asserts the directory name itself matches `^[a-z0-9-]{1,64}$` (Copilot's Agent Skills directory constraint), (e) asserts the frontmatter name matches `^(adev:)?[a-z0-9-]{1,64}$`, (f) computes `normalizedName = frontmatterName.startsWith('adev:') ? frontmatterName.slice('adev:'.length) : frontmatterName` and asserts `normalizedName` byte-equals the directory name, (g) throws `INVALID_SKILL_NAME: <dirName> (frontmatter: <frontmatterName>; constraint: ^(adev:)?[a-z0-9-]{1,64}$)` on regex failure, or `SKILL_NAME_MISMATCH: <dirName> vs <normalizedName>` on equality failure. Skills whose `SKILL.md` is missing or has no `name:` field at all are skipped (treated as not-an-adev-skill); the validator emits a debug-level notice `skipped: no name field at <path>` to stderr to preserve observability without failing. **Skipped skills are omitted from the returned list and are NOT copied by `install`.** Returns the validated list of directory names (Copilot-conformant lowercase-hyphen form, without `adev:` prefix). Pure (no filesystem writes).
7. **When** `adev install --target copilot [--user] [--dry-run]` is invoked, **then** the CLI dispatcher routes through `CopilotAdapter.install({ projectRoot: process.cwd(), dryRun, user })` and prints the adapter's return value as a status line. The same dispatch routes `adev uninstall --target copilot [--force]` and `adev status --target copilot`.
8. **When** the `cli` charter is read by humans or hygiene tooling after this spec's implementation lands, **then** the `install` verb description lists Claude Code, OpenCode, Codex, Cursor, **and** Copilot — confirming the registry expansion.
9. **When** a smoke-install procedure is followed against a fixture repo (documented as Quality Attribute below), **then** the operator confirms (a) `.github/skills/` is materialized, (b) `.github/hooks/hooks.json` is materialized with relative script paths, (c) `.github/hooks/scripts/*.sh` are materialized and executable, (d) launching the `copilot` CLI inside the fixture loads at least one adev skill (visible via `/skills`), and (e) Copilot's auto-discovery picks up `AGENTS.md` and `.github/copilot-instructions.md`.

### Postconditions

- After a successful `install`: `.github/.adev-copilot-install.json` exists with `schemaVersion: 1`, the installed `pluginVersion`, and accurate `skills`, `hookConfig`, and `hookScripts` lists. `.github/skills/` contains a copy of every validated skill. `.github/hooks/hooks.json` deep-equals `providers/copilot/hooks.json` from `pluginRoot` **except** that script references — whether absolute `pluginRoot/hooks/...` or `${CLAUDE_PLUGIN_ROOT}/hooks/...` runtime placeholders — are uniformly rewritten to repo-relative `./scripts/<name>.sh`. `.github/hooks/scripts/` contains a copy of every referenced hook script with executable bit set. When `user: true`, `~/.copilot/` mirrors the same skills, hook config, and hook scripts. **No absolute paths from the operator's machine, and no `${CLAUDE_PLUGIN_ROOT}` placeholders, appear in any committed file.**
- After a successful `uninstall`: no `.github/.adev-copilot-install.json` exists, every skill / hook config / hook script the state record listed (and passed re-validation) is removed, and any sync-output files (`.github/copilot-instructions.md`, `.github/instructions/`) are untouched. User-scope files under `~/.copilot/` are NOT touched by repo-scope uninstall.
- `status` returns the same shape regardless of install state; the `installed` boolean discriminates; `syncOutputPresent` is reported independently.
- The adapter never writes outside `<projectRoot>/.github/` (and `getCopilotHome()` when `--user`). The output path is resolved with `path.resolve()` and asserted to start with `<projectRoot> + path.sep` (or `getCopilotHome() + path.sep` for user-scope writes) before any write.
- The state record is the **single source of truth** for what `uninstall` touches. Re-validation at uninstall time ensures a tampered state record cannot trigger deletion outside `.github/skills/` or `.github/hooks/`.

### Error Cases

| Condition | Expected Behavior | Exit Code |
|-----------|-------------------|-----------|
| `projectRoot` is not a git repository (no `.git/` directory) | Write `NOT_A_GIT_REPO: <projectRoot>` to stderr; no install performed | 1 |
| Any skill's frontmatter `name:` violates `^(adev:)?[a-z0-9-]{1,64}$`, or the directory name violates `^[a-z0-9-]{1,64}$` | Throw `INVALID_SKILL_NAME: <dirName> ...`; no install performed | 1 |
| A skill's `SKILL.md` frontmatter `name:` field disagrees with the parent directory name | Throw `SKILL_NAME_MISMATCH: <dirName> vs <frontmatterName>`; no install performed | 1 |
| `SKILL.md` frontmatter exceeds 64 KiB or contains non-ASCII bytes | Throw `INVALID_SKILL_FRONTMATTER: <path>`; no install performed | 1 |
| Skill source directory contains a symlink anywhere in its tree | Throw `SKILL_CONTAINS_SYMLINK: <path>`; no install performed | 1 |
| `providers/copilot/hooks.json` is missing from `pluginRoot` | Throw `MISSING_HOOK_CONFIG: <expected-path>`; no install performed | 1 |
| Resolved write path escapes `projectRoot` (or `getCopilotHome()` for `--user`) | Throw `INSTALL_PATH_ESCAPE: <resolved-path>`; no install performed | 1 |
| State record `schemaVersion` is not `1` during uninstall | Write `STATE_RECORD_VERSION_INCOMPATIBLE: <found>` to stderr; refuse to proceed unless `--force` is passed | 1 (0 with `--force`) |
| State record contains an entry that fails regex re-validation, or whose resolved path escapes `.github/skills/` (skills) or `.github/hooks/` (hook entries) | Skip that entry; add to `residual` annotated `SUSPICIOUS_STATE_ENTRY: <entry>`; continue with remaining entries | 0 |
| State record itself unreadable / malformed JSON | Write `STATE_RECORD_TAMPERED: <path>: <parser-error>` to stderr; exit without removing anything | 1 |

Error message convention: all paths in stderr are repo-relative when inside `projectRoot`, user-home-relative (`~/...`) when inside `getCopilotHome()`, and absolute otherwise (matching the precedent set by the hook-generator spec).

Throw-vs-exit semantics: error conditions are signalled by throwing `Error` instances whose `message` is the documented error string. The adapter entrypoint (called by `cli/index.mjs`) wraps the body in a try/catch that writes `err.message` to stderr and calls `process.exit(1)`. The adapter library functions throw freely; only the entrypoint converts throws into exits. Mirrors the convention in `copilot-hook-generator.spec.md`.

### AGENTS.md Compatibility Stance

adev already writes `AGENTS.md` at repo root for cross-tool compatibility (consumed by Claude Code, OpenCode, Codex, Cursor). GitHub Copilot's VS Code surface auto-loads `AGENTS.md` when `chat.useAgentsMdFile` is enabled; the Copilot CLI auto-loads it unconditionally. This spec adds **no new write path** for AGENTS.md; the adapter only verifies its presence in `status` and surfaces the documented (setting-gated) auto-load hint. If Copilot's auto-load behavior changes, this stance must be revisited via a charter revision.

## System Constitution Reference

- **Principle 1:** "Minimize external dependencies — prefer Node.js built-ins." — Applies because the adapter uses only `node:fs`, `node:path`, `node:url`, `node:os`, `node:crypto`, and `node:child_process` (for git-detect, mirroring existing peer adapters). No new `package.json` dependencies are added.
- **Principle 3:** "Pure ESM — all `.mjs` files, no CommonJS." — Applies to every new module: `providers/copilot/adapter.mjs`, any helper under `lib/providers/copilot/`, and the validator.
- **Anti-pattern: "No hardcoded paths to `~/.claude/` — use the plugin root resolution from `cli/index.mjs`."** — Applies inversely: the adapter MUST NOT hardcode `~/.copilot/`. `getCopilotHome()` resolves `process.env.COPILOT_HOME || join(os.homedir(), '.copilot')` with no further validation (per peer-adapter precedent — no `getClaudeHome()` or `getCursorHome()` constrains its env override).
- **Quality Gate:** "`npm test` must pass before any implementation is considered complete." — Applies because new adapter behavior is unit-tested using `tests/helpers.mjs` (`createTempDir`, `cleanupTempDir`, `writeFixture`) — no Copilot runtime needed for the unit-test layer; smoke-install verification is a separate manual quality attribute.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Implement `getCopilotHome()` | Pure function returning `process.env.COPILOT_HOME || join(os.homedir(), '.copilot')`. No validation beyond returning the resolved path. | small |
| Implement `validateSkillNames(skillsDir)` | Pure function per Behavior §6: list dirs, read frontmatter with allocation-bounded parser, NFC-normalize, regex+equality check, throw documented error codes. | medium |
| Implement symlink scanner | Recursive walk of a skill source dir using `fs.lstatSync`. Throws `SKILL_CONTAINS_SYMLINK: <path>` on first symlink. Called before any copy. | small |
| Implement hook-path rewriter | Pure function that takes the loaded `providers/copilot/hooks.json`, finds every `bash:` / `command:` field referencing either absolute `pluginRoot/hooks/<name>.sh` OR `${CLAUDE_PLUGIN_ROOT}/hooks/<name>.sh` runtime placeholder, and rewrites to `./scripts/<name>.sh`. Returns the rewritten config + the deduplicated list of referenced script basenames. Unit-tested for both input forms; output assertion includes zero `${CLAUDE_PLUGIN_ROOT}` substrings and zero absolute pluginRoot substrings. | small |
| Author `providers/copilot/adapter.mjs` | Implement `detect`, `install`, `uninstall`, `status`, plus exported constants (`name`, `pluginRoot`, `version`). Mirror `providers/opencode/adapter.mjs` shape. Use `fs.cpSync({ dereference: false })`, NOT `execSync('cp -r')`. Containment-check every resolved write path. State record written last. User-scope writes before repo-scope writes when `user: true`. | medium |
| Wire `adev install --target copilot` | Update `cli/index.mjs` install dispatch to recognize `copilot` as a target (via `adapter.name === 'copilot'`), parse `--user`, `--dry-run`, `--force`, route to the adapter. Same for `uninstall` and `status` verbs. | medium |
| CLI charter revision | Update `.context-index/specs/features/cli/charter.md`: bump the `install` command description's provider list to include `Copilot` and bump the charter's `revision:`. Commit alongside the adapter implementation under the same Spec trailer. | small |
| Copilot-provider charter status-shape revision (4 → 5) | Bump `.context-index/specs/features/copilot-provider/charter.md` revision 4 → 5; expand the `CopilotAdapter.status` Interface Contract row to document the richer return shape (`skillCount`, `hookConfigPresent`, `syncOutputPresent`, `agentsMd`). Share the Spec trailer with adapter implementation. | small |
| Author `lib/providers/copilot/README.md` | Brief README documenting the principled `opts.projectRoot` + `opts.user` divergence from peer adapters' `opts.scope` (Copilot is repo-scoped; peers are user-scoped). | small |
| Author unit tests | `tests/copilot-adapter.test.mjs` covering: install in a fixture repo, install with `--user`, uninstall after install, status before/after install, dry-run install, `INVALID_SKILL_NAME` rejection, `SKILL_CONTAINS_SYMLINK` rejection, `INSTALL_PATH_ESCAPE` rejection, idempotent install, **`SUSPICIOUS_STATE_ENTRY` rejection** (tamper state record to list `../etc/passwd`; assert uninstall refuses), **`STATE_RECORD_VERSION_INCOMPATIBLE` gating** (synthetic `schemaVersion: 2`; assert exit 1 without `--force` and exit 0 with), **absolute-path absence** (assert committed `hooks.json` contains no absolute paths). | medium |
| Author smoke-install procedure | Write `docs/smoke-install-copilot.md` documenting manual steps: clone fixture repo, run `adev install --target copilot`, install `@github/copilot` CLI, launch `copilot` in fixture, type `/skills`, confirm adev skill loads, confirm `AGENTS.md` and `.github/copilot-instructions.md` are auto-discovered. | small |
| AGENTS.md auto-load check in status | Add the `agentsMd: { exists, autoLoadHint }` block to `CopilotAdapter.status()` output with the setting-gated hint string. Unit-test the hint string equals the documented Behavior §5 literal. | small |

## Acceptance Criteria

- [ ] `providers/copilot/adapter.mjs` exports `CopilotAdapter` with the full peer-adapter surface: `name: "copilot"`, `pluginRoot`, `version`, `detect()`, `install()`, `uninstall()`, `status()`, `getCopilotHome()`, `validateSkillNames()`. Pure ESM, Node built-ins only.
- [ ] `cli/index.mjs` install/uninstall/status dispatchers find and route to `CopilotAdapter` via `adapter.name === "copilot"`.
- [ ] `CopilotAdapter.detect()` returns `true` when any of (`$COPILOT === "true"`, `.github/copilot-instructions.md` exists, `getCopilotHome()` exists); unit-tested.
- [ ] `CopilotAdapter.install` writes `.github/skills/`, `.github/hooks/hooks.json` (with relative script paths), `.github/hooks/scripts/*.sh` (executable bit set), and `.github/.adev-copilot-install.json` (state record written last). Returns the documented shape.
- [ ] `.github/hooks/hooks.json` contains zero absolute paths from the operator's machine AND zero `${CLAUDE_PLUGIN_ROOT}` placeholder substrings; every script reference is `./scripts/<name>.sh` relative to `.github/hooks/`. Unit-tested by string-scanning the emitted config for both `pluginRoot` and `${CLAUDE_PLUGIN_ROOT}` substrings.
- [ ] `CopilotAdapter.install({ user: true })` writes user-scope first under `getCopilotHome()`, then repo-scope. Partial-failure leaves no state record. Verified by a synthetic test that triggers a user-scope write failure mid-install and asserts the repo `.github/.adev-copilot-install.json` is absent.
- [ ] `CopilotAdapter.install({ dryRun: true })` writes nothing and returns `{ wouldWrite, skipped, errors }`. Includes validation results (so `INVALID_SKILL_NAME` surfaces in dry-run without writing).
- [ ] `CopilotAdapter.uninstall` removes only files listed in `.github/.adev-copilot-install.json`, after re-validating each entry against the regex AND `startsWith(.github/skills/|.github/hooks/)`. Synthetic test: tamper the state record to list `["../etc/passwd"]` and `["/Users/victim/.ssh"]`; assert both are rejected with `SUSPICIOUS_STATE_ENTRY` annotations in `residual` and that no file outside `.github/` is removed.
- [ ] `CopilotAdapter.uninstall` rejects a state record with `schemaVersion: 2` (no `--force`) with exit 1; accepts with `--force` and exits 0 with a warning.
- [ ] `CopilotAdapter.uninstall` proceeds (warning only) on `pluginVersion` mismatch but exits 1 on missing `schemaVersion` field.
- [ ] `CopilotAdapter.status` returns `{ installed, version, location, userSeeded, skillCount, hookConfigPresent, syncOutputPresent, agentsMd }` and the `syncOutputPresent` block is computed independently of `installed`. The `agentsMd.autoLoadHint` string equals the documented Behavior §5 literal.
- [ ] `validateSkillNames` (a) **accepts** a synthetic skill whose dir is `init` and frontmatter is `name: adev:init` (positive prefix-stripping path), (b) **accepts** a synthetic skill whose dir is `using-adev` and frontmatter is `name: using-adev` (no prefix), (c) **skips** a synthetic skill whose `SKILL.md` has no `name:` field, (d) **rejects** a synthetic skill whose dir is `Foo_Bar` (`INVALID_SKILL_NAME`), (e) **rejects** a synthetic skill where the prefix-stripped frontmatter name disagrees with the dirname (`SKILL_NAME_MISMATCH`), (f) **rejects** a synthetic skill whose frontmatter contains non-ASCII bytes (`INVALID_SKILL_FRONTMATTER`).
- [ ] The symlink scanner rejects a skill directory containing any symlink — both at the top level and nested.
- [ ] The recursive copy uses `fs.cpSync(src, dest, { recursive: true, dereference: false, verbatimSymlinks: false })`. The adapter does NOT use `execSync('cp -r')`.
- [ ] All resolved write paths are asserted to start with `<projectRoot> + path.sep` or `getCopilotHome() + path.sep` before any write; an `INSTALL_PATH_ESCAPE` synthetic test confirms the assertion fires.
- [ ] `adev install --target copilot` invokes the adapter and prints its return; `--user` toggles user-scope; `--dry-run` exercises validation; `adev uninstall --target copilot [--force]` and `adev status --target copilot` route correctly.
- [ ] The `cli` charter's `install` verb description includes "Copilot" in its provider list, and the charter's `revision:` is bumped.
- [ ] The `copilot-provider` charter's `CopilotAdapter.status` Interface Contract row documents the richer return shape; charter `revision:` bumped to 5.
- [ ] `lib/providers/copilot/README.md` documents the `opts.projectRoot` + `opts.user` argument-convention divergence from peer adapters.
- [ ] `docs/smoke-install-copilot.md` (or equivalent) exists and documents a reproducible manual install + verification procedure.
- [ ] Idempotent install: running `install` twice against the same `projectRoot` succeeds both times and produces an identical post-state on the second run (no duplicate entries, no errors).
- [ ] No new entries added to `package.json` `dependencies` or `devDependencies`.
- [ ] All quality gates pass (`npm test`).
- [ ] No constitutional violations introduced.
