---
name: adev:work
description: "The single front door to adev. Classifies incoming work, reads in-progress project state, routes to the right lifecycle skill, and can drive the whole lifecycle end-to-end so the user never has to pick another command. Use whenever the user is unsure which skill to use, wants to start new work, resume in-progress work, or says 'what should I do', 'I need to work on something', 'help me get started', 'build X', 'fix this', 'where do I start'."
---

# Work — the Single Front Door

Classify incoming work, detect in-progress project state, route to the correct `/adev:*` skill, and — when the user wants — **drive the lifecycle through to completion** so they never have to choose another command. This is the single entry point to adev: use it whenever the user is unsure which skill to invoke, is starting new work, or is resuming.

Two things distinguish this skill from a plain router:

1. **It reads state first.** It resumes in-progress work by proposing the *next* lifecycle step, not by re-asking what to do.
2. **It stays with the work (Conductor Mode).** After a stage completes it proposes — or drives — the next stage, instead of dropping the user back to an empty prompt. See "Conductor Mode" below.

**Announce at start:** "I'm using the adev:work skill as your front door — I'll figure out the right step and can drive it through."

## Arguments

- No arguments: interactive triage (scans state, asks what you are working on)
- Free-text description: classify the description and propose a route (e.g., `/adev:work fix the broken test in hooks`)
- `--intake [<description>]`: intake mode — classify and triage an incoming work request into an issue on the issue board
- `--intake --file <path>`: batch intake mode — read a file containing multiple requests and process them all. File must be UTF-8 text, limited to 100KB

## Prerequisites

Check that `.context-index/` exists. If it does not:

> This project has not been initialized with the Agentic Development Framework. Run `/adev:init` first to set up the context index, then come back.

Stop processing. No other steps run.

## Step 1: Project State Scan

Scan for in-progress work using **parallel** tool calls in a single round:

1. **In-progress execution state:** Call `readExecutionState(projectRoot)` from `<ADEV_ROOT>/lib/execution-state.mjs`. If `status === "active"` or `status === "blocked"`, the project has resumable work — surface the `planRef`, `currentTask`, and any `blockers` to the user.

2. **Plan task projection:** For each plan referenced by an existing lifecycle log, call `currentState(projectRoot, specPath)` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` and inspect `state.planTasks`. Tasks with `status === "pending"` or `status === "in_progress"` are open. **Do not grep plan files for `- [ ]` checkboxes** — the plan file is read-only after authoring; canonical task status lives in the lifecycle log. (Plan-task channel ownership is defined in `plan-task-events.spec.md`; redirect plan-task work to `/adev:implement`, which is the only writer.)

3. **Pipeline status overview:** Call `listLifecycleStates(projectRoot)` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` to aggregate per-spec lifecycle states across the project. Specs whose `currentStep` is `specify` with `status: "completed"` but no `review` step are "unreviewed."

4. **Recent sessions:** Glob for `.context-index/sessions/*.md`. Read the 3 most recent files (sorted by filename date prefix, descending). Extract the session summary line.

### If in-progress work is found

Surface it, and **propose the concrete next step** — not just "resume?". For each in-progress item, compute its next lifecycle action using the Next-Step Projection table (Step 3), then lead with the single most relevant one:

> I found in-progress work:
> - **hooks** plan: 3/7 tasks incomplete → next: **`/adev:implement`** (continue the plan)
> - **design** spec `drag-drop.md`: specified but unreviewed → next: **`/adev:review-specs`**
> - Recent session (2026-03-28): "Implemented auth login flow"
>
> Want me to continue with `/adev:implement` on **hooks**, pick another, or start something new?

Wait for the user's response before proceeding. If the user says "continue", "resume", "what's next", or gives no new description, route directly to the projected next step for the most recently active item (see Step 3) — do not re-ask what to work on.

### If no in-progress work is found

Proceed directly to Step 2.

### Error handling

- If a file is missing during the scan, skip it silently (normal — not all projects have sessions or plans).
- If a file is present but malformed or unreadable, skip it and emit a visible warning: "Skipped one file that could not be read: `<path>`."

**Load Skill Extensions:** Load any skill extension instructions before proceeding:

```bash
adev skill-ext load --skill work
```

If the output is not `__NONE__`, incorporate it as additional standing instructions that apply to this skill's entire execution. Frame it as: *"The following skill extension instructions apply to this invocation (source: installed domain extensions and/or project-level overrides)."* If the output is `__NONE__`, continue normally.

## Step 2: Classify Work

If the user provided a description (as an argument, or in response to the state scan prompt, or as their initial message), classify it into exactly one work type.

### Work Type Classification Table

