[adev docs](README.md) > Getting Started

# Core Concepts

adev is built on four pillars that shape how humans and AI agents collaborate to build software. Understanding these pillars helps you make the most of the framework.

## The Four Pillars

### 1. Context-First Architecture

Every decision an AI agent makes depends on the context it has. adev stores all project knowledge — principles, specifications, architectural decisions, and configuration — in a structured directory called the **Context Index** (`.context-index/`). This ensures that every agent session starts with the same shared understanding of the project, regardless of which agent or model is used.

Without structured context, agents improvise. With it, they follow your project's established patterns and constraints.

### 2. Ephemeral Infrastructure

Agents are disposable; context is not. An agent session may last minutes or hours, but the artifacts it produces — specifications, plans, code, and test results — persist in the repository. If a session fails or an agent gets stuck, you can start a fresh session and it picks up exactly where the last one left off by reading the same context.

This means you never depend on a single long-running agent. Work is saved incrementally, and recovery is always possible.

### 3. Gate-Based Governance

Quality is enforced through gates at every stage of the lifecycle. A specification must pass architectural review before it can be planned. An implementation must pass both spec-compliance and code-quality reviews before it is considered complete. Validation runs a comprehensive check suite before a feature is promoted.

Gates prevent shortcuts. They ensure that agents cannot skip steps, merge untested code, or produce work that drifts from the specification.

### 4. Hybrid Engineering

Some tasks are best handled by agents; others require human judgment. adev supports this through routing — tasks can be classified as fully autonomous, agent-assisted (agent does the work, human reviews at checkpoints), or human-only (agent scaffolds the structure, human writes the code).

The framework does not try to automate everything. It provides structure so that humans and agents each contribute where they are most effective.

## The Context Index

The Context Index is the `.context-index/` directory at the root of your project. It contains:

- **Constitution** (`constitution.md`) — Your project's non-negotiable principles, coding standards, and architectural boundaries. This is the document that every agent reads first.
- **Manifest** (`manifest.yaml`) — Module registry, quality gate commands, completion policies, and framework configuration.
- **Platform Context** (`platform-context.yaml`) — Tech stack details (language, runtime, framework, test runner) that inform agent decisions.
- **Feature Charters** (`specs/features/<name>/charter.md`) — Scoping documents that define what a feature includes and excludes, its capabilities, and quality attributes.
- **Live Specs** (`specs/features/<name>/*.spec.md`) — Behavioral contracts that define preconditions, expected behaviors, postconditions, and error cases for each capability.
- **ADRs** (`adrs/`) — Architectural Decision Records documenting significant technical choices and their rationale.
- **Tasks** — Issue tracking for bugs, tasks, and epics tied to specifications and plans.

You do not need to create these files manually. The `/adev:init` command scaffolds the Context Index interactively, and subsequent skills maintain it as your project evolves.

## Lifecycle Overview

adev follows a structured lifecycle for building features. Each phase produces artifacts that feed into the next:

```
brainstorm --> specify --> review --> plan --> implement --> validate
    |              |          |         |          |            |
    v              v          v         v          v            v
 Charter      Live Spec    Review    Plan      Code +       Validated
              (behavioral  Report   (ordered   Tests        Feature
               contract)            tasks)
```

1. **Brainstorm** — Explore an idea interactively and produce a Feature Charter that defines scope, capabilities, and boundaries.
2. **Specify** — Within a charter's scope, write a Live Spec — a behavioral contract defining exactly what the feature does.
3. **Review** — Specialist reviewers (architecture, security, consistency) evaluate the spec for issues before any code is written.
4. **Plan** — The reviewed spec is decomposed into ordered implementation tasks with file lists, test expectations, and dependencies.
5. **Implement** — Each task is executed following test-driven development (TDD), with two-stage review (spec compliance, then code quality) after each task.
6. **Validate** — A comprehensive check suite verifies the implementation against the spec, constitution, and quality gates.

This lifecycle is not rigid — you can enter at any point, skip phases for simple changes, or iterate within a phase. But for new features, following the full lifecycle produces the most reliable results.

## Output Personas

adev adapts its communication style based on who is reading the output. When you initialize a project with `/adev:init`, you can configure an **output persona** that controls how skills present their results in conversation. The persona does not change what the framework does — it changes how it talks to you.

Three personas are available:

- **Product** — For product managers, designers, and non-technical stakeholders. Skills summarize outcomes in plain language, omit file paths and code snippets, and suggest next actions in terms of decisions rather than commands.
- **Developer** (default) — For engineers actively building. Skills show file paths, code references, test results, and technical details. This is the full-detail view.
- **Architect** — For technical leads reviewing design decisions. Skills emphasize architectural trade-offs, boundary compliance, and cross-cutting concerns.

The persona is set in the manifest and injected at session start. You can change it at any time by editing `manifest.yaml` or re-running `/adev:init`. Artifacts written to disk (validation reports, review files, plans) always use the full technical format regardless of persona — only the conversation output adapts.

## Key Terms

| Term | Definition |
|------|------------|
| **Charter** | A scoping document that defines a feature's capabilities, boundaries, and quality attributes |
| **Live Spec** | A behavioral contract specifying preconditions, behaviors, postconditions, and error cases |
| **Constitution** | The project's non-negotiable principles and coding standards |
| **Context Index** | The `.context-index/` directory containing all structured project knowledge |
| **Gate** | A quality checkpoint that must pass before work can proceed to the next phase |
| **Skill** | A structured capability invoked via `/adev:<name>` that guides agents through a specific task |
| **TDD** | Test-Driven Development — write a failing test first, then implement to make it pass |

---

Next: [Installation & Setup](installation.md)
