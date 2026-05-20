---
charter: multi-repo-workspace
status: validated
risk_level: medium
milestone: phase-2
revision: 3
charter-revision: 4
created: 2026-04-16
updated: 2026-04-16
depends-on:
  - "workspace-foundation"
  - "context-resolution"
  - "workspace-charters"
  - "@design/brainstorm-product-bootstrap"
  - "@planning/multi-scope-plan"
tracker-ref: issue-65
source-manifest:
  sha: "9ffc1ad"
  files:
    - lib/workspace.mjs
    - skills/brainstorm/SKILL.md
    - skills/plan/SKILL.md
    - tests/lib/workspace-hardening.test.mjs
    - tests/skills/brainstorm-workspace-bootstrap.test.mjs
    - tests/skills/plan-workspace-mode.test.mjs
  computed-at: "2026-04-17T09:26:13.441Z"
drift_detected: true
---

# Live Spec: Workspace-Aware Strategic Planning

<!-- Phase 2 capability of the multi-repo-workspace charter.

     REV 3 (2026-04-16): Addresses /adev:review-specs BLOCK verdict on rev 2.
     Changes vs. rev 2:
       - SEC-1 (blocker): Added Input Hardening section with path-containment
         enforcement for adev-workspace.yaml-derived paths.
       - SA-3 / CON-6 (charter conflict): Removed ALL references to workspace
         `manifest.yaml` (the charter Simplicity attribute forbids it). Epic
         sync in workspace mode now unconditionally defers to Phase 2 Shared
         Issue Tracking — no gating on a non-existent artefact.
       - SA-1: Clarified that the qualified `<repo-slug>/<module>` annotation
         in release plans is the resolution anchor (Module Map intentionally
         workspace-only).
       - SA-2: Specified dependency inheritance rule explicitly; pinned access
         path to resolveWorkspaceContext().dependencyGraph.
       - SEC-2: Added glob/file-size caps (200 charter files, 512 KB per file).
       - SEC-3: Identity one-liners are stripped of control characters and
         truncated to 200 chars before display.
       - SEC-4: Module name tokens validated against [a-zA-Z0-9_-]+.
       - SA-4: Identity extraction robust to template drift (falls through to
         constitution body, then "no constitution").
       - SA-5: Committed to adding resolveWorkspaceProductPath helper.
       - SA-6 / CON-3: Advisory emitted to stdout, once per invocation.
       - CON-1: Explicit pluralisation note — workspaces may hold multiple
         feature charters.
       - CON-2: Supersession note on the augmented bootstrap prompt.
       - CON-4: Source annotation is display-only; not persisted to work-item
         frontmatter.
       - CON-5: Isolation-invariant ADR added as follow-up task.

     REV 2 (2026-04-16): Retargeted from the deleted /adev:vision skill to
     /adev:brainstorm Step 5b and /adev:plan --release/--milestone per the
     strategic-planning consolidation (epic-9, commits 72f8f18, c07545c). -->

## Behavioral Contract

### Preconditions

- `lib/workspace.mjs` exports `detectWorkspace` and `resolveWorkspaceContext` (from `workspace-foundation` and `context-resolution`).
- `skills/brainstorm/SKILL.md` implements Step 5b — Product.md Bootstrap (per `@design/brainstorm-product-bootstrap`) and the existing Workspace Root Handling section for charter placement (per `workspace-charters`).
- `skills/plan/SKILL.md` implements Release Mode and Milestone Mode (per `@planning/multi-scope-plan`), each of which reads and writes `product.md`.
- Workspace `.context-index/` may exist at the workspace root (created by `/adev:init --workspace`); it is intentionally minimal — no `constitution.md`, and per the charter's Simplicity quality attribute, **no workspace-level `manifest.yaml` exists**.
- Fields derived from `adev-workspace.yaml` (repo `path`, `workspace.name`) are treated as untrusted input — a workspace may be cloned from an external source. Skills consuming these fields must enforce the path-containment behaviour specified in the Input Hardening section below before reading any derived filesystem path.

### Behaviors

#### Mode Detection (shared across brainstorm Step 5b, plan `--release`, plan `--milestone`)

1. **When** any of the three entry points executes **then** it calls `detectWorkspace(cwd)`. If the result is non-null AND `currentRepoSlug` is `null`, it enters **workspace mode**. Otherwise it enters **repo mode** (existing behaviour).

