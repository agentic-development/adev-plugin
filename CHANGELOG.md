# Changelog

## [0.7.1] - 2026-03-30

### Fixes

- **TDD verification uses targeted test runs** — `adev-implement` VERIFY RED/GREEN steps now run only the specific test file instead of the full suite, preventing dozens of unnecessary full-suite runs during multi-task implementation sessions (all three providers updated)

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
- **CLI installer** — `npx adev-cli init` for plugin installation and project scaffolding
- **9 core lifecycle skills** — brainstorm, specify, review-specs, plan, implement, validate, debug, hygiene, sync
- **SessionStart hook** — Injects framework context at session start
- **README** — Install guide, quick start, and lifecycle overview
