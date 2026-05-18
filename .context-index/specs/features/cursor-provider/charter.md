---
status: approved
kind: feature
revision: 2
updated: 2026-05-17
---

# Feature Charter: cursor-provider

## Business Intent

adev-plugin currently installs into Claude Code, OpenCode, and Codex via three peer adapters under `providers/`. Cursor 2.5 shipped a first-class Plugin system that exposes the same six primitives adev depends on (skills, subagents, commands, hooks, MCP, rules). This charter adds a fourth provider adapter so Cursor users get the full adev lifecycle — skills, hooks, sync — without duplicating the source tree or branching the hook protocol. The charter also completes the half-modeled `cursor` sync-target format in the `setup` charter so `/adev:sync` writes a Cursor-native rules file alongside `CLAUDE.md`.

## Scope and Boundaries

### In Scope

- `providers/cursor/adapter.mjs` — fourth peer adapter exporting `CursorAdapter` with `install`, `uninstall`, `status` methods, mirroring the shape of `providers/opencode/adapter.mjs`.
- `.cursor-plugin/plugin.json` — Cursor plugin manifest, kept version-locked with `package.json` and `.claude-plugin/plugin.json` (extends the constitution's version-parity guard from two manifests to three).
- `release-please-config.json` update — add `.cursor-plugin/plugin.json` to the `extra-files` array per ADR-0008 so the automated Release PR bumps all three manifests in lockstep. Without this, the three-way parity invariant breaks at the first release after implementation.
- `scripts/build-cursor-hooks.mjs` — Node-built-ins-only build step that reads canonical `hooks/hooks.json` and emits `providers/cursor/hooks.json` using a committed Claude-event → Cursor-event translation table. Generator throws on unknown Claude events.
- `tests/cursor-hooks-sync.test.mjs` — pattern test that re-runs the generator in-memory and asserts deepEqual against the committed `providers/cursor/hooks.json`. Fails CI with a "run `npm run build:cursor-hooks`" hint when drift is detected.
- Hook script reuse — the existing shell scripts in `hooks/` are consumed unchanged by both providers; Cursor injects `CLAUDE_PROJECT_DIR` as an alias per Cursor docs.
- Skill name sanitization at install time — `adev:init` → `adev-init` if Cursor rejects colons in skill names; verified by a smoke install during charter follow-up.
- CLI integration — `adev install` registry gains `cursor` as a target; `cli/index.mjs` install/uninstall/status routes through the new adapter.
- `cursor` sync-target format — `/adev:sync` writes `.cursor/rules/adev.mdc` with `alwaysApply: true`, under Cursor's 200-word recommendation, treated as a pointer projection of `.context-index/constitution.md`. Completes the stub on `cli/index.mjs:465-467` and finishes the half-modeled format in the `setup` charter.
- Update `cli` charter's `install` command description (rev 3 → rev 4): provider list grows from "Claude Code, OpenCode, Codex" to include Cursor.

### Out of Scope

- `.cursor/mcp.json` write path — adev does not ship MCP servers today; defer until it does. (Shape is identical to Claude Code's, zero-translation when needed.)
- Marketplace publication (`cursor.com/marketplace/publish`) — requires logo, README polish, no `..` paths in component references. Initial release ships as `~/.cursor/plugins/local/adev` only.
- Refactoring `hooks/hooks.json` into a provider-agnostic source-of-truth — would change the canonical hook contract, requires ADR + human approval.
- Migrating existing `.cursorrules` references in `providers/{opencode,codex}/skills/sync/SKILL.md` — those describe the Cursor sync-target story for other providers' install scripts and are owned by the `setup` charter.
- Touching `providers/{claude-code,opencode,codex}/adapter.mjs` beyond what's required to keep the version-parity check green.

### Dependencies

| Dependency | Type | Description |
|-----------|------|-------------|
| CLI charter | internal charter | Install/uninstall/status verb dispatch; `cli/index.mjs` provider routing. Requires rev 4 update (Cursor added to provider list). |
| Setup charter | internal charter | `cursor` sync-target format completion belongs to setup's `/adev:sync` capability; this charter finishes the half-modeled entry. |
| Extensions charter | internal charter | Already names "Provider Adapters" as a consumed dependency for skill/hook registration. No revision needed; this charter adds a fourth adapter behind that contract. |
| ADR-0008 (release-please automation) | internal ADR | The `extra-files` array in `release-please-config.json` must include `.cursor-plugin/plugin.json` for the three-way version-parity invariant to hold at release time. |
| Cursor 2.5+ | external runtime | Plugin system requires Cursor 2.5 (Plugins shipped) or 2.4 (Skills/Subagents); hooks require Cursor 1.7+. |

## Domain Model

### Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| CursorAdapter | The provider adapter object exported from `providers/cursor/adapter.mjs` | `install(opts)`, `uninstall(opts)`, `status(opts)`, `getCursorHome()` |
| CursorPluginManifest | `.cursor-plugin/plugin.json` written into the provider config dir | `name`, `version`, `description`, `author`, `homepage`, `repository`, `license` (mirrors `.claude-plugin/plugin.json`) |
| CursorHookConfig | Generated `providers/cursor/hooks.json` derived from `hooks/hooks.json` | `version: 1`, `hooks: { sessionStart \| beforeShellExecution \| afterFileEdit \| stop \| ... : [...] }` |
| HookEventTranslation | Single entry in the Claude→Cursor event translation table inside `build-cursor-hooks.mjs` | `claudeEvent`, `claudeMatcher`, `cursorEvent`, `cursorMatcher`, `failClosed?`, `timeout?` |
| CursorSyncOutput | The `.cursor/rules/adev.mdc` file written by `/adev:sync` when `cursor` is a sync target | YAML frontmatter (`description`, `alwaysApply: true`), body under 200 words, points to `.context-index/constitution.md` |

### Relationships

- A `CursorAdapter` writes exactly one `CursorPluginManifest` per install.
- A `CursorPluginManifest`'s `version` field equals `package.json:version` AND `.claude-plugin/plugin.json:version` at all times (three-way parity).
- A `CursorHookConfig` is produced by exactly one run of `build-cursor-hooks.mjs` over the canonical `hooks/hooks.json`.
- Every hook entry in `hooks/hooks.json` maps to zero-or-more `CursorHookConfig` entries via the translation table; one Claude event may fan out to multiple Cursor events (e.g., `PreToolUse`/`Edit` → `beforeReadFile` + `afterFileEdit`).
- `/adev:sync` writes exactly one `CursorSyncOutput` per project when `cursor` appears in `manifest.yaml:sync.targets`.

### Invariants

- `.cursor-plugin/plugin.json:version`, `.claude-plugin/plugin.json:version`, and `package.json:version` MUST be equal. CI fails on mismatch.
- The committed `providers/cursor/hooks.json` MUST deep-equal the output of `build-cursor-hooks.mjs` run against the current `hooks/hooks.json`. Drift fails `npm test`.
- The Claude→Cursor translation table MUST cover every event present in `hooks/hooks.json`. The generator throws on unknown events.
- Hook scripts in `hooks/*.sh` MUST NOT branch on provider — environment-variable aliases (`CLAUDE_PROJECT_DIR`) absorb the difference; any genuine divergence is isolated to `hooks/_parse-stdin.sh`.
- `CursorSyncOutput` MUST fit under 200 words per Cursor's always-apply rule guidance.

## Capability Map

| Capability | Description | Priority | Milestone | Status |
|-----------|-------------|----------|-----------|--------|
| Cursor plugin manifest | Write `.cursor-plugin/plugin.json` with version locked to package.json + claude-plugin | must-have | v1 | validated |
| Three-way version parity | Extend existing parity check to include `.cursor-plugin/plugin.json` | must-have | v1 | validated |
| Release-please extra-files update | Add `.cursor-plugin/plugin.json` to `release-please-config.json:extra-files` per ADR-0008 so automated Release PRs bump all three manifests in lockstep | must-have | v1 | validated |
| CursorAdapter install/uninstall/status | Fourth peer adapter mirroring `providers/opencode/adapter.mjs` shape | must-have | v1 | implemented |
| Hook config generator | `scripts/build-cursor-hooks.mjs` + translation table; emits `providers/cursor/hooks.json` | must-have | v1 | implemented |
| Hook drift test | `tests/cursor-hooks-sync.test.mjs` fails CI on out-of-sync committed hooks.json | must-have | v1 | implemented |
| Translation-table coverage assertion | Generator throws on Claude events with no Cursor mapping | must-have | v1 | implemented |
| CLI install integration | `adev install` accepts `cursor` as a target; routes through CursorAdapter | must-have | v1 | — |
| `.cursor/rules/adev.mdc` sync output | `/adev:sync` writes alwaysApply rule when `cursor` is a sync target | must-have | v1 | — |
| Skill name sanitization | Install-time rename of `adev:<x>` skills to `adev-<x>` — Cursor docs require lowercase + hyphens matching the folder name, so colons are invalid | must-have | v1 | implemented |
| CLI charter revision | Update `cli` charter install verb description (rev 3 → rev 4) | must-have | v1 | — |
| Smoke install verification | Manual local install into `~/.cursor/plugins/local/adev` + open Cursor + verify skill discovery | should-have | v1 | — |

## Deferred Capabilities

| Capability | Reason | Target Milestone | Depends On |
|-----------|--------|------------------|------------|
| `.cursor/mcp.json` write path | adev does not yet ship MCP servers; zero-translation deferred to when it does | v2 | adev shipping an MCP server |
| Marketplace publication | Requires logo, README polish, path-reference audit; v1 ships local-only | v2 | Marketplace-grade README + logo |
| Provider-agnostic hook source-of-truth | Better with 3+ providers; changes hook protocol contract | v2 | ADR + human approval per constitution |

## Interface Contracts

### Exposed APIs

| Interface | Type | Description |
|-----------|------|-------------|
| `CursorAdapter.install({ projectRoot, dryRun })` | function | Symlink-or-copy the plugin into `~/.cursor/plugins/local/adev`; write `.cursor-plugin/plugin.json`; ensure `providers/cursor/hooks.json` is current |
| `CursorAdapter.uninstall({ projectRoot })` | function | Remove the local plugin entry; leave `.cursor/rules/` untouched (sync-output is project state, not plugin state) |
| `CursorAdapter.status({ projectRoot })` | function | Return `{ installed, version, location }` for diagnostics |
| `getCursorHome()` | function | Resolve `~/.cursor/plugins/local/<name>`; no hardcoded paths to `~/.claude/` per constitution anti-pattern |
| `build-cursor-hooks.mjs` (CLI) | script | `npm run build:cursor-hooks` — regenerate `providers/cursor/hooks.json` from canonical `hooks/hooks.json` |
| `adev install --target cursor` | CLI verb | Surfaces CursorAdapter through the existing install dispatcher |

### Consumed APIs

| Interface | Source Module | Description |
|-----------|---------------|-------------|
| Canonical `hooks/hooks.json` | Hooks module | Input to the build-step generator; single source of truth for hook events |
| `getClaudeHome()`/`getOpenCodeConfigDir()` patterns | Existing provider adapters | Reference shape for `getCursorHome()` |
| `resolveStorageRoot()` from `lib/issues/resolve-root.mjs` | Issues module | Used by CursorAdapter for git-worktree-aware path resolution, same as other adapters |
| `/adev:sync` sync-target dispatch | Setup module | New `cursor` format slot in the sync target switch |
| Version-parity guard | CLI install path | Extended from two manifests to three |

## Quality Attributes

| Attribute | Requirement |
|-----------|-------------|
| Drift safety | Committed `providers/cursor/hooks.json` MUST equal generator output; enforced by `tests/cursor-hooks-sync.test.mjs` running under `npm test` (constitution Quality Gate) |
| Translation completeness | Every Claude event in `hooks/hooks.json` resolves to a Cursor event via the translation table; generator throws on unknown events; the throw surfaces in CI through the sync test |
| Version parity | Three-way lock: `package.json:version` = `.claude-plugin/plugin.json:version` = `.cursor-plugin/plugin.json:version`; existing parity-check extended to include the third file |
| Constitutional compliance | Pure ESM, Node built-ins only (no new dependencies). Hook protocol unchanged — `0 allow / 2 deny`, JSON stdin/stdout. Skills remain markdown-only. Sits in the Autonomous lane per constitution because no hook protocol or install path-structure change is required. |
| Hook script portability | Existing `hooks/*.sh` consumed by both providers without modification; `CLAUDE_PROJECT_DIR` alias makes this free per Cursor docs |
| Sync output discipline | `.cursor/rules/adev.mdc` under 200 words; functions as a pointer to `.context-index/constitution.md`, not a duplicate of it |
| Testability | Generator and adapter are pure functions over file paths; testable with `tests/helpers.mjs` (`createTempDir`, `writeFixture`) without standing up Cursor itself |
| Offline install | Local plugin install requires no network; mirrors existing provider adapters |
