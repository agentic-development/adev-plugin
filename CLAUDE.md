# CLAUDE.md

<!-- AUTO-SYNCED from .context-index/constitution.md by /adev:sync.
     Do not edit the synced sections below directly — edit the constitution instead,
     then run /adev:sync to propagate changes. -->

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

### Commit Trailers

Commits that implement or fix spec-tracked work **must** include a `Spec:` trailer linking back to the spec file. This enables `/adev:retro` and `/adev:hygiene` to trace commits to lifecycle artifacts.

**Required format:**
```
feat(<module>): <description>

Spec: .context-index/specs/features/<module>/<spec-slug>.spec.md
Plan-task: <task-number>          # when implementing a plan task
```

**When to add trailers:**
- `/adev:implement` — always (Spec + Plan-task)
- `/adev:debug` — when fixing a bug tracked by a spec (Spec only)
- `/adev:validate` — when auto-fixing issues (Spec only)
- Manual commits touching spec-tracked code — Spec trailer recommended

**Existing required trailers** (from manifest `provenance` section): `Author-type`, `Operator` — injected by hooks.

### Patterns to Follow

- Hook scripts read `CLAUDE_TOOL_INPUT_*` env vars and JSON from stdin
- Templates are consumed verbatim by `cpSync()` — changes only affect new scaffolds
- Test helpers (`tests/helpers.mjs`) provide `createTempDir()`, `cleanupTempDir()`, `writeFixture()`, `runHook()`
- Issue storage is shared across git worktrees — adapters resolve the main repo root via `resolveStorageRoot()` in `lib/issues/resolve-root.mjs`, overridable with `tasks.db_path` in manifest

### Anti-Patterns to Avoid

- No CommonJS (`require`, `module.exports`)
- No executable logic inside SKILL.md files
- No hardcoded paths to `~/.claude/` — use the plugin root resolution from `cli/index.mjs`
- No `Run inline Node.js:` step directives, `node --input-type=module -e "..."` heredocs, or `node -e "..."` invocations inside `skills/*/SKILL.md`. Skills name a CLI subcommand (`adev <verb> …`) or a helper script; the helper body lives in `lib/cli/` or `scripts/`.
- No SKILL.md contains both an inline-Node block AND an `adev <verb>` invocation within the same H3 section (the per-step boundary; enforces per-skill atomic migration from the cli-driver-surface charter).
- **Fenced JavaScript in SKILL.md must be descriptive-reference only, never executable directive.** A `` ```javascript `` block that names a lib function (e.g., `import { fooFn } from '<ADEV_ROOT>/lib/...';`) is permitted ONLY as documentation of what the named CLI verb wraps — never as an instruction for the agent to execute. The agent reading a SKILL.md MUST call the corresponding `adev <verb> …` whenever the step has runtime semantics. If a fenced JavaScript block contains control-flow logic (branching, iteration, lookup that drives the next step), that logic belongs inside the CLI verb's implementation, not in skill prose. The cli-driver-surface charter's inline-Node sweep covered executable patterns (`node -e`, `Run inline Node:`); this rule clarifies the boundary for descriptive snippets that the sweep did not address.
- **SKILL.md bodies have two size limits, and prose deletion is the wrong fix for either.**
  - A **hard 65,536-byte cap** (`FRONTMATTER_BYTE_LIMIT` in `lib/providers/copilot/skill-validator.mjs`). Crossing it throws `INVALID_SKILL_FRONTMATTER` and takes down every Copilot adapter path — install, uninstall, status, dry-run.
  - A **~5,000-token guidance** from the Agent Skills spec. A body is loaded in full on invocation and then re-read as part of the context prefix on every later turn, so its size is multiplied by turn count, not paid once.

  Both are enforced by `tests/skills/skill-size-cap.test.mjs`, which recovers the hard cap behaviourally from the validator rather than duplicating the constant. The remedy for either is **progressive disclosure**, never trimming: move material the agent needs only sometimes into `skills/<name>/references/`, leave the heading in the body with a one-line summary and a `> **Conditional loading:** Read \`...\`` pointer, and load it on demand. `skills/hygiene/SKILL.md` is the reference pattern (23 audit passes in `references/audit-passes/`, a routing table in the body).

  Material that governs the **whole invocation** stays in the body regardless of size: the Load Skill Extensions block, the synchronous-dispatch and never-end-your-turn rules, and `## Prerequisites`. A precondition behind a conditional-loading pointer is no longer unconditional.

