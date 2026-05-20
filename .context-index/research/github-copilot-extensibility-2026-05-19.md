---
type: research
created: 2026-05-19
topic: github-copilot-extensibility
relates-to: "adev-plugin Copilot provider adapter (fourth target after Claude Code, Cursor, OpenCode, Codex)"
sources:
  - web
status: draft
---

## Summary

GitHub Copilot in 2026 exposes a rich, file-convention-based customization surface that — surprisingly — covers **every one of adev's six primitives** with a first-class equivalent. Five of the six map cleanly to per-repo `.github/` paths (`copilot-instructions.md`, `instructions/*.instructions.md`, `agents/*.agent.md`, `prompts/*.prompt.md`, `skills/<name>/SKILL.md`, `hooks/*.json`, `mcp.json` via `.vscode/`). The sixth (MCP) is split between VS Code (`.vscode/mcp.json`) and the new standalone Copilot CLI (`~/.copilot/mcp-config.json`). There is **no plugin manifest** — Copilot is purely file-convention-based; you do not register a "Copilot plugin." Two surface-area distinctions matter:

1. **The new standalone Copilot CLI** (`@github/copilot`, GA February 2026) is the primary delivery vehicle. It honors `.github/copilot-instructions.md`, `AGENTS.md`, `.github/agents/`, `.github/skills/`, `.github/hooks/`, and `.github/prompts/` — the same paths VS Code Copilot reads. Configuration lives under `~/.copilot/` (overridable with `$COPILOT_HOME`).
2. **Copilot Extensions** (the GitHub Marketplace product, GitHub-App-backed) are an **orthogonal**, server-side integration model — not the right surface for adev. We want repo-level file conventions, not a hosted GitHub App.

Vocabulary change to internalize: "custom chat modes" were **renamed to "custom agents"** sometime in early 2026; `.chatmode.md` files are legacy and must be migrated to `.agent.md`. Agent Skills (with `SKILL.md` frontmatter `name` + `description`) were introduced December 2025 and use the same `name`/`description` keys adev already ships, so adev's existing `SKILL.md` files are nearly drop-in compatible.

## Question 1: Custom Instructions / Rules

**Summary.** Copilot has three layered instruction surfaces: (a) one always-on repository file `.github/copilot-instructions.md`, (b) zero-or-many path-scoped `*.instructions.md` files in `.github/instructions/` with frontmatter `applyTo` glob, and (c) cross-tool AGENTS.md / CLAUDE.md auto-discovered at the repo root (and, experimentally, in subfolders). Multiple matching files are **combined**, not overridden — priority (Personal > Repository > Organization) only governs conflict resolution; every layer lands in the model's context window.

**Concrete paths and formats.**

| Path | Frontmatter | Scope | When applied |
|---|---|---|---|
| `.github/copilot-instructions.md` | None (plain markdown) | Repo-wide | Every chat request in the repo |
| `.github/instructions/<name>.instructions.md` | `applyTo: "**/*.ts,**/*.tsx"`, optional `excludeAgent: code-review\|cloud-agent` | Path-scoped via glob | When any file matching `applyTo` is in context |
| `AGENTS.md` (root or, experimentally, subfolders) | None | Nearest-wins for nested; root file is always-on | Always (if `chat.useAgentsMdFile` enabled) |
| `CLAUDE.md` (root, `.claude/`, `~/.claude/`) | None | Cross-tool compatibility shim | Always (if `chat.useClaudeMdFile` enabled) |
| User-level: `~/.copilot/instructions/*.instructions.md` or `~/.claude/rules/*.md` | `applyTo` (or `.claude/rules` uses `paths` array) | Personal, all repos | Always (highest priority) |
| VS Code settings (legacy / still active for specific surfaces) | `github.copilot.chat.reviewSelection.instructions`, `commitMessageGeneration.instructions`, `pullRequestDescriptionGeneration.instructions` | Targeted features only | Code review, commit msgs, PR descriptions |

**Frontmatter schema for `.instructions.md`:**
```yaml
---
applyTo: '**/*.py,src/**/*.py'   # comma-separated globs; required for auto-apply
excludeAgent: 'code-review'      # optional; values: code-review | cloud-agent
name: 'Display Name'             # optional
description: 'Short description' # optional
---
```

