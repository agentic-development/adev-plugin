# Live Spec: CopilotAdapter — install / uninstall / status

<!-- Live Spec within the copilot-provider charter.
     Parent Charter: .context-index/specs/features/copilot-provider/charter.md
     Covers: CopilotAdapter install/uninstall/status, Skill name compliance check,
     CLI install integration, CLI charter revision, --user flag seeding,
     AGENTS.md compat confirmation, Smoke install verification. -->

---
charter: copilot-provider
kind: behavioral
status: review-pending
risk_level: medium
milestone: v1
revision: 1
charter-revision: 4
created: 2026-05-19
updated: 2026-05-19
---

## Behavioral Contract

`CopilotAdapter` is adev's fifth peer provider adapter. Unlike Claude Code, OpenCode, Codex, and Cursor — all of which install to a per-user plugin home — Copilot has **no plugin home**. The customization surface is the consuming project's `.github/` tree, materialized at install time. Optionally, an opt-in `--user` flag mirrors a subset of the install to `~/.copilot/*` for personal-scope coverage across all repos. The adapter validates Copilot's skill-name regex pre-install and refuses installs that would write non-conforming names rather than silently rewriting them.

### Preconditions

- The current working directory is a git repository (the consuming project) — required because the install writes into `.github/`, which is a per-repo convention.
- The plugin source tree is resolvable from the running adapter (`PLUGIN_ROOT` per existing adapter pattern).
- Every adev skill under `skills/` has a `SKILL.md` whose `name:` frontmatter equals its parent directory name and matches `^[a-z0-9-]{1,64}$`.
- The committed `providers/copilot/hooks.json` deep-equals the output of the hook generator (enforced by `tests/copilot-hooks-sync.test.mjs` from the sibling spec; this adapter only consumes the committed file).
- Node.js runtime is available; no external dependencies are required.

### Install-Surface Map

Every emitted file destination is sourced from exactly one of two surfaces:

| Surface | Path (repo) | Path (user, `--user` flag) | Source |
|---|---|---|---|
| Skills | `<projectRoot>/.github/skills/<skill>/SKILL.md` (recursive copy of skill dir) | `~/.copilot/skills/<skill>/SKILL.md` | adev's `skills/<skill>/` |
| Hook config | `<projectRoot>/.github/hooks/adev-hooks.json` | `~/.copilot/hooks/adev-hooks.json` | adev's committed `providers/copilot/hooks.json` |
| Hook scripts (referenced by hook config) | resolved from `PLUGIN_ROOT/hooks/*.sh` via path in hook config (no copy) | same | adev's `hooks/` |
| Repo-wide instructions | `<projectRoot>/.github/copilot-instructions.md` | n/a (user-level uses `~/.copilot/instructions/*.instructions.md` only) | written by `/adev:sync`; the adapter only verifies presence post-install |
| Per-module instructions | `<projectRoot>/.github/instructions/<module>.instructions.md` | `~/.copilot/instructions/<module>.instructions.md` (when `--user`) | written by `/adev:sync`; adapter verifies post-install |
| Adapter state record | `<projectRoot>/.github/.adev-copilot-install.json` | n/a | adapter itself (records installed version + sources) |

The adapter writes the **skills, hook config, and state record**. The sync-output files (`.github/copilot-instructions.md` and `.github/instructions/*.instructions.md`) are owned by the `copilot-sync-output` sibling spec; the adapter only verifies their presence in `status` and is silent on them in `install`/`uninstall`.

### Behaviors

