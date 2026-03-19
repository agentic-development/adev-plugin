---
name: adev-specify
description: Author Live Specs within a Feature Charter's scope. Supports modes for new features, extraction from existing code, refactoring, diff-driven changes, and cross-cutting concerns.
---

# Write a Live Spec

Author a Live Spec that defines a behavioral contract for implementation, scoped to an existing Feature Charter. The spec becomes the single source of truth for what `/adev-plan` decomposes and `/adev-implement` builds.

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

Before running this skill, verify:

1. `.context-index/` exists. If not, tell the user to run `/adev-init` first.
2. `.context-index/constitution.md` exists and is non-empty.
3. At least one Feature Charter exists under `.context-index/specs/features/` (except for `--cross-cutting` mode, which only needs the constitution and product charter).

If any prerequisite fails, stop and explain what is missing. Do not generate a spec without a charter anchor (cross-cutting excepted).

## Mode Reference

| Mode | Flag | Input | Output Location | Template |
|------|------|-------|-----------------|----------|
| Standard | *(default)* | Charter capability | `.context-index/specs/features/<module>/<spec-slug>.md` | `live-spec-template.md` |
| Extract | `--extract` | Existing source code | `.context-index/specs/features/<module>/<spec-slug>.md` | `live-spec-template.md` |
| Refactor | `--refactor` | Existing code + target description | `.context-index/specs/features/<module>/<spec-slug>.md` | `refactoring-spec-template.md` |
| From-Diff | `--from-diff` | Git diff or PR | `.context-index/specs/features/<module>/<spec-slug>.md` | `live-spec-template.md` |
| Cross-Cutting | `--cross-cutting` | Cross-module concern | `.context-index/specs/cross-cutting/<spec-slug>.md` | `live-spec-template.md` |

---

## Standard Mode (default)

The primary path. Takes a Feature Charter and produces a Live Spec for one capability within that charter.

### Step 1: Resolve Charter

1. Read all Feature Charters by scanning `.context-index/specs/features/*/charter.md`.
2. If `--charter <module>` is provided, load that charter directly. Error if it does not exist.
3. If a positional argument is provided, match it against charter module names. If ambiguous, list the matches and ask the user to pick one.
4. If no argument is provided and only one charter exists, use it automatically. If multiple exist, list them and ask:

```
Found 3 Feature Charters:
  1. task-boards — Task management with drag-and-drop boards
  2. user-management — User profiles, roles, and permissions
  3. notifications — Real-time notification system

→ Which charter should this spec belong to? (number or name)
```

### Step 2: Load Context

Read these files and hold them in working memory:

- `.context-index/constitution.md` — for principle references and gate validation
- `.context-index/platform-context.yaml` — for technology-aware decisions
- The resolved Feature Charter — for scope boundaries and capability list
- `.context-index/specs/product.md` — for cross-module awareness
- Any existing specs in the same module directory — to avoid duplication

### Step 3: Identify Capability

Present the charter's Capability Map to the user:

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
⚠ "Export to CSV" is not listed in the task-boards charter.
  Options:
  1. Add it to the charter first (recommended — run /adev-brainstorm --module task-boards)
  2. Proceed anyway (the spec will note it extends beyond the current charter scope)

→ Your choice?
```

If the user chooses option 2, add a frontmatter field `charter-extension: true` and a comment at the top of the spec noting the charter divergence.

### Step 4: Interactive Spec Authoring

Gather the information needed to fill the Live Spec template. Ask focused questions. Do not dump a blank template and ask the user to fill it. Instead, guide them through each section:

**Behavioral Contract:**
```
Let's define the behavioral contract for "Drag-and-drop card reordering."

→ What triggers this behavior? (e.g., user action, API call, system event)
→ What is the expected outcome when it succeeds?
→ What are the failure scenarios? (e.g., concurrent edits, permission denied, network failure)
```

Write behaviors in the **When...then** format:
- **When** a user drags a card to a new position within the same column **then** the card's `position` field updates and all affected cards reindex.
- **When** a user drags a card to a different column **then** the card moves to the target column and both columns reindex.

Aim for 3-8 behavior statements. Each must be directly testable.

**Preconditions and Postconditions:**
Derive from the behavioral statements. Preconditions are what must be true before execution. Postconditions are what must be true after.

**Error Cases:**
Build the error case table. Each row needs: condition, expected behavior, and status/error code. Ask the user:

```
→ Any additional error cases beyond the obvious ones? I have:
  - User lacks edit permission on the board → 403 Forbidden
  - Target column does not exist → 404 Not Found
  - Concurrent edit conflict → 409 Conflict
