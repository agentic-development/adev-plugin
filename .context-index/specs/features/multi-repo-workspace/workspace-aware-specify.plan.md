# Implementation Plan: Workspace-Aware /adev:specify

> **Methodology:** adev
> **Charter:** .context-index/specs/features/multi-repo-workspace/charter.md
> **Spec:** .context-index/specs/features/multi-repo-workspace/workspace-aware-specify.md
> **Review:** PASS_WITH_NOTES (2026-04-17)
> **Platform:** Node.js ESM (`.mjs`), `node:test`, npm. Zero-runtime-dependency CLI plugin.

**Goal:** Make `/adev:specify` workspace-aware so that specs authored at the workspace root include `target-repo:` frontmatter indicating which registered repo owns the implementation.

**Architecture:** Three SKILL.md sections are added: (1) a workspace-mode detection section after "Shared: Resolve Charter" that branches on `detectWorkspace(cwd)` with `currentRepoSlug === null`, (2) a `target-repo:` prompt step after capability selection in workspace mode with validation against the workspace repo registry, and (3) frontmatter generation updates to include `target-repo:` in workspace mode. No new runtime code — all changes are markdown instructions in SKILL.md, following the same pattern as the workspace-mode additions to `/adev:brainstorm` and `/adev:plan`. Sibling repo context is loaded via `resolveWorkspaceContext()` for reference only (read paths, not parsed content). Single-repo flow is preserved because `detectWorkspace()` returning `null` means the new branches never fire.

**Review PASS_WITH_NOTES warnings addressed inline:**
- **SA-1** — Task 1 explicitly states `currentRepoSlug` comes from the `detectWorkspace()` return value.
- **SA-2** — Task 2 clarifies error codes are for human/agent reference, not programmatic.
- **SA-5 / CON-2** — Task 4 scopes "reference context" to path-level awareness (existing spec file paths from `resolveWorkspaceContext().siblingRepos[].contextPath`), not parsed content. Cross-repo duplicate detection is deferred.

---

## File Structure

**Modify:**
- `skills/specify/SKILL.md` — Add workspace-mode detection section, `target-repo:` prompt, frontmatter update, and isolation guard

**Create:**
- `tests/skills/specify-workspace-mode.test.mjs` — SKILL.md content assertions for workspace-mode text (regex-based, following `brainstorm-workspace-bootstrap.test.mjs` pattern)

**Reference (read, do not modify):**
- `.context-index/specs/features/multi-repo-workspace/workspace-aware-specify.md` — target spec (8 behaviours, 11 AC)
- `.context-index/specs/features/multi-repo-workspace/charter.md` — charter (rev 4)
- `.context-index/specs/features/multi-repo-workspace/workspace-aware-specify.review.md` — review report (PASS_WITH_NOTES)
- `lib/workspace.mjs` — existing exports: `detectWorkspace`, `resolveWorkspaceContext`, `validateModuleName`, `assertPathInWorkspace`
- `tests/skills/brainstorm-workspace-bootstrap.test.mjs` — SKILL.md assertion pattern (regex-based)
- `tests/skills/plan-workspace-mode.test.mjs` — SKILL.md assertion pattern (regex-based)

---

## Context Packets

### Task 1 Context (workspace-mode detection + resolve charter)
- Spec: workspace-aware-specify.md (Behaviors 1, 6, 7; AC1, AC7, AC8)
- Charter: multi-repo-workspace (invariant: "Single-repo projects work identically")
- Reference: `skills/brainstorm/SKILL.md` (workspace-mode branching pattern at Step 5b)
- Reference: `skills/plan/SKILL.md` (repo-mode-inside-workspace advisory pattern)
- Files: `lib/workspace.mjs` (detectWorkspace API shape)

### Task 2 Context (target-repo prompt + validation)
- Spec: workspace-aware-specify.md (Behaviors 2, 3, 4, 5; AC2, AC3, AC4)
- Charter: multi-repo-workspace (Domain Model: WorkspaceRepo.slug)
- Files: `lib/workspace.mjs` (validateModuleName API)

### Task 3 Context (frontmatter + isolation)
- Spec: workspace-aware-specify.md (Behaviors 8; AC5, AC6, AC9)
- Charter: multi-repo-workspace (invariant: "Sibling repo .context-index/ is read-only")
- Reference: `skills/specify/SKILL.md` (Shared: Frontmatter section, Step 5)

### Task 4 Context (tests)
- Spec: workspace-aware-specify.md (all AC)
- Reference: `tests/skills/brainstorm-workspace-bootstrap.test.mjs` (assertion pattern)
- Reference: `tests/skills/plan-workspace-mode.test.mjs` (assertion pattern)

---

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3 (all modify the same file: `skills/specify/SKILL.md`)
- Group B (after Group A): Task 4 (tests assert against the SKILL.md content from Tasks 1-3)

