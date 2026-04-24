# Quick Start: Your First 10 Minutes with adev

This guide walks you through setting up the Agentic Development Framework and running your first lifecycle pass.

## 1. Install the plugin

```bash
npx @adev-org/adev-cli install
```

Select your AI coding assistant (Claude Code is the default). The CLI registers the plugin, scaffolds a minimal `.context-index/`, and sets up git hooks.

## 2. Initialize your project context

Open Claude Code in your project directory and run:

```
/adev:init
```

The interactive wizard walks you through 10 layers:
- **Constitution** — your project's non-negotiable principles
- **Manifest** — module registry and configuration
- **Platform context** — tech stack and deployment targets
- **Task management** — file-based or beads issue tracking

For existing codebases, use `--brownfield` to detect your stack automatically.

## 3. Brainstorm a feature

```
/adev:brainstorm
```

Describe your feature idea. The skill explores it interactively and produces a **Feature Charter** — a structured document defining scope, capabilities, and quality attributes. The charter lives in `.context-index/specs/features/<name>/charter.md`.

## 4. Write a spec

```
/adev:specify
```

Within a charter's scope, write a **Live Spec** — a behavioral contract defining preconditions, behaviors, postconditions, and error cases. Each behavior maps to one or more test cases.

## 5. Review the spec

```
/adev:review-specs
```

Three parallel specialist subagents review your spec:
- **Structural architect** — API design, modularity, boundaries
- **Security reviewer** — injection, auth, data exposure
- **Consistency analyzer** — naming, patterns, cross-cutting concerns

The spec must pass review before planning can begin.

## 6. Plan the work

```
/adev:plan
```

The spec is decomposed into ordered implementation tasks with:
- File lists (create, modify, test)
- TDD expectations (RED-GREEN-REFACTOR)
- Context routing hints for specialist subagents
- Dependencies between tasks

## 7. Implement

```
/adev:implement
```

Each task is executed by a fresh subagent following TDD:
1. **RED** — write a failing test
2. **GREEN** — write the minimum code to pass
3. **REFACTOR** — clean up while tests stay green

Two-stage review (spec compliance + code quality) runs after each task.

## 8. Validate

```
/adev:validate
```

11 ordered checks verify the implementation:
- Quality gates (tests, lint, typecheck)
- Spec compliance and charter consistency
- Constitution and ADR compliance
- Source manifest verification
- Visual verification (for UI, via Playwright)

If all checks pass, the spec is promoted to `validated`.

## What's next?

- Run `/adev:work` any time — it classifies your work and routes to the right skill
- Use `/adev:issues` to track bugs and tasks
- Use `/adev:status` to see project-wide progress
- See [docs/skills.md](skills.md) for the full skill reference
