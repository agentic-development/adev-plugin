<!-- DO NOT EDIT statuses inline — see lifecycle log milestone-defer.jsonl -->
# Implementation Plan: Milestone Defer

> **Methodology:** adev
> **Charter:** .context-index/specs/features/milestone-lifecycle/charter.md
> **Spec:** .context-index/specs/features/milestone-lifecycle/milestone-defer.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-09)
> **Platform:** Node.js, JavaScript (ESM), npm, node:test

**Goal:** Implement `milestoneDefer` command to set milestone status to `deferred` with a reason, including YAML serialization of the `defer_reason` field and optional epic status update.

**Architecture:** Adds `milestoneDefer()` to `lib/milestones.mjs`. Extends `saveMilestones()` and `loadMilestones()` to handle the new `defer_reason` field with proper YAML quoting. Epic status update goes through the existing issue manager abstraction via `updateEpic()`.

---

## File Structure

**Create:**
- (none)

**Modify:**
- `lib/milestones.mjs` — Add `milestoneDefer()` export; extend `saveMilestones()`/`loadMilestones()` for `defer_reason` field
- `skills/issues/SKILL.md` — Add `milestone defer` subcommand documentation
- `tests/milestones.test.mjs` — Add defer tests

**Reference (read, do not modify):**
- `lib/issues/interface.mjs` — `updateEpic()` contract
- `.context-index/specs/features/milestone-lifecycle/milestone-ship.spec.md` — Sibling spec for consistency

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/milestone-lifecycle/milestone-defer.spec.md` (all Behaviors, Error Cases, Implementation Notes)
- Charter: `.context-index/specs/features/milestone-lifecycle/charter.md` (capability: Milestone Defer)
- Reference: `lib/milestones.mjs` — existing `saveMilestones()`/`loadMilestones()` serialization
- Reference: `lib/issues/interface.mjs` — `updateEpic()` contract

### Task 2 Context
- Spec: `.context-index/specs/features/milestone-lifecycle/milestone-defer.spec.md` (all Behaviors)
- Reference: `skills/issues/SKILL.md` — existing subcommand documentation patterns

### Task 3 Context
- Spec: `.context-index/specs/features/milestone-lifecycle/milestone-defer.spec.md` (Acceptance Criteria, Error Cases)
- Reference: `tests/milestones.test.mjs` — existing test patterns

## Parallelization

- Group A (sequential): Task 1 (code + serializer changes)
- Group B (independent): Task 2 (SKILL.md — no file overlap)
- Group C (sequential after A): Task 3 (tests for Task 1)

Groups A and B can run in parallel. Group C runs after Group A.

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | `milestoneDefer` function + serializer extension | medium | unit | — | 0 create, 1 modify |
| 2 | SKILL.md `milestone defer` documentation | small | unit | — | 0 create, 1 modify |
| 3 | Tests for milestone defer | small | unit | Task 1 | 0 create, 1 modify |

---

### Task 1: `milestoneDefer` Function + Serializer Extension [specialist: none]

**Charter capability:** Milestone Defer
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/milestones.mjs` (add `milestoneDefer()`, extend `saveMilestones()`/`loadMilestones()` for `defer_reason`)
- Test: `tests/milestones.test.mjs`

**Tests:** `tests/milestones.test.mjs`

- [ ] **Write failing test**

```javascript
describe("milestoneDefer", () => {
  let dir;
  before(() => { dir = mkdtempSync(join(tmpdir(), "milestone-defer-test-")); });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("defers milestone with reason", async () => {
    saveMilestones(dir, [{ name: "v1", status: "planned", epic_id: "epic-1", target_date: null, ship_criteria: [] }]);
    const mockManager = { updateEpic: async () => {} };
    const result = await milestoneDefer(dir, "v1", "Pushed to Q3", { issueManager: mockManager });
    assert.equal(result.status, "deferred");
    assert.equal(result.defer_reason, "Pushed to Q3");
    const ms = findMilestone(dir, "v1");
    assert.equal(ms.status, "deferred");
    assert.equal(ms.defer_reason, "Pushed to Q3");
  });

  it("rejects shipped milestone with ALREADY_SHIPPED", async () => {
    saveMilestones(dir, [{ name: "v2", status: "shipped", epic_id: "epic-2", target_date: null, ship_criteria: [] }]);
    await assert.rejects(() => milestoneDefer(dir, "v2", "Too late", {}), { code: "ALREADY_SHIPPED" });
  });

  it("idempotently re-defers with updated reason", async () => {
    saveMilestones(dir, [{ name: "v3", status: "deferred", epic_id: "epic-3", target_date: null, ship_criteria: [], defer_reason: "Old reason" }]);
    const mockManager = { updateEpic: async () => {} };
    const result = await milestoneDefer(dir, "v3", "New reason", { issueManager: mockManager });
    assert.equal(result.defer_reason, "New reason");
  });

  it("rejects missing reason with MISSING_REASON", async () => {
    await assert.rejects(() => milestoneDefer(dir, "v1", "", {}), { code: "MISSING_REASON" });
  });

  it("rejects not-found milestone", async () => {
    await assert.rejects(() => milestoneDefer(dir, "nope", "reason", {}), { code: "MILESTONE_NOT_FOUND" });
  });

  it("defers without epic update when no issue manager", async () => {
    saveMilestones(dir, [{ name: "v4", status: "planned", epic_id: "epic-4", target_date: null, ship_criteria: [] }]);
    const result = await milestoneDefer(dir, "v4", "No backend", {});
    assert.equal(result.status, "deferred");
  });

  it("warns but does not roll back when epic update fails", async () => {
    saveMilestones(dir, [{ name: "v5", status: "planned", epic_id: "epic-5", target_date: null, ship_criteria: [] }]);
    const mockManager = { updateEpic: async () => { throw new Error("backend down"); } };
    const result = await milestoneDefer(dir, "v5", "Epic fail", { issueManager: mockManager });
    assert.equal(result.status, "deferred");
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/milestones.test.mjs`
Expected: FAIL — `milestoneDefer is not defined`