No parallelization possible — all tasks modify or read the same file.

---

### Task 1: Workspace-Mode Detection in SKILL.md [specialist: none]

**Charter capability:** Repo-level spec decomposition (workspace detection entry point)
**Files:**
- Modify: `skills/specify/SKILL.md` — add section after "Shared: Resolve Charter" (after line ~50)

**Tests:** `tests/skills/specify-workspace-mode.test.mjs`

- [x] **Write failing test**

Create `tests/skills/specify-workspace-mode.test.mjs` with assertions that the SKILL.md contains workspace-mode detection text:

```javascript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import { PLUGIN_ROOT } from "../helpers.mjs";

const SKILL_PATH = join(PLUGIN_ROOT, "skills", "specify", "SKILL.md");
const skill = readFileSync(SKILL_PATH, "utf8");

describe("adev:specify SKILL.md — workspace-mode detection", () => {
  it("references detectWorkspace for workspace-mode branching", () => {
    assert.match(skill, /detectWorkspace/,
      "Must reference detectWorkspace()");
  });

  it("branches on currentRepoSlug === null for workspace root detection", () => {
    assert.match(skill, /currentRepoSlug.*null|null.*currentRepoSlug/i,
      "Must check currentRepoSlug === null for workspace root");
  });

  it("preserves single-repo behaviour when detectWorkspace returns null", () => {
    assert.match(skill, /detectWorkspace.*null|null.*no workspace/i,
      "Must state single-repo behaviour when no workspace detected");
  });

  it("documents that currentRepoSlug comes from detectWorkspace return value", () => {
    assert.match(skill, /detectWorkspace.*return|return.*currentRepoSlug/i,
      "Must clarify currentRepoSlug derivation (SA-1 review note)");
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/skills/specify-workspace-mode.test.mjs`
Expected: FAIL — SKILL.md does not yet contain workspace-mode text.

- [x] **Implement**

Add a new section to `skills/specify/SKILL.md` after "Shared: Resolve Charter" (after the charter selection instructions, before "Shared: Load Context"):

```markdown
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
```

- [x] **Verify test passes**

Run: `node --test tests/skills/specify-workspace-mode.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add skills/specify/SKILL.md tests/skills/specify-workspace-mode.test.mjs
git commit -m "feat(specify): add workspace-mode detection to SKILL.md"
```

---

### Task 2: target-repo: Prompt and Validation [specialist: none]

**Charter capability:** Repo-level spec decomposition (target-repo assignment)
**Depends on:** Task 1
**Files:**
- Modify: `skills/specify/SKILL.md` — add target-repo prompt section in workspace-mode flow
- Modify: `tests/skills/specify-workspace-mode.test.mjs` — add target-repo assertion tests

**Tests:** `tests/skills/specify-workspace-mode.test.mjs`

- [x] **Write failing test**

Add to `tests/skills/specify-workspace-mode.test.mjs`:

```javascript
describe("adev:specify SKILL.md — workspace-mode target-repo prompt", () => {
  it("prompts for target-repo in workspace mode", () => {
    assert.match(skill, /target-repo/,
      "Must reference target-repo frontmatter field");
  });

  it("lists registered repo slugs from adev-workspace.yaml", () => {
    assert.match(skill, /[Rr]egistered repos|repo slugs/,
      "Must list registered repos for target-repo selection");
  });

  it("accepts 'workspace' as a reserved target-repo token", () => {
    assert.match(skill, /["']workspace["'].*reserved|reserved.*["']workspace["']/i,
      "Must document 'workspace' as a reserved target-repo token");
  });

  it("validates target-repo slug with validateModuleName", () => {
    assert.match(skill, /validateModuleName/,
      "Must reference validateModuleName for slug validation");
  });

  it("rejects unknown repo slugs with re-prompt", () => {
    assert.match(skill, /[Uu]nknown repo slug|INVALID_TARGET_REPO/,
      "Must handle unknown repo slug rejection");
  });

  it("error codes are for human/agent reference only", () => {
    assert.match(skill, /human.*reference|agent.*reference|reference only/i,
      "Must clarify error codes are for reference only (SA-2 review note)");
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/skills/specify-workspace-mode.test.mjs`
Expected: FAIL on the new target-repo tests.

- [x] **Implement**

Add a new section to `skills/specify/SKILL.md` after the workspace-mode detection section, before Step 4 (Interactive Spec Authoring). This section fires only in workspace mode (step 4 of the detection section):

```markdown
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
```

- [x] **Verify test passes**

Run: `node --test tests/skills/specify-workspace-mode.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add skills/specify/SKILL.md tests/skills/specify-workspace-mode.test.mjs
git commit -m "feat(specify): add target-repo prompt and validation in workspace mode"
```

---

### Task 3: Frontmatter, Reference Context, and Isolation Guard [specialist: none]

