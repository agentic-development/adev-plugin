# Changelog

## [0.16.0] - 2026-04-17

### New Features

- **Workspace-aware strategic planning** — `/adev:brainstorm` at the workspace root bootstraps `product.md` with per-repo identity synthesis; `/adev:plan --release` and `--milestone` plan across workspace + repo charters with non-transitive dependency inheritance. Epic-board sync deferred to Phase 2 Shared Issue Tracking (#65)
- **Input-hardening helpers** — `assertPathInWorkspace` (PATH_ESCAPE), `validateModuleName` (INVALID_MODULE_NAME), `sanitizeIdentityOneLiner` (ANSI/control-char stripping), `readCappedText` (512 KB file cap), `resolveWorkspaceProductPath` added to `lib/workspace.mjs`
- **Repo-mode advisory** — Both `/adev:brainstorm` and `/adev:plan` print a one-line stdout advisory when invoked inside a registered repo of a detected workspace

### Breaking Changes

- **`/adev:vision` and `/adev:roadmap` removed** (since 0.15.0) — Vision/identity bootstrap folded into `/adev:brainstorm` Step 5b; milestone/release planning folded into `/adev:plan --milestone` and `--release`

### Other

- 45 new tests (1045 total, 0 failures)
- 1 Live Spec validated (workspace-aware-vision, 23 acceptance criteria)
- Multi-repo workspace charter: all 11 capabilities at `validated` status

## [0.11.0] - 2026-04-06

### New Features

- **Session Awareness module** — Full feature charter with 10 capabilities, all validated
- **Execution state file** — `lib/execution-state.mjs` with read/write/clear, atomic writes (temp-file-then-rename), YAML frontmatter + markdown progress body. Tracks active plan, current task, issue binding, blockers, and next action
- **Session-start resume** — Extended `session-start.sh` to read execution state and inject a resume block (active plan context or blocker alert) at session start, enabling seamless continuation across sessions
- **Issue reminder hook** — New `issue-reminder.sh/.mjs` PostToolUse hook that surfaces active issues every N tool calls and after git commits, with counter-based triggering and git commit detection
- **Idle nudge** — When no in-progress issues exist, the reminder hook shows up to 3 open issues by priority or an "all resolved" message, with a stale execution state warning when applicable
- **Configurable reminder interval** — `tasks.reminder_interval` in manifest.yaml (default 25, set to 0 to disable). Added to scaffold template
- **Session log schema** — Formalized the existing JSONL schema for `.session-tracking.jsonl`, removed undocumented `specs` field, added `tool_name` guard to skip writes when tool name is missing
- **Skill-level state instructions** — Added execution state instructions to `/adev:implement` SKILL.md: resume check at Step 1, per-task state writes at Step 2, blocker state at Step 2d, and clear on completion at Step 4
- **Format documentation** — `FORMAT.md` template documenting execution state and session log schemas as public contracts for external tool interoperability

### Fixes

- **Session capture schema alignment** — Removed undocumented `specs: []` field from JSONL output, added guard to skip writes when `tool_name` is missing (was writing `"unknown"`)

### Other

- 22 new tests across 4 test files (531 total, 0 failures)
- 7 Live Specs written, reviewed (3 specialist reviewers each), and validated (11-check suite)
- Feature charter fully validated: all 10 capabilities at `validated` status

## [0.10.0] - 2026-04-06

### New Features

- **Context-preflight hook** — New PreToolUse hook (`context-preflight.sh`) that warns when source files are edited without reading project context first. Tracks context reads via `context-read-tracker.sh` and a `.context-preflight-ok` flag file (#30)
- **Strategic planning skills** — `/adev:vision`, `/adev:roadmap`, and `/adev:research` skills for product-level planning, dependency sequencing, and structured research. Charter with 8 live specs, all reviewed and planned (#29)
- **Issue model milestone support** — Issues and epics now support milestone fields for roadmap alignment
- **Plugin-namespaced skill rename** — Renamed all skills from `adev-*` to `adev:*` format (e.g., `/adev-brainstorm` → `/adev:brainstorm`) for plugin namespace compliance

### Fixes

- Fixed all 16 pre-existing test failures from skill rename migration
- Skill naming convention aligned across all three providers (Claude Code, OpenCode, Codex)

## [0.9.0] - 2026-04-02

### New Features

- **`/adev:codehealth` skill** — Proactive source code scanning for dead exports, orphan files, unused dependencies, stale code, and duplicate logic. Produces severity-tiered reports from repomap artifacts (#26)
- **Quickstart guide and skill reference** — New `docs/quickstart.md` and `docs/skills.md` with lifecycle flow diagram, full skill inventory, and getting-started instructions (#27)
- **Worktree-shared issue storage** — Issue board data is now shared across git worktrees via `resolveStorageRoot()`, with optional `tasks.db_path` override in manifest (#25)

### Other

- Stamped source manifests on all implemented specs for drift detection (#24)
- Validated spec-lifecycle transitions and fixed stale spec statuses
- Refreshed all generated documentation (`docs/architecture.md`, module docs)

## [0.8.0] - 2026-04-01

### New Features

- **Persistent issue tracking** — `lib/issues/` module with pluggable backends (file-based markdown tables and beads_rust). Includes epic/issue CRUD, dependency tracking with cycle detection, status transitions, and priority ordering. Integrated into `/adev:plan` and `/adev:implement` (#23)
- **`/adev:issues` skill** — Interactive issue management: create, update, close, and view issues and epics with board display
- **Data engineering eval framework** — Cross-tool benchmarks for data engineering skills with dbt project fixtures (#20)
- **`adev-data-eval` submodule** — Dedicated test data repository for data engineering evaluations (#18)

### Fixes

- **Commit guard on protected branches** — `merge-guard.sh` now also blocks `git commit` on protected branches, not just `git push` and `git merge` (#21)

### Other

- Synced provider skills across Claude Code, OpenCode, and Codex (#17)
- Backfilled hygiene metadata and review trailers on existing specs (#15)

## [0.7.1] - 2026-03-30

### Fixes

- **TDD verification uses targeted test runs** — `adev-implement` VERIFY RED/GREEN steps now run only the specific test file instead of the full suite, preventing dozens of unnecessary full-suite runs during multi-task implementation sessions (all three providers updated)

## [0.7.0] - 2026-03-30

### New Features

- **`/adev:work` skill** — Pre-lifecycle triage that classifies incoming work (feature, bug, spike, chore) and routes to the correct `/adev:*` skill. Scans for in-progress plans, unreviewed specs, and recent sessions before classifying (#16)
- **Canonical `/adev:document` SKILL.md** — Created provider-agnostic canonical skill from OpenCode version

### Other

- Converted `/adev:test-write` companion helpers from `.mjs` to bash scripts for cross-provider compatibility

## [0.6.0] - 2026-03-29

### New Features

- **Spec Lifecycle tracking** — Full lifecycle metadata for specs including status transitions, session-capture hooks, enriched post-commit session summaries, and CLI scaffolding for status reporting (#13)
- **`/adev-status` skill** — New skill to query spec and feature lifecycle status at a glance
- **`/adev-write-test` skill** — AI-assisted red-phase test authoring with 67 tests covering the generation pipeline (#10)
- **Model Routing cross-cutting spec** — Applies model tier routing across all skills, enabling cost-aware agent dispatch
- **Golden Samples curation** — Automated golden sample scoring and curation in `.context-index/samples/`, with orientation updates for `lib/repomap` (#12)

### Fixes

- Codex install flow and skill metadata corrections
- Session-capture grep pattern fix
- Backfill lifecycle metadata for existing specs
- Multiple architecture review blocker resolutions across specs

### Other

- Added Claude install coverage
- Updated README for multi-provider support
- Added `session_capture` integration to manifest

## [0.5.0] - 2026-03-25

### New Features

- **Multi-provider support** — Added OpenCode and OpenAI Codex providers with full skill parity (18 skills each) (#5, #6)
- **`/adev-assess` skill** — Codebase readiness assessment across 8 structural dimensions with data domain support (#7)
- **`/adev-document` skill** — Automated documentation generation with architecture docs, module docs, slug validation, and GENERATED.md manifest
- **`/adev-repomap`** — AST-based symbol index using tree-sitter with TypeScript support, PageRank ranking, dependency graph builder, and `--mode` flag
- **Eval framework** — Repomap eval pipeline (cloner, ground truth, parser, compare, report) and skill-compression eval framework
- **CI/CD** — GitHub Actions quality gates workflow, merge-block and publish-on-tags specs
- **Browser-based visual verification** — Added to `/adev-implement` and `/adev-validate` skills
- **Automatic spec status updates** — Specs transition status automatically across skill lifecycle
- **Skill compression** — Eval-validated compression of `/adev-brainstorm` and `/adev-specify`

### Fixes

- Include `.claude-plugin` in package files for `npx` install (#3)
- Resolve symlinks in CLI `isDirectRun` check
- Auto-create `opencode.json` when installing for OpenCode
- Improve scaffolding to detect existing `.context-index/`
- Correct OpenCode plugin installation and fix adev-document tests

### Other

- Added CLAUDE.md with project conventions and architecture boundaries
- Initialized `.context-index/` with constitution, charters, and manifest
- ADR 0001: web-tree-sitter optional dependency
- ADR 0002: TypeScript dev dependency

## [0.4.1] - 2026-03-20

### New Features

- **E2E test suite** — End-to-end tests for the full plugin
- **Merge guard hook** — Prevents direct pushes to main, enforces PR-based workflow

## [0.4.0] - 2026-03-19

### New Features

- **Context packets** — Structured context bundles for cross-skill data sharing
- **Task routing** — Intelligent routing of implementation tasks to specialist subagents
- **Agent recovery** — Structured diagnosis-correction-resume cycle (`/adev-recover`)
- **Golden samples** — Reference implementation curation in `.context-index/samples/`
- **Eval harness** — Graduated evaluation framework (`/adev-eval`)

## [0.3.0] - 2026-03-19

### New Features

- **Declarative governance** — Constitution-gated quality checks across all lifecycle phases

## [0.2.0] - 2026-03-19

### New Features

- **External references** — Support for external references in manifest, init wizard, context-loading skills, and hygiene audit
- Renamed `.context-kit/` to `.context-index/` across all files

## [0.1.0] - 2026-03-19

Initial release.

### New Features

- **Plugin skeleton** — Claude Code plugin structure with `.claude-plugin/plugin.json`
- **`/adev-init` skill** — Interactive onboarding wizard with plugin conflict detection
- **CLI installer** — `npx @adev-org/adev-cli init` for plugin installation and project scaffolding
- **9 core lifecycle skills** — brainstorm, specify, review-specs, plan, implement, validate, debug, hygiene, sync
- **SessionStart hook** — Injects framework context at session start
- **README** — Install guide, quick start, and lifecycle overview
