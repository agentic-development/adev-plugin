---
name: adev:plan
description: "Decompose reviewed Live Specs into ordered implementation tasks with TDD expectations and context routing. Use to break specs into actionable tasks."
---

# Plan Implementation

Decompose a reviewed Live Spec into an ordered task list ready for `/adev:implement`. Every task follows TDD (write failing test, verify fail, implement, verify pass, commit) and traces to a charter capability.

**Announce at start:** "I'm using the adev:plan skill to create the implementation plan."

Flags: `--spec <path>`, `--feature <module>`, `--release <name>`, `--milestone <name>`, `--epic <id>`, `--phase <name>`, `--dry-run`. More than one of `--spec/--feature/--release/--milestone/--epic` → **CONFLICTING_FLAGS**, exit without action.

## Step 0: Mode Detection

Precedence: explicit flag → `.md` path argument (Spec Mode) → keyword in free text ("release"/"launch" → Release, "milestone"/"phase" → Milestone, "feature"/"module" → Feature, "epic" → Epic; extract the name from remaining text) → project-state scan (one reviewed spec lacking a `*.plan.md` → Spec Mode; several → menu; none → charter with unspecced capabilities → Feature Mode) → multi-choice menu (Spec / Feature / Release / Milestone / Epic). Dismissed menu → exit without action.

| Mode | Entry | Produces |
|------|-------|----------|
| Spec | `--spec` / `.md` path / lone reviewed spec | Ordered Task list in `*.plan.md` |
| Feature | `--feature <module>` | Feature work items under an Epic |
| Release | `--release <name>` | Sequenced release plan + child Epics |
| Milestone | `--milestone <name>` | Milestone Epic + Feature placeholders |
| Epic | `--epic <id>` | Missing Feature proposals under an Epic |

**Repo-mode-inside-workspace advisory.** When `detectWorkspace(cwd)` is non-null AND `currentRepoSlug` is set, stay repo-scoped and print once per invocation to stdout (not stderr/logs/hooks): `(Advisory: running repo-scoped inside workspace '<name>'. For workspace-level planning, cd to <workspace-root> and re-run.)` Non-blocking; absent when `detectWorkspace` returns null.

## Phase Planning Mode (`--phase`)

Inside a workspace (`workspace.yaml`, `.workspace/`, or a `workspace` key in `manifest.yaml`): read the dependency graph (`from → to` means `from` depends on `to`), topologically sort repos upstream-first (Kahn or DFS), and on a cycle warn `circular dependency detected among workspace repos: <A> → <B> → <A>` and fall back to declaration order. No workspace (or one repo) → single-repo behavior.

Then: scan all `.md` under `.context-index/specs/features/` (excluding `charter.md`, `*.plan.md`, `*.review.md`); filter by frontmatter `milestone` matching `<name>` case-insensitively; report matches with status and ask `Proceed with planning all review-passed specs? (yes / include drafts / select)`; warn on specs below `review-passed` and include only on confirmation; order by the charter's Capability Map within a charter, by preconditions and consumed APIs across charters, else group by charter; run Steps 1-7 per spec, saving each plan adjacent to its spec; finish with a phase summary of plans created (with task counts), specs skipped as already implemented, and warnings.

Without `--phase`, single-spec planning via `--spec` is unchanged.

---

## Spec Mode (Steps 1-7)

Error code **REVIEW_GATE** — spec unreviewed, verdict BLOCK, or drifted since review. Block and tell the user to run `/adev:review-specs`.

### Step 1: Review Gate

1. Identify the spec path from `--spec`, else ask.
2. Find the adjacent `.review.md` (same dir, same base name: `card-ordering.md` → `card-ordering.review.md`). Missing → block: "This spec has not been reviewed yet. Run /adev:review-specs --spec <path> before planning."
3. Read the `Verdict`. `BLOCK` → block, naming the review report path and telling the user to resolve blockers, revise with `/adev:specify`, and re-review.
4. Spec newer than the review file → block: re-review the updated spec.
5. **CODE_DRIFT gate.** Call `hasDrift(specPath)` from `<ADEV_ROOT>/lib/spec-drift.mjs`:
   - `true` → block `CODE_DRIFT: Spec "<name>" has drift_detected: true. Source file <drift_source> was modified since last validation. Run /adev:validate or update the spec before planning new work.`
   - `false` → also run `verifyManifest(manifest, projectRoot)` from `<ADEV_ROOT>/lib/source-manifest.mjs` (catches drift on non-Claude-Code hosts where the hook never fired). No match → block with the CODE_DRIFT message. Missing files → block `CODE_DRIFT_VERIFY_ERROR ... Run /adev:hygiene to diagnose, or /adev:implement to re-stamp the manifest.`
   - throws (malformed frontmatter) → block `CODE_DRIFT_READ_ERROR` (fail-closed).
