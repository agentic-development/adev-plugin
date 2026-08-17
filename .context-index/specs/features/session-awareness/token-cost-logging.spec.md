---
charter: session-awareness
charter-extension: true
status: validated
risk_level: medium
milestone:
revision: 2
charter-revision: 2
created: 2026-04-20
updated: 2026-04-20
source-manifest:
  sha: "4700660"
  files:
    - lib/token-pricing.mjs
    - lib/token-cursor.mjs
    - lib/session-file-reader.mjs
    - tests/lib/token-pricing.test.mjs
    - tests/lib/token-cursor.test.mjs
    - tests/lib/session-file-reader.test.mjs
    - hooks/session-capture.sh
    - tests/hooks/session-capture.test.mjs
    - lib/execution-state.mjs
    - hooks/hooks.json
  computed-at: "2026-04-25T21:55:13.685Z"
drift_detected: true
---

# Live Spec: Token Cost Logging

<!-- Live Spec within the session-awareness charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/session-awareness/charter.md
     Research: .context-index/research/token-cost-logging-for-plugin-lifecycle-sk.md -->

## Behavioral Contract

This spec extends the existing session tracking JSONL schema (`.context-index/.session-tracking.jsonl`) with optional token usage fields. When Claude Code's local session data is accessible, each JSONL entry is enriched with a `usage` object containing input/output token counts, cache metrics, and estimated cost. When session data is unavailable, entries are written without usage — the feature degrades gracefully and never blocks agent work.

### Preconditions

- `session-capture.sh` is registered as a PostToolUse hook in `hooks/hooks.json` (existing)
- `integrations.session_capture.provider` is `"native"` in `manifest.yaml` (existing)
- `.context-index/.session-tracking.jsonl` may or may not exist (existing — created on first write)
- Claude Code's local conversation files MAY exist at `~/.claude/projects/<hash>/` (not guaranteed — internal, undocumented format)

### Behaviors

1. **When** the `session-capture.sh` hook fires and Claude Code session data is accessible at the resolved session file path **then** the JSONL entry includes a `usage` object with fields: `input_tokens` (number), `output_tokens` (number), `cache_read_tokens` (number), `cache_creation_tokens` (number), and `cost_usd` (number, 6 decimal places).

2. **When** the `session-capture.sh` hook fires and Claude Code session data is NOT accessible (file not found, parse error, permission denied, unsupported format) **then** the JSONL entry is written WITHOUT the `usage` field. The hook exits 0. No error is surfaced.

3. **When** token usage data is available **then** the `usage` values represent the **delta** since the last tracked entry for the same `session_id`. Deltas are used (rather than absolute cumulative counts) because the hook fires on every tool use — absolute values would require consumers to deduplicate, and would make per-tool-call cost attribution impossible. The hook maintains a lightweight cursor file (`.context-index/.token-cursor.json`) containing `{ session_id, last_offset, cumulative }` to compute deltas without re-parsing the entire session file.

4. **When** the cursor file is missing, references a different `session_id`, or has a `last_offset` that exceeds the current session file size (file was truncated or rotated) **then** a new cursor is initialized from the current end-of-file position. The first entry after initialization has no `usage` field (no baseline to compute delta from). Subsequent entries compute deltas normally.

5. **When** an entry includes `usage` AND execution state is `active` **then** the usage is attributable to the active skill via the existing `issue` field in the same JSONL entry. No new attribution mechanism is introduced — consumers correlate `usage` with `issue`/`epic` fields already present.

6. **When** `cost_usd` is computed **then** it uses a bundled price table (`lib/token-pricing.mjs`) mapping model IDs to per-token rates. The price table is a static, read-only lookup — not fetched from an API, and no user-supplied credentials or remote lookups are in scope. The model ID is extracted from Claude Code's session data (the hook reads whatever model identifier the session file contains); this does not violate the Model Routing spec, which governs skill-level dispatch decisions, not hook-internal data extraction. If the model ID is unknown, `cost_usd` is set to `null` (not omitted — signals "computed but unknown model").

7. **When** Claude Code's session file format changes in a breaking way (field renames, structural changes) **then** the parser fails gracefully per Behavior 2 — no `usage` field is written. A one-time warning is logged to stderr: `"adev: token-usage parser could not read session data (format may have changed)"`. Deduplication is tracked via a `format_warning_emitted` boolean in the cursor file — the warning fires only when this field is absent or `false`, then the field is set to `true`. Cursor resets (Behavior 4) clear this flag.

8. **When** the `session_capture.provider` is not `"native"` **then** no token tracking is attempted. The hook exits 0 with no output (existing behavior, unchanged).

### Postconditions

