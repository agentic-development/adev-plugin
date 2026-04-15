---
charter: multi-repo-workspace
status: draft
risk_level: low
revision: 1
charter-revision: 2
created: 2026-04-15
updated: 2026-04-15
---

# Live Spec: Init Workspace

## Behavioral Contract

### Preconditions

- `lib/workspace.mjs` exists with `detectWorkspace`
- `templates/workspace-template.yaml` exists
- `/adev:init` SKILL.md exists and handles single-repo initialization

### Behaviors

1. **When** `/adev:init --workspace` is invoked in a directory without `adev-workspace.yaml` **then** the skill scaffolds: `adev-workspace.yaml` from template, `.context-index/` directory with a minimal `constitution.md` placeholder, and a `CLAUDE.md` stub.

2. **When** `/adev:init --workspace` is invoked and child directories contain `.context-index/manifest.yaml` files **then** the skill auto-discovers them and offers to register them as repos: "Found N repos with adev context: <list>. Register them? (yes / select / skip)".

3. **When** the user confirms repo registration **then** the skill populates `adev-workspace.yaml` with repo entries using the directory name as `slug` and relative path as `path`.

4. **When** `/adev:init --workspace` is invoked in a directory that already has `adev-workspace.yaml` **then** the skill reports: "Workspace already initialized. Use `/adev:init` in a repo directory to initialize individual repos."

5. **When** `/adev:init` (without `--workspace`) is invoked inside a workspace repo **then** existing behavior is preserved — it initializes that repo's `.context-index/` as normal.

### Postconditions

- `adev-workspace.yaml` exists at the workspace root
- Workspace `.context-index/` directory exists
- Registered repos have correct `slug` and `path` entries

### Error Cases

| Condition | Expected Behavior |
|-----------|-------------------|
| `--workspace` in existing workspace | Advisory message, no changes |
| No child repos found | Scaffold workspace with empty `repos: []`, suggest manual registration |

## Acceptance Criteria

- [ ] `/adev:init --workspace` scaffolds `adev-workspace.yaml` from template
- [ ] `/adev:init --workspace` creates workspace `.context-index/` directory
- [ ] Auto-discovery finds repos with `.context-index/manifest.yaml` in child directories
- [ ] Existing workspace is detected and not overwritten
- [ ] `/adev:init` without `--workspace` in a workspace repo works as before
- [ ] All quality gates pass