6. **Dual drift check.** Spec `revision` > review's `last-reviewed-revision` → block (revision drift). `git hash-object <spec>` ≠ review's `file-sha` → block (file drift). Legacy reviews lacking both fields fall back to the mtime check in step 4.
7. `PASS` or `PASS_WITH_NOTES` → proceed; print `PASS_WITH_NOTES` warnings without blocking.

**Workspace-aware target-repo detection** (after the gate, before context). Parse `target-repo:` from spec frontmatter. Present + workspace detected → workspace-aware Spec Mode for Steps 2-7. Present but no workspace → warn (`spec declares target-repo: '<value>' but no workspace detected. Falling back to single-repo flow.`) and use the single-repo flow, since `target-repo` is only meaningful inside a workspace. Validate the value against the workspace registry with `validateModuleName()` from `lib/workspace.mjs`; on failure block `INVALID_TARGET_REPO: target-repo '<value>' is not a valid repo slug in the workspace registry. Valid slugs: <list>.`

### Step 2: Load Context

**Essential (now):** constitution (`.context-index/constitution.md` — principles, architecture boundaries, quality gate commands, coding standards); platform-context (stack, versions, deployment targets); parent charter (`.context-index/specs/features/<module>/charter.md` — every task must trace to a capability listed there); the spec (behavioral contract, acceptance criteria, actionable task map); the `.review.md` (the plan should address or acknowledge `PASS_WITH_NOTES` warnings).

**Workspace-aware target-repo loading:** read the target repo's constitution, platform-context, and orientation from `<target-repo-path>/.context-index/`. Missing `.context-index/` → proceed and note the gap in the plan header. `target-repo: workspace` → load the workspace-level context instead; there is no repo-specific constitution.

**Cross-repo depends-on:** parse `depends-on` for `@<repo-slug>/<spec-slug>` refs, resolve each via `resolveRef(workspaceRoot, config, ref)` from `lib/workspace.mjs`, and add the resolved specs to Context Packets. Unresolvable ref → warn, do not block.

**Reference (when a task needs it):** orientation (`architecture.md`) for file structure and import patterns; only the ADRs the spec or charter references; `references/**/*.md` only for external contracts; only the cross-cutting specs the spec depends on; `samples/` when writing context packets; `governance/boundaries.yaml` if present, as extra planning constraints; and module-scoped heuristics via `retrieveHeuristics`/`renderHeuristic` from `<ADEV_ROOT>/lib/heuristics.mjs`, keyed on the spec's `charter:` slug and `heuristics.injection_limit` from manifest.yaml — non-blocking, proceed without them on failure, and store the rendered output for Step 5.

### Step 3: Constitution Validation

Check each acceptance criterion against the constitution's Architecture Boundaries. Anything requiring new services, auth-flow changes, new dependencies, or another stated boundary crossing → ask `Proceed with this in the plan? (yes, the user has approved / no, flag it as blocked)`, and on approval mark the task `### Task N: [Title] [REQUIRES HUMAN APPROVAL]`. Check each planned file path against `governance/boundaries.yaml`: `severity: error` blocks planning until resolved, `severity: warning` proceeds with caution, and tasks spanning multiple boundary patterns are noted as "cross-boundary operation".

### Step 4: Specialist Routing

From `manifest.yaml`'s `specialists`, score each task: 2 points per `trigger_patterns` file-path match (plus depth bonus), 1 point per `trigger_keywords` description match. Tag the highest scorer, or `[specialist: none]`; note secondary matches as a comment. These tags tell `/adev:implement` which subagent to dispatch.

### Step 5: Write the Plan

**Location:** adjacent to the spec — `<module>/<task>.md` → `<module>/<task>.plan.md`; cross-cutting specs likewise. In workspace-aware Spec Mode the plan is saved in the workspace `.context-index/`, not the target repo's.

