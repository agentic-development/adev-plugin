---
name: adev:init
description: "Initialize or diagnose the .context-index/ directory. Interactive wizard that explains each layer, detects existing setup, and lets users opt in or skip per layer. Use --brownfield for existing codebases, --dry-run to preview without writing. Trigger when the user wants to set up adev, initialize context, start a new project with adev, or diagnose a broken context-index."
---

# Initialize Context Index

Interactive setup wizard for the Agentic Development Framework. Walks through each context layer one at a time, explains what it does, and lets the user opt in or skip.

## Arguments

- No arguments: interactive wizard (detects greenfield vs. existing setup automatically)
- `--brownfield`: adds reverse-chartering, ADR archaeology, and coverage analysis
- `--dry-run`: shows what would be created without writing any files
- `--workspace`: initialize a workspace root that aggregates multiple child repos under one `adev-workspace.yaml`

### Load Skill Extensions

**Load Skill Extensions:** Load any skill extension instructions before proceeding:

```bash
adev skill-ext load --skill init
```

If the output is not `__NONE__`, incorporate it as additional standing instructions that apply to this skill's entire execution. Frame it as: *"The following skill extension instructions apply to this invocation (source: installed domain extensions and/or project-level overrides)."* If the output is `__NONE__`, continue normally.

## Behavior by Project State

The full first-run vs diagnostic decision tree and every Step 7/8 sub-step it drives.

> **Conditional loading:** Read `skills/init/references/behavior-by-project-state.md` for the full instructions. Do not act on this section from the summary above.

## Workspace Mode (`--workspace`)

Applies only with --workspace: scaffolds a multi-repo workspace root.

> **Conditional loading:** Read `skills/init/references/workspace-mode.md` for the full instructions. Do not act on this section from the summary above.

## Brownfield Mode (`--brownfield`)

Applies only with --brownfield: initializes over an existing codebase.

> **Conditional loading:** Read `skills/init/references/brownfield-mode.md` for the full instructions. Do not act on this section from the summary above.

## Dry-Run Mode (`--dry-run`)

Shows what would be created without writing anything. Runs the full analysis (tech stack detection, directory scanning, git history if brownfield) but only prints the summary:

```
/adev:init --dry-run

Would create:
  .context-index/constitution.md          (~85 lines)
  .context-index/manifest.yaml            (2 sync targets)
  .context-index/platform-context.yaml    (Next.js 16, Prisma, Clerk)
  .context-index/orientation/architecture.md
  .context-index/specs/product.md

Would sync to:
  CLAUDE.md (new file)
  AGENTS.md (would merge with existing 120-line file)

Would modify:
  .gitignore (add .context-index/hygiene/)

Run /adev:init to proceed.
```

## Persona and Verbosity Configuration (optional)

After all context files are created, ask the user if they want project-specific output overrides. Both axes are asked together — `verbosity` has no other interactive adoption surface in adev, so skipping it here leaves it at its per-persona default forever.

```
Would you like to set a project-specific output persona? (product/developer/architect/skip)
This creates .context-index/user-config with your persona preference for this project.
Your global default will be used if you skip.
```

If the user selects a persona (`product`, `developer`, or `architect`), follow up with the verbosity question:

```
How much detail should adev put in chat? (terse/normal/deep/default)
  terse   — 1-3 sentence responses; artifacts summarized in one line and linked
  normal  — standard depth
  deep    — full reasoning and intermediate steps
  default — use the persona's default (product=terse, developer=normal, architect=normal)
```

Then write `.context-index/user-config`:

```
# Project-specific adev user config
persona=<selected>
verbosity=<selected>
```

Omit the `verbosity=` line entirely if the user chose `default` — an absent key resolves to the per-persona default, whereas an invalid value is discarded with a warning.

If the user enters `skip` or presses enter without a value at the persona prompt, do not create the file and do not ask about verbosity.

Ensure `.context-index/user-config` is listed in the project's `.gitignore` (the CLI already handles this during installation, but verify it is present).

## Session History Files

The CLI installer ships a git `post-commit` hook (`.githooks/post-commit`) that auto-generates one session summary file per commit at `.context-index/sessions/<date>-<shortSHA>.md`. These files contain commit metadata + subject/body and are consumed by `/adev:retro` (via the `## Session Activity` section in Step 1.8 — see `skills/retro/SKILL.md`), `/adev:hygiene`, and audit skills. `/adev:retro` reads both post-commit-mode files (this hook) and hook-mode files (`hook-driven-capture`) within the analysis window and renders tool-use distribution, per-spec session counts, token/cost trends, sessions ↔ closed-issues cross-reference, and frame-anchored Context Gaps.

The installer's `.gitignore` block intentionally does **not** include `.context-index/sessions/` — the convention is tracked content, batch-committed under `chore(sessions): record YYYY-MM-DD transcripts` messages. If the project prefers to keep them local-only, add `.context-index/sessions/` to `.gitignore`. Surface this choice to the user during init when relevant. Full reference: `docs/hooks.md` > Git Hooks > `post-commit`.

## After Initialization

```
Context Index initialized at .context-index/

Your constitution has been synced to CLAUDE.md. Every AI agent
that works on this project will now follow your rules.

Next steps:
- Review your constitution: .context-index/constitution.md
- Charter your first feature: /adev:brainstorm
- Or specify existing work: /adev:specify

The constitution linter hook is active — it will validate
your constitution whenever you edit it.
```

## Domain Extension Picker

The interactive picker that selects installed domain extensions.

> **Conditional loading:** Read `skills/init/references/domain-extension-picker.md` for the full instructions. Do not act on this section from the summary above.

## Sync Targets (multi-provider projects)

When the project uses more than one AI assistant, `manifest.yaml` decides which
agent files `/adev:sync` generates. `adev install` scaffolds a sensible default
for a fresh project and then stops — choosing *between* targets on an existing
manifest is context-layer configuration and belongs here.

If the project has multiple providers configured, offer:

1. Sync to both `CLAUDE.md` and `AGENTS.md` (default)
2. Sync to `CLAUDE.md` only
3. Sync to `AGENTS.md` only

Write the choice to `sync.targets` in `.context-index/manifest.yaml`, then run
`/adev:sync` so the agent files match. Skip this step entirely for
single-provider projects — there is nothing to choose.

## Provenance Enforcement (optional)

Provenance adds `Author-type` and `Operator` trailers to every commit, and the
CI gate rejects commits missing them on PRs. It is off unless `manifest.yaml`
carries a `provenance:` block.

`adev upgrade` reports when a version makes this available, but no longer
writes the block — it is project policy, not an install step. Offer it here:

> Enable provenance enforcement? It stamps every commit with Author-type and
> Operator trailers, and CI will reject commits that lack them.

On yes, add to `.context-index/manifest.yaml`:

```yaml
provenance:
  require_hooks: true
  required_trailers:
    - Author-type
    - Operator
```

On no, say that it can be added later under `provenance:` in the manifest.
Enabling it in a repo whose history predates the hooks only affects new
commits — it does not retroactively invalidate anything.