2. **When** the entry point is invoked inside a registered repo (workspace detected AND `currentRepoSlug` is set) **then** behaviour is identical to single-repo mode — `product.md` reads/writes target the repo's own `.context-index/specs/product.md`; workspace context is not loaded.

3. **When** no workspace is detected (`detectWorkspace` returns `null`) **then** behaviour is unchanged from current single-repo mode. Zero new code paths trigger.

#### Brainstorm Step 5b in Workspace Mode

4. **When** `/adev:brainstorm` writes a workspace-level charter (per `workspace-charters` Behavior 1) **then** Step 5b (per `@design/brainstorm-product-bootstrap`) executes against **workspace paths**: it globs `<workspace-root>/.context-index/specs/features/*/charter.md` (NOT per-repo charters) and reads/writes `<workspace-root>/.context-index/specs/product.md`. A workspace may hold multiple feature charters at `<workspace-root>/.context-index/specs/features/<module>/charter.md`, each treated identically to repo-level charters — "workspace-level charter" is plural by design.

5. **When** Step 5b's First Charter Detection runs in workspace mode **then** the count of workspace-level charters determines bootstrap vs. Module Map append. Per-repo charters under registered repos are NOT counted toward the workspace first-charter threshold — workspace `product.md` and per-repo `product.md` files are independent artefacts.

6. **When** Step 5b bootstraps workspace `product.md` **then** the **project name** used in the title is resolved as follows: prefer `workspace.name` from `adev-workspace.yaml`; if absent, fall back to the workspace root directory basename. There is no requirement for a workspace-level `constitution.md`.

