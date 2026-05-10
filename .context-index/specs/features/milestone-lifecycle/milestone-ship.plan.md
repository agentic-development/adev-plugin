# Implementation Plan: Milestone Ship and Ship Criteria Evaluation

> **Methodology:** adev
> **Charter:** .context-index/specs/features/milestone-lifecycle/charter.md
> **Spec:** .context-index/specs/features/milestone-lifecycle/milestone-ship.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-09)
> **Platform:** Node.js, JavaScript (ESM), npm, node:test

**Goal:** Implement `evaluateShipCriteria` for auto-checking ship readiness and `milestoneShip` for orchestrating the full ship flow (criteria evaluation, git tagging, epic close, optional GitHub release).

**Architecture:** Adds `evaluateShipCriteria()` and `milestoneShip()` to the existing `lib/milestones.mjs` module. Ship criteria evaluation is a pure query function that checks `all_issues_closed` via issue manager and `gates_pass` via `execFile` (following `lib/governance/quality-gate.mjs` pattern — `shell: false`, array args). Git tagging uses `execFileSync('git', ['tag', ...])`. GitHub release via `gh` CLI is optional with graceful degradation.

---

## File Structure

**Create:**
- (none — all code goes into existing files)

**Modify:**
- `lib/milestones.mjs` — Add `evaluateShipCriteria()` and `milestoneShip()` exports
- `skills/issues/SKILL.md` — Add `milestone ship` subcommand documentation
- `tests/milestones.test.mjs` — Add tests for ship criteria and milestone ship

**Reference (read, do not modify):**
- `lib/governance/quality-gate.mjs` — `execFile` with `shell: false` pattern for command execution
- `lib/issues/registry.mjs` — `getIssueManager()` for epic operations
- `lib/issues/interface.mjs` — `close()` and `list()` API contracts
- `.context-index/manifest.yaml` — `gates.test` for test command

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/milestone-lifecycle/milestone-ship.spec.md` (Behaviors 1-4, Error Cases: BROKEN_EPIC, CRITERIA_FAILED, NO_TEST_COMMAND)
- Charter: `.context-index/specs/features/milestone-lifecycle/charter.md` (capability: Ship Criteria Evaluation, Interface Contracts: evaluateShipCriteria)
- Reference: `lib/governance/quality-gate.mjs` (lines 13, 43-47 — execFile pattern with shell: false)
- Reference: `lib/issues/interface.mjs` — `list()` and `close()` contracts
- Reference: `.context-index/manifest.yaml` — `gates.test: "npm test"` structure

### Task 2 Context
- Spec: `.context-index/specs/features/milestone-lifecycle/milestone-ship.spec.md` (Behaviors 5-10, Error Cases: all)
- Charter: `.context-index/specs/features/milestone-lifecycle/charter.md` (capability: Milestone Ship, Invariants)
- Reference: `lib/milestones.mjs` — existing `milestoneCreate` pattern for validate-load-save flow

### Task 3 Context
- Spec: `.context-index/specs/features/milestone-lifecycle/milestone-ship.spec.md` (all Behaviors)
- Reference: `skills/issues/SKILL.md` — existing subcommand documentation patterns

### Task 4 Context
- Spec: `.context-index/specs/features/milestone-lifecycle/milestone-ship.spec.md` (Acceptance Criteria, Error Cases)
- Reference: `tests/milestones.test.mjs` — existing test patterns with mock issue manager

## Parallelization

- Group A (sequential): Task 1 → Task 2 (Task 2 calls evaluateShipCriteria from Task 1)
- Group B (independent): Task 3 (SKILL.md — no file overlap with Group A)
- Group C (sequential after A): Task 4 (tests for Tasks 1-2)

Groups A and B can run in parallel. Group C runs after Group A.

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | `evaluateShipCriteria` function | medium | unit | — | 0 create, 1 modify |
| 2 | `milestoneShip` command logic | large | unit | Task 1 | 0 create, 1 modify |
| 3 | SKILL.md `milestone ship` documentation | small | unit | — | 0 create, 1 modify |
| 4 | Tests for ship criteria and milestone ship | medium | unit | Task 1, Task 2 | 0 create, 1 modify |

---

### Task 1: `evaluateShipCriteria` Function [specialist: none]

**Charter capability:** Ship Criteria Evaluation
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/milestones.mjs` (add `evaluateShipCriteria()`)
- Test: `tests/milestones.test.mjs`

