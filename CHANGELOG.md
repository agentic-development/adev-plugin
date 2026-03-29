# Changelog

## [0.6.0] - 2026-03-29

### New Features

- **Spec Lifecycle tracking** — Full lifecycle metadata for specs including status transitions, session-capture hooks, enriched post-commit session summaries, and CLI scaffolding for status reporting (#13)
- **`/adev-status` skill** — New skill to query spec and feature lifecycle status at a glance
- **`/adev-test-write` skill** — AI-assisted red-phase test authoring with 67 tests covering the generation pipeline (#10)
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

Initial public release with multi-provider support (Claude Code, OpenCode, Codex), 20+ skills, hook-based governance, and CLI installer.