7. **When** Step 5b bootstraps workspace `product.md` AND one or more registered repos have a `.context-index/constitution.md` **then** the Vision sentence prompt is augmented with a one-line identity summary per repo as context shown to the user (not written to `product.md` unless the user's vision sentence references it):
   ```
   This is the first workspace-level charter. The workspace '<name>' currently
   coordinates <N> repos:
     - <slug>: <identity one-liner>
     - ...
   What is the workspace trying to do, in one sentence? (This becomes the
   workspace product vision.)
   ```
   **Identity extraction rule:** For each repo, the identity one-liner is the first sentence of the `## Identity` section of the repo's `constitution.md`. If no `## Identity` section exists, fall back to the first sentence of the constitution body (text after frontmatter and title). If the constitution is absent or empty, use the literal string `no constitution`. Before inclusion in the prompt, the extracted one-liner is stripped of control characters (including ANSI escape sequences — bytes `\x00-\x1F` and `\x7F`, plus CSI sequences) and truncated to 200 UTF-8 characters, appending an ellipsis (`…`) on truncation.

   **Supersession note:** This prompt supersedes the single-question contract from `@design/brainstorm-product-bootstrap` Behavior 3 when in workspace mode. The prompt remains a single question; only its preface changes.

8. **When** the registered repo's constitution is missing or empty **then** the repo's entry in the prompt reads `no constitution` and no error is raised.

9. **When** the registered repo path is missing on disk (`missing: true` flag from `detectWorkspace`) OR rejected by the path-containment check (Behavior 21) **then** the repo is skipped silently in the identity summary; other repos continue to be processed.

10. **When** Step 5b writes workspace `product.md` **then** the Module Map table includes one row per **workspace-level charter only**. Repo-level charters are NOT mixed into the workspace Module Map. (Rationale: Module Map is the charter registry for the context index that owns it. Workspace `product.md` owns workspace charters; each repo's `product.md` owns that repo's charters.)

11. **When** `/adev:brainstorm --no-bootstrap` is invoked at the workspace root **then** Step 5b is skipped entirely, matching single-repo behaviour.

#### Plan `--release` in Workspace Mode

12. **When** `/adev:plan --release <name>` is invoked at the workspace root **then** the skill reads `<workspace-root>/.context-index/specs/product.md` for the named release, NOT any repo's `product.md`.

13. **When** the release mode builds its feature list in workspace mode **then** features are resolved against the combined charter registry: workspace-level charters (`<workspace-root>/.context-index/specs/features/*/charter.md`) AND per-repo charters from each registered repo (loaded read-only via `resolveWorkspaceContext`). Each feature entry in the plan is annotated with its source: `workspace/<module>` or `<repo-slug>/<module>`.

    **Resolution anchor:** Per-repo features are intentionally NOT added to the workspace `product.md` Module Map (see Behavior 10). The qualified `<repo-slug>/<module>` annotation in the release section IS the resolution anchor — readers follow the annotation to the repo's own charter at `<repos[slug].path>/.context-index/specs/features/<module>/charter.md`. The annotation is display-only metadata in the release plan text; it is NOT persisted to work-item frontmatter (which would otherwise conflict with the `target-repo` frontmatter convention from `workspace-charters` Behavior 2).

14. **When** the release plan's dependency graph is built in workspace mode **then** edges are drawn from three sources, read via `resolveWorkspaceContext()` (NOT by re-parsing `adev-workspace.yaml`):
    - Each feature charter's `Dependencies` table (existing behaviour)
    - Each feature's specs' `depends-on` frontmatter (existing behaviour, already cross-repo-aware via `cross-repo-references`)
    - The workspace dependency graph exposed on `resolveWorkspaceContext().dependencyGraph` (parsed from `adev-workspace.yaml.dependencies` per `context-resolution` Behavior 1)

    **Dependency inheritance rule:** A workspace repo-to-repo edge `{ from: A, to: B, type: * }` contributes Feature-level edges from every Feature in repo A to every Feature in repo B. Features retain their explicit spec-level `depends-on` edges; inherited edges are additive, not replacing. Inheritance is **NOT transitive** — each direct workspace edge contributes its edges only; no transitive closure is computed. The `type` field is informational and does not affect ordering (per `dependency-aware-planning` Behavior 1).

15. **When** the release plan's topological sort runs in workspace mode **then** ties are broken by: (a) upstream repo ordering from the workspace dependency graph, (b) declaration order in workspace `product.md`. Cycles (including those produced by the inheritance rule) fall back to declaration order with a warning, identical to single-repo release mode.

16. **When** the release plan is approved in workspace mode **then** epic-board `create()` calls are **skipped unconditionally**. The release plan is persisted to workspace `product.md` only. The skill prints the deferral message:
    ```
    Release plan for '<name>' written to workspace product.md only.
    Workspace-level issue-board sync is deferred to the Shared Issue Tracking
    capability (Phase 2). See multi-repo-workspace charter Deferred Capabilities.
    ```
    (Rationale: the charter's Simplicity quality attribute forbids a workspace-level `manifest.yaml`, and the Deferred Capabilities table lists Shared Issue Tracking as the Phase 2 capability that will introduce a workspace-level issue board.)

#### Plan `--milestone` in Workspace Mode

17. **When** `/adev:plan --milestone <name>` is invoked at the workspace root **then** the skill reads and writes `<workspace-root>/.context-index/specs/product.md`. If the milestone section does not exist, the skill prompts for target date, feature list, and success criteria, and writes the milestone definition to the workspace `product.md`.

18. **When** the user supplies a feature list for a workspace milestone **then** each feature may be named as `<module>` (matches either a workspace charter or a repo charter, ambiguous cases prompt the user to disambiguate) OR fully qualified as `workspace/<module>` or `<repo-slug>/<module>`. The written milestone line records the qualified form.

    **Module name validation:** Module-name tokens (the `<module>` portion) must match `^[a-zA-Z0-9_-]+$`. Invalid tokens are rejected before filesystem lookup with the error: `Invalid module name token: '<input>'. Module names must match [a-zA-Z0-9_-]+.` The same validation applies to `<repo-slug>` tokens (which must match the slug validation already enforced by `workspace-foundation`).

19. **When** in workspace mode **then** the skill never writes to any registered repo's `product.md`. Workspace milestones are workspace-scoped artefacts. Cross-writing to repo `product.md` files is an isolation violation (charter quality attribute).

20. **When** milestone mode finishes writing to workspace `product.md` **then** epic-board `create()` calls are **skipped unconditionally**, matching Behavior 16. The same deferral message is printed (substituting "Milestone" for "Release plan" in the first line).

#### Input Hardening (cross-cutting across Behaviors 4, 7, 9, 13, 14)

21. **When** workspace mode resolves any filesystem path derived from `adev-workspace.yaml` (including registered repo `path` values and fields interpolated into paths such as `workspace.name` when it is used for directory names) **then** the skill computes `resolved = path.resolve(workspaceRoot, <input>)` and verifies that `resolved` equals `workspaceRoot` OR starts with `workspaceRoot + path.sep`. If the check fails, the repo (or derived artefact) is rejected with a warning: `Rejected path escaping workspace root: <input> → <resolved>`. Rejected paths are excluded from context assembly; no file under the rejected path is opened; other repos continue to process normally.

    **Scope clarification:** This behaviour applies to inputs used inside the skills specified here (brainstorm Step 5b, plan --release, plan --milestone). Upstream hardening of `detectWorkspace` / `resolveWorkspaceContext` themselves is tracked as a follow-up in the Task Map.

22. **When** workspace mode globs charter files (across the workspace `.context-index/` AND all registered repos via `resolveWorkspaceContext`) OR reads a per-repo `constitution.md` for identity synthesis **then** it enforces size limits: at most **200 charter files** loaded in total per invocation; at most **512 KB** per file read. Exceeding either limit does not abort; instead:
    - File-count excess: load the first 200 files in declaration order (workspace charters first, then repos in `adev-workspace.yaml` declaration order), warn `Workspace exceeds charter file cap (200); truncated. Set <follow-up> to raise the limit.`, and skip the remainder.
    - File-size excess: skip the oversized file with warning `Skipping '<path>': exceeds 512 KB file cap.`, continue with other files.
    These limits prevent a local denial-of-service from crafted workspace contents.

#### Advisory: Repo-Mode Invocations Inside a Workspace

23. **When** `/adev:brainstorm` or `/adev:plan --release`/`--milestone` is invoked inside a registered repo AND a workspace is detected **then** behaviour is repo-scoped (existing single-repo behaviour) AND the skill prints a one-line advisory on first output, emitted to **stdout** (the same channel as existing skill messages — NOT to stderr, logs, or hook channels):
    ```
    (Advisory: running repo-scoped inside workspace '<name>'. For
    workspace-level planning, cd to <workspace-root> and re-run.)
    ```
    The advisory is printed **exactly once per invocation**, does not block, and does not appear when no workspace is detected.

### Postconditions

- `skills/brainstorm/SKILL.md` Step 5b branches on workspace mode using `detectWorkspace`; globbing and read/write paths are workspace-root-scoped in workspace mode, repo-scoped otherwise.
- `skills/plan/SKILL.md` Release Mode and Milestone Mode branch on workspace mode; `product.md` read/write paths are workspace-root-scoped in workspace mode, repo-scoped otherwise.
- Workspace `.context-index/specs/product.md` is created or updated with synthesised identity, Module Map (workspace charters only), and approved milestones/releases.
- No registered repo's `.context-index/` is written to in workspace mode (read-only invariant preserved).
- Epic-board `create()` is never invoked in workspace mode (deferred to Phase 2 Shared Issue Tracking).
- Path-containment and size-cap enforcement (Behaviors 21-22) apply uniformly across both brainstorm Step 5b and plan release/milestone modes.
- Single-repo invocations behave identically to existing behaviour — `detectWorkspace()` returning `null` yields zero new code paths.
- `lib/workspace.mjs` gains a helper `resolveWorkspaceProductPath(workspaceRoot)` returning `<workspaceRoot>/.context-index/specs/product.md`. This is a non-breaking addition consistent with the charter's `lib/workspace.mjs` ownership (Exposed APIs table). No new external dependencies.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Workspace root with no `.context-index/` | `/adev:brainstorm` and `/adev:plan` at workspace root advise `Run /adev:init --workspace to set up workspace-level context` and exit without action | — |
| `adev-workspace.yaml` malformed | `detectWorkspace` throws (existing behaviour) | PARSE_ERROR |
| Registered repo path missing on disk | Skip silently during per-repo identity synthesis and charter discovery | — |
| Registered repo `path` escapes workspace root (per Behavior 21) | Exclude from context with warning; no file under the escaping path is opened | PATH_ESCAPE |
| Registered repo has no `constitution.md` | Include repo in identity summary prompt with `no constitution` note; no error | — |
| Registered repo constitution contains control characters in Identity | Strip and truncate to 200 chars with ellipsis; no error | — |
| Workspace charter count exceeds 200 files | Load first 200 in declaration order, warn, skip remainder | — |
| Charter file exceeds 512 KB | Skip that file with warning, continue with others | — |
| Ambiguous feature name in milestone input (`<module>` matches both a workspace charter and a repo charter) | Prompt user to disambiguate | — |
| Invalid module name token (fails `[a-zA-Z0-9_-]+`) | Reject with `Invalid module name token: '<input>'`; do not attempt filesystem lookup | INVALID_MODULE_NAME |
| User invokes inside repo, expects workspace mode | Repo-scoped behaviour runs AND advisory is printed once to stdout per Behavior 23 | — |
| Workspace `product.md` exists but Module Map malformed | Skip append with warning (matches `brainstorm-product-bootstrap` Step 5b-4) | — |

## System Constitution Reference

- **Principle 1 (Minimize external dependencies):** Workspace mode reuses `lib/workspace.mjs` (`detectWorkspace`, `resolveWorkspaceContext`, new `resolveWorkspaceProductPath`) and Node.js built-ins (`path`, `fs`) for file IO and path containment. No new external dependencies.
- **Principle 2 (Skills are primarily markdown):** All workspace-mode behaviour lives as additional instructions in `skills/brainstorm/SKILL.md` and `skills/plan/SKILL.md`. Helper additions to `lib/workspace.mjs` remain optional companion code.
- **Charter quality attribute (Backward Compatibility):** Single-repo projects work identically — `detectWorkspace()` returning `null` results in zero new code paths in both skills.
- **Charter quality attribute (Isolation):** Sibling repo `.context-index/` directories are strictly read-only. Path containment (Behavior 21) actively enforces isolation even against a malicious workspace config.
- **Charter quality attribute (Simplicity):** No workspace-level `constitution.md` or `manifest.yaml` is required or referenced. Workspace `.context-index/` remains a coordination layer. Epic-board sync is unconditionally deferred to Phase 2 rather than introducing a workspace `manifest.yaml`.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Brainstorm Step 5b workspace branching | Make Step 5b globbing and read/write paths relative to workspace root when workspace root is detected; leave repo behaviour unchanged | small |
| Bootstrap identity prompt augmentation | When bootstrapping workspace `product.md`, include per-repo identity one-liners (with extraction fallback: `## Identity` → body → `no constitution`) in the Vision prompt | small |
| Identity one-liner sanitisation | Strip control characters (including ANSI CSI sequences) and truncate to 200 UTF-8 characters with ellipsis, per Behavior 7 | small |
| Workspace project-name resolution | Resolve `project name` for workspace `product.md` title from `workspace.name`, falling back to workspace dirname; no constitution required | small |
| Plan Release Mode workspace branching | Make Release Mode `product.md` path, charter scan, source annotation, and topological sort workspace-root-aware | medium |
| Dependency inheritance wiring | Implement the workspace-edge → Feature-edge inheritance rule (Behavior 14) via `resolveWorkspaceContext().dependencyGraph`; NOT transitive | small |
| Plan Milestone Mode workspace branching | Make Milestone Mode `product.md` path and feature-list prompt workspace-root-aware with qualified feature names | small |
| Epic-sync deferral (unconditional) | In both release and milestone modes at workspace root, always skip `create()` calls with the deferral message; do NOT reference workspace `manifest.yaml` | small |
| Module name token validation | Validate `<module>` tokens against `[a-zA-Z0-9_-]+`; reject with `INVALID_MODULE_NAME` before any filesystem lookup | small |
| Ambiguous-feature disambiguation | Detect `<module>` matches across workspace + repos in milestone feature-list input and prompt | small |
| Path-containment enforcement (skill side) | In brainstorm Step 5b and plan release/milestone modes, verify that every path derived from `adev-workspace.yaml` resolves inside the workspace root; reject escaping paths with warning | small |
| Input-size caps | Enforce ≤ 200 charter files loaded per invocation and ≤ 512 KB per file read; truncate and warn gracefully on excess | small |
| Repo-mode-inside-workspace advisory | Print the one-line advisory to stdout exactly once per invocation when brainstorm/plan are invoked inside a registered repo AND a workspace is detected | small |
| `resolveWorkspaceProductPath` helper | Add to `lib/workspace.mjs` — returns `<workspaceRoot>/.context-index/specs/product.md`. Non-breaking addition | small |
| **Follow-up: Isolation invariant ADR** | Draft an ADR documenting the workspace-mode isolation invariant (skills never write to registered repo `.context-index/`) so future plan-mode additions inherit the constraint. Tracked as a separate PR after this spec ships | small (follow-up) |
| **Follow-up: Upstream hardening of `lib/workspace.mjs`** | `detectWorkspace` and `resolveWorkspaceContext` should themselves enforce path containment on repo paths. File as a revision to `workspace-foundation` + `context-resolution` specs | small (follow-up) |
| Tests | Cover: (a) Step 5b bootstrap at workspace root writes workspace `product.md`; (b) Step 5b inside a registered repo writes repo `product.md`; (c) plan release/milestone at workspace root read workspace `product.md` and skip epic sync; (d) plan release/milestone never write to repo `product.md`; (e) path-containment rejects `../` repo paths; (f) identity sanitisation strips ANSI + truncates; (g) input-size caps truncate at 200 files and skip > 512 KB files; (h) module-name validation rejects invalid tokens; (i) advisory printed once to stdout; (j) single-repo behaviour unchanged | medium |

## Acceptance Criteria

- [ ] `/adev:brainstorm` invoked at the workspace root runs Step 5b against workspace `.context-index/` (glob and read/write paths are workspace-root-scoped)
- [ ] `/adev:brainstorm` invoked inside a registered repo runs Step 5b against the repo's `.context-index/` (unchanged behaviour)
- [ ] `/adev:brainstorm` invoked outside any workspace (no `adev-workspace.yaml` found) behaves identically to current single-repo mode
- [ ] Workspace mode bootstraps a minimal workspace `product.md` with title derived from `workspace.name` (or workspace dirname), a user-supplied Vision, Module Map with workspace charters only, and Milestones placeholder
- [ ] Bootstrap Vision prompt surfaces registered repos' identities as context (not as file content) when at least one repo constitution is present
- [ ] Identity one-liners from per-repo constitutions are stripped of control characters (including ANSI CSI sequences) and truncated to 200 UTF-8 characters with ellipsis before display
- [ ] Identity extraction falls through gracefully: `## Identity` section → first sentence of body → `no constitution`
- [ ] Bootstrap proceeds with no workspace `constitution.md` and without referencing any workspace `manifest.yaml`
- [ ] `/adev:plan --release <name>` invoked at the workspace root reads and updates workspace `.context-index/specs/product.md` for that release
- [ ] `/adev:plan --milestone <name>` invoked at the workspace root reads and updates workspace `.context-index/specs/product.md` for that milestone
- [ ] Release mode at workspace root builds the feature list from workspace charters AND registered repo charters, annotated with source (`workspace/<module>` or `<repo-slug>/<module>`). Annotation is display-only; it is not persisted to work-item frontmatter.
- [ ] Release mode at workspace root incorporates the workspace dependency graph (via `resolveWorkspaceContext().dependencyGraph`) into its topological sort, applying the non-transitive Feature-edge inheritance rule from Behavior 14
- [ ] Milestone mode at workspace root prompts the user to disambiguate ambiguous feature names
- [ ] Module-name tokens failing `[a-zA-Z0-9_-]+` are rejected with `INVALID_MODULE_NAME` before any filesystem lookup
- [ ] Neither release nor milestone mode writes to any registered repo's `product.md` or `.context-index/` in workspace mode (isolation invariant)
- [ ] Epic-board `create()` is unconditionally skipped in workspace mode; the deferral message is printed in both release and milestone modes. No code path references a workspace `manifest.yaml`.
- [ ] Repo `path` values from `adev-workspace.yaml` that resolve outside `workspaceRoot` are rejected with `PATH_ESCAPE` warning; files under the escaping path are never opened
- [ ] Workspaces with more than 200 charter files truncate with a warning in declaration order
- [ ] Charter files larger than 512 KB are skipped with a warning; other files continue to process
- [ ] Missing workspace `.context-index/` produces the existing `Run /adev:init --workspace` advisory and exits without action
- [ ] Repo-mode-inside-workspace invocations print the one-line advisory to **stdout** exactly once per invocation
- [ ] `lib/workspace.mjs` exports `resolveWorkspaceProductPath(workspaceRoot)` returning `<workspaceRoot>/.context-index/specs/product.md`
- [ ] All quality gates pass (`npm test`)
- [ ] No constitutional violations introduced (no new external deps; SKILL.md files remain primarily markdown; no workspace `manifest.yaml` referenced)
