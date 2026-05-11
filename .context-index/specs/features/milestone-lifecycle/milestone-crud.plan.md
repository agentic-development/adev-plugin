# Implementation Plan: Milestone Create and List

> **Methodology:** adev
> **Charter:** .context-index/specs/features/milestone-lifecycle/charter.md
> **Spec:** .context-index/specs/features/milestone-lifecycle/milestone-crud.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-09)
> **Platform:** Node.js, JavaScript (ESM), npm, node:test

**Goal:** Implement `milestone create` and `milestone list` subcommands for `/adev:issues`, backed by a `milestones.yaml` file in `.context-index/` with auto-linked epics via the issue manager.

**Architecture:** The implementation adds a new `lib/milestones.mjs` module for YAML I/O (load, save, find) using the existing line-by-line YAML parsing pattern from `lib/repomap/index.mjs` and `lib/profiles/yaml.mjs`. The milestone subcommands extend `/adev:issues` SKILL.md with markdown instructions. Epic creation goes through the existing `getIssueManager(manifest)` abstraction from `lib/issues/registry.mjs`, maintaining backend agnosticism.

---

## File Structure

**Create:**
- `lib/milestones.mjs` — Milestone YAML I/O: `loadMilestones()`, `saveMilestones()`, `findMilestone()`
- `tests/milestones.test.mjs` — Unit tests for milestone I/O and command logic

**Modify:**
- `skills/issues/SKILL.md` — Add `milestone create` and `milestone list` subcommand documentation

**Reference (read, do not modify):**
- `lib/issues/registry.mjs` — `getIssueManager(manifest)` for epic creation
- `lib/issues/interface.mjs` — `createEpic()` API contract, `validateEpic()` shape
- `lib/issues/file-adapter.mjs` — `createEpic()` implementation for reference
- `lib/repomap/index.mjs` — Line-by-line YAML parsing pattern (`parseManifestYaml`)
- `lib/profiles/yaml.mjs` — `parseYaml()` zero-dep YAML parser (alternative reference)
- `tests/issues/unified-create.test.mjs` — Test pattern: temp dir setup, adapter init, assert
- `tests/helpers.mjs` — `createTempDir()`, `cleanupTempDir()`, `writeFixture()`

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/milestone-lifecycle/milestone-crud.spec.md` (Behaviors 1-4, Error Cases)
- Charter: `.context-index/specs/features/milestone-lifecycle/charter.md` (capability: Milestone Create, Domain Model: Milestone entity)
- Reference: `lib/repomap/index.mjs` (lines 100-140 — `parseManifestYaml` pattern for line-by-line YAML parsing)
- Reference: `lib/profiles/yaml.mjs` (lines 1-34 — `parseYaml` export pattern)
- Sample: `.context-index/samples/general-library-module-graph.md`

### Task 2 Context
- Spec: `.context-index/specs/features/milestone-lifecycle/milestone-crud.spec.md` (Behaviors 1-4, 8, Error Cases)
- Charter: `.context-index/specs/features/milestone-lifecycle/charter.md` (capability: Milestone Create, Interface Contracts)
- Reference: `lib/issues/registry.mjs` — `getIssueManager()` factory
- Reference: `lib/issues/interface.mjs` — `createEpic()` contract, `validateEpic()` shape
- Reference: `lib/issues/file-adapter.mjs:522-532` — `createEpic()` implementation

### Task 3 Context
- Spec: `.context-index/specs/features/milestone-lifecycle/milestone-crud.spec.md` (Behaviors 5-7, Error Cases)
- Charter: `.context-index/specs/features/milestone-lifecycle/charter.md` (capability: Milestone List, Interface Contracts: Consumed APIs)
- Reference: `lib/issues/interface.mjs` — `list()` and `listEpics()` methods

### Task 4 Context
- Spec: `.context-index/specs/features/milestone-lifecycle/milestone-crud.spec.md` (all Behaviors)
- Charter: `.context-index/specs/features/milestone-lifecycle/charter.md` (capabilities: Milestone Create, Milestone List)
- Reference: `skills/issues/SKILL.md` — existing subcommand documentation patterns

### Task 5 Context
- Spec: `.context-index/specs/features/milestone-lifecycle/milestone-crud.spec.md` (Acceptance Criteria, Error Cases)
- Reference: `tests/issues/unified-create.test.mjs` — test structure pattern
- Reference: `tests/helpers.mjs` — `createTempDir()`, `cleanupTempDir()`, `writeFixture()`

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3 (Task 2 depends on Task 1's YAML I/O; Task 3 depends on Task 1's `loadMilestones`)
- Group B (independent): Task 4 (SKILL.md updates — no file overlap with Group A)
- Group C (sequential after A): Task 5 (tests for Tasks 1-3)

Groups A and B can run in parallel. Group C runs after Group A.

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Milestone YAML schema and I/O | medium | unit | — | 1 create, 0 modify |
| 2 | `milestone create` command logic | medium | unit | Task 1 | 0 create, 1 modify |
| 3 | `milestone list` command logic | small | unit | Task 1 | 0 create, 1 modify |
| 4 | SKILL.md subcommand documentation | small | unit | — | 0 create, 1 modify |
| 5 | Tests for milestone I/O and commands | medium | unit | Task 1, Task 2, Task 3 | 1 create, 0 modify |

---

### Task 1: Milestone YAML Schema and I/O [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=4
**Rationale:** Fully specified YAML I/O with golden sample for library module pattern and minimal blast radius.

**Charter capability:** Milestone Create (schema and persistence layer)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/milestones.mjs`
- Test: `tests/milestones.test.mjs`

