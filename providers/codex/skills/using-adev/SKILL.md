---
name: using-adev
description: "Gateway skill for the Agentic Development Framework (OpenAI Codex). Establishes methodology context, available skills, and context routing. Use when the user asks 'what skills are available', 'how does adev work', 'what is the adev methodology', 'show me the workflow', or needs an overview of the framework and its lifecycle."
---

# Agentic Development Framework (adev) — OpenAI Codex

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
├── samples/                 # Golden samples
├── orientation/             # Codebase architecture guide
└── specialists/              # Domain expert subagent prompts
```

The constitution is synced to AGENTS.md. For deeper context, use agentic search (Glob/Grep/Read) against `.context-index/`.

## Available Skills

Invoke skills explicitly with `$adev:<skill>` or let Codex implicitly activate them based on the description.

| Skill | Phase | When to Use |
|-------|-------|-------------|
| `$adev:start` | Triage | Classify incoming work and route to the right skill |
| `$adev:init` | Context Setup | Scaffold `.context-index/` for a new or existing project |
| `$adev:sync` | Context Setup | Sync constitution to AGENTS.md and other agent files |
| `$adev:brainstorm` | Brainstorming | Explore an idea and produce a Feature Charter |
| `$adev:specify` | Specification | Write Live Specs within a charter's scope |
| `$adev:review-specs` | Architecture Review | Principal architect agents review specs before planning |
| `$adev:plan` | Planning | Decompose specs into implementation tasks |
| `$adev:route` | Planning | Score tasks on routing matrix for autonomous vs assisted execution |
| `$adev:implement` | Implementation | Execute tasks with TDD, specialist routing, subagent review |
| `$adev:write-test` | Implementation | Standalone TDD test authoring with gaming detection |
| `$adev:validate` | Validation | Post-implementation checks against specs and constitution |
| `$adev:debug` | Debugging | Context-aware systematic debugging |
| `$adev:hygiene` | Maintenance | Audit context staleness, drift, and coverage gaps |
| `$adev:repomap` | Maintenance | Generate AST-based symbol index for drift detection |
| `$adev:assess` | Assessment | Assess codebase readiness across 8 (raw) or 11 (adev) dimensions |
| `$adev:write-test` | Implementation | TDD test authoring with gaming detection |
| `$adev:recover` | Implementation | Resume stuck agent tasks — diagnosis, correction, re-dispatch |
| `$adev:eval` | Validation | Graduated evaluation harness — score output quality beyond pass/fail |
| `$adev:sample` | Maintenance | Curate golden samples from high-quality implementations |
| `$adev:retro` | Maintenance | Sprint retrospective — extract lessons and delivery metrics |
| `$adev:status` | Maintenance | Read-only dashboard of charters, specs, and lifecycle progress |

## Lifecycle Gates

These gates enforce quality:

- **Brainstorm before implement.** Do not write implementation code without a charter or spec.
- **Review before plan.** `$adev:plan` blocks if specs have not passed `$adev:review-specs`.
- **Constitution compliance.** Every phase checks against constitutional principles.
- **TDD.** Implementation follows RED-GREEN-REFACTOR (test first, then code).

## Skill Invocation Rule

If any `adev-*` skill applies to the current task, invoke it before proceeding. Even a 1% chance it applies means you should check. The skill can always be skipped if it turns out to be irrelevant.

## Invocation Examples

```text
$adev:init
$adev:sync
$adev:brainstorm
$adev:plan
```

For Codex, prefix any adev skill with `$` to explicitly invoke it.
