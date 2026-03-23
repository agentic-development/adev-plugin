# PRD: `/adev-document` — Auto-Generated Developer Documentation

**Date:** 2026-03-22
**Author:** dpavancini
**Status:** Draft
**Version:** v0.6.0 target (depends on tree-sitter repomap v0.5.0)

## Problem

Orientation documentation in adev-plugin is currently:

1. **Buried in `.context-index/orientation/`** — a directory that is designed for agent consumption, not human browsing. Developers do not naturally look there for onboarding material.
2. **Generated once and abandoned.** `/adev-init` Step 4 produces a draft `architecture.md` from directory structure alone (no AST data, no dependency graph, no spec awareness). After that, it is never regenerated. It drifts silently.
3. **Drift is detected but not repaired.** `/adev-hygiene` Pass 5 flags "orientation is stale" but only outputs a checklist. The human must manually figure out what changed and rewrite sections.
4. **Not code-aware.** The initial draft is based on directory listing, not exports, dependencies, or symbol importance. A module with 2 files but 48 inbound references looks the same as a module with 2 files and 0 references.

Meanwhile, Devin's DeepWiki auto-generates structured wiki documentation from any repo and has processed 400,000+ repositories. This capability is their strongest onboarding differentiator.

**Research reference:** `agentic-dev-content/research/agentic-codebase-orchestration.md`

## Goals

1. Create `/adev-document`, a new skill that generates human-readable developer documentation into `docs/` (committed, browsable on GitHub).
2. Consume tree-sitter repomap output (`dependency-graph.json`, `symbol-ranks.json`) for code-aware documentation.
3. Merge generated content with existing human-written sections (never overwrite human prose without review).
4. Move orientation responsibility from `.context-index/orientation/` to `docs/`.
5. Update Constitution's Context Routing to point agents to `docs/` for architectural context.

## Non-Goals

- Replacing human-authored documentation. `/adev-document` assists, it does not replace. All generated content is marked as draft for human review.
- API reference documentation (JSDoc/TSDoc generation). Existing tools do this better.
- User-facing product documentation. This is developer/contributor documentation only.
- Rendering or hosting (no static site generator, no Docusaurus/Fumadocs setup). Just markdown files.

## Design Principles

1. **`docs/` is for humans, `.context-index/` is for agents.** Documentation that humans read (architecture overview, module guides, onboarding) belongs in `docs/`. Data that agents consume programmatically (specs, governance, hygiene reports, symbol ranks) stays in `.context-index/`.
2. **Assist, do not replace.** Generated content is always presented as a proposal. Human-written sections are preserved. The skill shows a diff-style "here is what I would add/update" and waits for approval.
3. **Code-grounded, not hallucinated.** Every claim in a generated doc must trace to a concrete artifact: a symbol in `symbol-ranks.json`, an edge in `dependency-graph.json`, an export in `repo-map.md`, or a spec in `.context-index/specs/`.
4. **Incremental updates, not full rewrites.** On subsequent runs, `/adev-document` identifies what changed since the last generation and proposes section-level updates. It does not regenerate from scratch.

## Prerequisites

- **Tree-sitter repomap (v0.5.0)** must be implemented. `/adev-document` reads `dependency-graph.json` and `symbol-ranks.json`. If these files do not exist, the skill errors: "Run /adev-repomap first. /adev-document requires the dependency graph and symbol index."
- **`docs/` directory** must exist. If it does not, the skill creates it.

## Output Structure

```
docs/
  architecture.md               # Project-level overview: module map, key relationships,
                                # tech stack, entry points, data flow
  modules/
    <module-slug>.md            # Per-module guide: purpose, key exports, dependencies,
                                # entry points, related specs, example usage
  GENERATED.md                  # Manifest of auto-generated sections (for merge tracking)
```

### `docs/architecture.md` Format

