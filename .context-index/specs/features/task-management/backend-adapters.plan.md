<!-- DO NOT EDIT statuses inline — see lifecycle log backend-adapters.jsonl -->
# Implementation Plan: Backend Adapters and Registry

> **Methodology:** adev
> **Charter:** .context-index/specs/features/task-management/charter.md
> **Spec:** .context-index/specs/features/task-management/backend-adapters.spec.md
> **Review:** PASS_WITH_NOTES (2026-03-31)
> **Platform:** none, javascript (ESM), node:test

**Goal:** Implement the file-based adapter (markdown table storage), beads_rust adapter (`br` CLI wrapper), and the registry that selects the active backend from manifest config.

**Architecture:** Follows `lib/provider/registry.mjs` pattern for adapter selection. File adapter reads/writes `.context-index/tasks/tasks.md` as a structured markdown file with two tables (epics and issues). Beads adapter wraps `br` CLI using `execFileSync` with array arguments (no shell interpolation). Beads adapter delegates epic operations to a file adapter instance (hybrid approach per SA-5 resolution).

---

## File Structure

**Create:**
- `lib/issues/file-adapter.mjs` — File-based adapter with markdown table parse/serialize
- `lib/issues/beads-adapter.mjs` — beads_rust CLI wrapper
- `lib/issues/registry.mjs` — Manifest-driven adapter selection
- `tests/lib/issues-file-adapter.test.mjs` — File adapter unit tests
- `tests/lib/issues-beads-adapter.test.mjs` — Beads adapter unit tests
- `tests/lib/issues-registry.test.mjs` — Registry unit tests

**Modify:**
- `templates/manifest-template.yaml` — Add `tasks:` config section
- `.gitignore` — Add `.beads-map.json` pattern

**Reference (read, do not modify):**
- `lib/issues/interface.mjs` — Interface contract (from issue-epic-crud plan)
- `lib/provider/registry.mjs` — Registry pattern reference
- `lib/source-manifest.mjs` — Module pattern reference

## Context Packets

### Task 1 Context
- Spec: `backend-adapters.md` (Behaviors 1-6, File Backend)
- Spec: `issue-epic-crud.md` (Issue/Epic data shapes)
- Reference: `lib/source-manifest.mjs` (Node.js built-in file operations)

### Task 2 Context
- Spec: `backend-adapters.md` (Behaviors 1-6, error cases)
- Test reference: `tests/lib/source-manifest.test.mjs` (test pattern)

### Task 3 Context
- Spec: `backend-adapters.md` (Behaviors 7-13, Beads Backend)
- Security: SEC-1 resolution — must use `execFileSync` with array args

### Task 4 Context
- Spec: `backend-adapters.md` (Behaviors 14-18, Registry)
- Reference: `lib/provider/registry.mjs` (registry pattern)

### Task 5 Context
- Spec: `backend-adapters.md` (Manifest config acceptance criteria)

## Parallelization

- Group A (sequential): Task 1 → Task 2 (file adapter + tests)
- Group B (sequential): Task 3 (beads adapter, depends on Task 1 for file adapter import)
- Group C (sequential): Task 4 (registry, depends on Task 1 and Task 3)
- Group D (independent): Task 5 (manifest template, no code deps)

Group D can run in parallel with Groups A-C.

---

### Task 1: File Adapter Implementation [specialist: none]

**Charter capability:** File Backend
**Files:**
- Create: `lib/issues/file-adapter.mjs`
- Test: `tests/lib/issues-file-adapter.test.mjs`

**Tests:** `tests/lib/issues-file-adapter.test.mjs`

- [ ] **Write failing test**

```javascript
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FileAdapter } from "../../lib/issues/file-adapter.mjs";

describe("FileAdapter", () => {
  let dir, adapter;
  before(() => {
    dir = mkdtempSync(join(tmpdir(), "file-adapter-test-"));
    adapter = new FileAdapter(dir);
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("initializes tasks.md with empty tables", async () => {
    await adapter.init();
    const content = readFileSync(join(dir, ".context-index", "tasks", "tasks.md"), "utf8");
    assert.ok(content.includes("# Issue Board"));
    assert.ok(content.includes("| ID |"));
  });

  it("creates an issue and assigns unique ID", async () => {
    const issue = await adapter.create({ title: "Fix bug", type: "bug" });
    assert.equal(issue.id, "issue-1");
    assert.equal(issue.status, "open");
  });

  it("lists issues with filter", async () => {
    const issues = await adapter.list({ status: "open" });
    assert.equal(issues.length, 1);
    assert.equal(issues[0].title, "Fix bug");
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/issues-file-adapter.test.mjs`
Expected: FAIL — module not found

