# adev — Agentic Development Framework
> Last updated: 2026-06-02

A plugin for [Claude Code](https://docs.anthropic.com/en/docs/claude-code), [Cursor](https://cursor.com), [GitHub Copilot](https://github.com/features/copilot), [OpenCode](https://github.com/opencode-ai/opencode) (alpha), and [OpenAI Codex](https://openai.com/index/codex/) (alpha) that gives your AI coding assistant a structured methodology for building software — from idea to validated implementation.

> **Harness support:** Claude Code is the fully supported harness with complete skill and hook coverage. Cursor ships with a peer plugin manifest plus a generated `hooks.json` translation table. GitHub Copilot syncs skills and hooks into `.github/` via a file-convention adapter (no plugin home — Copilot is file-based). OpenCode and Codex support is in alpha — basic lifecycle skills work via AGENTS.md, but hooks, session capture, and some advanced features are not yet available.

Based on the [Agentic Development Handbook](https://www.agentic-dev.org/en/handbook). Zero dependencies.

## Install

```bash
npx @adev-org/adev-cli install
```

> **Note:** Always use `npx` to run the installer — do not `npm install` this package as a project dependency. The CLI sets up your AI assistant's plugin configuration and is not meant to be imported.

The installer registers the plugin, scaffolds a minimal `.context-index/`, and sets up git hooks. Run `/adev:init` inside your AI assistant to configure constitution, governance, and project context. Use `--provider claude-code|cursor|opencode|codex` to skip the prompt, or `--target copilot [--user] [--dry-run]` for the GitHub Copilot adapter.

To upgrade an existing installation:

```bash
npx @adev-org/adev-cli upgrade
```

## Quick Start

After installing, open your AI assistant in a project directory:

```
/adev:init                  # Interactive setup wizard
/adev:init --brownfield     # Auto-detect an existing codebase
```

This creates a `.context-index/` directory — a structured knowledge base that your AI assistant reads before making decisions. It contains your project's principles, tech stack, specs, and architecture decisions.

Then just tell the assistant what you want to build:

```
/adev:work                  # Routes your request to the right skill
```

Or use skills directly:

```
/adev:brainstorm            # Explore a feature idea
/adev:implement             # Build from a plan with TDD
/adev:debug                 # Fix a bug with full context
```

## Skills

Skills are slash commands that guide your AI assistant through each phase of development. Each skill loads the right project context, enforces quality gates, and produces structured outputs.

### Getting Started

| Skill | What It Does |
|-------|-------------|
| `/adev:work` | Classifies your request and routes to the right skill |
| `/adev:init` | Sets up `.context-index/` for a new or existing project |
| `/adev:sync` | Syncs project principles to CLAUDE.md and other agent files |
| `/adev:using-adev` | Gateway overview of the framework, skills, and context routing (auto-injected at session start) |

### Building Features

The core workflow: brainstorm an idea, write a spec, review it, plan the tasks, implement with TDD, then validate.

| Skill | What It Does |
|-------|-------------|
| `/adev:brainstorm` | Explore an idea interactively, produce a Feature Charter; bootstraps `product.md` on first charter |
| `/adev:specify` | Write a behavioral spec (preconditions, behaviors, error cases); creates a Feature work item bound to the spec |
| `/adev:review-specs` | Three specialist agents review your spec before coding begins |
| `/adev:prototype` | Rapidly sketch UI screens, flows, and API surface from a charter |
| `/adev:plan` | Decompose at any scope: spec→tasks (default), or `--feature`, `--release`, `--milestone`, `--epic` |
| `/adev:route` | Score tasks: which can run autonomously vs. need human review |
| `/adev:build` | Run the full pipeline end-to-end — single spec (`--spec`), all specs in a charter (`--charter`), or a milestone phase (`--phase`) |
| `/adev:implement` | Execute tasks with TDD — each in a fresh subagent |
| `/adev:write-test` | Standalone TDD test authoring with gaming detection |
| `/adev:validate` | 13-check verification against specs, constitution, and ADRs |
| `/adev:deploy` | Run a structured deployment pipeline defined in `deploy.yaml` |

### Fixing and Debugging

| Skill | What It Does |
|-------|-------------|
| `/adev:debug` | Systematic debugging — checks ADRs, specs, and architecture first |
| `/adev:recover` | Diagnose and resume a stuck agent |

### Project Management

| Skill | What It Does |
|-------|-------------|
| `/adev:issues` | Create, update, and close issues and epics |
| `/adev:status` | Dashboard view of project progress |

### Maintenance and Quality

| Skill | What It Does |
|-------|-------------|
| `/adev:hygiene` | Audit for stale specs, code drift, and coverage gaps |
| `/adev:reconcile` | Interactive repair for lifecycle mismatches (stale epics, untraced code, drift) |
| `/adev:codehealth` | Scan for dead exports, orphan files, and unused dependencies |
| `/adev:assess` | Score codebase readiness for agentic development |
| `/adev:repomap` | Generate AST-based symbol index |
| `/adev:document` | Generate architecture docs from repomap |
| `/adev:sample` | Curate golden reference implementations |
| `/adev:eval` | Graduated quality scoring (deterministic to LLM-as-a-Judge) |
| `/adev:retro` | Sprint retrospective with delivery metrics |
| `/adev:research` | Structured research across web, GitHub, and codebase |
| `/adev:learn` | Capture a lesson learned as a persistent heuristic |

For the full skill reference with prerequisites and a lifecycle flowchart, see the [documentation](docs/README.md).

## How It Works

### The .context-index/ Directory

All project context lives in `.context-index/`. Your AI assistant reads this before making decisions — it replaces ad-hoc prompt engineering with structured, version-controlled knowledge.

```
.context-index/
├── constitution.md          # Non-negotiable principles and coding standards
├── manifest.yaml            # Module registry, specialists, and config
├── platform-context.yaml    # Tech stack and deployment targets
├── specs/
│   ├── product.md           # Product Charter
│   └── features/            # Per-feature charters and specs
├── adrs/                    # Architecture Decision Records
├── orientation/             # Codebase architecture guide
├── specialists/             # Domain expert prompts (frontend, security, etc.)
└── governance/              # Quality gates and boundary rules (optional)
```

### Constitution

A short document (~200 lines) containing your project's principles, coding standards, architecture boundaries, and quality gates. Synced to `CLAUDE.md` and other agent files via `/adev:sync`. Every skill checks its work against the constitution.

### Quality Gates

Skills enforce gates automatically:

- **Brainstorm before implement** — no code without a charter or spec
- **Review before plan** — specs must pass architecture review first
- **TDD** — implementation follows RED-GREEN-REFACTOR
- **Constitution compliance** — every phase checks against your principles

### Specialist Routing

Domain experts (frontend, data engineering, security) are declared in `manifest.yaml`. During implementation, tasks are automatically routed to the matching specialist based on file patterns.

### Merge Policy

Controls what happens after implementation passes validation. Options: `pr` (default — always open a PR), `merge` (direct merge to non-protected branches), `ask` (prompt each time). Protected branches always require a PR.

## Hooks

Hooks run automatically to enforce conventions:

| Hook | When | What It Does |
|------|------|-------------|
| `using-adev` | Session start | Injects skill awareness into the conversation |
| `constitution-linter` | Editing constitution | Validates structure and size |
| `sync-trigger` | After constitution edit | Triggers agent file sync |
| `merge-guard` | Git commands | Blocks push/merge to protected branches |
| `context-preflight` | Before source edits | Warns if you haven't read project context first |

## Integrations

- **Session capture:** Built-in session logger driven by Claude Code SessionEnd and PreCompact hooks. Captures land as redacted markdown summaries under `.context-index/sessions/` and feed `/adev:retro`. Configure via `integrations.session_capture.{provider, capture, gitignored}` in `manifest.yaml`, or run `adev init prompt session-capture` for an interactive walkthrough.
- **Blueprints:** adev is a methodology choice in the [claude-blueprints-plugin](https://github.com/agentic-development/claude-blueprints-plugin) scaffold workflow.

## Learn More

- [Documentation](docs/README.md) — concepts, installation, and getting started guides
- [Getting started](docs/getting-started.md) — end-to-end tutorial for your first feature
- [Multi-repo workspaces](docs/workspaces.md) — coordinate specs and planning across repos
- [Troubleshooting & FAQ](docs/troubleshooting.md) — common issues and recovery steps
- [Agentic Development Handbook](https://www.agentic-dev.org/en/handbook) — the methodology behind the framework
- [Design document](https://github.com/agentic-development/agentic-dev-content/blob/main/docs/superpowers/specs/2026-03-19-adev-plugin-design.md) — full technical design

## License

MIT