**Tests:** `tests/milestones.test.mjs`

**Context to load:**
- `.context-index/specs/features/milestone-lifecycle/milestone-crud.spec.md` (Behaviors 1-4, Error Cases)
- `lib/repomap/index.mjs` (line-by-line YAML parsing pattern)
- `lib/profiles/yaml.mjs` (`parseYaml` for reference)

- [ ] **Write failing test**

```javascript
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { loadMilestones, saveMilestones, findMilestone } from "../lib/milestones.mjs";

describe("loadMilestones", () => {
  let dir;
  before(() => { dir = mkdtempSync(join(tmpdir(), "milestone-io-test-")); });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("returns empty array when milestones.yaml does not exist", () => {
    const result = loadMilestones(dir);
    assert.deepStrictEqual(result, []);
  });
});

describe("saveMilestones", () => {
  let dir;
  before(() => { dir = mkdtempSync(join(tmpdir(), "milestone-save-test-")); });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("creates milestones.yaml with milestone entries", () => {
    const ms = [{ name: "v1.0.0", status: "planned", epic_id: "epic-1", target_date: null, ship_criteria: [] }];
    saveMilestones(dir, ms);
    assert.ok(existsSync(join(dir, ".context-index", "milestones.yaml")));
  });
});

describe("findMilestone", () => {
  let dir;
  before(() => {
    dir = mkdtempSync(join(tmpdir(), "milestone-find-test-"));
    saveMilestones(dir, [{ name: "v1", status: "planned", epic_id: "epic-1", target_date: null, ship_criteria: [] }]);
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("returns milestone by name", () => {
    const ms = findMilestone(dir, "v1");
    assert.equal(ms.name, "v1");
  });

  it("returns null for non-existent milestone", () => {
    const ms = findMilestone(dir, "nonexistent");
    assert.equal(ms, null);
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/milestones.test.mjs`
Expected: FAIL — `Cannot find module '../lib/milestones.mjs'`

- [ ] **Implement**

