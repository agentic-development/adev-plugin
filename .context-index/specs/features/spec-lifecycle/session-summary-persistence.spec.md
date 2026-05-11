# Live Spec: Session Summary Persistence

---
charter: spec-lifecycle
status: validated
risk_level: medium
milestone:
revision: 1
charter-revision: 1
created: 2026-03-27
updated: 2026-03-28
source-manifest:
  sha: "18ce534"
  files:
    - lib/session-summary.mjs
    - tests/lib/session-summary.test.mjs
  computed-at: "2026-04-01T13:43:22.535Z"
---

## Behavioral Contract

### Preconditions

- A condensed transcript exists (produced by `parseSession` from the Session Capture Pipeline)
- `.context-index/sessions/` directory exists (created by `/adev:init` or on first write)
- Session metadata is available: date, type, mode, agent, specs-touched, commits

### Behaviors

1. **When** `writeSummary(condensed, metadata, outputDir)` is called **then** it writes a markdown file to `<outputDir>/<date>-<short-hash>.md` with YAML frontmatter (metadata) and structured content sections (intent, outcome, learnings, friction, open_items).

2. **When** `writeSummary` is called and the agent is running in-session **then** the intent/outcome/learnings/friction/open_items sections are populated by the agent based on its own session context — the function provides the file structure, not the content.

3. **When** `writeSummary` is called from a git hook (post-commit) **then** the intent/outcome fields are left as placeholders (`<!-- Fill in during session or via /adev:retro -->`) since the hook cannot generate semantic summaries without an LLM.

4. **When** `readSummary(summaryPath)` is called **then** it reads the markdown file, parses the YAML frontmatter and content sections, and returns a structured object: `{ metadata: {date, type, mode, agent, specsTouched, commits}, content: {intent, outcome, learnings, friction, openItems} }`.

5. **When** `.githooks/post-commit` fires **then** it calls `writeSummary` with metadata derived from the commit (date from commit, specs-touched from commit trailers, commit hash) and writes a summary to `.context-index/sessions/`.

6. **When** the output directory does not exist **then** `writeSummary` creates it before writing.

7. **When** a summary file already exists with the same name **then** `writeSummary` appends a counter suffix (e.g., `2026-03-27-a3f7c2e-2.md`) rather than overwriting.

### Postconditions

- Session summaries are markdown files in `.context-index/sessions/` with consistent schema
- Summaries contain no raw conversation text, API keys, or secrets
- `lib/session-summary.mjs` exports `writeSummary` and `readSummary` as named exports

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Output directory creation fails (permissions) | `writeSummary` logs warning, does not throw — never blocks commits | — (graceful) |
| Summary file write fails | `writeSummary` logs warning, does not throw | — (graceful) |
| `readSummary` called on non-existent file | Returns `null` | — (graceful) |
| `readSummary` called on malformed file | Returns partial object with available fields, `null` for unparseable sections | — (graceful) |

## System Constitution Reference

- **Principle:** "Minimize external dependencies" — Uses only `fs.writeFile`, `fs.readFile`, `fs.mkdir`, `path.join` from Node.js built-ins.
- **Principle:** "Pure ESM" — `lib/session-summary.mjs` is ESM with named exports.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Create `lib/session-summary.mjs` | Implement `writeSummary` and `readSummary` functions | medium |
| Create `.githooks/post-commit` | Git hook that calls session-summary writer after each commit | medium |
| Update `/adev:init` | Scaffold `.context-index/sessions/` directory and install `.githooks/` | small |
| Write tests for `lib/session-summary.mjs` | Test write, read, directory creation, duplicate naming, malformed files | medium |

## Acceptance Criteria

- [ ] `writeSummary` creates a markdown file with YAML frontmatter and structured content
- [ ] `readSummary` parses a session summary back into a structured object
- [ ] File naming follows `<date>-<short-hash>.md` convention
- [ ] Duplicate file names get counter suffixes instead of overwriting
- [ ] Write failures log warnings but never throw or block
- [ ] `.githooks/post-commit` triggers summary write after commits
- [ ] Session summaries contain no raw transcripts, secrets, or API keys
- [ ] All code uses only Node.js built-ins
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
