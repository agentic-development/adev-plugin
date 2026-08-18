---
charter: user-docs
status: validated
risk_level: low
milestone:
revision: 1
charter-revision: 2
created: 2026-05-09
updated: 2026-05-09
source-manifest:
  files:
    - docs/project-types.md
  computed-at: "2026-05-10T23:51:35.315Z"
drift_detected: true
---

# Live Spec: Project Types Guide

## Behavioral Contract

### Preconditions

- Foundation & Onboarding spec is complete (docs/README.md and getting-started.md exist)
- Eval fixture/submodule projects are available in the repository
- Each fixture project has been initialized with adev and has a context index

### Behaviors

1. **When** a user reads `docs/project-types.md` **then** they find worked examples showing how to use adev with at least 3 different project types (e.g., CLI tool, web application, API service), each using a real eval fixture project as the demo.

2. **When** a user reads a project type example **then** they see the complete flow: how `/adev:init` detects the project type, what the constitution and manifest look like for that type, and how skills adapt to the project's tech stack.

3. **When** a user reads a project type example **then** they find concrete examples of what a charter, spec, plan, and implementation look like for that specific project type — not generic templates.

4. **When** a user has a project type not covered by the examples **then** they understand enough patterns from the covered types to extrapolate how adev would work for their project.

5. **When** a project type example references an eval fixture **then** the fixture name and path are documented so the reader can explore the source themselves.

### Postconditions

- `docs/project-types.md` exists with at least 3 worked examples
- Each example references a real eval fixture project
- The guide is linked from the Table of Contents

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| An eval fixture referenced in the guide doesn't exist or has been removed | Guide is updated to reflect current fixture availability; no broken references | STALE_FIXTURE |
| A fixture project's context index is incomplete | Document only what exists; note any gaps rather than inventing content | INCOMPLETE_FIXTURE |

## System Constitution Reference

- **Principle:** "Skills are primarily markdown" — Examples show markdown-based skills in action across project types.
- **Principle:** "Minimize external dependencies" — Examples demonstrate that adev works with Node.js built-ins regardless of project type.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Inventory eval fixtures | Scan available fixtures, identify which project types they represent | small |
| Write CLI tool example | End-to-end walkthrough using a CLI fixture project | medium |
| Write web app example | End-to-end walkthrough using a web app fixture project | medium |
| Write API service example | End-to-end walkthrough using an API fixture project | medium |
| Add extrapolation guidance | Section helping readers apply patterns to unlisted project types | small |
| Link from TOC | Add project-types.md to docs/README.md navigation | small |

## Acceptance Criteria

- [x] `docs/project-types.md` exists with at least 3 project type examples
- [x] Each example uses a real eval fixture project, not hypothetical code
- [x] Each example shows charter, spec, and implementation artifacts for that project type
- [x] Fixture paths are documented so readers can explore the source
- [x] All fixture references point to existing projects
- [x] The guide is reachable from docs/README.md
- [x] No constitutional violations introduced
