---
name: adev:specify
description: "Author Live Specs within a Feature Charter's scope. Supports modes for new features, extraction from existing code, refactoring, diff-driven changes, and cross-cutting concerns. In OpenCode, invoke with skill({ name: 'adev:specify' })"
---

# Write a Live Spec

Author a Live Spec that defines a behavioral contract for implementation, scoped to an existing Feature Charter. The spec becomes the single source of truth for what `adev:plan` decomposes and `adev:implement` builds.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| *(positional)* | No | Feature module name or capability hint (e.g., `task-boards` or `"add drag-and-drop reordering"`) |
| `--charter <module>` | No | Explicit parent charter. Required when multiple charters exist and the positional arg is ambiguous. |
| `--title <title>` | No | Spec title. Prompted interactively if omitted. |
| `--extract` | No | Extract mode: reverse-engineer a spec from existing code. |
| `--refactor` | No | Refactor mode: current state + target state + migration path. |
| `--from-diff` | No | From-diff mode: generate a retroactive spec from a git diff or PR. |
| `--cross-cutting` | No | Cross-cutting mode: spec spans multiple charters (auth, logging, error handling, etc.). |

Modes are mutually exclusive. If none is specified, standard mode is used.

## Prerequisites

1. `.context-index/` exists. If not, tell the user to run `adev:init` skill first.
2. `.context-index/constitution.md` exists and is non-empty.
3. At least one Feature Charter exists under `.context-index/specs/features/` (except for `--cross-cutting` mode, which only needs the constitution and product charter).

If any prerequisite fails, stop and explain what is missing. Do not generate a spec without a charter anchor (cross-cutting excepted).

---

## Shared: Resolve Charter

Used by Standard, Extract, Refactor, and From-Diff modes. Cross-Cutting skips this.

1. Scan `.context-index/specs/features/*/charter.md` to find all charters.
2. If `--charter <module>` is provided, load directly (error if missing).
3. If positional arg provided, match against charter module names (ask if ambiguous).
4. If no arg and one charter exists, use it. If multiple, list and ask:

```
Found 3 Feature Charters:
  1. task-boards — Task management with drag-and-drop boards
  2. user-management — User profiles, roles, and permissions
  3. notifications — Real-time notification system

→ Which charter should this spec belong to? (number or name)
```

## Shared: Load Context

Used by all modes (Cross-Cutting loads only constitution and product charter).

Read these files and hold them in working memory:

- `.context-index/constitution.md` — for principle references and gate validation
- `.context-index/platform-context.yaml` — for technology-aware decisions
- The resolved Feature Charter — for scope boundaries and capability list
- `.context-index/specs/product.md` — for cross-module awareness
- Any existing specs in the same module directory — to avoid duplication
- `.context-index/references/**/*.md` — if the references directory exists, read external reference charters and contracts. Note external interfaces this module must comply with.

## Shared: Frontmatter

```yaml
charter: <module-name>          # omit for cross-cutting (use affects: instead)
status: draft                   # always starts as draft
milestone: <phase from charter> # standard mode only
created: <today's date YYYY-MM-DD>
# mode: extract | refactor | from-diff | cross-cutting
# extracted-from: [...]         # extract mode
# diff-source: "..."            # from-diff mode
# affects: [...]                # cross-cutting (replaces charter:)
# charter-extension: true       # if capability not in charter
# constitutional-exception: "." # if user chose explicit exception
```

**Milestone inheritance (standard mode):** Inherit from the capability's Phase in the parent charter. Tell the user and allow override.

## Shared: Summary Template

After writing any spec, output the path, mode-specific stats (see each mode), and next steps: review the spec, `adev:review-specs` skill, or write another spec.

---

## Standard Mode (default)

The primary path. Takes a Feature Charter and produces a Live Spec for one capability.

### Step 1: Resolve Charter

Use the shared Resolve Charter section above.

### Step 2: Load Context

Load context per the shared section above.

### Step 3: Identify Capability

Present the charter's Capability Map and list existing specs in the module. Ask which capability to cover:

```
Charter: task-boards
Capabilities:
  1. Create and manage boards
  2. Drag-and-drop card reordering
  3. Board sharing and permissions
  4. Card labels and filtering
  5. Board activity feed

Existing specs in this module:
  ✓ create-manage-boards.md (status: review-passed)
  ✓ board-sharing.md (status: draft)

→ Which capability should this spec cover? (number, name, or describe a new one)
```

If the user describes something not in the charter, warn them:

```
⚠ "<capability>" is not listed in the <module> charter.
  Options:
  1. Add it to the charter first (recommended — run skill({ name: "adev:brainstorm", args: { module: "<module>" } }))
  2. Proceed anyway (the spec will note it extends beyond the current charter scope)

→ Your choice?
```

If option 2, add `charter-extension: true` to frontmatter and a comment at the top of the spec noting the charter divergence.

### Step 4: Interactive Spec Authoring

