# Implementation Plan: Issue and Epic CRUD

> **Methodology:** adev
> **Charter:** .context-index/specs/features/task-management/charter.md
> **Spec:** .context-index/specs/features/task-management/issue-epic-crud.md
> **Review:** PASS_WITH_NOTES (2026-03-31)
> **Platform:** none, javascript (ESM), node:test

**Goal:** Create the `lib/issues/` module with the `IssueManagerInterface` defining CRUD operations for issues and epics, including dependency management with cycle detection.

**Architecture:** Follows the `lib/provider/interface.mjs` pattern — an interface object with method stubs that adapters implement. Uses JSDoc types for the Issue and Epic data shapes. No external dependencies; pure Node.js built-ins.

---

## File Structure

**Create:**
- `lib/issues/interface.mjs` — IssueManagerInterface definition with JSDoc types
- `tests/lib/issues-interface.test.mjs` — Unit tests for interface contract validation

**Reference (read, do not modify):**
- `lib/provider/interface.mjs` — Pattern reference for interface definition style
- `lib/source-manifest.mjs` — Pattern reference for JSDoc typedef conventions

## Context Packets

### Task 1 Context
- Spec: `issue-epic-crud.md` (Behaviors 1-10, Error Cases, Postconditions)
- Charter: `charter.md` (Domain Model — entities, relationships, invariants)
- Reference: `lib/provider/interface.mjs` (interface pattern)

### Task 2 Context
- Spec: `issue-epic-crud.md` (Behaviors 1-7, Error Cases for issues)
- Reference: `lib/source-manifest.mjs` (JSDoc typedef pattern)

### Task 3 Context
- Spec: `issue-epic-crud.md` (Behaviors 8-9, Epic CRUD)

### Task 4 Context
- Spec: `issue-epic-crud.md` (Behavior 10, Error Cases for cycle/close-guard)
- Charter: `charter.md` (Invariants — dependency rules)

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3 → Task 4 (all share `lib/issues/interface.mjs`)

---

### Task 1: Interface Definition [specialist: none]

**Charter capability:** Issue CRUD, Epic CRUD
**Files:**
- Create: `lib/issues/interface.mjs`
- Test: `tests/lib/issues-interface.test.mjs`

**Tests:** `tests/lib/issues-interface.test.mjs`

- [ ] **Write failing test**

```javascript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { IssueManagerInterface } from "../../lib/issues/interface.mjs";

describe("IssueManagerInterface", () => {
  it("exports all required methods", () => {
    const methods = ["create", "update", "close", "list", "get",
                     "createEpic", "updateEpic", "addDependency"];
    for (const method of methods) {
      assert.equal(typeof IssueManagerInterface[method], "function");
    }
  });

  it("all methods throw 'Not implemented' by default", async () => {
    for (const method of ["create", "update", "close", "list", "get",
                          "createEpic", "updateEpic", "addDependency"]) {
      await assert.rejects(
        () => IssueManagerInterface[method](),
        { message: "Not implemented" }
      );
    }
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/issues-interface.test.mjs`
Expected: FAIL — module not found

- [ ] **Implement**

Create `lib/issues/interface.mjs` with:
- JSDoc `@typedef` for `Issue` (id, title, status, priority, type, epicId, planRef, planTask, dependencies, notes, created, updated)
- JSDoc `@typedef` for `Epic` (id, title, status, planRef, created, updated)
- `IssueManagerInterface` object with all 8 methods + `name` property, each throwing "Not implemented"
- Follow the exact pattern from `lib/provider/interface.mjs`

- [ ] **Verify test passes**

Run: `node --test tests/lib/issues-interface.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/issues/interface.mjs tests/lib/issues-interface.test.mjs
git commit -m "feat(task-management): add IssueManagerInterface definition"
```

### Task 2: Issue CRUD Helper Functions [specialist: none]

**Charter capability:** Issue CRUD
**Depends on:** Task 1
**Files:**
- Modify: `lib/issues/interface.mjs` — add helper/validation functions
- Test: `tests/lib/issues-interface.test.mjs` — add validation tests

**Tests:** `tests/lib/issues-interface.test.mjs`

- [ ] **Write failing test**

```javascript
describe("validateIssue", () => {
  it("throws MISSING_REQUIRED_FIELD when title is empty", () => {
    assert.throws(
      () => validateIssue({}),
      (err) => err.code === "MISSING_REQUIRED_FIELD"
    );
  });

  it("accepts valid issue with defaults", () => {
    const issue = validateIssue({ title: "Fix bug", type: "bug" });
    assert.equal(issue.status, "open");
    assert.equal(issue.priority, 2);
    assert.ok(issue.created);
  });
});

describe("validateStatusTransition", () => {
  it("throws ISSUE_CLOSED when updating a closed issue", () => {
    assert.throws(
      () => validateStatusTransition("closed", { title: "new" }),
      (err) => err.code === "ISSUE_CLOSED"
    );
  });

  it("throws USE_CLOSE_METHOD when update sets status to closed", () => {
    assert.throws(
      () => validateStatusTransition("open", { status: "closed" }),
      (err) => err.code === "USE_CLOSE_METHOD"
    );
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/issues-interface.test.mjs`
Expected: FAIL — `validateIssue` not exported

