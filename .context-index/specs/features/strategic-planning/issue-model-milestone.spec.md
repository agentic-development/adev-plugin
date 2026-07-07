# Live Spec: Issue Model Milestone Extension

<!-- Live Spec within the strategic-planning charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/strategic-planning/charter.md -->

---
charter: strategic-planning
status: superseded
risk_level: low
milestone:
revision: 1
charter-revision: 1
created: 2026-04-05
updated: 2026-05-04
source-manifest:
  sha: "5ee4bb9"
  files:
    - lib/issues/beads-adapter.mjs
    - lib/issues/file-adapter.mjs
    - lib/issues/interface.mjs
    - tests/helpers.mjs
    - tests/lib/issues-beads-adapter.test.mjs
    - tests/lib/issues-file-adapter.test.mjs
    - tests/lib/issues-interface.test.mjs
    - tests/lib/issues-milestone.test.mjs
  computed-at: "2026-07-03T22:27:11.398Z"
---

## Behavioral Contract

### Preconditions

- `lib/issues/interface.mjs`, `lib/issues/file-adapter.mjs`, and `lib/issues/beads-adapter.mjs` exist
- Existing tasks.md files may or may not have a Milestone column in the Epics table

### Behaviors

1. **When** an Epic is created with a `milestone` field **then** the field is persisted and returned on subsequent reads
2. **When** an Epic is created without a `milestone` field **then** the field defaults to `undefined` and does not appear in output
3. **When** an Epic's `milestone` is updated via `updateEpic(id, { milestone })` **then** the new value is persisted
4. **When** listing epics with a `{ milestone }` filter **then** only epics matching that milestone are returned
5. **When** a tasks.md file without the Milestone column is read **then** it parses correctly with `milestone: undefined` for all epics (backward compatibility)
6. **When** a tasks.md file with the Milestone column is read **then** milestone values are parsed correctly for each epic
7. **When** `validateEpic()` is called with a `milestone` string **then** validation passes and milestone is included in the returned object
8. **When** `validateEpic()` is called without `milestone` **then** validation passes and milestone is `undefined`

### Postconditions

- Epic objects include an optional `milestone` property
- Both file and beads adapters support the milestone field identically
- Existing tasks.md files without the Milestone column continue to parse without error

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `milestone` is not a string (e.g., number) | `validateEpic()` coerces to string or ignores | N/A |
| Old-format tasks.md (6 epic columns) | Parsed with milestone=undefined, re-serialized with 7 columns on next write | N/A |

## System Constitution Reference

- **Principle:** "Minimize external dependencies" — Uses only Node.js built-ins (fs, path, crypto)
- **Principle:** "Pure ESM" — All changes in .mjs files

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Extend Epic typedef | Add `milestone` to `@typedef Epic` and `IssueFilter` in interface.mjs | small |
| Update validateEpic | Include `milestone` in validated return object | small |
| Update file-adapter | Add Milestone column to EPIC_HEADER, serializeEpicRow, parseEpicRow with backward-compat column detection | medium |
| Update beads-adapter | Pass milestone through to epic operations | small |
| Write tests | Test milestone round-trip on both adapters, backward compat parsing | medium |

## Issue Board Integration

This spec changes the issue model itself — no issue board touchpoints during execution (it's the foundation other specs build on).

## Acceptance Criteria

- [ ] `milestone` field round-trips through `createEpic` / `list` / `updateEpic` on file adapter
- [ ] `milestone` field round-trips through `createEpic` / `list` / `updateEpic` on beads adapter
- [ ] Existing tasks.md without Milestone column parses without error
- [ ] After re-serialization, tasks.md includes the Milestone column
- [ ] `validateEpic()` accepts and returns milestone field
- [ ] Filtering epics by milestone returns correct results
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
