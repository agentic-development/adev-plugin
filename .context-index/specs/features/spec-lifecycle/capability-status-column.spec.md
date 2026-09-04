---
charter: spec-lifecycle
status: implemented
risk_level: medium
milestone:
revision: 2
charter-revision: 1
created: 2026-03-27
updated: 2026-08-26
source-manifest:
  sha: "0705163"
  files:
    - skills/brainstorm/SKILL.md
    - skills/specify/SKILL.md
    - skills/review-specs/SKILL.md
    - skills/plan/SKILL.md
    - skills/implement/SKILL.md
    - skills/validate/SKILL.md
    - templates/charter-template.md
  computed-at: "2025-04-25T00:00:00.000Z"
drift_detected: true
---

# Live Spec: Capability Status Column

## Behavioral Contract

### Preconditions

- A charter exists with a Capability Map table containing at least `Capability`, `Description`, `Priority`, and `Milestone` columns
- The skill performing the update has identified which capability corresponds to the spec being modified

### Behaviors

1. **When** `/adev:brainstorm` creates or updates a charter **then** the Capability Map table includes a `Status` column with value `—` for each capability.

2. **When** `/adev:specify` creates a spec for a charter capability **then** it updates that capability's Status to `specified` in the charter's Capability Map.

3. **When** `/adev:review-specs` sets a spec to `review-passed` **then** it updates the corresponding capability's Status to `review-passed` in the charter.

4. **When** `/adev:plan` creates a plan for a spec **then** it updates the corresponding capability's Status to `planned` in the charter.

5. **When** `/adev:implement` begins working on a spec **then** it updates the corresponding capability's Status to `implementing` in the charter.

6. **When** `/adev:implement` completes all tasks for a spec and tests pass **then** it updates the corresponding capability's Status to `implemented` in the charter.

7. **When** `/adev:validate` passes a spec **then** it updates the corresponding capability's Status to `validated` in the charter.

8. **When** a capability's Status is updated **then** the charter's `revision` is incremented and `updated` is set to today's date.

9. **When** any skill writes a capability's Status **then** the write is monotonic: it lands only if the target value is strictly forward of the row's current value in the lifecycle order (`— → specified → review-passed → planned → implementing → implemented → validated`). A write that would move the row backward (or repeat its current value) is skipped and the caller is told why, rather than applied. `/adev:review-specs` Step 7 enforces this via `adev capability-map set-status` (`lib/capability-map.mjs`), the shared, canonical writer — this closes the gap where a re-review of an already-`implemented`/`validated` capability (e.g. after `/adev:validate` FAILs and the spec is revised, `/adev:specify --amend`, or `/adev:reconcile`) regressed the row back to `review-passed`. `/adev:specify`, `/adev:plan`, and `/adev:implement`/`/adev:validate`'s own Capability Map writes (Behaviors 2, 4, 5, 6, 7) still edit the table directly and have not yet been migrated onto this guard — same unconditional-write exposure on re-entry, tracked as follow-up rather than folded into this fix.

### Postconditions

- Every capability in every charter's Capability Map has a `Status` column
- A capability's Status never advances past its spec's `status` (e.g., cannot be `implemented` if spec is `draft`)
- A capability's Status column is written monotonically per Behavior 9 — the column's value only ever moves forward through the lifecycle order, never backward, regardless of how many times a step re-runs against the same capability

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
| Update `adev:brainstorm/SKILL.md` | Ensure Capability Map table includes Status column with `—` default | small |
| Update `adev:specify/SKILL.md` | Add capability status update to `specified` after spec creation | small |
| Update `adev:review-specs/SKILL.md` | Add capability status update to `review-passed` after review passes | small |
| Update `adev:plan/SKILL.md` | Add capability status update to `planned` after plan creation | small |
| Update `adev:implement/SKILL.md` | Add capability status updates for `implementing` and `implemented` | small |
| Update `adev:validate/SKILL.md` | Add capability status update to `validated` after validation passes | small |
| Update charter template | Add Status column to Capability Map in `templates/charter-template.md` | small |
| Add `lib/capability-map.mjs` + `adev capability-map set-status` | Shared monotonic writer for the Status column (Behavior 9) | small |
| Migrate `adev:review-specs/SKILL.md` Step 7 onto `adev capability-map set-status` | Fixes the reported re-review regression | small |
| Migrate `adev:specify`/`adev:plan`/`adev:implement`/`adev:validate`'s Capability Map writes onto the same verb | Follow-up — not yet done; see Behavior 9 | small |

## Acceptance Criteria

- [ ] Charter template includes `Status` column in Capability Map with `—` default
- [ ] Each lifecycle skill updates the correct capability's Status in the charter
- [ ] Capability Status values follow the order: `—` → `specified` → `review-passed` → `planned` → `implementing` → `implemented` → `validated`
- [ ] Charter `revision` increments when capability status changes
- [ ] Missing or unmatched capability names produce a warning, not a block
- [x] Capability Status writes are monotonic — a write to an earlier lifecycle value than the row's current one is skipped, not applied (`/adev:review-specs` Step 7; other writers pending, see Behavior 9)
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
