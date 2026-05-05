# Live Spec: /adev:issues Skill

---
charter: task-management
status: validated
milestone: 1
revision: 1
charter-revision: 3
created: 2026-03-31
updated: 2026-04-01
source-manifest:
  sha: "45734c6"
  files:
    - skills/debug/SKILL.md
    - skills/issues/SKILL.md
    - skills/status/SKILL.md
    - skills/using-adev/SKILL.md
  computed-at: "2026-04-12T11:48:02.760Z"
---

## Behavioral Contract

### Preconditions

- `.context-index/` exists with `manifest.yaml`
- For beads backend: `br` is on PATH (falls back to file otherwise)

### Behaviors

1. **When** `/adev:issues` is invoked with no arguments **then** it displays the full issue board: all epics with their issues, plus standalone issues, grouped by status (open/in_progress first, then deferred, then closed).
2. **When** `/adev:issues create "<title>" --type <bug|feature|task>` is invoked **then** it creates a standalone issue with the given title and type, defaulting to priority 2 (medium) and status `open`.
3. **When** `/adev:issues create "<title>" --epic <epic-id>` is invoked **then** the issue is created under the specified epic.
4. **When** `/adev:issues epic "<title>"` is invoked **then** it creates a new epic with status `open`.
5. **When** `/adev:issues update <id> --status <status>` is invoked **then** the issue or epic status is updated, respecting the close-guard invariant (blocked by unclosed deps).
6. **When** `/adev:issues close <id> --reason "<text>"` is invoked **then** the issue is closed with the provided reason.
7. **When** `/adev:issues list --status open` is invoked **then** only open issues are shown.
8. **When** `/adev:issues list --epic <epic-id>` is invoked **then** only issues in that epic are shown.
9. **When** `/adev:issues dep <issue-id> <depends-on-id>` is invoked **then** a blocking dependency is created between the two issues.
10. **When** `/adev:issues ready` is invoked **then** it shows actionable issues: status `open`, no unclosed blocking dependencies.

### Postconditions

- All mutations are persisted to the active backend
- Board display always reflects current state (no caching)

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| No `.context-index/` directory | Tell user to run `/adev:init` first | PREREQ |
| Invalid issue ID | Report "Issue not found: <id>" | NOT_FOUND |
| Close blocked by deps | Report "Cannot close: blocked by <id1>, <id2>" | VALIDATION |
| Unknown backend in manifest | Fall back to file with warning | N/A |

## System Constitution Reference

- **"Skills are primarily markdown"** — `/adev:issues` is a SKILL.md with structured instructions. It calls `lib/issues/` functions for backend operations.
- **"Adding new skills to the lifecycle order requires human approval"** — `/adev:issues` is a supporting skill (like adev:debug, adev:status). It does not gate the lifecycle pipeline. This charter serves as the human approval for its addition.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Write SKILL.md | Create `skills/issues/SKILL.md` with all subcommands | medium |
| Board display | Format epic > issue hierarchy as readable output | medium |
| Register skill | Add skill to plugin registration and using-adev gateway skill | small |

## Acceptance Criteria

- [ ] `skills/issues/SKILL.md` exists with complete instructions for all 10 behaviors
- [ ] Board display groups issues by epic, then by status
- [ ] `create` subcommand creates issues with correct defaults
- [ ] `epic` subcommand creates epics
- [ ] `update` and `close` subcommands respect invariants (close-guard)
- [ ] `list` subcommand supports `--status` and `--epic` filters
- [ ] `ready` subcommand shows only actionable (open + unblocked) issues
- [ ] `dep` subcommand creates dependencies
- [ ] Skill is referenced in `skills/using-adev/SKILL.md` available skills table
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
