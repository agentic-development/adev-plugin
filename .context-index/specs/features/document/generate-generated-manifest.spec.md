---
charter: adev:document
status: implemented
risk_level: low
milestone:
revision: 1
charter-revision: 1
created: 2026-03-23
updated: 2026-05-04
source-manifest:
  sha: "3b57de6"
  files:
    - skills/document/SKILL.md
    - tests/skills/document.test.mjs
  computed-at: "2026-04-12T11:48:02.739Z"
drift_detected: true
---

# Live Spec: Generate GENERATED.md manifest

<!-- Live Spec within the adev:document charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/adev:document/charter.md -->

## Behavioral Contract

### Preconditions

- `docs/` directory exists (created by the architecture or module doc generation step that precedes manifest generation)

### Behaviors

1. **When** `/adev:document` generates documentation **then** it also generates or updates `docs/GENERATED.md` with a table tracking all generated files.

2. **When** generating the manifest **then** include for each file: file path, generated sections, last commit short SHA (7 characters from `git rev-parse --short HEAD`), last run date (YYYY-MM-DD). A row is "unchanged" if the file was not regenerated in the current run (it was not targeted by this invocation).

3. **When** updating an existing manifest **then** update rows for files that were regenerated, add rows for new files, keep rows for unchanged files.

4. **When** running with `--force` flag **then** regenerate all sections and update all rows in the manifest with new commit and date.

5. **When** `--check` flag is provided **then** output the generated manifest content as a diff without writing to disk, reporting what rows would change.

6. **When** an existing `docs/GENERATED.md` cannot be parsed (malformed table structure) **then** treat it as missing, regenerate from scratch, and emit a warning: "GENERATED.md was malformed and has been regenerated."

### Postconditions

- `docs/GENERATED.md` exists with table tracking all generated docs
- Each row contains: File, Generated Sections, Last Commit, Last Run

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| docs/ directory does not exist | Output error: "docs/ not found. Run /adev:document to generate docs first." | 1 |
| No docs generated yet (docs/ exists but empty) | Skip manifest generation, emit info: "No generated docs found. Skipping GENERATED.md." | 0 |
| GENERATED.md exists but cannot be parsed | Regenerate from scratch, emit warning | 0 |

## System Constitution Reference

- **Principle:** "Skills are primarily markdown" — Applies because the manifest is a markdown file.
- **Principle:** "Minimize external dependencies" — Applies because manifest is plain text/markdown.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Read existing manifest | If GENERATED.md exists, parse current state | small |
| Build file tracking | Track all generated docs with sections, commit | small |
| Update manifest | Write or update GENERATED.md | small |
| Handle --force | Update all rows regardless of changes | small |

## Acceptance Criteria

- [ ] Generates docs/GENERATED.md when docs are generated
- [ ] Manifest table includes all generated files
- [ ] Each row has: File, Generated Sections, Last Commit, Last Run
- [ ] Updates existing manifest preserving unchanged rows
- [ ] --force flag updates all rows
- [ ] --check flag shows diff without writing
- [ ] Errors with exit 1 when docs/ does not exist
- [ ] Malformed existing GENERATED.md is regenerated from scratch with warning
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
