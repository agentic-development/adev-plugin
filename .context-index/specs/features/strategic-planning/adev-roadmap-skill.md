# Live Spec: adev-roadmap Skill

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

- `.context-index/` exists with `constitution.md`, `manifest.yaml`, and `specs/product.md`
- `product.md` contains a Milestones section (written by `/adev-vision`)
- At least one feature charter exists

### Behaviors

1. **When** invoked without arguments **then** the skill reads product.md milestones, all feature charters, and existing specs to produce a full roadmap
2. **When** `--milestone <name>` is specified **then** the skill produces a roadmap for a single milestone only
3. **When** `--all` is specified **then** the skill produces a roadmap across all milestones (same as no arguments, explicit flag for clarity)
4. **When** analyzing dependencies **then** the skill reads each charter's Dependencies table and each spec's Preconditions to build a cross-feature dependency graph
5. **When** dependencies are identified **then** the skill determines a critical path — the longest chain of dependent features that constrains the overall timeline
6. **When** the roadmap is complete **then** it is saved to `.context-index/specs/roadmap/<milestone-slug>.md` (or `full-roadmap.md` for `--all`)
7. **When** writing the roadmap **then** each milestone section includes: features (with charter references), dependency graph (text-based), implementation order (topologically sorted), risk assessment (high/medium/low per feature), and suggested parallelization opportunities
8. **When** epics exist on the issue board for milestones **then** the skill updates them with dependency information via `addDependency()` for cross-epic blocking relationships
9. **When** a charter referenced by a milestone has no specs yet **then** the roadmap flags it as "specs needed" and suggests invoking `/adev-specify`
10. **When** a circular dependency is detected **then** the skill reports the cycle and asks the user to resolve it before proceeding

### Postconditions

- A roadmap document exists at `.context-index/specs/roadmap/`
- Cross-epic dependencies are recorded on the issue board (if tasks.backend configured)
- Features without specs are flagged
- The roadmap includes implementation order respecting dependencies

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| product.md missing Milestones section | Print "Run `/adev-vision` first to define milestones" and stop | N/A |
| No feature charters exist | Print warning, create minimal roadmap with only milestone structure | N/A |
| `--milestone <name>` but milestone doesn't exist | Print available milestones and ask user to choose | N/A |
| Circular dependency detected | Report the cycle, ask user to resolve | N/A |

## System Constitution Reference

- **Principle:** "Skills are primarily markdown" — Roadmap output is a markdown document
- **Principle:** "Minimize external dependencies" — Uses only Glob/Grep/Read for analysis

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Create SKILL.md | Write the skill with dependency analysis, critical path, risk assessment | large |
| Create roadmap directory | `.context-index/specs/roadmap/` | small |

## Issue Board Integration

- **Start**: Reads existing epics to understand current milestone assignments
- **During**: Updates epic dependencies via `addDependency()` for cross-feature blocking
- **End**: Updates epics with milestone assignments if missing. Reports: "Updated N epics with milestone assignments."
- Guard pattern: check `tasks.backend` in manifest; skip if unconfigured

## Acceptance Criteria

- [ ] Reads product.md milestones and all feature charters
- [ ] Builds cross-feature dependency graph from charter Dependencies tables
- [ ] Determines critical path through dependency chain
- [ ] Produces topologically sorted implementation order
- [ ] Includes risk assessment per feature
- [ ] Identifies parallelization opportunities
- [ ] Flags charters without specs as "specs needed"
- [ ] Saves roadmap to `.context-index/specs/roadmap/`
- [ ] Updates epic dependencies on issue board
- [ ] Detects and reports circular dependencies
- [ ] `--milestone` mode works for single milestone
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
