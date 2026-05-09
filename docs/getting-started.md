[adev docs](README.md) > Getting Started

# Getting Started

This tutorial walks you through the complete adev lifecycle — from initializing your project to validating a finished feature. By the end, you will have used every core skill and understand how the framework fits together. No prior experience with adev is required.

## What You Will Build

You will take a feature idea through the full adev lifecycle:

1. Initialize your project context
2. Brainstorm and scope the feature
3. Write a behavioral specification
4. Review the spec with specialist reviewers
5. Plan the implementation as ordered tasks
6. Implement each task with test-driven development
7. Validate the finished feature against all quality gates

Each step builds on the previous one, producing artifacts that persist in your repository.

## Step 1: Install the Plugin

Install the adev plugin using npm:

```bash
npx @adev-org/adev-cli install
```

The installer prompts you to select your AI coding assistant:

- **Claude Code** (default, fully supported) — Registers as a Claude Code plugin with skills and hooks
- **OpenCode** (alpha) — Generates an AGENTS.md configuration file
- **Codex** (alpha) — Generates an AGENTS.md configuration file

The CLI registers the plugin, scaffolds a minimal `.context-index/` directory, and sets up git hooks for provenance tracking.

For detailed setup options, see [Installation & Setup](installation.md).

## Step 2: Initialize Your Project Context

Open your AI coding assistant in your project directory and run:

```
/adev:init
```

The interactive wizard walks you through 10 layers of project context:

- **Constitution** — Your project's non-negotiable principles and coding standards. This is the document every agent reads first.
- **Manifest** — Module registry, quality gates, and framework configuration. Defines how your project is organized.
- **Platform context** — Tech stack details (language, runtime, framework, test runner) that inform agent decisions.
- **Task management** — File-based or external issue tracking for bugs and work items.

And six additional layers for specialists, governance, sync targets, heuristics, samples, and orientation.

For existing codebases, use `--brownfield` to auto-detect your tech stack:

```
/adev:init --brownfield
```

The result is a **Context Index** — the `.context-index/` directory containing all structured project knowledge. Every subsequent skill reads from this directory to understand your project.

## Step 3: Brainstorm a Feature

```
/adev:brainstorm
```

Describe your feature idea in plain language. The skill explores it interactively — asking clarifying questions, identifying edge cases, and checking for overlap with existing capabilities.

The output is a **Feature Charter** — a structured document that defines:

- **Business intent** — Why this feature exists
- **Scope and boundaries** — What is in scope and what is explicitly out of scope
- **Capability map** — The individual capabilities this feature provides
- **Quality attributes** — Performance, security, and reliability requirements

The charter lives in `.context-index/specs/features/<name>/charter.md`. It serves as the scoping boundary for all subsequent work on this feature.

## Step 4: Write a Spec

```
/adev:specify
```

Within a charter's scope, write a **Live Spec** — a behavioral contract that defines exactly what the feature does. A spec contains:

- **Preconditions** — What must be true before the behavior executes
- **Behaviors** — "When X happens, then Y is the result" — concrete, testable statements
- **Postconditions** — What is guaranteed to be true after the behavior completes
- **Error cases** — What happens when things go wrong, with specific error codes

Each behavior maps directly to one or more test cases. The spec is the source of truth for what "correct" means — implementation and tests are verified against it.

## Step 5: Review the Spec

```
/adev:review-specs
```

Before any code is written, three parallel specialist subagents review your spec:

- **Structural architect** — Evaluates API design, modularity, and boundary clarity
- **Security reviewer** — Checks for injection risks, authentication gaps, and data exposure
- **Consistency analyzer** — Verifies naming conventions, cross-cutting patterns, and alignment with existing specs

Each reviewer produces findings categorized as CRITICAL, IMPORTANT, or MINOR. The spec must pass review (no unresolved CRITICAL or IMPORTANT issues) before planning can begin.

## Step 6: Plan the Work

```
/adev:plan
```

The reviewed spec is decomposed into ordered implementation tasks. Each task includes:

- **File lists** — Which files to create, modify, and test
- **TDD expectations** — What the failing test should look like before implementation
- **Context routing** — Hints for which specialist (if any) should handle the task
- **Dependencies** — Which tasks must complete before this one can start

The plan is a concrete, step-by-step roadmap. Tasks are ordered so that each one builds on the previous, and dependencies are explicit.

## Step 7: Implement

```
/adev:implement
```

Each task is executed by a fresh subagent following strict test-driven development (TDD):

1. **RED** — Write a failing test that captures the expected behavior
2. **GREEN** — Write the minimum code to make the test pass
3. **REFACTOR** — Clean up the code while keeping all tests green

After each task, two review stages run automatically:

- **Stage 1: Spec compliance** — A reviewer reads the actual code and verifies it matches the spec
- **Stage 2: Code quality** — A reviewer checks the git diff against your project's coding standards

Both reviews must pass before the next task begins. If a reviewer finds issues, the implementer fixes them and the review runs again.

## Step 8: Validate

```
/adev:validate
```

After all tasks are complete, validation runs 13 ordered checks to verify the implementation:

- Quality gates (tests, lint, typecheck)
- Spec compliance — every acceptance criterion is satisfied
- Charter consistency — implementation stays within the chartered scope
- Constitution and ADR compliance — no violations of project principles
- Source manifest verification — all produced files are tracked
- Visual verification (for UI features, via Playwright browser automation)

If all checks pass, the spec status is promoted to `validated`. If any check fails, you get a detailed report of what to fix.

## What's Next?

You have completed your first full lifecycle pass. Here are the skills you will use most often going forward:

- `/adev:work` — Start here any time. It classifies your incoming work (new feature, bug fix, refactoring) and routes you to the right skill automatically.
- `/adev:issues` — Track bugs, tasks, and epics. Create issues, update status, and view your issue board.
- `/adev:status` — See project-wide progress across all charters, specs, and capabilities.
- `/adev:debug` — Context-aware debugging that checks specs and ADRs before investigating.
- `/adev:hygiene` — Audit your context for staleness, drift, and coverage gaps.

For the complete list of skills with usage details, see [Skill Reference](skill-reference.md).

---

[Previous: Installation & Setup](installation.md)
