---
name: adev:specify
description: "Author Live Specs within a Feature Charter's scope. Supports modes for new features, extraction from existing code, refactoring, diff-driven changes, and cross-cutting concerns. Use when the user says 'write a spec', 'define the behavior', 'create a contract', 'specify the feature', or needs to formalize requirements into a behavioral specification before planning. In Codex, invoke with $adev:specify"
---

# Write a Live Spec

Author a Live Spec that defines a behavioral contract for implementation, scoped to an existing Feature Charter. The spec becomes the single source of truth for what `/adev:plan` decomposes and `/adev:implement` builds.

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

1. `.context-index/` exists. If not, tell the user to run `/adev:init` first.
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

## Shared: Workspace-Mode Detection

Before resolving charters, detect workspace context:

1. Call `detectWorkspace(cwd)`. This returns `{ root, config, currentRepoSlug }` or `null`.
   - `currentRepoSlug` is the `slug` field of the registered repo containing `cwd`, from the `detectWorkspace()` return value. It is `null` when `cwd` is the workspace root itself (not inside any registered repo).

2. **If `detectWorkspace()` returns `null`:** No workspace. Proceed with existing single-repo flow unchanged. No workspace-related prompts or frontmatter appear.

3. **If `detectWorkspace()` returns non-null AND `currentRepoSlug !== null`:** Inside a registered repo. Proceed with existing single-repo flow unchanged. The spec is written to the repo's own `.context-index/`. No `target-repo:` prompt appears.

4. **If `detectWorkspace()` returns non-null AND `currentRepoSlug === null`:** At the workspace root. Enter **workspace mode**:
   - Resolve charters from the workspace `.context-index/specs/features/` directory (not from any registered repo).
   - If the workspace `.context-index/` does not exist, suggest: "No workspace context directory found. Run `/adev:init --workspace` to set up workspace-level context." and stop.
   - Specs will be written to the workspace `.context-index/`, not to any registered repo.
   - Continue to "Shared: Load Context" with workspace paths.

### Workspace Mode: target-repo Prompt

After the user selects a capability (Step 3) in workspace mode, prompt for the implementation target:

```
This is a workspace-level spec. Which repo owns the implementation?
Registered repos: <list of repo slugs from adev-workspace.yaml config.repos>
→ target-repo: (slug or "workspace" if no single repo owns it)
```

**Validation:**

1. If the user enters `"workspace"` — accept as-is. This is a reserved token for specs that span repos without a single owner. No slug validation is performed.
2. If the user enters a string matching a registered repo slug — accept. Validate the slug with `validateModuleName()` from `lib/workspace.mjs` to ensure it matches `[a-zA-Z0-9_-]+`.
3. If the user enters an unknown value — reject and re-prompt:
   ```
   Unknown repo slug '<input>'. Available repos: <comma-separated slug list>.
   → target-repo: (try again)
   ```
4. If the value contains characters outside `[a-zA-Z0-9_-]` and is not `"workspace"` — reject:
   ```
   Invalid repo slug: must match [a-zA-Z0-9_-]+
   → target-repo: (try again)
   ```

Re-prompt until a valid value is given.

**Note:** Error codes in the Error Cases table (`INVALID_TARGET_REPO`, `INVALID_MODULE_NAME`, etc.) are for human and agent reference only — they are not emitted programmatically since this is a markdown skill.

### Workspace Mode: Reference Context and Isolation

In workspace mode, load sibling repo context via `resolveWorkspaceContext()` for reference:

- Use `resolveWorkspaceContext(workspaceRoot, null).siblingRepos[]` to get sibling repo `.context-index/` paths.
- These paths are available for reference (e.g., checking if a spec name conflicts with an existing spec in a sibling repo) but the skill never writes to any registered repo's `.context-index/`.

**Isolation invariant:** The skill never writes to any registered repo's `.context-index/`. All workspace-mode output goes to the workspace `.context-index/` only. This is a charter-level invariant (multi-repo-workspace charter, Quality Attributes: Isolation).

## Shared: Load Context

Used by all modes (Cross-Cutting loads only constitution and product charter).