**Limits and combination rules:**
- Repo-wide instructions: "no longer than 2 pages" (informal limit).
- **Code review specifically reads only the first 4,000 characters** of any instruction file — chat and the cloud agent do not enforce this cap.
- No aggregate size limit documented across combined files; everything that matches is concatenated.
- Without `applyTo`, an `.instructions.md` file is **not auto-applied** — it must be manually attached.
- Inline as-you-type completions do **not** use custom instructions; only Chat / Agent surfaces do.

**Citation:** https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions ; https://code.visualstudio.com/docs/copilot/customization/custom-instructions

**Viability for adev "rules" primitive:** **Excellent.** Direct 1:1 mapping. adev can emit its constitution / charter rules to `.github/copilot-instructions.md` (repo-wide) and emit per-module rules to `.github/instructions/<module>.instructions.md` with `applyTo: 'src/<module>/**/*'`.

## Question 2: Custom Chat Modes / Agents

**Summary.** "Custom chat modes" were renamed to **"custom agents"** in early 2026. Files now use the `.agent.md` extension and the `.github/agents/` (workspace) or `~/.copilot/agents/` (user) directories. They support an allowlist tool model, model preferences, agent-to-agent handoffs, and a `user-invocable` flag that controls dropdown visibility. Legacy `.chatmode.md` files in `.github/chatmodes/` must be renamed to `.agent.md`.

**Concrete paths and formats.**

| Location | Scope |
|---|---|
| `.github/agents/<name>.agent.md` | Workspace, committed |
| `.claude/agents/<name>.agent.md` | Workspace (cross-tool compat) |
| `~/.copilot/agents/<name>.agent.md` | User profile |
| `.github/chatmodes/<name>.chatmode.md` | **Legacy** — must be renamed |
| `~/.copilot/chatmodes/<name>.chatmode.md` | **Legacy** |

**Frontmatter schema (YAML):**
```yaml
---
description: 'Generate implementation plans'           # placeholder text in chat input
name: 'Planner'                                        # display name in dropdown
tools: ['web/fetch', 'search/codebase', 'github/*']    # allowlist; supports <mcp-server>/* glob
model: ['Claude Opus 4.5', 'GPT-5.2']                  # prioritized list
handoffs: ['Implementer', 'Reviewer']                  # transition workflows
user-invocable: true                                   # dropdown visibility
---
```

**Tool access model:** allowlist-only — unavailable tools are silently ignored. The docs recommend creating agents with **read-only tools** to prevent unintended modification. MCP server tools are referenced as `<server-name>/<tool>` or `<server-name>/*`.

**Citation:** https://code.visualstudio.com/docs/copilot/customization/custom-chat-modes (redirects to the renamed "custom agents" page)

**Viability for adev "subagents" primitive:** **Excellent.** adev's `agents/<name>/*.md` subagents map directly to `.github/agents/<name>.agent.md`. Tool restrictions, model selection, and handoffs all have first-class support.

## Question 3: Slash Commands / Prompts

**Summary.** Copilot supports user-defined slash commands via **prompt files**. Files use the `.prompt.md` extension, live in `.github/prompts/` (workspace) or in the VS Code user profile data dir, and are invoked by typing `/<filename>` in chat. They support a richer parameter model than Claude Code commands (`${input:varName:placeholder}`, `${selection}`, tool refs via `#tool:<name>`), and an `agent` frontmatter field that lets a prompt target a specific custom agent.

**Concrete paths and formats.**

| Path | Scope |
|---|---|
| `.github/prompts/<name>.prompt.md` | Workspace, committed |
| VS Code user data dir (configurable via `chat.promptFilesLocations`) | User profile |

**Frontmatter schema (all optional):**
```yaml
---
description: 'Create a React component with tests'
name: 'create-react-form'        # defaults to filename
argument-hint: 'formName=...'    # guidance in chat input
agent: 'agent'                   # or 'ask' | 'plan' | <custom-agent-name>
model: 'Claude Opus 4.7'
tools: ['github/*', 'web/fetch']
---
```

**Invocation methods:**
- Type `/<prompt-name>` in chat (e.g. `/create-react-form formName=Login`).
- Run **Chat: Run Prompt** from Command Palette.
- Click the play button in the prompt-file editor.

**Variables:** `${selection}`, `${input:variableName}`, `${input:variableName:placeholder}`, `#tool:<tool-name>`, plus an interactive `vscode/askQuestion` tool.