- Every line in `.session-tracking.jsonl` remains valid, self-contained JSON
- Lines without `usage` are fully backward-compatible with existing consumers
- The cursor file is updated atomically after each successful usage computation
- No new files are created outside `.context-index/` (cursor lives alongside session tracking)

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Claude Code session file not found | Entry written without `usage`, exit 0 | (none) |
| Session file parse error | Entry written without `usage`, generic stderr warning (no absolute paths or session hashes — safe for CI logs), exit 0 | (none) |
| Cursor file corrupt or unreadable | Cursor re-initialized, entry without `usage`, exit 0 | (none) |
| Unknown model ID in session data | `cost_usd` set to `null`, other `usage` fields populated | (none) |
| Session file exceeds 50 MB | File skipped, entry written without `usage`, exit 0 | (none) |
| Cursor `last_offset` exceeds file size | Cursor re-initialized (file truncated/rotated), entry without `usage`, exit 0 | (none) |
| Concurrent hook invocations | Each writes its own entry; cursor updates may race but worst case is a skipped delta (next entry self-corrects) | (none) |
| Disk full / write permission error | Entry written without `usage` (or not written at all per existing behavior), exit 0 | (none) |

## Extended Schema Definition

### Entry Schema (per line, unified)

```json
{
  "tool": "string (required)",
  "files": ["string (required)"],
  "timestamp": "string (required, ISO 8601 truncated to seconds)",
  "session_id": "string (optional)",
  "operator": "string (optional, format: '<user>/<local|remote>')",
  "issue": "string (optional, from execution state)",
  "epic": "string (optional, from issue board)",
  "usage": {
    "input_tokens": "number (required when usage present)",
    "output_tokens": "number (required when usage present)",
    "cache_read_tokens": "number (required when usage present, 0 if no cache)",
    "cache_creation_tokens": "number (required when usage present, 0 if no cache)",
    "cost_usd": "number|null (required when usage present, null if model unknown)"
  }
}
```

### Field Constraints for `usage`

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `usage` | object | no | Present only when token data was successfully extracted. Omitted (not null) otherwise. |
| `usage.input_tokens` | number | yes (within usage) | Non-negative integer. Delta since last tracked entry. |
| `usage.output_tokens` | number | yes (within usage) | Non-negative integer. Delta since last tracked entry. |
| `usage.cache_read_tokens` | number | yes (within usage) | Non-negative integer. 0 when no cache activity. |
| `usage.cache_creation_tokens` | number | yes (within usage) | Non-negative integer. 0 when no cache activity. |
| `usage.cost_usd` | number or null | yes (within usage) | 6 decimal places when computed. `null` when model is unknown. |

### Example Entries

```jsonl
{"tool":"Read","files":["/project/src/index.mjs"],"timestamp":"2026-04-20T14:30:01Z","session_id":"abc-123","operator":"dev/local","usage":{"input_tokens":1250,"output_tokens":340,"cache_read_tokens":800,"cache_creation_tokens":0,"cost_usd":0.004320}}
{"tool":"Edit","files":["/project/src/index.mjs"],"timestamp":"2026-04-20T14:30:15Z","session_id":"abc-123","operator":"dev/local","issue":"TSK-4","epic":"EPIC-2","usage":{"input_tokens":2100,"output_tokens":890,"cache_read_tokens":1500,"cache_creation_tokens":200,"cost_usd":0.009870}}
{"tool":"Bash","files":[],"timestamp":"2026-04-20T14:30:22Z","session_id":"abc-123","operator":"dev/local"}
```

The third entry has no `usage` — either token data was unavailable or this was the first entry after cursor initialization.

## Data Source: Claude Code Session Files

### Location Resolution

Claude Code stores conversation data in `~/.claude/projects/<hash>/` where `<hash>` is a deterministic encoding of the project's absolute path. The hook resolves the session file by:

1. Scanning directories under `$HOME/.claude/projects/`. Each directory name encodes a project path. The resolver reads the directory's metadata (e.g., a `.project` file or the directory name itself) to find the one matching `$PWD`. If no match is found, resolution fails gracefully (Behavior 2).
2. Within the matched directory, locating the file whose name matches the `session_id` from the hook's stdin JSON payload (e.g., `<session_id>.jsonl`).
3. Checking the file size — if it exceeds 50 MB, the file is skipped (prevents unbounded memory consumption on corrupted or unusually large session files). Resolution fails gracefully per Behavior 2.
4. Parsing the file as JSONL, reading only from `last_offset` (cursor) to end-of-file, extracting cumulative usage metadata from the newest entries.

The resolution contract is defined by `lib/session-file-reader.mjs`:
- **Input:** `{ sessionId: string, projectDir: string }`
- **Output:** `{ model: string, inputTokens: number, outputTokens: number, cacheReadTokens: number, cacheCreationTokens: number } | null`
- **Failure mode:** Returns `null` on any error (file not found, parse error, size exceeded, format unrecognized)

### Fragility Acknowledgment