**Header:** `# Implementation Plan: <Feature Name>` followed by a blockquote of Methodology (adev), Charter, Spec, Review (`<PASS|PASS_WITH_NOTES>` + date), and Platform; then **Goal** (one sentence) and **Architecture** (2-3 sentences referencing orientation and ADRs).

**Scope check:** if the spec spans independent subsystems that could be built and tested separately, suggest splitting into separate plans, each producing working, testable software on its own.

**File Structure section:** before defining tasks, list `**Create:**`, `**Modify:**` (with line ranges, e.g. `src/app/layout.tsx:15-20`), and `**Reference (read, do not modify):**`, each entry annotated with its purpose. Prefer smaller, focused files and follow existing codebase patterns — do not unilaterally restructure a codebase that uses large files. In workspace-aware mode, paths are repo-relative (`<repo-slug>/src/module.ts`, or workspace-relative for `target-repo: workspace`), and commit scope and branch names carry the repo slug: `feat(<target-repo-slug>/<module>): ...`, `feat/<target-repo-slug>/<short-description>`.

**Context Packets section:** one packet per task listing spec (with criteria numbers), charter (with capability), samples, ADRs, cross-cutting specs, boundary rules, and heuristics count/IDs. Each entry names the file AND the relevant section within it. `/adev:implement` assembles these before dispatching subagents and logs them to `.context-index/packets/` (gitignored); `/adev:recover` reads them to diagnose root causes.

**Heuristics section:** if heuristics loaded in Step 2, insert `## Heuristics` after Context Packets and before Parallelization, prefaced by a note that it is a snapshot for review convenience and that `/adev:implement` reads the live store at execution time. Omit entirely when none are available.

**Parallelization:** group tasks by shared-file dependency — sequential within a group, groups concurrent. Informational for `/adev:implement --parallel`.

**Task Summary table** (always emitted, regardless of project complexity or strategy config): `| # | Title | Complexity | Strategy | Depends On | Files |`, where Complexity is small/medium/large from the spec's Actionable Task Map or inferred from file count, Depends On comes from the `Depends on:` annotation or `—`, and Files counts creates and modifies.

**Strategy assignment**, in priority order: spec frontmatter `test_strategy` → `manifest.yaml` `test_strategies` glob match → auto-detect via `lib/test-strategies/detection.mjs` → default `unit`. Record strategy, source, and confidence per task. If any task is non-unit, append a **Strategy Summary** table (strategy, task count, source) flagging low-confidence assignments for verification. Omit it entirely when every task is `unit`.

**Test Infrastructure Requirements section** — emit when the spec frontmatter has `infra_requirements:` OR any task is non-unit; skip entirely when all tasks are `unit` and the spec declares nothing. Spec frontmatter `infra_requirements:` is authoritative and skips auto-detection; otherwise auto-detect from task file paths by globbing only (no import scanning or content parsing), then deduplicate by external system. Low-confidence detection gets the advisory "⚠ Infrastructure requirements auto-detected with low confidence — review and confirm before proceeding"; `infra_requirements: unknown` emits `PLAN_INFRA_UNKNOWN` for every task in the spec. The section carries External Systems, Credentials / Environment Variables, Pre-Provisioned State, CI Configuration, and Unresolved Requirements tables. **Never record actual credential values in plan output or spec files — env var names only**; local runs use a gitignored `.env.test`, CI injects secrets. Non-blocking: unresolved items are surfaced for human review, not blocked on. When emitted, extend the Strategy Distribution summary with the infrastructure each strategy requires.

**Task structure.** Each task follows TDD with granular steps (2-5 minutes each):

````markdown
### Task N: <Component Name> [specialist: <name|none>]

**Charter capability:** <capability from the charter>
**Strategy:** <strategy_id> (source: <source>, confidence: <level>)
**Files:**
- Create: `exact/path/to/file.ts`
- Modify: `exact/path/to/existing.ts:123-145`
- Test: `tests/exact/path/to/test.ts`

**Tests:** `tests/exact/path/to/test.ts` — every task must reference at least one test file. If none exists, the task must create one. Required; a task without a `tests:` field is incomplete.

**Context to load:** <relevant ADRs and samples>

