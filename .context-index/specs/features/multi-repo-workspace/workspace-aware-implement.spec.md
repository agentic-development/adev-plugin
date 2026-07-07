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
tracker-ref: issue-67
source-manifest:
  sha: "9b3c18f"
  files:
    - skills/implement/SKILL.md
    - lib/workspace.mjs
    - tests/skills/implement-workspace-mode.test.mjs
  computed-at: "2026-07-03T22:27:11.449Z"
---

# Live Spec: Workspace-Aware /adev:implement

<!-- Live Spec within the multi-repo-workspace charter.
     This defines the behavioral contract for making /adev:implement workspace-aware:
     detecting workspace mode, resolving cross-repo spec references in context packets,
     surfacing target-repo ownership, and preserving single-repo behaviour.
     Parent Charter: .context-index/specs/features/multi-repo-workspace/charter.md -->

## Behavioral Contract

### Preconditions

- `/adev:implement` SKILL.md exists at `skills/implement/SKILL.md`
- `lib/workspace.mjs` exports `detectWorkspace()`, `resolveWorkspaceContext()`, `resolveRef()`, `validateModuleName()`, and `assertPathInWorkspace()`
- The plan file references a Live Spec with optional `depends-on` cross-repo references (e.g., `@repo-slug/spec-slug`) or `target-repo:` frontmatter
- `adev-workspace.yaml` at workspace root with at least one registered repo (for workspace-mode invocation)

### Behaviors

1. **When** `/adev:implement` is invoked at the workspace root or inside a registered repo within a workspace (`detectWorkspace(cwd)` returns non-null) **then** Step 1 (Load Context) additionally calls `detectWorkspace(cwd)` and stores the workspace state (`root`, `config`, `currentRepoSlug`) for use during context packet assembly. If `detectWorkspace(cwd)` returns `null`, the workspace state is `null` and all subsequent workspace logic is skipped.

2. **When** workspace state is non-null and the plan's referenced Live Spec contains `depends-on` entries matching the cross-repo reference pattern `@<repo-slug>/<spec-slug>` **then** Step 2a (Context Packet Assembly) resolves each cross-repo reference via `resolveRef(workspaceRoot, config, ref)`. For each reference that resolves to a file path, the spec's content is read and appended to the context packet under a `## Cross-Repo Reference Context` section, prefixed with the reference string (e.g., `### @data-platform/shared-types`). Content is read-only and clearly labelled as reference material from a sibling repo.

3. **When** workspace state is non-null and a cross-repo reference in `depends-on` fails to resolve (`resolveRef` returns `null`) **then** the skill emits a warning in the context packet:
   ```
   Warning: cross-repo reference '@<repo-slug>/<spec-slug>' could not be resolved.
   The referenced spec may not exist yet or the repo may be missing from the workspace.
   ```
   The warning is non-blocking: context packet assembly continues, and the implementer subagent receives the warning as informational context. The implementation proceeds without the unresolved reference.

4. **When** workspace state is non-null and the plan's referenced Live Spec has a `target-repo:` frontmatter field **then** Step 2c (Compose Subagent Prompt) includes an informational line in the "Scene-setting context" section:
   ```
   Implementation target: repo '<target-repo-slug>' within workspace '<workspace-name>'.
   ```
   This is advisory only; the implementer operates on the current working directory as normal. It does not change file-write targets or cwd.

5. **When** workspace state is non-null and additional plan tasks reference specs from different repos via `depends-on` cross-repo references **then** each task's context packet independently resolves its own cross-repo references. Sibling repo content is assembled fresh per task (not cached across tasks) to ensure the implementer always sees the current state of sibling specs.

6. **When** `/adev:implement` is invoked inside a registered repo (`detectWorkspace(cwd)` returns non-null AND `currentRepoSlug !== null`) **then** the skill prints a one-line advisory to stdout, exactly once per invocation:
   ```
   (Advisory: running repo-scoped inside workspace '<name>'. Cross-repo
   spec references in depends-on will be resolved from sibling repos.)
   ```
   This is consistent with the advisory pattern established by `/adev:plan`. The advisory does not block and does not appear when `detectWorkspace` returns `null`.

7. **When** `/adev:implement` is invoked outside any workspace (`detectWorkspace(cwd)` returns `null`) **then** existing single-repo behaviour is preserved exactly. No workspace detection, no cross-repo reference resolution, no advisory messages. This matches the charter invariant: "Single-repo projects work identically."

8. **When** workspace state is non-null **then** the implementer subagent prompt (Step 2c, section 6 "Scope discipline") includes an additional constraint:
   ```
   Cross-repo isolation: You have received read-only reference context from sibling
   repos. Do NOT create, modify, or delete files outside the current repo. Sibling
   repo content is provided for understanding interfaces and contracts only.
   ```
   This enforces the charter invariant that sibling repo `.context-index/` is read-only and extends it to all sibling repo files.

### Postconditions

