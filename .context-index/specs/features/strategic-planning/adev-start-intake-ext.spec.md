# Live Spec: adev:work Intake Extension

<!-- Live Spec within the strategic-planning charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/strategic-planning/charter.md -->

---
charter: strategic-planning
status: superseded
risk_level: low
milestone:
revision: 1
charter-revision: 1
created: 2026-04-05
updated: 2026-05-04
source-manifest:
  sha: "92f7f5c"
  files:
    - lib/issues/registry.mjs
    - skills/issues/SKILL.md
    - skills/work/SKILL.md
    - tests/skills/assess.test.mjs
  computed-at: "2026-07-03T22:27:11.402Z"
---

## Behavioral Contract

### Preconditions

- `skills/work/SKILL.md` exists
- `.context-index/` exists with `manifest.yaml`

### Behaviors

1. **When** `--intake` is invoked without additional arguments **then** the skill prompts the user to describe incoming requests one at a time, processing each interactively
2. **When** `--intake "<description>"` is invoked with a description **then** the skill processes a single request: categorizes it (bug/feature/task), estimates priority (0-4), identifies the best-fit epic (by matching against existing charters and milestones), and proposes an issue
3. **When** `--intake --file <path>` is invoked **then** the skill reads a file containing multiple requests (one per line or separated by blank lines) and batch-processes them
4. **When** processing a request **then** for each item the skill: classifies work type (bug/feature/task), estimates priority based on keywords and context, matches to existing epic by comparing against charter scopes and milestone feature lists, and proposes the issue with all fields filled
5. **When** a request doesn't match any existing epic **then** the skill proposes creating a new epic (with milestone if identifiable) or filing under "Unassigned"
6. **When** batch processing is complete **then** the skill presents a summary table of all proposed issues and asks for user confirmation before creating them
7. **When** the user confirms **then** issues are created on the issue board via the configured adapter

### Postconditions

- One or more issues are created on the issue board
- Each issue has: title, type, priority, and epic assignment (if matched)
- A summary of created issues is displayed

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `.context-index/` missing | Print "Run `/adev:init` first" and stop | N/A |
| `--intake --file <path>` but file not found | Print "File not found: <path>" and stop | N/A |
| tasks.backend not configured | Print "Issue board not configured. Add `tasks.backend` to manifest.yaml." and stop | N/A |
| No existing charters or epics | Process requests as "Unassigned" issues, suggest running `/adev:brainstorm` first | N/A |

## System Constitution Reference

- **Principle:** "Skills are primarily markdown" — Changes are to SKILL.md content only

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Add --intake argument | Document in Arguments section of adev:work SKILL.md | small |
| Add intake processing steps | New Step 6 (or branch after Step 2) for intake mode | medium |
| Add batch file processing | Support --file flag for multi-request intake | small |

## Issue Board Integration

- **End**: Creates issues per incoming request via `create()`. Optionally creates new epics via `createEpic()` if no matching epic exists. Reports: "Created N issues on issue board."
- Guard pattern: check `tasks.backend` in manifest; **required** for intake mode (not optional — intake's purpose is issue creation)

## Acceptance Criteria

- [ ] `--intake` mode processes a single request interactively
- [ ] `--intake "<description>"` processes a single request from argument
- [ ] `--intake --file <path>` batch-processes multiple requests
- [ ] Each request is classified by type (bug/feature/task)
- [ ] Each request is assigned a priority estimate
- [ ] Requests are matched to existing epics by charter scope
- [ ] Unmatched requests are flagged for new epic creation or "Unassigned"
- [ ] Summary table shown before creating issues
- [ ] User confirmation required before batch creation
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
