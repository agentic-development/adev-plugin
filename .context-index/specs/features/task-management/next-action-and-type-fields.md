---
charter: task-management
status: review-passed
risk_level: low
milestone: strategic-planning-consolidation
revision: 1
charter-revision: 3
created: 2026-04-16
updated: 2026-04-16
tracker-ref: epic-9
---

# Live Spec: next_action and Generic Type Fields

<!-- Schema additions to the WorkItem model: free-text `next_action`
     for agent guidance, and free-text `type` (replaces the strict enum).
     Both are backward-compatible additions with sensible defaults. -->

## Behavioral Contract

### Preconditions

- `lib/issues/interface.mjs` defines `validateIssue` with current schema (id, title, status, priority, type enum, epicId, planRef, planTask, dependencies, notes, created, updated)
- `lib/issues/file-adapter.mjs` parses and serializes the existing tasks.md table format
- `lib/issues/beads-adapter.mjs` maps to beads_rust fields via `br` CLI

### Behaviors

#### next_action Field

1. **When** `validateIssue(data)` receives `data.next_action: "Run /adev:specify --module foo"` **then** the validated WorkItem includes `next_action` as a string field. Empty string is treated as null.

2. **When** `validateIssue(data)` is called without `next_action` **then** the field is set to `null` (or omitted in serialized output). Existing items without `next_action` remain valid.

3. **When** `update(id, { next_action: "Run /adev:plan --spec ..." })` is called **then** the field updates and the item's `updated` timestamp advances. The previous `next_action` value is replaced (no append).

4. **When** the file adapter serializes a WorkItem to `tasks.md` **then** `next_action` appears as a column in the markdown table. Empty values render as the empty string. Newlines in `next_action` are escaped to spaces (markdown table rows are single-line).

5. **When** the file adapter parses an existing `tasks.md` row that lacks the `next_action` column (legacy rows from before this spec lands) **then** the field is set to `null` without error.

6. **When** the beads adapter writes a WorkItem with `next_action` **then** the value is stored in beads as a tag or comment field (implementation detail; specific to `br` CLI capabilities).

7. **When** `validateIssue(data)` receives `data.next_action: 42` (non-string) **then** validation throws `INVALID_NEXT_ACTION` with message: `"next_action must be a string when provided"`.

#### Generic Type Field

7. **When** `validateIssue(data)` receives `data.type: "incident"` (a value not in the legacy enum) **then** validation passes. Type is accepted as-is.

8. **When** `validateIssue(data)` is called without `type` **then** `type` defaults to `"task"`.

9. **When** `validateIssue(data)` receives `data.type: ""` (empty string) **then** validation throws `INVALID_TYPE` with message: `"type must be a non-empty string when provided"`.

10. **When** `validateIssue(data)` receives `data.type: 42` (non-string) **then** validation throws `INVALID_TYPE` with message: `"type must be a string"`.

11. **When** the legacy enum check is removed **then** existing values (`bug`, `feature`, `task`) continue to round-trip without modification. No breaking change for existing items.

#### Skill Update Convention (Documentation Only)

12. **When** lifecycle skills (`/adev:specify`, `/adev:plan`, `/adev:review-specs`, `/adev:implement`, `/adev:validate`, `/adev:debug`) complete a state transition on a work item **then** they update `next_action` to point at the next expected skill invocation. This is convention, not enforced — the framework does not validate that skills update `next_action`.

13. **When** a work item has no `next_action` set **then** consumers (e.g., `/adev:work`, `/adev:status`) treat the item as having no specific guidance and fall back to existing routing logic.

### Postconditions

- `lib/issues/interface.mjs` schema documents `next_action: string | null` and free-text `type: string`
- `lib/issues/file-adapter.mjs` reads/writes `next_action` column in tasks.md
- `lib/issues/beads-adapter.mjs` reads/writes `next_action` via beads metadata
- `validateIssue` accepts free-text type with `"task"` default
- Existing items without `next_action` continue to load without error
- Existing items with legacy enum types continue to load without error
- New tests cover next_action read/write/round-trip and type validation

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `next_action` is non-string | Throws | INVALID_NEXT_ACTION |
| `type` is empty string | Throws | INVALID_TYPE |
| `type` is non-string | Throws | INVALID_TYPE |
| Existing tasks.md row lacks next_action column | Loads with `next_action: null` | — |
| Legacy type value (`bug`, `feature`, `task`) | Loads unchanged | — |

## System Constitution Reference

- **Principle 1 (Minimize external dependencies):** Schema validation uses pure functions, no new deps.
- **Charter Quality Attribute (Anti-Drift):** `next_action` is the primary mechanism for keeping agents oriented across long sessions. Skills updating it on state transitions provides a breadcrumb trail.
- **Charter Quality Attribute (Backward Compatibility):** Both fields are additive with safe defaults. Existing items continue to validate without modification.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Update `validateIssue` | Remove enum check on `type`; add string-default; add `next_action` field validation | small |
| Update `lib/issues/file-adapter.mjs` schema | Add `next_action` column to ISSUE_HEADER, ISSUE_SEPARATOR; update `parseIssueRow`/`serializeIssueRow` | small |
| Update `lib/issues/beads-adapter.mjs` schema | Map `next_action` to a beads tag/comment; round-trip on read/write | medium |
| Tests | Validation: free-text type accepted, empty rejected; round-trip: next_action read/write; legacy: missing column reads as null | small |
| Document convention | Update task-management constitution-template section to mention `next_action` update as skill convention | small |

## Acceptance Criteria

- [ ] `validateIssue` accepts free-text `type` with `"task"` default
- [ ] `validateIssue` rejects empty/non-string `type` with INVALID_TYPE
- [ ] `validateIssue` accepts `next_action` as optional string
- [ ] `validateIssue` rejects non-string `next_action` with INVALID_NEXT_ACTION
- [ ] File adapter reads/writes `next_action` column in tasks.md
- [ ] File adapter handles missing `next_action` column on legacy rows
- [ ] Beads adapter round-trips `next_action` via metadata
- [ ] Existing items with legacy enum type values load unchanged
- [ ] Constitution template documents the update-on-transition convention
- [ ] All existing tests pass; new tests cover the field additions
- [ ] No constitutional violations (no new deps, pure ESM)
