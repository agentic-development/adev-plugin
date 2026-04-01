# Live Spec: Detect Mode

<!-- Live Spec within the adev-assess charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/adev-assess/charter.md -->

---
charter: adev-assess
status: implemented
risk_level: low
milestone: v1
revision: 1
charter-revision: 1
created: 2026-03-24
updated: 2026-03-24
---

## Behavioral Contract

### Preconditions

- Skill is invoked without explicit `--mode` flag
- Target directory is cwd or explicitly specified

### Behaviors

1. **When** no mode is specified **then** the skill checks if `.context-index/` directory exists in target directory
2. **When** `.context-index/` exists **then** mode is set to "adev"
3. **When** `.context-index/` does not exist **then** mode is set to "raw"
4. **When** `--mode raw` is explicitly provided **then** mode is forced to "raw" regardless of directory contents
5. **When** `--mode adev` is explicitly provided **then** mode is forced to "adev" (fails gracefully if `.context-index/` missing)

### Postconditions

- Mode is correctly determined (auto-detected or forced)
- If mode is forced to "adev" but `.context-index/` missing, warning is printed but assessment proceeds

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| --mode adev but no .context-index/ | Print warning but proceed with "adev" mode | N/A (warning) |

## System Constitution Reference

- **Principle:** "Zero external dependencies" — Uses Node.js fs for directory check

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Implement directory check | Use fs.existsSync for .context-index/ | small |
| Implement mode resolution | Handle auto-detect vs forced mode | small |

## Acceptance Criteria

- [ ] Auto-detection correctly identifies adev mode when .context-index/ exists
- [ ] Auto-detection correctly identifies raw mode when .context-index/ missing
- [ ] --mode raw forces raw mode
- [ ] --mode adev forces adev mode (with warning if no .context-index/)