Create `lib/milestones.mjs` with:
- `loadMilestones(projectRoot)` — reads `.context-index/milestones.yaml`, parses YAML, returns array of milestone objects. Returns `[]` if file doesn't exist. Throws with code `PARSE_ERROR` if YAML is malformed.
- `saveMilestones(projectRoot, milestones)` — serializes milestone array to YAML and writes to `.context-index/milestones.yaml`. Creates `.context-index/` if needed.
- `findMilestone(projectRoot, name)` — calls `loadMilestones()` and returns the matching milestone or `null`.
- `validateMilestoneName(name)` — validates against regex `[a-zA-Z0-9._-]+`. Throws with code `INVALID_NAME` on failure.
- `validateTargetDate(dateStr)` — validates `YYYY-MM-DD` format. Throws with code `INVALID_DATE` on failure.

YAML structure for `milestones.yaml`:
```yaml
milestones:
  - name: v1.0.0
    status: planned
    target_date: 2026-06-01
    epic_id: epic-42
    ship_criteria: []
```

Use Node.js built-ins only (`fs`, `path`). Implement simple line-by-line YAML serialization/parsing following the pattern in `lib/repomap/index.mjs`.

- [ ] **Verify test passes**

Run: `node --test tests/milestones.test.mjs`
Expected: PASS

- [ ] **Commit**

Branch (if not already created): `feat/v1-charters`

```bash
git add lib/milestones.mjs tests/milestones.test.mjs
git commit -m "feat(milestone-lifecycle): add milestone YAML schema and I/O module

Implement loadMilestones, saveMilestones, findMilestone with
name/date validation. Zero external dependencies — uses
line-by-line YAML parsing.

Spec: .context-index/specs/features/milestone-lifecycle/milestone-crud.spec.md
Plan-task: 1"
```

---

### Task 2: `milestone create` Command Logic [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=5 pattern=3 blast=5 novelty=4
**Rationale:** Comprehensive spec with explicit error codes and acceptance criteria; follows standard validate-load-save-integrate pattern.

**Charter capability:** Milestone Create
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: `lib/milestones.mjs` (add `milestoneCreate()` function)
- Test: `tests/milestones.test.mjs`

**Tests:** `tests/milestones.test.mjs`

**Context to load:**
- `.context-index/specs/features/milestone-lifecycle/milestone-crud.spec.md` (Behaviors 1-4, 8, Error Cases)
- `lib/issues/registry.mjs` — `getIssueManager()` factory
- `lib/issues/interface.mjs` — `createEpic()` contract

- [ ] **Write failing test**

```javascript
describe("milestoneCreate", () => {
  let dir;
  before(() => { dir = mkdtempSync(join(tmpdir(), "milestone-create-test-")); });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("creates milestone entry and writes to YAML", async () => {
    const mockManager = { createEpic: async (data) => ({ id: "epic-1", ...data }) };
    const result = await milestoneCreate(dir, "v1.0.0", { issueManager: mockManager });
    assert.equal(result.name, "v1.0.0");
    assert.equal(result.status, "planned");
    assert.ok(result.epic_id);
  });

  it("updates existing milestone idempotently (no duplicate)", async () => {
    const mockManager = { createEpic: async (data) => ({ id: "epic-2", ...data }) };
    await milestoneCreate(dir, "v2", { issueManager: mockManager });
    await milestoneCreate(dir, "v2", { issueManager: mockManager, targetDate: "2026-07-01" });
    const milestones = loadMilestones(dir);
    const v2s = milestones.filter(m => m.name === "v2");
    assert.equal(v2s.length, 1);
    assert.equal(v2s[0].target_date, "2026-07-01");
  });

  it("rejects missing name", async () => {
    await assert.rejects(() => milestoneCreate(dir, "", {}), { code: "MISSING_NAME" });
  });

  it("rejects invalid name", async () => {
    await assert.rejects(() => milestoneCreate(dir, "bad name!", {}), { code: "INVALID_NAME" });
  });

  it("rejects invalid date", async () => {
    const mockManager = { createEpic: async (data) => ({ id: "epic-3", ...data }) };
    await assert.rejects(
      () => milestoneCreate(dir, "v3", { issueManager: mockManager, targetDate: "not-a-date" }),
      { code: "INVALID_DATE" }
    );
  });

  it("writes milestone without epic when no issue manager provided", async () => {
    const result = await milestoneCreate(dir, "v4", {});
    assert.equal(result.name, "v4");
    assert.equal(result.epic_id, null);
  });

  it("writes milestone with epic_id null when createEpic throws", async () => {
    const mockManager = { createEpic: async () => { throw new Error("backend down"); } };
    const result = await milestoneCreate(dir, "v5", { issueManager: mockManager });
    assert.equal(result.epic_id, null);
  });

  it("populates ship_criteria from check and confirm options", async () => {
    const mockManager = { createEpic: async (data) => ({ id: "epic-6", ...data }) };
    const result = await milestoneCreate(dir, "v6", {
      issueManager: mockManager,
      checks: ["all_issues_closed", "gates_pass"],
      confirms: ["CHANGELOG updated"],
    });
    assert.equal(result.ship_criteria.length, 3);
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/milestones.test.mjs`
Expected: FAIL — `milestoneCreate is not defined`

