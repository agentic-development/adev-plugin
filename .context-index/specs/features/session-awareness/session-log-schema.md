---
charter: session-awareness
status: review-passed
risk_level: low
milestone: 1
revision: 1
charter-revision: 2
created: 2026-04-06
updated: 2026-04-06
---

# Live Spec: Session Log Schema

## Behavioral Contract

### Preconditions

- `session-capture.sh` is registered as a PostToolUse hook in `hooks/hooks.json`
- `integrations.session_capture.provider` is set to `"native"` in `manifest.yaml`
- `.context-index/.session-tracking.jsonl` may or may not exist (created on first write)

### Behaviors

1. **When** the `session-capture.sh` hook fires with a tool invocation **then** it appends a single JSON line to `.context-index/.session-tracking.jsonl` with the fields: `tool` (string), `files` (string array), `timestamp` (ISO 8601 string truncated to seconds), and `session_id` (string, optional).

2. **When** the tool invocation includes a `file_path` in the hook input **then** the `files` array contains that path. When no file path is present, `files` is an empty array.

3. **When** `integrations.session_capture.provider` is not `"native"` or is absent **then** the hook silently exits 0 with no output and no file write.

4. **When** the `.session-tracking.jsonl` file does not exist **then** it is created on first write. No header or preamble is written — the file starts with the first JSON line.

5. **When** multiple hooks fire concurrently (e.g., in worktree scenarios) **then** each append is atomic at the OS level (`fs.appendFileSync` writes are atomic for small payloads on local filesystems). Lines may interleave between sessions but each line is a complete, valid JSON object.

6. **When** an external tool reads `.session-tracking.jsonl` **then** it can parse each line independently as a JSON object. No line depends on previous lines. The file is a public contract.

### Postconditions

- Each line in `.session-tracking.jsonl` is a valid, self-contained JSON object
- Lines are append-only — existing entries are never modified or deleted by the hook
- The file grows unboundedly within a session (rotation/cleanup is out of scope for this spec)

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `.session-tracking.jsonl` write fails (permissions) | Hook exits 0, no entry written | (no error) |
| Manifest unreadable | Hook exits 0, no entry written | (no error) |
| Provider not "native" | Hook exits 0, no entry written | (no error) |
| Hook input missing tool_name | Hook exits 0, no entry written | (no error) |

## Schema Definition

### Entry Schema (per line)

```json
{
  "tool": "string (required) — tool name from hook input (e.g., 'Read', 'Edit', 'Bash')",
  "files": ["string (required) — array of file paths touched by this invocation. Empty array if no files."],
  "timestamp": "string (required) — ISO 8601 datetime truncated to seconds (e.g., '2026-04-06T18:48:27Z')",
  "session_id": "string (optional) — session identifier if available from hook input"
}
```

### Field Constraints

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `tool` | string | yes | Non-empty. Matches the `tool_name` from PostToolUse hook input. |
| `files` | string[] | yes | Zero or more absolute file paths. Empty array when tool has no file context. |
| `timestamp` | string | yes | ISO 8601 format, UTC, truncated to seconds (no milliseconds). |
| `session_id` | string | no | Present when the hook input includes a session ID. Omitted (not null) when absent. |

### Example File Content

```jsonl
{"tool":"Read","files":["/Users/dev/project/src/index.mjs"],"timestamp":"2026-04-06T18:48:27Z"}
{"tool":"Bash","files":[],"timestamp":"2026-04-06T18:48:30Z"}
{"tool":"Edit","files":["/Users/dev/project/src/index.mjs"],"timestamp":"2026-04-06T18:49:01Z"}
{"tool":"Read","files":["/Users/dev/project/tests/index.test.mjs"],"timestamp":"2026-04-06T18:49:15Z","session_id":"abc-123"}
```

## File Location and Lifecycle

- **Path:** `.context-index/.session-tracking.jsonl`
- **Gitignore:** Should be listed in `.gitignore` (transient runtime data, not project history)
- **Rotation:** Out of scope. External tools or `/adev:retro` may truncate or archive old entries.
- **Deletion:** Safe to delete at any time. The hook recreates it on next write.

## Consumer Guidance

Primary consumers:
- **`/adev:retro`** — reads session logs to compute delivery metrics (tools used, files touched, session duration)
- **`/adev:hygiene`** — reads session logs to detect files modified without context reads
- **External tools** — any tool can parse the JSONL file for analytics or dashboards

The schema is a public contract. Changes to field names or semantics require a spec revision.

## System Constitution Reference

- **Principle 1: "Minimize external dependencies"** — Uses `fs.appendFileSync` only. No JSONL library.
- **Principle 4: "Hook protocol compliance"** — `session-capture.sh` follows the PostToolUse protocol: reads stdin JSON, outputs `{}` to stdout, exits 0.
- **Coding Standard: "Patterns to Follow"** — Follows the bash + inline Node.js pattern established by `session-capture.sh` (this spec formalizes the existing implementation).

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Formalize schema | This spec IS the formalization. No code changes needed unless the existing implementation diverges. | small |
| Audit existing implementation | Verify `session-capture.sh` matches this schema. Fix any divergences. | small |
| Add schema validation tests | Test that hook output matches the schema for various tool types | medium |
| Add `.session-tracking.jsonl` to scaffold `.gitignore` | Ensure new projects exclude this file from version control | small |

## Acceptance Criteria

- [ ] Each line in `.session-tracking.jsonl` is valid JSON matching the schema
- [ ] `tool` field is always present and non-empty
- [ ] `files` field is always present (empty array when no files)
- [ ] `timestamp` is ISO 8601 UTC truncated to seconds
- [ ] `session_id` is omitted (not null) when not available
- [ ] Hook exits 0 and writes nothing when provider is not "native"
- [ ] File is created on first write without header or preamble
- [ ] Existing `session-capture.sh` implementation matches this schema (or is updated to match)
- [ ] All quality gates pass (`npm test`)
- [ ] No new dependencies added
- [ ] No constitutional violations introduced