**Citation:** https://code.visualstudio.com/docs/copilot/customization/prompt-files

**Viability for adev "commands" primitive:** **Excellent.** adev's `commands/<name>.md` slash commands map directly to `.github/prompts/<name>.prompt.md`. The `agent` frontmatter field is a nice bonus — adev can route specific commands to specific custom agents.

## Question 4: MCP Server Support

**Summary.** Copilot has first-class MCP support in **both** VS Code (workspace `.vscode/mcp.json` + VS Code user `settings.json`) **and** the standalone Copilot CLI (`~/.copilot/mcp-config.json`, modifiable via `/mcp add`). The schema mirrors Claude Desktop closely (`servers` map of name → command/args/env or HTTP/SSE URL). Workspace vs user split applies; docs explicitly warn against configuring the same server in both locations. An org-level **"MCP servers in Copilot" policy** can disable MCP for Copilot Business/Enterprise users (does not affect Free/Pro/Pro+).

**Concrete paths and formats.**

| Path | Scope | Tool |
|---|---|---|
| `.vscode/mcp.json` | Workspace, committed | VS Code |
| VS Code `settings.json` | User profile | VS Code |
| `~/.copilot/mcp-config.json` | User profile | Copilot CLI |
| Cloud agent: configured via repo settings, no separate file | Repo | Cloud agent |

**Schema (workspace `.vscode/mcp.json`):**
```json
{
  "inputs": [{ "type": "promptString", "id": "github-token", "description": "GitHub PAT" }],
  "servers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "${input:github-token}" }
    },
    "remote-server": {
      "url": "https://mcp.example.com/sse",
      "type": "http"
    }
  }
}
```

**Restrictions:**
- Remote servers with OAuth require explicit per-server user approval.
- Org policy disables MCP entirely for Business/Enterprise tenants when configured (defaults to disabled at org level — must be explicitly enabled).
- Free / Pro / Pro+ are unaffected by org policy.
- `chat.mcp.discovery.enabled: true` auto-imports Claude Desktop MCP config (cross-tool compat).

**Citation:** https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp/extend-copilot-chat-with-mcp ; https://docs.github.com/en/copilot/customizing-copilot/extending-copilot-chat-with-mcp

**Viability for adev "MCP" primitive:** **Excellent**, but with a fork: adev should emit **both** `.vscode/mcp.json` for VS Code Copilot **and** instruct users to add servers to `~/.copilot/mcp-config.json` (or copy at install time) for CLI Copilot. There is no single config that covers both.

## Question 5: Hooks / Lifecycle Events

**Summary.** This is the surprise win. GitHub Copilot CLI (and Cloud Agent) ships a **full hook system** that closely mirrors Claude Code's: JSON config files at `.github/hooks/*.json` (repo) and `~/.copilot/hooks/*.json` (user), with 13 lifecycle events including `sessionStart`, `userPromptSubmitted`, `preToolUse` (can deny/modify), `postToolUse`, `agentStop` (can block), `subagentStart/Stop`, `errorOccurred`, `notification`, and `permissionRequest`. The stdin/stdout JSON protocol is documented in two flavors — camelCase (native) **and** PascalCase (explicitly "VS Code compatible," meaning the same shape Claude Code hooks use). Exit code 0 = success/allow, exit code 2 = warn/deny (same as Claude Code's contract). Hooks support `command`, `http`, and `prompt` types. **adev's existing hooks need almost no protocol change.**

**Concrete paths and JSON schema.**

| Path | Scope | Surface |
|---|---|---|
| `.github/hooks/*.json` | Repo, committed | CLI + Cloud Agent + (in VS Code, via plugins) |
| `~/.copilot/hooks/*.json` (or `$COPILOT_HOME/hooks/`) | User profile | CLI only |
| `.github/copilot/settings.json` and `.local.json` | Repo | CLI |
| `~/.copilot/settings.json` | User | CLI |

