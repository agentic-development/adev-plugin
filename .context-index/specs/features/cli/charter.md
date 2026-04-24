---
status: approved
revision: 2
updated: 2026-04-24
---

# Feature Charter: CLI

## Purpose

Single-file ESM installer and scaffolding tool (`cli/index.mjs`). Provides three commands: `install` (first-time plugin setup), `upgrade` (update existing installs), and `uninstall` (remove plugin). All context-layer configuration (constitution, governance, persona, sync targets) is handled by the `/adev:init` skill, not the CLI.

## Commands

- **`install`** — Register plugin with provider (Claude Code, OpenCode, Codex), scaffold minimal `.context-index/`, set up git hooks, stamp version. Exits early if adev is already installed, suggesting `upgrade` instead.
- **`upgrade`** — Detect installed version, compute upgrade delta, re-install providers, add missing scaffold files/templates, update git hooks, apply new config (provenance), stamp new version.
- **`uninstall`** — Remove plugin from selected providers.
- **`init`** — Backward-compat alias that routes to `install` or `upgrade` based on project state.

## Key Responsibilities

- Copy plugin files to the provider's plugin cache directory
- Make hook scripts executable after installation
- Scaffold minimal `.context-index/` using templates (verbatim `cpSync()`)
- Detect and offer to disable conflicting plugins (Superpowers)
- Manage version stamping in `manifest.yaml`
- Compute and apply upgrade deltas between versions

## Exported Functions

- `scaffoldContextKit()` — creates `.context-index/` from templates
- `setupGitHooks()` — installs git hooks with conflict detection and chaining
- `enablePlugin()` — copies plugin to cache, sets permissions (Claude Code adapter)
- `detectConflicts()` — checks for conflicting plugins in settings
- `disableConflictingPlugin()` — updates project settings to disable a plugin

## Constraints

- Must remain a single file (`cli/index.mjs`)
- Zero external dependencies — Node.js built-ins only
- Interactive prompts use `readline` (no third-party prompt library)
- Exit codes: 0 success, 1 error
- Context-layer configuration (constitution, governance, persona) belongs in `/adev:init`, not here

## Key Files

- `cli/index.mjs`
- `tests/cli.test.mjs`
