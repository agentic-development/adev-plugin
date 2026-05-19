---
status: approved
kind: feature
revision: 2
updated: 2026-05-19
---

# Feature Charter: copilot-provider

## Business Intent

adev-plugin currently installs into Claude Code, OpenCode, Codex, and (per the in-flight `cursor-provider` charter) Cursor via peer adapters under `providers/`. GitHub Copilot in 2026 exposes a fully file-convention-based customization surface — `.github/copilot-instructions.md`, `.github/instructions/`, `.github/skills/`, `.github/agents/`, `.github/prompts/`, `.github/hooks/` — that every adev primitive maps directly into. The standalone Copilot CLI (`@github/copilot`, GA Feb 25 2026) reads exactly these paths, as does VS Code Copilot, so a single per-repo install covers both surfaces. This charter adds a fifth provider adapter so Copilot users get the full adev lifecycle, with the same drift-safe, version-locked, hook-protocol-compatible discipline the other adapters enforce. The charter also completes the `copilot` sync-target format in the `setup` charter so `/adev:sync` writes a Copilot-native instructions file alongside `CLAUDE.md` and the Cursor rules file.

## Scope and Boundaries

### In Scope

- `providers/copilot/adapter.mjs` — fifth peer adapter exporting `CopilotAdapter` with `install`, `uninstall`, `status` methods, mirroring the shape of `providers/opencode/adapter.mjs` and the new `providers/cursor/adapter.mjs`. Install materializes adev's skills and hooks into the consuming project's `.github/*` tree; no per-user plugin home exists for Copilot.
- `scripts/build-copilot-hooks.mjs` — Node-built-ins-only build step that reads canonical `hooks/hooks.json` and emits `providers/copilot/hooks.json` using a committed Claude-event → Copilot-event translation table. Uses the **PascalCase stdin shape** (`hook_event_name`, `session_id`, `tool_name`, `tool_input`) that Copilot CLI documents as "VS Code compatible," making the existing `hooks/*.sh` scripts byte-compatible with no payload translation. Generator throws on unknown Claude events.
- `lib/providers/copilot/tool-names.mjs` — pure mapping table for hook matcher regex translation (e.g., `Bash → bash`, `Write|Edit → create|edit`, `Read → view`, `WebFetch → web_fetch`). Required because Copilot's per-event `matcher` operates on Copilot's tool-name vocabulary, not Claude Code's.
- `tests/copilot-hooks-sync.test.mjs` — pattern test that re-runs the generator in-memory and asserts `deepEqual` against the committed `providers/copilot/hooks.json`. Fails CI with a `run npm run build:copilot-hooks` hint on drift.
- Hook script reuse — the existing shell scripts in `hooks/` are consumed unchanged by the Copilot adapter; Copilot CLI honors the same `CLAUDE_PROJECT_DIR` style of env injection.
- Skill name compliance check at install time — Copilot Agent Skills require `name` to match the parent directory name and be lowercase letters/numbers/hyphens, max 64 chars. Adapter validates every adev skill before install and fails with an actionable rename hint.
- `.github/skills/<name>/SKILL.md` materialization — adapter copies adev's `skills/<name>/SKILL.md` tree into the consuming project under `.github/skills/`.
- CLI integration — `adev install` registry gains `copilot` as a target; `cli/index.mjs` install/uninstall/status routes through the new adapter.
- `copilot` sync-target format — `/adev:sync` writes `.github/copilot-instructions.md` (repo-wide, under 4,000 characters so Copilot **code review** loads it in full) and one `.github/instructions/<module>.instructions.md` per registered module (path-scoped via `applyTo`). The repo-wide file is treated as a pointer projection of `.context-index/constitution.md`, not a duplicate.
- `applyTo` correctness — every emitted `.instructions.md` carries an `applyTo` value (using `**` for repo-wide entries) because Copilot only auto-applies path-scoped instructions when `applyTo` is present.
- Optional `--user` flag on `adev install --target copilot` — seeds `~/.copilot/skills/`, `~/.copilot/hooks/`, and `~/.copilot/instructions/` mirrors for users who want personal-scope adev across all repos.
- AGENTS.md confirmation — verify the existing `AGENTS.md` (already written by sync to repo root for other providers) is picked up by Copilot for cross-tool compatibility; no new write path needed.
- Update `cli` charter's `install` command description (current rev → next rev): provider list grows from "Claude Code, OpenCode, Codex, Cursor" to include Copilot.
- Smoke install verification — manual local install into a fixture repo + run `copilot` CLI in the directory + verify instructions/skills/hooks discovery.

