# Live Spec: Bundled Domain Profiles

<!-- Live Spec within the domain-profiles charter.
     This defines the content of the two bundled non-software domain profiles.
     Parent Charter: .context-index/specs/features/domain-profiles/charter.md -->

---
charter: domain-profiles
status: review-passed
risk_level: low
milestone: v1
revision: 3
charter-revision: 3
created: 2026-05-07
updated: 2026-05-08
---

## Behavioral Contract

This spec defines the content and structure of two bundled domain profiles — `data-engineering` and `process-automation` — shipped in `<plugin-root>/templates/domains/`. The `software` domain is intentionally excluded: per the charter invariant, `"software"` is a reserved name representing the framework's base behavior, and no `domains/software/` overlay directory is shipped or consulted. Each profile provides a complete overlay set (charter template, spec template, reviewers, gates, verification config) tailored to its domain. Users activate a profile by setting `domain: data-engineering` or `domain: process-automation` in their manifest or charter frontmatter.

### Preconditions

- Domain resolution and overlay loading are implemented (see `domain-resolution-and-overlay-structure.spec.md`)
- Skill integration points are implemented (see `domain-aware-skill-integration.spec.md`)
- The profile directories exist at `<plugin-root>/templates/domains/data-engineering/` and `<plugin-root>/templates/domains/process-automation/`

### Behaviors

**Data-Engineering Profile**

1. **When** `domain: data-engineering` is active and brainstorm loads the charter overlay **then** the charter template uses domain vocabulary: "Data Contract" instead of "Interface Contracts", "Pipeline Stages" instead of generic capability descriptions, and includes a "Data Lineage" section.

2. **When** `domain: data-engineering` is active and specify loads the spec overlay **then** the spec template replaces "HTTP Status / Error Code" in the error case table with "Failure Mode / Recovery Action", and adds a "Data Quality Expectations" section with fields for schema validation rules, freshness SLAs, and completeness thresholds.

3. **When** `domain: data-engineering` is active and review-specs loads the reviewer overlay **then** a "Data Contract Reviewer" entry with `id: "data-contract-reviewer"` is appended to the base reviewer set (`merge_strategy: append`). The reviewer's prompt content (what it checks for) is defined in the overlay file itself, not in this spec.

4. **When** `domain: data-engineering` is active and validate loads the gate overlay **then** a gate with `id: "data-quality"` is merged into the gate registry. Since this ID does not collide with any base gate ID, it is effectively appended. The gate's `command` checks for the presence of schema validation and data fixture definitions in the implementation.

5. **When** `domain: data-engineering` is active and implement loads the verification config **then** verification uses `type: output` with `trigger_patterns` matching data pipeline output files (e.g., `*.parquet`, `*.csv`, `*.json`) and `tool: none` (output comparison via assertions, not browser-based).

**Process-Automation Profile**

6. **When** `domain: process-automation` is active and brainstorm loads the charter overlay **then** the charter template uses domain vocabulary: "Integration Points" instead of "Interface Contracts", "Workflow Steps" instead of generic capabilities, and includes a "Recovery & Compensation" section.

7. **When** `domain: process-automation` is active and specify loads the spec overlay **then** the spec template replaces "HTTP Status / Error Code" with "Trigger / Outcome", adds an "Integration Points" section listing external system touchpoints, and adds a "Recovery Actions" section defining compensation logic for each failure mode.

8. **When** `domain: process-automation` is active and review-specs loads the reviewer overlay **then** an "Integration Reviewer" entry with `id: "integration-reviewer"` is appended to the base reviewer set (`merge_strategy: append`). The reviewer's prompt content (what it checks for) is defined in the overlay file itself, not in this spec.

9. **When** `domain: process-automation` is active and validate loads the gate overlay **then** a gate with `id: "flow-coverage"` is merged into the gate registry. Since this ID does not collide with any base gate ID, it is effectively appended. The gate's `command` checks for the presence of integration point tests and recovery action tests.

10. **When** `domain: process-automation` is active and implement loads the verification config **then** verification uses `type: flow` with `trigger_patterns` matching workflow definition files (e.g., `*.workflow.yaml`, `*.flow.json`, `*.bpmn`) and `tool: none`.

