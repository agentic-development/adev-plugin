---
name: adev:plan
description: "Decompose reviewed Live Specs into ordered implementation tasks with TDD expectations and context routing. Use to break specs into actionable tasks."
---

# Plan Implementation

Decompose a reviewed Live Spec into an ordered task list ready for `/adev:implement`. Every task follows TDD (write failing test, verify fail, implement, verify pass, commit) and traces back to a charter capability.

**Announce at start:** "I'm using the adev:plan skill to create the implementation plan."

## Arguments

- `--spec <path>`: plan a specific spec (routes to Spec Mode)
- `--feature <module>`: plan a feature charter (routes to Feature Mode)
- `--release <name>`: plan a named release (routes to Release Mode)
- `--milestone <name>`: create or update a milestone (routes to Milestone Mode)
- `--epic <id>`: decompose an Epic into Features (routes to Epic Mode)
- `--milestone <name>`: plan all specs matching a milestone across all modules (e.g., `--milestone v1`)
- `--dry-run`: show the plan structure without writing it

Passing more than one of `--spec`, `--feature`, `--release`, `--milestone`, `--epic` in a single invocation throws **CONFLICTING_FLAGS** and the skill exits without action.

## Step 0: Mode Detection

Before any other steps, determine the operating mode. Explicit flag wins over keyword detection, which wins over project-state inference, which falls back to a multi-choice menu on ambiguity.

### Resume Detection (Incremental Authoring)

**Before** anything else in Step 0, check whether a prior `/adev:plan` invocation left a `.partial` file for the resolved plan path. Per `incremental-artifact-writes.spec.md`, plan files are written incrementally to `<plan-path>.partial` with a `partial_schema: plan@1` marker and atomically renamed to `<plan-path>` on completion. If a `.partial` exists, a prior invocation was interrupted mid-stream (commonly: Claude API streaming dropped a long Write tool call — see issue-504).

Steps:

1. Resolve the prospective plan path from arguments (Spec Mode: `<spec-path>` minus `.spec.md` plus `.plan.md`; other modes: per their detection logic).
2. Run `adev partial inspect --artifact <plan-path>.partial` to check existence + schema marker + lock state.
3. If `partial_exists` is true:
   - **Schema marker is `plan@1` and `schema_allowed` is true:** ask the user `Resume from prior partial, discard and restart, or abort?` Default in `--auto` mode is **resume** (read the partial, continue authoring from the last coherent section).
   - **Schema marker missing or not allowed:** the file may be from an older plan format or an unrelated process. Discard with a logged warning and start fresh: `adev partial discard --artifact <plan-path>.partial --spec <spec-path>`.
4. If `partial_exists` is false, proceed normally.
5. If the inspect call reports a live lock (`lock_exists` true, owner alive), STOP — another `/adev:plan` invocation is in flight. Tell the user and exit.

### Detection Precedence

1. **Explicit flag (highest priority):** If one of `--spec`, `--feature`, `--release`, `--milestone`, or `--epic` is present, enter that mode immediately. Skip keyword and state detection entirely.
   - Error: if two or more mode flags are passed together, output `CONFLICTING_FLAGS` and exit.

2. **Path argument:** If a single argument ends in `.md` and resembles a file path to a Live Spec (e.g., `multi-repo-workspace/init-workspace.md`), identify it as a spec path and route to **Spec Mode** with that path as the `--spec` value.

3. **Keyword detection (free-text argument):** If a plain-text argument is provided, scan it for mode keywords:
   - "release" or "launch" → **Release Mode** (extract release name from remaining text)
   - "milestone" or "phase" → **Milestone Mode** (extract milestone name from remaining text)
   - "feature" or "module" → **Feature Mode** (extract module name from remaining text)
   - "epic" → **Epic Mode** (extract epic ID from remaining text)
   - Example: "plan release v2" → Release Mode, `name: "v2"`

4. **Project-state scan (no flag, no argument):** Read `.context-index/` to infer mode from current state:
   - If exactly one reviewed spec (with `*.review.md` passing verdict) lacks a corresponding `*.plan.md` → propose **Spec Mode** for that spec.
   - If multiple reviewed specs lack plans → present a multi-choice menu listing all pending specs plus other available modes.
   - If no reviewed specs need plans, check whether any Feature charter has capabilities without specs → propose **Feature Mode**.

5. **Ambiguity fallback (multi-choice menu):** When mode detection cannot resolve to a single mode, present a menu:
   ```
   What would you like to plan?

   1. Spec — decompose a reviewed Live Spec into Tasks
   2. Feature — identify missing specs for a charter module
   3. Release — build a release plan from product.md
   4. Milestone — create or update a milestone Epic
   5. Epic — decompose an existing Epic into Features

   Enter a number or describe what you want to plan:
   ```
   Await user selection and proceed. If the user dismisses without selecting, exit without action.

### Mode Summary Table

| Mode | Entry Condition | What it produces |
|------|----------------|-----------------|
| Spec | `--spec` / `.md` path / single reviewed spec lacking plan | Ordered Task list in a `*.plan.md` file |
| Feature | `--feature <module>` / "feature" keyword | Feature work items under an Epic |
| Release | `--release <name>` / "release" keyword | Sequenced release plan + child Epics |
| Milestone | `--milestone <name>` / "milestone" keyword | Milestone Epic + Feature placeholders |
| Epic | `--epic <id>` / "epic" keyword | Missing Feature proposals under an Epic |

## Repo-Mode-Inside-Workspace Advisory

**Repo-Mode-Inside-Workspace Advisory:** When the skill is invoked inside a registered repo (`detectWorkspace(cwd)` non-null AND `currentRepoSlug` is set), behaviour is repo-scoped (existing single-repo flow). Additionally, print this one-line advisory to **stdout** (same channel as existing skill messages — NOT stderr, logs, or hook channels), **exactly once per invocation**:

```
(Advisory: running repo-scoped inside workspace '<name>'. For
workspace-level planning, cd to <workspace-root> and re-run.)
```

The advisory does not block; it does not appear when `detectWorkspace` returns `null`.

## Milestone Planning Mode (`--milestone`)

> **Conditional loading:** Read `skills/plan/milestone-mode.md` for the full Milestone Planning Mode instructions.