- [ ] **Write failing test** — the test body
- [ ] **Verify test fails** — run `<test command from constitution quality gates> -- <test file>`; expected FAIL (e.g. `functionUnderTest is not defined`)
- [ ] **Implement** — the implementation body
- [ ] **Verify test passes** — same command; expected PASS
- [ ] **Commit** — branch `feat/<module>/<short-description>` if not created, then
      `git add <specific files>` and `git commit -m "feat(<module>): add specific feature"`
````

**Task ordering:** data models and types (foundation) → core logic and services (business rules) → API layer and interface contracts (boundaries) → UI and integration points (consumer layer) → integration tests once units are wired. State dependencies explicitly with `**Depends on:** Task 1, Task 2`.

**Quality Gates section** closes the plan, drawn from the constitution: tests, lint, and typecheck commands plus "All acceptance criteria from spec satisfied". Note that `/adev:validate` verifies the suite after all tasks and records results in `.validate.md`, not in the plan. If `governance/gates.yaml` exists, use its gate definitions instead, listing deterministic gates with commands and noting probabilistic/no-command gates as skipped.

### Step 6: Plan Review Loop

Dispatch a plan-reviewer subagent (`capable` tier from `model_tiers` in platform-context.yaml, falling back to the defaults in `.context-index/specs/cross-cutting/model-routing.md`), passing `plan-reviewer-prompt.md` plus the constitution, parent charter, Live Spec, and the plan just written. Do not pass session history.

"Issues Found" → fix them in the plan (the agent that wrote it fixes it, preserving context) and re-dispatch; maximum 3 iterations, then present the remaining issues to the user. "Approved" → proceed to handoff. The reviewer is advisory: if feedback is wrong because the spec or an ADR intends the design, explain the reasoning in a plan comment and leave it unchanged.

### Step 7: Execution Handoff

Update the parent charter's Capability Map, setting `Status` to `planned` for every capability this plan covers.

**Issue creation (optional)** — only when `tasks.backend` is set in `manifest.yaml`; otherwise skip entirely. Via `getIssueManager(manifest)` from `lib/issues/registry.mjs`: `createEpic({ title, planRef })`, then per task `create({ title, type: "task", priority: 2, epicId, planRef, planTask: <task-number> })`, then `addDependency(<issue-id>, <dependency-issue-id>)` for each `Depends on:` entry. Report: "Created epic `<epic-id>` with `<N>` issues on the issue board."

Then present next steps (Developer-persona default — adapt to the active persona):

```
Plan complete and saved to <path to plan file>.

<N> tasks covering <M> acceptance criteria from the spec.
<S> tasks tagged with specialist routing.

To implement: /adev:implement --plan <path>
To review the plan: open <path to plan file>
To re-plan after spec changes: /adev:plan --spec <path>
```

**Dry-run:** with `--dry-run`, run Steps 1-4 only and print the would-be plan path, the task list with specialist tags and file counts, acceptance-criteria coverage, and constitution boundary status — writing nothing.

---

## Feature Mode

**CHARTER_GATE:** read `.context-index/specs/features/<module>/charter.md`; missing, `draft`, or `in-progress` → block `CHARTER_GATE: Charter for module '<module>' must be approved before Feature Mode planning. Create or approve the charter with /adev:brainstorm --module <module>.`

Extract the Capability Map, identify capabilities with no Live Spec (no spec frontmatter references it, or no spec file exists for the module), and propose one spec per gap — title from the capability, one-sentence scope, path `.context-index/specs/features/<module>/<slug>.md`, and `next_action` from the convention table. Present for approval (`yes / edit / cancel`). On approval create an Epic if none exists (`create({ type: "epic", notes: "Charter: <module>" })`) and a Feature work item per proposed spec with `parent_id`, `type: "feature"`, `spec_ref: null`, and the `next_action` string. Report: "Created `<N>` Feature work items under Epic `<epic-id>`."

---

## Release Mode