**Top-level schema:**
```json
{
  "version": 1,
  "disableAllHooks": false,
  "hooks": {
    "preToolUse": [
      {
        "type": "command",
        "bash": "./scripts/policy-check.sh",
        "powershell": "./scripts/policy-check.ps1",
        "cwd": ".",
        "env": { "LOG_LEVEL": "INFO" },
        "timeoutSec": 30,
        "matcher": "^bash$"
      }
    ],
    "sessionStart": [ ... ],
    "userPromptSubmitted": [ ... ],
    "postToolUse": [ ... ],
    "postToolUseFailure": [ ... ],
    "preCompact": [ ... ],
    "agentStop": [ ... ],
    "subagentStart": [ ... ],
    "subagentStop": [ ... ],
    "errorOccurred": [ ... ],
    "notification": [ ... ],
    "permissionRequest": [ ... ],
    "sessionEnd": [ ... ]
  }
}
```

**All 13 events and blocking behavior:**

| Event | Can block? | Cloud Agent supports? |
|---|---|---|
| `sessionStart` | Optional | Yes |
| `sessionEnd` | No | Yes |
| `userPromptSubmitted` | No | Yes (once) |
| `preToolUse` | **Yes** (deny/modify args) | Yes |
| `postToolUse` | No | Yes |
| `postToolUseFailure` | Optional (inject recovery context) | Yes |
| `preCompact` | No | Yes (auto only) |
| `agentStop` | **Yes** (continue turn) | Yes |
| `subagentStart` | Optional | Yes |
| `subagentStop` | **Yes** | Yes |
| `errorOccurred` | No | Yes |
| `notification` | Fire-and-forget | **No** |
| `permissionRequest` | **Yes** | **No** |

**Hook types:**
- `command`: `bash` / `powershell` / `command` (cross-platform fallback), with `cwd`, `env`, `timeoutSec`.
- `http`: POST JSON to `url`, with `headers`, `allowedEnvVars`, `timeoutSec`. HTTPS required for permission-granting events.
- `prompt`: auto-submit text or `/slash-command` on session start (CLI only, new interactive sessions only).

**stdin protocol (two equivalent shapes):**

camelCase (native Copilot):
```json
{ "sessionId": "...", "timestamp": 1234567890123, "cwd": "...", "toolName": "bash", "toolArgs": { ... } }
```