**Tests:** `tests/milestones.test.mjs`

**Context to load:**
- `.context-index/specs/features/milestone-lifecycle/milestone-ship.spec.md` (Behaviors 1-4, Error Cases)
- `lib/governance/quality-gate.mjs` (execFile pattern)

- [ ] **Write failing test**

```javascript
describe("evaluateShipCriteria", () => {
  it("returns passed: true when all issues closed", async () => {
    const milestone = { name: "v1", epic_id: "epic-1", ship_criteria: [{ check: "all_issues_closed" }] };
    const mockManager = {
      listEpics: async () => [{ id: "epic-1" }],
      list: async () => [{ id: "issue-1", status: "closed" }, { id: "issue-2", status: "closed" }],
    };
    const results = await evaluateShipCriteria(milestone, mockManager, {});
    assert.equal(results[0].passed, true);
  });

  it("returns passed: false when issues still open", async () => {
    const milestone = { name: "v1", epic_id: "epic-1", ship_criteria: [{ check: "all_issues_closed" }] };
    const mockManager = {
      listEpics: async () => [{ id: "epic-1" }],
      list: async () => [{ id: "issue-1", status: "open" }, { id: "issue-2", status: "closed" }],
    };
    const results = await evaluateShipCriteria(milestone, mockManager, {});
    assert.equal(results[0].passed, false);
    assert.ok(results[0].detail.includes("1"));
  });

  it("returns passed: null for confirm entries", async () => {
    const milestone = { name: "v1", epic_id: "epic-1", ship_criteria: [{ confirm: "CHANGELOG updated" }] };
    const mockManager = { listEpics: async () => [{ id: "epic-1" }] };
    const results = await evaluateShipCriteria(milestone, mockManager, {});
    assert.equal(results[0].passed, null);
    assert.equal(results[0].confirm, "CHANGELOG updated");
  });

  it("returns empty array when no ship_criteria", async () => {
    const milestone = { name: "v1", epic_id: "epic-1", ship_criteria: [] };
    const mockManager = { listEpics: async () => [{ id: "epic-1" }] };
    const results = await evaluateShipCriteria(milestone, mockManager, {});
    assert.deepStrictEqual(results, []);
  });

  it("throws BROKEN_EPIC when epic_id is null", async () => {
    const milestone = { name: "v1", epic_id: null, ship_criteria: [{ check: "all_issues_closed" }] };
    await assert.rejects(() => evaluateShipCriteria(milestone, {}, {}), { code: "BROKEN_EPIC" });
  });

  it("throws BROKEN_EPIC when epic not found", async () => {
    const milestone = { name: "v1", epic_id: "epic-999", ship_criteria: [{ check: "all_issues_closed" }] };
    const mockManager = { listEpics: async () => [] };
    await assert.rejects(() => evaluateShipCriteria(milestone, mockManager, {}), { code: "BROKEN_EPIC" });
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/milestones.test.mjs`
Expected: FAIL — `evaluateShipCriteria is not defined`

- [ ] **Implement**

Add `evaluateShipCriteria(milestone, issueManager, manifest)` to `lib/milestones.mjs`:
- Validate `epic_id` is non-null and exists via `issueManager.listEpics()`. Throw BROKEN_EPIC if missing.
- For each criterion in `ship_criteria`:
  - `{ check: "all_issues_closed" }`: query `issueManager.list({ epicId })`, count non-closed, return `{ check, passed, detail? }`.
  - `{ check: "gates_pass" }`: read `manifest.gates?.test`, if missing throw NO_TEST_COMMAND. Otherwise exec via `execFileSync` with `shell: false` (split command string on first space for executable + args). Return `{ check, passed, detail? }`.
  - `{ confirm: "<text>" }`: passthrough as `{ confirm, passed: null }`.
- Return results array.

Import `execFileSync` from `node:child_process`.

- [ ] **Verify test passes**

Run: `node --test tests/milestones.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/milestones.mjs tests/milestones.test.mjs
git commit -m "feat(milestone-lifecycle): add evaluateShipCriteria with auto-checks

Implements all_issues_closed (query epic issues), gates_pass
(execFile with shell:false), and confirm passthrough. Throws
BROKEN_EPIC on missing/null epic references.

Spec: .context-index/specs/features/milestone-lifecycle/milestone-ship.spec.md
Plan-task: 1"
```

---

### Task 2: `milestoneShip` Command Logic [specialist: none]