- [ ] **Implement**

Add `milestoneCreate(projectRoot, name, options)` to `lib/milestones.mjs`:
- Validate name (non-empty, matches regex `[a-zA-Z0-9._-]+`). Throw `MISSING_NAME` / `INVALID_NAME`.
- Validate `targetDate` if provided. Throw `INVALID_DATE`.
- Load existing milestones. Check if name exists (idempotent update path).
- If new: create epic via `issueManager.createEpic({ title: name, milestone: name })`. On failure, set `epic_id: null` and warn. On no manager, set `epic_id: null` and warn `NO_BACKEND`.
- If existing: update fields (target_date, ship_criteria) without creating a new epic.
- Build milestone entry: `{ name, status: "planned", epic_id, target_date, ship_criteria }`.
- Save milestones to YAML.
- Return the created/updated milestone entry.

- [ ] **Verify test passes**

Run: `node --test tests/milestones.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/milestones.mjs tests/milestones.test.mjs
git commit -m "feat(milestone-lifecycle): add milestoneCreate with epic linking and idempotency

Handles name/date validation, auto-epic creation via issue
manager, graceful degradation on backend failure, and
ship criteria population.

Spec: .context-index/specs/features/milestone-lifecycle/milestone-crud.spec.md
Plan-task: 2"
```

---

### Task 3: `milestone list` Command Logic [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=3 blast=5 novelty=5
**Rationale:** Mechanical load-query-format pattern with fully specified behaviors and single-file scope.

**Charter capability:** Milestone List
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: `lib/milestones.mjs` (add `milestoneList()` function)
- Test: `tests/milestones.test.mjs`

**Tests:** `tests/milestones.test.mjs`

**Context to load:**
- `.context-index/specs/features/milestone-lifecycle/milestone-crud.spec.md` (Behaviors 5-7, Error Cases)
- `lib/issues/interface.mjs` — `list()` and `listEpics()` methods

- [ ] **Write failing test**

```javascript
describe("milestoneList", () => {
  let dir;
  before(() => { dir = mkdtempSync(join(tmpdir(), "milestone-list-test-")); });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("returns formatted table when milestones exist", async () => {
    saveMilestones(dir, [
      { name: "v1", status: "planned", epic_id: "epic-1", target_date: "2026-06-01", ship_criteria: [] },
    ]);
    const mockManager = {
      listEpics: async () => [{ id: "epic-1", title: "v1", status: "open" }],
      list: async (filters) => [{ id: "issue-1", status: "open" }, { id: "issue-2", status: "closed" }],
    };
    const output = await milestoneList(dir, { issueManager: mockManager });
    assert.ok(output.includes("v1"));
    assert.ok(output.includes("planned"));
  });

  it("returns help message when no milestones.yaml exists", async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "milestone-list-empty-"));
    try {
      const output = await milestoneList(emptyDir, {});
      assert.ok(output.includes("No milestones defined"));
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it("shows broken epic warning for non-existent epic", async () => {
    saveMilestones(dir, [
      { name: "v2", status: "planned", epic_id: "epic-999", target_date: null, ship_criteria: [] },
    ]);
    const mockManager = {
      listEpics: async () => [],
      list: async () => [],
    };
    const output = await milestoneList(dir, { issueManager: mockManager });
    assert.ok(output.includes("broken") || output.includes("(broken)"));
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/milestones.test.mjs`
Expected: FAIL — `milestoneList is not defined`