**Shared: Profile Completeness**

11. **When** a bundled profile directory is inspected **then** it contains exactly five files: `charter-overlay.md`, `spec-overlay.md`, `reviewers.yaml`, `gates.yaml`, and `verification.yaml`.

12. **When** a user overrides a bundled profile by creating `.context-index/domains/data-engineering/` or `.context-index/domains/process-automation/` with any overlay file **then** the two-level path precedence from `loadOverlay()` applies: the project-local file wins for that overlay type only — other overlay types still fall back to bundled (see `domain-resolution-and-overlay-structure.spec.md`, Behaviors 6-7).

### Postconditions

- Both profiles are self-contained within their directory — no profile references files outside its own directory.
- Each profile's overlays are valid inputs for their respective skill integration points (parseable YAML, well-formed markdown).
- Both bundled profiles use `merge_strategy: append` for reviewer overlays and introduce new gate IDs (`data-quality`, `flow-coverage`) that do not collide with any base gate ID. As a result, activating a bundled profile adds domain-specific reviewers and gates without removing any base ones. (Note: custom profiles using `merge_strategy: replace` CAN override base reviewers — see `domain-aware-skill-integration.spec.md`, Behavior 7.)

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Bundled profile directory is missing (e.g., deleted from plugin installation) | `loadOverlay()` returns `null` for all types; skills use base behavior | — |
| User partially overrides a bundled profile (e.g., only `charter-overlay.md` in project-local) | Project-local file wins for that type; remaining types fall back to bundled | — |
| Profile reviewer references an execution profile not available in the project | Reviewer entry is skipped with a warning (handled by skill integration spec) | UNKNOWN_PROFILE |

## System Constitution Reference

- **"Skills are primarily markdown"** — Profile overlays are markdown and YAML data files. They contain no executable logic.
- **"Minimize external dependencies"** — Profile content is static files shipped with the plugin. No additional dependencies.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Author `data-engineering/charter-overlay.md` | Charter template with data domain vocabulary (Data Contract, Pipeline Stages, Data Lineage) | small |
| Author `data-engineering/spec-overlay.md` | Spec template with Failure Mode/Recovery Action columns and Data Quality Expectations section | small |
| Author `data-engineering/reviewers.yaml` | Data Contract Reviewer entry with append strategy | small |
| Author `data-engineering/gates.yaml` | data-quality gate definition | small |
| Author `data-engineering/verification.yaml` | Output verification config for data pipeline files | small |
| Author `process-automation/charter-overlay.md` | Charter template with workflow domain vocabulary (Integration Points, Workflow Steps, Recovery & Compensation) | small |
| Author `process-automation/spec-overlay.md` | Spec template with Trigger/Outcome columns, Integration Points, and Recovery Actions sections | small |
| Author `process-automation/reviewers.yaml` | Integration Reviewer entry with append strategy | small |
| Author `process-automation/gates.yaml` | flow-coverage gate definition | small |
| Author `process-automation/verification.yaml` | Flow verification config for workflow definition files | small |
| Write content validation tests | Verify all 10 overlay files parse correctly and match expected structure | medium |

## Acceptance Criteria

- [ ] `templates/domains/data-engineering/` contains all 5 overlay files
- [ ] `templates/domains/process-automation/` contains all 5 overlay files
- [ ] Data-engineering charter overlay uses domain vocabulary (Data Contract, Pipeline Stages, Data Lineage)
- [ ] Data-engineering spec overlay uses Failure Mode / Recovery Action error columns and Data Quality Expectations
- [ ] Data-engineering reviewer appends a Data Contract Reviewer
- [ ] Data-engineering verification uses `type: output`
- [ ] Process-automation charter overlay uses domain vocabulary (Integration Points, Workflow Steps, Recovery & Compensation)
- [ ] Process-automation spec overlay uses Trigger / Outcome error columns with Integration Points and Recovery Actions
- [ ] Process-automation reviewer appends an Integration Reviewer
- [ ] Process-automation verification uses `type: flow`
- [ ] All overlay files are parseable by their respective loaders
- [ ] Project-local overrides take precedence per-file over bundled profiles
- [ ] All quality gates pass (tests, lint)
- [ ] No constitutional violations introduced
