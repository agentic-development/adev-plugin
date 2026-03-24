# Live Spec: Output JSON

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
- Output format is explicitly set to `--output json`

### Behaviors

1. **When** JSON output is requested **then** a JSON object is generated with assessment results
2. **When** JSON object is generated **then** it includes: version, timestamp, mode, totalScore, level, and array of dimension results
3. **When** dimension results are included **then** each dimension has: name, score, weight, evidence (array of findings)
4. **When** JSON is complete **then** it is printed to stdout with no extra formatting

### Postconditions

- Valid JSON is output to stdout
- Output is parseable by machine consumers
- No files are written to disk

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| No assessment results available | Print error "No assessment results to output" | 1 |

## System Constitution Reference

- **Principle:** "Zero external dependencies" — Uses Node.js built-in JSON.stringify

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Define JSON schema | Create TypeScript interface for assessment report | small |
| Implement JSON serialization | Use JSON.stringify for output | small |

## Acceptance Criteria

- [ ] JSON output is valid and parseable
- [ ] Contains all required fields (version, timestamp, mode, totalScore, level, dimensions)
- [ ] Each dimension includes name, score, weight, evidence
- [ ] No files are modified
