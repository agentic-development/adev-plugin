---
charter: multi-repo-workspace
status: validated
risk_level: medium
milestone:
revision: 1
charter-revision: 4
created: 2026-04-17
updated: 2026-04-17
depends-on:
  - "workspace-foundation"
  - "workspace-charters"
  - "context-resolution"
  - "workspace-aware-specify"
tracker-ref: issue-68
source-manifest:
  sha: "b079392"
  files:
    - skills/plan/SKILL.md
    - lib/workspace.mjs
    - tests/skills/plan-workspace-spec-mode.test.mjs
  computed-at: "2025-04-25T00:00:00.000Z"
drift_detected: true
---

# Live Spec: Workspace-Aware /adev:plan (Spec Mode)

<!-- Live Spec within the multi-repo-workspace charter.
     This defines the behavioral contract for making /adev:plan Spec Mode
     workspace-aware: detecting target-repo: frontmatter on workspace-level
     specs, resolving target repo context, generating repo-relative file paths,
     and resolving cross-repo depends-on references.
     Parent Charter: .context-index/specs/features/multi-repo-workspace/charter.md -->

## Behavioral Contract

### Preconditions

- `/adev:plan` SKILL.md exists at `skills/plan/SKILL.md` with Spec Mode (Steps 1-7)
- `lib/workspace.mjs` exports `detectWorkspace()`, `resolveWorkspaceContext()`, `resolveRef()`, `validateModuleName()`, and `assertPathInWorkspace()`
- The sibling spec `workspace-aware-specify.md` (issue-66) has been implemented, meaning workspace-level specs carry `target-repo:` in their YAML frontmatter
- `adev-workspace.yaml` at workspace root with at least one registered repo
- The existing Repo-Mode-Inside-Workspace Advisory and Phase Planning Mode workspace branching remain unchanged

### Behaviors

1. **When** `/adev:plan --spec <path>` is invoked on a workspace-level spec that contains `target-repo: <slug>` in its YAML frontmatter (where `<slug>` matches a registered repo in `adev-workspace.yaml`) **then** the skill enters workspace-aware Spec Mode: it resolves the target repo path via the workspace repo registry and generates all implementation file paths in Step 5 (File Structure, Task Structure) relative to the target repo root, not the workspace root.

2. **When** workspace-aware Spec Mode is active and `target-repo:` is a valid repo slug **then** Step 2 (Load Context) additionally loads the target repo's constitution (`.context-index/constitution.md`), platform context (`.context-index/platform-context.yaml`), and orientation (`.context-index/orientation/architecture.md`) from the target repo's `.context-index/` directory. These are included in the context packets alongside the workspace-level spec and charter. If the target repo has no `.context-index/`, the skill warns: `"Target repo '<slug>' has no .context-index/ — planning with workspace context only."` and proceeds with workspace-level context.

