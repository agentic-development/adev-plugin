---
name: using-adev
description: "Gateway skill for the Agentic Development Framework. Injected at session start to establish methodology, available skills, and context routing; also answers on-demand questions during a session. Use when the user asks 'what skills are available', 'how does adev work', 'what is the adev methodology', 'show me the workflow', 'what should I do', 'what should I do next', 'which skill do I need', 'how do I start', 'how does /adev:plan work', or asks how a specific skill or command works."
---

# Agentic Development Framework (adev)

This project uses the **Agentic Development Framework**, a full-lifecycle methodology for AI-assisted software delivery grounded in four pillars: Context-First Architecture, Ephemeral Infrastructure, Gate-Based Governance, and Hybrid Engineering.

### Load Skill Extensions

**Load Skill Extensions:** Load any skill extension instructions before proceeding:

```bash
adev skill-ext load --skill using-adev
```

If the output is not `__NONE__`, incorporate it as additional standing instructions that apply to this skill's entire execution. Frame it as: *"The following skill extension instructions apply to this invocation (source: installed domain extensions and/or project-level overrides)."* If the output is `__NONE__`, continue normally.

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

## The Single Front Door

**You never need to choose among the skills below.** Describe what you want in plain language, or run `/adev:work`. It is the one entry point: it reads your project's in-progress state, classifies your intent, routes to the right place, and can **drive the whole lifecycle for you** — pausing only at gates and decisions. The lifecycle skills are the *stages* `/adev:work` runs; invoke one directly only when you already know exactly which stage you want.

### Start here

| Skill | When to Use |
|-------|-------------|
| `/adev:work` | **The front door.** Unsure what to do, starting new work, or resuming — begin here. Classifies, routes, and drives. |
| `/adev:init` | First-time setup: scaffold `.context-index/` for a new or existing project. |
| `/adev:status` | See where everything stands — charters, specs, plans, progress. |
| `/adev:issues` | Manage work items — create, update, and track issues and epics. |

### Lifecycle stages (`/adev:work` runs these for you)

| Stage | Skill |
|-------|-------|
| Explore an idea → Feature Charter | `/adev:brainstorm` |
| Write a Live Spec within a charter | `/adev:specify` |
| Architecture review of specs | `/adev:review-specs` |
| Decompose specs into tasks | `/adev:plan` |
| Score tasks for autonomy vs review | `/adev:route` |
| Execute tasks (TDD, subagent review) | `/adev:implement` |
| End-to-end pipeline (review → validate) | `/adev:build` |
| Post-implementation checks | `/adev:validate` |
| Systematic debugging | `/adev:debug` |
| Audit context staleness & drift | `/adev:hygiene` |
| Repair lifecycle mismatches | `/adev:reconcile` |
| Everything else | `research`, `eval`, `deploy`, `document`, `retro`, `sample`, `learn`, `sync`, `repomap`, `codehealth`, `prototype`, `write-test` |

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

## Route Through the Front Door

**Before doing ANY substantive work — code, documentation, configuration, refactoring, content authoring, or file creation — route it through adev.** The simplest way: describe your goal, or run `/adev:work`. It picks the right stage (and can drive the rest). **You do not have to identify the correct skill yourself — that is the front door's job.**

**This is a hard gate, not a suggestion.** Do not create files, write code, launch research agents, or build task lists until the work has been routed through a skill — directly, or via `/adev:work`. A skill can always exit early if it turns out not to apply; skipping governance cannot be undone.

### Common bypass patterns to catch yourself on

| Rationalization | Why it's wrong |
|---|---|
| "This isn't code, it's just docs/config/content" | Non-code deliverables have scope, audience, and quality attributes — they route too |
| "It's a simple/quick fix" | Simple fixes without context risk violating spec assumptions or missing root cause |
| "I'll use TaskCreate to plan instead" | Session tasks are progress tracking, not lifecycle planning — they don't replace `/adev:plan` |
| "I don't know which skill applies" | Then run `/adev:work` — choosing the skill is *its* job, not yours |
| "The skill seems heavyweight for this" | Skills scale to complexity — and `/adev:work` can route low-risk work to a lighter path |

**When in doubt, `/adev:work`.** It is always a safe first move: it will resume in-progress work, or classify and route new work — and it can carry the work through the rest of the lifecycle so you never have to pick another command.

## Persona Output Override

A persona directive (Product, Developer, or Architect) is injected at session start below this block. **Persona rules are a session-level overlay that applies to all user-facing chat output.** Skill SKILL.md files define what to *compute, review, and write to disk* — not what to *show the user in chat*.

When a skill has a "Report to User", "Output Format", or similar section with prescriptive formatting (tables, code blocks, blocker codes), treat that format as the **default for the Developer persona**. If a different persona is active, adapt the chat summary to that persona's output rules:

- **Artifacts written to disk** (`.review.md`, `.plan.md`, validation reports) always use the full technical format regardless of persona.
- **Completion tokens** — the `/goal`-friendly terminal markers emitted by `/adev:build` (`ADEV-BUILD: <STATE>`) and `/adev:validate` (`ADEV-VALIDATE: <STATE>`) — are always emitted verbatim as the final line of output regardless of persona or verbosity. Persona and verbosity rules MUST NOT trim, reword, translate, summarize away, or fence them; like disk artifacts, they are exempt from persona adaptation (see `.context-index/specs/cross-cutting/completion-tokens/`).
- **Chat responses to the user** follow the active persona's dimension rules for verbosity, code references, review verdicts, test results, and next actions.
