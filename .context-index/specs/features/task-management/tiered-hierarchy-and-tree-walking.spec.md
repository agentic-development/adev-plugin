---
charter: task-management
status: implemented
risk_level: medium
milestone:
revision: 1
charter-revision: 3
created: 2026-04-16
updated: 2026-04-16
tracker-ref: epic-9
source-manifest:
  files:
    - path: lib/issues/id-utils.mjs
    - path: lib/issues/file-adapter.mjs
    - path: lib/issues/beads-adapter.mjs
    - path: lib/issues/interface.mjs
---

# Live Spec: Tiered Hierarchy and Tree Walking

<!-- Foundational spec for the strategic-planning consolidation.
     Implements the adaptable Epic→Feature→Task hierarchy with dotted IDs,
     tree walking via prefix match, manifest-driven tier config,
     legacy flat ID coexistence, and the closure cascade guard. -->

## Behavioral Contract

### Preconditions

- `lib/issues/file-adapter.mjs` exists with the current Epic→Issue model (validated)
- `lib/issues/interface.mjs` exists with `validateIssue` and `validateEpic` (validated)
- `manifest.yaml` schema accepts a new optional `tasks.tier_prefixes` map

### Behaviors

#### ID Parsing and Generation

1. **When** `parseId(id)` is called on a tiered ID like `e1.f2.t3` **then** it returns `{ tier: "Task", depth: 3, parent_id: "e1.f2", prefix: "t", counter: 3, legacy: false }`. The tier label is resolved via `TierConfig` (default `{e: "Epic", f: "Feature", t: "Task"}`).

2. **When** `parseId(id)` is called on a legacy flat ID (`epic-N`, `issue-N`, `bd-XXXXXX`) **then** it returns `{ tier: null, depth: 1, parent_id: null, prefix: null, counter: null, legacy: true }`. Legacy items are treated as root-level work items.

3. **When** `parseId(id)` receives an ID that matches neither the tiered pattern nor a legacy pattern **then** it returns `null` and the caller treats the ID as invalid.

4. **When** `nextChildId(parentId, tierPrefix)` is called **then** it scans existing items whose IDs match `<parentId>.<tierPrefix><N>`, finds the maximum N, and returns `<parentId>.<tierPrefix>${N+1}`. Returned IDs are monotonic — closing or deleting a child does not free its counter.

5. **When** `nextChildId(null, tierPrefix)` is called (root tier creation) **then** it scans root items with the same tier prefix and returns `<tierPrefix>${N+1}`.

#### Tree Walking

6. **When** `walkTree(parentId)` is called with a tiered ID **then** it returns all WorkItems whose ID starts with `<parentId>.` (immediate and transitive children). Items at the parent level itself are not included.

7. **When** `walkTree(parentId)` is called with a legacy flat ID (`epic-N`, `issue-N`, `bd-XXXXXX`) **then** it returns an empty list. Hierarchy queries against legacy items are out of scope by design (see task-management charter rev 3 invariants).

8. **When** `walkTree("e1")` is called and `e1.f1`, `e1.f1.t1`, `e1.f2` exist **then** it returns `[e1.f1, e1.f1.t1, e1.f2]` in stable order (sorted by ID).

#### Closure Cascade Guard

9. **When** `close(id, reason)` is called and the item has unclosed children (per `walkTree(id)`) **then** it throws `CASCADE_BLOCKED` with message: `"Cannot close <id>: blocked by unclosed children: <child-ids>. Close children first."`

10. **When** `close(id, reason)` is called on a legacy flat ID **then** the cascade guard does not apply (legacy items have no hierarchy queries). Only the existing dependency guard applies.

11. **When** all children are closed and `close(id, reason)` is called on a tiered parent **then** the close succeeds (subject to the existing dependency guard).

#### Manifest Tier Config

12. **When** `manifest.yaml` contains `tasks.tier_prefixes: {x: "Outcome", y: "Initiative", z: "Step"}` **then** the file adapter uses these prefixes for parse/generate. `nextChildId` uses `x/y/z` instead of `e/f/t`.

13. **When** `manifest.yaml` lacks `tasks.tier_prefixes` **then** the default `{e: "Epic", f: "Feature", t: "Task"}` applies.

