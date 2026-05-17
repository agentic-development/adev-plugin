---
topic: "Implementing the adev-plugin (Agentic Development Framework) for Cursor IDE"
date: "2026-05-17"
relates-to: ""
sources:
  - internal
  - web
status: draft
---

## Summary

Cursor 2.5 ships a first-class Plugin system (`.cursor-plugin/plugin.json`) that bundles the same six primitives adev already depends on in Claude Code: skills (SKILL.md), subagents, commands, hooks, MCP servers, and rules. Cursor explicitly reads `.claude/skills/` and `.claude/agents/` for backward compatibility, so most adev skill markdown can ship unchanged; the work to add a Cursor target is concentrated in (a) authoring a `.cursor-plugin/plugin.json` manifest, (b) translating `hooks/hooks.json` (Claude Code's `PreToolUse`/`PostToolUse`/`Stop` matchers) to Cursor's richer event model (`beforeShellExecution`, `afterFileEdit`, `stop`, etc.), and (c) adding a `CursorAdapter` next to the existing `claude-code`/`opencode`/`codex` providers. Cursor's hook stdin/stdout JSON protocol with exit-code semantics (0 allow, 2 deny) maps cleanly onto adev's existing hook contract.

## Findings

### Internal

- **adev-plugin already has a multi-provider architecture.** Three adapters live side-by-side under `providers/` — `claude-code/adapter.mjs:39`, `opencode/adapter.mjs:53`, and `codex/adapter.mjs` — each exporting a `*Adapter` object with install/uninstall/status methods. A Cursor adapter slots in as a fourth peer; no architectural change required.
  - `providers/claude-code/adapter.mjs:39` — exports `ClaudeCodeAdapter`
  - `providers/opencode/adapter.mjs:53` — exports `OpenCodeAdapter` (uses symlink-into-config pattern)
  - `providers/codex/adapter.mjs:1` — third existing adapter

- **Claude Code plugin manifest is minimal.** `.claude-plugin/plugin.json` contains only `name`, `version`, `description`, `author`, `homepage`, `repository`, `license`, `category`, `keywords`. The same fields satisfy Cursor's plugin manifest schema (name + optional everything else); only the filename and parent directory differ (`.cursor-plugin/plugin.json`).
  - `/Users/dpavancini/Development/adev-plugin/.claude-plugin/plugin.json:1-31`

- **Hook config is the largest translation surface.** `hooks/hooks.json` uses Claude Code's matcher-based schema (`SessionStart`, `PreToolUse`/`Edit`, `PreToolUse`/`Bash`, `PostToolUse`/`Read`, `PostToolUse`/`Edit`, `PostToolUse`/`.*`, `Stop`/`.*`) with `bash "${CLAUDE_PLUGIN_ROOT}/hooks/<script>.sh"` commands. Every event needs an explicit mapping to a Cursor event name; matchers map onto Cursor's tool-name `matcher` field.
  - `/Users/dpavancini/Development/adev-plugin/hooks/hooks.json:1-95`

- **Hook scripts are already POSIX shell.** The 17 scripts in `hooks/` are bash with `_parse-stdin.sh` for JSON parsing — Cursor's hook system also feeds JSON via stdin and reads stdout JSON, so the scripts themselves need only environment-variable renames (`CLAUDE_PROJECT_DIR` → `CURSOR_PROJECT_DIR`, though Cursor docs note `CLAUDE_PROJECT_DIR` is preserved as an alias) and matcher-payload key renames where applicable.
  - `/Users/dpavancini/Development/adev-plugin/hooks/` lists `_parse-stdin.sh`, `session-start.sh`, `constitution-linter.sh`, `context-preflight.sh`, `lifecycle-gate-{edit,bash,advisory}.sh`, `merge-guard.sh`, `context-read-tracker.sh`, `sync-trigger.sh`, `session-capture.sh`, `issue-reminder.sh`, `post-validate-extract-heuristics.sh`, and `.mjs` equivalents.

- **SKILL.md frontmatter is already Cursor-compatible.** Existing skills use `name:` (e.g., `adev:research`), `description:`, and an optional `allowed-tools:` list. Cursor requires `name` (lowercase + hyphens, matching folder) and `description`; the `adev:` prefix may need a sanitization step or Cursor may accept colons in display names — worth confirming during prototyping.
  - `/Users/dpavancini/Development/adev-plugin/skills/research/SKILL.md:1-4` shows `name: adev:research`, `description:`, `allowed-tools: [Read, Glob, Grep, Agent, Write]`
  - `/Users/dpavancini/Development/adev-plugin/skills/init/SKILL.md:1-4` shows the same minimal frontmatter

- **CLI install logic centralizes path resolution per provider.** `cli/index.mjs:1` is the single CLI entry; provider adapters compute their own config dir (`getClaudeHome()`, `getOpenCodeConfigDir()`). A `CursorAdapter` would implement `getCursorHome()` returning `~/.cursor/plugins/<name>` for local install or write to `~/.cursor/plugins/local/adev` per Cursor docs.

- **Provenance / commit-trailer governance is provider-agnostic.** The constitution's required trailers (`Author-type`, `Operator`, `Spec`, `Plan-task`) and conventional commit types live in `manifest.yaml:153-179` — no Claude-specific assumptions. Cursor's `afterFileEdit` and `stop` hooks already get used by other plugins (e.g., GitButler) for commit automation, so the trailer-injection model ports directly.

### Web

- **Cursor's Plugin system is the right packaging target.** As of Cursor 2.5 (announced October 2025, expanded through 2026), plugins are first-class and bundle "skills, subagents, MCP servers, hooks, and rules into a single install." Manifest lives at `.cursor-plugin/plugin.json` with required `name` (kebab-case) and optional everything else; component paths can be overridden via top-level `skills`, `agents`, `commands`, `hooks`, `mcpServers`, `rules` fields. ([Plugins | Cursor Docs](https://cursor.com/docs/plugins), [Plugins Reference | Cursor Docs](https://cursor.com/docs/reference/plugins))

- **Skills format is shared with Claude Code, including discovery paths.** Cursor's Agent Skills doc states: "For backward compatibility, Cursor also recognizes `.claude/skills/`, `.codex/skills/`, `~/.claude/skills/`, and `~/.codex/skills/` directories." SKILL.md frontmatter requires `name` (lowercase letters, numbers, hyphens; must match parent folder) and `description`; optional fields are `paths`, `disable-model-invocation`, `metadata`. ([Agent Skills | Cursor Docs](https://cursor.com/docs/context/skills))

- **Subagents have a parallel directory and shared format.** Cursor reads from `.cursor/agents/`, `.claude/agents/`, `.codex/agents/` (and `~/.*` user variants). Conflict precedence: `.cursor/` > `.claude/` > `.codex/`. Frontmatter fields: `name`, `description`, `model` (`inherit` or specific ID), `readonly`, `is_background`. Built-in `Explore`, `Bash`, `Browser` subagents exist by default. ([Subagents | Cursor Docs](https://cursor.com/docs/context/subagents))

- **Cursor hooks cover every adev event type and more.** Categories: Agent (sessionStart/End, preToolUse/postToolUse, subagentStart/Stop, beforeShellExecution, afterShellExecution, beforeMCPExecution, afterMCPExecution, beforeReadFile, afterFileEdit, beforeSubmitPrompt, preCompact, stop, afterAgentResponse, afterAgentThought), Tab (beforeTabFileRead, afterTabFileEdit), and App lifecycle (workspaceOpen). Configuration at `.cursor/hooks.json` (project) or `~/.cursor/hooks.json` (user); priority: Enterprise → Team → Project → User. ([Hooks | Cursor Docs](https://cursor.com/docs/hooks))

- **Hook protocol matches adev's existing contract closely.** Hooks receive JSON on stdin (base fields: `conversation_id`, `generation_id`, `model`, `hook_event_name`, `cursor_version`, `workspace_roots`, `user_email`, `transcript_path`). Exit codes: `0` success → process stdout JSON; `2` block (equivalent to `permission: "deny"`); other codes → fail-open by default, opt into `failClosed: true` per hook. Output JSON typically includes `permission: "allow"|"deny"|"ask"` plus optional `user_message`, `agent_message`. ([Hooks | Cursor Docs](https://cursor.com/docs/hooks))

- **Hook environment variables include a Claude-Code compatibility alias.** Cursor hooks receive `CURSOR_PROJECT_DIR`, `CURSOR_VERSION`, `CURSOR_USER_EMAIL`, `CURSOR_TRANSCRIPT_PATH`, `CURSOR_CODE_REMOTE`, and explicitly `CLAUDE_PROJECT_DIR` as an alias for the project directory. Existing adev hook scripts using `CLAUDE_PROJECT_DIR` will Just Work. ([Hooks | Cursor Docs](https://cursor.com/docs/hooks))

- **MCP configuration is essentially identical.** `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (user), with the same `mcpServers` object shape Claude Code uses: `{ command, args, env }` for stdio, plus SSE and Streamable HTTP transports for remote servers. Supports `${env:NAME}`, `${userHome}`, `${workspaceFolder}` interpolation. ([Model Context Protocol (MCP) | Cursor Docs](https://cursor.com/docs/mcp))

- **Rules use a different format from skills but cover adev's CLAUDE.md / AGENTS.md sync target.** Rules live in `.cursor/rules/*.mdc` with YAML frontmatter (`description`, `globs`, `alwaysApply`) and four modes: always-apply, agent-requested (description only), auto-attach (globs match files in context), and manual (`@rule-name` invocation). Cursor also reads root-level `AGENTS.md` as a simple alternative. Documentation recommends keeping always-apply rules under 200 words, individual files under 500 lines. ([Rules | Cursor Docs](https://cursor.com/docs/context/rules))

- **Custom slash commands are plain Markdown without frontmatter.** `.cursor/commands/<name>.md` (project) or `~/.cursor/commands/<name>.md` (user). Filename becomes the slash command. Unlike Claude Code's slash command merger into skills, Cursor keeps commands separate from skills — commands are reusable prompt templates, skills are agent-discoverable instructions. ([Commands | Cursor Docs](https://cursor.com/docs/context/commands))

- **Plugin component discovery follows convention or manifest override.** Default discovery directories inside a plugin: `rules/` (`.md`/`.mdc`/`.markdown`), `skills/<name>/SKILL.md`, `agents/` (`.md`/`.mdc`/`.markdown`), `commands/` (`.md`/`.mdc`/`.markdown`/`.txt`), `hooks/hooks.json`, `mcp.json`. Manifest can override with explicit `rules`, `skills`, `commands`, `agents`, `hooks`, `mcpServers` field paths. ([Plugins Reference | Cursor Docs](https://cursor.com/docs/reference/plugins))

- **Marketplace publication exists but is opt-in.** Submission at cursor.com/marketplace/publish requires unique kebab-case name, README, logo, no `..` or absolute paths in component references, and local-test verification. Multi-plugin repos use `.cursor-plugin/marketplace.json`. For initial adev-on-Cursor delivery, local install (`~/.cursor/plugins/local/adev`) is sufficient; marketplace is a later step. ([Plugins Reference | Cursor Docs](https://cursor.com/docs/reference/plugins))

## Code Examples

```json
// Example: minimal Cursor plugin manifest at .cursor-plugin/plugin.json
// Source: https://cursor.com/docs/plugins (Cursor Plugins doc)
{
  "name": "adev",
  "version": "0.26.0",
  "description": "Agentic Development Framework",
  "author": { "name": "Agentic Development" },
  "homepage": "https://agentic-dev.org",
  "repository": "https://github.com/agentic-development/adev-plugin",
  "license": "MIT"
}
```

```json
// Example: Cursor hooks.json with multiple lifecycle events and matchers
// Source: https://cursor.com/docs/hooks
{
  "version": 1,
  "hooks": {
    "beforeShellExecution": [
      {
        "command": "./hooks/merge-guard.sh",
        "matcher": "git push|git merge",
        "failClosed": true,
        "timeout": 30
      }
    ],
    "afterFileEdit": [
      { "command": "./hooks/sync-trigger.sh" }
    ],
    "stop": [
      { "command": "./hooks/post-validate-extract-heuristics.sh" }
    ],
    "sessionStart": [
      { "command": "./hooks/session-start.sh" }
    ]
  }
}
```

```yaml
# Example: existing adev SKILL.md (already Cursor-compatible)
# Source: /Users/dpavancini/Development/adev-plugin/skills/init/SKILL.md:1-4
---
name: adev:init
description: "Initialize or diagnose the .context-index/ directory..."
---
```

```javascript
// Example: pattern from providers/opencode/adapter.mjs:31-43 for adapter scaffolding
// Source: /Users/dpavancini/Development/adev-plugin/providers/opencode/adapter.mjs
function getOpenCodeConfigDir() {
  return join(process.env.HOME || process.env.USERPROFILE, ".config", "opencode");
}
// Cursor equivalent: ~/.cursor/plugins/local/adev
function getCursorPluginsDir() {
  return join(process.env.HOME || process.env.USERPROFILE, ".cursor", "plugins", "local");
}
```

## Recommendations

Ranked by relevance and feasibility, with each grounded in the constitution.

1. **Add a fourth provider adapter at `providers/cursor/adapter.mjs`** — mirror `providers/opencode/adapter.mjs`'s shape (install/uninstall/status, symlink-or-copy into provider config dir). This keeps the CLI plumbing unchanged and matches the existing pattern. Aligns with **Principle 2 (Skills are primarily markdown)** — the same `skills/` tree is shared across providers. Aligns with **"No hardcoded paths to `~/.claude/`"** anti-pattern by introducing a `getCursorHome()` helper. ([Cursor Plugins Reference](https://cursor.com/docs/reference/plugins))

2. **Author `.cursor-plugin/plugin.json` mirroring `.claude-plugin/plugin.json`.** Keep them version-locked via the existing `package.json` ↔ `.claude-plugin/plugin.json` parity guard (constitution **Principle 5**). The CLI's sync logic should now bump three files, not two — extend the version-parity check to include `.cursor-plugin/plugin.json`. ([Cursor Plugins | Cursor Docs](https://cursor.com/docs/plugins))

3. **Translate `hooks/hooks.json` into Cursor format with a build step, not a hand-maintained dual file.** Add a `scripts/build-cursor-hooks.mjs` that reads the canonical Claude Code `hooks/hooks.json` and emits a Cursor `hooks.json` (different event names, different matcher semantics). This preserves **Principle 1 (Minimize external dependencies)** — Node built-ins only — and avoids drift between two human-maintained configs. Suggested event mapping:

   | Claude Code event | Cursor event |
   |---|---|
   | `SessionStart` (startup/resume) | `sessionStart` |
   | `PreToolUse` / Edit | `beforeReadFile` + `afterFileEdit` (Cursor splits read vs. write) |
   | `PreToolUse` / Bash | `beforeShellExecution` |
   | `PostToolUse` / Read | `afterFileEdit` (closest) or hook on `postToolUse` with `matcher: "Read"` |
   | `PostToolUse` / Edit | `afterFileEdit` |
   | `PostToolUse` / `.*` | `postToolUse` with no matcher |
   | `Stop` / `.*` | `stop` |

   ([Hooks | Cursor Docs](https://cursor.com/docs/hooks))

4. **Reuse existing hook shell scripts unchanged where possible.** Cursor injects `CLAUDE_PROJECT_DIR` as an alias for `CURSOR_PROJECT_DIR`, so scripts reading that env var keep working. For stdin JSON keys that differ between platforms, gate the differences inside `hooks/_parse-stdin.sh` (single point of platform divergence). Aligns with **Principle 4 (Hook protocol compliance)** — both platforms use the same exit-code semantics (0 allow, 2 block). ([Hooks | Cursor Docs](https://cursor.com/docs/hooks))

5. **Ship skills via the `.claude/skills/` path Cursor reads natively, not via duplicate `.cursor/skills/` copies.** Cursor explicitly recognizes `.claude/skills/` for backward compatibility. The Cursor adapter can therefore install adev's `skills/` tree into `~/.claude/skills/` (already done for the Claude Code provider) and Cursor will pick them up. This avoids a file-tree fork and keeps **Principle 2 (Skills are primarily markdown)** intact. ([Agent Skills | Cursor Docs](https://cursor.com/docs/context/skills))

6. **Validate that Cursor accepts `name: adev:init` (with a colon) or strip the namespace prefix during install.** Cursor's docs say skill `name` must match the folder name and use lowercase + hyphens. The current `adev:<skill>` prefix may need to become `adev-<skill>` for Cursor, with a CLI rename step in the adapter. Worth verifying with a local prototype before committing. ([Agent Skills | Cursor Docs](https://cursor.com/docs/context/skills))

7. **Map adev's CLAUDE.md sync target to a Cursor rules file or AGENTS.md.** Constitution and manifest already define a sync pipeline (`manifest.yaml` `sync.targets`). Add a Cursor sync target: either `AGENTS.md` (simplest, Cursor reads it from project root) or `.cursor/rules/adev.mdc` with `alwaysApply: true` and content trimmed to under 200 words per Cursor's own length guidance. Aligns with **Autonomous: "Updating internal documentation"** in constitution. ([Rules | Cursor Docs](https://cursor.com/docs/context/rules))

8. **MCP integration carries over with zero translation.** Cursor's `.cursor/mcp.json` uses the same `mcpServers` shape Claude Code uses. If adev ever ships MCP servers, the Cursor adapter can install them by writing the same JSON into `.cursor/mcp.json` instead of (or alongside) the Claude Code path. ([MCP | Cursor Docs](https://cursor.com/docs/mcp))

9. **Defer marketplace publishing.** Initial Cursor support should ship as a local plugin (`~/.cursor/plugins/local/adev`) installed by `adev install --target=cursor`. Marketplace submission requires a logo, README polish, no `..` paths in component references, and review — not a v1 requirement.

10. **Adding the Cursor adapter is an Autonomous decision per constitution.** Refactoring within a module's boundaries and adding a new provider adapter that does not change CLI install path *structure* or the hook protocol fits the autonomous list. However, if introducing the adapter requires changing the hook stdin/stdout contract (e.g., to accommodate Cursor's `hook_event_name` field shape), that lands in **"Changing the hook protocol — Requires Human Approval"** and needs an ADR. The build-step approach in recommendation #3 keeps the change autonomous by translating at build time rather than altering the canonical contract.

## References

### Internal Files
- `/Users/dpavancini/Development/adev-plugin/.claude-plugin/plugin.json` — current Claude Code plugin manifest; template for `.cursor-plugin/plugin.json`
- `/Users/dpavancini/Development/adev-plugin/.claude-plugin/marketplace.json` — existing marketplace manifest (Claude Code), reference for any future Cursor marketplace publication
- `/Users/dpavancini/Development/adev-plugin/hooks/hooks.json` — canonical hook config that needs translation
- `/Users/dpavancini/Development/adev-plugin/hooks/_parse-stdin.sh` — single point of platform divergence for hook stdin JSON
- `/Users/dpavancini/Development/adev-plugin/providers/claude-code/adapter.mjs` — adapter pattern reference
- `/Users/dpavancini/Development/adev-plugin/providers/opencode/adapter.mjs` — adapter that already implements symlink-into-config-dir; closest analog for a Cursor adapter
- `/Users/dpavancini/Development/adev-plugin/providers/codex/adapter.mjs` — third existing adapter, additional reference
- `/Users/dpavancini/Development/adev-plugin/cli/index.mjs` — CLI entry; routes to adapters
- `/Users/dpavancini/Development/adev-plugin/package.json` — top-level package; version parity source of truth
- `/Users/dpavancini/Development/adev-plugin/skills/init/SKILL.md` — example SKILL.md frontmatter (already Cursor-compatible)
- `/Users/dpavancini/Development/adev-plugin/skills/research/SKILL.md` — example SKILL.md with `allowed-tools` field
- `/Users/dpavancini/Development/adev-test/.context-index/manifest.yaml` — sync targets, provenance/trailers, gates that the Cursor adapter must also honor
- `/Users/dpavancini/Development/adev-test/.context-index/constitution.md` — five non-negotiable principles that constrain any Cursor adapter design

### Web Sources
- [Plugins | Cursor Docs](https://cursor.com/docs/plugins) — plugin overview, `.cursor-plugin/plugin.json`, component bundling, local install path
- [Plugins Reference | Cursor Docs](https://cursor.com/docs/reference/plugins) — full manifest schema, component discovery defaults, marketplace requirements
- [Hooks | Cursor Docs](https://cursor.com/docs/hooks) — full lifecycle event list, stdin/stdout protocol, exit codes, config paths, environment variables including `CLAUDE_PROJECT_DIR` alias
- [Agent Skills | Cursor Docs](https://cursor.com/docs/context/skills) — SKILL.md format, discovery paths including `.claude/skills/` backward compatibility
- [Subagents | Cursor Docs](https://cursor.com/docs/context/subagents) — `.cursor/agents/` (and `.claude/agents/`) directory layout, frontmatter, invocation
- [Model Context Protocol (MCP) | Cursor Docs](https://cursor.com/docs/mcp) — `.cursor/mcp.json`, transport types, OAuth, scope precedence
- [Rules | Cursor Docs](https://cursor.com/docs/context/rules) — `.cursor/rules/*.mdc`, four rule modes, AGENTS.md alternative, length guidance
- [Commands | Cursor Docs](https://cursor.com/docs/context/commands) — `.cursor/commands/*.md` slash command directory (no frontmatter required)
- [Cursor 1.7 Adds Hooks for Agent Lifecycle Control — InfoQ](https://www.infoq.com/news/2025/10/cursor-hooks/) — context on when hooks shipped (Cursor 1.7, October 2025)
- [Plugins, Sandbox Access Controls, and Async Subagents — Cursor Changelog 2.5](https://cursor.com/changelog/2-5) — context on when plugins shipped
- [Subagents, Skills, and Image Generation — Cursor Changelog 2.4](https://cursor.com/changelog/2-4) — context on when skills and subagents shipped to Cursor