```markdown
# Architecture Overview

<!-- adev:generated — last updated 2026-03-22 from commit abc1234 -->
<!-- Human sections below are preserved across regenerations -->

## Project Summary

[One paragraph: what this project does, from constitution Identity section]

## Tech Stack

[From platform-context.yaml: framework, language, database, deployment target]

## Module Map

| Module | Purpose | Key Exports | Inbound Deps | Outbound Deps |
|--------|---------|-------------|--------------|---------------|
| auth | Authentication and authorization | AuthService, verifyToken, AuthConfig | 12 files | 3 files |
| task-boards | Task management UI and logic | TaskService, TaskBoard, TaskCard | 8 files | 5 files |
| api-layer | REST API route handlers | /api/tasks, /api/users, /api/auth | 2 files | 14 files |

## Dependency Flow

[Text description of how modules relate, which are core (high inbound) vs. leaf (high outbound)]

## Entry Points

- **Web app:** `src/app/page.tsx`
- **API:** `src/app/api/` (15 route handlers)
- **Background jobs:** `src/jobs/` (3 cron handlers)

## Key Architecture Decisions

[Links to ADRs from .context-index/adrs/]

---

<!-- adev:human — sections below are human-authored and preserved -->

## Developer Setup

[Human-written: how to clone, install, run locally]

## Deployment

[Human-written: CI/CD, environments, release process]
```

The `<!-- adev:generated -->` and `<!-- adev:human -->` markers are the merge boundary. Everything above the human marker is regenerable. Everything below is preserved verbatim.

### `docs/modules/<module-slug>.md` Format

```markdown
# Module: Task Boards

<!-- adev:generated — last updated 2026-03-22 from commit abc1234 -->

## Purpose

[From charter.md Business Intent section, if charter exists. Otherwise inferred from code.]

## Key Exports

| Symbol | Kind | File | Importance | Description |
|--------|------|------|------------|-------------|
| TaskService | class | src/services/task-service.ts:9 | High (0.072) | [From spec or inferred] |
| TaskBoard | component | src/components/TaskBoard.tsx:15 | High (0.065) | [From spec or inferred] |
| TaskFilters | interface | src/services/task-service.ts:4 | Medium (0.034) | [From spec or inferred] |

## Dependencies

**This module imports from:**
- `src/db/` — database access (db, prisma)
- `src/types/` — shared type definitions (Task, User, TaskFilters)

**These modules import from this one:**
- `src/app/api/tasks/` — API route handlers
- `src/tests/` — test files

## Related Specs

- [Charter: Task Boards](.context-index/specs/features/task-boards/charter.md)
- [Spec: Card Ordering](.context-index/specs/features/task-boards/card-ordering.md)
- [ADR 003: Task Reordering Strategy](.context-index/adrs/003-task-reordering.md)

---

<!-- adev:human -->

## Usage Notes

[Human-written: patterns, gotchas, tips]
```

### `docs/GENERATED.md` (Merge Manifest)

```markdown
# Generated Documentation Manifest

Tracks which sections of docs/ were auto-generated by /adev-document.
Used for merge conflict resolution and staleness detection.

| File | Generated Sections | Last Commit | Last Run |
|------|-------------------|-------------|----------|
| architecture.md | Summary, Tech Stack, Module Map, Dependency Flow, Entry Points, ADR Links | abc1234 | 2026-03-22 |
| modules/auth.md | Purpose, Key Exports, Dependencies, Related Specs | abc1234 | 2026-03-22 |
| modules/task-boards.md | Purpose, Key Exports, Dependencies, Related Specs | abc1234 | 2026-03-22 |
```

## Skill Flow

### First Run (No `docs/` exists)

