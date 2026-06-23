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

The diagram above shows the core path; two optional steps sit alongside it — **route** (after plan: scores each task as auto / assisted / human-only) and **eval** (after validate: graduated 0–100 quality scoring). This lifecycle is not rigid — you can enter at any point, skip phases for simple changes, or iterate within a phase. But for new features, following the full lifecycle produces the most reliable results.

## Output Personas

adev adapts its communication style on **two orthogonal axes**: a **persona** that controls the audience pitch (who is reading), and a **verbosity** dial that controls how much detail lands in chat (how much they need to see). Neither axis changes what the framework does — they change how it talks to you. Artifacts written to disk (validation reports, review files, plans) always use the full technical format regardless of either axis.

### Axis 1 — Persona (audience pitch)

Three personas are available:

- **Product** — For product managers, designers, and non-technical stakeholders. Skills summarize outcomes in plain language, omit file paths and code snippets, and suggest next actions in terms of decisions rather than commands.
- **Developer** (default) — For engineers actively building. Skills show file paths, code references, test results, and technical details. This is the full-detail view.
- **Architect** — For technical leads reviewing design decisions. Skills emphasize architectural trade-offs, boundary compliance, and cross-cutting concerns.

### Axis 2 — Verbosity (output depth)

Three verbosity levels are available:

- **terse** — Cap responses to ~3 sentences unless asked. Skip Architectural-Read, multi-table verdicts, and trade-off recapping unless the user explicitly invokes them. Summarize disk artifacts in one sentence with a link.
- **normal** — One to two paragraphs by default. Trade-off rationale appears at real decision branches.
- **deep** — Full mandated sections from the persona directive: rationale, trade-offs, multi-table review verdicts, and complete citation lists.

Per-persona defaults: `architect → normal`, `developer → normal`, `product → terse`. You can override on a per-session basis with `--verbosity <level>`.

### Universal invariants (across all 9 combinations)

Three rules hold regardless of which persona × verbosity combination is active:

- **Next-Actions invariant.** Every assistant turn ends with a clear next-action suggestion. The Next Actions dimension is never trimmed, even under `verbosity: terse`. (Terse mode biases toward a single most-likely suggestion rather than enumerating a menu of alternatives, but the line is always present.)
- **Anti-redundancy rule.** If a disk artifact (`.review.md`, `.plan.md`, `.validate.md`, `.spec.md`, or any file under `.context-index/`) captures the detail, chat summarizes in 1–3 sentences and links to the path rather than recapitulating contents. The Next Actions dimension is exempt — forward-looking suggestions are not duplicates of disk content.
- **No hard word caps.** Templates bias tone, never enforce a hard "N words max." (The Anthropic April-2026 Claude Code postmortem found that hard word caps cost 3% quality.)
- **Completion tokens are exempt.** The `/goal`-friendly terminal markers (`ADEV-BUILD: <STATE>`, `ADEV-VALIDATE: <STATE>`) are always emitted verbatim as the final line, regardless of persona or verbosity — they are machine-readable, like disk artifacts. See *Unattended runs with `/goal`* below.

### Configuration

Both axes are configured the same way — via the `user-config` file (flat `key=value` lines, bash-parseable). The resolution hierarchy is identical:

1. Per-invocation flag (`--persona <name>` or `--verbosity <level>`)
2. Local config (`.context-index/user-config`, gitignored)
3. Global config (`<plugin-root>/user-config`, set during `npx @adev-org/adev-cli install`)
4. Per-persona default for verbosity (no fallback for persona — `developer` is the universal default)

```bash
# .context-index/user-config (local override; gitignored)
persona=architect
verbosity=terse
```

Unknown values produce a non-fatal warning and fall back. Values containing `/`, `\`, or `..` are rejected (defense-in-depth path-traversal guard). If a verbosity overlay template is missing, the session-start hook degrades to persona-only directive injection — it never blocks the session.

See [Configuration Reference → Personas & Verbosity](configuration.md#personas-verbosity) for the full schema and adoption guide.

## Unattended runs with `/goal`

Claude Code's built-in `/goal` command keeps a session running across turns until a small evaluator model confirms a completion condition — but the evaluator only sees the **transcript** (it cannot run tools or read files). To make adev pipelines reliably drivable by `/goal`, the two terminal skills emit a fixed, machine-checkable completion token as the **final line** of their output:

| Skill | Token | States |
|-------|-------|--------|
| `/adev:validate` | `ADEV-VALIDATE: <STATE>` | `PASS` · `FAIL` |
| `/adev:build` | `ADEV-BUILD: <STATE>` | `COMPLETE` · `FAILED` · `BLOCKED` |

The token is plain text (never fenced), emitted exactly once, and **persona/verbosity-independent** — it is never trimmed or reworded. A `/goal` condition can therefore match it verbatim:

```
/goal /adev:build --auto --spec .context-index/specs/features/auth/login.spec.md
      has run and the transcript contains "ADEV-BUILD: COMPLETE" and "ADEV-VALIDATE: PASS"
```

`/goal` supplies the per-turn continuation; adev's deterministic gates supply the real done-check — the evaluator only confirms what `/adev:validate` already proved. `ADEV-BUILD: BLOCKED` means the pipeline halted on an unresolved review (including the `--require-human-final-pass` sign-off halt), so a goal wrapping a build won't spin forever on a blocked spec.

> **A note on exemptions.** Completion tokens are deliberately the *second* persona-exempt output class (after disk artifacts). Keep such exemptions rare — they exist only because a machine reads the output, not a human.

This convention is governed by the `completion-tokens` cross-cutting charter (`.context-index/specs/cross-cutting/completion-tokens/`).

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
