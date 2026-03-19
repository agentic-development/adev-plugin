# adev — Agentic Development Framework

A Claude Code plugin that implements a full-lifecycle methodology for AI-assisted software delivery. Covers context engineering, charter-native specifications, constitution gating, architecture review, specialist routing, and automated context maintenance.

Grounded in the [Agentic Development Handbook](https://www.agentic-dev.org/en/handbook) and its four pillars: Context-First Architecture, Ephemeral Infrastructure, Gate-Based Governance, and Hybrid Engineering.

## Install

```bash
npx adev-cli init
```

This installs the plugin into Claude Code, detects conflicting plugins (Superpowers), scaffolds `.context-index/`, and configures your settings. Zero dependencies.

Alternatively, for development or testing:

```bash
claude --plugin-dir /path/to/adev-plugin
```

## Quick Start

```bash
# After install, start Claude Code and run the interactive wizard
/adev-init

# Or onboard an existing codebase
/adev-init --brownfield

# Preview what would be created without writing files
/adev-init --dry-run
```

This scaffolds a `.context-index/` directory with your project's constitution, platform context, and orientation. The constitution is synced to `CLAUDE.md` (and other agent files) automatically.

## The .context-index/ Directory

```
.context-index/
├── constitution.md              # Project principles (source of truth)
├── manifest.yaml                # Context types, sync targets, specialist registry
├── platform-context.yaml        # Tech stack and deployment targets
├── specs/
│   ├── product.md               # Product Charter
│   ├── cross-cutting/           # Specs spanning features
│   └── features/                # Per-module charters and live specs
│       └── <module>/
│           ├── charter.md       # Feature Charter
│           └── <task>.md        # Live Spec
├── adrs/                        # Architecture Decision Records
├── samples/                     # Golden samples (reference implementations)
├── orientation/                 # Human-authored codebase guide
│   └── architecture.md
├── specialists/                 # Domain expert subagent prompts
└── hygiene/                     # Generated reports (gitignored)
```

## Lifecycle

| Phase | Skill | What Happens |
|-------|-------|-------------|
| Context Setup | `/adev-init` | Scaffold `.context-index/`, generate constitution, sync agent files |
| Brainstorming | `/adev-brainstorm` | Explore idea, produce a Feature Charter |
| Specification | `/adev-specify` | Write Live Specs within charter scope |
| Architecture Review | `/adev-review-specs` | Parallel specialist agents review specs (Opus) |
| Planning | `/adev-plan` | Constitution-gated task decomposition |
| Implementation | `/adev-implement` | TDD, specialist routing, subagent execution |
| Validation | `/adev-validate` | Multi-check against specs, constitution, ADRs |
| Debugging | `/adev-debug` | Context-aware systematic debugging |
| Maintenance | `/adev-hygiene` | Audit staleness, drift, coverage gaps |

## Key Concepts

### Constitution

A tool-agnostic document (`.context-index/constitution.md`) containing your project's non-negotiable principles, coding standards, architecture boundaries, context routing rules, and quality gates. Kept under 200 lines. Synced to CLAUDE.md, AGENTS.md, .cursorrules, and copilot-instructions.md via `/adev-sync`.

### Context Routing

The constitution tells agents *when* and *where* to look for deeper context. Agents use standard agentic search (Glob/Grep/Read) to fetch what they need. No pre-computed indexes required.

### Architecture Review

Before any code is written, `/adev-review-specs` dispatches parallel specialist subagents (structural architect, security reviewer, consistency analyzer) to review specs. Returns PASS / PASS_WITH_NOTES / BLOCK. Planning is gated on passing review.

### Specialist Routing

Domain experts (frontend design, data engineering, security) are declared in `manifest.yaml`. During implementation, tasks are automatically routed to the matching specialist based on file patterns and keywords.

### Brownfield Support

For existing codebases: `/adev-init --brownfield` reverse-engineers charters from code structure, generates retrospective ADRs from git history, and produces a coverage report showing which areas need specs.

## Hooks

| Hook | Event | What It Does |
|------|-------|-------------|
| `using-adev` | SessionStart | Injects adev awareness and available skills |
| `constitution-linter` | PreToolUse (Edit) | Validates constitution structure, size, pointers |
| `sync-trigger` | PostToolUse (Edit) | Triggers agent file sync after constitution changes |

## Integrations

### Session Capture (Optional)

adev integrates with [Entire.io](https://github.com/entireio/cli) for session capture, checkpoint/rewind, and ADR archaeology. A built-in JSONL logger is available as a lightweight alternative. Configure in `manifest.yaml`:

```yaml
integrations:
  session_capture:
    provider: entire    # entire | jsonl | none
```

### Blueprint Pipeline

adev is a methodology choice in the [claude-blueprints-plugin](https://github.com/agentic-development/claude-blueprints-plugin) scaffold workflow. Set `methodology: adev` in `platform-context.yaml`.

## Design

Full design document: [adev-plugin-design.md](https://github.com/agentic-development/agentic-dev-content/blob/main/docs/superpowers/specs/2026-03-19-adev-plugin-design.md)

## Status

**v0.1.0** — Plugin skeleton with Phase 1 components. Skills `adev-init`, `adev-sync`, and `using-adev` are fully specified. Remaining skills have stubs with defined interfaces.

## License

MIT