- [ ] **Implement**

Create `lib/issues/file-adapter.mjs`:
- `FileAdapter` class implementing `IssueManagerInterface`
- `init(projectRoot)` — creates `.context-index/tasks/tasks.md` with empty epic and issue tables
- `parseBoard(content)` — parses markdown tables into epic/issue arrays
- `serializeBoard(epics, issues)` — serializes back to markdown
- `create(issue)` — validates, assigns `issue-N` ID, appends row, writes via temp-file-then-rename
- `update(id, changes)` — validates status transition, modifies row, writes
- `close(id, reason)` — checks close-guard, updates status, appends reason to notes
- `list(filters)` — parses board, filters by status/type/epicId/planRef, sorts by priority then created
- `get(id)` — parses board, returns matching issue or null
- `createEpic(epic)` — validates, assigns `epic-N` ID, appends row
- `updateEpic(id, changes)` — modifies epic row
- `addDependency(issueId, dependsOnId)` — detects cycles, appends to deps column

Markdown table format:
```markdown
# Issue Board

## Epics

| ID | Title | Status | Plan-Ref | Created | Updated |
|----|-------|--------|----------|---------|---------|

## Issues

| ID | Title | Status | Priority | Type | Epic | Plan-Ref | Plan-Task | Deps | Notes | Created | Updated |
|----|-------|--------|----------|------|------|----------|-----------|------|-------|---------|---------|
```

- [ ] **Verify test passes**
- [ ] **Commit**

```bash
git add lib/issues/file-adapter.mjs tests/lib/issues-file-adapter.test.mjs
git commit -m "feat(task-management): implement file-based issue adapter"
```

### Task 2: File Adapter Full Test Coverage [specialist: none]

**Charter capability:** File Backend
**Depends on:** Task 1
**Files:**
- Modify: `tests/lib/issues-file-adapter.test.mjs`

**Tests:** `tests/lib/issues-file-adapter.test.mjs`

- [ ] **Write failing test**

Add test cases for:
- Epic CRUD (create, update, list)
- Issue update and close
- Close guard (blocked by dependencies)
- Dependency management (add, cycle detection)
- Parse/serialize round-trip (create issues → read file → parse → verify identical objects)
- Filter combinations (status + type, epicId, planRef)
- Error cases: missing title, update closed issue, set status to closed via update
- File recovery: corrupted/empty tasks.md

- [ ] **Verify test fails**
- [ ] **Implement** — Fix any adapter issues revealed by the expanded tests
- [ ] **Verify test passes**
- [ ] **Commit**

```bash
git add tests/lib/issues-file-adapter.test.mjs lib/issues/file-adapter.mjs
git commit -m "test(task-management): full file adapter test coverage"
```

### Task 3: Beads Adapter Implementation [specialist: none]

**Charter capability:** Beads Backend
**Depends on:** Task 1 (imports FileAdapter for epic delegation)
**Files:**
- Create: `lib/issues/beads-adapter.mjs`
- Create: `tests/lib/issues-beads-adapter.test.mjs`

**Tests:** `tests/lib/issues-beads-adapter.test.mjs`

- [ ] **Write failing test**

```javascript
import { describe, it, before, after, mock } from "node:test";
import assert from "node:assert/strict";

describe("BeadsAdapter", () => {
  it("constructs correct br create command", async () => {
    // Mock execFileSync to capture args
    // Verify: execFileSync("br", ["create", "Fix bug", "--type", "bug", "--priority", "2", "--json"])
  });

  it("delegates epic operations to file adapter", async () => {
    // Verify createEpic calls FileAdapter.createEpic
  });

  it("throws BEADS_NOT_AVAILABLE when br is not on PATH", () => {
    // Mock which/where to return not-found
  });

  it("maintains beads-map.json mapping", async () => {
    // Verify create stores issue-N → bd-XXXXXX mapping
  });

  it("uses execFileSync with array args (no shell injection)", () => {
    // Verify args are array, not interpolated string
    // Test with malicious title: 'test"; rm -rf /'
  });
});
```

- [ ] **Verify test fails**
- [ ] **Implement**