**Charter capability:** Milestone Ship
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: `lib/milestones.mjs` (add `milestoneShip()`)
- Test: `tests/milestones.test.mjs`

**Tests:** `tests/milestones.test.mjs`

**Context to load:**
- `.context-index/specs/features/milestone-lifecycle/milestone-ship.spec.md` (Behaviors 5-10, Error Cases)
- `lib/milestones.mjs` — existing `milestoneCreate` pattern

- [ ] **Write failing test**

```javascript
describe("milestoneShip", () => {
  let dir;
  before(() => { dir = mkdtempSync(join(tmpdir(), "milestone-ship-test-")); });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("ships milestone: updates status, closes epic, creates tag", async () => {
    saveMilestones(dir, [{ name: "v1.0.0", status: "planned", epic_id: "epic-1", target_date: null, ship_criteria: [] }]);
    const closedEpics = [];
    const mockManager = {
      listEpics: async () => [{ id: "epic-1" }],
      list: async () => [],
      close: async (id, reason) => { closedEpics.push({ id, reason }); },
    };
    const result = await milestoneShip(dir, "v1.0.0", {
      issueManager: mockManager,
      manifest: {},
      execGit: () => {}, // mock git tag
      confirmFn: async () => true,
    });
    assert.equal(result.shipped, true);
    assert.equal(closedEpics[0].id, "epic-1");
    const ms = findMilestone(dir, "v1.0.0");
    assert.equal(ms.status, "shipped");
  });

  it("is a no-op when already shipped", async () => {
    saveMilestones(dir, [{ name: "v0.9.0", status: "shipped", epic_id: "epic-2", target_date: null, ship_criteria: [] }]);
    const result = await milestoneShip(dir, "v0.9.0", { issueManager: {}, manifest: {} });
    assert.equal(result.shipped, true);
    assert.equal(result.skipped, true);
  });

  it("blocks when criteria fail", async () => {
    saveMilestones(dir, [{ name: "v2.0.0", status: "planned", epic_id: "epic-3", target_date: null, ship_criteria: [{ check: "all_issues_closed" }] }]);
    const mockManager = {
      listEpics: async () => [{ id: "epic-3" }],
      list: async () => [{ id: "issue-1", status: "open" }],
    };
    const result = await milestoneShip(dir, "v2.0.0", { issueManager: mockManager, manifest: {} });
    assert.equal(result.shipped, false);
  });

  it("rejects missing name", async () => {
    await assert.rejects(() => milestoneShip(dir, "", {}), { code: "MISSING_NAME" });
  });

  it("rejects not-found milestone", async () => {
    await assert.rejects(() => milestoneShip(dir, "nonexistent", { issueManager: {}, manifest: {} }), { code: "MILESTONE_NOT_FOUND" });
  });

  it("blocks when tag exists", async () => {
    saveMilestones(dir, [{ name: "v3.0.0", status: "planned", epic_id: "epic-4", target_date: null, ship_criteria: [] }]);
    const mockManager = {
      listEpics: async () => [{ id: "epic-4" }],
      list: async () => [],
      close: async () => {},
    };
    const result = await milestoneShip(dir, "v3.0.0", {
      issueManager: mockManager,
      manifest: {},
      execGit: () => { const e = new Error("tag exists"); e.code = "TAG_EXISTS"; throw e; },
      confirmFn: async () => true,
    });
    assert.equal(result.shipped, false);
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/milestones.test.mjs`
Expected: FAIL — `milestoneShip is not defined`

- [ ] **Implement**

Add `milestoneShip(projectRoot, name, options)` to `lib/milestones.mjs`:
- Validate name (reuse `validateMilestoneName`).
- Load milestone via `findMilestone`. Throw MILESTONE_NOT_FOUND if absent.
- If `status === "shipped"`, return `{ shipped: true, skipped: true }`.
- Run `evaluateShipCriteria(milestone, issueManager, manifest)`.
- Check auto-check results: if any `passed === false`, return `{ shipped: false, results }`.
- For `confirm` entries (passed === null), call `options.confirmFn(text)`. If any returns false, return `{ shipped: false }` with CONFIRM_REJECTED.
- Determine tag name: if name matches `/^v?\d+\.\d+\.\d+/`, compute tag (strip double `v`).
- Create git tag via `options.execGit` (default: `execFileSync('git', ['tag', tagName])`). If tag exists, return `{ shipped: false }` with TAG_EXISTS.
- Update milestone status to `shipped` via `saveMilestones`.
- Close epic via `issueManager.close(epicId, "Milestone shipped")`. On failure, warn (EPIC_CLOSE_FAILED) but don't roll back.
- Attempt GitHub release via `options.execGh` if available.
- Return `{ shipped: true, results, tag }`.

