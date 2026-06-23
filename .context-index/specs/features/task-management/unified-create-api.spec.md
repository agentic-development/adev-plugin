---
charter: task-management
status: validated
risk_level: medium
milestone:
revision: 1
charter-revision: 3
created: 2026-04-16
updated: 2026-04-16
depends-on: ["tiered-hierarchy-and-tree-walking", "next-action-and-type-fields"]
tracker-ref: epic-9
source-manifest:
  files:
    - path: lib/issues/interface.mjs
    - path: lib/issues/file-adapter.mjs
    - path: lib/issues/beads-adapter.mjs
    - path: lib/issues/id-utils.mjs
---

# Live Spec: Unified create() API

<!-- Replaces the separate createEpic() / createIssue() methods with a
     single create() that infers tier from parent_id. Deprecated methods
     are retained as thin wrappers for back-compat until next major version. -->

## Behavioral Contract

### Preconditions

- `tiered-hierarchy-and-tree-walking` spec implemented (id-utils, walkTree, cascade guard)
- `next-action-and-type-fields` spec implemented (free-text type, optional next_action)
- Current `createEpic()` and `createIssue()` (via `create()`) methods are validated and in use by skills

### Behaviors

#### Unified create()

1. **When** `IssueManager.create({ title, parent_id: "e1.f1", type: "task" })` is called **then** the adapter generates a child ID via `nextChildId("e1.f1", "t")`, sets `parent_id`, and returns the created WorkItem with the new tiered ID.

2. **When** `IssueManager.create({ title, type: "feature" })` is called without `parent_id` **then** the adapter treats it as a root-level item and generates a top-tier ID via `nextChildId(null, defaultRootPrefix)`. The default root prefix is `"e"` (Epic).

3. **When** `create()` is called with explicit `parent_id` **then** the tier prefix is inferred: tier depth of parent + 1 → prefix from `TierConfig`. For default config: parent at depth 1 (`e1`) → child prefix `"f"`; parent at depth 2 (`e1.f1`) → child prefix `"t"`.

4. **When** `create()` is called with a parent at the maximum tier depth defined by `TierConfig` (e.g., a Task in the default 3-tier config) **then** it throws `MAX_DEPTH_EXCEEDED` with message: `"Cannot create child of <parent-id>: parent is already at max tier depth (<depth>) per TierConfig. Extend tasks.tier_prefixes to add deeper tiers."` Deeper nesting requires explicit `TierConfig` extension via manifest; no auto-fallback.

5. **When** `create({ tier_prefix: "x", ... })` is called explicitly **then** the supplied prefix overrides automatic inference. The adapter validates the prefix exists in `TierConfig`.

6. **When** `create()` is called with all required fields **then** it validates via `validateIssue`, generates the ID, persists, and returns the created WorkItem with `created`/`updated` timestamps set.

#### Deprecated Wrappers

7. **When** legacy `createEpic({ title, milestone })` is called **then** it delegates to `create({ title, milestone, type: "epic" })` and returns the created item. The returned item uses a tiered root ID (`e<N>`) — NOT a legacy flat ID. New work created via the deprecated method still uses the new format.

8. **When** legacy `updateEpic(id, changes)` is called **then** it delegates to `update(id, changes)` and returns the updated item.

9. **When** a deprecation warning is enabled (default off; opt-in via `process.env.ADEV_DEPRECATION_WARN=1`) **then** calling `createEpic` or `updateEpic` emits a single `console.warn` per call: `"createEpic is deprecated; use create() instead. See task-management charter rev 3."`.

#### Spec-Created Items

10. **When** `/adev:specify` calls `create({ title, parent_id, type: "feature", spec_ref: "<path>" })` **then** the resulting Feature work item carries a `spec_ref` (a distinct new optional field on the WorkItem schema, separate from `plan_ref`) pointing to the authored Live Spec file. The `spec_ref` field is added to the schema by this spec; both file and beads adapters serialize it as a distinct column/metadata key. `plan_ref` continues to point at plan files; `spec_ref` points at spec files. They are not interchangeable.

11. **When** `/adev:plan` calls `create({ title, parent_id: "e1.f1", type: "task", plan_ref: "<path>", plan_task: <N> })` **then** the resulting Task carries the existing `plan_ref` and `plan_task` fields plus the new `parent_id`.

### Postconditions

- `lib/issues/interface.mjs` exposes `create(item)` and `update(id, changes)` as primary methods
- `createEpic` and `updateEpic` retained as thin delegating wrappers
- `lib/issues/file-adapter.mjs` and `lib/issues/beads-adapter.mjs` both implement the unified API
- All callers of `createEpic`/`createIssue` continue to work unchanged
- Skills (`/adev:specify`, `/adev:plan`, `/adev:issues`) updated incrementally to use unified `create()` directly (covered in respective module specs)

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `create()` with non-existent `parent_id` | Throws PARENT_NOT_FOUND | PARENT_NOT_FOUND |
| `create()` with `tier_prefix` not in TierConfig | Throws INVALID_TIER_PREFIX | INVALID_TIER_PREFIX |
| `create()` with both `parent_id` and explicit `id` that mismatch | Throws ID_MISMATCH | ID_MISMATCH |
| `create()` with parent at max tier depth | Throws MAX_DEPTH_EXCEEDED | MAX_DEPTH_EXCEEDED |
| `createEpic` called on adapter without epic-tier config | Falls back to default `e` prefix | — |

## System Constitution Reference

- **Principle 1 (Minimize external dependencies):** Pure JavaScript, no new deps.
- **Charter Quality Attribute (Backward Compatibility):** Existing skill code calling `createEpic`/`createIssue` continues to work; only the underlying ID format changes (tiered IDs for new work, legacy IDs preserved for existing items).
- **Charter Quality Attribute (Adaptability):** Unified API works at any tier depth; new tier conventions added via manifest config alone.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Implement `create()` in file adapter | Tier inference from parent_id, ID generation, validation, persist | medium |
| Implement `create()` in beads adapter | Same logic, translated to `br` CLI calls + parent_id metadata | medium |
| Refactor `createEpic`/`createIssue` to delegate | Thin wrappers calling `create()` with appropriate type and parent | small |
| Add deprecation warning behind env flag | Single warn per call when `ADEV_DEPRECATION_WARN=1` | small |
| Add `spec_ref` field to schema (or alias `plan_ref`) | Clarify the spec-binding convention for Features | small |
| Tests | Cover: create at each tier, parent_id inference, deprecated wrapper delegation, error cases | medium |

## Acceptance Criteria

- [ ] `create({ parent_id: "e1.f1", type: "task" })` produces a child Task with auto-generated tiered ID
- [ ] `create({ type: "epic" })` produces a root Epic with `e<N>` ID
- [ ] `createEpic({ title })` continues to work (delegates to `create()`)
- [ ] `createIssue` (current `create()` semantics) continues to work
- [ ] Tier inference handles depths 1-3 correctly with default config
- [ ] Tier inference works with custom `tasks.tier_prefixes`
- [ ] Deprecation warning fires only when `ADEV_DEPRECATION_WARN=1` and only once per call
- [ ] `spec_ref` field round-trips on file and beads adapters
- [ ] Error cases throw with the documented codes
- [ ] All existing tests pass; new tests cover unified create paths
- [ ] No constitutional violations (no new deps, pure ESM)
