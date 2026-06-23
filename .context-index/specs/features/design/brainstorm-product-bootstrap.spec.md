---
charter: design
status: validated
risk_level: low
milestone:
revision: 1
charter-revision: 2
created: 2026-04-16
updated: 2026-04-16
tracker-ref: epic-9
source-manifest:
  files:
    - path: skills/brainstorm/SKILL.md
---

# Live Spec: Brainstorm product.md Identity Bootstrap

<!-- /adev:brainstorm gains lightweight product.md bootstrap on the
     first charter created in a project, subsuming the identity portion
     of /adev:vision. Subsequent brainstorms append to Module Map only. -->

## Behavioral Contract

### Preconditions

- `skills/brainstorm/SKILL.md` exists with current Step 1-8 flow
- `.context-index/constitution.md` exists (always, per `/adev:init`)
- `.context-index/specs/product.md` may or may not exist
- `.context-index/specs/features/` may contain zero or more existing charter directories

### Behaviors

#### First Charter Detection

1. **When** `/adev:brainstorm` runs and would write a new charter (after Step 5 — Write Charter) **then** the skill checks if any other `charter.md` files exist under `.context-index/specs/features/*/`. If none exist (this is the first charter), bootstrap is triggered.

2. **When** bootstrap is triggered **then** the skill checks if `.context-index/specs/product.md` exists. If yes, no bootstrap is performed (product.md is preserved as-is). If no, bootstrap proceeds.

#### Bootstrap Flow

3. **When** bootstrap proceeds **then** the skill asks ONE question to the user: `"This is the first charter in the project. What is the product trying to do, in one sentence? (This becomes the product vision.)"` Wait for the user's response.

4. **When** the user responds **then** the skill writes a minimal `product.md` to `.context-index/specs/product.md` containing:
   - Title: `# Product Vision: <project name from constitution Identity>`
   - Vision: the user's one-sentence response
   - Module Map: empty placeholder section with the new charter listed
   - Milestones: empty placeholder section

5. **When** bootstrap completes **then** the skill prints: `"Bootstrapped product.md from your one-sentence vision. Run /adev:plan --milestone <name> later to define milestones, or update product.md directly."`

#### Module Map Append (Subsequent Brainstorms)

6. **When** `/adev:brainstorm` writes a new charter and `product.md` already exists **then** after writing the charter, the skill appends a row to `product.md`'s Module Map section: `| <module-slug> | <one-line description from charter Business Intent> | charter.md |`.

7. **When** the Module Map section does not exist in `product.md` **then** the skill creates it (just before the Milestones section, or at the end if Milestones is absent) and adds the first row.

8. **When** a Module Map row already exists for the same module slug **then** the skill updates the description in place (idempotent re-runs do not duplicate rows).

#### Skip Conditions

9. **When** the user passes `--no-bootstrap` (new flag) **then** bootstrap is skipped even on first-charter scenarios. Charter is written without product.md modifications.

10. **When** `product.md` exists with no `## Module Map` section **then** Module Map auto-creation triggers as described in behavior 7. The user is informed: `"Created Module Map section in product.md."`

11. **When** the user is operating on `--module <name>` (revising an existing charter, not creating new) **then** no bootstrap occurs and no Module Map row is appended (the row already exists from the original create).

### Postconditions

- `skills/brainstorm/SKILL.md` updated with a new Step 5b (Product.md Bootstrap) inserted after Step 5 (Write Charter) and before Step 6 (Charter Review Loop)
- First-charter creation produces a minimal `product.md` if absent
- Subsequent charter creations append to Module Map idempotently
- `--no-bootstrap` flag respected
- Existing brainstorm behavior preserved when product.md already has content

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| User declines to provide a vision sentence | Skill writes product.md with empty Vision section + advisory comment | — |
| product.md exists but is malformed | Skill skips Module Map update with warning: "product.md exists but Module Map cannot be parsed; please update manually" | — |
| Multiple charters somehow exist but no product.md (edge case) | Bootstrap still triggers (treats as first vision opportunity) and lists all existing charters in Module Map | — |
| User passes `--no-bootstrap` on a project that already has product.md | Flag has no effect (no bootstrap would happen anyway) | — |

## System Constitution Reference

- **Principle 2 (Skills are primarily markdown):** Bootstrap logic lives entirely in `skills/brainstorm/SKILL.md` instructions. No new code modules.
- **Strategic-Planning Consolidation:** Folds the identity portion of the deleted `/adev:vision` into the natural workflow point (first charter creation). Removes a skill, doesn't add one.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Add Step 5b to brainstorm SKILL.md | Bootstrap detection + one-question prompt + product.md write | small |
| Add Module Map append logic | Idempotent append/update of Module Map rows after each charter write | small |
| Add `--no-bootstrap` flag | Document and respect skip flag | small |
| Tests | First-charter bootstrap, subsequent append idempotency, skip flag, malformed product.md handling | small |

## Acceptance Criteria

- [ ] First charter creation in a fresh project triggers bootstrap
- [ ] Bootstrap asks exactly one question (vision sentence)
- [ ] product.md is written with title, vision, Module Map placeholder, Milestones placeholder
- [ ] Subsequent charter creations append a row to Module Map
- [ ] Module Map appends are idempotent (re-running same brainstorm doesn't duplicate)
- [ ] `--no-bootstrap` flag suppresses bootstrap on first charter
- [ ] Existing product.md content is never overwritten
- [ ] Module Map auto-creates if missing from existing product.md
- [ ] No bootstrap occurs on `--module` (revision mode)
- [ ] All existing tests pass; new tests cover the four scenarios above
- [ ] No constitutional violations