- [ ] **Implement**

Add `milestoneList(projectRoot, options)` to `lib/milestones.mjs`:
- Load milestones. If file doesn't exist, return the help message: "No milestones defined. Run `milestone create <name>` to create one."
- If YAML is malformed, throw with code `PARSE_ERROR`.
- For each milestone, query issue manager for epic existence and child issue counts.
- Format as a table with columns: Name, Status, Target Date, Epic ID, Progress (open/total).
- If a milestone's `epic_id` references a non-existent epic, show `epic-N (broken)` instead of progress.
- If no issue manager provided, show epic ID without progress counts.
- Return the formatted string.

- [ ] **Verify test passes**

Run: `node --test tests/milestones.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/milestones.mjs tests/milestones.test.mjs
git commit -m "feat(milestone-lifecycle): add milestoneList with progress and broken-epic detection

Displays milestones in table format with issue progress
from linked epics. Warns on broken epic references.

Spec: .context-index/specs/features/milestone-lifecycle/milestone-crud.spec.md
Plan-task: 3"
```

---

### Task 4: SKILL.md Subcommand Documentation [specialist: none]

**Routing:** auto-agent (score: 19/20)
**Scores:** spec=4 pattern=5 blast=5 novelty=5
**Rationale:** Pure documentation task following existing SKILL.md subcommand patterns with no code changes.

**Charter capability:** Milestone Create, Milestone List
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/issues/SKILL.md`
- Test: `tests/milestones.test.mjs` (no new tests — this is markdown documentation only)

**Tests:** `tests/milestones.test.mjs`

**Context to load:**
- `.context-index/specs/features/milestone-lifecycle/milestone-crud.spec.md` (all Behaviors)
- `skills/issues/SKILL.md` (existing subcommand documentation patterns)

- [ ] **Write failing test**

No code test needed — this task adds markdown instructions to SKILL.md. Verify manually that the new sections exist and follow the existing documentation pattern.

- [ ] **Implement**

Add to `skills/issues/SKILL.md`:

**`milestone create <name>` subcommand section:**
- Arguments: `<name>` (required), `--target <YYYY-MM-DD>` (optional), `--check <type>` (repeatable: `all_issues_closed`, `gates_pass`), `--confirm "<text>"` (repeatable)
- Behavior: creates `milestones.yaml` entry + linked epic, idempotent update on existing name
- Error cases with codes

**`milestone list` subcommand section:**
- No arguments
- Behavior: displays table with name, status, target date, epic ID, progress
- Handles missing file, broken epic references, malformed YAML

- [ ] **Verify — manual check**

Read the modified SKILL.md and verify the new sections follow existing patterns and cover all behaviors from the spec.

- [ ] **Commit**

```bash
git add skills/issues/SKILL.md
git commit -m "feat(milestone-lifecycle): document milestone create and list subcommands

Add subcommand sections to /adev:issues SKILL.md covering
arguments, behavior, and error cases for both commands.