**Workspace branch** — when `detectWorkspace(cwd)` is non-null AND `currentRepoSlug === null` (invoked at the workspace root): read the milestone from `resolveWorkspaceProductPath(workspaceRoot)`; build the feature list from workspace-level charters plus each sibling repo's charters via `resolveWorkspaceContext(...).siblingRepos[]`, guarding every read with `assertPathInWorkspace(workspaceRoot, repo.path)` (skip the repo with a warning on `PATH_ESCAPE`), capping each file with `readCappedText(file, MAX_CHARTER_FILE_BYTES)` and the whole set at `MAX_CHARTER_FILES` in declaration order with a warning; annotate features `workspace/<module>` or `<repo-slug>/<module>` **display-only, never persisted to work-item frontmatter** (avoids conflict with `target-repo`). Take dependency edges from `resolveWorkspaceContext(...).dependencyGraph` only — never re-parse `adev-workspace.yaml` — combining charter `Dependencies` tables, spec `depends-on` frontmatter, and repo-to-repo edges. A workspace edge `{from: A, to: B}` contributes edges from every Feature in A to every Feature in B: additive, and **NOT transitive**. Topo-sort with tie-breakers (a) upstream repo order, (b) workspace `product.md` declaration order; cycles fall back to declaration order with a warning. Skip epic-board `create()` calls **unconditionally**, persist to workspace `product.md` only, and print the Shared Issue Tracking (Phase 2) deferral message.

**Repo flow:** read `product.md` for the release section (no match → offer to define it); extract its features; if a release Epic exists, `walkTree(<release-epic-id>)` is the source of truth for current children; build a directed graph from charter `Dependencies` tables and spec `depends-on` frontmatter, where `A → B` means A depends on B; topologically sort upstream-first, identify the critical path, and warn on cycles while falling back to declaration order for cyclic groups; present the sequence with risks for approval; on approval create the umbrella Epic (`notes: "Release: <release-name>"`) if absent plus a child Epic per feature not already in the `walkTree` result, each with `next_action: "Run /adev:plan --feature <module> to break into Features"`. Report: "Release plan for `<release-name>` created with `<N>` Epics."

---

## Milestone Mode

**Workspace branch** (same entry condition as Release Mode): read/write via `resolveWorkspaceProductPath(workspaceRoot)`, prompting for target date, feature list, and success criteria when the milestone section is absent. Accept bare `<module>` or qualified `workspace/<module>` / `<repo-slug>/<module>`, validating BOTH tokens with `validateModuleName(token)` **before any filesystem lookup** — invalid → `Invalid module name token: '<input>'. Module names must match [a-zA-Z0-9_-]+.` with code `INVALID_MODULE_NAME`. Ambiguous bare names (matching both a workspace and a repo charter) prompt for disambiguation, and the written line always records the qualified form. **Isolation invariant: never write to any registered repo's `product.md`** — workspace milestones are workspace-scoped, and writing into a repo violates the charter's quality attributes. Skip epic-board `create()` **unconditionally** and print the deferral message with `Milestone '<name>'` in the first line.

**Repo flow:** find the milestone section in `product.md`, or prompt for target date, feature list, and success criteria and write it. Create the milestone Epic (`notes: "Milestone: <name>. Target: <date>"`), updating `notes` rather than duplicating if one exists. Create a Feature placeholder per named feature (`spec_ref: null`, `next_action: "Run /adev:plan --feature <module> to break into Features"`). Record the target date in the Epic's notes or a dedicated field. Report the milestone name, Epic ID, placeholder count, and target date.

---

## Epic Mode

Read the named Epic (missing → block with a clear error), call `walkTree(<epic-id>)` for existing children, and compare the Epic's `notes` and any associated charter against them to identify missing Features. Propose them — behavior from there matches Feature Mode's proposal step onward — and on approval create each with `parent_id: <epic-id>`, `type: "feature"`, `spec_ref: null`, and `next_action: "Run /adev:plan --feature <module> to break into Features"`. Report: "Epic `<epic-id>` now has `<N>` Features (`<M>` newly created)."

---

## next_action Convention Table

Every work item created in any mode must have `next_action` populated with the exact string below. Substitute real values at creation time — never persist literal `<module>`, `<spec_ref>`, or `<id>`.

| Work Item | State | next_action value |
|-----------|-------|-------------------|
| Task | any | `"Run /adev:implement to do RED-GREEN-REFACTOR for this Task"` |
| Feature | without spec | `"Run /adev:specify --module <module> to author this Feature"` |
| Feature | spec exists, needs review | `"Run /adev:review-specs --module <module>"` |
| Feature | spec reviewed and passing | `"Run /adev:plan --spec <spec_ref> to decompose into Tasks"` |
| Epic | no Features | `"Run /adev:plan --feature <module> to break into Features"` |
| Epic | all Features planned | `"Run /adev:plan --epic <id> to verify decomposition"` |