```

**Constitution Reference:**
Scan the constitution for principles relevant to this spec. Select 2-4 principles and explain why each applies. Example:

```
Constitution principles relevant to this spec:
  - "All state mutations go through server actions" — Applies because card reordering mutates position state.
  - "Optimistic UI with server reconciliation" — Applies because drag-and-drop requires instant visual feedback.

→ Any other principles I should reference? (enter to confirm)
```

**Actionable Task Map:**
Produce a preliminary task breakdown. This is not the full implementation plan (that is `/adev-plan`'s job), but a rough map so reviewers can assess scope:

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Reorder API endpoint | Server action for position updates with conflict detection | medium |
| Drag-and-drop UI | DnD handler using the platform's drag library | medium |
| Reindex logic | Batch position recalculation on column change | small |
| Optimistic update | Client-side state update with rollback on failure | small |

**Acceptance Criteria:**
Generate concrete, checkable criteria. Every behavior statement must map to at least one acceptance criterion. Always include:
- All quality gates pass (tests, lint, typecheck)
- No constitutional violations introduced

### Step 5: Write the Spec

1. Generate the spec slug from the title: lowercase, kebab-case, no special characters. Example: `drag-and-drop-reordering`.
2. Fill the template at `${CLAUDE_PLUGIN_ROOT}/templates/live-spec-template.md` with all gathered content.
3. Set frontmatter:
   ```yaml
   charter: <module-name>
   status: draft
   created: <today's date YYYY-MM-DD>
   ```
4. Save to `.context-index/specs/features/<module>/<spec-slug>.md`.

### Step 6: Summary

```
Live Spec created:
  .context-index/specs/features/task-boards/drag-and-drop-reordering.md

  Charter: task-boards
  Status: draft
  Behaviors: 5
  Error cases: 3
  Tasks: 4
  Acceptance criteria: 7

Next steps:
  - Review the spec: read .context-index/specs/features/task-boards/drag-and-drop-reordering.md
  - Submit for architecture review: /adev-review-specs
  - Or write another spec: /adev-specify task-boards
```

---

## Extract Mode (`--extract`)

For brownfield codebases. Reads existing source code and produces a "snapshot spec" that captures current behavior. This documents what IS, not what SHOULD BE.

### Step 1: Resolve Charter

Same as standard mode. The extract spec belongs to a charter just like any other spec.

### Step 2: Identify Code to Extract

If the user provides a module name, scan the codebase for files associated with that module. Use the charter's file references, directory conventions, and `platform-context.yaml` to locate relevant code.

If the user provides specific file paths, use those directly.

```
Analyzing module: user-management

Found relevant files:
  src/app/api/users/route.ts          (API routes, 142 lines)
  src/lib/auth/permissions.ts          (Permission checks, 89 lines)
  src/components/user-profile.tsx      (Profile UI, 201 lines)
  prisma/schema.prisma                 (User model, lines 12-45)
  src/lib/auth/session.ts              (Session management, 67 lines)

→ Extract a spec from all of these, or select specific files? (all / select)
```

### Step 3: Read and Analyze Code

Read each selected file. For each, identify:
- Public interface (exports, API endpoints, component props)
- State mutations (database writes, state updates, side effects)
- Error handling (try/catch, error responses, validation)
- Dependencies (imports, external services, database queries)

### Step 4: Generate Snapshot Spec

Produce a Live Spec where:

- **Behavioral Contract** describes observed behavior, not intended behavior. Use past tense framing in comments: `<!-- Extracted from existing code. Describes current behavior as of YYYY-MM-DD. -->`
- **Behaviors** are derived from code paths, not user stories. Each public function or API endpoint becomes one or more behavior statements.
- **Error Cases** come from existing error handling code. Flag any unhandled cases:
  ```
  | Missing auth token | Returns 401 | 401 |
  | Invalid user ID | ⚠ UNHANDLED — throws raw Prisma error | 500 |
  ```
- **Actionable Task Map** is empty for extract specs (the code already exists). Replace with a **Coverage Gaps** section:
  ```
  ## Coverage Gaps
  <!-- Issues discovered during extraction. These may become future specs. -->
  - No rate limiting on user creation endpoint
  - Permission checks bypass for admin role is implicit, not tested
  - Profile image upload has no size validation
  ```
- **Constitution Reference** flags any observed violations:
  ```
  - **Principle:** "All database queries use parameterized statements" — ✓ Compliant
  - **Principle:** "Error responses use standard error envelope" — ⚠ VIOLATION: /api/users/[id] returns raw error strings
  ```

Add to frontmatter:
```yaml
charter: <module-name>
status: draft
mode: extract
created: <today's date>
extracted-from:
  - src/app/api/users/route.ts
  - src/lib/auth/permissions.ts
