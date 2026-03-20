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
├── references/                  # External context (API contracts, shared standards)
├── governance/                  # Declarative gates, boundaries, risk policies (optional)
│   ├── gates.yaml
│   ├── boundaries.yaml
│   ├── risk-policies.yaml
│   └── overrides/
├── samples/                     # Golden samples (curated by /adev-sample)
├── packets/                     # Context packets per task (gitignored, debugging)
├── evals/                       # Evaluation harness config and reports (optional)
├── orientation/                 # Human-authored codebase guide
│   └── architecture.md
├── specialists/                 # Domain expert subagent prompts
└── hygiene/                     # Generated reports (gitignored)
    ├── recoveries/              # Agent recovery records
    ├── blockers/                # Agent blocker files
    └── retros/                  # Sprint retrospective reports
```

## Lifecycle

| Phase | Skill | What Happens |
|-------|-------|-------------|
| Context Setup | `/adev-init` | Scaffold `.context-index/`, generate constitution, sync agent files |
| Brainstorming | `/adev-brainstorm` | Explore idea, produce a Feature Charter |
| Specification | `/adev-specify` | Write Live Specs within charter scope |
| Architecture Review | `/adev-review-specs` | Parallel specialist agents review specs (Opus) |
| Planning | `/adev-plan` | Constitution-gated task decomposition |
| Routing | `/adev-route` | Score tasks on routing matrix, recommend execution strategy |
| Implementation | `/adev-implement` | TDD, specialist routing, context packets, subagent execution |
| Validation | `/adev-validate` | Multi-check against specs, constitution, ADRs |
| Evaluation | `/adev-eval` | Graduated quality scoring (deterministic → LLM-as-a-Judge → HITL) |
| Debugging | `/adev-debug` | Context-aware systematic debugging |
| Recovery | `/adev-recover` | Diagnose and resume stuck agents (6 root cause categories) |
| Samples | `/adev-sample` | Discover, score, and curate golden sample implementations |
| Retrospective | `/adev-retro` | Analyze delivery metrics, extract lessons, suggest improvements |
| Maintenance | `/adev-hygiene` | Audit staleness, drift, coverage gaps, recovery patterns |

## Key Concepts

### Constitution

A tool-agnostic document (`.context-index/constitution.md`) containing your project's non-negotiable principles, coding standards, architecture boundaries, context routing rules, and quality gates. Kept under 200 lines. Synced to CLAUDE.md, AGENTS.md, .cursorrules, and copilot-instructions.md via `/adev-sync`.

### Merge Policy

The `completion.merge_policy` field in `manifest.yaml` controls what happens after implementation and validation pass. Options: `pr` (default, always open a PR), `merge` (allow direct merge to non-protected branches), `ask` (prompt the user each time). Branches listed in `completion.protected_branches` (default: main, master) always require a PR regardless of policy. The `merge-guard` hook enforces this programmatically by blocking Bash commands that merge or push to protected branches.

### Context Routing

The constitution tells agents *when* and *where* to look for deeper context. Agents use standard agentic search (Glob/Grep/Read) to fetch what they need. No pre-computed indexes required.

### Architecture Review

Before any code is written, `/adev-review-specs` dispatches parallel specialist subagents (structural architect, security reviewer, consistency analyzer) to review specs. Returns PASS / PASS_WITH_NOTES / BLOCK. Planning is gated on passing review.

### Specialist Routing

Domain experts (frontend design, data engineering, security) are declared in `manifest.yaml`. During implementation, tasks are automatically routed to the matching specialist based on file patterns and keywords.

### Governance

Declarative governance policies live in `.context-index/governance/` as YAML files. Define quality gates with triggers and commands (`gates.yaml`), architectural boundary rules with regex patterns (`boundaries.yaml`), and risk-based review escalation policies (`risk-policies.yaml`). Skills enforce these automatically during planning, implementation, and validation. Charter-specific overrides go in `governance/overrides/`. Projects without governance files continue working unchanged, falling back to manifest gates.

### Context Packets

Every implementation task gets an explicit context packet: a manifest of exactly which files, spec sections, ADRs, and samples the subagent receives. Packets are logged to `.context-index/packets/` (gitignored) for debugging. When a task fails, `/adev-recover` inspects the packet to diagnose what context was missing.

### Task Routing

`/adev-route` scores each task on four dimensions (spec completeness, pattern coverage, blast radius, novelty) and recommends `auto-agent` (run unattended), `assisted-agent` (pause for mid-point review), or `human-only` (agent scaffolds, human implements). Prevents over-delegation and under-delegation.

### Agent Recovery

When subagents get stuck, `/adev-recover` diagnoses the root cause from six categories (missing context, ambiguous spec, constraint conflict, novel problem, tool failure, budget exhaustion), injects corrective context, and resumes. Recovery records feed into `/adev-retro` for trend analysis.

### Brownfield Support

For existing codebases: `/adev-init --brownfield` reverse-engineers charters from code structure, generates retrospective ADRs from git history, and produces a coverage report showing which areas need specs.

## Hooks

| Hook | Event | What It Does |
|------|-------|-------------|
| `using-adev` | SessionStart | Injects adev awareness and available skills |
| `constitution-linter` | PreToolUse (Edit) | Validates constitution structure, size, pointers |
| `sync-trigger` | PostToolUse (Edit) | Triggers agent file sync after constitution changes |
| `merge-guard` | PreToolUse (Bash) | Blocks git merge/push to protected branches when merge_policy is "pr" |

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

**v0.4.1** — Merge policy enforcement. Agents can no longer merge directly to protected branches. Three-layer defense: manifest configuration, skill instructions, and a PreToolUse hook guard.

**v0.4.0** — Context packets, task routing, agent recovery, golden sample curation, sprint retrospectives, and graduated evaluation harness. Five new skills (`/adev-sample`, `/adev-route`, `/adev-recover`, `/adev-retro`, `/adev-eval`) plus context packet assembly, blocker flag protocol, and scope guard integration across existing skills.

## License

MIT
