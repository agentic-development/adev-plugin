---
name: adev-init
description: Initialize or diagnose the .context-kit/ directory. Interactive wizard that explains each layer, detects existing setup, and lets users opt in or skip per layer. Use --brownfield for existing codebases, --dry-run to preview without writing.
---

# Initialize Context Kit

Interactive setup wizard for the Agentic Development Framework. Walks through each context layer one at a time, explains what it does, and lets the user opt in or skip.

## Arguments

- No arguments: interactive wizard (detects greenfield vs. existing setup automatically)
- `--brownfield`: adds reverse-chartering, ADR archaeology, and coverage analysis
- `--dry-run`: shows what would be created without writing any files

## Behavior by Project State

### No `.context-kit/` exists (First Run)

This IS the onboarding experience. Walk through each layer interactively:

```
Step 1/8: Project Analysis
  Analyzing your project...

  Detected:
  - Framework: Next.js 16.1 (App Router)
  - Language: TypeScript (strict mode)
  - Database: PostgreSQL via Prisma
  - Auth: Clerk
  - Deployment: Vercel
  - Existing context: CLAUDE.md (47 lines), AGENTS.md (120 lines)

  → Does this look right? (yes / edit)
```

```
Step 2/8: Constitution
  The constitution is the core of adev. It defines your project's
  non-negotiable principles, coding standards, and architecture
  boundaries. It stays under 200 lines and syncs to CLAUDE.md
  and other agent files automatically.

  Every AI agent that works on your project reads the constitution
  first. It tells them what rules to follow and where to find
  deeper context.

  I'll ask you a few questions to draft one.

  → Ready to create your constitution? (yes / skip for now)
```

If the user says yes, proceed with the constitution wizard:
- Project identity (one-line description, repo type)
- Non-negotiable principles (suggest 3-5 based on detected stack, user confirms/edits)
- Coding standards (detect from tsconfig/eslint/prettier, user confirms)
- Architecture boundaries (suggest based on project structure, user confirms)
- Quality gate commands (detect test/lint/typecheck commands from package.json scripts)

Generate `constitution.md` from answers using the template at `${CLAUDE_PLUGIN_ROOT}/templates/constitution-template.md`.

```
Step 3/8: Platform Context
  Platform context captures your tech stack so agents make
  technology-aware decisions. When an agent needs to choose
  between Redis and Postgres, it checks here first.

  Based on your project, I generated:

  framework: nextjs
  version: "16.1"
  language: typescript
  database: postgresql
  orm: prisma
  auth: clerk
  deployment: vercel
  ...

  → Save this? (yes / edit / skip)
```

```
Step 4/8: Orientation
  The orientation file is a human-written guide to your codebase.
  It tells agents where to find things: which directory handles
  auth, where the API routes live, how the modules connect.

  I can draft one from your directory structure. You should
  review and refine it since you know the codebase best.

  → Generate a draft? (yes / skip)
```

If yes, analyze directory structure, identify key modules, produce a brief `orientation/architecture.md` (3-5 paragraphs describing the codebase layout and module relationships).

```
Step 5/8: Product Charter
  A product charter defines WHAT you are building at the highest
  level: vision, module map, cross-cutting concerns, and quality
  attributes. Feature charters break this down per module.

  → Draft a product charter from your README? (yes / skip / I'll write one later)
```

```
Step 6/8: Sync Targets
  Your constitution will be synced to agent-specific files so
  every AI tool gets the same rules.

  Detected targets:
  ✓ CLAUDE.md (Claude Code)
  ✓ AGENTS.md (generic fallback)
  ✗ .cursorrules (no .cursor/ directory found)
  ✗ copilot-instructions.md (no .github/ directory found)

  → Confirm sync targets? (yes / add more / edit)
```

```
Step 7/8: Plugin Conflicts
  adev replaces the workflows provided by Superpowers and Spec Kit.
  Running them together causes duplicate skill invocations and
  competing gateway hooks.

  Detected plugins that conflict with adev:
  ⚠ superpowers — brainstorming, planning, TDD, and code review
    overlap with /adev-brainstorm, /adev-plan, /adev-implement,
    and /adev-validate.

  Recommended: disable conflicting plugins for THIS project only.
  They stay installed globally for your other projects.

  → Disable Superpowers for this project? (yes / no, I'll manage it myself)
```

If the user says yes, create or update `.claude/settings.json` in the project:

```json
{
  "enabledPlugins": {
    "superpowers@claude-plugins-official": false
  }
}
```

If `.claude/settings.json` already exists, merge the `enabledPlugins` key without overwriting other settings.

If the user says no, warn them:

```
  ⚠ Both adev and Superpowers will be active. You may see duplicate
  skill suggestions. If this becomes noisy, run:
    /adev-init
  and select "Fix issue" to disable Superpowers later.
```

Detection logic: check for installed plugins by looking at:
- `~/.claude/settings.json` → `enabledPlugins` for globally enabled plugins
- Project `.claude/settings.json` → `enabledPlugins` for project-level overrides
- Known conflicting plugins: `superpowers@claude-plugins-official`

If no conflicting plugins are detected, skip this step entirely.

