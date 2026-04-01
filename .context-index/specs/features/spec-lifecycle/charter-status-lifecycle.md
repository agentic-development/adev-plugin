# Live Spec: Charter Status Lifecycle

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

- A charter file exists at `.context-index/specs/features/<module>/charter.md`
- The charter has YAML frontmatter with at least a `status` field (or none, defaulting to `draft`)
- The skill invoking a transition has loaded the charter file

### Behaviors

1. **When** `/adev-brainstorm` creates a new charter **then** it sets `status: draft`, `revision: 1`, and `updated: <today>` in the charter frontmatter.

2. **When** `/adev-brainstorm` completes the charter review loop and the user approves **then** the skill updates `status` from `draft` to `approved` and increments `revision`.

3. **When** any skill modifies a charter that has `status: approved` (e.g., adding capabilities, changing scope) **then** it sets `status: evolving` and increments `revision`.

4. **When** a user explicitly approves an `evolving` charter (via `/adev-brainstorm --module` or manual confirmation) **then** the skill sets `status` back to `approved` and increments `revision`.

5. **When** all capabilities in a charter's Capability Map have status `implemented` or `validated` **then** the charter may be set to `status: closed`. This is a manual action, not automatic.

6. **When** `/adev-specify` is invoked against a charter with `status: closed` **then** it blocks with error `CHARTER_CLOSED` and message: "Charter <module> is closed. Reopen it by setting status to 'evolving' before creating new specs."

7. **When** a charter has `status: closed` and a user sets it back to `evolving` **then** `revision` increments and the charter can accept new specs again.

### Postconditions

- Charter frontmatter always contains `status`, `revision`, and `updated` fields
- `revision` is a positive integer that only increases
- `status` is one of: `draft`, `approved`, `evolving`, `closed`

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `/adev-specify` called on `closed` charter | Block with "Charter <module> is closed" message | CHARTER_CLOSED |
| Charter file has no frontmatter | Skill adds frontmatter with `status: draft`, `revision: 1`, `updated: <today>` | — (auto-fix) |
| Invalid status value in frontmatter | Skill warns and treats as `draft` | INVALID_STATUS |

## System Constitution Reference

- **Principle:** "Skills are primarily markdown" — Charter status lives in YAML frontmatter within the markdown file. No external state files or databases.
- **Principle:** "Minimize external dependencies" — Status parsing uses only string manipulation and YAML frontmatter conventions already used by specs.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Update `adev-brainstorm/SKILL.md` | Add status/revision/updated write on charter creation and approval | medium |
| Update `adev-specify/SKILL.md` | Add closed-charter gate check before spec creation | small |
| Update charter template | Add status/revision/updated fields to `templates/charter-template.md` | small |
| Write tests | Test status transitions, closed-charter blocking, auto-fix for missing frontmatter | medium |

## Acceptance Criteria

- [ ] New charters created by `/adev-brainstorm` have `status: draft`, `revision: 1`, `updated: <date>`
- [ ] Charter status transitions to `approved` after user approval in brainstorm
- [ ] Modifying an `approved` charter sets status to `evolving`
- [ ] `/adev-specify` blocks on `closed` charters with `CHARTER_CLOSED` error
- [ ] `revision` increments on every status transition
- [ ] Charter template includes `status`, `revision`, `updated` fields
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
