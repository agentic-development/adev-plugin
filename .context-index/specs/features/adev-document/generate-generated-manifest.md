# Live Spec: Generate GENERATED.md manifest

<!-- Live Spec within the adev-document charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/adev-document/charter.md -->

---
charter: adev-document
status: draft
risk_level: low
milestone: v1
created: 2026-03-23
---

## Behavioral Contract

### Preconditions

- `docs/` directory exists
- At least one documentation file has been generated (architecture.md or module docs)

### Behaviors

1. **When** `/adev-document` generates documentation **then** it also generates or updates `docs/GENERATED.md` with a table tracking all generated files.

2. **When** generating the manifest **then** include for each file: file path, generated sections, last commit hash, last run date (YYYY-MM-DD).

3. **When** updating an existing manifest **then** update rows for files that were regenerated, add rows for new files, keep rows for unchanged files.

4. **When** running with `--force` flag **then** regenerate all sections and update all rows in the manifest with new commit and date.

### Postconditions

- `docs/GENERATED.md` exists with table tracking all generated docs
- Each row contains: File, Generated Sections, Last Commit, Last Run

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| docs/ directory does not exist | Create docs/ first, then generate manifest | 0 |
| No docs generated yet | Skip manifest generation (nothing to track) | 0 |

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
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
