# Live Spec: Capability Status Column

---
charter: spec-lifecycle
status: review-pending
risk_level: medium
milestone: v1
created: 2026-03-27
---

## Behavioral Contract

### Preconditions

- A charter exists with a Capability Map table containing at least `Capability`, `Description`, `Priority`, and `Phase` columns
- The skill performing the update has identified which capability corresponds to the spec being modified

### Behaviors

1. **When** `/adev-brainstorm` creates or updates a charter **then** the Capability Map table includes a `Status` column with value `—` for each capability.

2. **When** `/adev-specify` creates a spec for a charter capability **then** it updates that capability's Status to `specified` in the charter's Capability Map.

3. **When** `/adev-review-specs` sets a spec to `review-passed` **then** it updates the corresponding capability's Status to `review-passed` in the charter.

4. **When** `/adev-plan` creates a plan for a spec **then** it updates the corresponding capability's Status to `planned` in the charter.

5. **When** `/adev-implement` begins working on a spec **then** it updates the corresponding capability's Status to `implementing` in the charter.

6. **When** `/adev-implement` completes all tasks for a spec and tests pass **then** it updates the corresponding capability's Status to `implemented` in the charter.

7. **When** `/adev-validate` passes a spec **then** it updates the corresponding capability's Status to `validated` in the charter.

8. **When** a capability's Status is updated **then** the charter's `revision` is incremented and `updated` is set to today's date.

### Postconditions

- Every capability in every charter's Capability Map has a `Status` column
- A capability's Status never advances past its spec's `status` (e.g., cannot be `implemented` if spec is `draft`)

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Capability name in spec doesn't match any row in charter | Skill warns: "No matching capability found in charter for spec <name>" | CAPABILITY_NOT_FOUND |
| Charter file cannot be parsed (malformed markdown table) | Skill warns and skips capability status update; does not block the primary operation | PARSE_ERROR |

## System Constitution Reference

- **Principle:** "Skills are primarily markdown" — Capability Status is stored inline in the charter's markdown table, not in a separate file or database.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Update `adev-brainstorm/SKILL.md` | Ensure Capability Map table includes Status column with `—` default | small |
| Update `adev-specify/SKILL.md` | Add capability status update to `specified` after spec creation | small |
| Update `adev-review-specs/SKILL.md` | Add capability status update to `review-passed` after review passes | small |
| Update `adev-plan/SKILL.md` | Add capability status update to `planned` after plan creation | small |
| Update `adev-implement/SKILL.md` | Add capability status updates for `implementing` and `implemented` | small |
| Update `adev-validate/SKILL.md` | Add capability status update to `validated` after validation passes | small |
| Update charter template | Add Status column to Capability Map in `templates/charter-template.md` | small |

## Acceptance Criteria

- [ ] Charter template includes `Status` column in Capability Map with `—` default
- [ ] Each lifecycle skill updates the correct capability's Status in the charter
- [ ] Capability Status values follow the order: `—` → `specified` → `review-passed` → `planned` → `implementing` → `implemented` → `validated`
- [ ] Charter `revision` increments when capability status changes
- [ ] Missing or unmatched capability names produce a warning, not a block
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
