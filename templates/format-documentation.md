---
revision: 1
updated: {{ date }}
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

```markdown
## Progress

- [x] Task 1: Description
- [ ] Task 2: Description
```

When `status` is `idle`, the body is empty.

### Serialization Notes

- Free-text fields (`blockers`, `nextAction`, task descriptions) are single-line: newlines replaced with spaces
- The `---` sequence is stripped from field values to prevent frontmatter corruption
- Writes are atomic (temp-file-then-rename) for concurrent access safety

## Session Tracking Log

**Path:** `.context-index/.session-tracking.jsonl`
**Format:** JSON Lines (one JSON object per line)
**Gitignore:** Yes (transient runtime data)

### Entry Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| tool | string | yes | Tool name (e.g., "Read", "Edit", "Bash") |
| files | string[] | yes | File paths touched by this invocation (empty array if none) |
| timestamp | string (ISO 8601, seconds) | yes | UTC timestamp, truncated to seconds |
| session_id | string | no | Session identifier (key omitted when unavailable, never null) |

### Example

```jsonl
{"tool":"Read","files":["/path/to/file.mjs"],"timestamp":"2026-04-06T18:48:27Z"}
{"tool":"Bash","files":[],"timestamp":"2026-04-06T18:48:30Z"}
{"tool":"Edit","files":["/path/to/file.mjs"],"timestamp":"2026-04-06T18:49:01Z","session_id":"abc-123"}
```

### Notes

- Each line is a valid, self-contained JSON object
- Lines are append-only — existing entries are never modified or deleted
- Safe to delete at any time; the hook recreates it on next write
- No rotation or cleanup is built in; external tools may archive old entries