```

Save to `.context-index/specs/features/<module>/<spec-slug>.md`.

### Step 5: Summary

```
Extract Spec created:
  .context-index/specs/features/user-management/user-api-snapshot.md

  Extracted from: 5 files (499 lines analyzed)
  Behaviors documented: 8
  Error cases: 5 (1 unhandled)
  Coverage gaps: 3
  Constitutional violations: 1

  This spec captures current behavior. It does NOT prescribe changes.
  To plan improvements, use one of:
  - /adev-specify --refactor user-management (for structural changes)
  - /adev-specify user-management (for new capabilities)
```

---

## Refactor Mode (`--refactor`)

Produces a refactoring spec with current state analysis, target state definition, a step-by-step migration path, and invariants that must hold throughout.

### Step 1: Resolve Charter

Same as standard mode.

### Step 2: Identify Refactoring Scope

Ask the user what they want to refactor and why:

```
→ What code do you want to refactor? (module, files, or describe the area)
→ What is the problem with the current code? (performance, complexity, maintainability, etc.)
→ What should the code look like after refactoring? (describe the target state)
```

### Step 3: Analyze Current State

Read the code identified in Step 2. Build the Current State section:

- **Structure table:** file, role, line count, notes (complexity, issues)
- **Problems:** specific, measurable issues. Not "the code is messy" but "the `processOrder` function is 340 lines with cyclomatic complexity of 28, handling 4 unrelated concerns."
- **Dependencies:** what other code imports from, extends, or relies on the code being refactored. These are migration constraints.

If an extract spec already exists for this module, load it as the starting point instead of re-analyzing from scratch.

### Step 4: Define Target State

Based on the user's description and your analysis, define:

- **Structure table:** target file layout with roles
- **Improvements:** how each problem from Current State is resolved

Validate the target state against the constitution. If the refactoring would violate a principle, flag it:

```
⚠ Your target state introduces a direct database call from a UI component.
  This violates: "Database access only through server actions or API routes."

→ Revise the target state, or note this as a constitutional exception?
```

### Step 5: Build Migration Path

This is the critical section. Each migration step must:

1. Be independently deployable (all tests pass after each step)
2. Have a clear verification criteria
3. Include risk assessment
4. Follow a safe ordering (extract before modify, tests before refactor)

Use the refactoring spec template at `${CLAUDE_PLUGIN_ROOT}/templates/refactoring-spec-template.md`.

Guide the user through the path:

```
Proposed migration path (4 steps):

  Step 1: Extract shared validation logic
    Move validation from processOrder into validators/order-validators.ts.
    Risk: Low — pure extraction, no behavior change.
    Verify: All existing order tests pass.

  Step 2: Split processOrder into pipeline stages
    Break the 340-line function into: validate → enrich → persist → notify.
    Risk: Medium — behavior must remain identical.
    Verify: Existing tests pass + new unit tests for each stage.

  Step 3: Add integration test for the full pipeline
    Cover the end-to-end flow before touching the entry points.
    Risk: Low — adding tests only.
    Verify: New integration test passes.

  Step 4: Update entry points to use the pipeline
    Replace direct processOrder calls with the pipeline.
    Risk: Medium — all callers must be updated.
    Verify: All tests pass, no remaining references to old function.

→ Does this migration path look right? (yes / reorder / add step / remove step)
```

### Step 6: Define Invariants

Invariants are properties that must remain true at every step of the migration. Always include:

- All existing tests continue to pass at every step
- Public API contracts do not change (unless the spec explicitly permits it)
- No data loss or corruption during migration

Ask the user for domain-specific invariants:

```
→ Any additional invariants? For example:
  - "Response times must stay under 200ms"
  - "The audit log format must not change"
  - "Backward compatibility with v2 API clients"
