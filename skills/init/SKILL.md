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

## Behavior by Project State

### No `.context-index/` exists (First Run)

This IS the onboarding experience. Walk through each layer interactively:

```
Step 1/10: Project Analysis
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
Step 2/10: Constitution
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
- Merge policy:

```
  Your merge policy controls whether agents can merge to main
  or must open pull requests.

  → Merge policy: pr (recommended) / merge / ask
```

Seed the `completion` section in the generated manifest with the user's answer. Default to `pr`.

Generate `constitution.md` from answers using the template at `${CLAUDE_PLUGIN_ROOT}/templates/constitution-template.md`.

```
Step 3/10: Platform Context
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

After saving the stack, prompt for model tiers:

```
  Model tiers let skills pick the right model for each task.
  Defaults (from model-routing spec):

    fast:      claude-haiku-4-5-20251001  # diffs, pattern matching, gaming detection
    capable:   claude-sonnet-4-6          # code generation, test authoring
    reasoning: claude-opus-4-6            # architecture review, cross-cutting analysis

  → Accept defaults / enter custom model IDs / skip
```

- **Accept defaults:** write the three keys with the hardcoded default values shown above.
- **Enter custom model IDs:** prompt for each tier value individually; accept empty to keep the default.
- **Skip:** write the three keys with blank values (skills will log a one-time advisory on first dispatch).

Write the `model_tiers` section to `platform-context.yaml` immediately after the stack fields, with inline comments matching the tier descriptions above.

```
Step 4/10: Orientation
  The orientation file is a human-written guide to your codebase.
  It tells agents where to find things: which directory handles
  auth, where the API routes live, how the modules connect.

  I can draft one from your directory structure. You should
  review and refine it since you know the codebase best.

  → Generate a draft? (yes / skip)
```

If yes, analyze directory structure, identify key modules, produce a brief `orientation/architecture.md` (3-5 paragraphs describing the codebase layout and module relationships).

```
Step 5/10: Product Charter
  A product charter defines WHAT you are building at the highest
  level: vision, module map, cross-cutting concerns, and quality
  attributes. Feature charters break this down per module.

  → Draft a product charter from your README? (yes / skip / I'll write one later)
```

```
Step 6/10: External References

  Does this project depend on external repos, API contracts,
  or shared standards? (e.g., company coding standards, OpenAPI specs,
  shared design tokens)

  → yes / no (skip)
```

If yes:
- Prompt for each reference: slug, source URL/repo, path, refresh interval
- Add entries to `external_contexts` in manifest
- Create `.context-index/references/` directory
- Show summary of configured references

If no: skip, most projects start without this.

```
Step 7/10: Governance Policies

  Declarative governance lets you define quality gates, architectural
  boundary rules, and risk-based review policies as YAML files. Skills
  enforce these automatically during planning, implementation, and
  validation.

  Without governance files, adev uses the quality gate commands from
  your constitution and requires review for all specs.

  → Set up governance? (yes / skip)
```

If yes:
- Create `.context-index/governance/` and `.context-index/governance/overrides/`
- Generate `gates.yaml` from template, seeding gate commands from the quality gate values collected in Step 2 (Constitution wizard)
- Copy `boundaries.yaml` from template (empty rules, commented examples)
- Copy `risk-policies.yaml` from template (sensible defaults)

If no: skip. Governance/ is optional.

**Legacy gate migration (brownfield/existing projects):**

After the governance prompt, check for legacy gate definitions:
- Check if `.context-index/manifest.yaml` exists and contains a `gates:` section
- Check if `.context-index/governance/gates.yaml` already exists

If `gates:` exists in `manifest.yaml` AND `governance/gates.yaml` does NOT exist, print a migration notice:

```
  ⚠ Legacy gates found in manifest.yaml. To adopt the unified gates system,
    move your gate definitions to governance/gates.yaml.

  → Scaffold governance/gates.yaml from template now? (yes / skip)
```

If the user says yes, create `.context-index/governance/` (if not present) and generate `governance/gates.yaml` from template. The agent should note that init no longer generates a `gates:` section in `manifest.yaml` — the manifest template handles gate configuration for new projects via `governance/gates.yaml`.

If the user says skip, leave `manifest.yaml` unchanged and note: "You can migrate later by running `/adev:init` again."

```
Step 8/10: Sync Targets
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
Step 9/10: Plugin Conflicts
  adev replaces the workflows provided by Superpowers and Spec Kit.
  Running them together causes duplicate skill invocations and
  competing gateway hooks.

  Detected plugins that conflict with adev:
  ⚠ superpowers — brainstorming, planning, TDD, and code review
    overlap with /adev:brainstorm, /adev:plan, /adev:implement,
    and /adev:validate.

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
    /adev:init
  and select "Fix issue" to disable Superpowers later.
```

Detection logic: check for installed plugins by looking at:
- `~/.claude/settings.json` → `enabledPlugins` for globally enabled plugins
- Project `.claude/settings.json` → `enabledPlugins` for project-level overrides
- Known conflicting plugins: `superpowers@claude-plugins-official`

If no conflicting plugins are detected, skip this step entirely.

```
Step 10/10: Summary

  Ready to create:
  ✓ .context-index/constitution.md          (87 lines)
  ✓ .context-index/manifest.yaml            (4 sync targets)
  ✓ .context-index/platform-context.yaml    (detected stack)
  ✓ .context-index/orientation/architecture.md (draft)
  ✓ .context-index/specs/product.md         (draft)
  ○ .context-index/specs/features/          (empty, ready for charters)
  ○ .context-index/adrs/                    (empty, ready for decisions)
  ○ .context-index/references/              (external contexts, if configured)
  ○ .context-index/governance/              (gates, boundaries, risk policies, if configured)
  ○ .context-index/samples/                 (empty, ready for examples)

  Will also:
  - Sync constitution → CLAUDE.md, AGENTS.md
  - Add .context-index/hygiene/ to .gitignore
  - Commit all files

  → Create everything? (yes / go back to step N / cancel)
```

