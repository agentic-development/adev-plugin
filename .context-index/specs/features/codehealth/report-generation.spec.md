# Live Spec: Report Generation

---
charter: adev:codehealth
status: validated
risk_level: low
milestone:
revision: 1
charter-revision: 1
created: 2026-04-02
updated: 2026-04-02
source-manifest:
  sha: "250bea0"
  files:
    - skills/codehealth/SKILL.md
  computed-at: "2025-04-25T00:00:00.000Z"
drift_detected: true
drift_source: skills/codehealth/SKILL.md
drift_at: 2026-05-17T18:54:07.768Z
---

## Behavioral Contract

### Preconditions

- Detection passes have completed and produced zero or more Finding objects
- Each Finding has required fields `pass`, `severity`, `file_path`, `description` and optional fields `line_number` (where available) and `symbol` (where applicable)

### Behaviors

1. **When** detection passes complete with one or more findings **then** a markdown report is written to `.context-index/reports/codehealth-<YYYY-MM-DD>.md` containing YAML frontmatter, a summary table, and per-pass finding sections.

2. **When** the report frontmatter is generated **then** it contains: `date` (ISO 8601), `module_filter` (the `--module` value or `all`), `pass_filter` (the `--pass` value or `all`), `total_findings` (count), and `summary` (object with counts by severity: `high`, `medium`, `low`).

3. **When** the summary section is generated **then** it contains a table with columns: Pass, High, Medium, Low, Total — one row per pass that ran, plus a totals row.

4. **When** findings exist for a pass **then** they are listed in a section headed `## <Pass Name>` with a table: Severity, File, Line, Symbol, Description — sorted by severity (high first), then file path ascending, then line number ascending. Optional fields (Line, Symbol) show `—` when absent.

5. **When** a pass ran but produced zero findings **then** the pass section states: "No issues found." (not omitted from the report).

6. **When** a pass was skipped (due to missing prerequisites or `--pass` filter) **then** the pass section states: "Skipped — <reason>."

7. **When** all passes produce zero findings **then** the report explicitly states at the top: "No code health issues found." with each pass showing individual confirmation.

8. **When** a report file already exists for today's date **then** it is overwritten (latest run wins, idempotent).

9. **When** the `.context-index/reports/` directory does not exist **then** it is created before writing.

10. **When** the report is written **then** a conversation summary is also printed showing: total findings by severity, top 3 highest-severity findings (by severity descending, then file path ascending) with file paths, and the report file path.

### Postconditions

- A markdown file exists at `.context-index/reports/codehealth-<YYYY-MM-DD>.md`
- The frontmatter `summary` counts match the actual findings in the report body
- Running the same scan twice on the same day produces identical report content (idempotency)

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Cannot write to `.context-index/reports/` | Emit error: "Unable to write report — check directory permissions" | WRITE_ERROR |
| Finding with missing required field | Skip the malformed finding, note in report: "1 finding omitted due to missing data" | MALFORMED_FINDING |

## System Constitution Reference

- **Principle 2:** "Skills are primarily markdown" — The report is a markdown file with YAML frontmatter, consistent with the project's markdown-first approach.
- **Principle 1:** "Minimize external dependencies" — Report generation uses only string formatting and file writing, no templating libraries.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Define report template | YAML frontmatter schema + markdown body structure | small |
| Write report generation instructions | SKILL.md instructions for aggregating findings into the report format | medium |
| Define conversation summary format | Instructions for the in-conversation output after report is written | small |

## Acceptance Criteria

- [ ] Report is written to `.context-index/reports/codehealth-<YYYY-MM-DD>.md`
- [ ] Frontmatter contains date, filters, total_findings, and severity summary counts
- [ ] Summary table shows per-pass counts with totals row
- [ ] Findings are grouped by pass and sorted by severity then file path
- [ ] Passes with zero findings show "No issues found." (not omitted)
- [ ] Skipped passes show "Skipped — <reason>."
- [ ] Empty results explicitly state "No code health issues found."
- [ ] Existing report for same date is overwritten (idempotent)
- [ ] `.context-index/reports/` directory is created if missing
- [ ] Conversation summary shows severity counts, top findings, and file path
- [ ] All quality gates pass (tests)
- [ ] No constitutional violations introduced