**Charter capability:** Repo-level spec decomposition (spec output and isolation)
**Depends on:** Task 2
**Files:**
- Modify: `skills/specify/SKILL.md` — update Shared: Frontmatter and Step 5, add isolation guard
- Modify: `tests/skills/specify-workspace-mode.test.mjs` — add frontmatter and isolation assertion tests

**Tests:** `tests/skills/specify-workspace-mode.test.mjs`

- [x] **Write failing test**

Add to `tests/skills/specify-workspace-mode.test.mjs`:

```javascript
describe("adev:specify SKILL.md — workspace-mode frontmatter and isolation", () => {
  it("adds target-repo to frontmatter in workspace mode", () => {
    assert.match(skill, /target-repo:.*<slug>/i,
      "Must show target-repo in frontmatter template");
  });

  it("writes specs to workspace .context-index/ in workspace mode", () => {
    assert.match(skill, /workspace.*\.context-index/i,
      "Must write specs to workspace .context-index/");
  });

  it("uses resolveWorkspaceContext for sibling repo reference context", () => {
    assert.match(skill, /resolveWorkspaceContext/,
      "Must reference resolveWorkspaceContext for sibling repo context");
  });

  it("enforces isolation: never writes to registered repo .context-index/", () => {
    assert.match(skill, /never writ(e|es) to.*registered repo|isolation invariant|read-only/i,
      "Must enforce isolation invariant for sibling repos");
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/skills/specify-workspace-mode.test.mjs`
Expected: FAIL on the new frontmatter/isolation tests.

- [x] **Implement**

**1. Update "Shared: Frontmatter" section** — add `target-repo:` to the frontmatter template block:

```yaml
# target-repo: <slug>     # workspace mode only — which repo owns the implementation
```

**2. Update Step 5 (Write the Spec)** — add workspace-mode branching to item 4:

```markdown
4. Save location:
   - **Workspace mode:** Save to workspace `.context-index/specs/features/<module>/<spec-slug>.md`. Include `target-repo: <slug>` (or `target-repo: workspace`) in the YAML frontmatter.
   - **Repo mode / single-repo:** Save to `.context-index/specs/features/<module>/<spec-slug>.md` as before. No `target-repo:` field.
```

**3. Add "Workspace Mode: Reference Context and Isolation" section** after the target-repo prompt section:

```markdown
### Workspace Mode: Reference Context and Isolation

In workspace mode, load sibling repo context via `resolveWorkspaceContext()` for reference:

- Use `resolveWorkspaceContext(workspaceRoot, null).siblingRepos[]` to get sibling repo `.context-index/` paths.
- These paths are available for reference (e.g., checking if a spec name conflicts with an existing spec in a sibling repo) but the skill never writes to any registered repo's `.context-index/`.

**Isolation invariant:** The skill never writes to any registered repo's `.context-index/`. All workspace-mode output goes to the workspace `.context-index/` only. This is a charter-level invariant (multi-repo-workspace charter, Quality Attributes: Isolation).
```

- [x] **Verify test passes**

Run: `node --test tests/skills/specify-workspace-mode.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add skills/specify/SKILL.md tests/skills/specify-workspace-mode.test.mjs
git commit -m "feat(specify): add workspace-mode frontmatter, reference context, and isolation guard"
```

---

### Task 4: Full Test Suite and Quality Gate [specialist: none]

**Charter capability:** All (verification)
**Depends on:** Task 3
**Files:**
- Modify: `tests/skills/specify-workspace-mode.test.mjs` — finalize and run full suite

**Tests:** `tests/skills/specify-workspace-mode.test.mjs`

- [x] **Run full test suite**

Run: `npm test`
Expected: All tests pass, including the new specify-workspace-mode tests.

- [x] **Verify all acceptance criteria**

Map each AC to test coverage:
- AC1 (workspace-mode detection): Task 1 tests
- AC2 (target-repo prompt): Task 2 tests
- AC3 (slug validation): Task 2 tests
- AC4 (workspace reserved token): Task 2 tests
- AC5 (write to workspace .context-index/): Task 3 tests
- AC6 (target-repo in frontmatter): Task 3 tests
- AC7 (repo-mode preserved): Task 1 tests
- AC8 (single-repo preserved): Task 1 tests
- AC9 (sibling repo read-only): Task 3 tests
- AC10 (npm test passes): This task
- AC11 (no constitutional violations): This task

- [x] **Commit**

```bash
git add tests/skills/specify-workspace-mode.test.mjs
git commit -m "test(specify): finalize workspace-mode test coverage"
```

---

## Quality Gates

After all tasks are complete, run the full quality gate suite:

- [ ] Tests pass: `npm test`
- [ ] All 11 acceptance criteria from spec satisfied
- [ ] No constitutional violations introduced (Principle 2: skills are primarily markdown — no runtime code added)