```

### Step 7: Write Behavioral Contract

Even for refactoring, define the target behavior. The behavioral contract describes what the system does AFTER the refactoring is complete. This gives `/adev-validate` something to verify against.

### Step 8: Write the Spec

1. Fill the template at `${CLAUDE_PLUGIN_ROOT}/templates/refactoring-spec-template.md`.
2. Set frontmatter:
   ```yaml
   charter: <module-name>
   status: draft
   mode: refactor
   created: <today's date>
   ```
3. Save to `.context-index/specs/features/<module>/<spec-slug>.md`.

### Step 9: Summary

```
Refactoring Spec created:
  .context-index/specs/features/orders/refactor-process-order.md

  Current state: 5 files, 3 problems identified
  Target state: 8 files (3 new, 2 modified, 3 unchanged)
  Migration steps: 4
  Invariants: 5
  Behaviors: 4
  Acceptance criteria: 9

Next steps:
  - Review the migration path carefully — this is the highest-risk section
  - Submit for architecture review: /adev-review-specs
```

---

## From-Diff Mode (`--from-diff`)

Generates a retroactive Live Spec from a git diff or PR. Useful for documenting work done before adev was adopted, or for catching up on hotfixes that skipped the spec phase.

### Step 1: Identify the Diff

Determine the source of the diff:

1. If no argument is provided, use the current staged changes: `git diff --cached`. If nothing is staged, use the working tree diff: `git diff`.
2. If a commit range is provided (e.g., `HEAD~3..HEAD`), use `git diff <range>`.
3. If a branch name is provided, diff against the main branch: `git diff main..<branch>`.
4. If a PR number is provided, fetch the PR diff.

```
Analyzing diff...

Changes:
  Modified: src/app/api/tasks/route.ts (+45, -12)
  Created:  src/lib/tasks/priority-engine.ts (+89)
  Modified: prisma/schema.prisma (+8)
  Modified: src/components/task-card.tsx (+23, -5)

Total: 4 files, 165 additions, 17 deletions

→ Generate a retroactive spec for these changes? (yes / narrow scope / cancel)
```

### Step 2: Resolve Charter

Analyze the changed files to determine which module they belong to. Match against existing charters. If the changes span multiple modules, ask the user which charter to associate:

```
These changes touch 2 modules:
  - task-boards (3 files)
  - notifications (1 file)

→ Create one spec under task-boards? Or separate specs per module?
```

### Step 3: Analyze the Diff

Read the full diff content. For each changed file, identify:
- What behavior was added (new functions, new endpoints, new UI elements)
- What behavior was modified (changed logic, updated validation, altered responses)
- What behavior was removed (deleted functions, removed endpoints)

### Step 4: Generate Retroactive Spec

Produce a Live Spec where:

- **Behavioral Contract** describes the behavior as it exists after the diff is applied.
- **Behaviors** map to the changes in the diff. Each significant code change becomes a behavior statement.
- **Error Cases** are extracted from new or modified error handling in the diff.
- **Actionable Task Map** is replaced with a **Changes Summary** section:
  ```
  ## Changes Summary
  <!-- Retroactive documentation of changes already implemented. -->

  | File | Change Type | Description |
  |------|------------|-------------|
  | src/lib/tasks/priority-engine.ts | Created | New priority scoring algorithm |
  | src/app/api/tasks/route.ts | Modified | Added priority field to task creation |
  | prisma/schema.prisma | Modified | Added priority column to Task model |
  | src/components/task-card.tsx | Modified | Display priority badge on cards |
  ```
- **Acceptance Criteria** use checked boxes for behaviors that already exist in the diff, unchecked for anything that appears missing:
  ```
  - [x] Priority field accepted on task creation
  - [x] Priority badge displays on task cards
  - [ ] Priority validation (no validation found in diff — may be missing)
  - [ ] Test coverage for priority engine (no tests found in diff)
  ```

Add to frontmatter:
```yaml
charter: <module-name>
status: draft
mode: from-diff
created: <today's date>
diff-source: <commit range, branch name, or "working tree">
```

Save to `.context-index/specs/features/<module>/<spec-slug>.md`.

### Step 5: Summary

```
Retroactive Spec created:
  .context-index/specs/features/task-boards/add-priority-scoring.md

  Diff source: HEAD~3..HEAD
  Files analyzed: 4
  Behaviors documented: 4
  Gaps identified: 2 (missing validation, missing tests)

  This spec documents existing changes. Review the gaps — they may
  need follow-up specs or immediate fixes.

