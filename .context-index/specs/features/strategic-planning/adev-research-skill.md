# Live Spec: adev:research Skill

<!-- Live Spec within the strategic-planning charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/strategic-planning/charter.md -->

---
charter: strategic-planning
status: review-pending
risk_level: medium
milestone: v1
revision: 1
charter-revision: 1
created: 2026-04-05
updated: 2026-04-05
---

## Behavioral Contract

### Preconditions

- `.context-index/` exists with `constitution.md` and `manifest.yaml`
- User provides a research topic (free text) or structured arguments

### Behaviors

1. **When** invoked with a topic string **then** the skill produces a structured research artifact at `.context-index/research/<slug>.md` with YAML frontmatter and organized findings
2. **When** `--web` is specified **then** web search is used as a source; if WebSearch tool is unavailable, a warning is printed and that source is skipped
3. **When** `--github <repo>` is specified **then** GitHub code search is used against the specified repo; if GitHub MCP tools are unavailable, a warning is printed and that source is skipped
4. **When** `--internal` is specified **then** the local codebase is searched using Glob/Grep/Read
5. **When** no source flags are specified **then** all available sources are used (web + internal; GitHub only if `--github` is explicit)
6. **When** `--compare` is specified **then** findings are organized as a comparison matrix with pros/cons/tradeoffs per approach
7. **When** `--issue <id>` is specified **then** the research artifact's frontmatter includes `relates-to: <issue-id>` and the issue's notes are updated with a reference to the research artifact path
8. **When** the `.context-index/research/` directory does not exist **then** it is created automatically
9. **When** a research artifact with the same slug already exists **then** the user is asked whether to overwrite or create a new version with a `-v2` suffix

### Postconditions

- A research artifact exists at `.context-index/research/<slug>.md`
- The artifact contains: YAML frontmatter (topic, date, relates-to, sources used, status), Summary, Findings (organized by source), Code Examples (with attribution), Recommendations, References (with URLs)
- If `--issue` was specified, the linked issue has a note referencing the research path

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `.context-index/` missing | Print "Run `/adev:init` first" and stop | N/A |
| WebSearch unavailable | Print warning, skip web sources, continue with other sources | N/A |
| GitHub MCP unavailable | Print warning, skip GitHub sources, continue with other sources | N/A |
| No sources produce results | Create artifact with empty findings section and a note | N/A |
| `--issue <id>` but issue not found | Print warning, skip issue linking, proceed with research | N/A |

## System Constitution Reference

- **Principle:** "Skills are primarily markdown" — The skill is a SKILL.md file; the output is a markdown artifact
- **Principle:** "Minimize external dependencies" — Uses only Claude's built-in tools (WebSearch, Glob, Grep, Read) and MCP tools if available

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Create SKILL.md | Write the skill with all arguments, steps, and key principles | large |
| Create research template | `templates/research-template.md` with frontmatter and section structure | small |
| Update context routing | Add `.context-index/research/` to documentation and context routing | small |

## Issue Board Integration

- **Start**: If `--issue <id>` is provided, read the linked issue to understand context
- **End**: If `--issue <id>` is provided, update issue notes with research artifact path via `update(id, { notes })`
- Guard pattern: check `tasks.backend` in manifest; skip if unconfigured

## Acceptance Criteria

- [ ] Produces `.context-index/research/<slug>.md` with correct YAML frontmatter
- [ ] Web search source works when WebSearch is available
- [ ] Gracefully degrades when WebSearch is unavailable (warning, not error)
- [ ] GitHub source works when MCP tools are available
- [ ] Gracefully degrades when GitHub MCP is unavailable
- [ ] Internal codebase search works via Glob/Grep/Read
- [ ] `--compare` mode produces a comparison matrix
- [ ] `--issue <id>` links research to issue and updates issue notes
- [ ] Existing research artifacts are not silently overwritten
- [ ] Research directory is auto-created if missing
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