1. **When** `CopilotAdapter.install({ projectRoot, dryRun: false, user: false })` runs against a git-repository `projectRoot`, **then** the adapter (a) runs `validateSkillNames()` over every skill in `PLUGIN_ROOT/skills/`, refusing the install if any skill violates `^[a-z0-9-]{1,64}$`, (b) creates `.github/skills/`, `.github/hooks/`, and `.github/` directories as needed, (c) copies each skill's `SKILL.md` (and any companion files in the skill directory) into `.github/skills/<skill>/`, (d) copies `providers/copilot/hooks.json` to `.github/hooks/adev-hooks.json`, (e) writes `.github/.adev-copilot-install.json` recording `{ version, installedAt, source: PLUGIN_ROOT, user: false }`, and (f) returns `{ installed: true, version, location: <projectRoot>/.github, userSeeded: false }`.
2. **When** `CopilotAdapter.install({ ..., user: true })` runs, **then** in addition to the repo-level writes above, the adapter materializes a parallel tree under `getCopilotHome()` (`~/.copilot/` honoring `$COPILOT_HOME`): `~/.copilot/skills/<skill>/SKILL.md`, `~/.copilot/hooks/adev-hooks.json`, `~/.copilot/instructions/` (created empty if not present), and returns `{ ..., userSeeded: true }`. User-scope writes never include the adapter state record.
3. **When** `CopilotAdapter.install({ ..., dryRun: true })` runs, **then** the adapter performs all validation (including `validateSkillNames`) and computes the full list of paths it would write, returns a `{ wouldWrite: string[], skipped: string[], errors: string[] }` summary, and writes nothing to disk.
4. **When** `CopilotAdapter.uninstall({ projectRoot })` runs, **then** the adapter removes `.github/skills/<skill>/` for every skill currently listed in `.github/.adev-copilot-install.json`, removes `.github/hooks/adev-hooks.json`, removes `.github/.adev-copilot-install.json` itself, and **leaves untouched** `.github/copilot-instructions.md` and `.github/instructions/*.instructions.md` (those are sync-output, not adapter state, and may be revision-controlled separately). The adapter returns `{ removed: true, residual: string[] }` where `residual` lists any path that could not be removed (permission errors, missing files).
5. **When** `CopilotAdapter.status({ projectRoot })` runs, **then** it reads `.github/.adev-copilot-install.json` (if present) and reports `{ installed: bool, version, location, userSeeded, skillCount, hookConfigPresent: bool, syncOutputPresent: { repoInstructions: bool, moduleInstructions: bool }, agentsMd: { exists: bool, autoLoadHint: string } }`. The `agentsMd` field reports the existence of `AGENTS.md` at `projectRoot`; the `autoLoadHint` string names the documented Copilot behavior ("VS Code Copilot and Copilot CLI auto-load AGENTS.md at the repo root").
6. **When** `validateSkillNames()` is called with the list of skill directories under `PLUGIN_ROOT/skills/`, **then** it throws `INVALID_SKILL_NAME: <dirName> (frontmatter: <frontmatterName>; constraint: ^[a-z0-9-]{1,64}$)` on the first violation it finds — covering both the directory name AND the `name:` field inside the directory's `SKILL.md` — and returns the validated list otherwise. The check is pure (no filesystem writes).
7. **When** `adev install --target copilot [--user]` is invoked, **then** the CLI dispatcher routes through `CopilotAdapter.install({ projectRoot: process.cwd(), dryRun, user })` and prints the adapter's return value as a status line, with `--user` toggling the seeding flag. The same dispatch routes `adev uninstall --target copilot` and `adev status --target copilot`.
8. **When** the `cli` charter is read by humans or hygiene tooling after this spec's implementation lands, **then** the `install` verb description lists Claude Code, OpenCode, Codex, Cursor, **and** Copilot — confirming the registry expansion.
9. **When** a smoke-install procedure is followed against a fixture repo (documented as Quality Attribute below), **then** the operator confirms (a) `.github/skills/` is materialized, (b) `.github/hooks/adev-hooks.json` is materialized, (c) launching the `copilot` CLI inside the fixture loads at least one adev skill (visible via `/skills`), and (d) Copilot's auto-discovery picks up `AGENTS.md` and `.github/copilot-instructions.md`.

### Postconditions

- After a successful `install`: `.github/.adev-copilot-install.json` exists with the installed version, `.github/skills/` contains a copy of every validated skill, `.github/hooks/adev-hooks.json` deep-equals `providers/copilot/hooks.json` from `PLUGIN_ROOT`, and (when `user: true`) `~/.copilot/` mirrors the same skills and hook config.
- After a successful `uninstall`: no `.github/.adev-copilot-install.json` exists, every skill the state record listed is removed from `.github/skills/`, `.github/hooks/adev-hooks.json` is removed, and any sync-output files (`.github/copilot-instructions.md`, `.github/instructions/`) are untouched.
- `status` returns the same `{ installed, version, location, ... }` shape regardless of install state; the `installed` boolean discriminates.
- The adapter never writes outside `<projectRoot>/.github/` or `getCopilotHome()` (when `--user`). The output path is resolved with `path.resolve()` and asserted to start with `<projectRoot> + path.sep` (or `getCopilotHome() + path.sep` for user-scope writes) before any write.
- Hook scripts under `PLUGIN_ROOT/hooks/*.sh` are referenced by absolute path in the generated hook config and are NOT copied — the consuming project picks them up via the path in `adev-hooks.json`.

