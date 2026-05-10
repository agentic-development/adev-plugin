# Live Spec: Issue and Epic CRUD

---
charter: task-management
status: validated
milestone: 1
revision: 1
charter-revision: 3
created: 2026-03-31
updated: 2026-04-01
source-manifest:
  sha: "392fd55"
  files:
    - lib/issues/interface.mjs
    - tests/lib/issues-interface.test.mjs
  computed-at: "2026-04-01T13:43:22.543Z"
---

## Behavioral Contract

### Preconditions

- `.context-index/` exists with `manifest.yaml`
- A backend adapter is available (file is always available; beads requires `br` on PATH)

### Behaviors

1. **When** `create(issue)` is called with a title and type **then** a new issue is persisted with a unique ID, status `open`, the current timestamp, and all provided fields.
2. **When** `create(issue)` is called with an `epicId` **then** the issue is associated with that epic and appears when listing issues for that epic.
3. **When** `update(id, changes)` is called **then** only the specified fields are modified, `updated` timestamp is refreshed, and the issue retains all other fields unchanged.
4. **When** `close(id, reason)` is called on an issue with no unclosed blocking dependencies **then** the issue status becomes `closed` and the reason is recorded in notes.
5. **When** `close(id, reason)` is called on an issue with unclosed blocking dependencies **then** the operation fails with an error identifying the blocking issues.
6. **When** `list(filters)` is called with status, type, epicId, or planRef filters **then** only matching issues are returned, ordered by priority (0 first) then creation date.
7. **When** `get(id)` is called with a valid ID **then** the full issue object is returned.
8. **When** `createEpic(epic)` is called with a title **then** a new epic is persisted with a unique ID, status `open`, and the current timestamp.
9. **When** `updateEpic(id, changes)` is called **then** the epic fields are updated and `updated` timestamp is refreshed.
10. **When** `addDependency(issueId, dependsOnId)` is called **then** the dependency is recorded and enforced on close operations. Cycle detection covers both direct (A→A) and transitive (A→B→...→A) cycles.

### Postconditions

- All mutations are persisted to the active backend before the function returns
- IDs are unique within the project and stable across reads
- The `updated` timestamp reflects the last mutation

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `get(id)` with nonexistent ID | Returns `null` (callers must check for null) | NOT_FOUND |
| `close(id)` with blocking deps | Throws `BLOCKED_BY_DEPENDENCIES` with list of blocker IDs | VALIDATION |
| `create()` without title | Throws `MISSING_REQUIRED_FIELD` | VALIDATION |
| `addDependency()` creating a cycle | Throws `CIRCULAR_DEPENDENCY` | VALIDATION |
| `update()` on closed issue | Throws `ISSUE_CLOSED` | VALIDATION |
| `update()` attempting to set status to `closed` | Throws `USE_CLOSE_METHOD` — status transitions to `closed` must use `close()` to enforce the dependency guard | VALIDATION |

## System Constitution Reference

- **"Minimize external dependencies"** — The interface is pure JS with no external deps. Backend adapters use Node.js built-ins (`fs`, `child_process`).
- **"Pure ESM"** — All modules use `.mjs` extension and ES module syntax.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Define interface | Create `lib/issues/interface.mjs` with JSDoc types and method stubs | small |
| Issue CRUD impl | Implement create, update, close, list, get in the interface contract | medium |
| Epic CRUD impl | Implement createEpic, updateEpic in the interface contract | small |
| Dependency mgmt | Implement addDependency with cycle detection and close-guard | medium |
| Unit tests | Tests for all CRUD operations and error cases | medium |

## Acceptance Criteria

- [ ] `lib/issues/interface.mjs` exports the `IssueManagerInterface` with all 9 methods
- [ ] Issue IDs are unique and backend-determined within the project (`issue-N` for file, `bd-XXXXXX` for beads)
- [ ] Epic IDs are unique and backend-determined within the project (`epic-N` for file)
- [ ] Status transitions are enforced: closed issues cannot be updated
- [ ] Blocking dependencies prevent close with a clear error message
- [ ] Circular dependency detection prevents `addDependency` from creating cycles
- [ ] `list()` supports filtering by status, type, epicId, and planRef
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
