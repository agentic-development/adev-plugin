---
charter: multi-repo-workspace
status: validated
risk_level: low
revision: 2
charter-revision: 2
created: 2026-04-15
updated: 2026-04-15
depends-on: ["workspace-foundation", "context-resolution"]
source-manifest:
  sha: "b079392"
  files:
    - skills/plan/SKILL.md
    - lib/workspace.mjs
    - tests/skills/plan-workspace-mode.test.mjs
  computed-at: "2025-04-25T00:00:00.000Z"
drift_detected: true
---

# Live Spec: Dependency-Aware Planning

## Behavioral Contract

### Preconditions

- `lib/workspace.mjs` provides workspace detection and context resolution
- `/adev:plan` SKILL.md exists with `--phase` support

### Behaviors

#### Dependency Direction Convention

1. **When** `adev-workspace.yaml` declares a dependency `{ from: "A", to: "B", type: "..." }` **then** the convention is: `A` depends on `B` — meaning `B` is upstream and must be planned first. The `from` repo consumes or relies on the `to` repo's outputs. The `type` field is informational and does not affect ordering.

#### Workspace-Aware Phase Planning

2. **When** `/adev:plan --phase <name>` is invoked inside a workspace **then** the skill detects the workspace, reads the dependency graph, topologically sorts repos (upstream first), and plans each repo's matching specs in dependency order.

3. **When** the dependency graph has no cycles **then** repos are topologically sorted. Repos with no incoming dependencies are planned first. Repos at the same depth can be planned in any order.

4. **When** the dependency graph has a cycle **then** the skill emits a warning: "Circular dependency detected: <cycle path>. Planning repos in declaration order instead." The cycle is reported but does not block planning.

5. **When** `/adev:plan --phase` is invoked outside a workspace **then** existing behavior is preserved — single-repo planning with no workspace awareness.

6. **When** a workspace repo has no specs matching the phase **then** it is skipped with a note: "Repo '<slug>' has no specs for phase '<name>' — skipped."

7. **When** `dependencies` is absent or empty in `adev-workspace.yaml` **then** repos are planned in declaration order (the order they appear in the `repos` array).

### Postconditions

- `/adev:plan` SKILL.md includes workspace-aware ordering instructions for `--phase` mode
- Single-repo planning is unchanged
- The dependency direction convention is documented in the plan output

## Acceptance Criteria

- [ ] Phase planning in a workspace orders repos by dependency graph (upstream first)
- [ ] `from` depends on `to` — `to` is planned before `from`
- [ ] Circular dependencies produce a warning and fall back to declaration order
- [ ] Repos with no matching specs are skipped with a note
- [ ] Empty or absent dependencies result in declaration-order planning
- [ ] Single-repo planning is unaffected
- [ ] All quality gates pass