- [ ] **Implement**

1. Extend `loadMilestones()` to include `defer_reason` field (defaults to `null`).
2. Extend `saveMilestones()` to serialize `defer_reason` with YAML quoting (like `confirm`).
3. Add `milestoneDefer(projectRoot, name, reason, options)` to `lib/milestones.mjs`:
   - Validate name (reuse `validateMilestoneName`).
   - Validate reason is non-empty. Throw MISSING_REASON if empty/null.
   - Load milestone via `findMilestone`. Throw MILESTONE_NOT_FOUND if absent.
   - If `status === "shipped"`, throw ALREADY_SHIPPED.
   - Update `status` to `"deferred"`, set `defer_reason`.
   - Save via `saveMilestones`.
   - If `issueManager` available, call `issueManager.updateEpic(epic_id, { status: "deferred" })`. On failure, warn but don't roll back.
   - Return updated milestone entry.

- [ ] **Verify test passes**

Run: `node --test tests/milestones.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/milestones.mjs tests/milestones.test.mjs
git commit -m "feat(milestone-lifecycle): add milestoneDefer with reason and epic sync

Defers milestones with required reason, rejects shipped
milestones, idempotent re-defer. Extends YAML serializer
for defer_reason with quoting.

Spec: .context-index/specs/features/milestone-lifecycle/milestone-defer.spec.md
Plan-task: 1"
```

---

### Task 2: SKILL.md `milestone defer` Documentation [specialist: none]

**Charter capability:** Milestone Defer
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/issues/SKILL.md`
- Test: `tests/milestones.test.mjs` (no new tests)

**Tests:** `tests/milestones.test.mjs`

- [ ] **Write failing test**

No code test — documentation only.

- [ ] **Implement**

Add `milestone defer <name> --reason "<text>"` subcommand section to `skills/issues/SKILL.md`:
- Arguments: `<name>` (required), `--reason "<text>"` (required)
- Behavior: validate → load → check status → update YAML → update epic
- Status guards (shipped → reject)
- Idempotent re-defer
- Error cases with codes

- [ ] **Verify — manual check**

Read modified SKILL.md and verify new section follows existing patterns.

- [ ] **Commit**

```bash
git add skills/issues/SKILL.md
git commit -m "feat(milestone-lifecycle): document milestone defer subcommand

Add milestone defer section to /adev:issues SKILL.md covering
arguments, status guards, and error cases.

Spec: .context-index/specs/features/milestone-lifecycle/milestone-defer.spec.md
Plan-task: 2"
```

---

### Task 3: Tests for Milestone Defer [specialist: none]

**Charter capability:** Milestone Defer (testability attribute)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: `tests/milestones.test.mjs`

**Tests:** `tests/milestones.test.mjs`

- [ ] **Write failing test**

```javascript
describe("milestone defer integration", () => {
  it("defer_reason round-trips through save/load", async () => {
    // Save with defer_reason, load, verify it persists
  });

  it("all defer error codes match spec", async () => {
    // MISSING_NAME, INVALID_NAME, MILESTONE_NOT_FOUND, MISSING_REASON, ALREADY_SHIPPED
  });
});
```

- [ ] **Verify test fails / passes**

Run: `node --test tests/milestones.test.mjs`

Run full quality gates: `npm test`
Expected: PASS (no regressions)

- [ ] **Commit**

```bash
git add tests/milestones.test.mjs
git commit -m "test(milestone-lifecycle): add defer integration and round-trip tests

Covers defer_reason YAML persistence, status guards, and
all error codes from the spec.

Spec: .context-index/specs/features/milestone-lifecycle/milestone-defer.spec.md
Plan-task: 3"
```

---

## Quality Gates

After all tasks are complete, run the full quality gate suite:

- [ ] Tests pass: `npm test`
- [ ] All acceptance criteria from spec satisfied