This table covers the full skill surface — route any intent to exactly one target. Grouped by lifecycle area; the first several rows are the common path.

| Intent | Signal Keywords / Patterns | Target Skill |
|--------|---------------------------|-------------|
| New feature / capability | "new feature", "add capability", "build X", "I want to create" | `/adev:brainstorm` |
| New spec (charter exists) | "write a spec", "specify", "define behavior for" | `/adev:specify` |
| Update / refactor a spec | "update the spec", "revise", "refactor", "clean up", "tech debt" | `/adev:specify --module <m>` / `--refactor` |
| Review specs | "review specs", "architecture review", "are the specs ready" | `/adev:review-specs` |
| Plan work | "plan", "break into tasks", "create tasks" | `/adev:plan` |
| Ship a spec end-to-end | "build it", "end to end", "run the pipeline", "review through validate" | `/adev:build` |
| Implement a plan | "implement", "start coding", "build the plan" | `/adev:implement` |
| Write tests first | "write tests", "TDD", "failing test for" | `/adev:write-test` |
| Bug / broken behavior | "bug", "broken", "failing test", "error", "not working" | `/adev:debug` |
| Validate an implementation | "validate", "check it works", "verify the feature" | `/adev:validate` |
| Score / grade quality | "eval", "score", "grade", "how good is" | `/adev:eval` |
| Project status | "status", "where do things stand", "progress", "what's done" | `/adev:status` |
| Context health / drift | "audit", "staleness", "drift", "hygiene", "context health" | `/adev:hygiene` |
| Fix lifecycle mismatches | "reconcile", "orphaned", "stale epics", "untraced code" | `/adev:reconcile` |
| Dead / stale code | "dead code", "unused exports", "orphan files" | `/adev:codehealth` |
| Manage work items | "create an issue", "file a bug", "issue board", "what needs doing" | `/adev:issues` |
| Research a topic | "research", "investigate", "compare", "best practices for" | `/adev:research` |
| Generate docs | "generate docs", "document the codebase", "architecture docs" | `/adev:document` |
| Deploy / release | "deploy", "publish", "push to production", "release" | `/adev:deploy` |
| Retrospective | "retro", "what went well", "delivery metrics", "review the sprint" | `/adev:retro` |
| Curate golden samples | "find good examples", "reference code", "golden samples" | `/adev:sample` |
| Capture a lesson | "remember this", "save this lesson", "heuristic" | `/adev:learn` |
| Set up / repair adev | "set up adev", "initialize", "diagnose context-index" | `/adev:init` |
| Sync agent files | "sync agent files", "constitution changed", "update CLAUDE.md" | `/adev:sync` |
| Sketch UI / API | "prototype", "mockup", "sketch the screen" | `/adev:prototype` |
| Map the repo | "map the codebase", "symbol index", "repomap" | `/adev:repomap` |

### Classification rules

- Use both keyword matching and semantic understanding of the user's intent.
- Match against the table above. If multiple types match, prefer the most specific one (e.g., "fix the failing spec review test" matches both `bug-fix` and `review` — choose `bug-fix` because the user describes a broken test, not a review request).
- Context from the state scan can refine classification (see Step 3).

### If no description is provided

Ask a single classifying question:

> What are you working on? For example:
> - A new feature or idea
> - A bug or failing test
> - Implementing an existing plan
> - Reviewing or planning specs
> - Something else

Wait for the user's response, then classify.

## Step 3: State-Aware Routing Refinement

### Next-Step Projection

Map each in-progress spec's lifecycle position to its next action. Derive position from `currentState(projectRoot, specPath).steps` and `readExecutionState` (Step 1) — do not guess from file presence.

| Current lifecycle position | Next step |
|---|---|
| Execution state `active` with a `currentTask` | `/adev:implement` (resume the current task) |
| Execution state `blocked` | `/adev:recover` (or `/adev:debug` if it is a code fault) |
| `specify` completed, no `review` step | `/adev:review-specs` |
| `review` passed (PASS / PASS_WITH_NOTES), no `plan` | `/adev:plan` |
| `plan` completed, no `route` and no `implement` | `/adev:route` (or `/adev:implement` if routing is skipped) |
| `implement` completed for all tasks, no `validate` | `/adev:validate` |
| `validate` passed | Done — offer `/adev:deploy`, `/adev:retro`, or new work |
| `review` verdict BLOCK | `/adev:specify --revise` (address the blockers) |

**When invoked with no description, or when the user says "continue" / "next" / "resume", route directly to the projected next step for the most recently active spec — do not re-ask what to work on.** This is the no-argument conductor path: `/adev:work` alone means "advance my current work."

