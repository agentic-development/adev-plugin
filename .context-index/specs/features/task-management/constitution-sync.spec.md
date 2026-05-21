# Live Spec: Constitution and Sync Integration

---
charter: task-management
status: validated
milestone: 1
revision: 1
charter-revision: 3
created: 2026-03-31
updated: 2026-04-01
source-manifest:
  sha: "609a854"
  files:
    - skills/sync/SKILL.md
    - templates/constitution-template.md
  computed-at: "2026-04-12T11:48:02.767Z"
drift_detected: true
---

## Behavioral Contract

### Preconditions

- `.context-index/constitution.md` exists
- `.context-index/manifest.yaml` exists
- `templates/constitution-template.md` exists
- `skills/sync/SKILL.md` exists

### Behaviors

**Constitution Template:**

1. **When** a new project runs `/adev:init` **then** the scaffolded `constitution.md` includes a "Task Management" section after Quality Gates, documenting both file and beads backends with their respective commands.
2. **When** the Task Management section is present in the constitution **then** it lists `br` commands for the beads backend and markdown table instructions for the file backend.

**Sync Integration:**

3. **When** `/adev:sync` runs and `tasks.backend` is configured in `manifest.yaml` **then** the generated agent files (CLAUDE.md, AGENTS.md) include a `## Task Management` block between Context Index and User Additions sections.
4. **When** `/adev:sync` runs and `tasks.backend` is not configured **then** no Task Management block is emitted (clean omission, no empty section).
5. **When** `/adev:sync` runs with `tasks.backend: beads` **then** the Task Management block includes `br` CLI command reference.
6. **When** `/adev:sync` runs with `tasks.backend: file` **then** the Task Management block references `.context-index/tasks/tasks.md` and markdown table format.

### Postconditions

- Constitution template includes Task Management section for all new projects
- Agent files reflect the active task backend after each sync
- User Additions section in CLAUDE.md is preserved across syncs (existing behavior unchanged)

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Constitution has no Task Management section | Sync skips the block (no error) | N/A |
| Unknown `tasks.backend` value | Sync emits file-backend instructions as default | N/A |

## System Constitution Reference

- **"Skills are primarily markdown"** — Changes are to template files and skill instruction text only.
- **"Templates are consumed verbatim by cpSync()"** — Constitution template changes only affect new scaffolds, not existing projects.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Update constitution template | Add Task Management section to `templates/constitution-template.md` | small |
| Update sync skill | Add conditional Task Management block to `skills/sync/SKILL.md` | small |

## Acceptance Criteria

- [ ] `templates/constitution-template.md` includes a Task Management section after Quality Gates
- [ ] Task Management section documents both file and beads backends
- [ ] Task Management section includes `br` command reference for beads backend
- [ ] `skills/sync/SKILL.md` includes conditional Task Management block generation
- [ ] Sync block is omitted when `tasks.backend` is not configured
- [ ] Sync block content matches the active backend
- [ ] User Additions preservation is not affected
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
