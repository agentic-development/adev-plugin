---
charter: multi-repo-workspace
status: validated
risk_level: low
revision: 1
charter-revision: 2
created: 2026-04-15
updated: 2026-04-15
depends-on: ["workspace-foundation"]
source-manifest:
  sha: "0705163"
  files:
    - skills/brainstorm/SKILL.md
    - skills/specify/SKILL.md
    - tests/skills/brainstorm-workspace-bootstrap.test.mjs
    - tests/skills/specify-workspace-mode.test.mjs
  computed-at: "2025-04-25T00:00:00.000Z"
drift_detected: true
drift_source: skills/specify/SKILL.md
drift_at: 2026-05-11T00:13:06.997Z
---

# Live Spec: Workspace-Level Charters

## Behavioral Contract

### Preconditions

- Workspace is detected with `.context-index/` at the workspace root
- `/adev:brainstorm` and `/adev:specify` SKILL.md files exist

### Behaviors

1. **When** `/adev:brainstorm` is invoked at the workspace root (not inside any registered repo) **then** the charter is saved to the workspace's `.context-index/specs/features/<module>/charter.md` instead of a repo's.

2. **When** a workspace-level charter exists **then** `/adev:specify` invoked at the workspace root creates specs in the workspace `.context-index/`. These specs should include `target-repo:` frontmatter indicating which repo owns the implementation.

3. **When** a workspace-level spec has `target-repo: <slug>` **then** the spec is meant to be decomposed into a repo-level spec in that repo during planning.

4. **When** `/adev:brainstorm` is invoked inside a registered repo **then** existing behavior is preserved — the charter is saved to that repo's `.context-index/`.

5. **When** the workspace root has no `.context-index/` directory **then** `/adev:brainstorm` at the workspace root suggests: "No workspace context directory found. Run `/adev:init --workspace` to set up workspace-level context."

### Postconditions

- `/adev:brainstorm` SKILL.md includes workspace root detection
- `/adev:specify` SKILL.md supports `target-repo:` frontmatter field
- Repo-level brainstorm/specify behavior is unchanged

## Acceptance Criteria

- [ ] Brainstorm at workspace root saves charters to workspace `.context-index/`
- [ ] Specify at workspace root creates specs with `target-repo:` field
- [ ] Brainstorm inside a repo works as before
- [ ] Missing workspace `.context-index/` produces helpful guidance
- [ ] All quality gates pass