14. **When** `tasks.tier_prefixes` contains a duplicate prefix or a prefix conflicting with legacy ID patterns (`epic-`, `issue-`, `bd-`) **then** the adapter throws `INVALID_TIER_CONFIG` at load time with the offending entries.

#### Legacy Coexistence

15. **When** the file adapter reads `tasks.md` containing both legacy flat rows (`epic-1`, `issue-65`) and tiered rows (`e9`, `e9.f1`) **then** all rows parse correctly and round-trip on re-write without modification.

16. **When** a tiered item has `parent_id: "e9"` and the parent `e9` does not exist **then** the adapter logs a warning at read time but does not throw. The item is included in `list()` but `walkTree` queries from the missing parent will not find it.

### Postconditions

- `lib/issues/id-utils.mjs` exports `parseId`, `nextChildId`, `getTierConfig` (new module)
- `lib/issues/file-adapter.mjs` updated with `walkTree(parentId)` and cascade-aware `close()`
- `lib/issues/beads-adapter.mjs` updated with equivalent `walkTree` (using parent_id metadata, not ID encoding) and cascade-aware `close()`
- `lib/issues/interface.mjs` extended with `walkTree` in the `IssueManager` contract
- `manifest.yaml` schema documentation updated with `tasks.tier_prefixes` example
- All existing tests pass; new tests cover parse/generate/walk/cascade scenarios

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `parseId` on garbage input | Returns `null` | — |
| `nextChildId` with non-existent parent | Returns `<parent>.<prefix>1` (no validation that parent exists) | — |
| `walkTree` with invalid ID format | Returns empty list | — |
| `close()` with unclosed children | Throws CASCADE_BLOCKED | CASCADE_BLOCKED |
| `tasks.tier_prefixes` with duplicate or conflicting prefix | Throws at load time | INVALID_TIER_CONFIG |
| Tiered item with missing parent in tasks.md | Warning logged, item still listed | — |

## System Constitution Reference

- **Principle 1 (Minimize external dependencies):** All ID parsing and tree walking uses Node.js built-ins (`String.prototype.split`, `Array.prototype.filter`). No new deps.
- **Principle 3 (Pure ESM):** New `lib/issues/id-utils.mjs` module is pure ESM.
- **Charter Quality Attribute (Backward Compatibility):** Legacy flat IDs (`epic-1` through `epic-9`, `issue-1` through `issue-75`) continue to parse and operate as root-level items without modification.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Author `lib/issues/id-utils.mjs` | New module with `parseId`, `nextChildId`, `getTierConfig`, default tier prefixes | small |
| Update `lib/issues/file-adapter.mjs` | Add `walkTree`, cascade-aware `close`, integrate id-utils into `_nextIssueId`/`_nextEpicId` paths | medium |
| Update `lib/issues/beads-adapter.mjs` | Add `walkTree` using parent_id metadata; cascade-aware `close` | medium |
| Update `lib/issues/interface.mjs` | Add `walkTree` to IssueManager contract; add `parent_id` to WorkItem schema | small |
| Update `manifest.yaml` template | Document `tasks.tier_prefixes` example | small |
| Tests | Coverage: parse legacy + tiered, generate child IDs, walkTree at depths 1-3, cascade guard, tier_prefixes config, missing-parent warning | medium |

## Acceptance Criteria

- [ ] `parseId` correctly identifies tier, depth, and parent for tiered IDs at depths 1-4
- [ ] `parseId` flags legacy flat IDs with `legacy: true`
- [ ] `nextChildId` produces monotonic counters per parent
- [ ] `walkTree` returns all descendants via prefix match
- [ ] `walkTree` returns empty list for legacy IDs
- [ ] `close()` blocks when unclosed children exist (CASCADE_BLOCKED)
- [ ] `close()` succeeds on legacy IDs without cascade check
- [ ] `tasks.tier_prefixes` override is read from manifest at adapter init
- [ ] Default tier config applies when manifest lacks the field
- [ ] Mixed legacy + tiered rows in `tasks.md` round-trip cleanly
- [ ] beads adapter tree walking matches file adapter logical results
- [ ] All existing tests pass; new tests cover the behaviors above
- [ ] No constitutional violations (no new deps, pure ESM)