Make `execGit`, `execGh`, and `confirmFn` injectable via options for testability.

- [ ] **Verify test passes**

Run: `node --test tests/milestones.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/milestones.mjs tests/milestones.test.mjs
git commit -m "feat(milestone-lifecycle): add milestoneShip orchestrator

Ships milestones through criteria evaluation, git tagging,
status update, and epic close. Injectable execGit/confirmFn
for testability. Graceful degradation on GH release.

Spec: .context-index/specs/features/milestone-lifecycle/milestone-ship.spec.md
Plan-task: 2"
```

---

### Task 3: SKILL.md `milestone ship` Documentation [specialist: none]

**Charter capability:** Milestone Ship
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/issues/SKILL.md`
- Test: `tests/milestones.test.mjs` (no new tests — documentation only)

**Tests:** `tests/milestones.test.mjs`

- [ ] **Write failing test**

No code test needed — this task adds markdown instructions to SKILL.md.

- [ ] **Implement**

Add `milestone ship <name>` subcommand section to `skills/issues/SKILL.md`:
- Arguments: `<name>` (required)
- Behavior: validate → load → evaluate criteria → prompt confirms → tag → update status → close epic → optional GH release
- Ship criteria evaluation output format
- Semver tag naming (with/without `v` prefix)
- Graceful degradation when `gh` CLI not available
- Error cases with codes
- Implementation: call `milestoneShip(projectRoot, name, options)` from `lib/milestones.mjs`

- [ ] **Verify — manual check**

Read modified SKILL.md and verify new section follows existing patterns.

- [ ] **Commit**

```bash
git add skills/issues/SKILL.md
git commit -m "feat(milestone-lifecycle): document milestone ship subcommand

Add milestone ship section to /adev:issues SKILL.md covering
criteria evaluation, git tagging, and GitHub release flow.

Spec: .context-index/specs/features/milestone-lifecycle/milestone-ship.spec.md
Plan-task: 3"
```

---

### Task 4: Tests for Ship Criteria and Milestone Ship [specialist: none]

**Charter capability:** Ship Criteria Evaluation, Milestone Ship (testability attribute)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1, Task 2
**Files:**
- Modify: `tests/milestones.test.mjs` (extend with integration-style tests)

**Tests:** `tests/milestones.test.mjs`

- [ ] **Write failing test**

```javascript
describe("milestone ship integration", () => {
  it("full ship lifecycle with criteria", async () => {
    // Create milestone with criteria, ship it, verify all postconditions
  });

  it("gates_pass executes manifest.gates.test", async () => {
    // Test evaluateShipCriteria with gates_pass check and a mock exec
  });

  it("TAG_EXISTS blocks ship", async () => {
    // Verify tag conflict is handled correctly
  });

  it("EPIC_CLOSE_FAILED warns but does not roll back", async () => {
    // Verify partial success — tag created, status shipped, epic open
  });

  it("non-semver name skips tagging", async () => {
    // Verify no tag for names like "beta-1"
  });

  it("all error codes match spec", async () => {
    // Test MISSING_NAME, INVALID_NAME, MILESTONE_NOT_FOUND, BROKEN_EPIC
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/milestones.test.mjs`
Expected: FAIL if any integration gaps exist

- [ ] **Implement**

Fill in integration test bodies. Ensure all 15 acceptance criteria from spec are covered. Fix any gaps discovered during integration testing.

- [ ] **Verify test passes**

Run: `node --test tests/milestones.test.mjs`
Expected: PASS

Run full quality gates: `npm test`
Expected: PASS (no regressions)

- [ ] **Commit**

```bash
git add tests/milestones.test.mjs
git commit -m "test(milestone-lifecycle): add ship criteria and milestone ship tests

Covers full ship lifecycle, criteria evaluation, tag conflicts,
epic close failure, graceful degradation, and all error codes.

Spec: .context-index/specs/features/milestone-lifecycle/milestone-ship.spec.md
Plan-task: 4"
```

---

## Quality Gates

After all tasks are complete, run the full quality gate suite:

- [ ] Tests pass: `npm test`
- [ ] All acceptance criteria from spec satisfied
