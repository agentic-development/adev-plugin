# Live Spec: Run Assessment

<!-- Live Spec within the adev-assess charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/adev-assess/charter.md -->

---
charter: adev-assess
status: review-passed
risk_level: medium
milestone: v1
created: 2026-03-24
---

## Behavioral Contract

### Preconditions

- The skill is invoked with optional flags: `--mode raw|adev` and `--output json|markdown`
- If no `--mode` flag is provided, the skill auto-detects by checking for `.context-index/` directory
- Target directory is the current working directory (cwd) or explicitly specified

### Behaviors

1. **When** the skill is invoked without explicit mode **then** it checks for `.context-index/` directory and sets mode to "adev" if found, otherwise "raw"
2. **When** mode is "raw" **then** the assessment runs across 8 structural dimensions only
3. **When** mode is "adev" **then** the assessment runs across all 11 dimensions (8 structural + 3 adev-specific)
4. **When** the assessment runs **then** each dimension is scored 0-100 using static file inspection via Glob/Grep/Read
5. **When** all dimensions are scored **then** a total weighted score is calculated
6. **When** total score is calculated **then** a maturity level is assigned (L1: 0-20, L2: 21-40, L3: 41-60, L4: 61-80, L5: 81-100)
7. **When** assessment completes **then** output is generated in the specified format (default: markdown)

### Postconditions

- AssessmentReport is generated with: totalScore, level, dimension scores, evidence for each dimension, timestamp
- Output is printed to stdout in the requested format
- No files are modified on the filesystem

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Target directory does not exist | Print error message and exit | 1 |
| No files match any assessment patterns | Score affected dimensions as 0 with note | N/A |
| Invalid --mode flag provided | Print error with valid options | 1 |
| Invalid --output flag provided | Print error with valid options | 1 |

## System Constitution Reference

- **Principle:** "Minimize external dependencies" — Uses only Node.js built-ins (fs, path, glob, grep) for file inspection
- **Principle:** "Skills are primarily markdown" — The skill is defined in SKILL.md, companion code minimal
- **Principle:** "Pure ESM" — All companion code uses .mjs extension

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Create assessment dimensions config | Define 11 dimensions with weights and patterns | medium |
| Implement static file inspection | Use Glob/Grep to find evidence for each dimension | medium |
| Implement scoring algorithm | Calculate scores 0-100 per dimension | small |
| Implement level calculation | Map total score to maturity level | small |
| Integrate with skill framework | Wire up skill invocation and output | small |

## Acceptance Criteria

- [ ] Skill invokes and runs without errors on a sample codebase
- [ ] 8 structural dimensions are scored correctly in raw mode
- [ ] 11 dimensions are scored correctly in adev mode
- [ ] Mode auto-detection works (detects .context-index/)
- [ ] Maturity level is correctly derived from total score
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