- [ ] **Implement**

Add exported helper functions to `lib/issues/interface.mjs`:
- `validateIssue(data)` — ensures title exists, sets defaults (status: "open", priority: 2, type: "task", dependencies: [], created/updated timestamps)
- `validateStatusTransition(currentStatus, changes)` — blocks updates on closed issues, blocks setting status to "closed" via update
- `VALID_STATUSES`, `VALID_TYPES`, `VALID_PRIORITIES` constants

- [ ] **Verify test passes**

Run: `node --test tests/lib/issues-interface.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/issues/interface.mjs tests/lib/issues-interface.test.mjs
git commit -m "feat(task-management): add issue validation helpers"
```

### Task 3: Epic Validation [specialist: none]

**Charter capability:** Epic CRUD
**Depends on:** Task 2
**Files:**
- Modify: `lib/issues/interface.mjs`
- Test: `tests/lib/issues-interface.test.mjs`

**Tests:** `tests/lib/issues-interface.test.mjs`

- [ ] **Write failing test**

```javascript
describe("validateEpic", () => {
  it("throws MISSING_REQUIRED_FIELD when title is empty", () => {
    assert.throws(
      () => validateEpic({}),
      (err) => err.code === "MISSING_REQUIRED_FIELD"
    );
  });

  it("accepts valid epic with defaults", () => {
    const epic = validateEpic({ title: "Auth feature" });
    assert.equal(epic.status, "open");
    assert.ok(epic.created);
  });
});
```

- [ ] **Verify test fails**
- [ ] **Implement** — Add `validateEpic(data)` function with title check and defaults
- [ ] **Verify test passes**
- [ ] **Commit**

```bash
git add lib/issues/interface.mjs tests/lib/issues-interface.test.mjs
git commit -m "feat(task-management): add epic validation helper"
```

### Task 4: Dependency Cycle Detection [specialist: none]

**Charter capability:** Issue CRUD (addDependency)
**Depends on:** Task 2
**Files:**
- Modify: `lib/issues/interface.mjs`
- Test: `tests/lib/issues-interface.test.mjs`

**Tests:** `tests/lib/issues-interface.test.mjs`

- [ ] **Write failing test**

```javascript
describe("detectCycle", () => {
  it("detects self-dependency", () => {
    const deps = { "issue-1": [] };
    assert.throws(
      () => detectCycle("issue-1", "issue-1", deps),
      (err) => err.code === "CIRCULAR_DEPENDENCY"
    );
  });

  it("detects transitive cycle A→B→A", () => {
    const deps = { "issue-1": ["issue-2"], "issue-2": [] };
    assert.throws(
      () => detectCycle("issue-2", "issue-1", deps),
      (err) => err.code === "CIRCULAR_DEPENDENCY"
    );
  });

  it("allows valid dependency", () => {
    const deps = { "issue-1": [], "issue-2": [] };
    assert.doesNotThrow(() => detectCycle("issue-1", "issue-2", deps));
  });
});

describe("checkCloseGuard", () => {
  it("throws BLOCKED_BY_DEPENDENCIES when deps are unclosed", () => {
    const issues = [
      { id: "issue-1", status: "open", dependencies: [] },
      { id: "issue-2", status: "open", dependencies: ["issue-1"] },
    ];
    assert.throws(
      () => checkCloseGuard("issue-2", issues),
      (err) => err.code === "BLOCKED_BY_DEPENDENCIES"
    );
  });

  it("allows close when all deps are closed", () => {
    const issues = [
      { id: "issue-1", status: "closed", dependencies: [] },
      { id: "issue-2", status: "open", dependencies: ["issue-1"] },
    ];
    assert.doesNotThrow(() => checkCloseGuard("issue-2", issues));
  });
});
```

- [ ] **Verify test fails**
- [ ] **Implement** — Add `detectCycle(issueId, dependsOnId, depsMap)` with DFS cycle detection and `checkCloseGuard(issueId, allIssues)` that checks blocking deps
- [ ] **Verify test passes**
- [ ] **Commit**

```bash
git add lib/issues/interface.mjs tests/lib/issues-interface.test.mjs
git commit -m "feat(task-management): add dependency cycle detection and close guard"
```

---

## Quality Gates

- [ ] Tests pass: `npm test`
- [ ] All acceptance criteria from spec satisfied