### Out of Scope

- **No `.copilot-plugin/plugin.json` and no version-parity expansion.** Copilot has no plugin manifest; the customization surface is purely file-convention-based. The two-way `package.json` ↔ `.claude-plugin/plugin.json` (plus the cursor-provider's planned third) version-parity invariant is **unchanged** by this charter.
- `.github/agents/<name>.agent.md` write path — adev does not yet ship a separate subagents primitive at the repo root; deferred until it does. (Shape is documented in research; will be a future-charter parity item with the rest of the providers.)
- `.github/prompts/<name>.prompt.md` write path — adev does not yet ship user-defined slash commands as a separate primitive; deferred until it does.
- `.vscode/mcp.json` and `~/.copilot/mcp-config.json` write paths — adev does not ship MCP servers today; deferred (parity with the cursor-provider charter's MCP deferral). Will be re-evaluated when adev ships its first MCP server.
- Copilot Extensions (the GitHub Marketplace product) — these are GitHub Apps + webhooks, not per-repo files, and are the wrong surface for adev. **adev will not ship a Copilot Extension.**
- Cloud Agent (PR-opening agent) parity testing — out of scope for v1; the hooks emitted are Cloud-Agent-safe (no `notification`, no `permissionRequest`, no Windows-only `powershell`) but full Cloud Agent verification waits for a follow-up.
- Refactoring `hooks/hooks.json` into a provider-agnostic source-of-truth — would change the canonical hook contract, requires ADR + human approval (already declared out of scope by cursor-provider).
- Touching `providers/{claude-code,opencode,codex,cursor}/adapter.mjs` beyond what is required to keep the install registry and provider-list documentation consistent.
- Inline (ghost-text) completion customization — Copilot does not read instructions for inline completions; out of scope by design.

### Dependencies

| Dependency | Type | Description |
|-----------|------|-------------|
| CLI charter | internal charter | Install/uninstall/status verb dispatch; `cli/index.mjs` provider routing. Requires a revision update (Copilot added to provider list, follows the cursor-provider revision). |
| Setup charter | internal charter | `copilot` sync-target format completion belongs to setup's `/adev:sync` capability; this charter adds the new format slot. |
| Cursor Provider charter | sibling charter | Establishes the pattern (`build-<provider>-hooks.mjs` + drift test + sync-target format) this charter replicates. No revision needed; precedent only. |
| Extensions charter | internal charter | Already names "Provider Adapters" as a consumed dependency. No revision needed; this charter adds a fifth adapter behind that contract. |
| Hooks charter / module | internal | Canonical `hooks/hooks.json` is the single source of truth feeding the build-step generator. |
| GitHub Copilot CLI 0.1+ (`@github/copilot`) | external runtime | Primary install surface. Reads `.github/*` and `~/.copilot/*`. GA Feb 25 2026. |
| VS Code Copilot extension | external runtime | Secondary install surface; reads the same `.github/*` files for free. |
| Research artifact `.context-index/research/github-copilot-extensibility-2026-05-19.md` | internal research | Source of truth for the surface map, frontmatter schemas, hook event list, and gotchas this charter relies on. |

## Domain Model

### Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| CopilotAdapter | The provider adapter object exported from `providers/copilot/adapter.mjs` | `install(opts)`, `uninstall(opts)`, `status(opts)`, `getCopilotHome()`, `validateSkillNames(skills)` |
| CopilotHookConfig | Generated `providers/copilot/hooks.json` derived from `hooks/hooks.json` | `version: 1`, `hooks: { preToolUse \| postToolUse \| sessionStart \| agentStop \| subagentStart \| subagentStop \| ... : [...] }`, per-event `matcher` regex |
| HookEventTranslation | Single entry in the Claude→Copilot event translation table inside `build-copilot-hooks.mjs` | `claudeEvent`, `claudeMatcher`, `copilotEvent`, `copilotMatcher`, `cloudAgentSafe`, `timeoutSec?` |
| ToolNameMapping | Single entry in `lib/providers/copilot/tool-names.mjs` mapping Claude tool names to Copilot tool names for matcher rewrites | `claudeToolName`, `copilotToolName` |
| CopilotRepoInstructions | The `.github/copilot-instructions.md` file written by `/adev:sync` when `copilot` is a sync target | plain markdown body under 4,000 characters (code-review compatibility ceiling) |
| CopilotModuleInstruction | Per-module `.github/instructions/<module>.instructions.md` files written by `/adev:sync` | YAML frontmatter (`applyTo` required, optional `excludeAgent`, `description`), body scoped to the module |
| CopilotSkillTree | The materialized `.github/skills/<name>/SKILL.md` tree the adapter copies from adev's canonical `skills/` directory | every emitted skill carries lowercase-kebab `name` ≤ 64 chars matching its parent directory |

### Relationships

- A `CopilotAdapter.install()` writes zero `.copilot-plugin/plugin.json` (no manifest exists) and at least one `CopilotSkillTree`, one `CopilotHookConfig` (copied from the committed `providers/copilot/hooks.json`), one `CopilotRepoInstructions`, and zero-or-more `CopilotModuleInstruction` files per registered module.
- A `CopilotHookConfig` is produced by exactly one run of `build-copilot-hooks.mjs` over the canonical `hooks/hooks.json`.
- Every hook entry in `hooks/hooks.json` maps to zero-or-more `CopilotHookConfig` entries via the translation table; one Claude event may fan out to multiple Copilot events.
- `ToolNameMapping` is consumed exclusively by `build-copilot-hooks.mjs` when rewriting `matcher` regexes; no runtime code branches on tool names.
- `/adev:sync` writes exactly one `CopilotRepoInstructions` and one `CopilotModuleInstruction` per registered module when `copilot` appears in `manifest.yaml:sync.targets`.

### Invariants

- The committed `providers/copilot/hooks.json` MUST deep-equal the output of `build-copilot-hooks.mjs` run against the current `hooks/hooks.json`. Drift fails `npm test`.
- The Claude→Copilot event translation table MUST cover every event present in `hooks/hooks.json`. The generator throws on unknown events.
- Every entry in `lib/providers/copilot/tool-names.mjs` MUST round-trip — every Claude tool name referenced by a matcher in `hooks/hooks.json` MUST have a mapping. Generator throws on unmapped tool names.
- Hook scripts in `hooks/*.sh` MUST NOT branch on provider — `CLAUDE_PROJECT_DIR` and the PascalCase stdin shape absorb the difference; any genuine divergence is isolated to `hooks/_parse-stdin.sh`.
- `CopilotRepoInstructions` MUST be ≤ 4,000 characters so Copilot code review consumes it in full. Per-module overflow content moves into `CopilotModuleInstruction` files.
- Every `CopilotModuleInstruction` MUST carry a non-empty `applyTo` frontmatter field — without it, Copilot does not auto-apply the file.
- Every emitted `CopilotSkillTree` directory name MUST match `^[a-z0-9-]{1,64}$` and equal the `name:` frontmatter inside its `SKILL.md`. Adapter rejects installs with non-conforming names rather than silently renaming.
- adev MUST NOT write a `.copilot-plugin/plugin.json` — no such manifest exists in Copilot's surface, and inventing one would create a stale artifact.

## Capability Map

| Capability | Description | Priority | Milestone | Status |
|-----------|-------------|----------|-----------|--------|
| CopilotAdapter install/uninstall/status | Fifth peer adapter mirroring `providers/opencode/adapter.mjs` and the new cursor adapter; install materializes adev's skills + hooks into the consuming project's `.github/` tree | must-have | v1 | — |
| Hook config generator | `scripts/build-copilot-hooks.mjs` + Claude→Copilot event translation table; emits `providers/copilot/hooks.json` in PascalCase stdin shape | must-have | v1 | specified |
| Hook drift test | `tests/copilot-hooks-sync.test.mjs` fails CI on out-of-sync committed `hooks.json` | must-have | v1 | specified |
| Tool-name mapping table | `lib/providers/copilot/tool-names.mjs` maps Claude tool names (`Bash`, `Write`, `Edit`, `Read`, `WebFetch`, …) to Copilot tool names (`bash`, `create`, `edit`, `view`, `web_fetch`, …) for matcher regex translation | must-have | v1 | specified |
| Translation-table coverage assertion | Generator throws on Claude events or tool names with no Copilot mapping | must-have | v1 | specified |
| `.github/copilot-instructions.md` sync output | `/adev:sync` writes the repo-wide instructions file under 4,000 characters when `copilot` is a sync target | must-have | v1 | — |
| `.github/instructions/<module>.instructions.md` sync output | `/adev:sync` writes one per-module instructions file with `applyTo` glob per registered module | must-have | v1 | — |
| Skill name compliance check | Install-time validation that every adev skill matches `^[a-z0-9-]{1,64}$` and the `name:` frontmatter equals its parent directory | must-have | v1 | — |
| CLI install integration | `adev install` accepts `copilot` as a target; routes through CopilotAdapter | must-have | v1 | — |
| CLI charter revision | Update `cli` charter install verb description to include Copilot in the provider list | must-have | v1 | — |
| `--user` flag for personal-scope seeding | Optional install flag that mirrors `.github/{skills,hooks,instructions}/` into `~/.copilot/{skills,hooks,instructions}/` | should-have | v1 | — |
| AGENTS.md compat confirmation | Verify the existing AGENTS.md root file is auto-loaded by Copilot CLI and VS Code Copilot; no new write path required | should-have | v1 | — |
| Smoke install verification | Manual install into a fixture repo + run `copilot` CLI + verify instructions, skills, and hooks discovery | should-have | v1 | — |

## Deferred Capabilities

| Capability | Reason | Target Milestone | Depends On |
|-----------|--------|------------------|------------|
| `.github/agents/<name>.agent.md` write path | adev does not yet ship a separate subagents primitive at the repo root; zero-translation deferred until it does | v2 | adev shipping a first-class `agents/` primitive |
| `.github/prompts/<name>.prompt.md` write path | adev does not yet ship user-defined slash commands as a separate primitive | v2 | adev shipping a first-class `commands/` primitive |
| `.vscode/mcp.json` + `~/.copilot/mcp-config.json` write paths | adev does not yet ship MCP servers; deferred in parity with the cursor-provider charter | v2 | adev shipping an MCP server |
| Cloud Agent compatibility test suite | Verifies emitted hooks behave correctly in the PR-opening Cloud Agent runtime | v2 | Test fixtures + access to a Cloud Agent runner |
| Copilot Extensions (Marketplace GitHub App) | Wrong surface — adev is a per-repo customization tool, not a hosted SaaS | never | — |
| Provider-agnostic hook source-of-truth refactor | Better with 4+ providers; changes hook protocol contract; requires ADR + human approval | v2 | ADR + human approval per constitution |

## Interface Contracts

### Exposed APIs

| Interface | Type | Description |
|-----------|------|-------------|
| `CopilotAdapter.install({ projectRoot, dryRun, user })` | function | Materialize adev's skills + hooks + instructions into the project's `.github/` tree; optionally seed `~/.copilot/*` when `user: true` |
| `CopilotAdapter.uninstall({ projectRoot })` | function | Remove `.github/skills/`, `.github/hooks/`, and `.github/instructions/` entries adev wrote; leave `.github/copilot-instructions.md` untouched (sync-output is project state, not plugin state) |
| `CopilotAdapter.status({ projectRoot })` | function | Return `{ installed, version, location, userSeeded }` for diagnostics |
| `CopilotAdapter.validateSkillNames(skills)` | function | Throw if any skill directory or `name:` frontmatter violates Copilot's `^[a-z0-9-]{1,64}$` constraint; return list of valid skills otherwise |
| `getCopilotHome()` | function | Resolve `~/.copilot` (honoring `$COPILOT_HOME`); no hardcoded paths to `~/.claude/` per constitution anti-pattern |
| `build-copilot-hooks.mjs` (CLI) | script | `npm run build:copilot-hooks` — regenerate `providers/copilot/hooks.json` from canonical `hooks/hooks.json` |
| `adev install --target copilot [--user]` | CLI verb | Surfaces `CopilotAdapter` through the existing install dispatcher; `--user` enables personal-scope seeding |

### Consumed APIs

| Interface | Source Module | Description |
|-----------|---------------|-------------|
| Canonical `hooks/hooks.json` | Hooks module | Input to the build-step generator; single source of truth for hook events |
| `getClaudeHome()` / `getOpenCodeConfigDir()` / `getCursorHome()` patterns | Existing provider adapters | Reference shape for `getCopilotHome()` |
| `resolveStorageRoot()` from `lib/issues/resolve-root.mjs` | Issues module | Used by `CopilotAdapter` for git-worktree-aware path resolution, same as other adapters |
| `/adev:sync` sync-target dispatch | Setup module | New `copilot` format slot in the sync-target switch |
| `.context-index/constitution.md` | Constitution | Source content the `/adev:sync` projection compresses into `.github/copilot-instructions.md` |
| `manifest.yaml:modules[]` | Manifest | Source of per-module identity, paths, and scope for `.github/instructions/<module>.instructions.md` generation |

## Quality Attributes

| Attribute | Requirement |
|-----------|-------------|
| Drift safety | Committed `providers/copilot/hooks.json` MUST equal generator output; enforced by `tests/copilot-hooks-sync.test.mjs` running under `npm test` (constitution Quality Gate) |
| Translation completeness | Every Claude event in `hooks/hooks.json` resolves to a Copilot event via the translation table; every Claude tool name in a matcher resolves to a Copilot tool name; generator throws on unknown events or unmapped tool names; the throw surfaces in CI through the sync test |
| Manifest-free discipline | adev MUST NOT write a `.copilot-plugin/plugin.json` (no such manifest exists in Copilot's surface). The two-way version-parity invariant from the constitution is unchanged by this charter. |
| Constitutional compliance | Pure ESM, Node built-ins only (no new dependencies). Hook protocol unchanged — PascalCase stdin shape, `0` allow / `2` deny exit codes, identical to Claude Code's contract. Skills remain markdown-only. Sits in the Autonomous lane per constitution because no hook protocol change is required. |
| Hook script portability | Existing `hooks/*.sh` consumed by the Copilot adapter without modification; PascalCase stdin compatibility is free per Copilot CLI docs |
| Sync-output discipline | `.github/copilot-instructions.md` ≤ 4,000 characters (code-review ceiling); per-module overflow lives in `.github/instructions/<module>.instructions.md` files with mandatory `applyTo` |
| Code-review compatibility | Repo-wide instructions file fits under the 4,000-character code-review cap so Copilot's PR review reads the full constitution projection, not a truncated prefix |
| Auto-apply correctness | Every emitted `.instructions.md` carries a non-empty `applyTo` so Copilot loads it automatically; charter-stage gotcha eliminated |
| Skill-name compliance | Adapter validates every skill's `name` against Copilot's `^[a-z0-9-]{1,64}$` constraint at install time, refusing installs with violating names rather than silently renaming |
| Testability | Generator, adapter, and tool-name mapping are pure functions over file paths; testable with `tests/helpers.mjs` (`createTempDir`, `writeFixture`) without standing up Copilot CLI itself |
| Offline install | Local install requires no network; mirrors existing provider adapters |
| Cross-surface coverage | One per-repo install covers both VS Code Copilot and Copilot CLI (both read `.github/*`); optional `--user` flag adds personal-scope coverage via `~/.copilot/*` |
