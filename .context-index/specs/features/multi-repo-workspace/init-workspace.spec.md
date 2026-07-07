---
charter: multi-repo-workspace
status: validated
risk_level: low
revision: 2
charter-revision: 2
created: 2026-04-15
updated: 2026-04-15
depends-on: ["workspace-foundation"]
source-manifest:
  sha: "6c5ccfb"
  files:
    - skills/init/SKILL.md
    - templates/workspace-template.yaml
    - tests/skills/init-workspace.test.mjs
  computed-at: "2026-07-03T22:27:11.451Z"
---

# Live Spec: Init Workspace

## Behavioral Contract

### Preconditions

- `lib/workspace.mjs` exists with `detectWorkspace`
- `templates/workspace-template.yaml` exists
- `/adev:init` SKILL.md exists and handles single-repo initialization

### Behaviors

1. **When** `/adev:init --workspace` is invoked in a directory without `adev-workspace.yaml` **then** the skill scaffolds: `adev-workspace.yaml` from template and a `.context-index/` directory. No workspace-level `CLAUDE.md` is created — agent files are repo-level concerns per the charter's Out of Scope boundary.

2. **When** `/adev:init --workspace` is invoked and child directories contain `.context-index/manifest.yaml` files **then** the skill auto-discovers them and offers to register them as repos: "Found N repos with adev context: <list>. Register them? (yes / select / skip)".

3. **When** the user responds with "yes" **then** all discovered repos are registered in `adev-workspace.yaml` using the directory name as `slug` and relative path as `path`.

4. **When** the user responds with "select" **then** the skill lists discovered repos with numbers and asks the user to pick which ones to register. Only selected repos are added.

5. **When** the user responds with "skip" **then** no repos are registered. `adev-workspace.yaml` is scaffolded with `repos: []` and the skill suggests: "Add repos manually to adev-workspace.yaml."

6. **When** no child directories contain `.context-index/manifest.yaml` **then** the skill scaffolds the workspace with `repos: []` and reports: "No repos with adev context found. Initialize repos with `/adev:init` first, or add them manually to adev-workspace.yaml."

7. **When** `/adev:init --workspace` is invoked in a directory that already has `adev-workspace.yaml` **then** the skill reports: "Workspace already initialized. Use `/adev:init` in a repo directory to initialize individual repos." No files are modified.

8. **When** `/adev:init` (without `--workspace`) is invoked inside a workspace repo **then** existing behavior is preserved — it initializes that repo's `.context-index/` as normal.

9. **When** a discovered repo's `manifest.yaml` is malformed **then** the skill skips it with a warning: "Skipping '<dir>': manifest.yaml is malformed." Other repos are still offered for registration.

### Postconditions

- `adev-workspace.yaml` exists at the workspace root
- Workspace `.context-index/` directory exists
- Registered repos have correct `slug` and `path` entries
- No workspace-level CLAUDE.md or constitution is created

### Error Cases

| Condition | Expected Behavior |
|-----------|-------------------|
| `--workspace` in existing workspace | Advisory message, no changes |
| No child repos found | Scaffold with empty `repos: []`, suggest manual registration |
| Malformed manifest.yaml in discovered repo | Skip with warning, continue with others |
| `workspace-template.yaml` missing | Skill reports error: "Template missing — reinstall the adev plugin" |

## Acceptance Criteria

- [ ] `/adev:init --workspace` scaffolds `adev-workspace.yaml` from template
- [ ] `/adev:init --workspace` creates workspace `.context-index/` directory
- [ ] No workspace-level CLAUDE.md is created
- [ ] Auto-discovery finds repos with `.context-index/manifest.yaml` in child directories
- [ ] "yes" response registers all discovered repos
- [ ] "select" response allows choosing a subset
- [ ] "skip" response scaffolds with empty repos list
- [ ] Malformed manifest.yaml repos are skipped with warning
- [ ] Existing workspace is detected and not overwritten
- [ ] `/adev:init` without `--workspace` in a workspace repo works as before
- [ ] All quality gates pass