- Implementer subagents receive cross-repo spec content as read-only reference when workspace mode is active and cross-repo references exist
- No files are written to sibling repos during implementation
- Workspace-mode context packets include a `## Cross-Repo Reference Context` section when cross-repo references are present
- Single-repo and no-workspace invocations produce identical output to current behaviour
- The advisory message appears exactly once per workspace-mode invocation

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Cross-repo reference `@repo-slug/spec-slug` points to unknown repo slug | Emit warning in context packet; continue without the reference | UNRESOLVED_CROSS_REF |
| Cross-repo reference resolves to a repo whose `.context-index/` is missing | Emit warning: "Repo '<slug>' has no .context-index/ -- reference context unavailable"; continue | DEGRADED_CONTEXT |
| Cross-repo reference resolves to a file path but the file is unreadable | Emit warning with the read error; continue without the reference content | REF_READ_FAILURE |
| Sibling repo path escapes workspace root (via `assertPathInWorkspace`) | Skip the repo with warning: "Rejected path escaping workspace root"; do not read any files from it | PATH_ESCAPE |
| `detectWorkspace` throws due to malformed `adev-workspace.yaml` | Catch and log warning; fall back to single-repo behaviour | WORKSPACE_PARSE_ERROR |
| `target-repo:` value in spec frontmatter references an unknown repo slug | Emit informational warning; implementation proceeds in cwd as normal | UNKNOWN_TARGET_REPO |

## System Constitution Reference

- **Principle:** "Skills are primarily markdown" -- The workspace-mode behaviour is expressed as SKILL.md additions (conditional branches in Step 1, Step 2a, and Step 2c). No new runtime code is required in the skill itself; `detectWorkspace()`, `resolveRef()`, and `resolveWorkspaceContext()` already exist in `lib/workspace.mjs`.
- **Principle:** "Minimize external dependencies" -- Uses only existing `lib/workspace.mjs` exports. No new dependencies.
- **Charter invariant:** "Sibling repo `.context-index/` is read-only -- skills never write to another repo's context" -- Behavior 8 explicitly injects a cross-repo isolation constraint into the implementer subagent prompt. No write operations target sibling repos.
- **Charter invariant:** "Single-repo projects work identically" -- Behaviors 7 explicitly preserves single-repo behaviour when `detectWorkspace` returns `null`.
- **Charter quality attribute:** "Isolation: A broken or missing sibling repo degrades gracefully (warning, not error)" -- Error cases DEGRADED_CONTEXT and REF_READ_FAILURE emit warnings and continue.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| 1. Add workspace detection to Step 1 (Load Context) | After existing context loading, call `detectWorkspace(cwd)` and store workspace state. Add advisory message for repo-mode-inside-workspace. | small |
| 2. Add cross-repo reference resolution to Step 2a (Context Packet Assembly) | Parse the Live Spec's `depends-on` frontmatter for `@repo-slug/spec-slug` entries. Resolve via `resolveRef()`. Read content and append to context packet under `## Cross-Repo Reference Context`. Handle resolution failures with warnings. | medium |
| 3. Add target-repo informational line to Step 2c (Compose Subagent Prompt) | When `target-repo:` is present in the spec frontmatter, inject an advisory line into the scene-setting context section of the subagent prompt. | small |
| 4. Add cross-repo isolation constraint to Step 2c (Compose Subagent Prompt) | When workspace state is non-null, append the cross-repo isolation rule to the scope discipline section of the subagent prompt. | small |
| 5. Add graceful degradation for workspace errors | Wrap `detectWorkspace` call in try/catch to handle malformed YAML. Add `assertPathInWorkspace` check before reading sibling repo content. Handle unreadable files. | medium |
| 6. Write SKILL.md content assertions | Test that SKILL.md contains workspace detection, cross-repo reference resolution, target-repo advisory, isolation constraint, and repo-mode advisory text. | medium |

## Acceptance Criteria

- [ ] AC1: `/adev:implement` SKILL.md contains workspace-mode detection via `detectWorkspace(cwd)` in Step 1, storing workspace state for downstream steps
- [ ] AC2: Step 2a resolves `@repo-slug/spec-slug` entries from the spec's `depends-on` frontmatter via `resolveRef()` and includes their content in the context packet
- [ ] AC3: Cross-repo reference content appears under a `## Cross-Repo Reference Context` section in the context packet, with each reference labelled by its `@repo-slug/spec-slug` string
- [ ] AC4: Unresolvable cross-repo references produce a warning in the context packet but do not block implementation
- [ ] AC5: `target-repo:` frontmatter in the spec produces an informational advisory in the subagent prompt's scene-setting section
- [ ] AC6: Implementer subagent prompt includes a cross-repo isolation constraint when workspace mode is active, prohibiting writes to sibling repos
- [ ] AC7: Repo-mode-inside-workspace advisory is printed exactly once per invocation, consistent with `/adev:plan` advisory pattern
- [ ] AC8: Single-repo invocation (`detectWorkspace` returns `null`) preserves existing behaviour with no workspace-related output
- [ ] AC9: Missing or unreadable sibling repo `.context-index/` degrades gracefully with a warning, not an error
- [ ] AC10: Sibling repo paths are validated via `assertPathInWorkspace()` before reading; PATH_ESCAPE paths are skipped with a warning
- [ ] AC11: Malformed `adev-workspace.yaml` is caught and falls back to single-repo behaviour with a logged warning
- [ ] AC12: All quality gates pass (`npm test`)
