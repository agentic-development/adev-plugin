---
charter: multi-repo-workspace
status: review-passed
risk_level: medium
revision: 1
charter-revision: 2
created: 2026-04-15
updated: 2026-04-15
---

# Live Spec: Workspace Foundation

## Behavioral Contract

### Preconditions

- The adev plugin is installed and functional in single-repo mode
- `lib/workspace.mjs` does not yet exist
- No `adev-workspace.yaml` template exists

### Behaviors

#### Workspace Detection

1. **When** `detectWorkspace(startPath)` is called **then** it walks up from `startPath` checking each directory for `adev-workspace.yaml`. It stops at the filesystem root. If found, it returns `{ root, config, currentRepoSlug }`. If not found, it returns `null`.

2. **When** `detectWorkspace` finds `adev-workspace.yaml` **then** it parses the YAML content and validates the required structure: `workspace.name` (string), `repos` (array of objects with `slug` and `path`).

3. **When** `detectWorkspace` finds the workspace and `startPath` is inside a registered repo's `path` **then** `currentRepoSlug` is set to that repo's `slug`. If `startPath` is not inside any registered repo (e.g., at the workspace root), `currentRepoSlug` is `null`.

4. **When** `adev-workspace.yaml` exists but is malformed YAML **then** `detectWorkspace` throws with message: "Failed to parse adev-workspace.yaml: <parse error>".

5. **When** `adev-workspace.yaml` exists but is missing required fields (`workspace.name` or `repos`) **then** `detectWorkspace` throws with message: "Invalid adev-workspace.yaml: missing required field '<field>'".

#### Workspace Schema

6. **When** `adev-workspace.yaml` is parsed **then** each repo entry must have `slug` (string, unique) and `path` (string, relative to workspace root). Optional fields: `role` (string).

7. **When** duplicate repo slugs exist **then** `detectWorkspace` throws: "Duplicate repo slug '<slug>' in adev-workspace.yaml".

8. **When** `dependencies` is present **then** each entry must have `from` (string), `to` (string), and `type` (string). Both `from` and `to` must reference valid repo slugs.

9. **When** a dependency references an unknown repo slug **then** `detectWorkspace` throws: "Dependency references unknown repo '<slug>'".

10. **When** `dependencies` is absent or empty **then** the workspace has no inter-repo dependencies. This is valid.

#### Repo Path Resolution

11. **When** a repo's `path` is relative **then** it is resolved relative to the workspace root (the directory containing `adev-workspace.yaml`).

12. **When** a repo's resolved path does not exist on disk **then** `detectWorkspace` emits a warning in the returned config (`warnings` array): "Repo '<slug>' path '<path>' does not exist" but does not throw. The repo is included in the config with a `missing: true` flag.

#### Template

13. **When** the `workspace-template.yaml` is generated **then** it includes commented examples showing the full schema: `workspace.name`, `repos` with `slug`, `path`, `role`, and `dependencies` with `from`, `to`, `type`.

### Postconditions

- `lib/workspace.mjs` exports `detectWorkspace(startPath)` as a pure ESM function
- `templates/workspace-template.yaml` exists with commented examples
- Single-repo projects are unaffected — `detectWorkspace` returns `null`

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `adev-workspace.yaml` not found | Return `null` | — |
| Malformed YAML | Throw with parse error | PARSE_ERROR |
| Missing `workspace.name` | Throw with field name | SCHEMA_ERROR |
| Missing `repos` | Throw with field name | SCHEMA_ERROR |
| Repo missing `slug` | Throw with details | SCHEMA_ERROR |
| Repo missing `path` | Throw with details | SCHEMA_ERROR |
| Duplicate slug | Throw with slug name | DUPLICATE_SLUG |
| Dependency references unknown slug | Throw with slug name | UNKNOWN_REF |
| Repo path does not exist | Warning, not error | — |

## Acceptance Criteria

- [ ] `detectWorkspace` walks up from `startPath` and returns config when `adev-workspace.yaml` found
- [ ] `detectWorkspace` returns `null` when no `adev-workspace.yaml` exists
- [ ] `currentRepoSlug` is correctly resolved when `startPath` is inside a registered repo
- [ ] `currentRepoSlug` is `null` when at workspace root or outside registered repos
- [ ] Malformed YAML throws with parse error details
- [ ] Missing required fields throw with field name
- [ ] Duplicate repo slugs throw
- [ ] Invalid dependency references throw
- [ ] Missing repo paths produce warnings, not errors
- [ ] Relative repo paths resolve correctly against workspace root
- [ ] `templates/workspace-template.yaml` includes full schema with commented examples
- [ ] All quality gates pass
- [ ] No constitutional violations (Principle 1: no new deps, Principle 3: pure ESM)
