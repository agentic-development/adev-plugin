---
charter: multi-repo-workspace
status: review-passed
risk_level: medium
revision: 1
charter-revision: 2
created: 2026-04-15
updated: 2026-04-15
depends-on: ["workspace-foundation", "context-resolution"]
---

# Live Spec: Cross-Repo References

## Behavioral Contract

### Preconditions

- `lib/workspace.mjs` exports `detectWorkspace`, `resolveWorkspaceContext`, and `resolveRef`
- A workspace is detected with registered repos

### Behaviors

#### Reference Format and Resolution

1. **When** a Live Spec frontmatter contains `depends-on: ["@repo-slug/spec-slug"]` **then** `resolveRef(workspaceRoot, "@repo-slug/spec-slug")` resolves it to the absolute path of the spec file in the sibling repo's `.context-index/specs/features/`.

2. **When** `resolveRef` receives a reference matching `@<slug>/<spec>` **then** it looks up `<slug>` in the workspace repo registry, resolves the repo path, and searches for `<spec>.md` under that repo's `.context-index/specs/features/` (recursive search).

3. **When** `resolveRef` receives a reference not matching the `@<slug>/` pattern **then** it returns `null` (not a cross-repo reference — may be a local reference).

4. **When** the referenced repo slug does not exist in the workspace **then** `resolveRef` returns `null`.

5. **When** the referenced spec file is not found in the sibling repo **then** `resolveRef` returns `null`.

#### Reference Validation in Review

6. **When** `/adev:review-specs` encounters a spec with `depends-on` containing cross-repo references **then** it resolves each reference using `resolveRef`. If any returns `null`, it flags: "Cross-repo reference '@repo/spec' could not be resolved — repo or spec not found."

7. **When** a cross-repo reference resolves to a spec with `status: review-passed` **then** the reviewer emits a warning: "Cross-repo dependency '@repo/spec' is in draft status — may not be ready."

8. **When** a cross-repo reference resolves to a spec with `status: superseded` **then** the reviewer emits a warning: "Cross-repo dependency '@repo/spec' is superseded — check for replacement."

9. **When** `/adev:review-specs` runs outside a workspace (no `adev-workspace.yaml` found) **then** cross-repo references in `depends-on` are ignored with a note: "Cross-repo references found but no workspace detected — skipping validation."

### Postconditions

- `resolveRef` is exported from `lib/workspace.mjs`
- `/adev:review-specs` SKILL.md includes cross-repo reference validation instructions
- References that cannot be resolved produce warnings, not errors (validated references, not enforced dependencies)

### Error Cases

| Condition | Expected Behavior |
|-----------|-------------------|
| Reference to unknown repo | `resolveRef` returns `null`, review flags warning |
| Reference to missing spec | `resolveRef` returns `null`, review flags warning |
| Referenced spec is draft | Review flags warning |
| Referenced spec is superseded | Review flags warning |
| No workspace detected | Cross-repo refs ignored with note |

## Acceptance Criteria

- [ ] `resolveRef` parses `@repo-slug/spec-slug` format correctly
- [ ] `resolveRef` returns absolute path when repo and spec exist
- [ ] `resolveRef` returns `null` for non-cross-repo references
- [ ] `resolveRef` returns `null` for unknown repo slugs
- [ ] `resolveRef` returns `null` for missing spec files
- [ ] `/adev:review-specs` validates cross-repo references when workspace detected
- [ ] Draft-status cross-repo dependencies produce warnings
- [ ] Superseded cross-repo dependencies produce warnings
- [ ] Cross-repo refs are ignored gracefully outside workspace mode
- [ ] All quality gates pass
