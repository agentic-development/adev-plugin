# Live Spec: Milestone Create and List

---
charter: milestone-lifecycle
status: review-passed
risk_level: medium
milestone: v1
revision: 3
charter-revision: 3
created: 2026-05-08
updated: 2026-05-11
tracker-ref: issue-355
---

## Behavioral Contract

### Preconditions

- `.context-index/` directory exists
- `manifest.yaml` exists with a `tasks.backend` entry (epic creation requires it; milestone YAML is written regardless)
- `milestones.yaml` may or may not exist (created on first `milestone create`)

### Behaviors

1. **When** `milestone create <name>` is invoked and `milestones.yaml` does not exist **then** the file is created with the milestone entry (status: `planned`, no ship_criteria) and a linked epic is created via the issue manager with `milestone: <name>`.

2. **When** `milestone create <name> --target <date>` is invoked **then** the milestone entry includes `target_date: <date>` and the linked epic's notes include the target date.

3. **When** `milestone create <name>` is invoked and a milestone with that name already exists **then** the existing entry is updated (idempotent) rather than duplicated, and no new epic is created.

4. **When** `milestone create` succeeds **then** the milestone entry contains: `name`, `status: planned`, `epic_id` (the newly created epic's ID), and optionally `target_date`, `release` (object with `strategy` field), and `ship_criteria` (empty by default).

4a. **When** `milestone create <name> --strategy <value>` is invoked **then** the `release.strategy` field is set to `<value>`. Valid values are `manual`, `tag-only`, and `release-please`. If `--strategy` is omitted, `release` defaults to `null` (equivalent to `manual` at ship time).

4b. **When** `milestone create <name> --strategy <value>` is invoked with an unknown strategy **then** it is rejected with "Unknown release strategy '<value>'. Expected: manual, tag-only, release-please".

5. **When** `milestone list` is invoked and `milestones.yaml` exists **then** all milestones are displayed in a table with name, status, target date, epic ID, and issue progress (open/total count from the linked epic).

6. **When** `milestone list` is invoked and `milestones.yaml` does not exist **then** a message is displayed: "No milestones defined. Run `milestone create <name>` to create one."

7. **When** `milestone list` is invoked and a milestone's `epic_id` references a non-existent epic **then** the milestone row displays a warning indicator (e.g., `epic-42 (broken)`) instead of issue progress.

8. **When** `milestone create <name>` is invoked with ship criteria flags (`--check all_issues_closed --check gates_pass --confirm "CHANGELOG updated"`) **then** the `ship_criteria` array is populated with the corresponding entries.

### Release Field Schema

The `release` field on a milestone entry is an optional object controlling ship-time release mechanics. When `null` or absent, `milestone ship` uses the `manual` strategy.

```yaml
release:
  strategy: manual        # "manual" | "tag-only" | "release-please"
```

- `manual` — Pure governance. No git operations at ship time.
- `tag-only` — Creates git tag (and optional GitHub release draft) at ship time.
- `release-please` — Writes `release-as` to `release-please-config.json` at ship time. Does not create tags directly.

The `release` field is serialized/deserialized by `loadMilestones()` and `saveMilestones()`. Backward compatible: existing milestones with `release: null` continue to work (effective strategy is `manual`).

### Postconditions

- After `milestone create`: `milestones.yaml` contains the new or updated entry, and an epic exists on the issue board with `milestone: <name>` (unless backend is unconfigured or epic creation failed).
- After `milestone list`: no state is mutated (read-only operation).

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `milestone create` with no name argument | Print usage hint and exit | MISSING_NAME |
| `milestone create` with invalid name (not matching `[a-zA-Z0-9._-]+`) | Reject with "Invalid milestone name" | INVALID_NAME |
| `milestone create --target` with unparseable date | Reject with "Invalid date format. Use YYYY-MM-DD." | INVALID_DATE |
| `milestone create` when `tasks.backend` is not configured in manifest | Warn "Issue board not configured; epic creation skipped" — milestone is still written to YAML | NO_BACKEND |
| `milestone create` when issue manager `createEpic()` throws | Write milestone to YAML with `epic_id: null`, warn user that epic creation failed | EPIC_CREATE_FAILED |
| `milestone create --strategy <unknown>` with unrecognized strategy value | Reject with "Unknown release strategy" | UNKNOWN_STRATEGY |
| `milestone list` when YAML file is malformed (unparseable) | Print "milestones.yaml is malformed — cannot parse" and exit | PARSE_ERROR |

## System Constitution Reference

- **Principle:** "Minimize external dependencies — prefer Node.js built-ins" — YAML parsing reuses the existing `parseSimpleYaml()` pattern from `lib/workspace.mjs` or the `readManifest()` helper from `lib/repomap/index.mjs`. No external YAML library needed.
- **Principle:** "Skills are primarily markdown" — the `/adev:issues` SKILL.md additions are markdown instructions; the `lib/milestones.mjs` module is companion code.
- **Principle:** "Pure ESM" — all new files use `.mjs` extension with ES module imports.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| 1. Milestone YAML schema and I/O | Implement `loadMilestones()`, `saveMilestones()`, `findMilestone()` in `lib/milestones.mjs`. Define the YAML structure. Reuse the existing `parseSimpleYaml()` pattern from `lib/workspace.mjs`. | medium |
| 2. `milestone create` command | Parse arguments (name, --target, --check, --confirm). Validate inputs. Write to milestones.yaml. Call `createEpic()` through issue manager. Handle idempotent updates. | medium |
| 3. `milestone list` command | Load milestones. For each, query issue manager for epic and child issue counts. Format and display table. Handle broken epic references. | small |
| 4. SKILL.md updates | Add `milestone create` and `milestone list` subcommand documentation to `/adev:issues` SKILL.md. | small |
| 5. Tests | Unit tests for `loadMilestones`, `saveMilestones`, `findMilestone`. Integration tests for create (with mock issue manager) and list. Test error cases and idempotency. | medium |

## Acceptance Criteria

- [ ] `milestone create v1.0.0` creates `milestones.yaml` and a linked epic
- [ ] `milestone create v1.0.0` a second time updates the entry without duplicating
- [ ] `milestone create v1.0.0 --target 2026-06-01` stores the target date
- [ ] `milestone create` with ship criteria flags populates the `ship_criteria` array
- [ ] `milestone create --strategy tag-only` sets `release.strategy` to `tag-only`
- [ ] `milestone create` without `--strategy` leaves `release` as `null`
- [ ] `milestone create --strategy unknown` rejects with UNKNOWN_STRATEGY
- [ ] `milestone list` displays all milestones with status, date, epic ID, and progress
- [ ] `milestone list` warns on broken epic references
- [ ] `milestone list` with no milestones.yaml prints a helpful message
- [ ] All error cases return the expected error messages
- [ ] `loadMilestones`, `saveMilestones`, `findMilestone` are exported and independently testable
- [ ] All quality gates pass (tests, lint)
- [ ] No constitutional violations introduced