PascalCase (VS Code / Claude Code compatible — same as adev's existing hooks):
```json
{ "hook_event_name": "PreToolUse", "session_id": "...", "timestamp": "2026-05-19T...", "cwd": "...", "tool_name": "bash", "tool_input": { ... } }
```

**stdout protocol (key examples):**
- `preToolUse`: `{ "permissionDecision": "allow|deny|ask", "permissionDecisionReason": "...", "modifiedArgs": {...} }`
- `agentStop`/`subagentStop`: `{ "decision": "block|allow", "reason": "..." }`
- `permissionRequest`: `{ "behavior": "allow|deny", "message": "...", "interrupt": true }`
- `postToolUseFailure`: `{ "additionalContext": "..." }`
- `notification`: `{ "additionalContext": "..." }`

**Exit codes:** `0` = success (stdout parsed); `2` = warning (stderr surfaced; for `permissionRequest` treated as deny; for `postToolUseFailure` appended as context); any other non-zero = logged but **fail-open** (execution continues).

**Matcher filtering:** regex (anchored as `^(?:pattern)$`) on `toolName` for `preToolUse`/`permissionRequest`, on `agentName` for `subagentStart`, on `notification_type` for `notification`, on `trigger` (manual|auto) for `preCompact`. Tool names available for matching: `ask_user`, `bash`, `create`, `edit`, `glob`, `grep`, `powershell`, `task`, `view`, `web_fetch`.

**Citation:** https://docs.github.com/en/copilot/reference/hooks-configuration ; https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/use-hooks ; https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-hooks

**Viability for adev "hooks" primitive:** **Excellent — better than expected.** Copilot's PascalCase stdin shape is explicitly "VS Code compatible" — i.e. identical to Claude Code's hook protocol — so adev's existing hook scripts (`hooks/*.sh`) work unmodified. The adapter only needs to translate adev's `hooks/hooks.json` matchers to Copilot's per-event regex `matcher` field. Tool-name vocabulary differs from Claude Code (`bash` not `Bash`, `create`/`edit` not `Write`/`Edit`) and needs a mapping table.

## Question 6: GitHub Copilot CLI

**Summary.** The new standalone **GitHub Copilot CLI** went GA on **February 25, 2026** (`@github/copilot` on npm). It replaces the retired `gh copilot` extension. Install via `npm install -g @github/copilot`, `brew install copilot-cli`, `winget install GitHub.Copilot`, or `curl -fsSL https://gh.io/copilot-install | bash`. It is **the primary adev integration target** because it is fully agentic (default model: Claude Sonnet 4.5; switchable via `/model`) and reads exactly the file conventions documented above — `.github/copilot-instructions.md`, `.github/instructions/`, `AGENTS.md`, `.github/agents/`, `.github/skills/`, `.github/hooks/`, `.github/prompts/`, plus user-level mirrors under `~/.copilot/`.

**Installation:**
```bash
npm install -g @github/copilot          # all platforms (npm)
brew install copilot-cli                 # macOS / Linux (Homebrew)
winget install GitHub.Copilot            # Windows
curl -fsSL https://gh.io/copilot-install | bash   # install script
```

**Config layout (`~/.copilot/`, overridable via `$COPILOT_HOME`):**

| File | Purpose |
|---|---|
| `~/.copilot/settings.json` | Global settings |
| `~/.copilot/mcp-config.json` | MCP servers (also editable via `/mcp add`) |
| `~/.copilot/agents/<name>.agent.md` | Personal custom agents |
| `~/.copilot/skills/<name>/SKILL.md` | Personal agent skills |
| `~/.copilot/hooks/*.json` | Personal hooks |
| `~/.copilot/instructions/*.instructions.md` | Personal instructions |
| `~/.copilot/chatmodes/` | **Legacy** — migrate to `agents/` |

**Key slash commands:** `/login`, `/cwd`, `/cd`, `/add-dir`, `/resume`, `/agent`, `/mcp add`, `/usage`, `/context`, `/compact`, `/model`, `/feedback`, `/skills`, `?`.

**Trust / approval model:** trusted-directories prompt on first launch; tool approval is per-command / session-wide / pre-configured via `--allow-all-tools`, `--allow-tool`, `--deny-tool`.

**Custom model providers:** OpenAI-compatible, Azure OpenAI, Anthropic — configurable via environment variables.

**Customization surface separate from VS Code:** mostly **no** — the CLI deliberately reads the same `.github/*` paths VS Code Copilot reads, plus user-level `~/.copilot/*` mirrors. The only divergence is **MCP config location** (`~/.copilot/mcp-config.json` for CLI vs `.vscode/mcp.json` for VS Code).

**Citation:** https://docs.github.com/en/copilot/how-tos/use-copilot-agents/use-copilot-cli ; https://docs.github.com/en/copilot/concepts/agents/about-copilot-cli ; https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli ; https://github.blog/changelog/2026-02-25-github-copilot-cli-is-now-generally-available/

**Viability for adev installation target:** **This is the primary install surface.** A single `adev install --target copilot` pass should write the `.github/*` tree (which covers repo-level for both CLI and IDE) and optionally seed `~/.copilot/` (user-level CLI). VS Code Copilot picks up the same `.github/*` files for free.

## Question 7: Copilot Extensions (Marketplace product)

**Summary.** Copilot Extensions are a **completely separate concept** from per-repo customization. They are **GitHub Apps** that integrate with Copilot Chat through a webhook-based API, listed on the GitHub Marketplace, and installed at the user/org level. Two flavors: **Skillset extensions** (lightweight; GitHub handles routing, prompt-crafting, function-eval, response-gen — you just declare functions and endpoints) and **Agent extensions** (full control over conversation; integrate custom LLMs, manage context yourself). These are appropriate for SaaS products integrating with Copilot — **not** for per-project rules/skills/hooks.

**How they differ from per-repo customization:**
- **Hosting:** Extension = your own server (a GitHub App with a webhook). Per-repo customization = static files in `.github/`.
- **Distribution:** Extension = GitHub Marketplace. Per-repo customization = git clone.
- **Auth:** Extension = GitHub App permissions. Per-repo customization = none.
- **Use case:** Extension = "Sentry helps debug your error in chat." Per-repo customization = "this repo uses TypeScript strict mode and prefers Bun."

**Citation:** https://docs.github.com/en/copilot/building-copilot-extensions/setting-up-copilot-extensions ; https://github.com/copilot-extensions ; https://docs.github.com/en/copilot/concepts/build-copilot-extensions/about-building-copilot-extensions

**Viability for adev:** **No — wrong surface.** adev is a developer-tool-installation framework, not a hosted SaaS. The right adev integration target is per-repo `.github/*` files plus optional user-level `~/.copilot/*` seeding. We should explicitly **not** ship a Copilot Extension.

## Question 8: Install Surface

**Summary.** Two locations. Per-repo lives entirely under `.github/` (and `.vscode/mcp.json` for VS Code MCP). User-level lives under `~/.copilot/` (CLI) and VS Code's user data directory (for VS Code-specific overrides). There is **no `~/.github/`** equivalent for personal instructions; personal config goes under `~/.copilot/` instead.

**Full install map:**

| Adev primitive | Repo path | User path |
|---|---|---|
| Repo-wide rules | `.github/copilot-instructions.md` | (n/a — see personal instructions) |
| Path-scoped rules | `.github/instructions/<name>.instructions.md` | `~/.copilot/instructions/<name>.instructions.md` |
| Agents (subagents) | `.github/agents/<name>.agent.md` | `~/.copilot/agents/<name>.agent.md` |
| Skills | `.github/skills/<name>/SKILL.md` | `~/.copilot/skills/<name>/SKILL.md` |
| Prompts (commands) | `.github/prompts/<name>.prompt.md` | (VS Code user data dir) |
| Hooks | `.github/hooks/<name>.json` | `~/.copilot/hooks/<name>.json` |
| MCP (VS Code) | `.vscode/mcp.json` | VS Code `settings.json` |
| MCP (CLI) | (n/a — there is no repo-level MCP file for CLI) | `~/.copilot/mcp-config.json` |
| Cross-tool fallback | `AGENTS.md`, `CLAUDE.md` (root) | `~/.claude/`, `~/.agents/` |

**Citation:** https://code.visualstudio.com/docs/copilot/customization/custom-instructions ; https://docs.github.com/en/copilot/how-tos/use-copilot-agents/use-copilot-cli

**Viability:** **Excellent.** The install surface is uniform and file-based; an `adev install --target copilot` adapter writes ~7 directories under `.github/` and optionally seeds `~/.copilot/`.

## Question 9: Version Pinning / Manifest

**Summary.** **No manifest.** Unlike Cursor 2.5 (`.cursor-plugin/plugin.json`) and Claude Code plugins (`.claude-plugin/plugin.json`), GitHub Copilot has **no plugin manifest**. The customization surface is purely file-convention-based — Copilot scans `.github/` and `~/.copilot/` for known directory/filename patterns. Versioning of "what adev installed" must be tracked by adev itself (e.g. a `.context-index/installed.json` or similar), not by Copilot. The closest thing to a manifest is `package.json`'s `contributes.chatSkills[]` array — but that's only for **VS Code extensions** that bundle agent skills, not for repo-level installs.

**Concrete:**
- No `copilot-plugin.json`, no `.github/copilot/plugin.json`.
- `.github/copilot/settings.json` and `.github/copilot/settings.local.json` exist for CLI **settings** (e.g. `disableAllHooks`), but they are not plugin manifests.
- A VS Code extension can declare skills via `package.json` → `contributes.chatSkills: [{ path: './skills/foo/SKILL.md' }]`, but this is the extension-developer path, not a repo-customization path.

**Citation:** https://code.visualstudio.com/docs/copilot/customization/agent-skills ; https://docs.github.com/en/copilot/reference/hooks-configuration

**Viability:** **N/A** — there is nothing to register. adev's responsibility is to write the files and to track its own installed state internally.

## Question 10: Limits and Gotchas

**Concrete limits and pitfalls discovered:**

1. **4,000-character cap on code review.** Copilot **code review** only reads the first 4,000 chars of any instruction file. Chat and cloud agent do not enforce this. Implication: emit a tight `.github/copilot-instructions.md` (< 4k chars) for code review, and put longer content in `.github/instructions/*.instructions.md` files that code review can still consume (4k each).

2. **No combined-context size limit documented.** All matching instruction layers are concatenated; nothing limits the aggregate. Practical limit is the model's context window.

3. **No guaranteed ordering when multiple `.instructions.md` files match.** VS Code combines them in **no specified order**. Priority (Personal > Repo > Org) governs **conflict resolution wording**, not concatenation order. Implication: don't write rules that depend on file ordering — make each file self-contained.

4. **`applyTo` is required for auto-apply.** An `.instructions.md` file without `applyTo` won't be loaded automatically — it must be manually attached. adev should always emit `applyTo` (use `**` for repo-wide).

5. **`.chatmode.md` is legacy.** Files in `.github/chatmodes/` must be renamed to `.agent.md` and moved to `.github/agents/`. Do not emit `.chatmode.md`.

6. **Inline completions ignore custom instructions.** Only Chat / Agent / Code-review / Commit / PR surfaces consume them. Ghost-text completions do not.

7. **`AGENTS.md` nested subfolder discovery is experimental.** Don't rely on it; emit the root file.

8. **Tool name vocabulary differs from Claude Code.** Hook matchers use `bash`, `create`, `edit`, `glob`, `grep`, `view`, `web_fetch`, `task`, `ask_user`, `powershell` — not `Bash`, `Write`, `Edit`, etc. Mapping table required in the adapter.

9. **Cloud Agent constraints on hooks.** Cloud Agent ignores `powershell` (Linux only), does not support `notification` or `permissionRequest`, treats `preToolUse` `"ask"` as `"deny"` (non-interactive), and the filesystem is ephemeral (use HTTP hooks for retained output).

10. **Hooks fail open on unexpected exit codes.** Only exit `0` and exit `2` have documented meanings; any other non-zero code is **logged and ignored** (execution continues). Hooks must explicitly return `2` to deny.

11. **MCP in both VS Code and CLI requires two configs.** Single source of truth not available — `.vscode/mcp.json` for VS Code, `~/.copilot/mcp-config.json` for CLI. Org policy can disable MCP for Business/Enterprise tenants.

12. **Agent Skills `name` must match parent directory name** and be lowercase letters/numbers/hyphens only, max 64 chars. `description` is max 1024 chars. (adev's `SKILL.md` files already follow this — check existing skill names for compliance.)

13. **Skill discovery is two-phase.** Frontmatter `name` + `description` are scanned first for relevance; the body is only loaded if Copilot decides the skill is relevant. Implication: keep `description` rich (capabilities + use cases) — that's the only field that gets the skill auto-invoked.

14. **`disable-model-invocation: true`** lets a skill be manual-only (`/skill-name` slash); `user-invocable: false` lets it auto-load but not show in `/` menu. Combine for fine-grained control.

15. **Copilot Extensions vs customization is a sharp fork.** No middle ground — if adev wanted both per-repo files and a hosted GitHub App, that's two completely separate deliverables.

## Recommended adev Mapping

| adev primitive | Copilot surface | Path (repo) | Path (user) | Notes |
|---|---|---|---|---|
| **skills** (`skills/<name>/SKILL.md`) | Agent Skills | `.github/skills/<name>/SKILL.md` | `~/.copilot/skills/<name>/SKILL.md` | Direct 1:1. `name` + `description` frontmatter already matches adev's format. Rename directory to lowercase-kebab if any adev skill names violate `[a-z0-9-]{1,64}`. Use `disable-model-invocation` for manual-only skills, `user-invocable: false` for auto-load-only. |
| **subagents** (`agents/<name>.md`) | Custom Agents (formerly chat modes) | `.github/agents/<name>.agent.md` | `~/.copilot/agents/<name>.agent.md` | Direct 1:1. Translate adev tool allowlists into `tools: [...]`. Use `<mcp-server>/*` glob for full MCP servers. Map model preferences. Do **not** emit `.chatmode.md` (legacy). |
| **commands** (`commands/<name>.md`) | Prompt Files | `.github/prompts/<name>.prompt.md` | (VS Code user data dir; no `~/.copilot/prompts/`) | Direct 1:1. adev's slash commands become `/<name>`. Use `agent:` frontmatter to bind a command to a specific custom agent (e.g. `/adev:plan` → `agent: planner`). Supports rich variable substitution (`${input:...}`). |
| **hooks** (`hooks/*.sh` + `hooks/hooks.json`) | Copilot CLI Hooks | `.github/hooks/<name>.json` | `~/.copilot/hooks/<name>.json` | **Best-in-class match.** Use PascalCase stdin shape (`hook_event_name`, `session_id`, `tool_name`, `tool_input`) — explicitly "VS Code compatible," same as Claude Code. Exit code 0/2 semantics identical. Translate adev matchers to Copilot's per-event `matcher` regex. Map tool-name vocabulary (`Bash`→`bash`, `Write`/`Edit`→`create`/`edit`). Skip `notification` and `permissionRequest` events if also targeting Cloud Agent. |
| **MCP** (`.mcp.json` / `claude_desktop_config.json`) | Copilot MCP (split) | `.vscode/mcp.json` (workspace, for VS Code) | `~/.copilot/mcp-config.json` (CLI) | **Two writes required** — no single config covers both. Schema is Claude-Desktop-compatible (`servers` map, `command`/`args`/`env` or `url`). Org admins can disable MCP entirely for Business/Enterprise — document this caveat in adev install output. |
| **rules / constitution** (`constitution.md`, `manifest.yaml`) | Custom Instructions | `.github/copilot-instructions.md` (always-on; keep < 4k chars for code-review compatibility) + `.github/instructions/<module>.instructions.md` (path-scoped with `applyTo`) | `~/.copilot/instructions/<name>.instructions.md` | Direct 1:1. Always emit `applyTo` (use `**` for repo-wide path-scoped files to ensure auto-apply). Also emit `AGENTS.md` at repo root as cross-tool compat (already in adev's manifest provenance for `claude-code`/`opencode`/`codex`). Do not exceed 2 pages in `copilot-instructions.md`. |

### What's missing / things to NOT include in the Copilot charter

- **No plugin manifest** — there is no `copilot-plugin.json`. adev tracks installed state internally.
- **No Copilot Extension** — adev should not ship a GitHub App. That is a different product.
- **No `~/.github/copilot/` user-level convention** — user instructions live under `~/.copilot/` instead.
- **No inline-completion customization** — ghost-text completions do not read instructions. Out of scope.
- **No `.chatmode.md`** — legacy format; always emit `.agent.md`.

### Adapter implementation notes

1. **Single install pass writes both surfaces.** Because VS Code Copilot and Copilot CLI read the same `.github/*` paths, one repo-level install covers both. Optional `--user` flag adds `~/.copilot/*` mirrors.
2. **Hook protocol reuse.** adev's existing `hooks/*.sh` scripts work unmodified if they read the PascalCase stdin shape (which Claude Code already uses). The only adapter work is `hooks/hooks.json` → `.github/hooks/<name>.json` translation.
3. **Tool-name mapping table.** Build `lib/providers/copilot/tool-names.mjs` mapping Claude Code tool names to Copilot tool names for hook matchers.
4. **MCP fork warning.** When `adev install --target copilot` is run, emit a one-line note that MCP config is split between `.vscode/mcp.json` and `~/.copilot/mcp-config.json`, and that org policy may disable MCP entirely for Copilot Business/Enterprise users.
5. **Cloud Agent caveats.** If the user wants Cloud Agent (PR-opening agent) compatibility, omit `notification`/`permissionRequest` hooks and avoid Windows-only `powershell` keys.

## Sources

- [Adding repository custom instructions for GitHub Copilot](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions)
- [Use custom instructions in VS Code](https://code.visualstudio.com/docs/copilot/customization/custom-instructions)
- [Customize Copilot in VS Code](https://code.visualstudio.com/docs/copilot/copilot-customization)
- [Custom chat modes (renamed to custom agents) in VS Code](https://code.visualstudio.com/docs/copilot/customization/custom-chat-modes)
- [Prompt files in VS Code Copilot](https://code.visualstudio.com/docs/copilot/customization/prompt-files)
- [Agent skills in VS Code Copilot](https://code.visualstudio.com/docs/copilot/customization/agent-skills)
- [Extending Copilot Chat with MCP](https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp/extend-copilot-chat-with-mcp)
- [GitHub Copilot hooks configuration reference](https://docs.github.com/en/copilot/reference/hooks-configuration)
- [Using hooks with GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/use-hooks)
- [About hooks for the Copilot cloud agent](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-hooks)
- [Using the GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/use-copilot-cli)
- [About GitHub Copilot CLI](https://docs.github.com/en/copilot/concepts/agents/about-copilot-cli)
- [Installing GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli)
- [GitHub Copilot CLI is now generally available (Feb 25, 2026)](https://github.blog/changelog/2026-02-25-github-copilot-cli-is-now-generally-available/)
- [Setting up Copilot Extensions](https://docs.github.com/en/copilot/building-copilot-extensions/setting-up-copilot-extensions)
- [Copilot Extensions organization on GitHub](https://github.com/copilot-extensions)