- `.context-index/constitution.md` — for principle references and gate validation
- `.context-index/platform-context.yaml` — for technology-aware decisions
- The resolved Feature Charter — for scope boundaries and capability list
- `.context-index/specs/product.md` — for cross-module awareness
- Any existing specs in the same module directory — to avoid duplication
- `.context-index/references/**/*.md` — if the references directory exists, read external reference charters and contracts. Note external interfaces this module must comply with.

**Heuristics:** Load module-scoped heuristics for the charter module.
Derive the module slug from the resolved Feature Charter's module name (the `charter:` field or directory name).
**Plugin root resolution:** Derive the plugin root from this skill file's base directory by stripping the `skills/<name>/` suffix. Replace `<ADEV_ROOT>` with the resolved path.
Run inline Node.js:
```javascript
const { retrieveHeuristics, renderHeuristic } = await import('<ADEV_ROOT>/lib/heuristics.mjs');
const entries = await retrieveHeuristics(projectRoot, charterModule, { tier: 'summary' });
const rendered = entries.map(renderHeuristic).join('\n\n');
```
If the call fails or returns empty, proceed without heuristics — non-blocking.
When heuristics are present, include them in the working context alongside the charter and existing specs.
Prepend: "The following heuristics are lessons learned from past work in this module. Use them as guidance, not as hard rules."

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
# target-repo: <slug>            # workspace mode only — which repo owns the implementation
# charter-extension: true       # if capability not in charter
# constitutional-exception: "." # if user chose explicit exception
```

**Milestone inheritance (standard mode):** Inherit from the capability's Phase in the parent charter. Tell the user and allow override:
```
→ Keep milestone "v1", or override? (enter to confirm / type new value)
```

## Shared: Summary Template

After writing any spec, output the path, mode-specific stats (see each mode), and next steps: review the spec, `/adev:review-specs`, or write another spec.

---

## Standard Mode (default)

The primary path. Takes a Feature Charter and produces a Live Spec for one capability.

### Step 1: Resolve Charter

Use the shared Resolve Charter section above.

### Step 2: Load Context

Load context per the shared section above.

### Step 2.5: Charter Status Gate

Before creating any spec, check the parent charter's `status` frontmatter field:
- If `status: closed`, **block** with error:
  ```
  CHARTER_CLOSED: The charter for <module> has status "closed".
  A closed charter does not accept new specs. To reopen it, run /adev:brainstorm --module <module>.
  ```
- If the charter has no `status` field or any other status value, proceed normally.

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
  1. Add it to the charter first (recommended — run /adev:brainstorm --module <module>)
  2. Proceed anyway (the spec will note it extends beyond the current charter scope)

→ Your choice?
```

If option 2, add `charter-extension: true` to frontmatter and a comment at the top of the spec noting the charter divergence.

### Step 4: Interactive Spec Authoring

Guide the user through each section. Do not dump a blank template. **Persona adaptation:** Frame questions at the level appropriate for the active persona. Product persona: ask about user outcomes and business rules, not implementation details. Developer/Architect: include technical specifics.

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
Select 2-4 relevant principles from the constitution and explain why each applies:
```
→ Any other principles I should reference? (enter to confirm)
```

