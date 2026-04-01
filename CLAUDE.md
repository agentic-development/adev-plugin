# CLAUDE.md

<!-- AUTO-SYNCED from .context-index/constitution.md by /adev-sync.
     Do not edit the synced sections below directly — edit the constitution instead,
     then run /adev-sync to propagate changes. -->

## Identity

adev-plugin is a Claude Code plugin and zero-dependency CLI that implements a full-lifecycle Agentic Development Framework, providing markdown-based skills, bash hooks, and templates for scaffolding structured project context.

## Non-Negotiable Principles

1. **Minimize external dependencies** — prefer Node.js built-ins (`fs`, `path`, `child_process`, `crypto`, `node:test`). Justify any new dependency in an ADR.
2. **Skills are primarily markdown** — skill files are structured instructions for Claude. Companion code (helpers, validators) is allowed but must not be required for the skill to function.
3. **Pure ESM** — all `.mjs` files, `"type": "module"` in package.json. No CommonJS.
4. **Hook protocol compliance** — hooks read JSON from stdin + env vars, exit 0 (allow) or 2 (block), output JSON to stdout.
5. **Version parity** — `package.json` and `.claude-plugin/plugin.json` versions must always match.

## Coding Standards

### Language and Runtime

- **Primary language:** JavaScript (ESM, `.mjs` extension)
- **Runtime:** Node.js
- **Package manager:** npm

### Conventions

- **Naming:** camelCase for functions/variables, kebab-case for files and directories
- **File structure:** skills in `skills/<name>/SKILL.md`, hooks in `hooks/`, templates in `templates/`, CLI in `cli/`
- **Import ordering:** Node.js built-ins first, then relative imports
- **Error handling:** hooks use exit codes (0 = allow, 2 = block); CLI uses `process.exit(1)` for fatal errors
- **Logging:** hooks output JSON to stdout; CLI uses `console.log` for user-facing output

### Patterns to Follow

- Hook scripts read `CLAUDE_TOOL_INPUT_*` env vars and JSON from stdin
- Templates are consumed verbatim by `cpSync()` — changes only affect new scaffolds
- Test helpers (`tests/helpers.mjs`) provide `createTempDir()`, `cleanupTempDir()`, `writeFixture()`, `runHook()`

### Anti-Patterns to Avoid

- No CommonJS (`require`, `module.exports`)
- No executable logic inside SKILL.md files
- No hardcoded paths to `~/.claude/` — use the plugin root resolution from `cli/index.mjs`

## Architecture Boundaries

### Requires Human Approval

- Adding new skills to the lifecycle order
- Changing the hook protocol (stdin/stdout JSON contract)
- Modifying the CLI installation path structure
- Changing the plugin registration format (`.claude-plugin/plugin.json`)
- Adding external dependencies

### Autonomous (Agent May Decide)

- Adding tests
- Refactoring within a module's boundaries
- Fixing lint or type errors
- Editing skill markdown content
- Updating templates
- Updating internal documentation
- Bumping version in `package.json` AND `.claude-plugin/plugin.json` (must stay in sync) when a PR adds features, fixes, or breaking changes

## Context Routing

| Context Need | Location |
|---|---|
| Skills | `skills/<name>/SKILL.md` |
| Hooks | `hooks/` + `hooks/hooks.json` |
| Templates | `templates/` |
| CLI logic | `cli/index.mjs` |
| Tests | `tests/` |
| Test helpers | `tests/helpers.mjs` |
| Plugin registration | `.claude-plugin/plugin.json` |
| Project config | `package.json` |
| Context index | `.context-index/` |

## Quality Gates

```bash
# Tests
npm test
```

## Context Index

This project uses the Agentic Development Framework (adev).
- Constitution: `.context-index/constitution.md`
- Manifest: `.context-index/manifest.yaml`
- Platform: JavaScript (ESM), Node.js, npm, node:test
- Available skills: /adev-brainstorm, /adev-specify, /adev-review-specs, /adev-plan, /adev-implement, /adev-validate, /adev-debug, /adev-hygiene, /adev-issues

<!-- BEGIN TASK MANAGEMENT -->
## Task Management

Issues are tracked using the file backend. The issue board lives at `.context-index/tasks/tasks.md`.

- Use `/adev-issues` to manage issues interactively (create, update, close, view board)
- Use `/adev-issues ready` to see actionable issues (open and unblocked)
- `lib/issues/registry.mjs` provides `getIssueManager(manifest)` for programmatic access
- `/adev-plan` and `/adev-implement` create and update issues automatically when `tasks.backend` is configured
<!-- END TASK MANAGEMENT -->

# User Additions
<!-- Content below is preserved across syncs. Add Claude-specific instructions here. -->

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
