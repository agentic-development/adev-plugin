---
name: adev-init
description: "Initialize or diagnose the .context-index/ directory. Interactive wizard that explains each layer, detects existing setup, and lets users opt in or skip per layer. Use for 'set up adev', 'initialize context', 'start a new project with adev', or 'diagnose a broken context-index'. In Codex, invoke with $adev-init"
---

# Initialize Context Index

Interactive setup wizard for the Agentic Development Framework. Walks through each context layer one at a time, explains what it does, and lets the user opt in or skip.

## Arguments

- No arguments: interactive wizard (detects greenfield vs. existing setup automatically)
- `--brownfield`: adds reverse-chartering, ADR archaeology, and coverage analysis
- `--dry-run`: shows what would be created without writing any files

## Behavior by Project State

### No `.context-index/` exists (First Run)

Walk through each layer interactively:

```
Step 1/10: Project Analysis
  Analyzing your project...

  Detected:
  - Framework: Next.js 16.1 (App Router)
  - Language: TypeScript (strict mode)
  - Database: PostgreSQL via Prisma
  - Auth: Clerk
  - Deployment: Vercel

  → Does this look right? (yes / edit)
```

```
Step 2/10: Constitution
  The constitution is the core of adev. It defines your project's
  non-negotiable principles, coding standards, and architecture
  boundaries. Every AI agent that works on your project reads
  the constitution first.

  → Ready to create your constitution? (yes / skip for now)
```

Proceed with the constitution wizard collecting:
- Project identity
- Non-negotiable principles
- Coding standards
- Architecture boundaries
- Quality gate commands
- Merge policy (pr/merge/ask)

```
Step 3/10: Platform Context
  Platform context captures your tech stack so agents make
  technology-aware decisions.

  → Save platform context? (yes / edit / skip)
```

```
Step 4/10: Orientation
  The orientation file is a human-written guide to your codebase.

  → Generate a draft? (yes / skip)
```

```
Step 5/10: Product Charter
  A product charter defines WHAT you are building at the highest level.

  → Draft a product charter from your README? (yes / skip)
```

```
Step 6/10: External References
  Does this project depend on external repos, API contracts, or shared standards?

  → yes / no (skip)
```

```
Step 7/10: Governance Policies
  Declarative governance lets you define quality gates, architectural
  boundary rules, and risk-based review policies.

  → Set up governance? (yes / skip)
```

```
Step 8/10: Sync Targets
  Your constitution will be synced to agent-specific files.

  → Confirm sync targets? (yes / add more / edit)
```

```
Step 9/10: OpenAI Codex Configuration
  For Codex, skills should be placed in:
  - Project: .agents/skills/<name>/SKILL.md
  - Global: ~/.agents/skills/<name>/SKILL.md

  → Link adev skills to .agents/skills/? (yes / skip)
```

```
Step 10/10: Summary

  Ready to create:
  ✓ .context-index/constitution.md
  ✓ .context-index/manifest.yaml
  ✓ .context-index/platform-context.yaml
  ✓ .context-index/orientation/architecture.md
  ✓ .context-index/specs/product.md

  → Create everything? (yes / cancel)
```

### `.context-index/` already exists (Diagnostic Mode)

```
adev Context Index — Health Check

✓ Constitution        .context-index/constitution.md
✓ Manifest            .context-index/manifest.yaml
✓ Platform Context    Next.js 16, Prisma, Clerk
✓ Product Charter     2 modules defined
⚠ Feature Charters    task-boards has charter, user-management does not
✗ ADRs               none found

Issues found:
1. user-management module has no charter
2. No ADRs

→ Fix issue 1? (yes / skip)
```

## Brownfield Mode (`--brownfield`)

Adds reverse-chartering and ADR archaeology:
- Absorb existing AGENTS.md, CLAUDE.md into constitution
- Generate charters from directory structure
- Draft retrospective ADRs from git history

## After Initialization

```
Context Index initialized at .context-index/

Your constitution has been synced to AGENTS.md.

Next steps:
- Review your constitution: .context-index/constitution.md
- Charter your first feature: $adev-brainstorm
- Or specify existing work: $adev-specify

The constitution linter hook is active.
OpenAI Codex skills are linked and available.
```