Spec: .context-index/specs/features/milestone-lifecycle/milestone-crud.spec.md
Plan-task: 4"
```

---

### Task 5: Integration Tests for Milestone Commands [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=4
**Rationale:** Comprehensive acceptance criteria with direct test pattern references and single test file scope.

**Charter capability:** Milestone Create, Milestone List (testability attribute)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1, Task 2, Task 3
**Files:**
- Modify: `tests/milestones.test.mjs` (extend with integration-style tests)

**Tests:** `tests/milestones.test.mjs`

**Context to load:**
- `.context-index/specs/features/milestone-lifecycle/milestone-crud.spec.md` (Acceptance Criteria)
- `tests/issues/unified-create.test.mjs` — integration test pattern with FileAdapter
- `tests/helpers.mjs` — `createTempDir()`, `cleanupTempDir()`, `writeFixture()`

- [ ] **Write failing test**

```javascript
describe("milestone create + list integration", () => {
  let dir, adapter;

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), "milestone-integration-"));
    // Set up a minimal .context-index with tasks.md for FileAdapter
    writeFixture(dir, ".context-index/tasks/tasks.md", "## Epics\n\n| ID | Title | Status | Plan-Ref | Milestone | Created | Updated |\n|---|---|---|---|---|---|---|\n\n## Issues\n\n| ID | Title | Status | Priority | Type | Epic | Plan-Ref | Plan-Task | Spec-Ref | Deps | Notes | Next-Action | Created | Updated |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n");
    adapter = new FileAdapter(dir);
    await adapter.init();
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  it("full lifecycle: create → list → create again (idempotent)", async () => {
    // Create
    const ms1 = await milestoneCreate(dir, "v1.0.0", { issueManager: adapter, targetDate: "2026-06-01" });
    assert.equal(ms1.name, "v1.0.0");
    assert.equal(ms1.status, "planned");
    assert.ok(ms1.epic_id);

    // List
    const output = await milestoneList(dir, { issueManager: adapter });
    assert.ok(output.includes("v1.0.0"));
    assert.ok(output.includes("planned"));
    assert.ok(output.includes("2026-06-01"));

    // Create again (idempotent)
    const ms2 = await milestoneCreate(dir, "v1.0.0", { issueManager: adapter });
    assert.equal(ms2.epic_id, ms1.epic_id); // same epic, not duplicated
    const milestones = loadMilestones(dir);
    assert.equal(milestones.filter(m => m.name === "v1.0.0").length, 1);
  });

  it("create with ship criteria", async () => {
    const ms = await milestoneCreate(dir, "v2.0.0", {
      issueManager: adapter,
      checks: ["all_issues_closed", "gates_pass"],
      confirms: ["CHANGELOG updated"],
    });
    assert.equal(ms.ship_criteria.length, 3);
    assert.ok(ms.ship_criteria.some(c => c.check === "all_issues_closed"));
    assert.ok(ms.ship_criteria.some(c => c.confirm === "CHANGELOG updated"));
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/milestones.test.mjs`
Expected: FAIL — some integration tests may fail if earlier tasks are not yet wired

- [ ] **Implement**

Fix any gaps discovered during integration testing. Ensure all acceptance criteria from the spec are covered:
- `milestone create v1.0.0` creates YAML + linked epic
- `milestone create v1.0.0` a second time updates without duplicating
- `milestone create v1.0.0 --target 2026-06-01` stores target date
- Ship criteria population
- `milestone list` displays all milestones with status, date, epic ID, progress
- `milestone list` warns on broken epic references
- `milestone list` with no milestones.yaml prints help message
- All error cases return expected error codes
- `loadMilestones`, `saveMilestones`, `findMilestone` are exported and independently testable

- [ ] **Verify test passes**

Run: `node --test tests/milestones.test.mjs`
Expected: PASS

Run full quality gates: `npm test`
Expected: PASS (no regressions)

- [ ] **Commit**

```bash
git add tests/milestones.test.mjs
git commit -m "test(milestone-lifecycle): add integration tests for create and list

Covers full lifecycle, idempotency, ship criteria, broken
epic detection, and all error cases from the spec.

Spec: .context-index/specs/features/milestone-lifecycle/milestone-crud.spec.md
Plan-task: 5"
```

---

## Quality Gates

After all tasks are complete, run the full quality gate suite:

- [ ] Tests pass: `npm test`
- [ ] All acceptance criteria from spec satisfied