### Error Cases

| Condition | Expected Behavior | Exit Code |
|-----------|-------------------|-----------|
| `projectRoot` is not a git repository (no `.git/` directory) | Write `NOT_A_GIT_REPO: <projectRoot>` to stderr; no install performed | 1 |
| Any skill directory name violates `^[a-z0-9-]{1,64}$` | Throw `INVALID_SKILL_NAME: <dirName> ...`; no install performed | 1 |
| A skill's `SKILL.md` frontmatter `name:` field disagrees with the parent directory name | Throw `SKILL_NAME_MISMATCH: <dirName> vs <frontmatterName>`; no install performed | 1 |
| `providers/copilot/hooks.json` is missing from `PLUGIN_ROOT` | Throw `MISSING_HOOK_CONFIG: <expected-path>`; no install performed | 1 |
| Resolved write path escapes `projectRoot` (or `getCopilotHome()` for `--user`) | Throw `INSTALL_PATH_ESCAPE: <resolved-path>`; no install performed | 1 |
| `.github/.adev-copilot-install.json` is malformed during uninstall | Skip the removal step for unresolvable entries, return them in `residual`, exit with `removed: false` if the state record itself could not be read | 1 |
| `--user` flag set but `$COPILOT_HOME` is set to a path outside `$HOME` | Throw `INVALID_COPILOT_HOME: <path>`; no user-scope writes performed (repo-scope writes are NOT rolled back if they already succeeded) | 1 |
| Adapter state record version mismatch on uninstall (recorded version differs from current plugin version) | Proceed with uninstall but emit a warning to stderr — uninstall is a recovery operation and should not be blocked by version drift | 0 |

Error message convention: all paths in stderr are repo-relative when inside `projectRoot`, user-home-relative (`~/...`) when inside `getCopilotHome()`, and absolute otherwise (matching the precedent set by the hook-generator spec).

### AGENTS.md Compatibility Stance

adev already writes `AGENTS.md` at repo root for cross-tool compatibility (consumed by Claude Code, OpenCode, Codex, Cursor). GitHub Copilot — both VS Code and CLI surfaces — auto-loads `AGENTS.md` at the repo root per documented Copilot behavior. This spec adds **no new write path** for AGENTS.md; the adapter only verifies its presence in `status` and surfaces the documented auto-load hint. If Copilot's auto-load behavior changes, this stance must be revisited via a charter revision.

## System Constitution Reference

- **Principle 1:** "Minimize external dependencies — prefer Node.js built-ins." — Applies because the adapter uses only `node:fs`, `node:path`, `node:url`, and `node:child_process` (for git-detect, mirroring existing peer adapters). No new `package.json` dependencies are added.
- **Principle 3:** "Pure ESM — all `.mjs` files, no CommonJS." — Applies to every new module: `providers/copilot/adapter.mjs`, any helper under `lib/providers/copilot/`, and the validator.
- **Anti-pattern: "No hardcoded paths to `~/.claude/` — use the plugin root resolution from `cli/index.mjs`."** — Applies inversely here: the adapter MUST NOT hardcode `~/.copilot/` either. `getCopilotHome()` resolves `$COPILOT_HOME || join(os.homedir(), '.copilot')`, mirroring `getClaudeHome()` and `getCursorHome()`.
- **Quality Gate:** "`npm test` must pass before any implementation is considered complete." — Applies because new adapter behavior is unit-tested using `tests/helpers.mjs` (`createTempDir`, `cleanupTempDir`, `writeFixture`) — no Copilot runtime needed for the unit-test layer; smoke-install verification is a separate manual quality attribute.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Implement `getCopilotHome()` helper | Pure function returning `$COPILOT_HOME || join(os.homedir(), '.copilot')`. Validates that the resolved path lives under `os.homedir()` when `$COPILOT_HOME` is set (throws `INVALID_COPILOT_HOME` otherwise). | small |
| Implement `validateSkillNames(skillsDir)` | Pure function that scans `skillsDir`, reads each `SKILL.md` frontmatter, asserts the directory name and the `name:` field both match `^[a-z0-9-]{1,64}$` and agree with each other. Throws documented error codes on violations. Returns the validated list. | medium |
| Author `providers/copilot/adapter.mjs` | Implement `install`, `uninstall`, `status` per Behaviors 1–5. Mirror `providers/opencode/adapter.mjs` shape (PLUGIN_ROOT resolution, ensureDir, readJson/writeJson helpers, dry-run support). Use `path.resolve()` + `startsWith` containment checks before any write. Idempotent: `install` over an existing install is a refresh, not an error. | medium |
| Wire `adev install --target copilot` | Update `cli/index.mjs` install dispatch to recognize `copilot` as a target, parse `--user`, and route to `CopilotAdapter.install`. Same for `uninstall` and `status` verbs. | medium |
| CLI charter revision | Update `.context-index/specs/features/cli/charter.md`: bump the `install` command description's provider list to include `Copilot` and bump the charter's `revision:` value. Commit alongside the adapter implementation under the same Spec trailer. | small |
| Author unit tests | `tests/copilot-adapter.test.mjs` covering: install in a fixture repo, install with `--user`, uninstall after install, status before/after install, dry-run install, `INVALID_SKILL_NAME` rejection, `INSTALL_PATH_ESCAPE` rejection, idempotent install. Use `tests/helpers.mjs` `createTempDir` / `writeFixture`. | medium |
| Author smoke-install procedure | Write `docs/smoke-install-copilot.md` (or section in existing docs) describing manual steps: clone a fixture repo, run `adev install --target copilot`, install `@github/copilot` CLI, run `copilot` inside the fixture, type `/skills`, confirm at least one adev skill loads, confirm `AGENTS.md` and `.github/copilot-instructions.md` are auto-discovered. | small |
| AGENTS.md auto-load check in status | Add the `agentsMd: { exists, autoLoadHint }` block to `CopilotAdapter.status()` output. Unit-test that the hint string matches the documented Copilot behavior. | small |