```
1. Pre-flight: check dependency-graph.json and symbol-ranks.json exist
   → If not: ERROR "Run /adev-repomap first"

2. Read inputs:
   - .context-index/hygiene/dependency-graph.json
   - .context-index/hygiene/symbol-ranks.json
   - .context-index/hygiene/repo-map.md
   - .context-index/constitution.md (Identity, Context Routing)
   - .context-index/platform-context.yaml (tech stack)
   - .context-index/manifest.yaml (modules list)
   - .context-index/specs/features/*/charter.md (per-module context)
   - .context-index/adrs/*.md (architecture decisions)

3. Generate docs/architecture.md
   - Module map table from dependency-graph.json nodes + manifest modules
   - Dependency flow narrative from graph edges
   - Entry points from symbol-ranks.json (files with zero inbound edges)
   - ADR links from adrs/ directory

4. For each module in manifest.yaml:
   Generate docs/modules/<module-slug>.md
   - Purpose from charter.md Business Intent (or inferred from code)
   - Key exports from symbol-ranks.json filtered to module paths
   - Dependencies from dependency-graph.json edges
   - Related specs from .context-index/specs/features/<module>/

5. Write docs/GENERATED.md manifest

6. Present output to user:
   "Generated documentation in docs/:
     - docs/architecture.md (project overview)
     - docs/modules/auth.md
     - docs/modules/task-boards.md
     - docs/modules/api-layer.md

   Review and edit the generated content. Add human-written sections
   below the <!-- adev:human --> marker in each file."
```

### Subsequent Runs (docs/ exists)

```
1. Pre-flight: same as first run

2. Read docs/GENERATED.md to find last commit hash

3. Compare current dependency-graph.json commit against last run commit
   → If same: "Documentation is up to date. No changes needed."

4. Compute diff:
   - New modules (in manifest but no docs/modules/<slug>.md)
   - Removed modules (docs/modules/<slug>.md exists but not in manifest)
   - Changed modules (symbol ranks or dependency edges changed)
   - New ADRs (not linked in architecture.md)

5. For each changed file:
   - Read existing file
   - Parse: split at <!-- adev:human --> marker
   - Regenerate the adev:generated section only
   - Preserve the adev:human section verbatim
   - Show diff to user: "I would update these sections in docs/modules/auth.md:
       - Key Exports: added verifyOAuth (new export since last run)
       - Dependencies: added src/lib/oauth/ (new import)
     Accept? [Y/n/edit]"

6. On acceptance: write updated files, update GENERATED.md manifest
```

### Arguments

```
/adev-document                # Generate or update all docs
/adev-document --module auth  # Generate or update only the auth module doc
/adev-document --check        # Dry run: show what would change without writing
/adev-document --force        # Regenerate all generated sections (ignore diff)
```

## Changes to Existing Skills

### `/adev-init` (Modified)

**Current Step 4:** Generates draft `orientation/architecture.md` in `.context-index/orientation/`.

**New Step 4:**
- Skip orientation generation entirely.
- Instead, inform the user: "Run /adev-repomap then /adev-document to generate developer documentation in docs/."
- If `.context-index/orientation/` already exists from a previous version, suggest migration: "Found legacy orientation docs in .context-index/orientation/. Run /adev-document to migrate to docs/."

### `/adev-hygiene` (Modified)

**Current Pass 5:** Checks `.context-index/orientation/architecture.md` for drift.

**New Pass 5:**
- Check `docs/GENERATED.md` for last run commit.
- Compare against current HEAD.
- If stale: "Documentation is behind by N commits. Run /adev-document to update."
- Also check for missing module docs: if a module exists in manifest but has no `docs/modules/<slug>.md`, flag it.

### Constitution Template (Modified)

Update the Context Routing section in `templates/constitution-template.md`:

```markdown
## Context Routing

Before architectural changes:
- Read `docs/architecture.md`
- Read `docs/modules/<module>.md` for the affected module
- Read `platform-context.yaml`
- Check existing ADRs in the affected area
```

Replace the current reference to `.context-index/orientation/architecture.md`.

### `/adev-plan`, `/adev-debug`, `/adev-brainstorm` (Modified)

Update all references from `.context-index/orientation/architecture.md` to `docs/architecture.md`.

## Manifest Changes

Add to `manifest-template.yaml`:

