---
charter: session-awareness
status: validated
risk_level: low
milestone: 2
revision: 1
charter-revision: 2
created: 2026-04-06
updated: 2026-04-06
source-manifest:
  sha: "4c95543"
  files:
    - templates/format-documentation.md
    - skills/init/SKILL.md
  computed-at: "2025-04-25T00:00:00.000Z"
drift_detected: true
drift_source: skills/init/SKILL.md
drift_at: 2026-05-16T01:27:22.126Z
---

# Live Spec: Format Documentation

## Behavioral Contract

### Preconditions

- The Execution State File spec (`execution-state-file.md`) is implemented
- The Session Log Schema spec (`session-log-schema.md`) is implemented or formalized
- `.context-index/` directory exists

### Behaviors

1. **When** `/adev:init` scaffolds a new project with session awareness enabled **then** the scaffold includes a `FORMAT.md` file at `.context-index/FORMAT.md` documenting the execution state file format and session log JSONL schema as public contracts.

2. **When** an external tool or harness needs to read `.context-index/.execution-state.md` **then** `FORMAT.md` provides a complete schema reference (YAML frontmatter fields, markdown body structure, valid status values, field types, and constraints) sufficient to implement a parser without reading the plugin source code.

3. **When** an external tool or harness needs to read `.context-index/.session-tracking.jsonl` **then** `FORMAT.md` provides a complete schema reference (JSON fields per line, types, constraints, and example entries) sufficient to implement a parser without reading the plugin source code.

4. **When** a file format changes in a future spec revision **then** `FORMAT.md` is updated to reflect the new schema. The document includes a `revision` field in its frontmatter to track format evolution.

5. **When** the `FORMAT.md` file does not exist in an existing project **then** no functionality is affected. The file is purely documentation. Hooks and libs operate the same with or without it.

### Postconditions

- `FORMAT.md` exists at `.context-index/FORMAT.md` in newly scaffolded projects
- The document is self-contained — no cross-references to plugin source code required to understand the schemas
- The document is versioned via frontmatter `revision` field

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `FORMAT.md` missing | No impact on functionality | (no error) |
| `FORMAT.md` out of date | External tools may produce incorrect parses (drift risk, not a runtime error) | (no error) |

## Document Structure

```markdown
---
revision: 1
updated: YYYY-MM-DD
---

# File Format Reference

Public contract documentation for files in `.context-index/` that external tools may read or write.

## Execution State File

**Path:** `.context-index/.execution-state.md`
**Format:** YAML frontmatter + markdown body
**Gitignore:** Yes (transient runtime state)

### Frontmatter Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| status | enum: idle, active, blocked | yes | Current execution status |
| planRef | string (relative path) | when active | Path to active plan file |
| currentTask | integer | when active | Current task number in plan |
| issueBinding | string | no | Issue ID from task management |
| blockers | string | when blocked | Description of blocker |
| nextAction | string | no | Recommended next step |
| updated | string (ISO 8601) | yes | Last write timestamp |

### Body Format

When `status` is `active`, the body contains a progress checklist:

\```markdown
## Progress

- [x] Task 1: Description
- [ ] Task 2: Description
\```

When `status` is `idle`, the body is empty.

## Session Tracking Log

**Path:** `.context-index/.session-tracking.jsonl`
**Format:** JSON Lines (one JSON object per line)
**Gitignore:** Yes (transient runtime data)

### Entry Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| tool | string | yes | Tool name (e.g., "Read", "Edit", "Bash") |
| files | string[] | yes | File paths touched (empty array if none) |
| timestamp | string (ISO 8601, seconds) | yes | UTC timestamp |
| session_id | string | no | Session identifier (omitted when unavailable) |
```

## System Constitution Reference

- **Principle 2: "Skills are primarily markdown"** — The format documentation is a markdown file consumed by humans and external tools, consistent with the markdown-first approach.
- **Coding Standard: "Patterns to Follow"** — Templates are consumed verbatim by `cpSync()`. Adding `FORMAT.md` to the template follows this pattern.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Write FORMAT.md template | Create `templates/context-index/FORMAT.md` with both schemas | small |
| Update scaffold | Ensure `/adev:init` copies the format documentation to `.context-index/` | small |
| Add tests | Verify scaffold includes FORMAT.md, verify content matches current schemas | small |

## Acceptance Criteria

- [ ] `FORMAT.md` exists in scaffold template at `templates/context-index/FORMAT.md`
- [ ] Document covers execution state file schema (all fields, types, constraints)
- [ ] Document covers session tracking JSONL schema (all fields, types, constraints)
- [ ] Document is self-contained (no references to plugin source code)
- [ ] Document has `revision` frontmatter for version tracking
- [ ] Newly scaffolded projects include `FORMAT.md` in `.context-index/`
- [ ] All quality gates pass (`npm test`)
- [ ] No new dependencies added
- [ ] No constitutional violations introduced
