---
name: using-adev
description: "Gateway skill for the Agentic Development Framework. Injected at session start to establish methodology, available skills, and context routing. Use when the user asks 'what skills are available', 'how does adev work', 'what is the adev methodology', 'show me the workflow', or needs an overview of the framework and its lifecycle. In Codex, invoke with $adev:using-adev"
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

If any `/adev:*` skill applies to the current task, invoke it before proceeding. Even a 1% chance it applies means you should check. The skill can always be skipped if it turns out to be irrelevant.

Bug fixes are the most common case where agents skip skills. A "simple" fix without context risks violating spec assumptions or missing the root cause entirely.

## Persona Output Override

A persona directive (Product, Developer, or Architect) is injected at session start below this block. **Persona rules are a session-level overlay that applies to all user-facing chat output.** Skill SKILL.md files define what to *compute, review, and write to disk* — not what to *show the user in chat*.

When a skill has a "Report to User", "Output Format", or similar section with prescriptive formatting (tables, code blocks, blocker codes), treat that format as the **default for the Developer persona**. If a different persona is active, adapt the chat summary to that persona's output rules:

- **Artifacts written to disk** (`.review.md`, `.plan.md`, validation reports) always use the full technical format regardless of persona.
- **Chat responses to the user** follow the active persona's dimension rules for verbosity, code references, review verdicts, test results, and next actions.
