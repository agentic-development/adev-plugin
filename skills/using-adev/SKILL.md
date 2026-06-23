---
name: using-adev
description: "Gateway skill for the Agentic Development Framework. Injected at session start to establish methodology, available skills, and context routing. Use when the user asks 'what skills are available', 'how does adev work', 'what is the adev methodology', 'show me the workflow', or needs an overview of the framework and its lifecycle."
---

# Agentic Development Framework (adev)

This project uses the **Agentic Development Framework**, a full-lifecycle methodology for AI-assisted software delivery grounded in four pillars: Context-First Architecture, Ephemeral Infrastructure, Gate-Based Governance, and Hybrid Engineering.

## Context Index

All structured context lives in `.context-index/`:

```
.context-index/
├── constitution.md          # Project principles (source of truth)
├── manifest.yaml            # Context types, sync targets, specialist registry
├── platform-context.yaml    # Tech stack and deployment targets
├── specs/
│   ├── product.md           # Product Charter
│   ├── cross-cutting/       # Specs spanning features
│   └── features/            # Per-module charters and live specs
├── adrs/                    # Architecture Decision Records
├── research/                # Persistent research artifacts
├── samples/                 # Golden samples
├── orientation/             # Codebase architecture guide
└── specialists/             # Domain expert subagent prompts
```

The constitution is synced into CLAUDE.md (and other agent files). For deeper context, use agentic search (Glob/Grep/Read) against `.context-index/`.

## Available Skills

| Skill | Phase | When to Use |
|-------|-------|-------------|
| `/adev:work` | Triage | Classify incoming work and route to the right skill |
| `/adev:research` | Research | Persistent structured research using web, GitHub, and codebase sources |
| `/adev:init` | Context Setup | Scaffold `.context-index/` for a new or existing project |
| `/adev:sync` | Context Setup | Sync constitution to CLAUDE.md and other agent files |
| `/adev:brainstorm` | Brainstorming | Explore an idea and produce a Feature Charter; bootstraps `product.md` identity on first charter |
| `/adev:specify` | Specification | Write Live Specs within a charter's scope; binds each spec to a Feature work item |
| `/adev:review-specs` | Architecture Review | Principal architect agents review specs before planning |
| `/adev:plan` | Planning | Decompose at any scope: `--spec` (default), `--feature`, `--release`, `--milestone`, `--epic` |
| `/adev:build` | Build | End-to-end orchestrator: review → plan → route → implement → validate |
| `/adev:implement` | Implementation | Execute tasks with TDD, specialist routing, subagent review |
| `/adev:write-test` | Implementation | Standalone TDD test authoring with gaming detection |
| `/adev:validate` | Validation | Post-implementation checks against specs and constitution |
| `/adev:debug` | Debugging | Context-aware systematic debugging |
| `/adev:issues` | Issue Management | Create, update, and track issues and epics (with milestone support) |
| `/adev:hygiene` | Maintenance | Audit context staleness, drift, and coverage gaps |
| `/adev:repomap` | Maintenance | Generate AST-based symbol index for drift detection |

For full per-skill usage, argument signatures, and worked examples, see [`docs/skill-reference.md`](../../docs/skill-reference.md). For the complete CLI verb surface (including internal verbs like `adev gate`, `adev report`, `adev build-state`, `adev partial`, `adev heuristics`, `adev source-manifest`, `adev domain`, etc. that this gateway does not list), consult [`docs/cli-reference.md`](../../docs/cli-reference.md) or `node cli/index.mjs <verb> --help` for any specific verb. End-user-facing topics — installation, getting-started, governance, hooks, extensions, troubleshooting — are indexed at [`docs/README.md`](../../docs/README.md).

## Lifecycle Gates

These gates enforce quality:
- **Brainstorm before implement.** Do not write implementation code without a charter or spec.
- **Review before plan.** `/adev:plan` blocks if specs have not passed `/adev:review-specs`.
- **Constitution compliance.** Every phase checks against constitutional principles.
- **TDD.** Implementation follows RED-GREEN-REFACTOR (test first, then code).

## Context-First Rule

**Before editing ANY source code**, read relevant project context:

1. **Bug fix?** → Invoke `/adev:debug`. It mandates reading ADRs, specs, and architecture before proposing fixes.
2. **Implementation task?** → Invoke `/adev:implement`. It loads context automatically in Step 1.
3. **Quick fix or small change?** → Read the relevant charter or spec FIRST. Even a 1-line fix can violate spec assumptions.

A context-preflight hook will warn if you edit source code without reading `.context-index/` files first. Treat this warning as a stop signal — read context before continuing.

## Skill Invocation Rule

**Before doing ANY work — code, documentation, configuration, refactoring, content authoring, or file creation — check whether an `/adev:*` skill applies.** If there is even a 1% chance a skill applies, invoke it. The skill can always exit early if irrelevant; skipping it cannot be undone.

**This is a hard gate, not a suggestion.** Do not create files, write code, launch research agents, or build task lists until you have either invoked the matching skill or confirmed no skill applies.

### Common bypass patterns to catch yourself on

| Rationalization | Why it's wrong |
|---|---|
| "This isn't code, it's just docs/config/content" | Non-code deliverables have scope, audience, and quality attributes — they need a charter too |
| "It's a simple/quick fix" | Simple fixes without context risk violating spec assumptions or missing root cause |
| "I'll use TaskCreate to plan instead" | Session tasks are progress tracking, not lifecycle planning — they don't replace `/adev:plan` |
| "Let me research first, then decide" | Research without a skill means you're already executing without governance |
| "The skill seems heavyweight for this" | Skills scale to complexity — a small feature gets a small charter |

### Routing quick-reference

| Work type | Skill |
|---|---|
| New feature, capability, or deliverable | `/adev:brainstorm` |
| Bug fix or unexpected behavior | `/adev:debug` |
| Unclear what to do | `/adev:work` |
| Existing plan needs execution | `/adev:implement` |
| Quality check after implementation | `/adev:validate` |

## Persona Output Override

A persona directive (Product, Developer, or Architect) is injected at session start below this block. **Persona rules are a session-level overlay that applies to all user-facing chat output.** Skill SKILL.md files define what to *compute, review, and write to disk* — not what to *show the user in chat*.

When a skill has a "Report to User", "Output Format", or similar section with prescriptive formatting (tables, code blocks, blocker codes), treat that format as the **default for the Developer persona**. If a different persona is active, adapt the chat summary to that persona's output rules:

- **Artifacts written to disk** (`.review.md`, `.plan.md`, validation reports) always use the full technical format regardless of persona.
- **Completion tokens** — the `/goal`-friendly terminal markers emitted by `/adev:build` (`ADEV-BUILD: <STATE>`) and `/adev:validate` (`ADEV-VALIDATE: <STATE>`) — are always emitted verbatim as the final line of output regardless of persona or verbosity. Persona and verbosity rules MUST NOT trim, reword, translate, summarize away, or fence them; like disk artifacts, they are exempt from persona adaptation (see `.context-index/specs/cross-cutting/completion-tokens/`).
- **Chat responses to the user** follow the active persona's dimension rules for verbosity, code references, review verdicts, test results, and next actions.
