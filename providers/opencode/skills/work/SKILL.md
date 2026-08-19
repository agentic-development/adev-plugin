---
name: adev:work
description: "The single front door to adev. Classifies incoming work, reads in-progress project state, routes to the right lifecycle skill, and can drive the whole lifecycle end-to-end so the user never has to pick another command. Use whenever the user is unsure which skill to use, wants to start new work, resume in-progress work, or says 'what should I do', 'I need to work on something', 'help me get started', 'build X', 'fix this', 'where do I start'. In OpenCode, invoke with skill({ name: 'adev:work' })"
---

# Work — the Single Front Door

Classify incoming work, detect in-progress project state, route to the correct `/adev:*` skill, and — when the user wants — **drive the lifecycle through to completion** so they never have to choose another command. This is the single entry point to adev: use it whenever the user is unsure which skill to invoke, is starting new work, or is resuming.

Two things distinguish this skill from a plain router:

1. **It reads state first.** It resumes in-progress work by proposing the *next* lifecycle step, not by re-asking what to do.
2. **It stays with the work (Conductor Mode).** After a stage completes it proposes — or drives — the next stage, instead of dropping the user back to an empty prompt. See "Conductor Mode" below.

**Announce at start:** "I'm using the adev:work skill as your front door — I'll figure out the right step and can drive it through."

### Load Skill Extensions

**Load Skill Extensions:** Load any skill extension instructions before proceeding:

```bash
adev skill-ext load --skill work
```

If the output is not `__NONE__`, incorporate it as additional standing instructions that apply to this skill's entire execution. Frame it as: *"The following skill extension instructions apply to this invocation (source: installed domain extensions and/or project-level overrides)."* If the output is `__NONE__`, continue normally.

---

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

Reads in-progress lifecycle state before classifying anything.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/work/references/steps/step-1-project-state-scan.md` for the full instructions. Do not act on this section from the summary above.

## Step 2: Classify Work

Classifies the incoming request into a lifecycle entry point.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/work/references/steps/step-2-classify-work.md` for the full instructions. Do not act on this section from the summary above.

## Step 3: State-Aware Routing Refinement

Adjusts the route using what the state scan found.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/work/references/steps/step-3-routing-refinement.md` for the full instructions. Do not act on this section from the summary above.

## Step 4: Route Proposal

Presents the proposed route and gets confirmation.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/work/references/steps/step-4-route-proposal.md` for the full instructions. Do not act on this section from the summary above.

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

- **Rigor lane (graduated tiers).** Match review/validation depth to risk via the **quick rigor tier** (`graduated-rigor-tiers.spec.md`) — do **not** skip gates (skipping `review-specs` stalls the strict gate chain):
  - **Low-risk / pattern-following** (small bug fix, formulaic spec, low blast radius): classify the work as "easy" and propagate `--tier quick` to `/adev:review-specs` and `/adev:validate` (or `/adev:build --tier quick`). The gates still run — just as a single synthesized reviewer and a fail-fast + synthesized compliance check.
  - **High blast-radius or novel** work: keep the full arc (`--tier full`, the default), including the three-specialist review.
  - When the risk is unclear, ask once: *"This looks low-risk — run the quick review/validate tier, or the full lifecycle?"*

The goal: a user can start at `/adev:work` and never need to pick another command unless they *want* fine-grained control.

### Do not re-enter a skill whose body is already loaded

Conducting the arc means carrying the work forward **from the instructions
already in this context** — not re-invoking skills to get them back.

- **Never re-invoke `/adev:work` to advance the arc.** Once this body has loaded,
  the classification table, the routing refinements, and Conductor Mode are all
  in context for the rest of the session. Re-invoking the front door to pick the
  next stage re-injects this entire file to learn something already present.
- **Never re-invoke a target skill you have already invoked in this session for
  the same unit of work.** If a stage must run a second time — a review came back
  BLOCK, a validate failed and implement must re-run — either continue from that
  skill's instructions already in context, or dispatch it as a subagent
  (`Agent({...})`), which runs in its own context rather than appending to this
  one.

  **Loading a companion is a continuation, not a re-entry.** After progressive
  disclosure, what is in context for an already-invoked skill is its body plus
  only the companions the first branch happened to load. A re-run that takes a
  different branch — `implement` under `--parallel`, whose instructions live in
  `<ADEV_ROOT>/skills/implement/references/parallel-mode.md` — has no in-context
  instructions for that branch. Read the companion the body points at. That is
  required by the conditional-loading contract, costs one file, and is not
  covered by the prohibition above, which is about re-injecting a whole SKILL.md.

- **Bound the re-runs. Three per stage, per unit of work.** Conductor-driven
  re-runs are NOT counted by `build.max_retries` or `build.max_review_retries` —
  those are read and decremented inside `/adev:build`'s own state, so a stage you
  re-run yourself spends none of that budget and nothing stops you. Keep the
  count yourself, per stage, and treat 3 as a hard ceiling.

  **On the third failure, stop and report.** Do not try a fourth time, do not
  switch strategy and continue, and do not escalate rigor and continue. Emit what
  you have — the failing stage, its verdict, the artifacts it wrote, and what you
  changed between attempts — and hand back to the operator. A stage that has
  failed three times with the context you already hold is not going to pass on
  the fourth; continuing past that point burns budget to produce the same result
  with more turns behind it.

  **Unattended runs stop at the first failure, not the third.** Under
  `/adev:work --intake --file` or any session with no operator answering, the
  "Propose, don't assume" confirmation gate does not fire — it gates *invocation*,
  and an in-context continuation is not an invocation. So there is no human in the
  loop to notice a repeat. Re-run only when an operator is present to see it;
  otherwise report the failure and stop. If a multi-stage arc genuinely needs
  unattended retries, route it to `/adev:build`, which has real ceilings, real
  state, and `--resume`.
- **Prefer `/adev:build` for multi-stage arcs.** It dispatches each stage as a
  fresh subagent with gate checks and resume, so no stage body ever lands in the
  orchestrator's context at all. That is the cheapest shape available, and it is
  why Conductor Mode routes full builds there rather than invoking each stage by
  hand.

**Why this rule exists, so it is not edited away as redundant.** A loaded
SKILL.md is not paid for once. It joins the context prefix and is re-read on
every subsequent turn for the rest of the session. In one measured lifecycle
(`adev-plugin-04jr.1`) `specify` was loaded three times and `work` twice —
about 31K tokens of pure duplication, re-read on every turn that followed. The
skill cannot detect from inside itself that its body is already present, so
this instruction is the only place the duplication can be prevented.

## Step 6: Intake Mode

Applies when the request needs structured intake before routing.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/work/references/steps/step-6-intake-mode.md` for the full instructions. Do not act on this section from the summary above.

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
