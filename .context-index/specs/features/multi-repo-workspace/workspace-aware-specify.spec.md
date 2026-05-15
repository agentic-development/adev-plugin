---
charter: multi-repo-workspace
status: validated
risk_level: medium
milestone: phase-2
revision: 1
charter-revision: 4
created: 2026-04-17
updated: 2026-04-17
depends-on:
  - "workspace-foundation"
  - "workspace-charters"
  - "context-resolution"
tracker-ref: issue-66
source-manifest:
  sha: "9eb9e2d"
  files:
    - skills/specify/SKILL.md
    - tests/skills/specify-workspace-mode.test.mjs
  computed-at: "2026-04-17T00:00:00.000Z"
drift_detected: true
drift_source: skills/specify/SKILL.md
drift_at: 2026-05-15T15:33:56.896Z
---

# Live Spec: Workspace-Aware /adev:specify

<!-- Live Spec within the multi-repo-workspace charter.
     This defines the behavioral contract for making /adev:specify workspace-aware:
     detecting workspace mode, prompting for target-repo: frontmatter, validating
     repo slugs against the workspace registry, and preserving single-repo behaviour.
     Parent Charter: .context-index/specs/features/multi-repo-workspace/charter.md -->

## Behavioral Contract

### Preconditions

- `/adev:specify` SKILL.md exists at `skills/specify/SKILL.md`
- `lib/workspace.mjs` exports `detectWorkspace()`, `resolveWorkspaceContext()`, `validateModuleName()`, and `assertPathInWorkspace()`
- At least one workspace-level charter exists in workspace `.context-index/specs/features/*/charter.md` (for workspace-mode invocation)
- `adev-workspace.yaml` at workspace root with at least one registered repo

### Behaviors

1. **When** `/adev:specify` is invoked at the workspace root (`detectWorkspace(cwd)` returns non-null AND `currentRepoSlug === null`) **then** the skill enters workspace mode: it resolves charters from the workspace `.context-index/specs/features/` directory, writes specs to the workspace `.context-index/`, and prompts the user for `target-repo:` frontmatter before writing.

2. **When** workspace mode is active and the user selects a capability **then** the skill asks:
   ```
   This is a workspace-level spec. Which repo owns the implementation?
   Registered repos: <list of repo slugs from adev-workspace.yaml>
   → target-repo: (slug or "workspace" if no single repo owns it)
   ```
   The user's response is validated against the workspace repo registry. The value `"workspace"` is also accepted (for specs that span repos without a single owner).

3. **When** the user provides a `target-repo:` value that matches a registered repo slug **then** the spec is written with `target-repo: <slug>` in its YAML frontmatter, and the slug is validated with `validateModuleName()` to ensure it matches `[a-zA-Z0-9_-]+`.

4. **When** the user provides `target-repo: workspace` **then** the spec is written with `target-repo: workspace` in its frontmatter. No repo-slug validation is performed (the literal string `"workspace"` is a reserved token).

5. **When** the user provides a `target-repo:` value that does not match any registered repo slug and is not `"workspace"` **then** the skill rejects the input with:
   ```
   Unknown repo slug '<input>'. Available repos: <comma-separated slug list>.
   → target-repo: (try again)
   ```
   The skill re-prompts until a valid value is given.

6. **When** `/adev:specify` is invoked inside a registered repo (`detectWorkspace(cwd)` returns non-null AND `currentRepoSlug !== null`) **then** existing single-repo behaviour is preserved exactly. No `target-repo:` prompt appears. The spec is written to the repo's own `.context-index/`. This matches the charter invariant: "Single-repo projects work identically."

7. **When** `/adev:specify` is invoked outside any workspace (`detectWorkspace(cwd)` returns `null`) **then** existing single-repo behaviour is preserved exactly. No workspace-related prompts or frontmatter appear.

8. **When** workspace mode is active **then** the skill reads sibling repo `.context-index/` directories via `resolveWorkspaceContext()` as read-only reference context (for duplicate detection across repos and cross-repo `depends-on` suggestions), but never writes to any registered repo's `.context-index/`.