```
Step 8/8: Summary

  Ready to create:
  ✓ .context-kit/constitution.md          (87 lines)
  ✓ .context-kit/manifest.yaml            (4 sync targets)
  ✓ .context-kit/platform-context.yaml    (detected stack)
  ✓ .context-kit/orientation/architecture.md (draft)
  ✓ .context-kit/specs/product.md         (draft)
  ○ .context-kit/specs/features/          (empty, ready for charters)
  ○ .context-kit/adrs/                    (empty, ready for decisions)
  ○ .context-kit/samples/                 (empty, ready for examples)

  Will also:
  - Sync constitution → CLAUDE.md, AGENTS.md
  - Add .context-kit/hygiene/ to .gitignore
  - Commit all files

  → Create everything? (yes / go back to step N / cancel)
```

### `.context-kit/` already exists (Diagnostic Mode)

When run on a project that already has `.context-kit/`, the wizard becomes a health check:

```
adev Context Kit — Health Check

✓ Constitution        .context-kit/constitution.md (92 lines, 6/6 sections)
✓ Manifest            .context-kit/manifest.yaml (2 sync targets)
✓ Platform Context    Next.js 16, Prisma, Clerk, Vercel
✓ Product Charter     2 modules defined
⚠ Feature Charters    task-boards has charter, user-management does not
✗ ADRs                none found (3 architectural changes detected in recent git history)
✓ Orientation         architecture.md (last updated 12 days ago)
✗ Samples             empty directory
✓ Sync Status         CLAUDE.md matches constitution (synced 2 days ago)
⚠ Plugin Conflict     Superpowers is active globally but not disabled for this project

Issues found:
1. user-management module has no charter
2. No ADRs — 3 recent architectural changes could be documented
3. No golden samples — agents have no reference implementations
4. Superpowers plugin may conflict with adev workflows

→ Fix issue 1: create charter for user-management? (yes / skip)
→ Fix issue 2: draft ADRs from git history? (yes / skip)
→ Fix issue 3: I'll skip samples for now
→ Fix issue 4: disable Superpowers for this project? (yes / no)
```

This replaces the need for a separate `/adev-tour` skill. The init command IS the tour on first run, and the diagnostic on subsequent runs.

## Brownfield Mode (`--brownfield`)

Adds these steps to the interactive wizard:

**After Step 1 (Analysis):**
```
Brownfield Analysis
  I found existing context to incorporate:
  - CLAUDE.md: 47 lines of project instructions
  - AGENTS.md: 120 lines of architecture docs
  - README.md: project description and setup guide

  → Absorb these into the constitution? (yes / review first / skip)
```

If yes, extract relevant rules from existing files into the constitution draft. User reviews the merged result.

**After Step 5 (Product Charter):**
```
Reverse Chartering
  Based on your directory structure, I identified these modules:
  - src/app/api/ → API routes (12 route handlers)
  - src/components/ → UI components (34 files)
  - src/lib/auth/ → Authentication (Clerk integration)
  - prisma/ → Database schema (8 models)

  → Generate feature charter drafts for each? (yes / select which / skip)
```

**After Step 6 (Sync Targets):**
```
ADR Archaeology
  Scanning git history for architectural decisions...

  Found 5 significant changes:
  1. 2026-01-15: Added Clerk auth (replaced NextAuth)
  2. 2026-02-01: Migrated from Pages Router to App Router
  3. 2026-02-20: Added Prisma (replaced raw SQL)
  4. 2026-03-01: Added i18n (next-intl)
  5. 2026-03-10: Added Vercel Blob for file uploads

  → Generate retrospective ADR drafts? (all / select / skip)
```

All generated drafts are marked: `<!-- DRAFT: Generated by /adev-init. Review and refine. -->`

**Final brownfield step:**
```
Coverage Report
  Generating context coverage analysis...

  High churn, no charter:  src/lib/auth/ (42 changes in 30 days)
  High churn, no charter:  src/app/api/ (38 changes in 30 days)
  Low churn, no charter:   prisma/ (5 changes in 30 days)
  Chartered:               (none yet — this is a fresh setup)

  Saved to .context-kit/hygiene/coverage-report.md

  Recommendation: Start by chartering src/lib/auth/ — it changes
  most frequently and will benefit most from structured context.
```

## Dry-Run Mode (`--dry-run`)

Shows what would be created without writing anything. Runs the full analysis (tech stack detection, directory scanning, git history if brownfield) but only prints the summary:

```
/adev-init --dry-run

Would create:
  .context-kit/constitution.md          (~85 lines)
  .context-kit/manifest.yaml            (2 sync targets)
  .context-kit/platform-context.yaml    (Next.js 16, Prisma, Clerk)
  .context-kit/orientation/architecture.md
  .context-kit/specs/product.md

Would sync to:
  CLAUDE.md (new file)
  AGENTS.md (would merge with existing 120-line file)

Would modify:
  .gitignore (add .context-kit/hygiene/)

Run /adev-init to proceed.
```

## After Initialization

```
Context Kit initialized at .context-kit/

Your constitution has been synced to CLAUDE.md. Every AI agent
that works on this project will now follow your rules.

Next steps:
- Review your constitution: .context-kit/constitution.md
- Charter your first feature: /adev-brainstorm
- Or specify existing work: /adev-specify

The constitution linter hook is active — it will validate
your constitution whenever you edit it.
```
