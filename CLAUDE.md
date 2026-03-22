# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

adev is a Claude Code plugin implementing a full-lifecycle Agentic Development Framework. It provides 17 skills (markdown-based instructions for Claude), 4 hooks (bash scripts for lifecycle events), templates for scaffolding `.context-index/` directories, and a zero-dependency CLI installer.

## Commands

```bash
# Run all tests (Node.js built-in test runner, no external deps)
npm test

# Run a single test file
node --test tests/cli.test.mjs
node --test tests/hooks/merge-guard.test.mjs

# Test the CLI locally (without installing)
claude --plugin-dir /path/to/adev-plugin

# Install into Claude Code (production path)
npx adev-cli init
```

## Architecture

### Plugin Registration

The plugin is registered via `.claude-plugin/plugin.json`. When installed, the CLI (`cli/index.mjs`) copies the entire plugin to `~/.claude/plugins/cache/agentic-development/adev/<version>/` and makes hook scripts executable.

### Skills (`skills/<name>/SKILL.md`)

Each skill is a single markdown file with YAML frontmatter (`name`, `description`). Skills contain no executable code — they are structured instructions that Claude parses and follows. The `using-adev` skill is the gateway, injected at session start to establish methodology awareness.

Skills follow a strict lifecycle order: init → brainstorm → specify → review-specs → plan → route → implement → validate → eval. Supporting skills (debug, recover, sample, retro, hygiene, repomap, sync) can run at any point.

### Hooks (`hooks/`)

Four bash scripts configured in `hooks/hooks.json`:

- **session-start.sh** (SessionStart) — Reads `using-adev/SKILL.md`, escapes to JSON, injects as context
- **constitution-linter.sh** (PreToolUse:Edit) — Validates constitution: ≤200 lines, required sections, valid file references
- **merge-guard.sh** (PreToolUse:Bash) — Parses `manifest.yaml` for `merge_policy`/`protected_branches`, blocks violations (exit code 2)
- **sync-trigger.sh** (PostToolUse:Edit) — Non-blocking notification to run `/adev-sync` after constitution edits

Hook protocol: JSON input on stdin, `CLAUDE_TOOL_INPUT_*` env vars. Exit 0 = allow, exit 2 = block. Output JSON with `hookSpecificOutput` for context injection.

### Templates (`templates/`)

12 markdown/YAML templates consumed by `/adev-init` via `cpSync()` to scaffold `.context-index/` in target projects. The `manifest-template.yaml` defines the full configuration schema (modules, specialists, gates, merge policy, governance).

### CLI (`cli/index.mjs`)

Single 397-line ESM file. Key exported functions: `scaffoldContextKit()`, `enablePlugin()`, `detectConflicts()`, `disableConflictingPlugin()`. Handles plugin installation, context-index scaffolding, .gitignore updates, and Superpowers conflict detection.

### Testing (`tests/`)

Uses Node.js built-in `node:test` — zero external test dependencies. `tests/helpers.mjs` provides `createTempDir()`, `cleanupTempDir()`, `writeFixture()`, `runHook()`, and `PLUGIN_ROOT`. Hook tests execute bash scripts in isolated temp directories with fixture manifests.

## Key Conventions

- **Pure ESM** — All `.mjs` files, `"type": "module"` in package.json
- **Zero dependencies** — No node_modules; uses only Node.js built-ins (`fs`, `path`, `child_process`, `crypto`, `node:test`)
- **Version pinned** in both `package.json` and `.claude-plugin/plugin.json` — keep them in sync
- **Skills are markdown, not code** — Never add executable logic to skill files; they are prompts for Claude
- **Hook scripts are bash** — They read JSON from stdin and environment variables, output JSON to stdout
- **Templates are consumed verbatim** — `cpSync()` copies them; changes to templates affect new scaffolds only