### Postconditions

- Workspace-mode specs include `target-repo:` in YAML frontmatter
- Workspace-mode specs are saved to workspace `.context-index/specs/features/<module>/`
- Repo-mode and single-repo specs are unchanged (no `target-repo:` field)
- The isolation invariant holds: no writes to registered repo `.context-index/`

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| User provides unknown repo slug for `target-repo:` | Re-prompt with available slugs | INVALID_TARGET_REPO |
| `target-repo:` value contains characters outside `[a-zA-Z0-9_-]` (and is not `"workspace"`) | Reject with: "Invalid repo slug: must match [a-zA-Z0-9_-]+" | INVALID_MODULE_NAME |
| Workspace `.context-index/` does not exist at workspace root | Suggest: "No workspace context directory found. Run `/adev:init --workspace` to set up workspace-level context." | NO_WORKSPACE_CONTEXT |
| Workspace has no charters in `.context-index/specs/features/` | Fall through to standard "no charters found" prerequisite error | PREREQ_FAIL |
| Sibling repo `.context-index/` is missing or unreadable | Skip silently for reference context; warn if the `target-repo:` slug points to a repo without `.context-index/` | DEGRADED_CONTEXT |

## System Constitution Reference

- **Principle:** "Skills are primarily markdown" — The workspace-mode behaviour is expressed as SKILL.md additions (conditional branches). No new runtime code is required in the skill itself; `detectWorkspace()` and `validateModuleName()` already exist in `lib/workspace.mjs`.
- **Principle:** "Minimize external dependencies" — Uses only existing `lib/workspace.mjs` exports. No new dependencies.
- **Charter invariant:** "Sibling repo `.context-index/` is read-only — skills never write to another repo's context" — Workspace-mode specify reads sibling repos for reference but writes only to workspace `.context-index/`.
- **Charter invariant:** "Single-repo projects work identically" — Behaviors 6 and 7 explicitly preserve single-repo behaviour.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| 1. Add workspace-mode detection to SKILL.md | Add a section after "Shared: Resolve Charter" that checks `detectWorkspace(cwd)` and branches to workspace mode when `currentRepoSlug === null` | medium |
| 2. Add `target-repo:` prompt to workspace-mode flow | After capability selection in workspace mode, prompt for `target-repo:` with validation against repo registry | medium |
| 3. Add `target-repo:` to frontmatter template | Update the frontmatter generation in Step 5 to include `target-repo:` when in workspace mode | small |
| 4. Add workspace reference context loading | In workspace mode, use `resolveWorkspaceContext()` to load sibling repo specs as read-only reference for duplicate detection | small |
| 5. Add isolation guard | Ensure workspace-mode code path writes only to workspace `.context-index/`, never to registered repo paths | small |
| 6. Write SKILL.md content assertions | Test that SKILL.md contains workspace-mode detection, target-repo prompt, validation, and isolation guard text | medium |

## Acceptance Criteria

- [ ] AC1: `/adev:specify` SKILL.md contains workspace-mode detection via `detectWorkspace(cwd)` with branching on `currentRepoSlug === null`
- [ ] AC2: Workspace-mode flow prompts for `target-repo:` and lists available repo slugs
- [ ] AC3: `target-repo:` value is validated against workspace repo registry; unknown slugs are rejected with re-prompt
- [ ] AC4: `target-repo: workspace` is accepted as a reserved token without slug validation
- [ ] AC5: Workspace-mode specs are written to workspace `.context-index/specs/features/<module>/`
- [ ] AC6: Workspace-mode specs include `target-repo:` in YAML frontmatter
- [ ] AC7: Repo-mode invocation (inside registered repo) preserves existing behaviour — no `target-repo:` prompt
- [ ] AC8: Single-repo invocation (no workspace) preserves existing behaviour — no workspace-related changes
- [ ] AC9: Sibling repo `.context-index/` is read as reference context but never written to
- [ ] AC10: All quality gates pass (`npm test`)
- [ ] AC11: No constitutional violations introduced