Then apply the refinements below before proposing a route:

Before proposing a route, check whether the state scan (Step 1) should override or refine the classification:

1. **Resume override:** If the user says "work on X" and the state scan found an incomplete plan for module X, route to `/adev:implement` (not `/adev:brainstorm`):

   > Module **X** has an active plan with incomplete tasks. Routing to `/adev:implement` to continue the plan.

2. **Gate warning:** If the user says "plan X" but the lifecycle projection shows specs for module X have not passed review (`state.steps.review` missing or `verdict: BLOCK`), warn:

   > Specs for **X** haven't been reviewed yet. Want to run `/adev:review-specs` first, or proceed to planning anyway?

   Wait for the user's response.

## Step 4: Route Proposal

### High confidence (clear keywords or unambiguous context)

Propose the route directly with one-line reasoning:

> **Route:** `/adev:debug`
> **Reason:** You described a failing test in the hooks module.
> **Context:** Will pre-load the hooks charter and recent session.
>
> Proceed? (yes / change route)

### Low confidence (ambiguous description, multiple matches)

Ask one clarifying question with numbered options:

> This could be a few things. Which fits best?
> 1. New feature (needs a charter first) --> `/adev:brainstorm`
> 2. New spec within the **auth** charter --> `/adev:specify`
> 3. Update the existing `login-flow.md` spec --> `/adev:specify --module auth`

Wait for the user to choose.

## Step 5: Invoke Skill

Once the user confirms (explicitly with "yes", "sounds right", "go", "proceed", or implicitly by not objecting):

1. Invoke the target `/adev:*` skill.
2. Pass relevant context arguments where the target skill supports them:
   - `/adev:specify --module <module>` or `--refactor` for spec work
   - `/adev:debug --error <description>` for bug fixes
   - `/adev:implement --plan <path>` for implementation
   - `/adev:plan --spec <path>` for planning
   - `/adev:review-specs --module <module>` for reviews

If the user rejects the proposal or requests a different route, ask what they would prefer and re-propose.

## Conductor Mode — Drive the Arc, Don't Just Hand Off

`/adev:work` is the front door *and* the conductor for the whole lifecycle. After a stage completes, do not drop the user back to an empty prompt — carry them forward.

- **Full build flows.** When the classified intent is to take a feature or spec all the way to shipped (New feature, Ship a spec end-to-end, "build it end to end"), prefer routing to `/adev:build`, which already conducts review → plan → route → implement → validate as fresh subagents with gate checks and resume. `/adev:work` sets up the preconditions (does a charter/spec exist? is a non-main branch ready?) and hands into `/adev:build` rather than invoking each stage by hand. If the front of the arc is missing (no charter yet), start at `/adev:brainstorm`, then offer to continue into `/adev:build`.

- **Single-stage requests.** When the user asked for exactly one stage (e.g., just `/adev:plan`), run it, then surface the natural next step from the lifecycle state and offer to continue:

  > Plan complete. The next step in the lifecycle is `/adev:implement`. Want me to continue, or stop here?

- **Rigor lane (advisory).** Match the depth of the arc to the risk of the work — the same graduated-rigor idea as the Express Lane in `.context-index/research/adev-simplification-synthesis.md`:
  - **Low-risk / pattern-following** (small bug fix, formulaic spec, low blast radius): offer a lighter path — skip optional gates (`review-specs`, `eval`) and route straight to implement + a fast `validate`.
  - **High blast-radius or novel** work: keep the full arc, including review.
  - When the risk is unclear, ask once: *"This looks low-risk — take the fast path (skip review/eval), or run the full lifecycle?"*

The goal: a user can start at `/adev:work` and never need to pick another command unless they *want* fine-grained control.

## Step 6: Intake Mode

If `--intake` is present, branch here after the prerequisite check (Step 1 is skipped — intake mode does not perform the project state scan).

### 6.1: Prerequisites

1. Check that `.context-index/` exists. If not, print "Run `/adev:init` first" and stop.
2. Check that `tasks.backend` is configured in `.context-index/manifest.yaml`. If not, print "Issue board not configured. Add `tasks.backend` to manifest.yaml." and stop. (This is mandatory — intake mode creates issues.)

### 6.2: Intake Classification Table

Classify each request by scanning for signal keywords:

| Type | Signal Keywords | Default Priority |
|------|----------------|-----------------|
| `bug` | "bug", "broken", "crash", "error", "regression" | 1 |
| `feature` | "feature", "add", "new", "enhance", "support" | 2 |
| `task` | "task", "chore", "update", "migrate", "refactor" | 3 |