3. **When** workspace-aware Spec Mode is active and `target-repo: workspace` **then** the plan targets the workspace `.context-index/` itself. File paths in the plan are relative to the workspace root. No target-repo constitution is loaded (the workspace has no constitution per the charter's Simplicity quality attribute). The plan covers context-layer work (specs, governance, templates) rather than application code.

4. **When** the spec's `depends-on` frontmatter contains cross-repo references in `@repo-slug/spec-slug` format **then** the skill resolves each reference using `resolveRef(workspaceRoot, config, ref)` from `lib/workspace.mjs`. Resolved specs are included as read-only reference context in the Context Packets section. Unresolvable references produce a warning: `"Cross-repo dependency '@repo-slug/spec-slug' could not be resolved — referenced repo or spec not found."` The warning does not block planning.

5. **When** the spec has `target-repo:` frontmatter **then** the plan file is saved adjacent to the spec in the workspace `.context-index/` (e.g., `<workspace-root>/.context-index/specs/features/<module>/<spec>.plan.md`), consistent with the existing plan location convention. The plan is NOT written to the target repo's `.context-index/`.

6. **When** `/adev:plan --spec <path>` is invoked on a spec that does NOT contain `target-repo:` frontmatter **then** existing single-repo Spec Mode behaviour is preserved exactly, regardless of whether a workspace is detected. This covers both repo-mode-inside-workspace and non-workspace invocations.

7. **When** workspace-aware Spec Mode generates commit messages and branch names in Task Structure (Step 5) **then** these reference the target repo's conventions. The commit scope uses the target repo's module name (e.g., `feat(api/auth): ...` for target-repo `api`), and the branch prefix includes the target repo slug for disambiguation (e.g., `feat/api/auth-session`).

8. **When** the existing Repo-Mode-Inside-Workspace Advisory fires (inside a registered repo, `currentRepoSlug` set) **then** it remains unchanged. If a user runs `/adev:plan --spec` on a workspace-level spec from within a registered repo directory, the advisory prints but the spec's `target-repo:` frontmatter still governs file path generation. The advisory and workspace-aware Spec Mode are orthogonal.

### Postconditions

- Workspace-level specs with `target-repo:` produce plans with file paths relative to the target repo
- Target repo context (constitution, platform, orientation) is loaded into context packets when available
- Cross-repo `depends-on` references are resolved and included as reference context
- Plan files are saved in workspace `.context-index/`, adjacent to the spec
- Single-repo behaviour is unchanged when no `target-repo:` frontmatter exists
- The isolation invariant holds: no writes to any registered repo's `.context-index/`

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `target-repo:` value does not match any registered repo slug and is not `"workspace"` | Block with: "Unknown target-repo '<slug>'. Registered repos: <comma-separated list>. Fix the spec's target-repo: frontmatter." | INVALID_TARGET_REPO |
| `target-repo:` value fails `validateModuleName()` (characters outside `[a-zA-Z0-9_-]`) | Block with: "Invalid target-repo slug: must match [a-zA-Z0-9_-]+" | INVALID_MODULE_NAME |
| Target repo path does not exist on disk | Warn: "Target repo '<slug>' path '<path>' does not exist on disk. Cannot resolve repo-relative file paths." Block planning. | TARGET_REPO_MISSING |
| Target repo `.context-index/` is missing | Warn: "Target repo '<slug>' has no .context-index/ — planning with workspace context only." Proceed with degraded context. | DEGRADED_CONTEXT |
| Cross-repo `depends-on` reference cannot be resolved | Warn: "Cross-repo dependency '@repo-slug/spec-slug' could not be resolved." Proceed without that reference context. | UNRESOLVED_XREF |
| Spec has `target-repo:` but no workspace detected (`detectWorkspace` returns null) | Ignore `target-repo:` and use standard single-repo flow. Warn: "Spec has target-repo: frontmatter but no workspace detected — ignoring." | NO_WORKSPACE |

## System Constitution Reference

- **Principle:** "Skills are primarily markdown" -- The workspace-aware Spec Mode behaviour is expressed entirely as SKILL.md additions (conditional branches in Spec Mode Steps 1-5). No new runtime code is required in the skill itself; `detectWorkspace()`, `resolveWorkspaceContext()`, `resolveRef()`, and `validateModuleName()` already exist in `lib/workspace.mjs`.
- **Principle:** "Minimize external dependencies" -- Uses only existing `lib/workspace.mjs` exports. No new dependencies.
- **Charter invariant:** "Sibling repo `.context-index/` is read-only -- skills never write to another repo's context" -- Plans are written to workspace `.context-index/` only. Target repo context is read for context packets but never modified.
- **Charter invariant:** "Single-repo projects work identically" -- Behaviors 6 and 8 explicitly preserve single-repo behaviour. The `target-repo:` frontmatter is opt-in via workspace-aware `/adev:specify`.
- **Charter quality attribute:** "Simplicity" -- No workspace-level constitution or manifest is assumed. When `target-repo: workspace`, no constitution is loaded.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| 1. Add `target-repo:` detection to Spec Mode in SKILL.md | After Step 1 (Review Gate) and before Step 2 (Load Context), add a check: parse the spec's YAML frontmatter for `target-repo:`. If present and workspace is detected, enter workspace-aware Spec Mode. | medium |
| 2. Add target-repo context loading to Step 2 | In workspace-aware Spec Mode, resolve the target repo path and load its constitution, platform-context, and orientation into the essential context set. Handle missing `.context-index/` gracefully. | medium |
| 3. Add cross-repo `depends-on` resolution | After loading spec frontmatter, iterate `depends-on` entries matching `@repo-slug/spec-slug` pattern. Resolve each via `resolveRef()`. Include resolved specs in Context Packets. Warn on unresolvable refs. | medium |
| 4. Update Step 5 File Structure for repo-relative paths | When `target-repo:` is a repo slug, prefix all file paths in the File Structure and Task Structure sections with the target repo's path relative to workspace root. When `target-repo: workspace`, paths stay workspace-relative. | medium |
| 5. Update commit/branch conventions for target repo | Adjust commit scope and branch prefix templates to include target repo slug for disambiguation. | small |
| 6. Add error handling for invalid `target-repo:` values | Validate `target-repo:` against workspace repo registry and `validateModuleName()`. Handle missing repo path on disk. | small |
| 7. Add `target-repo: workspace` handling | Ensure the special value `"workspace"` skips repo context loading and generates workspace-relative paths. | small |
| 8. Write SKILL.md content assertions | Test that SKILL.md contains workspace-aware Spec Mode detection, target-repo context loading, cross-repo resolution, repo-relative path generation, and error handling text. | medium |

## Acceptance Criteria

- [ ] AC1: `/adev:plan` SKILL.md Spec Mode contains a `target-repo:` frontmatter detection step that reads the spec's YAML frontmatter before Step 2 (Load Context)
- [ ] AC2: When `target-repo:` matches a registered repo slug, the plan's File Structure and Task Structure sections generate file paths relative to the target repo root
- [ ] AC3: When `target-repo: workspace`, file paths in the plan are relative to the workspace root and no repo-level constitution is loaded
- [ ] AC4: Step 2 (Load Context) loads the target repo's constitution, platform-context, and orientation when `target-repo:` is a valid repo slug with a `.context-index/`
- [ ] AC5: When the target repo has no `.context-index/`, a degraded-context warning is emitted and planning proceeds with workspace context only
- [ ] AC6: Cross-repo `depends-on` references (`@repo-slug/spec-slug`) are resolved via `resolveRef()` and included in the plan's Context Packets section
- [ ] AC7: Unresolvable cross-repo `depends-on` references produce a warning but do not block planning
- [ ] AC8: Plan files are saved adjacent to the spec in workspace `.context-index/`, never in the target repo's `.context-index/`
- [ ] AC9: Invalid `target-repo:` values (unknown slug, invalid characters) produce clear error messages and block planning
- [ ] AC10: Specs without `target-repo:` frontmatter use unchanged single-repo Spec Mode behaviour
- [ ] AC11: The Repo-Mode-Inside-Workspace Advisory continues to function independently of workspace-aware Spec Mode
- [ ] AC12: All quality gates pass (`npm test`)