```yaml
# ============================================================================
# Documentation
# Controls how /adev-document generates developer docs.
# ============================================================================

documentation:
  output_dir: docs/              # Where to write generated documentation
  architecture: true             # Generate docs/architecture.md
  module_docs: true              # Generate docs/modules/<slug>.md per module
  # Sections to include in module docs:
  sections:
    purpose: true                # From charter Business Intent
    key_exports: true            # From symbol-ranks.json
    dependencies: true           # From dependency-graph.json
    related_specs: true          # Links to charters and specs
```

## Migration Path

For projects upgrading from v0.4.x (which have `.context-index/orientation/`):

1. `/adev-document` detects `.context-index/orientation/architecture.md` exists.
2. Reads the human-written content from it.
3. Generates `docs/architecture.md` with the human content preserved under `<!-- adev:human -->`.
4. Suggests: "Migrated orientation to docs/architecture.md. You can delete .context-index/orientation/ after verifying."
5. Does NOT auto-delete the old directory.

## Testing

### Unit Tests

| Test | Validates |
|------|-----------|
| `document-first-run.test.mjs` | Generates architecture.md and module docs from fixture repomap data |
| `document-update.test.mjs` | Preserves human sections, updates generated sections on re-run |
| `document-merge.test.mjs` | Correctly splits on `<!-- adev:human -->` marker |
| `document-migration.test.mjs` | Migrates legacy `.context-index/orientation/` content |
| `document-no-repomap.test.mjs` | Errors with clear message when dependency-graph.json is missing |
| `document-check.test.mjs` | `--check` flag shows diff without writing |

### Fixture Data

Extend `tests/fixtures/sample-project/` (from tree-sitter PRD) with:
- `.context-index/specs/features/auth/charter.md` (with Business Intent section)
- `.context-index/adrs/001-session-store.md`
- Pre-generated `dependency-graph.json` and `symbol-ranks.json`
- Expected `docs/` output for comparison

## Rollout

### Phase 1: Core Skill (v0.6.0)

- Implement `/adev-document` SKILL.md
- First-run generation (architecture.md + module docs)
- `docs/GENERATED.md` manifest
- Migration from `.context-index/orientation/`
- Unit tests

### Phase 2: Update Cycle (v0.6.1)

- Incremental update mode (diff-based, preserve human sections)
- `--check`, `--module`, `--force` arguments
- Update `/adev-hygiene` to check `docs/` staleness

### Phase 3: Ecosystem Update (v0.6.2)

- Update `/adev-init` to skip orientation, point to `/adev-document`
- Update constitution template Context Routing
- Update `/adev-plan`, `/adev-debug`, `/adev-brainstorm` references
- Update manifest template with `documentation:` section
- Documentation

## Success Metrics

1. **Onboarding value:** Generated `docs/architecture.md` contains accurate module map with correct dependency counts (verified against fixture project).
2. **Human preservation:** Re-running `/adev-document` never overwrites content below the `<!-- adev:human -->` marker.
3. **Staleness detection:** `/adev-hygiene` correctly flags docs that are behind HEAD by 1+ commits.
4. **Migration safety:** Upgrading from v0.4.x preserves all human-written orientation content.
5. **Code-grounded:** Every symbol in "Key Exports" tables exists in `symbol-ranks.json`. Every dependency claim exists in `dependency-graph.json`. No hallucinated descriptions.

## Open Questions

1. **Depth of generated descriptions:** Should the skill attempt to describe what each exported symbol does (requires LLM reading the source code), or just list name/kind/file/importance? Leaning toward: list only in v0.6, add LLM descriptions in v0.7 as opt-in.
2. **Diagram generation:** Should `/adev-document` produce Mermaid dependency diagrams in the architecture overview? Mermaid renders natively on GitHub. Could be a valuable visual but adds complexity.
3. **Multi-language docs:** Should `docs/` support localization (e.g., `docs/pt/architecture.md`)? Probably not in v0.6 but worth considering for the manifest schema.
4. **Monorepo docs:** For monorepos, should there be one `docs/` at the root or `docs/` per package? Leaning toward: follow manifest modules, one `docs/` at root with modules covering all packages.