## Acceptance Criteria

- [ ] `providers/copilot/adapter.mjs` exists, exports `CopilotAdapter` with `install`, `uninstall`, `status`, `getCopilotHome`, `validateSkillNames`, is pure ESM, and uses only Node built-ins.
- [ ] `CopilotAdapter.install` writes `.github/skills/`, `.github/hooks/adev-hooks.json`, and `.github/.adev-copilot-install.json` to a fixture `projectRoot` and returns the documented return shape.
- [ ] `CopilotAdapter.install({ user: true })` additionally writes `~/.copilot/skills/`, `~/.copilot/hooks/adev-hooks.json`, and ensures `~/.copilot/instructions/` exists, all under `getCopilotHome()`.
- [ ] `CopilotAdapter.install({ dryRun: true })` writes nothing and returns `{ wouldWrite, skipped, errors }`.
- [ ] `CopilotAdapter.uninstall` removes exactly the files listed in `.github/.adev-copilot-install.json` plus the state record itself, and leaves `.github/copilot-instructions.md` and `.github/instructions/` untouched.
- [ ] `CopilotAdapter.status` returns `{ installed, version, location, userSeeded, skillCount, hookConfigPresent, syncOutputPresent, agentsMd }` and discriminates correctly between installed / uninstalled states.
- [ ] `validateSkillNames` rejects a synthetic skill whose directory name is `Foo_Bar` and a synthetic skill where the frontmatter `name:` field disagrees with the directory name.
- [ ] `getCopilotHome` rejects `$COPILOT_HOME` values that do not live under `$HOME` (`INVALID_COPILOT_HOME`).
- [ ] All resolved write paths are asserted to start with `<projectRoot> + path.sep` or `getCopilotHome() + path.sep` before any write; an `INSTALL_PATH_ESCAPE` synthetic test confirms the assertion fires.
- [ ] `adev install --target copilot` invokes the adapter and prints its return value; `adev install --target copilot --user` toggles the user flag; `adev uninstall --target copilot` and `adev status --target copilot` route correctly.
- [ ] The `cli` charter's `install` verb description includes "Copilot" in its provider list, and the charter's `revision:` is bumped. The `cli/charter.md` commit shares the Spec trailer with the adapter implementation.
- [ ] `docs/smoke-install-copilot.md` (or equivalent in the existing docs structure) exists and documents a reproducible manual install + verification procedure.
- [ ] Idempotent install: running `install` twice in a row against the same `projectRoot` succeeds both times and produces an identical post-state on the second run (no duplicate entries, no errors).
- [ ] No new entries added to `package.json` `dependencies` or `devDependencies`.
- [ ] All quality gates pass (`npm test`).
- [ ] No constitutional violations introduced (no hardcoded `~/.claude/` or `~/.copilot/` paths; pure ESM throughout; no inline-Node patterns in any new SKILL.md).
