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
  - "context-resolution"
  - "workspace-aware-plan"
  - "workspace-aware-implement"
tracker-ref: issue-69
source-manifest:
  sha: "c532710"
  files:
    - skills/build/SKILL.md
    - lib/workspace.mjs
    - tests/skills/build-workspace-mode.test.mjs
  computed-at: "2025-04-25T00:00:00.000Z"
drift_detected: true
drift_source: skills/build/SKILL.md
drift_at: 2026-05-14T21:29:18.364Z
---

# Live Spec: Workspace-Aware Build

<!-- Phase 2 capability of the multi-repo-workspace charter.
     Maps to Deferred Capability: Cross-Repo Implementation Orchestration.

     The /adev:build skill is an end-to-end orchestrator that chains
     review -> plan -> route -> implement -> validate. When invoked
     with --phase at a workspace root, it should use the workspace
     dependency graph to sequence builds across repos (upstream first). -->

## Behavioral Contract

### Preconditions

- `lib/workspace.mjs` exports `detectWorkspace` and `resolveWorkspaceContext` (from `workspace-foundation` and `context-resolution`).
- `skills/build/SKILL.md` implements the 5-step build pipeline (review, plan, route, implement, validate), phase mode with spec discovery, and build state persistence.
- `skills/plan/SKILL.md` implements `--phase` mode with workspace dependency ordering (from `dependency-aware-planning`).
- `skills/implement/SKILL.md` implements single-spec implementation.

### Behaviors

#### Mode Detection

1. **When** `/adev:build --phase <name>` is invoked **and** `detectWorkspace(cwd)` returns non-null **and** `currentRepoSlug` is `null` (i.e., invoked at the workspace root, not inside a registered repo) **then** the skill enters **workspace-mode build**. Otherwise it enters the existing single-repo phase mode (unchanged).

2. **When** no workspace is detected (`detectWorkspace(cwd)` returns `null`) **then** behaviour is unchanged from the current single-repo build. Zero new code paths trigger.

3. **When** the skill is invoked inside a registered repo (`detectWorkspace(cwd)` non-null AND `currentRepoSlug` is set) **then** behaviour is repo-scoped (existing single-repo flow). The skill prints the repo-mode-inside-workspace advisory to stdout, exactly once per invocation.

#### Workspace-Mode Build Orchestration

4. **When** workspace-mode build is entered **then** the skill reads the workspace dependency graph via `resolveWorkspaceContext(workspaceRoot, null).dependencyGraph` and sorts registered repos topologically (upstream repos first — repos on the `to` side of dependency edges are built before repos on the `from` side).

5. **When** repos are topologically sorted **then** for each repo in order, the build orchestrator delegates to `/adev:plan --phase <name>` and `/adev:implement` within that repo's context directory. The 5-step pipeline (review, plan, route, implement, validate) executes per-spec within each repo, following the same rules as single-repo phase mode.

6. **When** a circular dependency is detected in the workspace dependency graph **then** the skill emits a warning:
   ```
   Warning: circular dependency detected among workspace repos: <repo-A> -> <repo-B> -> <repo-A>
   Falling back to declaration order. Resolve cycles in workspace config before relying on topological ordering.
   ```
   Then proceeds using the order in which repos are declared in `adev-workspace.yaml`.

7. **When** no workspace dependency graph exists or the graph is empty **then** repos are processed in declaration order (the order they appear in `adev-workspace.yaml`).

#### Cross-Repo Build Sequencing

8. **When** a repo's build fails (any spec within that repo fails at any pipeline step) **then** downstream repos that depend on the failed repo are skipped with reason: `"Upstream repo '<slug>' failed."`. Repos that do not depend on the failed repo continue building.

9. **When** all repos have been processed **then** the workspace-mode build produces a cross-repo summary:
   ```
   Workspace build for phase '<name>' complete.

     <N> repos attempted, <P> passed, <F> failed, <S> skipped

     Repo results:
       - <repo-slug>: PASSED (N specs passed)
       - <repo-slug>: FAILED (N passed, M failed)
       - <repo-slug>: SKIPPED (upstream '<dep-slug>' failed)
   ```

#### Build Progress Reporting

10. **When** the workspace-mode build starts processing a repo **then** it prints a progress header:
    ```
    [<current>/<total>] Building repo: <repo-slug>
    ```

11. **When** the workspace-mode build finishes processing a repo **then** it prints a repo completion line before moving to the next:
    ```
    [<current>/<total>] Repo <repo-slug>: <PASSED|FAILED> (<N> specs)
    ```

#### Dry Run in Workspace Mode

12. **When** `--dry-run` is combined with `--phase` in workspace-mode **then** the skill shows the cross-repo build plan without executing any skill:
    ```
    Dry Run: Workspace Build for phase '<name>'

      Repo order (topological):
        1. <repo-slug> (upstream — no dependencies)
        2. <repo-slug> (depends on: <upstream-slug>)
        ...

      Per-repo spec breakdown:
        <repo-slug>:
          - <spec-path>: <step breakdown>
        ...
    ```

#### Repo-Mode-Inside-Workspace Advisory

13. **When** the skill is invoked inside a registered repo (`detectWorkspace(cwd)` non-null AND `currentRepoSlug` is set) **then** it prints the advisory to stdout, exactly once per invocation:
    ```
    (Advisory: running repo-scoped inside workspace '<name>'. For
    workspace-level building, cd to <workspace-root> and re-run.)
    ```
    The advisory does not block; it does not appear when `detectWorkspace` returns `null`.

#### Single-Repo Preservation

14. **When** the skill is invoked without workspace detection (single-repo) **then** all existing behaviour is preserved identically. No workspace code paths trigger. Build state, resume, dry-run, and phase mode all work as before.

### Acceptance Criteria

1. Workspace-mode build is triggered only when `detectWorkspace` is non-null and `currentRepoSlug` is null and `--phase` is provided.
2. Repos are sorted topologically using the workspace dependency graph (upstream first).
3. Circular dependencies fall back to declaration order with a warning.
4. Each repo's build delegates to `/adev:plan --phase` and `/adev:implement` within that repo's context.
5. Failed upstream repos cause dependent downstream repos to be skipped.
6. Cross-repo summary is printed after all repos are processed.
7. Build progress headers are printed before and after each repo.
8. Dry run in workspace mode shows cross-repo build plan with topological ordering.
9. Repo-mode-inside-workspace advisory is printed to stdout once per invocation.
10. Single-repo behaviour is preserved when no workspace is detected.

## Input Hardening

Paths derived from `adev-workspace.yaml` (repo `path` values) are treated as untrusted input. Before reading any repo's `.context-index/`, the skill applies `assertPathInWorkspace(workspaceRoot, repoPath)` from `lib/workspace.mjs`. On `PATH_ESCAPE`, the repo is skipped with a warning.

## Error Cases

| Condition | Expected Behavior |
|-----------|-------------------|
| `detectWorkspace` returns null | Single-repo phase mode (unchanged) |
| `currentRepoSlug` is set | Repo-scoped mode + advisory |
| Circular dependencies in graph | Warning, fall back to declaration order |
| Upstream repo build fails | Dependent repos skipped with reason |
| Repo path escapes workspace | Repo skipped with warning |
| Empty dependency graph | Repos processed in declaration order |