Adjust priority based on urgency signals: "urgent", "critical", "blocker" shift priority toward 0.

### 6.3: Epic Matching Algorithm

Match each request to an existing epic using the following strategy (first match wins):

1. **Exact match:** Check if the request description contains a substring matching an existing epic title
2. **Charter scope match:** Compare the request against charter scope sections for keyword overlap
3. **Milestone feature list match:** Compare the request against milestone feature lists for keyword overlap

If no match is found, propose creating a new epic or filing under "Unassigned." If no charters or epics exist, file all requests as "Unassigned" and suggest running `/adev:brainstorm` first to charter the work (which will bootstrap `product.md` on its first invocation).

### 6.4: Single Request Processing

When `--intake "<description>"` is provided (or the user provides a description interactively):

1. Classify the work type using the classification table
2. Estimate priority based on keywords and context
3. Match to an existing epic using the epic matching algorithm
4. Present the proposed issue with all fields:

   > **Proposed issue:**
   > - Title: <derived title>
   > - Type: <bug|feature|task>
   > - Priority: <0-4>
   > - Epic: <epic-id or Unassigned>
   >
   > Create this issue? (yes / edit / cancel)

5. On confirmation, create the issue via the issue manager: `getIssueManager(manifest).create({ title, type, priority, epicId })`.
6. Report: "Created `<id>`: <title> (type: <type>, priority: <N>, epic: <epic-id or Unassigned>)"

When `--intake` is provided without a description, prompt the user interactively:

> Describe the incoming work request:

Then process as above.

### 6.5: Batch File Processing

When `--intake --file <path>` is provided:

1. Verify the file exists. If not, print "File not found: <path>" and stop.
2. Verify the file is UTF-8 text and does not exceed 100KB. If it exceeds the limit, print "File exceeds 100KB limit" and stop.
3. Read the file contents. Parse one request per paragraph — paragraphs are separated by blank lines. Empty lines are treated as separators.
4. Process each request through the classification and epic matching pipeline (Steps 6.2-6.3).
5. Present a summary table of all proposed issues:

   ```
   | # | Title | Type | Priority | Epic | Milestone |
   |---|-------|------|----------|------|-----------|
   | 1 | Fix login crash | bug | 1 | epic-3 | v1 |
   | 2 | Add dark mode | feature | 2 | Unassigned | — |
   ```

6. Ask for user confirmation:

   > Create all N issues? (yes / edit / cancel)

7. On "yes": create all issues and report "Created N issues on issue board."
8. On "edit": allow the user to modify individual entries before creation.
9. On "cancel": abort without creating any issues.

## Key Principles

- **Single front door.** The user should not have to know which skill they need. Accept any description of intent, classify it, and route — never send them back to "pick a skill."
- **Conductor, not just router.** After routing, stay with the work: propose or drive the next lifecycle step (see Conductor Mode). A hand-off that strands the user at the next decision is a failure of this skill.
- **One question at a time.** Never dump multiple questions in a single message.
- **Propose, don't assume.** Always present a route proposal and wait for confirmation before invoking a skill.
- **State-aware.** Let project state refine or override keyword classification.
- **Fast path for clear cases.** If the intent is obvious, propose immediately — no unnecessary questions.
- **Graceful degradation.** If state scan or projection reads fail, skip them and continue. The skill works even with an empty `.context-index/`.
- **Plan-task channel:** plan-task state is owned by the lifecycle event log (`reportPlanTask`). This skill **reads** `state.planTasks` but never writes — that work belongs to `/adev:implement`. See `plan-task-events.spec.md`.

## API reference

Execution state and lifecycle projection:

- `readExecutionState(projectRoot)` from `<ADEV_ROOT>/lib/execution-state.mjs` — reads `.context-index/.execution-state.json`. Do not hand-parse.
- `currentState(projectRoot, specPath)` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — returns `{ status, currentStep, currentTask, steps, planTasks, interventions, ... }` for a single spec.
- `listLifecycleStates(projectRoot)` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — aggregates per-spec lifecycle state across the project (read-only directory walk over `.context-index/lifecycle-state/*.jsonl`).

Issue board:

- `getIssueManager(manifest)` from `<ADEV_ROOT>/lib/issues/registry.mjs` — returns the active issue adapter (json / file / beads).
- `IssueManagerInterface` — `init`, `create`, `update`, `close`, `list`, `get`, `listEpics`, `createEpic`, `updateEpic`, `addDependency`, `walkTree`. Intake mode (Step 6) calls `create()` per request.

Manifest:

- `loadManifest(projectRoot)` from `<ADEV_ROOT>/lib/manifest.mjs` — parses `.context-index/manifest.yaml`.
