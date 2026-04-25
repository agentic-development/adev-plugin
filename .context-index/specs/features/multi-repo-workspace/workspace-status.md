---
charter: multi-repo-workspace
status: validated
risk_level: low
revision: 1
charter-revision: 2
created: 2026-04-15
updated: 2026-04-15
depends-on: ["workspace-foundation", "context-resolution"]
source-manifest:
  sha: "e286eb2"
  files:
    - skills/status/SKILL.md
    - lib/workspace.mjs
    - tests/skills/status-workspace-mode.test.mjs
  computed-at: "2025-04-25T00:00:00.000Z"
---

# Live Spec: Workspace Status

## Behavioral Contract

### Preconditions

- Workspace is detected with registered repos
- `/adev:status` SKILL.md exists

### Behaviors

1. **When** `/adev:status` is invoked at the workspace root **then** it aggregates charter and spec status across all registered repos plus the workspace's own `.context-index/`. Output is grouped by repo.

2. **When** a repo is missing or has no `.context-index/` **then** it appears in the status with: "<slug>: no context configured".

3. **When** `/adev:status` is invoked inside a registered repo **then** existing behavior is preserved — single-repo status only. A footer note indicates: "This repo is part of workspace '<name>'. Run `/adev:status` at the workspace root for cross-repo view."

4. **When** the workspace has its own specs/charters **then** they appear under a "Workspace" section in the status output.

### Postconditions

- `/adev:status` SKILL.md includes workspace aggregation instructions
- Single-repo status is unchanged

## Acceptance Criteria

- [ ] Status at workspace root shows all repos grouped
- [ ] Missing repos and repos without context are reported gracefully
- [ ] Status inside a repo works as before with workspace footer note
- [ ] Workspace-level specs appear under a Workspace section
- [ ] All quality gates pass