Create `lib/issues/beads-adapter.mjs`:
- `BeadsAdapter` class implementing `IssueManagerInterface`
- Constructor: detect `br` via `execFileSync("which", ["br"])`, throw `BEADS_NOT_AVAILABLE` if not found
- All `br` invocations use `execFileSync` with array arguments (SEC-1 compliance)
- `create()` — runs `br create`, parses JSON output, stores ID mapping in `.beads-map.json`
- `update()` — maps issue ID → beads ID, runs `br update`
- `close()` — maps and runs `br close`
- `list()` — runs `br list --json`, maps IDs back, filters in-process
- `get()` — runs `br list --json`, finds by mapped ID
- `createEpic()` / `updateEpic()` — delegates to internal `FileAdapter` instance
- `addDependency()` — maps both IDs, runs `br dep add`
- `_readMap()` / `_writeMap()` — JSON read/write for `.context-index/tasks/.beads-map.json`
- `_rebuildMap()` — fallback when map is missing, matches by title (best-effort)

- [ ] **Verify test passes**
- [ ] **Commit**

```bash
git add lib/issues/beads-adapter.mjs tests/lib/issues-beads-adapter.test.mjs
git commit -m "feat(task-management): implement beads_rust issue adapter"
```

### Task 4: Registry Implementation [specialist: none]

**Charter capability:** Backend Registry
**Depends on:** Task 1, Task 3
**Files:**
- Create: `lib/issues/registry.mjs`
- Create: `tests/lib/issues-registry.test.mjs`

**Tests:** `tests/lib/issues-registry.test.mjs`

- [ ] **Write failing test**

```javascript
describe("getIssueManager", () => {
  it("returns FileAdapter when backend is 'file'", () => {
    const manager = getIssueManager({ tasks: { backend: "file" } });
    assert.equal(manager.name, "file");
  });

  it("returns FileAdapter when tasks config is absent", () => {
    const manager = getIssueManager({});
    assert.equal(manager.name, "file");
  });

  it("throws UNKNOWN_BACKEND for invalid backend", () => {
    assert.throws(
      () => getIssueManager({ tasks: { backend: "jira" } }),
      (err) => err.code === "UNKNOWN_BACKEND"
    );
  });

  it("falls back to FileAdapter when beads is configured but br not available", () => {
    // Mock br detection to fail
    const manager = getIssueManager({ tasks: { backend: "beads" } });
    assert.equal(manager.name, "file");
  });
});
```

- [ ] **Verify test fails**
- [ ] **Implement**

Create `lib/issues/registry.mjs` following `lib/provider/registry.mjs` pattern:
- `getIssueManager(manifest, projectRoot)` — reads `tasks.backend`, validates against allowlist `["file", "beads"]`
- Default: `"file"`
- Beads: attempt construction, catch `BEADS_NOT_AVAILABLE`, fallback with `console.warn`
- Returns adapter instance

- [ ] **Verify test passes**
- [ ] **Commit**

```bash
git add lib/issues/registry.mjs tests/lib/issues-registry.test.mjs
git commit -m "feat(task-management): implement issue backend registry"
```

### Task 5: Manifest Template Config [specialist: none]

**Charter capability:** Backend Registry
**Files:**
- Modify: `templates/manifest-template.yaml`
- Modify: `.gitignore`

**Tests:** `tests/lib/issues-registry.test.mjs` (verify config parsing)

- [ ] **Write failing test**

```javascript
it("parses tasks.backend from manifest yaml", () => {
  // Read manifest-template.yaml, verify tasks section exists
  const content = readFileSync(join(PLUGIN_ROOT, "templates", "manifest-template.yaml"), "utf8");
  assert.ok(content.includes("tasks:"));
  assert.ok(content.includes("backend: file"));
});
```

- [ ] **Verify test fails**
- [ ] **Implement**

Add to `templates/manifest-template.yaml` after the `completion:` section:

```yaml
# ============================================================================
# Task Management
# Controls how /adev:plan and /adev:implement track issue progress.
# ============================================================================

tasks:
  # Backend for issue tracking:
  #   file  — markdown table in .context-index/tasks/ (default, zero setup)
  #   beads — beads_rust CLI (br), local-first git-native issue tracker
  #           Install: https://github.com/Dicklesworthstone/beads_rust
  backend: file
```

Add to `.gitignore`:
```
# Beads adapter ID mapping (local state, auto-recoverable)
.beads-map.json
```

- [ ] **Verify test passes**
- [ ] **Commit**

```bash
git add templates/manifest-template.yaml .gitignore tests/lib/issues-registry.test.mjs
git commit -m "feat(task-management): add tasks config to manifest template"
```

---

## Quality Gates

- Tests pass: `npm test`
- All acceptance criteria from spec satisfied