This data source reads an **internal, undocumented format**. It is explicitly designed to break gracefully:
- The parser is isolated in `lib/session-file-reader.mjs`
- All parse failures fall through to Behavior 2 (no `usage`, no error)
- When anthropics/claude-code#38344 lands (token data in hook payloads), the reader can be replaced with a direct payload read — the JSONL schema and consumer contracts remain unchanged

### Cursor File

`.context-index/.token-cursor.json` tracks the last-read position:

```json
{
  "session_id": "abc-123",
  "last_offset": 45230,
  "cumulative": {
    "input_tokens": 15000,
    "output_tokens": 4200,
    "cache_read_tokens": 8000,
    "cache_creation_tokens": 500
  },
  "format_warning_emitted": false
}
```

- Reset when `session_id` changes (new session)
- Deleted safely at any time (next entry reinitializes)
- Listed in `.gitignore` (transient runtime data)

**Why a separate file from `.execution-state.md`:** The cursor is a byte-offset cache for efficient incremental parsing — it is session-scoped, transient, and has no semantic relationship to plan/task/issue execution state. The Execution State File (execution-state-file.md) tracks plan-scoped progress (`planRef`, `currentTask`, `issueBinding`) that persists across sessions and is consumed by skills and hooks for context injection. The cursor's lifecycle is fundamentally different: it is invalidated on every session change, carries no domain meaning, and its loss causes only a single missed `usage` entry (not context loss). Merging these would conflate a parsing checkpoint with a semantic state contract, adding complexity to both consumers for no benefit.

### Gitignore Requirements

Both `.context-index/.session-tracking.jsonl` and `.context-index/.token-cursor.json` must be listed in `.gitignore`. The JSONL file contains `cost_usd` and token counts that could expose usage patterns and API spend if committed to a shared or public repository. The scaffold `.gitignore` template already includes `.session-tracking.jsonl`; this spec adds `.token-cursor.json` alongside it.

## System Constitution Reference

- **Principle 1: "Minimize external dependencies"** — Uses only `node:fs` and `node:path`. Price table is a static JS object, not an npm package. No API calls.
- **Principle 2: "Skills are primarily markdown"** — This spec adds companion code (`lib/session-file-reader.mjs`, `lib/token-pricing.mjs`) but the session-capture hook remains the entry point. No skill markdown changes required.
- **Principle 4: "Hook protocol compliance"** — Extended hook still reads stdin JSON, exits 0, outputs `{}` to stdout. Token enrichment is internal to the hook's processing; it does not change the protocol contract.
- **Coding Standard: "Patterns to Follow"** — Follows the bash + inline Node.js pattern of `session-capture.sh`, with heavier logic factored into importable `.mjs` modules.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Create `lib/session-file-reader.mjs` | Module that locates and parses Claude Code session files, returns cumulative token usage for a session ID. Graceful failure on all error paths. | medium |
| Create `lib/token-pricing.mjs` | Static price table mapping model IDs to per-token USD rates. Export a `computeCost(model, usage)` function. | small |
| Extend `session-capture.sh` | After building the base JSONL entry, call session-file-reader to get current cumulative usage, read cursor, compute delta, append `usage` field, update cursor. | medium |
| Create `.token-cursor.json` management | Read/write/reset cursor file with atomic writes. Handle corrupt state. | small |
| Add to `.gitignore` template | Add `.token-cursor.json` to the scaffold `.gitignore` alongside `.session-tracking.jsonl`. | small |
| **Update session-log-schema spec (co-requirement)** | Amend the existing `session-log-schema.md` spec to formally document the full implemented field set (`operator`, `issue`, `epic`) and the new optional `usage` field. This is a prerequisite — the unified schema in this spec references fields not yet in the formal schema contract. Must be completed before or alongside implementation. | small |
| Write tests | Unit tests for session-file-reader (mock session data), token-pricing, cursor management, and integration test for the extended hook. | medium |

## Acceptance Criteria

- [ ] JSONL entries include `usage` object when Claude Code session data is accessible
- [ ] JSONL entries omit `usage` (not null, not empty object) when session data is unavailable
- [ ] `usage.cost_usd` is `null` (not omitted) when model ID is unknown
- [ ] Delta computation produces non-negative values for all token fields
- [ ] Cursor file is created, updated, and reset correctly across session boundaries
- [ ] Hook exits 0 in ALL error scenarios (never blocks agent work)
- [ ] Existing consumers of `.session-tracking.jsonl` are unaffected (backward-compatible)
- [ ] No new external dependencies added
- [ ] `lib/session-file-reader.mjs` logs a stderr warning on format change (once per session, not per call)
- [ ] Price table covers current Claude model IDs (opus, sonnet, haiku families)
- [ ] All quality gates pass (`npm test`)
- [ ] No constitutional violations introduced
