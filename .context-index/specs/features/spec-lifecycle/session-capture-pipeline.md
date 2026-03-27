# Live Spec: Session Capture Pipeline

---
charter: spec-lifecycle
status: review-pending
risk_level: high
milestone: v1
created: 2026-03-27
---

## Behavioral Contract

### Preconditions

- The project has `.context-index/manifest.yaml` with `integrations.session_capture.provider` set to `entire`, `native`, or `none`
- For `native` provider: Claude Code is the active agent with JSONL session logs at `~/.claude/projects/*/sessions/`
- For `entire` provider: the `entire` CLI is installed and enabled in the repo
- Node.js `fs`, `path`, `crypto` built-ins are available

### Behaviors

1. **When** `provider` is `native` and a Claude Code session is active **then** `hooks/session-capture.sh` (PostToolUse hook) appends a line to a temporary session log file recording: tool name, files modified, and timestamp.

2. **When** `provider` is `native` and `resolveLogPath('claude-code')` is called **then** it returns the path to the current session's JSONL file under `~/.claude/projects/`.

3. **When** `provider` is `native` and `parseSession(logPath, 'claude-code')` is called **then** it reads the JSONL file line by line, parses each JSON object, and returns a condensed transcript: `{ messages: [{role, content}], filesModified: [paths], toolCalls: [{name, file}], tokenUsage: {input, output} }`.

4. **When** `provider` is `native` and the session JSONL contains tool results with large outputs (>500 chars) **then** `parseSession` truncates them to tool name + file path only, keeping the condensed transcript lightweight.

5. **When** `provider` is `entire` **then** native Claude Code hooks are NOT registered. The system reads Entire's summaries from the `entire/checkpoints/v1` git branch instead.

6. **When** `provider` is `none` **then** all session capture hooks are no-ops and `parseSession` returns `null`.

7. **When** `parseSession` encounters malformed JSONL lines **then** it skips them and continues parsing, logging a warning for each skipped line.

8. **When** the session log file does not exist or is unreadable **then** `parseSession` returns `null` and logs a warning — it never throws or blocks the calling operation.

### Postconditions

- `lib/session-parser.mjs` exports `parseSession(logPath, agent)` and `resolveLogPath(agent)` as named exports
- The condensed transcript contains only structured data, no raw conversation text
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