Guide the user through each section. Do not dump a blank template.

**Behavioral Contract:**
Ask focused questions: what triggers this behavior, expected outcomes, failure scenarios. Write behaviors in the **When...then** format:

- **When** a user drags a card to a new position within the same column **then** the card's `position` updates and affected cards reindex.
- **When** a user drags a card to a different column **then** the card moves and both columns reindex.

Aim for 3-8 directly testable behavior statements.

**Preconditions and Postconditions:**
Derive from behavioral statements. Preconditions = what must be true before. Postconditions = what must be true after.

**Error Cases:**
Build an error case table (condition, expected behavior, status code). Ask:
```
→ Any additional error cases? I have: lacks permission → 403, column not found → 404, conflict → 409
```

**Constitution Reference:**
Select 2-4 relevant principles from the constitution and explain why each applies.

**Actionable Task Map:**
Preliminary task breakdown (not the full plan — that is `adev:plan`'s job). Table with task, description, estimated complexity.

**Acceptance Criteria:**
Concrete, checkable criteria. Every behavior maps to at least one criterion. Always include: all quality gates pass, no constitutional violations.

### Step 5: Write the Spec

1. Generate slug: lowercase, kebab-case, no special characters.
2. Fill `${ADEV_PLUGIN_ROOT}/templates/live-spec-template.md`.
3. Set frontmatter per shared section (including milestone inheritance).
4. Save to `.context-index/specs/features/<module>/<spec-slug>.md`.

### Step 5.5: Update Spec Status

After saving the spec:

1. Read the spec file you just created
2. Parse the YAML frontmatter
3. Update the `status` field to `review-pending`
4. Write the file back with the updated status

Example:
```
---
charter: task-boards
status: review-pending
milestone: v1
created: 2026-03-24
---
```

### Step 6: Summary

Output path, charter, status, counts of behaviors/error cases/tasks/acceptance criteria, and next steps.

---

## Extract Mode (`--extract`)

For brownfield codebases. Reads existing source code and produces a "snapshot spec" that captures current behavior.

### Step 1: Resolve Charter

Use the shared Resolve Charter section above.

### Step 2: Identify Code to Extract

If the user provides a module name, scan the codebase for associated files. If the user provides specific file paths, use those directly.

### Step 3: Read and Analyze Code

Read each selected file. For each, identify:

- Public interface (exports, API endpoints, component props)
- State mutations (database writes, state updates, side effects)
- Error handling (try/catch, error responses, validation)
- Dependencies (imports, external services, database queries)

### Step 4: Generate Snapshot Spec

Produce a Live Spec where:

- **Behavioral Contract** describes observed behavior. Use comment: `<!-- Extracted from existing code. Describes current behavior as of YYYY-MM-DD. -->`
- **Behaviors** are derived from code paths.
- **Error Cases** come from existing error handling code. Flag unhandled cases.
- **Coverage Gaps** section: document missing error handling, tests, or validation.
- **Constitution Reference** flags observed violations.

Add `mode: extract` and `extracted-from: [<file list>]` to frontmatter.

Save to `.context-index/specs/features/<module>/<spec-slug>.md`.

### Step 4.5: Update Spec Status

After saving the spec, update its status to `review-pending` (same as Step 5.5 in standard mode).

### Step 5: Summary

Output shared summary template with extraction stats.

---

## Cross-Cutting Mode (`--cross-cutting`)

Produces specs for concerns spanning multiple features: authentication, error handling, API versioning, etc.

### Step 1: Prerequisites

Cross-cutting specs do not require a Feature Charter. They require:

- `.context-index/constitution.md` (mandatory)
- `.context-index/specs/product.md` (recommended)

### Step 2: Identify the Concern

```
→ What cross-cutting concern do you want to spec?
  Examples: authentication flow, error handling, API versioning,
  logging/observability, rate limiting, caching strategy

→ Which modules does this concern touch? (all / list specific modules)
```

### Step 3: Author the Spec

Same process as standard mode with additions:

**Module Impact Map:**
```
| Module | Impact | Changes Required |
|--------|--------|-------------------|
| task-boards | High | Add auth checks to all task mutations |
| user-management | Medium | Expose permission API for other modules |
| notifications | Low | Read-only, only needs auth token validation |
```

### Step 4: Write the Spec

Save to `.context-index/specs/cross-cutting/<spec-slug>.md`.

---

## Constitution Validation (All Modes)

Before writing any spec, scan the constitution for conflicts:

```
⚠ Constitutional conflict detected:

  Your spec proposes direct client-side database queries.
  Constitution principle: "All database access goes through server actions."

  Options:
  1. Revise the spec to comply with the constitution
  2. Propose a constitutional amendment (creates an ADR draft)
  3. Proceed with an explicit exception (noted in spec frontmatter)

→ Your choice?
```

## Duplicate Detection (All Modes)

Before creating a spec, check existing specs in the target directory for overlap.
