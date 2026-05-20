# Live Spec: Session Capture Pipeline

---
charter: spec-lifecycle
status: validated
risk_level: high
milestone:
revision: 1
charter-revision: 1
created: 2026-03-27
updated: 2026-03-28
source-manifest:
  sha: "94602b0"
  files:
    - hooks/session-capture.sh
    - lib/session-parser.mjs
    - tests/hooks/session-capture.test.mjs
    - tests/lib/session-parser.test.mjs
  computed-at: "2026-04-01T13:43:22.528Z"
drift_detected: true
---

## Behavioral Contract

### Preconditions

- The project has `.context-index/manifest.yaml` with `integrations.session_capture.provider` set to `entire`, `native`, or `none`
- For `native` provider: Claude Code is the active agent with JSONL session logs at `~/.claude/projects/*/sessions/`
- For `entire` provider: the `entire` CLI is installed and enabled in the repo
- Node.js `fs`, `path`, `crypto` built-ins are available

### Behaviors

1. **When** `provider` is `native` and a Claude Code session is active **then** `hooks/session-capture.sh` (PostToolUse hook) appends a JSON line to the session tracking file at `.context-index/.session-tracking.jsonl` (permissions 0600) recording: `{"tool": "<name>", "files": ["<paths>"], "specs": ["<spec-paths>"], "timestamp": "<ISO>"}`. This file is the canonical format consumed by `.githooks/prepare-commit-msg` for commit trailer injection. The file is created on first tool use and deleted after session end or commit.

2. **When** `provider` is `native` and `resolveLogPath('claude-code')` is called **then** it identifies the current project by computing a deterministic hash of the absolute project root path (matching Claude Code's internal project ID scheme), resolves the session log directory at `~/.claude/projects/<project-hash>/sessions/`, and returns the path to the most recent JSONL file in that directory. The resolved path is validated to be a child of `~/.claude/projects/` before being opened.

3. **When** `provider` is `native` and `parseSession(logPath, 'claude-code')` is called **then** it reads the JSONL file line by line, parses each JSON object, and returns a condensed transcript: `{ messages: [{role, turnIndex, timestamp}], filesModified: [paths], toolCalls: [{name, file}], tokenUsage: {input, output} }`. Message content is **never** included in the condensed transcript — only metadata (role, turn index, timestamp) is retained. This prevents secrets, API keys, PII, or confidential data from leaking into downstream artifacts.

4. **When** `provider` is `native` and the session JSONL contains tool results **then** `parseSession` extracts only the tool name and file path (if applicable), discarding all tool output content. No raw conversation text or tool output is retained in the condensed transcript.

5. **When** `provider` is `entire` **then** native Claude Code hooks are NOT registered. The system reads Entire's summaries from the `entire/checkpoints/v1` git branch instead.

6. **When** `provider` is `none` **then** all session capture hooks are no-ops and `parseSession` returns `null`.

7. **When** `parseSession` encounters malformed JSONL lines **then** it skips them and continues parsing, logging a warning for each skipped line.

8. **When** the session log file does not exist or is unreadable **then** `parseSession` returns `null` and logs a warning — it never throws or blocks the calling operation.

### Postconditions

- `lib/session-parser.mjs` exports `parseSession(logPath, agent)` and `resolveLogPath(agent)` as named exports
- The condensed transcript contains only structured metadata — no message content, no tool output content, no secrets, no PII
- The session tracking file format (`.context-index/.session-tracking.jsonl`) is owned by this spec and consumed by structured-commit-trailers
- No external dependencies — only Node.js built-ins used
- Session capture never blocks commits or agent operations

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Session log file not found | `parseSession` returns `null`, logs warning | — (graceful) |
| Session log file unreadable (permissions) | `parseSession` returns `null`, logs warning | — (graceful) |
| Malformed JSONL line | Skip line, continue parsing, log warning | — (graceful) |
| Unknown agent type passed to `resolveLogPath` | Returns `null`, logs warning | UNKNOWN_AGENT |
| `provider` field missing from manifest | Treat as `none`, log warning | — (graceful) |

## System Constitution Reference

- **Principle:** "Minimize external dependencies" — Session parser uses only `fs.readFile`, `path.join`, `JSON.parse` from Node.js built-ins.
- **Principle:** "Pure ESM" — `lib/session-parser.mjs` is ESM with named exports.
- **Principle:** "Hook protocol compliance" — `hooks/session-capture.sh` follows the bash hook protocol (JSON stdin, exit 0, JSON stdout).

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Create `lib/session-parser.mjs` | Implement `parseSession` and `resolveLogPath` with Claude Code adapter | large |
| Create `hooks/session-capture.sh` | PostToolUse hook that logs tool name + files to temp session file | medium |
| Register hook in `hooks/hooks.json` | Add session-capture.sh to hook registry | small |
| Write tests for `lib/session-parser.mjs` | Test JSONL parsing, truncation, malformed lines, missing files, provider routing | large |
| Create JSONL fixture files | Test fixtures with realistic Claude Code session data | small |

## Acceptance Criteria

- [ ] `parseSession(logPath, 'claude-code')` returns condensed transcript from JSONL
- [ ] `resolveLogPath('claude-code')` returns correct path to session JSONL
- [ ] Large tool outputs are truncated in condensed transcript
- [ ] Malformed JSONL lines are skipped with warnings
- [ ] Missing or unreadable session logs return `null`, never throw
- [ ] `provider: entire` disables native hooks
- [ ] `provider: none` makes all session operations no-ops
- [ ] `hooks/session-capture.sh` follows hook protocol (JSON stdin/stdout, exit 0)
- [ ] All code uses only Node.js built-ins
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
