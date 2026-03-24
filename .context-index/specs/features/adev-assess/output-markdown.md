# Live Spec: Output Markdown

<!-- Live Spec within the adev-assess charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/adev-assess/charter.md -->

---
charter: adev-assess
status: review-passed
risk_level: low
milestone: v1
created: 2026-03-24
---

## Behavioral Contract

### Preconditions

- Assessment has completed and AssessmentReport is available
- Output format is set to "markdown" (default) or explicitly via `--output markdown`

### Behaviors

1. **When** markdown output is requested **then** a scorecard is generated with a header showing total score and maturity level
2. **When** markdown output is generated **then** each dimension is displayed as a row with name, score (0-100), and visual bar
3. **When** dimension score is displayed **then** visual bar uses ASCII characters (e.g., "████████░░" for 80%)
4. **When** dimension score is displayed **then** color indicators are added using markdown (🟢 for 80+, 🟡 for 50-79, 🔴 for <50)
5. **When** all dimensions are displayed **then** a summary section shows the assessment mode ("raw" or "adev") and timestamp
6. **When** the scorecard is complete **then** it is printed to stdout

### Postconditions

- Valid markdown is output to stdout
- Output is copy-paste ready for documentation
- No files are written to disk

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| No assessment results available | Print error "No assessment results to output" | 1 |

## System Constitution Reference

- **Principle:** "Skills are primarily markdown" — Output is markdown-based scorecard for readability

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Implement markdown template | Create template for scorecard header/body/footer | small |
| Implement visual score bars | Generate ASCII bars with color indicators | small |
| Format timestamp | Display human-readable timestamp | small |

## Acceptance Criteria

- [ ] Markdown scorecard displays total score prominently
- [ ] Each dimension shows score with visual bar
- [ ] Color indicators are correctly applied (🟢🟡🔴)
- [ ] Summary section shows mode and timestamp
- [ ] Output is valid markdown
- [ ] No files are modified