## Workspace Mode (`--workspace`)

Use this mode at a monorepo or multi-repo root to create a workspace that aggregates child repos under shared governance.

### Guard: skip if already initialized

Before doing anything, check whether `adev-workspace.yaml` already exists in the current directory. If it does:

```
adev-workspace.yaml already exists. Run /adev:init to diagnose individual repos,
or edit adev-workspace.yaml directly to add/remove repos.
```

Exit without writing any files.

### Step W1: Scaffold workspace files

Scaffold `adev-workspace.yaml` from the workspace template at `${CLAUDE_PLUGIN_ROOT}/templates/workspace-template/adev-workspace.yaml`.

Also create a workspace `.context-index/` directory with a minimal `manifest.yaml` scoped to the workspace root (no constitution sync targets — workspace-level CLAUDE.md is out of scope and will not be created).

```
Workspace initialized:
  ✓ adev-workspace.yaml                   (from workspace-template)
  ✓ .context-index/manifest.yaml          (workspace scope)
```

No workspace-level CLAUDE.md is created. Each child repo manages its own agent files independently.

### Step W2: Auto-discover child repos

Scan immediate subdirectories (depth 1) for `.context-index/manifest.yaml`. Present discovered repos to the user:

```
Auto-discover child repos

  Found repos with .context-index/:
  ✓ ./api          (.context-index/manifest.yaml — Next.js API)
  ✓ ./web          (.context-index/manifest.yaml — React app)
  ✓ ./infra        (.context-index/manifest.yaml — Terraform)
  ? ./scripts      (no .context-index/ found)

  → Register discovered repos? (yes / select / skip)
```

- **yes:** register all discovered repos in `adev-workspace.yaml` under the `repos:` key.
- **select:** prompt for each repo individually — register or skip.
- **skip:** leave `repos:` empty; the user can add entries manually.

For each registered repo, write an entry:

```yaml
repos:
  - path: ./api
    name: api
  - path: ./web
    name: web
  - path: ./infra
    name: infra
```

### `.context-index/` already exists (Diagnostic Mode)

When run on a project that already has `.context-index/`, the wizard becomes a health check:

```
adev Context Index — Health Check

✓ Constitution        .context-index/constitution.md (92 lines, 6/6 sections)
✓ Manifest            .context-index/manifest.yaml (2 sync targets)
✓ Platform Context    Next.js 16, Prisma, Clerk, Vercel
✓ Product Charter     2 modules defined
⚠ Feature Charters    task-boards has charter, user-management does not
✗ ADRs                none found (3 architectural changes detected in recent git history)
✓ Orientation         architecture.md (last updated 12 days ago)
✗ Samples             empty directory
✓ External References references/ matches manifest (2 configured, 2 present)
✓ Governance          gates.yaml, boundaries.yaml, risk-policies.yaml configured
✓ Sync Status         CLAUDE.md matches constitution (synced 2 days ago)
⚠ Plugin Conflict     Superpowers is active globally but not disabled for this project
✗ Task Management     no tasks: section in manifest.yaml

Issues found:
1. user-management module has no charter
2. No ADRs — 3 recent architectural changes could be documented
3. No golden samples — agents have no reference implementations
4. Superpowers plugin may conflict with adev workflows
5. Task management not configured — /adev:plan and /adev:implement
   cannot track issues without tasks.backend in manifest.yaml

→ Fix issue 1: create charter for user-management? (yes / skip)
→ Fix issue 2: draft ADRs from git history? (yes / skip)
→ Fix issue 3: I'll skip samples for now
→ Fix issue 4: disable Superpowers for this project? (yes / no)
→ Fix issue 5: enable task management? (file / beads / skip)
```

**Fix issue 5 behavior (task management):**

Detect by checking whether `manifest.yaml` contains a `tasks:` section with a `backend` key.

- **If `tasks:` section is missing:** flag as issue and prompt.
- **If `tasks:` section exists:** show `✓ Task Management` with the configured backend and skip.

When the user selects a backend:
- **file:** Add `tasks:\n  backend: file` to `manifest.yaml`. Report: "Task management enabled (file backend). Issues will be tracked in `.context-index/tasks/tasks.md`."
- **beads:** Check if `br` is on PATH. If yes, add `tasks:\n  backend: beads`. If no, warn: "`br` not found. Install beads_rust first, or use `file` backend." and re-prompt.
- **skip:** Leave manifest unchanged. Note: "/adev:plan and /adev:implement will skip issue tracking."

After enabling, suggest: "Run `/adev:sync` to update CLAUDE.md with task management instructions."

This replaces the need for a separate `/adev:tour` skill. The init command IS the tour on first run, and the diagnostic on subsequent runs.

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

All generated drafts are marked: `<!-- DRAFT: Generated by /adev:init. Review and refine. -->`

**Final brownfield step:**
```
Coverage Report
  Generating context coverage analysis...

  High churn, no charter:  src/lib/auth/ (42 changes in 30 days)
  High churn, no charter:  src/app/api/ (38 changes in 30 days)
  Low churn, no charter:   prisma/ (5 changes in 30 days)
  Chartered:               (none yet — this is a fresh setup)

  Saved to .context-index/hygiene/coverage-report.md

  Recommendation: Start by chartering src/lib/auth/ — it changes
  most frequently and will benefit most from structured context.
```

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
