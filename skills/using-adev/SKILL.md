---
name: using-adev
description: Gateway skill for the Agentic Development Framework. Injected at session start to establish methodology, available skills, and context routing.
---

# Agentic Development Framework (adev)

This project uses the **Agentic Development Framework**, a full-lifecycle methodology for AI-assisted software delivery grounded in four pillars: Context-First Architecture, Ephemeral Infrastructure, Gate-Based Governance, and Hybrid Engineering.

## Context Kit

All structured context lives in `.context-kit/`:

```
.context-kit/
├── constitution.md          # Project principles (source of truth)
├── manifest.yaml            # Context types, sync targets, specialist registry
├── platform-context.yaml    # Tech stack and deployment targets
├── specs/
│   ├── product.md           # Product Charter
│   ├── cross-cutting/       # Specs spanning features
│   └── features/            # Per-module charters and live specs
├── adrs/                    # Architecture Decision Records
├── samples/                 # Golden samples
├── orientation/             # Codebase architecture guide
└── specialists/             # Domain expert subagent prompts
```

The constitution is synced into CLAUDE.md (and other agent files). For deeper context, use agentic search (Glob/Grep/Read) against `.context-kit/`.

## Available Skills

| Skill | Phase | When to Use |
|-------|-------|-------------|
| `/adev-init` | Context Setup | Scaffold `.context-kit/` for a new or existing project |
| `/adev-sync` | Context Setup | Sync constitution to CLAUDE.md and other agent files |
| `/adev-brainstorm` | Brainstorming | Explore an idea and produce a Feature Charter |
| `/adev-specify` | Specification | Write Live Specs within a charter's scope |
| `/adev-review-specs` | Architecture Review | Principal architect agents review specs before planning |
| `/adev-plan` | Planning | Decompose specs into implementation tasks |
| `/adev-implement` | Implementation | Execute tasks with TDD, specialist routing, subagent review |
| `/adev-validate` | Validation | Post-implementation checks against specs and constitution |
| `/adev-debug` | Debugging | Context-aware systematic debugging |
| `/adev-hygiene` | Maintenance | Audit context staleness, drift, and coverage gaps |
| `/adev-repomap` | Maintenance | Generate AST-based symbol index for drift detection |

## Lifecycle Gates

These gates enforce quality:
- **Brainstorm before implement.** Do not write implementation code without a charter or spec.
- **Review before plan.** `/adev-plan` blocks if specs have not passed `/adev-review-specs`.
- **Constitution compliance.** Every phase checks against constitutional principles.
- **TDD.** Implementation follows RED-GREEN-REFACTOR (test first, then code).

## Skill Invocation Rule

If any `/adev-*` skill applies to the current task, invoke it before proceeding. Even a 1% chance it applies means you should check. The skill can always be skipped if it turns out to be irrelevant.
