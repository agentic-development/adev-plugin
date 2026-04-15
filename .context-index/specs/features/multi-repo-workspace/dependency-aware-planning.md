---
charter: multi-repo-workspace
status: draft
risk_level: low
revision: 1
charter-revision: 2
created: 2026-04-15
updated: 2026-04-15
depends-on: ["workspace-foundation", "context-resolution"]
---

# Live Spec: Dependency-Aware Planning

## Behavioral Contract

### Preconditions

- `lib/workspace.mjs` provides workspace detection and context resolution
- `/adev:plan` SKILL.md exists with `--phase` support

### Behaviors

1. **When** `/adev:plan --phase <name>` is invoked inside a workspace **then** the skill detects the workspace, reads the dependency graph from `adev-workspace.yaml`, and orders repo-level plans so upstream repos are planned before downstream repos.

2. **When** the workspace dependency graph declares `airflow-dags → dbt-models` (airflow orchestrates dbt) **then** dbt-models specs are planned first, airflow-dags specs second.

3. **When** the dependency graph has no cycles **then** repos are topologically sorted by the dependency direction. Repos with no dependencies come first.

4. **When** the dependency graph has a cycle **then** the skill emits a warning: "Circular dependency detected: <cycle path>. Planning repos in declaration order instead."

5. **When** `/adev:plan --phase` is invoked outside a workspace **then** existing behavior is preserved — single-repo planning with no workspace awareness.

6. **When** a workspace repo has no specs matching the phase **then** it is skipped with a note: "Repo '<slug>' has no specs for phase '<name>' — skipped."

### Postconditions

- `/adev:plan` SKILL.md includes workspace-aware ordering instructions for `--phase` mode
- Single-repo planning is unchanged

## Acceptance Criteria

- [ ] Phase planning in a workspace orders repos by dependency graph
- [ ] Upstream repos are planned before downstream repos
- [ ] Circular dependencies produce a warning and fall back to declaration order
- [ ] Repos with no matching specs are skipped
- [ ] Single-repo planning is unaffected
- [ ] All quality gates pass
