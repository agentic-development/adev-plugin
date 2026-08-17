# Product Charter: adev-plugin

## Vision

A Claude Code plugin that provides a full-lifecycle methodology for AI-assisted software delivery. Grounded in four pillars: Context-First Architecture, Ephemeral Infrastructure, Gate-Based Governance, and Hybrid Engineering.

## Problem Statement

AI coding agents work best with structured context but most projects provide none. Without clear principles, specs, and boundaries, agents make inconsistent decisions, hallucinate file paths, and produce work that doesn't match the team's standards. adev bridges this gap by providing a scaffolded context index and a lifecycle of skills that enforce quality at every phase.

## Module Map

| Module | Description | Key Files |
|--------|-------------|-----------|
| CLI | Installation, scaffolding, conflict detection | `cli/index.mjs` |
| Skills | 30 markdown-based lifecycle instructions | `skills/<name>/SKILL.md` |
| Strategic Planning | Research, build orchestration, issue/status tracking, doc generation (vision folded into brainstorm, roadmap folded into status) | `skills/research/`, `skills/build/`, `skills/issues/`, `skills/status/`, `skills/document/` |
| Issue Management | Epic/issue tracking with milestone support | `lib/issues/`, `skills/issues/` |
| Hooks | 4 bash lifecycle guards (session, lint, merge, sync) | `hooks/` |
| Templates | 13 scaffold files for `.context-index/` | `templates/` |
| Plugin Registration | Metadata and version for Claude Code | `.claude-plugin/plugin.json` |
| Test Strategies | Strategy abstraction layer decoupling TDD from unit-test assumptions across 8 domain-specific strategies | [charter.md](./features/test-strategies/charter.md) |
| Output Personas | Presentation layer adapting plugin outputs to user role and expertise level via layered persona config | [charter.md](./features/output-personas/charter.md) |
| Debug Playbooks | Module-scoped and cross-cutting diagnostic procedures guiding /adev:debug with domain-specific failure modes, ordered investigation steps, and escalation criteria | [charter.md](./features/debug-playbooks/charter.md) |
| Infrastructure Preflight | Runtime verification of external system availability before skills execute code or tests, blocking with actionable diagnostics when requirements are unmet | [charter.md](./features/infra-preflight/charter.md) |
| Spec Drift Detection | Real-time awareness when implementation code diverges from its governing spec, shifting detection from periodic audits to the moment of change | [charter.md](./features/spec-drift-detection/charter.md) |
| Eval Projects | Suite of four realistic project repos (pipeline, API, migration, automation) serving as eval targets and onboarding demos for the adev lifecycle | [charter.md](./features/eval-projects/charter.md) |
| Domain Profiles | Configurable domain layer adapting charters, specs, reviewers, quality gates, and verification to different development domains via overlay files and deterministic resolution | [charter.md](./features/domain-profiles/charter.md) |
| Deploy | Project-specific deployment definitions with structured steps, environment support, milestone integration, and failure recovery guidance | [charter.md](./features/deploy/charter.md) |
| User-Facing Documentation | Complete user guide replacing and reorganizing docs/ into a linear progression from concepts through daily workflow to full reference | [charter.md](./features/user-docs/charter.md) |
| Agent-Reliable State Artifacts | Storage-layer refactor replacing markdown-table and YAML agent-mutated state with JSON for relational data and per-spec JSONL append-only event logs, with markdown rendered on demand for human inspection | [charter.md](./features/agent-reliable-state-artifacts/charter.md) |
| Domain Extensions | Installable content packages distributing domain-specific configuration as extensions consumed by the install pipeline | [charter.md](./features/domain-extensions/charter.md) |
| Lifecycle Artifacts | Structural taxonomy for adev's lifecycle artifacts via a unified `kind:` discriminator, per-kind template matrix, and kind-aware routing in `/adev:specify` and `/adev:brainstorm` | [charter.md](./features/lifecycle-artifacts/charter.md) |
| CLI Driver Surface | Compiler-driver pattern wrapping every adev helper as an `adev <verb>` subcommand, with diagnostic registry and write-time event tagging that makes "agent claimed done but checks didn't fire" detectable at the moment of claim | [charter.md](./features/cli-driver-surface/charter.md) |
| Cursor Provider | Fourth provider adapter that installs adev into Cursor 2.5's Plugin system, with a build-step generator translating canonical `hooks/hooks.json` to Cursor's event model and completing the `cursor` sync-target format | [charter.md](./features/cursor-provider/charter.md) |
| Copilot Provider | Fifth provider adapter that installs adev into GitHub Copilot's per-repo customization surface (`.github/skills/`, `.github/hooks/`, `.github/copilot-instructions.md`, `.github/instructions/`), with a build-step generator emitting Copilot's PascalCase hook protocol and tool-name mapping; covers both VS Code Copilot and the standalone Copilot CLI from one install | [charter.md](./features/copilot-provider/charter.md) |
| Worktree Parallelization | adev-managed git worktrees enabling parallel, file-disjoint lifecycle execution (implement task-groups, milestone builds) without conflicts, anchored to the main repo root so they never nest | [charter.md](./features/worktree-parallelization/charter.md) |

## Cross-Cutting Concerns

- **Zero dependencies** — the entire plugin runs on Node.js built-ins only (softened: new deps require ADR justification)
- **Portability** — skills are markdown, making them adaptable to other AI tools (Cursor, Copilot, Gemini)
- **Idempotency** — `/adev:init` is safe to re-run; it becomes a health check on existing setups
- **Version parity** — `package.json` and `.claude-plugin/plugin.json` must stay in sync

## Quality Attributes

- **Simplicity** — single-file CLI, no build step, no framework
- **Reliability** — hooks use exit codes for clear pass/fail signals
- **Extensibility** — new skills are added by creating a directory with a SKILL.md
- **Testability** — all hooks and CLI functions tested with Node.js built-in test runner

## Non-Goals

- adev is NOT a web application or API server
- adev does NOT execute skills — it provides instructions that Claude follows
- adev does NOT manage runtime state — it scaffolds static context files
