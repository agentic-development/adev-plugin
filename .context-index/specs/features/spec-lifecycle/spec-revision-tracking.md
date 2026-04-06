# Live Spec: Spec Revision Tracking

---
charter: spec-lifecycle
status: validated
risk_level: medium
milestone: v1
revision: 1
charter-revision: 1
created: 2026-03-27
updated: 2026-03-28
---

## Behavioral Contract

### Preconditions

- A spec file exists with YAML frontmatter
- The parent charter has a `revision` field in its frontmatter
- The skill modifying the spec has read both the spec and its parent charter

### Behaviors

1. **When** `/adev:specify` creates a new spec **then** it sets `revision: 1`, `charter-revision: <current charter revision>`, and `updated: <today>` in the spec frontmatter.

2. **When** any skill modifies a spec's content (behavioral contract, acceptance criteria, error cases) **then** it increments `revision` and sets `updated: <today>`.

3. **When** a spec has `status: review-passed` and any skill modifies its content **then** the skill auto-downgrades `status` to `review-pending`, increments `revision`, and sets `updated: <today>`.

4. **When** a spec has `status: review-passed` and only the `status` field itself changes (e.g., to `implemented` or `validated`) **then** `revision` does NOT increment — status-only transitions are not content changes.

5. **When** the parent charter's `revision` is higher than a spec's `charter-revision` **then** `/adev:hygiene` and `/adev:status` report the spec as potentially stale against its charter.

6. **When** `/adev:specify` creates a spec and the charter has `revision: N` **then** the spec's `charter-revision` is set to `N`, recording which charter version the spec was written against.

### Postconditions

- Every spec has `revision` (positive integer), `charter-revision` (positive integer), and `updated` (date) in frontmatter
- `revision` only increases, never decreases
- `charter-revision` ≤ parent charter's current `revision`
- Content edits after `review-passed` always trigger auto-downgrade to `review-pending`

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Spec has no `revision` field | Skill adds `revision: 1` and `updated: <today>` (auto-fix for legacy specs) | — (auto-fix) |
| Spec has no `charter-revision` field | Skill adds `charter-revision: 1` (assumes earliest version) | — (auto-fix) |
| Parent charter has no `revision` field | Skill treats charter revision as `1` and warns | CHARTER_NO_REVISION |

## System Constitution Reference

- **Principle:** "Skills are primarily markdown" — Revision tracking lives in YAML frontmatter, no external state.
- **Principle:** "Minimize external dependencies" — Revision is a simple integer counter, no versioning library needed.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Update `adev:specify/SKILL.md` | Set `revision: 1`, `charter-revision`, `updated` on spec creation | small |
| Update `adev:review-specs/SKILL.md` | Record revision at review time; do not increment on status-only changes | small |
| Update all content-modifying skills | Increment revision + auto-downgrade logic when editing reviewed specs | medium |
| Update spec template | Add `revision`, `charter-revision`, `updated` fields | small |
| Write tests | Test revision increment, auto-downgrade, charter-revision staleness | medium |

## Acceptance Criteria

- [ ] New specs have `revision: 1`, `charter-revision: <N>`, `updated: <date>`
- [ ] Content edits increment `revision` and update `updated`
- [ ] Editing a `review-passed` spec auto-downgrades to `review-pending`
- [ ] Status-only transitions (e.g., to `implemented`) do NOT increment revision
- [ ] `charter-revision` is set from the charter's current revision at spec creation time
- [ ] Legacy specs without revision fields get auto-fixed with defaults
- [ ] Spec template includes all new fields
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
