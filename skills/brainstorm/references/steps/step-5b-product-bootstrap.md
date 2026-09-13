## Step 5b: Product.md Bootstrap

> **Skip this step entirely if:** the user passed `--no-bootstrap`, OR if `--module <name>` was used (revision mode — no new charter is being created).

This step runs immediately after the charter is written (Step 5). It keeps `product.md` in sync with the growing set of charters.

### 5b-1: First Charter Detection

Glob `.context-index/specs/features/*/charter.md`. Count the results.

- **If this is the first charter** (count is 1 — only the charter just written exists): proceed to **5b-2: Bootstrap Flow**.
- **If other charters already exist** (count > 1) AND `.context-index/specs/product.md` exists: proceed to **5b-4: Module Map Append**.
- **If other charters already exist** AND `.context-index/specs/product.md` does NOT exist: treat as a first-vision opportunity — proceed to **5b-2: Bootstrap Flow**, and list all existing charters in the Module Map when writing product.md.

### 5b-2: Bootstrap Flow

**Check if `.context-index/specs/product.md` already exists.**

- If it exists: skip bootstrap entirely (product.md is preserved as-is). Go to **5b-4: Module Map Append**.
- If it does not exist: continue below.

**Ask ONE question to the user:**

> This is the first charter in the project. What is the product trying to do, in one sentence? (This becomes the product vision.)

Wait for the user's response. Do not ask any follow-up questions.

- If the user provides a sentence: use it as the Vision.
- If the user declines or provides no response: write product.md with an empty Vision section and add an advisory comment: `<!-- TODO: fill in product vision -->`.

### 5b-3: Write product.md

Read `.context-index/constitution.md` to extract the project name from its Identity section. Use that as `<project name>`.

Write the following to `.context-index/specs/product.md`:

```markdown
# Product Vision: <project name>

## Vision

<user's one-sentence response, or empty with TODO comment>

## Module Map

| Module | Description | Charter |
|--------|-------------|---------|
| <module-slug> | <one-line Business Intent from the charter just written> | [charter.md](./features/<module-slug>/charter.md) |
```

If other charters already existed (edge case from 5b-1), add a row for each existing charter as well. Extract their one-line Business Intent from each charter file.

After writing, print:

> Bootstrapped product.md from your one-sentence vision. Run /adev:plan --milestone <name> later to define milestones, or update product.md directly.

### 5b-3a: Workspace-Mode Adjustments

> **This subsection applies only when Step 5b is executing in workspace mode** (as detected by `detectWorkspace` — see Workspace Root Handling). In repo mode (existing behaviour), all paths and prompts remain unchanged.

#### 1. Mode Branching

When invoked at a workspace root, Step 5b's globbing path for first-charter detection becomes:

```
<workspaceRoot>/.context-index/specs/features/*/charter.md
```

And the write path for product.md becomes `resolveWorkspaceProductPath(workspaceRoot)` (from `lib/workspace.mjs`). In repo mode, paths remain unchanged.

#### 2. Project Name Resolution

In workspace mode, the project name for the `product.md` title is resolved as follows:

- Prefer `workspace.name` from `adev-workspace.yaml`
- Fall back to the workspace root directory basename (directory name)

**No workspace-level `constitution.md` is required** (unlike repo mode, which reads the constitution for the project name).

#### 3. Augmented Vision Prompt

> **Supersession note:** This workspace-mode prompt supersedes the single-question contract from `@design/brainstorm-product-bootstrap` Behavior 3 when in workspace mode. The prompt remains a single question; only its preface changes.

When bootstrapping at a workspace root for the first time, ask this ONE question:

```
This is the first workspace-level charter. The workspace '<name>' currently
coordinates <N> repos:
  - <slug>: <identity one-liner>
  - ...
What is the workspace trying to do, in one sentence? (This becomes the
workspace product vision.)
```

Replace `<name>` with the resolved workspace name, `<N>` with the count of registered repos, and each `<slug>: <identity one-liner>` with the repo's slug and its extracted identity (see rule 4 below).

#### 4. Identity Extraction Rule per Registered Repo

Apply in order, stopping at the first success:

1. First sentence of the `## Identity` section of the repo's `.context-index/constitution.md`
2. If no `## Identity` section exists, use the first sentence of the constitution body (text after frontmatter and title)
3. If the file is absent or empty, use the literal string `no constitution`

#### 5. Sanitisation

Before including an identity one-liner in the prompt, call `sanitizeIdentityOneLiner(raw)` from `lib/workspace.mjs`. This function strips control characters (`\x00-\x1F`, `\x7F`) and ANSI CSI sequences, and truncates to 200 UTF-8 characters with an ellipsis on overflow.

#### 6. Missing Repo Path Handling

If `detectWorkspace` flagged `missing: true` for a repo, OR if `assertPathInWorkspace(workspaceRoot, repoPath)` threw `PATH_ESCAPE`, skip that repo silently. All other repos continue to be processed.

#### 7. Module Map in Workspace Mode

In workspace mode, the Module Map table contains **workspace-charter rows only** — per-repo charters are NOT mixed in. Each repo retains its own `product.md` with its own Module Map. The workspace `product.md` tracks only workspace-level charters.

#### 8. `--no-bootstrap` in Workspace Mode

The `--no-bootstrap` flag suppresses Step 5b at the workspace root identically to single-repo mode — no product.md is written and no question is asked.

### 5b-4: Module Map Append

**When `product.md` exists,** append a row for the new module to the Module Map section after writing the charter.

**Idempotency rule:** Before appending, scan the Module Map table for an existing row whose first cell matches `<module-slug>`. If found, update the description in that row in place. Do NOT add a duplicate row.

**If `product.md` has no `## Module Map` section:**

- Create the section. Insert it just before `## Milestones` if that section exists, or at the end of the file if Milestones is absent.
- Add the table header and the new row.
- Inform the user: `"Created Module Map section in product.md."`

**If `product.md` exists but the Module Map table cannot be parsed** (e.g., the file is malformed or uses a non-standard format): skip the append and warn the user:

> product.md exists but Module Map cannot be parsed; please update manually.

**Row format:**

```
| <module-slug> | <one-line Business Intent from the charter> | [charter.md](./features/<module-slug>/charter.md) |
```