**Actionable Task Map:**
Preliminary task breakdown (not the full plan — that is `/adev:plan`'s job). Table with task, description, estimated complexity.

**Acceptance Criteria:**
Concrete, checkable criteria. Every behavior maps to at least one criterion. Always include: all quality gates pass, no constitutional violations.

### Step 4.5: Infrastructure Requirements Prompt

Before writing the spec, check whether this capability touches any external systems. Ask:

```
→ Does this capability interact with any external systems (cloud APIs, databases, message queues, third-party HTTP services)?
  Examples: AWS S3, Postgres, Stripe API, SQS, Redis, BigQuery
```

**If yes:**
```
→ Which external systems? (list each, e.g. "AWS S3", "Postgres 15")
→ What env vars are needed to connect? (names only — never record actual values)
→ Is any state pre-provisioned (bucket, DB, queue) or created/destroyed by test setup?
→ What IAM / permission scope is needed? (least privilege — avoid wildcards like s3:*)
→ Should these tests be excluded from the default test run? (recommended: yes → ci_tag: integration)
```

Write the answers into the spec frontmatter as `infra_requirements:`:

```yaml
infra_requirements:
  systems:
    - name: "AWS S3"
      env_vars: [AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION]
      notes: "Dedicated test account. IAM scoped to specific actions/ARNs."
  ci_tag: "integration"
```

**Security invariant:** `infra_requirements:` MUST contain only env var NAMES and human-readable guidance. Never record actual credential values, tokens, or connection strings with embedded passwords.

**If the author skips or is unsure:** write `infra_requirements: unknown` and add a comment: `# Fill in before /adev:plan — plan will warn if missing`.

**If the capability has no external systems:** proceed to Step 5 without writing the field.

### Step 5: Write the Spec

1. Generate slug: lowercase, kebab-case, no special characters.
2. Fill `${CLAUDE_PLUGIN_ROOT}/templates/live-spec-template.md`.
3. Set frontmatter per shared section (including milestone inheritance). Additionally set:
   - `revision: 1`
   - `charter-revision: <the parent charter's current revision value>`
   - `updated: <today's date YYYY-MM-DD>`
   - (Optional) Ask the user if there is an external tracker reference. If so, add `tracker-ref: <value>` to frontmatter.
4. Save location:
   - **Workspace mode:** Save to workspace `.context-index/specs/features/<module>/<spec-slug>.md`. Include `target-repo: <slug>` (or `target-repo: workspace`) in the YAML frontmatter.
   - **Repo mode / single-repo:** Save to `.context-index/specs/features/<module>/<spec-slug>.md` as before. No `target-repo:` field.
5. **Update charter Capability Map:** Read the parent charter, find the capability row that this spec covers in the Capability Map table, and update its `Status` column to `specified`.

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

### Step 5.6: Create Feature Work Item

After Step 5.5 flips the spec status to `review-pending`, bind the spec to a Feature work item on the issue board. This step is **idempotent**: re-running `/adev:specify` on an existing spec updates the Feature rather than creating a duplicate.

#### 5.6-0: Guard — tasks.backend

Check `manifest.yaml` for a `tasks.backend` entry. If absent, skip this entire step silently and add a one-line note to the Step 6 Summary output:

```
Issue board not configured; skipping Feature work item creation.
```

#### 5.6-1: Look Up Issue Manager

Call `getIssueManager(manifest)` to obtain the configured issue board adapter.

#### 5.6-2: Idempotency Check

Query the issue board for any existing item where `spec_ref` equals the absolute path of the spec file just written (e.g., `.context-index/specs/features/<module>/<spec-slug>.md`). If exactly one Feature already exists with that `spec_ref`, skip creation and **update** it (refresh `next_action` and `updated`) — do not create a duplicate. If multiple items share the same `spec_ref`, update the most recently created one and log a warning.

#### 5.6-3: Resolve Parent Epic

Query the issue board for items with `type: "epic"` whose `notes` field begins with the literal string `"Charter: <module-slug>"` (where `<module-slug>` is the charter module name, e.g., `"Charter: task-boards"`). This convention is established when `/adev:plan --feature <module>` creates the Epic.

- If exactly one matching Epic is found → use its `id` as `parent_id`.
- If multiple matching Epics are found → use the most recently updated one and log a warning.
- If zero matching Epics are found → create the Feature as a root item (no `parent_id`). A later `/adev:plan --feature <module>` invocation can create the Epic and re-parent the Feature.

#### 5.6-4: Build Feature Fields

Assemble the Feature work item fields:

| Field | Value |
|-------|-------|
| `title` | Copied from the spec's `# Live Spec: <title>` heading |
| `type` | `"feature"` |
| `spec_ref` | Absolute path to the spec file |
| `next_action` | `"Run /adev:review-specs --module <module>"` (for `review-pending` status) |
| `parent_id` | Resolved Epic ID from 5.6-3, or absent for root |
| `notes` | `"Bound 1:1 to spec at <spec_ref>. Created by /adev:specify on <date>."` |

#### 5.6-5: Create or Update

Call `getIssueManager(manifest).create({ title, type: "feature", spec_ref, next_action, parent_id, notes })` (or update if the idempotency check in 5.6-2 found an existing Feature).

If the issue board adapter throws, log the error to the summary output but **do not block** spec completion — the spec is already written and status is already `review-pending`.

#### 5.6 — Mode Variants

**Cross-cutting specs** (`--cross-cutting`): The spec file lives at `.context-index/specs/cross-cutting/<slug>.md`. Skip the Epic lookup (5.6-3) — cross-cutting specs have no module Epic. Create the Feature with `parent_id` absent and append to `notes`: `"Cross-cutting spec. Affects: <affects-list from frontmatter>."`.

**Refactor specs** (`--refactor`): Create the Feature with `type: "feature"` (refactors are still Features in the model). Append to `notes`: `"Refactoring spec. Review migration steps before planning."` and include a note in `next_action` referencing the migration steps if applicable.

**Backfill (legacy specs)**: If `/adev:specify` is re-invoked on a spec file that was authored before this step landed (no bound Feature), Step 5.6-2 will find no existing Feature and 5.6-5 will create one. No automatic migration sweep — Features are created lazily as specs are touched.

### Step 6: Summary

Output path, charter, status, counts of behaviors/error cases/tasks/acceptance criteria, and next steps. Include any notes from Step 5.6 (Feature created/updated, skipped, or failed).

---

## Extract Mode (`--extract`)

For brownfield codebases. Reads existing source code and produces a "snapshot spec" that captures current behavior. Documents what IS, not what SHOULD BE.

### Step 1: Resolve Charter

Use the shared Resolve Charter section above.

### Step 2: Identify Code to Extract

If the user provides a module name, scan the codebase for associated files using the charter's file references, directory conventions, and `platform-context.yaml`. If the user provides specific file paths, use those directly.

```
Analyzing module: user-management

Found relevant files:
  src/app/api/users/route.ts          (API routes, 142 lines)
  src/lib/auth/permissions.ts          (Permission checks, 89 lines)
  src/components/user-profile.tsx      (Profile UI, 201 lines)

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

- **Behavioral Contract** describes observed behavior. Use comment: `<!-- Extracted from existing code. Describes current behavior as of YYYY-MM-DD. -->`
- **Behaviors** are derived from code paths. Each public function or API endpoint becomes one or more behavior statements.
- **Error Cases** come from existing error handling code. Flag unhandled cases:
  ```
  | Missing auth token | Returns 401 | 401 |
  | Invalid user ID | ⚠ UNHANDLED — throws raw Prisma error | 500 |
  ```
- **Actionable Task Map** is replaced with a **Coverage Gaps** section:
  ```
  ## Coverage Gaps
  - No rate limiting on user creation endpoint
  - Permission checks bypass for admin role is implicit, not tested
  - Profile image upload has no size validation
  ```
- **Constitution Reference** flags observed violations:
  ```
  - "All database queries use parameterized statements" — ✓ Compliant
  - "Error responses use standard error envelope" — ⚠ VIOLATION: /api/users/[id] returns raw error strings
  ```

Add `mode: extract` and `extracted-from: [<file list>]` to frontmatter per the shared section.

Load context per the shared section above. Save to `.context-index/specs/features/<module>/<spec-slug>.md`.

### Step 4.5: Update Spec Status

After saving the spec, update its status to `review-pending` (same as Step 5.5 in standard mode).

### Step 5: Summary

Output the shared summary template with these stats:
```
  Extracted from: <N> files (<N> lines analyzed)
  Behaviors documented: <count>
  Error cases: <count> (<N> unhandled)
  Coverage gaps: <count>
  Constitutional violations: <count>

  This spec captures current behavior. It does NOT prescribe changes.
  To plan improvements, use:
  - /adev:specify --refactor <module> (for structural changes)
  - /adev:specify <module> (for new capabilities)
```

---

## Refactor Mode (`--refactor`)

Produces a refactoring spec with current state analysis, target state definition, a step-by-step migration path, and invariants.

### Step 1: Resolve Charter

Use the shared Resolve Charter section above.

### Step 2: Load Context and Identify Scope

Load context per the shared section above. Ask the user:

```
→ What code do you want to refactor? (module, files, or describe the area)
→ What is the problem with the current code?
→ What should the code look like after refactoring?
```

### Step 3: Analyze Current State

Read the identified code. Build the Current State section:

- **Structure table:** file, role, line count, notes
- **Problems:** specific, measurable issues (e.g., "`processOrder` is 340 lines with cyclomatic complexity of 28, handling 4 unrelated concerns.")
- **Dependencies:** what other code relies on code being refactored — these are migration constraints.

If an extract spec already exists for this module, load it instead of re-analyzing.

### Step 4: Define Target State

Based on user description and analysis:

- **Structure table:** target file layout with roles
- **Improvements:** how each problem from Current State is resolved

Validate the target state against the constitution. Flag violations:

```
⚠ Your target state introduces a direct database call from a UI component.
  This violates: "Database access only through server actions or API routes."

→ Revise the target state, or note this as a constitutional exception?
```

### Step 5: Build Migration Path

Each migration step must be independently deployable, have clear verification criteria, include risk assessment, and follow safe ordering (extract before modify, tests before refactor).

Use the template at `${CLAUDE_PLUGIN_ROOT}/templates/refactoring-spec-template.md`.

```
Proposed migration path (4 steps):

  Step 1: Extract shared validation logic
    Move validation into validators/order-validators.ts.
    Risk: Low — pure extraction, no behavior change.
    Verify: All existing order tests pass.

  Step 2: Split processOrder into pipeline stages
    Break into: validate → enrich → persist → notify.
    Risk: Medium — behavior must remain identical.
    Verify: Existing tests pass + new unit tests per stage.

  Step 3: Add integration test for the full pipeline
    Risk: Low — adding tests only.

  Step 4: Update entry points to use the pipeline
    Risk: Medium — all callers must be updated.
    Verify: All tests pass, no remaining references to old function.

→ Does this migration path look right? (yes / reorder / add step / remove step)
```

### Step 6: Define Invariants

Invariants are properties that must remain true at every migration step. Always include:

- All existing tests continue to pass at every step
- Public API contracts do not change (unless the spec explicitly permits it)
- No data loss or corruption during migration

Ask for domain-specific invariants:

```
→ Any additional invariants? For example:
  - "Response times must stay under 200ms"
  - "The audit log format must not change"
```

### Step 7: Write Behavioral Contract and Spec

Define the target behavior (what the system does AFTER refactoring). This gives `/adev:validate` something to verify against.

1. Fill the template at `${CLAUDE_PLUGIN_ROOT}/templates/refactoring-spec-template.md`.
2. Set frontmatter per the shared section with `mode: refactor`.
3. Save to `.context-index/specs/features/<module>/<spec-slug>.md`.

### Step 7.5: Update Spec Status

After saving the spec, update its status to `review-pending` (same as Step 5.5 in standard mode).

### Step 8: Summary

Output the shared summary template with these stats:
```
  Current state: <N> files, <N> problems identified
  Target state: <N> files (<N> new, <N> modified, <N> unchanged)
  Migration steps: <count>
  Invariants: <count>
  Behaviors: <count>
  Acceptance criteria: <count>

  Review the migration path carefully — this is the highest-risk section.
```

---

## From-Diff Mode (`--from-diff`)

Generates a retroactive Live Spec from a git diff or PR. Useful for documenting work done before adev was adopted, or hotfixes that skipped the spec phase.

### Step 1: Identify the Diff

1. If no argument: use `git diff --cached`, or if nothing staged, `git diff`.
2. If a commit range (e.g., `HEAD~3..HEAD`): use `git diff <range>`.
3. If a branch name: diff against main: `git diff main..<branch>`.
4. If a PR number: fetch the PR diff.

```
Analyzing diff...

Changes:
  Modified: src/app/api/tasks/route.ts (+45, -12)
  Created:  src/lib/tasks/priority-engine.ts (+89)
  Modified: prisma/schema.prisma (+8)

Total: 3 files, 142 additions, 12 deletions

→ Generate a retroactive spec for these changes? (yes / narrow scope / cancel)
```

### Step 2: Resolve Charter

Analyze the changed files to determine which module they belong to. Match against existing charters. If changes span multiple modules:

```
These changes touch 2 modules:
  - task-boards (3 files)
  - notifications (1 file)

→ Create one spec under task-boards? Or separate specs per module?
```

### Step 3: Analyze the Diff

Load context per the shared section above. Read the full diff content. For each changed file, identify:
- Behavior added (new functions, endpoints, UI elements)
- Behavior modified (changed logic, updated validation)
- Behavior removed (deleted functions, removed endpoints)

### Step 4: Generate Retroactive Spec

Produce a Live Spec where:

- **Behavioral Contract** describes behavior as it exists after the diff.
- **Behaviors** map to changes in the diff — each significant code change becomes a behavior statement.
- **Error Cases** extracted from new or modified error handling.
- **Actionable Task Map** replaced with **Changes Summary**:
  ```
  ## Changes Summary
  | File | Change Type | Description |
  |------|------------|-------------|
  | src/lib/tasks/priority-engine.ts | Created | New priority scoring algorithm |
  | src/app/api/tasks/route.ts | Modified | Added priority field to task creation |
  ```
- **Acceptance Criteria** use checked boxes for existing behaviors, unchecked for missing:
  ```
  - [x] Priority field accepted on task creation
  - [ ] Priority validation (no validation found in diff — may be missing)
  - [ ] Test coverage for priority engine (no tests found in diff)
  ```

Set frontmatter per the shared section with `mode: from-diff` and `diff-source`. Save to `.context-index/specs/features/<module>/<spec-slug>.md`.

### Step 4.5: Update Spec Status

After saving the spec, update its status to `review-pending` (same as Step 5.5 in standard mode).

### Step 5: Summary

Output the shared summary template with these stats:
```
  Diff source: <source>
  Files analyzed: <count>
  Behaviors documented: <count>
  Gaps identified: <count> (details)

  This spec documents existing changes. Review the gaps — they may
  need follow-up specs or immediate fixes.
```

---

## Cross-Cutting Mode (`--cross-cutting`)

Produces specs for concerns spanning multiple features: authentication, error handling, API versioning, logging, etc.

### Step 1: Prerequisites

Cross-cutting specs do not require a Feature Charter. They require:
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

Load context per the shared section above (constitution, product charter). If specific modules are named, load their charters. Identify existing references to the concern.

### Step 4: Interactive Spec Authoring

Same process as standard mode (behavioral contract, constitution reference, task map, acceptance criteria), with these additions:

**Module Impact Map:**
```
| Module | Impact | Changes Required |
|--------|--------|-----------------|
| task-boards | High | Add auth checks to all task mutations |
| user-management | Medium | Expose permission API for other modules |
| notifications | Low | Read-only, only needs auth token validation |
```

**Integration Points:**
```
1. task-boards ↔ auth: Task mutations call checkPermission(userId, boardId, 'edit') before writes.
2. notifications ↔ auth: Notification reads validate session token via middleware.
3. user-management ↔ auth: Canonical permission definitions live here. Other modules import.
```

### Step 5: Write the Spec

1. Fill the template at `${CLAUDE_PLUGIN_ROOT}/templates/live-spec-template.md`.
2. Add Module Impact and Integration Points after the standard template sections.
3. Set frontmatter per the shared section with `mode: cross-cutting` and `affects: [<modules>]` instead of `charter:`.
4. Save to `.context-index/specs/cross-cutting/<spec-slug>.md`.

### Step 5.5: Update Spec Status

After saving the spec, update its status to `review-pending` (same as Step 5.5 in standard mode).

### Step 6: Summary

Output the shared summary template with these stats:
```
  Affects: <N> modules
  Behaviors: <count>
  Integration points: <count>
  Acceptance criteria: <count>

  Review the module impact with each module's maintainer.
```

---

## Constitution Validation (All Modes)

Before writing any spec, scan the constitution for conflicts:

1. Read `.context-index/constitution.md`.
2. Check that the proposed spec does not contradict any principle.
3. If a conflict is found:

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

If option 2, create an ADR draft at `.context-index/adrs/NNNN-<title>.md` and note the pending ADR in the spec. If option 3, add `constitutional-exception: "<principle text>"` to frontmatter.

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