---

## Spec Mode

Steps 1–7 below apply when operating in **Spec Mode**. This is the original single-spec planning flow. It is preserved unchanged. All other modes use their own dedicated sections below.

### Spec Mode Error Codes

- **REVIEW_GATE** — The spec has not been reviewed, or the review verdict is BLOCK, or the spec has drifted since its last review. Block with a clear message and tell the user to run `/adev:review-specs`.

## Step 1: Review Gate

Before planning, verify the spec has passed architecture review by reading the lifecycle event log. **This is the FIRST action in the skill, before any plan-file authoring, context loading, or other writes.**

1. Identify the spec file path. If `--spec` was provided, use that. Otherwise, ask the user which spec to plan.

2. **Gate on `review` step via the lifecycle log:**

   ```bash
   adev gate require --skill plan --spec <spec-path>
   ```

   - In `mode === "strict"` (default — resolved from `manifest.yaml`'s `lifecycle.gate_mode`), the helper exits `2` (per the hook protocol) if the `review` step did not complete with a passing verdict. The skill stops; surface the helper's stderr message unchanged. Do NOT catch the failure.
   - In `mode === "advisory"`, the helper emits a warning and exits `0`.
   - Path-containment is enforced by the helper (`INVALID_PROJECT_ROOT` / `INVALID_SPEC_PATH`). Skill prose MUST NOT pre-validate or normalize paths.

3. **Note any `PASS_WITH_NOTES` warnings.** Read `state.steps.review` for verdict notes; print them for the user but do not block.

4. **Code-Side Drift Check (CODE_DRIFT gate).** Independent from the review gate:

   ```javascript
   const { hasDrift } = await import('<ADEV_ROOT>/lib/spec-drift.mjs');
   const drifted = await hasDrift(specPath);
   ```

   - If `hasDrift()` returns `true`, **block**:
     ```
     CODE_DRIFT: Spec "<name>" has drift_detected: true. The latest unresolved
     code_drift_detected event in the spec's lifecycle JSONL reports source
     file <drift_source> was modified since the source manifest was last
     stamped. Run /adev:validate or update the spec before planning new work.
     ```

     The inline `drift_detected: true` boolean is the rolled-up view; the
     authoritative `drift_source` / `drift_at` payload lives on the spec's
     latest `code_drift_detected` event in `.context-index/lifecycle-state/<slug>.jsonl`.
     Use `adev verify spec --spec <path> --check-drift` to surface those fields.

   - If `hasDrift()` returns `false`, also run `verifyManifest()` as a fallback
     (catches drift on non-Claude-Code hosts where the hook never fired):
     ```javascript
     const { verifyManifest } = await import('<ADEV_ROOT>/lib/source-manifest.mjs');
     const result = await verifyManifest(manifest, projectRoot);
     if (!result.matches) { /* block with CODE_DRIFT message */ }
     ```

   - If `verifyManifest()` also fails (missing files), block with:
     ```
     CODE_DRIFT_VERIFY_ERROR: Cannot verify source manifest for spec "<name>" —
     <N> files missing. Run /adev:hygiene to diagnose, or /adev:implement to
     re-stamp the manifest.
     ```

   - If `hasDrift()` throws (malformed frontmatter), **block** (fail-closed):
     ```
     CODE_DRIFT_READ_ERROR: Cannot read drift status for spec "<name>" —
     frontmatter may be malformed. Fix the spec frontmatter before planning.
     ```

5. **Emit step-started event:** after the gate passes (and before context loading), record the plan step start:

   ```bash
   adev report --type step --spec <spec-path> --step plan --status started
   ```

   After the plan file is written at the end of the skill, emit the matching exit event with the produced plan's verdict:

   ```bash
   adev report --type step --spec <spec-path> --step plan --status completed --verdict <verdict> --from-summary
   ```

6. **Failure-path exit event:** whenever the skill stops after the `--status started` event above without reaching the Step 7 exit event, emit the terminal event before surfacing the error to the operator:

   ```bash
   adev report --type step --spec <spec-path> --step plan --status failed --verdict FAIL
   ```

   `--verdict FAIL` is required, not decorative. The projection's aggregation pass in `lib/lifecycle-state.mjs` only treats a step terminal as explicit when it carries a string verdict; a `step_failed` emitted without one is overwritten by the verdict synthesized from the actor reports already on the log, leaving a dead plan run indistinguishable from a clean one.

   Abort paths in this skill that MUST emit it:

   | Step | Abort |
   |---|---|
   | Step 1, Spec Mode target-repo detection | `validateModuleName()` rejects the spec's `target-repo` — `INVALID_TARGET_REPO`. |
   | Step 6, plan review loop | The reviewer still returns "Issues Found" after the 3-iteration cap, so the remaining issues are handed to the user for guidance. Report this as `LOOP_BUDGET_EXHAUSTED`, matching `/adev:build`'s BLOCK→revise vocabulary and `/adev:implement`'s Stage-2 cap, and state plainly that the plan has NOT been approved: Step 7 does not run, no charter Capability Map update, no `plan_task` `pending` events, no epic creation. |

   Everything in Step 0 and Step 1 substeps 1-4 — the `.partial` lock STOP, `adev gate require` exiting `2`, and the `CODE_DRIFT` / `CODE_DRIFT_VERIFY_ERROR` / `CODE_DRIFT_READ_ERROR` blocks — runs *before* the `--status started` event and therefore strands nothing. Do not emit for those.

   **Known gap (not this skill's to fix):** `adev report --type step` accepts no `--error` flag, so the abort's error code cannot be carried on the event even though the `step_failed` schema has an `error` field. Name the code in operator-facing output; widening the CLI surface is a follow-up.

### Spec Mode — Workspace-Aware Target-Repo Detection

After the Review Gate passes (Step 1) and before loading context (Step 2), check whether the spec declares a `target-repo:` field in its YAML frontmatter:

1. **Parse spec frontmatter** for the `target-repo:` field.
2. **If `target-repo` is present AND `detectWorkspace(cwd)` returns non-null:** enter **workspace-aware Spec Mode**. The remaining steps (2-7) follow the workspace-aware branching documented below.
3. **If `target-repo` is present but no workspace is detected (NO_WORKSPACE fallback):** emit a warning and fall back to the single-repo flow. Rationale: the `target-repo` field is only meaningful inside a workspace; outside a workspace, the spec is treated as a normal single-repo spec. The single-repo fallback ensures the skill remains functional for users who copy workspace specs into standalone repos.
   ```
   Warning: spec declares target-repo: '<value>' but no workspace detected.
   Falling back to single-repo flow. To use workspace-aware planning,
   run from a workspace root or a registered repo directory.
   ```
4. **Validate target-repo** against the workspace registry using `validateModuleName()` from `lib/workspace.mjs`. If validation fails, block with error code `INVALID_TARGET_REPO`:
   ```
   INVALID_TARGET_REPO: target-repo '<value>' is not a valid repo slug
   in the workspace registry. Valid slugs: <list>.
   ```

## Step 2: Load Context

### Essential Context (load now)

**Optimization:** Load spec + charter + constitution in a single Bash call via the CLI. This replaces items 1, 3, and 4 below with one turn:

```bash
adev context load --spec <spec-path>
```

The verb wraps `lib/meta-tools.mjs::loadSpecContext` and emits a JSON object `{ context }`; the `context` field is a markdown bundle containing the spec body, the parent charter's Capability Map, and the constitution's Non-Negotiable Principles.

If the CLI call fails, fall back to reading each file individually.

1. **Constitution:** Read `.context-index/constitution.md`. Extract non-negotiable principles, architecture boundaries, quality gate commands, and coding standards.

2. **Platform context:** Read `.context-index/platform-context.yaml`. Note the tech stack, framework versions, and deployment targets.

3. **Parent charter:** Read the feature charter (`.context-index/specs/features/<module>/charter.md`). Extract the capability map. Every task must trace to a capability listed here.

4. **The spec:** Read the Live Spec itself. Extract behavioral contract, acceptance criteria, and actionable task map (if present).

5. **Review verdict and notes:** The review-gate read in Step 1 already returned `state.steps.review`. Use its `verdict` and `notes` fields directly — do not re-read or parse the `.review.md` artifact. The plan should address or acknowledge any `PASS_WITH_NOTES` notes.

**Load Skill Extensions:** Load any skill extension instructions before proceeding:

```bash
adev skill-ext load --skill plan
```

If the output is not `__NONE__`, incorporate it as additional standing instructions that apply to this skill's entire execution. Frame it as: *"The following skill extension instructions apply to this invocation (source: installed domain extensions and/or project-level overrides)."* If the output is `__NONE__`, continue normally.

### Workspace-Aware Target-Repo Context Loading

When in workspace-aware Spec Mode (target-repo detected), load context from the target repo instead of (or in addition to) the current repo:

1. **Target repo constitution:** Read `<target-repo-path>/.context-index/constitution.md`. If the target repo's `.context-index/` directory is missing, handle gracefully — proceed without target repo constitution and note the gap in the plan header.
2. **Target repo platform-context:** Read `<target-repo-path>/.context-index/platform-context.yaml`. This determines the target repo's tech stack for task structure.
3. **Target repo orientation:** Read `<target-repo-path>/.context-index/orientation/architecture.md` for module placement and import patterns specific to the target repo.
4. **Special case — `target-repo: workspace`:** When the spec's target-repo value is literally `workspace`, the spec targets the workspace root itself rather than any registered repo. In this case, load the workspace-level `.context-index/` constitution, platform-context, and orientation. There is no repo-specific constitution to load.

### Workspace-Aware Cross-Repo Depends-On Resolution

When in workspace-aware Spec Mode, parse the spec's `depends-on` frontmatter for cross-repo references in the `@repo-slug/spec-slug` format:

1. **Identify cross-repo refs:** Entries matching the pattern `@<repo-slug>/<spec-slug>` are cross-repo dependencies.
2. **Resolve each ref** via `resolveRef(workspaceRoot, config, ref)` from `lib/workspace.mjs`. This returns the absolute path to the referenced spec in the sibling repo.
3. **Include resolved specs in Context Packets:** Add each resolved cross-repo spec as a Context Packet entry so subagents can read the dependency's behavioral contract.
4. **Warn on unresolvable refs:** If a cross-repo ref cannot be resolved (repo not in workspace registry, spec file not found), emit a warning but do not block:
   ```
   Warning: cross-repo dependency @<repo-slug>/<spec-slug> could not be resolved.
   The referenced spec may not exist or the repo may not be registered in the workspace.
   ```

### Reference Context (load when relevant)

Read these as needed during task writing. Do not load everything upfront — load when a task requires this context.

6. **Orientation:** Read `.context-index/orientation/architecture.md` when determining file structure, module placement, or import patterns for tasks.

7. **ADRs:** Read only the ADRs referenced in the spec or charter. Reference specific ADRs in tasks where they apply.

8. **External references:** Read `.context-index/references/**/*.md` only if the spec references external contracts or interfaces.

9. **Cross-cutting specs:** Read files from `.context-index/specs/cross-cutting/` only those that the spec depends on (check spec frontmatter or behavioral contract for references).

10. **Samples:** Read `.context-index/samples/` when writing context packets for tasks. Reference relevant golden samples in task guidance.

11. **Boundary rules:** Read `.context-index/governance/boundaries.yaml` only if the directory exists. Extract boundary rules as additional planning constraints.

12. **Heuristics:** Load module-scoped heuristics for inclusion in the plan via the CLI:

    ```bash
    adev heuristics retrieve --module <charter-module> --format text [--injection-limit N]
    ```

    Derive the module slug from the spec's `charter:` frontmatter field. Pass `--injection-limit` only when `heuristics.injection_limit` is configured in `manifest.yaml` (otherwise omit the flag for the library default of 8). Stdout is either rendered markdown blocks (one per heuristic) or the literal sentinel `__NONE__` when no heuristics match. The verb exits 0 regardless — failures degrade to `__NONE__` so heuristic injection stays non-blocking.

    Store the rendered output for use in Step 5.

## Step 3: Constitution Validation

Before writing any tasks, validate that the planned work stays within constitutional boundaries:

1. Check each acceptance criterion against the constitution's "Architecture Boundaries" section.
2. If any criterion would require creating new services, modifying auth flows, adding dependencies, or crossing other stated boundaries, flag it:
   ```
   Constitution boundary alert:
   The spec requires [action] which the constitution marks as needing human approval.
   Proceed with this in the plan? (yes, the user has approved / no, flag it as blocked)
   ```
3. If the user confirms, include the task but mark it clearly:
   ```
   ### Task N: [Title] [REQUIRES HUMAN APPROVAL]
   ```

Check each planned file path against boundary patterns from `governance/boundaries.yaml`:
- `severity: error` → flag as blocker, must resolve before planning proceeds
- `severity: warning` → flag as warning, proceed with caution
- Tasks touching files across multiple boundary patterns → note as "cross-boundary operation"

## Step 4: Specialist Routing

Read `.context-index/manifest.yaml` and check the `specialists` section. For each planned task, determine if a specialist should handle it:

- Match file paths the task will touch against each specialist's `trigger_patterns`.
- Match task description keywords against each specialist's `trigger_keywords`.
- Scoring: 2 points per pattern match (plus depth bonus), 1 point per keyword match.
- Highest-scoring specialist becomes the primary tag. If no match, tag as `[specialist: none]`.
- If multiple specialists match, tag with the highest scorer. Note secondary matches as a comment.

These tags tell `/adev:implement` which subagent to dispatch for each task.

## Step 5: Write the Plan

### Incremental Authoring (.partial pattern)

Per `incremental-artifact-writes.spec.md`, plan files MUST be authored incrementally to `<plan-path>.partial` and atomically renamed to `<plan-path>` on completion. This protocol survives mid-stream API failures (issue-504) by checkpointing to disk frequently.

Cadence: one section (H2 boundary or coherent block) per append. The first authored chunk MUST begin with a `partial_schema: plan@1` marker placed in an HTML comment so it does not render in the final plan:

```markdown
<!-- partial_schema: plan@1 -->

# Implementation Plan: <Feature Name>

...
```

Section append order matches the plan header → File Structure → Context Packets → Parallelization → Task Summary → Task Structure → Quality Gates flow defined below. Each section, once written, is durable: a kill/crash mid-write leaves the prior sections on disk and only the in-flight section is lost.

**Runaway-write guard (PARTIAL_ARTIFACT_OVERSIZE).** Before each append, run `adev partial check-size --artifact <plan-path>` to verify the in-progress partial has not exceeded `partial_oversize_multiplier × expected` bytes (defaults: 3× max(prior plan size, 50 KB)). The verb exits 2 with `PARTIAL_ARTIFACT_OVERSIZE` when the cap is breached — treat that as a hard stop: do NOT continue appending, do NOT commit the rename, preserve the partial for inspection, and surface the error to the user. This protects against retry loops that re-write prior chunks instead of appending only the new section.

After writing the final Quality Gates section, commit the artifact via atomic rename. Use the CLI verb so the SKILL.md stays markdown-only per the `cli-driver-surface` charter:

```bash
adev partial inspect --artifact <plan-path>.partial   # sanity check before commit
adev partial commit --artifact <plan-path>.partial    # atomic rename to <plan-path> (Behavior 2)
```

`.plan.md` carries no frontmatter contract, so `commit` skips the frontmatter guard for this kind and only performs the rename plus lock cleanup. A non-zero exit means the rename did not happen — the `.partial` is left in place for inspection.

Lock coordination: acquire `<plan-path>.partial.lock` via `adev partial inspect` first (lock_exists must be false OR the lock must be owned by this process). On a stale lock (dead-owner, age > `lifecycle.partial_stale_seconds`), the helper auto-steals — see the spec's Behavior 6 for the full contract.

If `/adev:plan` is interrupted mid-section, the next invocation enters Step 0 Resume Detection and picks up from the last coherent H2 boundary.

### Plan Location

Save the plan adjacent to the spec:
- Spec at `.context-index/specs/features/<module>/<task>.md` gets its plan at `.context-index/specs/features/<module>/<task>.plan.md`
- Cross-cutting spec at `.context-index/specs/cross-cutting/<topic>.spec.md` gets its plan at `.context-index/specs/cross-cutting/<topic>.plan.md`

**Workspace-aware plan save location:** When in workspace-aware Spec Mode, the plan is saved in the workspace `.context-index/`, not in the target repo's `.context-index/`. This keeps workspace-level planning artifacts co-located with the workspace-level specs that produced them.

### Plan Document Header

Every plan starts with this header:

```markdown
# Implementation Plan: <Feature Name>

> **Methodology:** adev
> **Charter:** .context-index/specs/features/<module>/charter.md
> **Spec:** .context-index/specs/features/<module>/<task>.spec.md
> **Review:** <PASS|PASS_WITH_NOTES> (YYYY-MM-DD)
> **Platform:** <framework> <version>, <language>, <key deps>

**Goal:** <One sentence describing what this builds>

**Architecture:** <2-3 sentences about the approach, referencing orientation and ADRs where relevant>

---
```

### Scope Check

If the spec covers multiple independent subsystems that could be built and tested separately, suggest breaking into separate plans. Each plan should produce working, testable software on its own.

### File Structure Section

Before defining tasks, map out all files that will be created or modified:

```markdown
## File Structure

**Create:**
- `src/components/Dashboard.tsx` — Main dashboard component
- `tests/components/Dashboard.test.tsx` — Dashboard unit tests

**Modify:**
- `src/app/layout.tsx:15-20` — Add dashboard route
- `src/lib/api/index.ts:42-50` — Export new endpoint handler

**Reference (read, do not modify):**
- `.context-index/samples/component-sample.md` — Follow this pattern for component structure
- `src/components/ExistingWidget.tsx` — Follow this component's pattern for state management
```

Design units with clear boundaries. Prefer smaller, focused files. Follow existing codebase patterns. If the codebase uses large files, do not unilaterally restructure.

#### Workspace-Aware Repo-Relative File Paths

When in workspace-aware Spec Mode, file paths in the File Structure and Task Structure sections must be repo-relative:

- **When target-repo is a repo slug:** prefix all file paths with the target repo's path relative to the workspace root (e.g., `<repo-slug>/src/module.ts`). This makes paths unambiguous in a multi-repo workspace.
- **When target-repo is `workspace`:** paths are workspace-relative (relative to the workspace root directory).
- **Commit scope:** The commit scope in each task's commit step must include the target repo slug (e.g., `feat(<target-repo-slug>/<module>): ...`). When target-repo is `workspace`, use the workspace name as the scope prefix (e.g., `feat(<workspace-name>/<module>): ...`). Branch naming follows the same convention: `feat/<target-repo-slug>/<short-description>` or `feat/<workspace-name>/<short-description>` for workspace-scoped specs.

### Context Packet Section

After the file structure and before individual tasks, include a context packet manifest per task. This makes subagent context explicit and inspectable.

**Source-manifest-guided loading:** When the spec has a `source-manifest.files[]` in its frontmatter, use those files as the primary relevance signal for context packets:
1. **Primary implementation file** (from source-manifest): include in full — the implementer needs to see existing patterns.
2. **Test file** (from source-manifest): include function signatures only (`grep "^export\|^describe\|^it"`) — shows test structure without full content.
3. **Sibling specs' source-manifest files** (same module): include export signatures only (`grep "^export"`) — shows available APIs.
4. **ADRs referenced in spec**: include decision + rationale sections only, not full ADR.

When no source-manifest exists (new spec), fall back to: charter Dependencies table for module boundaries, sibling specs' source manifests for shared directory patterns, and orientation file for module placement.

```markdown
## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/<module>/<task>.spec.md` (criteria 1-3)
- Charter: `.context-index/specs/features/<module>/charter.md` (capability: <name>)
- Source files: <from spec source-manifest.files[], full read for primary, signatures for siblings>
- Sample: `.context-index/samples/<pattern>-sample.md`
- ADR: `.context-index/adrs/<relevant-adr>.md` (decision + rationale only)
- Cross-cutting: `.context-index/specs/cross-cutting/<relevant>.spec.md`
- Boundary rules: `governance/boundaries.yaml` (rules affecting task files)
- Heuristics: <N> entries for module `<M>` (IDs: <id1>, <id2>, ...)

### Task 2 Context
- ...
```

Each packet entry lists the specific file AND the relevant section or criteria within it. `/adev:implement` assembles these packets before dispatching subagents and logs them to `.context-index/packets/` (gitignored) for debugging failed tasks. `/adev:recover` reads packets to diagnose root causes.

### Heuristics Section

If heuristics were loaded in Step 2, add a `## Heuristics` section to the plan after Context Packets and before Parallelization:

```markdown
## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `/adev:implement` reads from the live heuristic store.

<rendered heuristic blocks from Step 2>
```

If no heuristics are available, omit this section entirely.

### Parallelization Hints

After context packets, annotate which tasks can run in parallel (no shared file dependencies):

```markdown
## Parallelization

- Group A (sequential): Task 1 → Task 2 (shared files)
- Group B (independent): Task 3 (no file overlap with Group A)
- Group C (independent): Task 4 (no file overlap with A or B)

Groups B and C can run in parallel with Group A.
```

This is informational for `/adev:implement --parallel` (future). Tasks within a group run sequentially; groups run concurrently.

**Group line grammar — required, not stylistic.** `lib/parallel/groups.mjs` parses each group line with a fixed grammar; deviating from it either drops the group silently or corrupts its member list. Each group line MUST be shaped exactly:

```
- Group <id> (independent|sequential): Task <n>[ → Task <n>]...
```

- `<id>` — one or more letters/digits (`A`, `B1`, ...).
- The parenthetical MUST be the literal word `independent` or `sequential` — nothing else (no "the two run in parallel", no extra qualifiers, no synonyms). A group whose parenthetical is anything else is dropped and reported as a parse warning rather than scheduled.
- Each task reference MUST be the literal word `Task` followed by an id starting with a digit (`Task 1`, `Task 3.1`, `Task 8b`) — dotted sub-parts and a single trailing letter are allowed, but the id must start with a digit so free-flowing prose words are never mistaken for a task reference.
- Trailing prose after the task list (rationale, file names, notes) is fine and is ignored by the parser — but do not put additional `Task <n>` references inside that prose unless they really are members of the group, and do not end a task list with punctuation attached to the last id (`Task 6.` parses as task `6`, not `6.`, but keep the task list itself terse rather than folding a full sentence in immediately after the last arrow).
- One group per line. A task that runs alone and unordered relative to every group (e.g., "runs last") does not belong in this grammar at all — say so in prose outside the `- Group ...` lines rather than inventing a line the parser will not recognize.

### Task Summary Table

After the Parallelization section, emit a `## Task Summary` table that provides a quick-glance overview of all tasks. This is the first thing users and `/adev:implement` see before the detailed task sections.

```markdown
## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | ADR for dotenvx dependency | small | unit | — | 2 create, 1 modify |
| 2 | parseInfraRequirements | medium | unit | — | 1 create, 1 modify |
| 3 | dotenvx env file loading | medium | unit | Task 2 | 0 create, 2 modify |
| 4 | Env var presence checks | small | unit | Task 2 | 0 create, 2 modify |
```

**Column definitions:**
- **#** — sequential task number
- **Title** — short task name (from `### Task N: <title>`)
- **Complexity** — small / medium / large (from spec's Actionable Task Map or inferred from file count and description)
- **Strategy** — test strategy assigned to this task
- **Depends On** — task dependencies (from `Depends on:` annotation) or `—` if none
- **Files** — count of files to create and modify

This table is always emitted, regardless of project complexity or strategy configuration.

### Strategy Assignment

For each task, resolve its test strategy using the priority chain defined in `lib/test-strategies/assignment.mjs`:

1. Check if the parent spec declares `test_strategy` in its YAML frontmatter → use it (source: spec-declared, confidence: high)
2. Check if `manifest.yaml` has a `test_strategies` entry whose path globs match the task's file paths → use it (source: manifest, confidence: high)
3. Auto-detect from the task's file paths using `lib/test-strategies/detection.mjs` → use the detected strategy (source: detected, confidence from heuristic)
4. Default to `unit` (source: fallback, confidence: high)

Include the resolved strategy in each task's metadata. If any task uses a non-unit strategy, append a **Strategy Summary** section after the task list:

```markdown
## Strategy Summary

| Strategy | Tasks | Source |
|----------|-------|--------|
| unit | 3 | fallback |
| schema | 2 | manifest |

⚠ Low confidence assignments:
- Task 4: strategy=visual (detected, medium confidence) — verify before proceeding
```

Omit this section entirely when all tasks resolve to `unit` (backward compatible — no noise for projects not using test strategies).

### Granularity Assignment

Resolve granularity **once for the whole plan**, not per task, using `resolveGranularity()`:

```javascript
import { resolveGranularity } from '<ADEV_ROOT>/lib/test-strategies/policy.mjs';
// resolveGranularity({ moduleOverride, manifestPolicy, domainDefault }) →
//   { granularity: "per-task" | "per-behavior" | "per-spec", source }
```

It resolves from static configuration only — no routing input — in priority order: a
`modules[].test_policy.granularity` override for the task's module (source: module), then
`test_policy.granularity` in `manifest.yaml` (source: manifest), then the domain
`test-config.yaml` default (source: domain), then the built-in fallback `per-behavior`
(source: fallback).

The resolved granularity governs how each task's `**Tests:**` field is emitted:

- **`per-task`** — one new suite path per task (the previously shipped, unchanged behavior):
  every task's `**Tests:**` field names its own new suite.
- **`per-behavior`** (the fallback default) — one suite path per spec behavior statement, so
  several tasks implementing the same behavior share a single suite. Use `resolveSuitePath()`
  (`lib/test-strategies/suite-path.mjs`) per task to check whether the behavior it implements
  is already covered: when it is, the `**Tests:**` field references the existing suite and the
  task instruction reads "extend `<path>`" instead of "create"; when it is not yet covered,
  the field proposes a new suite path and the instruction reads "create `<path>`".
- **`per-spec`** — one suite path for the whole spec, shared by every task the spec produces.
  `resolveSuitePath()` resolves the same way against the spec's canonical suite path: "create"
  for the first task that produces it, "extend" for every task after.

Granularity governs only the `**Tests:**` field. Independent of granularity, every task carries its own **Files:** block (the per-task format under Task
Structure below, unconditionally emitted by `/adev:plan`) — this requirement does not vary by granularity, so
newly authored plans always give depth resolution (owned by `/adev:implement` at
test-authoring time) its path inputs.

### Infrastructure Requirements Section

After the Strategy Summary (or in its place when no non-unit strategies exist), check whether the plan needs a `## Test Infrastructure Requirements` section.

**Emission trigger (either condition):**
- The spec frontmatter contains `infra_requirements:` (regardless of strategy), OR
- One or more tasks are assigned a non-unit strategy

When all tasks are `unit` AND the spec has no `infra_requirements:` field, skip this section entirely (backward compatible — no noise for pure unit-test tasks).

**Derivation:**
For each non-unit task (or for all tasks when `infra_requirements:` is in spec frontmatter):
1. Read `infra_requirements:` from spec frontmatter — **if present, use as authoritative source and skip auto-detection (skip step 3)**
2. Otherwise, auto-detect from task file paths using file-globbing heuristics (e.g., files under `src/adapters/aws/` → AWS credentials likely needed; task paths matching `**/s3-client.*` → AWS S3 credentials likely needed). Detection uses file globbing only — no import scanning or content parsing.
3. Deduplicate requirements across tasks, grouped by external system.

When auto-detection confidence is `low`, prepend an advisory: "⚠ Infrastructure requirements auto-detected with low confidence — review and confirm before proceeding."

When `infra_requirements: unknown` is in spec frontmatter, emit `PLAN_INFRA_UNKNOWN` for all tasks in the spec.

**Section format:**

~~~markdown
## Test Infrastructure Requirements

> These requirements must be satisfied before integration/infrastructure tests can run.
> Tasks without these prerequisites will produce setup errors, not test failures.
> **Never record actual credential values in plan output or spec files — env var names only.**

### External Systems

| System | Required By | Strategy |
|--------|-------------|----------|
| AWS S3 | Task 1.2, Task 1.4 | integration |
| Postgres 15 | Task 2.1, Task 2.3 | schema, integration |

### Credentials / Environment Variables

| Variable | Required For | Where to Get It |
|----------|-------------|-----------------|
| `AWS_ACCESS_KEY_ID` | AWS S3 | AWS IAM console — dedicated test account |
| `DATABASE_URL` | Postgres | Provision test DB — inject as CI secret (contains password) |

### Pre-Provisioned State

- [ ] AWS test account with IAM permissions scoped to specific actions and test resource ARNs
- [ ] Postgres 15 instance accessible from test runner

### CI Configuration

These tests are excluded from the default `npm test` run. To execute:
```bash
npm run test:integration
# or: node --test --test-name-pattern "integration"
```

> **Local runs:** Create `.env.test` with credential values. `.env.test` MUST be listed in `.gitignore`.
> In CI, inject credentials as secrets — never hardcode them in workflow files.

### Unresolved Requirements

| Task | Issue | Action Required |
|------|-------|-----------------|
| Task 3.1 | `PLAN_INFRA_UNKNOWN` — external system not identifiable | Declare `infra_requirements:` in spec frontmatter |
~~~

**Non-blocking:** Plan does NOT block when infra requirements are unresolved. It completes the task list and surfaces unresolved items in the `### Unresolved Requirements` table for human review before running `/adev:implement`.

**Strategy Summary update (amends plan-integration Behavior 4):** When this section is emitted, extend the Strategy Distribution summary to include an "infrastructure" column:

~~~
Strategy Distribution:
  unit        ·  8 tasks   (source: fallback)      — no external infra needed
  integration ·  4 tasks   (source: detected/high)  — requires: AWS S3, SQS, Postgres
  schema      ·  2 tasks   (source: detected/high)  — requires: Postgres
  visual      ·  1 task    (source: spec-declared)  — requires: Storybook server (from infra_requirements:)
~~~

### Task Structure

> **Note on task status.** The per-task `- [ ]` checkboxes shown below are authoring guides only — they help human reviewers scan a plan but are not mutated by skills. `/adev:plan`, `/adev:implement`, `/adev:status`, and any other skill read authoritative task state from the spec's lifecycle event log (`plan_task` events) via `currentState(projectRoot, specPath).planTasks`, never from these checkboxes. Plan-task tables MUST NOT include a `Status` column — status belongs in the lifecycle log, not in the plan markdown. See `agent-reliable-state-artifacts/plan-task-events.spec.md` for the contract.

Each task follows TDD. Steps are granular (2-5 minutes each).

````markdown
### Task N: <Component Name> [specialist: <name|none>]

**Charter capability:** <which capability from the charter this implements>
**Strategy:** <strategy_id> (source: <source>, confidence: <level>)
**Files:**
- Create: `exact/path/to/file.ts`
- Modify: `exact/path/to/existing.ts:123-145`
- Test: `tests/exact/path/to/test.ts`

**Tests:** `tests/exact/path/to/test.ts` — every task must reference at least one test file. If no test file exists yet, the task must create one. This field is required; a task without a `tests:` field is incomplete.

**Context to load:**
- `.context-index/adrs/001-session-store-redis.md` (relevant decision)
- `.context-index/samples/service-sample.md` (follow this pattern)

- [ ] **Write failing test**

```typescript
describe('specificBehavior', () => {
  it('should do the expected thing', () => {
    const result = functionUnderTest(input);
    expect(result).toEqual(expected);
  });
});
```

- [ ] **Verify test fails**

Run: `<test command from constitution quality gates> -- <path to test file>`
Expected: FAIL — `functionUnderTest is not defined` (or similar)

- [ ] **Implement**

```typescript
export function functionUnderTest(input: InputType): OutputType {
  // implementation
  return expected;
}
```

- [ ] **Verify test passes**

Run: `<test command from constitution quality gates> -- <path to test file>`
Expected: PASS

- [ ] **Commit**

Branch (if not already created): `feat/<module>/<short-description>`

```bash
git add <specific files>
git commit -m "feat(<module>): add specific feature"
```
````

### Task Ordering

Order tasks so each produces working, testable software:

1. Data models and types first (foundation)
2. Core logic and services second (business rules)
3. API layer or interface contracts third (boundaries)
4. UI components or integration points last (consumer layer)
5. Integration tests after all units are wired

Explicit dependencies: if Task 3 depends on Task 1 and Task 2, state it:
```markdown
### Task 3: Wire Dashboard Route [specialist: none]
**Depends on:** Task 1, Task 2
```

### Quality Gates Section

End the plan with the full quality gate check from the constitution:

```markdown
---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `<test command>`
- Lint passes: `<lint command>`
- Type check passes: `<typecheck command>`
- All acceptance criteria from spec satisfied

If `governance/gates.yaml` exists, use its gate definitions instead of constitution Quality Gates. List deterministic gates with commands. Note probabilistic/no-command gates as skipped.
```

## Step 6: Plan Review Loop

After writing the complete plan, dispatch a plan-reviewer subagent.

**Always pass `run_in_background: false` on every `Agent({...})` dispatch in this skill.** The harness backgrounds Agent dispatches by default: the call returns immediately with a task ID and the caller is only re-invoked by a completion notification. That notification path is reliable only at the top level of a session — inside a nested subagent context it does not re-invoke the caller, so a backgrounded dispatch stalls the pipeline (field-observed as steps that auto-background and never return a result).

**Never end your turn to wait for a dispatched subagent.** A synchronous dispatch (`run_in_background: false`) returns its final result directly in the tool call — there is nothing to wait for. If a dispatch ever returns a task ID instead of a result, that is a bug in the dispatch (the rule above was violated, or the harness backgrounded it anyway): fix the dispatch and re-run it synchronously. Do not end the turn hoping a completion notification will resume you — in a nested subagent context it will not. If this skill is itself running as a dispatched subagent (e.g., a build pipeline step), your own caller is waiting on a result contract — for build pipeline steps this is the `STEP_RESULT` format defined in `skills/build/SKILL.md`. Ending your turn without that result to report is a protocol violation, not a valid pause point.

**Dispatch the reviewer** (`capable` tier — read from `model_tiers` in `.context-index/platform-context.yaml`; fall back to hardcoded defaults from `.context-index/specs/cross-cutting/model-routing.md` if unset). Dispatch the subagent with `Agent({description, prompt, run_in_background: false})` and nothing else:
```
Agent({
  description: "Review implementation plan",
  prompt: `
    <content of plan-reviewer-prompt.md from this skill directory>

    ---

    ## Constitution
    <constitution content>

    ## Parent Charter
    <charter content>

    ## Live Spec
    <spec content>

    ## Implementation Plan
    <the plan just written>
  `,
  run_in_background: false,
})
```

Provide: the plan document, the Live Spec, the parent charter, and the constitution. Do not pass session history.

**If the reviewer returns "Issues Found":**
1. Read the issues.
2. Fix them in the plan (same agent that wrote the plan fixes it, preserving context).
3. Re-dispatch the reviewer with the updated plan.
4. Maximum 3 iterations. If the loop exceeds 3 iterations, present the remaining issues to the user for guidance.

**If the reviewer returns "Approved":**
Proceed to the execution handoff.

**Disagreements:** If you believe reviewer feedback is incorrect (e.g., flagging something that is intentionally designed that way based on the spec or ADR), explain your reasoning in the plan as a comment and do not change it. The reviewer is advisory.

## Step 7: Execution Handoff

**Update charter Capability Map:** After saving the plan, read the parent charter and update the Capability Map. For each capability covered by this plan, set its `Status` column to `planned`.

**Emit plan-task `pending` events.** After the plan file is saved, walk the Task Map and emit one `pending` event per task into the spec's lifecycle log. This seeds the projection so `currentState(spec).planTasks` is populated as soon as the plan exists.

```javascript
import { reportPlanTask, filterEvents } from '<ADEV_ROOT>/lib/lifecycle-state.mjs';

// Re-plan detection: if the spec already has plan_task events for this plan,
// print a one-line advisory. Existing events remain as history (append-only).
const priorPending = filterEvents(projectRoot, specPath,
  e => e.event === 'plan_task' && e.plan === planFilePath);
if (priorPending.length > 0) {
  console.warn(
    'Re-plan detected: prior plan_task events remain in the lifecycle log as history. New events will append.'
  );
}

for (const task of plan.tasks) {
  reportPlanTask(projectRoot, specPath, {
    plan: planFilePath,
    task_id: task.id,
    status: 'pending',
    notes: null,
  });
}
```

Per-task Issue creation is removed entirely — the skill no longer constructs `create(...)` calls carrying a `planTask` reference. The board-granularity invariant (`agent-reliable-state-artifacts/charter.md`) requires plan-task state to live in the lifecycle log, not as Issues on the board.

**Issue creation (optional, board-granularity only):** Read `tasks.backend` from `manifest.yaml`.

If `tasks.backend` is configured, create an epic for the plan, passing a one-line summary drawn from the plan document's Goal line as `--notes`:

```bash
adev issues epic "<plan title>" --plan-ref "<plan-file-path>" --notes "<one-line summary of the plan's stated goal>"
```

Do not reuse the `"Charter: <module>"` / `"Release: <name>"` tag convention from feature-mode / release-mode for this `--notes` value — `"Charter: <module>"` is a lookup tag `/adev:specify` Step 5.6-3 queries to resolve a parent Epic, and `"Release: <name>"` is release-mode's own umbrella-Epic tag consumed only by its own `walkTree` flow; neither applies to this plan-level epic.

`adev issues epic` is the only verb that writes to the epic store the board reads. `adev issues create` lands the record in the issue store instead, where `/adev:implement` and `/adev:reconcile` will never find it — so they mint a duplicate epic on every run.

Pass no spec ref on this call: the epic record has no spec-ref field, so the value would be dropped silently. The spec link lives on the spec and plan artifacts, not on the epic.

Never invoke the backend binary (`br create`, …) directly. `adev issues epic` resolves the storage root from the git common dir, so an epic created inside a linked worktree lands on the one real board; a raw `br` call resolves `.beads/` from the current directory instead and fails with `SYNC_CONFLICT`, because a worktree carries a git-tracked `issues.jsonl` with no `beads.db` beside it.

Then:
1. Record the epic id printed by the verb (`Created epic <id>: <title>`); pass `--json` if you need the full record.
2. **Do NOT create per-task Issues.** Plan-task state is tracked via `reportPlanTask` (above), not as Issues. Feature- and Epic-level Issues created by `--feature` / `--epic` / `--release` modes are unchanged — those are board-granularity items.
3. Report: "Created epic `<epic-id>`. Plan-task state lives in the lifecycle log at `.context-index/lifecycle-state/<slug>.jsonl`."

If `tasks.backend` is not configured in the manifest, skip epic creation entirely (plan-task events are still emitted to the lifecycle log).

After the plan is saved and reviewed, present the user with next steps. **Do NOT echo the full plan content in the conversation** — the plan is already on disk at the file path. Present ONLY this summary:

```
Plan complete and saved to <path to plan file>.

<N> tasks covering <M> acceptance criteria from the spec.
<S> tasks tagged with specialist routing.

Next: /adev:route --plan <path>
  Scores each task on a four-dimensional routing matrix and writes a
  `<plan-stem>.routing.json` sidecar that /adev:implement reads to decide
  auto-agent / assisted-agent / human-only execution per task.
Then: /adev:implement --plan <path>
To review the plan: open <path to plan file>
To re-plan after spec changes: /adev:plan --spec <path>
```

**Persona adaptation:** The format above is the default for the Developer persona. If a different persona is active, adapt accordingly — but never repeat the full plan content.

## Dry-Run Mode

If `--dry-run` is passed, perform Steps 1-4 (gate check, context loading, constitution validation, specialist routing) and show the planned structure without writing any files:

```
Dry run: would create <path to plan file>

Tasks:
1. <Task title> [specialist: <tag>] — <files count> files
2. <Task title> [specialist: <tag>] — <files count> files
...

Spec coverage: <N> of <M> acceptance criteria mapped
Constitution: no boundary violations detected
```

---

## Feature Mode

> **Conditional loading:** Read `skills/plan/feature-mode.md` for the full Feature Mode instructions.

---

## Release Mode

> **Conditional loading:** Read `skills/plan/release-mode.md` for the full Release Mode instructions.

---

## Milestone Mode

> **Conditional loading:** Read `skills/plan/milestone-mode.md` for the full Milestone Mode instructions.

---

## Epic Mode

> **Conditional loading:** Read `skills/plan/epic-mode.md` for the full Epic Mode and next_action Convention Table.

---

## API reference

Lifecycle event log (gates, step tracking, plan-task channel):

- `currentState(projectRoot, specPath)` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — reads the per-spec JSONL log and returns a `StateProjection`: `{ spec, status, currentStep, currentTask, steps, planTasks, interventions, startedAt, updatedAt }`.
- `requireGate(state, "review", { mode })` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — hard-blocks (or warns, in advisory mode) when the prior step is not complete. Throws `GateError` in strict mode.
- `resolveGateMode(loadManifest(projectRoot))` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — resolves `manifest.lifecycle.gate_mode` (`strict` default, or `advisory`).
- `reportStep(projectRoot, specPath, { step, status, verdict? })` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — emits a `lifecycle_step` event at skill entry (`status: "started"`) and exit (`status: "completed"`).
- `reportPlanTask(projectRoot, specPath, { taskNumber, title, status })` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — emits a `plan_task` event. Owned by this skill for `pending` emission; transitions are owned by `/adev:implement`.

Issue board (cross-reference; the plan skill no longer creates per-task issues — see `plan-task-events.spec.md`):

- `getIssueManager(manifest)` from `<ADEV_ROOT>/lib/issues/registry.mjs` — returns the active issue adapter.
- `IssueManagerInterface` — `init`, `create`, `update`, `close`, `list`, `get`, `listEpics`, `createEpic`, `updateEpic`, `addDependency`, `walkTree`.

Manifest loader:

- `loadManifest(projectRoot)` from `<ADEV_ROOT>/lib/manifest.mjs` — parses `.context-index/manifest.yaml`.

## Next Step in the Lifecycle

Plan ready. The next step is **`/adev:route`** (score tasks for autonomy vs review — optional) and then **`/adev:implement`**.

If invoked via `/adev:work`, offer to continue: *"Plan ready. Continue to `/adev:route`, or straight to `/adev:implement`?"* The user can stop here.