- **New skills MUST include a Load Skill Extensions block.** Every new `skills/<name>/SKILL.md` MUST contain a block that invokes `adev skill-ext load --skill <name>` (bare slug, matching the parent directory) and the uniform framing prose: *"The following skill extension instructions apply to this invocation (source: installed domain extensions and/or project-level overrides)."* This is required so project-level and extension-pack instructions can append to the skill's execution context. Coverage is enforced by `tests/skills-extension-coverage.test.mjs`. See `.context-index/specs/cross-cutting/universal-skill-extensions.spec.md`.

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
- **Updating specs/ADRs when code changes affect their assumptions** (this is required, not optional — `/adev:debug` Phase 7 and `/adev:validate` check for this)

**Do not bump `package.json` / `.claude-plugin/plugin.json` / `.cursor-plugin/plugin.json` versions in a feature or fix PR.** Releases are fully automated by release-please (ADR-0008): on push to `main` it scans conventional commits and opens its own Release PR that bumps all three manifests in lockstep (`release-please-config.json`'s `extra-files`) and updates `CHANGELOG.md`. Merging that Release PR is the only "ship" action. A manual bump in an unrelated PR fights release-please's own version computation. To force a specific target version (e.g. to land on a named milestone), use `/adev:issues milestone ship <name>` with the `release-please` strategy, which writes `release-as` into `release-please-config.json` for release-please to pick up.

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
| ADRs | `.context-index/adrs/` |
| Research artifacts | `.context-index/research/` |
| Roadmaps | `.context-index/specs/roadmap/` |
| Lifecycle state | `.context-index/lifecycle-state/` |
| Sync helpers | `lib/sync/` |
| End-user & agent reference docs | `docs/*.md` — start at `docs/README.md` for the index. Includes `skill-reference.md` (per-skill usage + args), `cli-reference.md` (all CLI verbs by audience), `installation.md`, `getting-started.md`, `concepts.md`, `configuration.md`, `governance.md`, `hooks.md`, `extensions.md`, `troubleshooting.md`. Agents should consult these when looking up CLI verb signatures, lifecycle procedures, or end-user-facing explanations rather than reverse-engineering from source. |

## Quality Gates

<!-- Commands that must pass before any implementation is considered complete.
     /adev:implement and /adev:validate will run these automatically. -->

```bash
# Tests
npm test
```

## Context Index

This project uses the Agentic Development Framework (adev).
- Constitution: `.context-index/constitution.md`
- Manifest: `.context-index/manifest.yaml`
- Platform: JavaScript (ESM), Node.js, npm, node:test
- Available skills (30): /adev:init, /adev:sync, /adev:using-adev, /adev:work, /adev:brainstorm, /adev:specify, /adev:review-specs, /adev:prototype, /adev:plan, /adev:route, /adev:implement, /adev:write-test, /adev:build, /adev:validate, /adev:debug, /adev:eval, /adev:recover, /adev:deploy, /adev:issues, /adev:status, /adev:hygiene, /adev:retro, /adev:codehealth, /adev:repomap, /adev:reconcile, /adev:sample, /adev:document, /adev:research, /adev:learn, /adev:assess (see `docs/skill-reference.md`)

<!-- BEGIN TASK MANAGEMENT -->
## Task Management

Issues are tracked using the beads backend (`br`). Issue data lives in `.beads/`, git-committed via `br sync --flush-only`.

- Use `br ready` to see actionable issues (open, unblocked)
- Use `br list --status in_progress` to see current work
- Use `br create "title" --type <bug|feature|task>` to create issues
- Use `br close <id> --reason "text"` to complete issues
- Use `/adev:issues` to manage issues interactively (create, update, close, view board)
- `lib/issues/registry.mjs` provides `getIssueManager(manifest)` for programmatic access
- `/adev:plan` and `/adev:implement` create and update issues automatically when `tasks.backend` is configured
- Claims are leased, not locked: `tasks.claim_ttl_minutes` (240 here) bounds how long a claim survives an unresponsive session before the next claimant can take over — see `adev issues stale [--json]`
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
npx @adev-org/adev-cli install
```

## Git Hooks

The `.githooks/pre-commit` chain invokes `.githooks/pre-commit-no-inline-node`
(source: `hooks/pre-commit-no-inline-node.sh`) before the protected-branch
check. The auxiliary hook rejects commits that add inline-Node patterns
(`Run inline Node.js:` headings, `node --input-type=module -e` heredocs, or
`node -e` in fenced code blocks) to any `skills/**/SKILL.md` file, and
rejects per-H3-section both-forms violations (inline-Node and `adev <verb>`
in the same section). Exit 2 means policy violation; exit 1 means the hook
crashed.

Bypass with `git commit --no-verify` only when justified (and explain why
in the commit message). Provider mirrors under `providers/*/skills/**` are
out of scope.