Next steps:
  - Address gaps: write tests, add validation
  - Submit for review: /adev-review-specs (validates the spec, not the code)
```

---

## Cross-Cutting Mode (`--cross-cutting`)

Produces specs for concerns that span multiple features: authentication flows, error handling patterns, API versioning, logging standards, etc.

### Step 1: Prerequisites

Cross-cutting specs do not require a Feature Charter. They do require:
- `.context-index/constitution.md` (mandatory)
- `.context-index/specs/product.md` (recommended, for module awareness)

### Step 2: Identify the Concern

```
→ What cross-cutting concern do you want to spec?
  Examples: authentication flow, error handling, API versioning,
  logging/observability, rate limiting, caching strategy

→ Which modules does this concern touch? (all / list specific modules)
```

### Step 3: Load Affected Charters

If specific modules are named, load their charters. Identify any existing references to the concern within those charters.

### Step 4: Interactive Spec Authoring

Same process as standard mode (behavioral contract, constitution reference, task map, acceptance criteria), with these additions:

**Module Impact Map:**
```
## Module Impact

| Module | Impact | Changes Required |
|--------|--------|-----------------|
| task-boards | High | Add auth checks to all task mutations |
| user-management | Medium | Expose permission API for other modules |
| notifications | Low | Read-only, only needs auth token validation |
```

**Integration Points:**
```
## Integration Points

<!-- How this cross-cutting concern connects to each affected module.
     Each integration point needs its own test. -->

1. **task-boards ↔ auth:** Task mutations call `checkPermission(userId, boardId, 'edit')` before writes.
2. **notifications ↔ auth:** Notification reads validate session token via middleware.
3. **user-management ↔ auth:** Canonical permission definitions live here. Other modules import.
```

### Step 5: Write the Spec

1. Fill the template at `${CLAUDE_PLUGIN_ROOT}/templates/live-spec-template.md`.
2. Add the Module Impact and Integration Points sections after the standard template sections.
3. Set frontmatter:
   ```yaml
   status: draft
   mode: cross-cutting
   created: <today's date>
   affects:
     - task-boards
     - user-management
     - notifications
   ```
4. Save to `.context-index/specs/cross-cutting/<spec-slug>.md`.

Note: cross-cutting specs have no `charter` field in frontmatter. They use `affects` instead to list the modules they touch.

### Step 6: Summary

```
Cross-Cutting Spec created:
  .context-index/specs/cross-cutting/auth-flow.md

  Affects: 3 modules
  Behaviors: 6
  Integration points: 3
  Acceptance criteria: 10

Next steps:
  - Review the module impact with each module's maintainer
  - Submit for review: /adev-review-specs
  - Plan implementation: /adev-plan --spec .context-index/specs/cross-cutting/auth-flow.md
```

---

## Constitution Validation (All Modes)

Before writing any spec, scan the constitution for conflicts:

1. Read `.context-index/constitution.md`.
2. Check that the proposed spec does not contradict any principle.
3. If a conflict is found, present it to the user:

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

If the user chooses option 2, create an ADR draft at `.context-index/adrs/NNNN-<title>.md` and note the pending ADR in the spec. If option 3, add `constitutional-exception: "<principle text>"` to the spec frontmatter.

## Duplicate Detection (All Modes)

Before creating a spec, check existing specs in the target directory:

1. Read all `.md` files in the target directory.
2. Compare the proposed spec title and behavioral contract against existing specs.
3. If a potential duplicate is found:

```
⚠ Possible duplicate:

  Existing spec: drag-and-drop-reordering.md (status: draft)
  Your new spec: card-position-management.md

  The behavioral contracts overlap significantly.

  Options:
  1. Extend the existing spec instead
  2. Create a new spec anyway (different scope)
  3. Cancel

→ Your choice?
```

## Output Conventions

- **Slug format:** lowercase kebab-case, no special characters. Derived from the spec title. Example: "Add drag-and-drop reordering" becomes `add-drag-and-drop-reordering`.
- **Date format:** YYYY-MM-DD in all frontmatter fields.
- **Status:** always starts as `draft`. Only `/adev-review-specs` can advance it.
- **Template resolution:** Templates are resolved from `${CLAUDE_PLUGIN_ROOT}/templates/`. If a template is missing, warn the user and generate the spec structure inline.
