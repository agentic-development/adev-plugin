---
name: adev:build
description: "End-to-end build orchestrator. Chains review, plan, route, implement, and validate for one or more specs through a full lifecycle pipeline. Use when the user says 'build', 'end to end', 'full pipeline', 'build the spec', 'build the milestone', 'run the whole pipeline', or wants to execute multiple lifecycle steps in sequence without manual handoffs."
---

# Build Pipeline Orchestrator

Chain review, plan, route, implement, and validate into a single end-to-end pipeline for one or more specs. Supports resuming from failure, batch processing by charter module or milestone, and dry-run preview.

**Announce at start:** "I'm using the adev:build skill to orchestrate a full build pipeline."

## Arguments

- `--spec <path>`: build a single spec end-to-end through all pipeline steps
- `--charter <module>`: discover and build all specs under `.context-index/specs/features/<module>/`
- `--module <module>`: alias for `--charter`
- `--milestone <name>`: discover and build all specs with matching `milestone` frontmatter
- `--resume`: resume an interrupted build from the last successful step
- `--dry-run`: show the pipeline plan without executing any skill or writing any file
- `--no-route`: skip the route step (Step 3) in the pipeline
- `--full`: run the Full Pipeline (specify → review → plan → route → implement → validate). Without `--full`, the default Implement Pipeline skips specify and review and requires a pre-existing `.review.md`.
- `--from <step>`: override resume point — force restart from a specific step (`specify`, `review`, `plan`, `route`, `implement`, `validate`). Useful if build state is corrupted or stale.
- `--no-infra`: skip infrastructure preflight in implement and validate steps (user-only — the agent must never set this flag). Propagated to sub-skills via `ADEV_NO_INFRA=1` env var.
- `--verbose`: disable silent execution for all subagents in this pipeline run. Subagent prompts include `VERBOSE: true`, causing skills to narrate each step. Useful for debugging pipeline failures.
- `--auto`: run the entire pipeline without prompting the user for input. Stale builds are overwritten (not prompted). Subagent prompts include `AUTO: true`, instructing sub-skills to make autonomous decisions instead of asking the user (e.g., accept default choices, skip confirmations). The build stops on errors rather than asking for guidance. Useful for CI, scheduled builds, and batch operations.
- `--require-human-final-pass`: hybrid-mode gate added by the `review-block-auto-retry` spec. When the BLOCK→revise loop converges on PASS at revision N+1, the build halts with verdict `PASS_PENDING_HUMAN` instead of proceeding. A `human_approval_required` lifecycle event is emitted. The operator runs `/adev:build --resume --spec <spec>` to acknowledge the final revision and continue to plan/implement. Use in risk-averse domains where auto-revised specs require human sign-off before downstream work.

## Prerequisites

Before starting, verify all conditions. If any fails, stop and tell the user what to fix.

1. **Context Index exists.** `.context-index/` must be present with `constitution.md` and `manifest.yaml`.
2. **Spec provided or discoverable.** At least one spec must be specified via `--spec` or discoverable via `--charter` or `--milestone`.
3. **Valid arguments.** If `--spec` is provided, the file must exist. If `--charter` (or `--module`) is provided, the module name must be a non-empty string and `.context-index/specs/features/<module>/` must be a directory. If `--milestone` is provided, the milestone name must be a non-empty string.

4. **Read build config.** Resolve `build.max_retries` from `user-config` (local `.context-index/user-config` → global `<PLUGIN_ROOT>/user-config` → default `0`). Use `parseUserConfig()` from `lib/persona.mjs` to read both config files. Look for the key `build.max_retries`. Clamp to range 0-3 with a warning if out of range.

5. **Read review-retry config.** Resolve `build.max_review_retries` from `manifest.yaml::build.max_review_retries` (default 2 per `lib/manifest.mjs` Task 12 of review-block-auto-retry). Set to `0` to disable the BLOCK→revise auto-retry loop entirely (sidecar+fail-loud on the first BLOCK — the legacy 7e333fd behavior). Negative values are rejected at manifest load with `INVALID_MAX_REVIEW_RETRIES`. The CLI flag `--require-human-final-pass` orthogonally requires operator sign-off when the loop converges on PASS — see the BLOCK→revise auto-retry loop documentation in Step 1 below.

If `.context-index/` does not exist, tell the user:

> This project has not been initialized with the Agentic Development Framework. Run `/adev:init` first to set up the context index, then come back to build.

## Pipeline Modes

**Implement Pipeline** (default, no `--full`): `plan → route → implement → validate`

Use when the spec already exists with a valid `.review.md` (PASS or PASS_WITH_NOTES verdict). Skips specify and review. If no `.review.md` is found, the skill warns and stops. Includes the validate→implement retry loop if `build.max_retries > 0`.

**Full Pipeline** (`--full`): `specify → review (BLOCK → /adev:specify --revise loop, up to build.max_review_retries cycles) → plan → route → implement → validate`

Use when starting from scratch or when the spec needs authoring. Step 0 dispatches `/adev:specify` only when no spec file exists AND the lifecycle log has no completed `specify` event for this spec; otherwise Step 0 is recorded as `skipped` (the prior session's spec work is authoritative — `review-specs` and downstream gates catch any drift). Step 1 runs `/adev:review-specs`; on BLOCK with `build.max_review_retries > 0`, the build dispatches the BLOCK→revise auto-retry loop documented under "Blocker handling" below — `/adev:specify --revise <spec>` re-authors the spec, `/adev:review-specs` re-evaluates, and the convergence detector (`lib/loop-convergence.mjs`) decides PASS / CONTINUE / NO_PROGRESS / REGRESSED / BUDGET_EXHAUSTED. With `--require-human-final-pass`, a PASS verdict halts the build at `PASS_PENDING_HUMAN` for operator acknowledgement. Includes the validate→implement retry loop if `build.max_retries > 0`.

**Model:** The build orchestrator pins `claude-sonnet-4-6` via the skill's frontmatter `model:` field. The orchestrator's work is mechanical (gate-check, dispatch, record), and the 2026-05-16 validation-charter retro found Opus on the orchestrator was ~5× the Sonnet cost on cache reads — the dominant cost class. Per-step worker skills still resolve their own tier from `platform-context.yaml:model_tiers` (see `.context-index/specs/cross-cutting/model-routing.spec.md`). This is a temporary hardcode; the config-driven binding via `/adev:sync` is tracked by issue-538.

---

## Repo-Mode-Inside-Workspace Advisory

**Repo-Mode-Inside-Workspace Advisory:** When the skill is invoked inside a registered repo (`detectWorkspace(cwd)` non-null AND `currentRepoSlug` is set), behaviour is repo-scoped (existing single-repo flow). Additionally, print this one-line advisory to **stdout** (same channel as existing skill messages — NOT stderr, logs, or hook channels), **exactly once per invocation**:

```
(Advisory: running repo-scoped inside workspace '<name>'. For
workspace-level building, cd to <workspace-root> and re-run.)
```

The advisory does not block; it does not appear when `detectWorkspace` returns `null`.

---

## Delegation Protocol

**This is the most important section of this skill.**

The build orchestrator is a coordinator. It decides *which* skill to run next, checks skip/stop conditions on artifacts, persists build state, and reports progress. It does NOT perform review, planning, routing, implementation, or validation itself — not even partially.

### Subagent Dispatch Model

**Every pipeline step MUST be dispatched as a fresh subagent using the Agent tool.** Each subagent gets a clean context with no prior knowledge of the build pipeline, and its prompt instructs it to invoke the target skill via the Skill tool. This provides two guarantees:

1. **No pseudo-invocation.** A fresh subagent has no "knowledge" of what the child skill does. It must load the full SKILL.md via the Skill tool to execute it. It cannot summarize or shortcut.
2. **Context isolation.** Each pipeline step runs in its own context. A 200K-token implement step does not pollute the orchestrator's context. The orchestrator only sees the result summary.

### Dispatch Optimism (Tool Availability)

**Dispatch optimistically. Do not introspect tool availability before calling Agent.** The harness is the only authority on whether a tool exists — call `Agent(...)` and let it return either a result or a harness-level rejection. There is no other valid signal of unavailability.

In particular:

- **`Agent` is the only dispatcher** in this CLI. The name `Task` appears in some Anthropic SDK docs but is NOT a tool name in Claude Code — there is no `Task` tool to look for. Searching for "Task" will always return nothing and is meaningless.
- **`Agent` is eagerly loaded, not deferred.** It is declared in the top-level `<functions>` block of every orchestrator session, not in the deferred-tools list and not via ToolSearch. Its absence from the deferred-tools list is NOT evidence of unavailability — it is the expected state.
- **ToolSearch only enumerates deferred tools.** Running `ToolSearch` with query `select:Agent` or keyword `agent` will correctly return zero matches even when Agent is available, because Agent is not deferred. Do not interpret an empty ToolSearch result as proof of absence.
- **The harness is the only authority.** If — and only if — an attempted `Agent({...})` call returns a harness-level error indicating the tool does not exist, may the orchestrator record the step as FAILED with an unavailability reason. You must attempt the Agent call before recording any such failure. Self-aborting at the prose level (i.e., refusing to dispatch because you "couldn't find Agent in the tool list") is a build bug, not a safe fallback.

### Context Packet Assembly

The Agent tool only accepts a `prompt` string — there are no env vars, JSON params, or other channels. All context the subagent needs must be serialized into the prompt. The orchestrator assembles a **context packet** per step with two sections: **pipeline context** (common to all steps) and **step context** (specific to each step).

#### Pipeline Context (included in every step's prompt)

The orchestrator reads these once at build start and includes them in every subagent prompt:

```
PIPELINE_CONTEXT:
  spec_path: <absolute path to the spec being built>
  spec_title: <first heading from the spec>
  milestone: <milestone name if --milestone, otherwise null>
  pipeline_position: "Step <N> of 5 (<step-name>)"
  workspace:
    detected: true | false
    name: <workspace name if detected>
    repo_slug: <current repo slug if inside a repo, otherwise null>
    root: <workspace root path if detected>
  issue_board:
    configured: true | false
    backend: <tasks.backend value from manifest, e.g., "file">
    epic_id: <epic ID for this spec's plan, if known>
  pipeline_mode: "full" | "implement"   # "full" when --full is set, "implement" otherwise
  auto: true | false                    # true when --auto is set — subagents must not prompt the user
```

**Read these files in a single turn using parallel tool calls:**
- The spec file (path and title)
- `manifest.yaml` (for `tasks.backend`)
- Workspace detection result (one-time call to `detectWorkspace(cwd)`)
- Issue board state (if configured, look up epic for this spec)

#### Step Context (varies per step)

Each step adds its own section to the prompt. The orchestrator assembles this from **artifacts on disk** (files produced by prior steps), not from memory of what prior subagents reported. This is critical — if the build was resumed, prior steps may have run in a different session.

| Step | Step Context |
|------|-------------|
| **Review** | (none — review is the first step) |
| **Plan** | `review_verdict`: PASS or PASS_WITH_NOTES (read from `.review.md`). `review_notes`: any notes from the review (brief summary, not full report) |
| **Route** | `plan_path`: absolute path to the `.plan.md` file. `task_count`: number of tasks in the plan (parsed from plan file) |
| **Implement** | `plan_path`: absolute path to the `.plan.md` file. `route_annotations`: if a route output file exists, include the routing summary (which tasks are auto/assisted/human). `review_notes`: brief review notes (so implement can consider reviewer concerns) |
| **Validate** | `plan_path`: absolute path to the `.plan.md` file. `implement_summary`: brief note on what was implemented (read from build state's Step 4 notes, or "full plan executed" if no notes). `source_manifest_stamped`: true/false (check spec frontmatter for `source-manifest` block) |

#### Reading Step Context from Disk

The orchestrator reads step context from **artifact files**, not from prior subagent results:

- **Review verdict/notes:** Read the `.review.md` file adjacent to the spec. Parse the verdict line and any notes section.
- **Plan path/task count:** Glob for `.plan.md` adjacent to the spec. Parse task headers (lines matching `### Task N:`) to count tasks.
- **Route annotations:** If `/adev:route` produced output (check build state), read the route annotations from the plan file's frontmatter or inline annotations.
- **Source manifest:** Read the spec's YAML frontmatter for a `source-manifest` block.

This "read from disk" rule ensures correctness across resumed builds and avoids stale in-memory state.

### Subagent Prompt Template

Every pipeline step uses this prompt structure when dispatching via the Agent tool:

```
You are executing one step of a build pipeline.

PIPELINE_CONTEXT:
  spec_path: ...
  spec_title: ...
  milestone: ...
  pipeline_position: ...
  workspace: ...
  issue_board: ...

STEP_CONTEXT:
  <step-specific fields as defined above>

---

Your ONLY task: invoke the skill `/adev:<skill-name>` with args `<args>`
using the Skill tool. Let it run to full completion — including all
post-steps (source manifests, commit trailers, DoD checks, etc.).
Then report the result.

{{IF --verbose is NOT set:}}
Execute silently — no intermediate narration. Chain all steps without
commentary. Use parallel tool calls for multi-file reads.
{{IF --verbose IS set, include instead:}}
VERBOSE: true

{{IF --auto IS set, include:}}
AUTO: true
Do NOT prompt the user for any input. Make autonomous decisions:
accept defaults, skip confirmations, choose the most conservative
option when ambiguous. If you encounter a situation that would
normally require user input and no safe default exists, report
FAILED with the details rather than blocking on input.

Do NOT attempt to perform the skill's work yourself. You MUST use the
Skill tool to load and execute the full skill. The skill contains
detailed multi-step protocols that you do not have access to without
loading it.

After the skill completes, report back with EXACTLY this format:

STEP_RESULT:
  status: COMPLETED | FAILED | BLOCKED
  verdict: <skill-specific outcome, e.g., PASS, BLOCK, constitution-violation>
  artifacts: <list of files created or modified by the skill>
  summary: <1-3 sentence summary of what happened>
  error: <if FAILED, the failure details including any tier/command/severity context>
```

### What the Orchestrator Does Directly

The ONLY work the build orchestrator performs itself (not via subagent):

- **Uses** `lib/build-state.mjs` helper (`readBuildState`, `createBuildState`, `recordStepResult`, `getNextStep`) for all build-orchestrator resume state — never writes the helper's underlying storage manually. The helper owns its on-disk shape; the skill talks to the helper, not to the filesystem.
- **Uses** `lib/lifecycle-state.mjs` (`currentState`, `requireGate`, `reportStep`) to gate between chained sub-skills and to emit step-level lifecycle events that downstream skills consume.
- **Reads** spec frontmatter for `milestone` field (milestone discovery) and `source-manifest` (validate step context)
- **Reads** `state.steps.review.notes` and `state.steps.review.verdict` from the lifecycle projection for review skip conditions / context (replaces parsing `.review.md` directly)
- **Reads** `.plan.md` files for skip conditions and to extract task count for step context
- **Reads** `governance/gates.yaml` for dry-run gate display only
- **Reads** `manifest.yaml` for `tasks.backend` (issue board configuration) via `loadManifest`
- **Reads** `user-config` files (local and global) via `parseUserConfig()` for `build.max_retries` (retry policy)
- **Calls** `detectWorkspace(cwd)` once at build start for workspace context
- **Writes** build-orchestrator resume state via `recordStepResult()` (atomic writes with validation, owned by the helper)
- **Emits** `reportStep` events to the lifecycle log at each sub-skill entry/exit so downstream `requireGate` calls see the latest state
- **Prints** progress headers and the final summary

Everything else — reading source code, running tests, dispatching implementation subagents, checking spec compliance, writing reports — happens inside the subagent's context.

---

## One-Step-Per-Invocation Dispatch

The build orchestrator executes **exactly one pipeline step per turn**, then yields control. This is the primary structural mechanism preventing the agent from skipping steps or inlining work due to accumulated context.

### Dispatch Loop (the only thing the orchestrator does)

On every invocation (whether fresh `--spec` or `--resume`), the orchestrator performs this dispatch loop exactly once:

1. **Read build state BEFORE taking any action.** Read or create state via `adev build-state`:

   ```bash
   # Returns { state, next }. If the read returns null, follow with `create`.
   adev build-state next --spec <SPEC_PATH>
   # If state is null and a fresh pipeline is needed:
   adev build-state create --spec <SPEC_PATH> [--milestone <PHASE>] [--full]
   adev build-state next --spec <SPEC_PATH>
   ```

   Where `<SPEC_PATH>` is the spec path, `<PHASE>` is the milestone name (omit when null), and `--full` is added when `--full` is set. The build state file is the single source of truth for pipeline position — not in-context memory, not the conversation history, not prior subagent results.

2. **Determine next step.** Use the `next` field from step 1's output. If `next` is `null`, all steps are done — print the final summary and exit. Otherwise, evaluate the step's skip conditions against disk artifacts. If skip conditions are met, record a skip and re-read:

   ```bash
   adev build-state record --spec <SPEC_PATH> --step <STEP_NAME> --status skipped
   adev build-state next   --spec <SPEC_PATH>
   ```

   Repeat skip evaluation until a non-skipped step is found or all steps are done. Dispatch at most ONE non-skipped step.

3. **Partial Artifact Detection (incremental-artifact-writes.spec.md, Behavior 5).** Before dispatching the subagent for the determined step, check whether a `.partial` file exists for that step's output artifact. Run:

   ```bash
   adev partial detect --root .context-index
   ```

   The verb returns JSON `{ partials: [...] }`. Filter to entries whose canonical path matches the step about to dispatch:

   - `specify` → `<spec-path>`
   - `plan` → `<spec-path>` minus `.spec.md` plus `.plan.md`
   - `validate` → `<spec-path>` minus `.spec.md` plus `.validate.md`
   - `implement` → none (per Integration Point 2, implement uses per-task commits, not `.partial`)

   For each match, run `adev partial inspect --artifact <partial-path>` to fetch `{partial_exists, schema_marker, schema_allowed, lock_exists}`. Decision matrix:

   - **`--auto` mode AND `schema_allowed` is true:** resume — pass the partial as additional context to the dispatching subagent.
   - **`--auto` mode AND `schema_allowed` is false (missing/mismatched marker):** discard with a logged warning and start fresh: `adev partial discard --artifact <partial-path> --spec <spec-path>`. Never silently overwrite.
   - **Interactive mode:** prompt the user — **resume / discard / abort**. Resume re-dispatches with the partial as context; discard runs the CLI discard call; abort stops the build for manual inspection.
   - **`lock_exists` is true with a live owner:** another invocation is in flight. Abort the build with a clear message naming the pid and lock file. The user can re-run after the prior invocation completes.

   If no `.partial` exists for the step, proceed normally.

4. **Dispatch ONE subagent.** Dispatch exactly one subagent via the Agent tool for the determined step. Wait for its STEP_RESULT.

5. **Record result. (MANDATORY — this step uses a programmatic helper to prevent skipping.)**

   After the subagent returns its STEP_RESULT, **immediately** run this CLI call to persist the result. Do NOT print anything to the user, do NOT summarize, do NOT respond — run this call FIRST:

   ```bash
   adev build-state record --spec <SPEC_PATH> --step <STEP_NAME> \
     --status <completed|failed> \
     --verdict <VERDICT> \
     [--error <ERROR>] [--notes <SUMMARY>]
   adev build-state next --spec <SPEC_PATH>
   ```

   This is MANDATORY even if the subagent reported ALREADY_COMPLETE or similar — any COMPLETED status means the step succeeded. The helper atomically writes the state file and recalculates build status.

6. **Cost ticker between steps (cost-ticker.spec.md Behaviors 8 + 9).** After the just-completed step in `{review, plan, route, implement, validate}` has been recorded in step 5 and **before** dispatching the next step, invoke the cost ticker:

   ```bash
   # Interactive mode (default — ticker prints to stderr for visibility):
   ADEV_BUILD_TICKER=1 adev cost summary --spec <SPEC_PATH> --include-checkpoints

   # --auto mode (suppress informational output; cost-warn lines still surface on stderr):
   ADEV_BUILD_TICKER=1 adev cost summary --spec <SPEC_PATH> --include-checkpoints --quiet
   ```

   The ticker is informational. A non-zero exit from the verb does NOT block the build — record the ticker invocation outcome in build state if useful and continue to the next step.

   **Per-build cost-warn dedup (SA-1 resolution from review).** The verb itself does NOT dedup `[cost warn]` lines across invocations. The orchestrator owns the dedup contract: after the first `[cost warn]` line is observed for a `(spec, threshold)` pair, set a `cost_warn_emitted` boolean for the spec in `build-state.json` (or an equivalent in-memory marker for the duration of the build). Subsequent ticker invocations for the same spec suppress the `[cost warn]` line — pipe the verb's stderr through a filter that drops `[cost warn] spec cost` lines when the flag is true, or run the verb without redisplaying the warn line. The flag resets at the start of each new build.

   Skip this section entirely for the `specify` step (cost ticker scopes to `{review, plan, route, implement, validate}` only).

7. **Re-invoke or stop. (CRITICAL — do NOT skip this step.)**
   - If `next` from step 5 is non-null AND no stop condition is met: print a one-line progress report (`"Step N (<name>) completed — <verdict>. Next: Step N+1 (<name>)."`) and **immediately** re-invoke `/adev:build --resume --spec <path>` via the Skill tool. The re-invocation starts a fresh turn with a clean context — it has no memory of the current turn. **Ending your response without re-invoking is a build failure.**
   - If `next` is null or `buildStatus` is `"completed"` or `"failed"`: do NOT re-invoke. Print the final summary and exit without re-invocation.

### Why One Step Per Turn

This model prevents the "finish the work" failure mode where accumulated context causes the agent to skip lifecycle steps. By executing one step per turn and re-invoking with a fresh context, the orchestrator never accumulates enough context to feel compelled to shortcut. Each turn has a single, narrow task: read state, determine next step, dispatch one subagent, record result.

### Verbose Mode

When `--verbose` is set, the orchestrator prints its reasoning before each dispatch: which step was selected, why it was not skipped, what context packet was assembled. This is diagnostic output only — `--verbose` does not change the one-step-per-turn behavior. The orchestrator still dispatches exactly one step and re-invokes.

---

## Build Pipeline

The orchestrator executes exactly one of these steps per invocation. After dispatch and state persistence, it re-invokes itself for the next step. See One-Step-Per-Invocation Dispatch above.

The pipeline executes 5 steps per spec, in strict order. For each step, the orchestrator: (1) checks the skip condition on artifacts, (2) calls `requireGate(state, "<prior-step>", { mode })` to enforce that the prior step actually passed, (3) dispatches a subagent via the Agent tool if not skipped, (4) reads the subagent's result, (5) checks the stop condition, and (6) persists build state.

### Gate Between Sub-Skill Dispatches

Before dispatching ANY sub-skill, run the lifecycle gate. The lib contract for `requireGate(state, stepName, ...)` is **pass the step about to begin** — the lib resolves its prior internally and asserts that prior is completed with a passing verdict.

```javascript
import { currentState, requireGate, resolveGateMode, reportStep } from '<ADEV_ROOT>/lib/lifecycle-state.mjs';
import { loadManifest } from '<ADEV_ROOT>/lib/manifest.mjs';

const state = currentState(projectRoot, specPath);
const mode = resolveGateMode(loadManifest(projectRoot));

// Per-step gate calls (pass the step ABOUT TO BEGIN; the lib resolves
// its prior internally and checks that prior is completed/passing):
//   before review    → requireGate(state, "review",    { mode })  // checks specify
//   before plan      → requireGate(state, "plan",      { mode })  // checks review
//   before route     → requireGate(state, "route",     { mode })  // checks plan
//   before implement → requireGate(state, "implement", { mode })  // skips optional route → checks plan
//   before validate  → requireGate(state, "validate",  { mode })  // checks implement
requireGate(state, "<step-about-to-begin>", { mode });

// Then emit the lifecycle entry event before invoking the sub-skill:
reportStep(projectRoot, specPath, { step: "<step>", status: "started" });
```

In strict mode (default), `requireGate` throws `GateError` if the resolved prior step is incomplete — the orchestrator stops and surfaces the message unchanged. In advisory mode, it warns and continues. Do NOT catch `GateError`. The `route` step is in `OPTIONAL_GATE_STEPS`, so `priorStepOf("implement")` walks past `route` and returns `"plan"` — implement does NOT require route to have run.

Emit a matching `reportStep` exit (`status: "completed"`) immediately after the sub-skill returns and BEFORE the `recordStepResult()` call, so the next turn's `currentState` reads the most recent step status.

### Step 0: Specify (Full Pipeline only)

**Skip conditions:**
- `--full` NOT set → skip unconditionally (Implement Pipeline does not run specify).
- `.review.md` exists adjacent to the spec with PASS or PASS_WITH_NOTES verdict and is not stale → skip (spec already reviewed). Record as `skipped` in build state.
- `currentState(projectRoot, specPath).steps.specify.status === "completed"` AND that step's `verdict` is `"PASS"` or `"PASS_WITH_NOTES"` → skip (lifecycle log shows specify already passed in a prior session — the spec on disk is authoritative). Record as `skipped` in build state. (Per issue-527: prior versions of this skill dispatched `/adev:specify --revise` here, but `--revise` is not a flag on `/adev:specify`; reading the lifecycle log is the spec-compliant skip evidence.)
- Spec file exists on disk → skip. Record as `skipped`. Review will catch any drift between spec and code.

**Dispatch (when not skipped):**
- Spec file does NOT exist AND no completed specify event in lifecycle log → dispatch `/adev:specify --spec <path>` in creation mode.

```
Agent({
  description: "Build Step 0: Specify <spec-name>",
  prompt: <subagent prompt template with skill="adev:specify" args="--spec <path>">
})
```

**After subagent returns:** Run the `recordStepResult()` call from Dispatch Loop step 4 with `stepName="specify"`. Then follow Dispatch Loop step 5 (re-invoke or stop). Do NOT stop here.

---

### Step 1: Review

**Skip condition (checked by orchestrator before dispatch):** A `.review.md` file exists adjacent to the spec, contains a PASS or PASS_WITH_NOTES verdict, and is not stale (its modification date is equal to or newer than the spec's modification date). If skipped, record step as `skipped` in build state.

**Implement Pipeline guard:** When `--full` is NOT set and the spec file exists but no adjacent `.review.md` is found (or the review is stale/BLOCK):
> Warning: No `.review.md` found for `<spec>`. Run `/adev:review-specs --spec <path>` first, or use `--full` to include review in the build.

Stop the build. Do not proceed to plan.

**Subagent dispatch:**

```
Agent({
  description: "Build Step 1: Review <spec-name>",
  prompt: <subagent prompt template with skill="adev:review-specs" args="--spec <path>">
})
```

**After subagent returns:**
- If verdict is BLOCK: see Blocker-Fix Loop below.
- If verdict is PASS or PASS_WITH_NOTES: run the `recordStepResult()` call from Dispatch Loop step 4 with `stepName="review"`. Then follow Dispatch Loop step 5 (re-invoke or stop). Do NOT stop here.

**Blocker handling (Full Pipeline — BLOCK→revise auto-retry loop):**

When review returns BLOCK and `--full` is set, the build dispatches the auto-retry loop reinstated by the `review-block-auto-retry` cross-cutting spec.

**Loop precondition:** `build.max_review_retries > 0` (default 2 per `lib/manifest.mjs` Task 12 of review-block-auto-retry; explicit `0` disables the loop and the build falls through to the sidecar+fail-loud path below). The loop also runs when `--auto` is passed regardless of the manifest value (subject to the same default).

**Loop steps for each revision N:**

1. **Read the latest review verdict** from `currentState(spec).steps.review.byRevision[N]` (the per-revision projection from Task 3 of review-block-auto-retry).
2. **Read `<spec-stem>.review.md` + `<spec-stem>.blockers.md`** — the canonical sidecars written by `/adev:review-specs` Step 6b-bis. The `.blockers.md` writer keys entries by canonical `blocker_id` (Task 5).
3. **Detect legacy reviewer output:** if any BLOCK finding in `.review.md` is missing the `blocker_id` field (pre-Task-6 reviewer), the loop falls through to the sidecar+fail-loud path below. Log `LEGACY_REVIEWER_OUTPUT`. Do NOT auto-retry — the loop requires canonical IDs to detect convergence.
4. **Dispatch `/adev:specify --revise <spec>`** via the CLI verb:

   ```bash
   adev specify revise --spec <spec-path> --auto
   ```

   The verb (Task 9 — `lib/cli/specify.mjs`) produces revision N+1 as a targeted patch, emits a `spec_revised` lifecycle event, clears `.blockers.md`, and exits 0 on success. On `SPEC_NOT_BLOCKED` (exit 2) the build is misaligned with the spec status — abort the loop and fall through to sidecar+fail-loud. On any other non-zero exit, abort the loop.

5. **Re-run `/adev:review-specs --spec <spec>`** against the new revision N+1. The reviewers emit canonical `blocker_id`s (Task 6); `/adev:review-specs` writes a fresh `.review.md` + (if BLOCK) a fresh `.blockers.md`. Lifecycle events for this iteration carry `revision: N+1` (Behavior 4 of review-block-auto-retry).

6. **Apply the convergence detector** (`lib/loop-convergence.mjs` from Task 11):

   ```text
   partition = partitionBlockers(prev_blockers, curr_blockers)
   verdict   = evaluateStopCondition({
     addressed: partition.addressed,
     persistent: partition.persistent,
     new_: partition.new_,
     prev_blockers,
     retries_remaining,
     verdict: <latest review verdict>,
     human_final_pass: <--require-human-final-pass flag>,
   })
   ```

7. **Act on the verdict:**

   | Verdict | Action |
   |---------|--------|
   | `PASS` | Loop succeeds. Record the review step as `completed` with `verdict: PASS`. Proceed to the next pipeline step (Plan). |
   | `PASS_PENDING_HUMAN` | The `--require-human-final-pass` flag is on AND review converged on PASS at rev N+1. Emit a `human_approval_required` lifecycle event via `reportHumanApprovalRequired`. Halt the build with exit code non-zero and the message: "Review converged on PASS at revision N+1. Run `/adev:build --resume --spec <spec>` to acknowledge and continue." |
   | `NO_PROGRESS` | `addressed == ∅ AND new_ == ∅ AND persistent == prev_blockers` — the LLM produced the identical blocker set. Stop with `LOOP_NO_PROGRESS`. Write the sidecar+fail-loud artifacts. Halt the build with exit non-zero. |
   | `REGRESSED` | `\|new_\| > \|addressed\|` — the revise introduced more blockers than it resolved. Stop with `LOOP_REGRESSED`. Preserve rev N+1 (no rollback). Write sidecar+fail-loud. Halt the build with exit non-zero. The operator decides whether to revert. |
   | `BUDGET_EXHAUSTED` | `retries_remaining === 0 AND verdict !== PASS`. Stop with `LOOP_BUDGET_EXHAUSTED`. Write sidecar+fail-loud. Halt the build with exit non-zero. |
   | `CONTINUE` | Progress was made (or first revision); retries remain. Decrement `retries_remaining` and loop back to step 4. |

**The `--require-human-final-pass` flag** is a hybrid-mode gate: when passed, even a PASS verdict from the loop halts the build at `PASS_PENDING_HUMAN` so a human operator approves the final spec revision before plan/implement runs. Operators in risk-averse domains use this gate to retain final say on auto-revised specs.

**Sidecar+fail-loud fallback** (legacy reviewer output OR loop terminal verdicts NO_PROGRESS / REGRESSED / BUDGET_EXHAUSTED):

1. Ensure `<spec-stem>.review.md` exists (already written by `/adev:review-specs`).
2. Ensure `<spec-stem>.blockers.md` reflects the current blocker set (written by the canonical writer in `lib/blockers-writer.mjs`).
3. Record the review step as `failed` in build state with the relevant terminal verdict (`LOOP_NO_PROGRESS` / `LOOP_REGRESSED` / `LOOP_BUDGET_EXHAUSTED` / `LEGACY_REVIEWER_OUTPUT`).
4. Halt the build with a clear next-action message naming the spec, the terminal verdict, and the operator's recovery options (manual edit + `/adev:review-specs` re-run, or `/adev:build --resume` after manual fix).

When `--full` is NOT set: review BLOCK stops the build immediately (no auto-retry, no sidecar write — the Implement Pipeline assumes a pre-existing PASS review).

### Step 2: Plan

**Skip condition (checked by orchestrator before dispatch):** A `.plan.md` file exists adjacent to the spec. If skipped, record step as `skipped` in build state.

**Subagent dispatch:**

```
Agent({
  description: "Build Step 2: Plan <spec-name>",
  prompt: <subagent prompt template with skill="adev:plan" args="--spec <path>">
})
```

**After subagent returns:**
- If verdict is constitution-violation: run `recordStepResult()` with `status: "failed"` and the violation details. Stop the build for this spec.
- Otherwise: run the `recordStepResult()` call from Dispatch Loop step 4 with `stepName="plan"`. Then follow Dispatch Loop step 5 (re-invoke or stop). Do NOT stop here.

### Step 3: Route

**Skip condition (checked by orchestrator before dispatch):** The `--no-route` flag is set. Mark step as `skipped` in build state.

**Subagent dispatch:**

```
Agent({
  description: "Build Step 3: Route <spec-name>",
  prompt: <subagent prompt template with skill="adev:route" args="--plan <plan-path>">
})
```

**After subagent returns:**
- Route annotations are advisory. This step does not produce a pass/fail verdict. If the subagent reports FAILED or the skill is unavailable, log a warning and continue.
- Run the `recordStepResult()` call from Dispatch Loop step 4 with `stepName="route"` (use `status: "completed"` or `status: "skipped"` on error). Then follow Dispatch Loop step 5 (re-invoke or stop). Do NOT stop here.

### Step 4: Implement

When `--no-infra` is passed to build, set `ADEV_NO_INFRA=1` in the environment for implement and validate invocations. Each sub-skill runs its own preflight independently — build does not add a separate preflight step.

**Skip condition:** None. Implementation always runs unless the build was resumed past this step.

**Subagent dispatch:**

```
Agent({
  description: "Build Step 4: Implement <spec-name>",
  prompt: <subagent prompt template with skill="adev:implement" args="<plan-path>">
})
```

This is the longest-running step. The implement skill manages TDD loops, specialist routing, subagent dispatch, 2-stage review, visual verification, integration gates, source manifest stamping, commit trailers, and feature completeness DoD — all within the subagent's isolated context.

**After subagent returns:**
- If verdict indicates quality gate or integration gate failure: run `recordStepResult()` with `status: "failed"` and the failure details (including tier-specific context: tier name, failing command, severity). Report the failures to the user and stop the build for this spec.
- Otherwise: run the `recordStepResult()` call from Dispatch Loop step 4 with `stepName="implement"`. Then follow Dispatch Loop step 5 (re-invoke or stop). Do NOT stop here.

### Step 5: Validate

**Skip condition:** None. Validation always runs as the final step.

**Subagent dispatch:**

```
Agent({
  description: "Build Step 5: Validate <spec-name>",
  prompt: <subagent prompt template with skill="adev:validate" args="--spec <path> --plan <plan-path>">
})
```

The validate skill runs its full 13-check suite within the subagent's isolated context.

**After subagent returns:**
- **PASS:** All checks passed. Record in build state.
- **PASS_WITH_WARNINGS:** Error-severity checks passed but warning-severity checks failed. Build state records the warnings but does NOT treat the result as a build failure.
- **FAIL:** An error-severity check failed. If `build.max_retries` from user-config is > 0 and retry budget remains, enter the Validate→Implement Retry Loop (see below). Otherwise, record FAIL in build state. Validation FAIL does NOT retroactively block the build — the implementation is already done. Validation is informational.
- Record step as `completed` (with PASS/PASS_WITH_WARNINGS/FAIL noted) in build state.

### Validate→Implement Retry Loop

**Configuration:** Resolve `build.max_retries` from `user-config` files (local `.context-index/user-config` → global `<PLUGIN_ROOT>/user-config` → default `0`). Uses the same `parseUserConfig()` from `lib/persona.mjs` that resolves persona. Default is `0` (disabled — fail-fast behavior). Maximum allowed value is `3`. Values above 3 are clamped to 3 with a warning.

Example `user-config` entry:
```
build.max_retries=2
```

When validate returns FAIL and retry budget remains (`current_retry < max_retries`):

#### 1. Extract Failure Context

Read the validation report written by the validate subagent (at `.context-index/specs/features/<module>/<spec-slug>.validate.md`). Extract:

- Which checks failed (check number, name, severity)
- Specific failure details (file:line references, acceptance criteria IDs, error messages)
- Which checks passed (so the retry doesn't regress them)

Assemble this into a `RETRY_CONTEXT` block:

```
RETRY_CONTEXT:
  retry_cycle: <N> of <max_retries>
  validation_report_path: <path to validation report>
  failed_checks:
    - check: "Check 2: Spec Compliance"
      failures:
        - criterion: "AC-3: Error messages include request ID"
          detail: "src/api/handler.mjs:45 — error response missing requestId field"
    - check: "Check 4: Constitution Compliance"
      failures:
        - principle: "Coding Standards — naming conventions"
          detail: "src/lib/helper.mjs:12 — function 'processData' uses camelCase but constitution requires snake_case for this module"
  passed_checks: [1, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13]
```

#### 2. Re-dispatch Implement (scoped)

Dispatch a new implement subagent with the standard context packet plus the `RETRY_CONTEXT`. The subagent prompt includes an additional directive:

```
IMPORTANT: This is a retry cycle. The previous implementation passed quality
gates but failed validation on specific checks. Your task is to fix ONLY the
validation failures listed in RETRY_CONTEXT. Do NOT re-implement the entire
plan. Do NOT modify code that passed validation. Scope your changes to the
minimum required to address each failed check.

After fixing, invoke `/adev:implement --task <N>` for each affected task,
or make targeted fixes and run the quality gates to verify no regressions.
```

The implement skill's internal logic handles the scoped re-implementation. The retry subagent gets the full implement SKILL.md via the Skill tool, so it follows all protocols (TDD, review, source manifest update).

#### 3. Re-dispatch Validate

After the implement retry subagent returns COMPLETED, dispatch a fresh validate subagent with the standard context packet plus:

```
RETRY_CONTEXT:
  retry_cycle: <N> of <max_retries>
  previous_failures: <list of checks that failed last cycle>
  expect_regression_check: true
```

The validate subagent runs the full 13-check suite. It does not skip previously-passed checks — regression detection requires a full run.

#### 4. Evaluate and Loop or Stop

- **PASS or PASS_WITH_WARNINGS:** Retry succeeded. Record in build state with `retry_cycles: N`.
- **FAIL with same failures:** No progress. Stop retrying regardless of budget. Record FAIL with note: "Retry cycle <N> made no progress — same checks still failing."
- **FAIL with different failures:** Progress was made but new issues appeared. If budget remains, loop back to step 1. If budget exhausted, record FAIL with full details.
- **FAIL with regression:** A previously-passing check now fails. Stop retrying immediately. Record FAIL with note: "Retry cycle <N> caused regression in Check <X>."

#### Build State for Retries

Retry cycles are recorded in build state under the validate step:

```json
{
  "name": "validate",
  "status": "completed",
  "timestamp": "...",
  "verdict": "PASS",
  "retry_cycles": 2,
  "retry_history": [
    { "cycle": 1, "verdict": "FAIL", "failed_checks": [2, 4] },
    { "cycle": 2, "verdict": "PASS" }
  ]
}
```

---

## Build State

Build-orchestrator resume state is persisted via `lib/build-state.mjs`. The helper owns the on-disk shape — derived per spec, where `<slug>` comes from the spec filename (lowercase, hyphenated, without extension). Treat the helper as the source of truth; do not interact with its underlying storage directly.

### Directory Creation

The helper creates its underlying storage directory on first write. Skill prose does not need to test for existence or create directories — call `createBuildState(projectRoot, specPath, ...)` and let the helper handle filesystem setup.

### State File Format

```json
{
  "spec": ".context-index/specs/features/<module>/<spec>.spec.md",
  "milestone": "<milestone-name or null>",
  "status": "in_progress",
  "steps": [
    {
      "name": "review",
      "status": "completed",
      "timestamp": "2026-04-05T10:00:00Z"
    },
    {
      "name": "plan",
      "status": "completed",
      "timestamp": "2026-04-05T10:05:00Z"
    },
    {
      "name": "route",
      "status": "skipped",
      "timestamp": "2026-04-05T10:05:01Z"
    },
    {
      "name": "implement",
      "status": "failed",
      "timestamp": "2026-04-05T10:15:00Z",
      "error": "Quality gate failure: 2 tests failing"
    }
  ],
  "started": "2026-04-05T10:00:00Z",
  "updated": "2026-04-05T10:15:00Z"
}
```

### Incremental Persistence

The build state is written **after each step completes** via `recordStepResult()` from `lib/build-state.mjs` (not just at the end). The helper handles atomic writes, timestamp generation, and build status recalculation automatically. This ensures that if the build is interrupted at any point, the recorded state reflects exactly which steps finished. Fields:

- `spec`: path to the spec being built
- `milestone`: milestone name (if invoked via `--milestone`) or `null`
- `status`: `in_progress` while running, `completed` when all steps finish successfully, `failed` if any step fails
- `steps`: array of step records, each with `name`, `status` (`completed`, `failed`, `skipped`), `timestamp` (ISO-8601), and optional `error` (string, only on failure). On tier-specific failures, the `error` field includes tier context: `"Integration gate failure: tier=integration, command='npm run test:integration', severity=error"`
- `started`: ISO-8601 timestamp of build start
- `updated`: ISO-8601 timestamp of last state write

Build status recalculation is handled automatically by `recordStepResult()`: when a step fails, `status` is set to `"failed"`; when all steps are completed or skipped, `status` is set to `"completed"`; otherwise it remains `"in_progress"`.

---

## Resume Mode

> **Conditional loading:** Read `skills/build/resume-mode.md` for the full Resume Mode instructions.

---

## Stale Build Detection

When `--resume` is invoked, or at the start of a new `--spec` build, query `lib/build-state.mjs` (via `readBuildState` and the helper's listing API) for zombie builds.

**Zombie build:** A state record where `status` is `in_progress` AND all recorded steps have `status: skipped`. This means the orchestrator ran, evaluated all skip conditions (lifecycle log shows `review` and `plan` complete, plan file present, etc.), skipped every step, and exited without doing real work.

**On `--resume`:** Report zombie builds found:
```
Found stale build: `<spec-slug>` (started: <date>, all steps skipped)
Resume with: `/adev:build --resume --spec <path> --from implement`
```

**On new `--spec` build:** If the slug matches an existing zombie build for the same slug, warn and ask:
```
A stale build exists for `<spec-slug>` (started: <date>, all steps skipped).
  - Resume it: /adev:build --resume --spec <path> --from implement
  - Overwrite it: continue (resets build state for this spec)

Proceed? (resume / overwrite)
```
Await user input. "overwrite" resets the build state and proceeds. "resume" applies `--from implement` resume logic. If the user dismisses without choosing, stop and let them decide.

**`--auto` behavior:** When `--auto` is set, skip the prompt and overwrite the stale build automatically. Log: "Auto mode: overwriting stale build for `<spec-slug>`."

---

## Charter Mode

> **Conditional loading:** Read `skills/build/charter-mode.md` for the full Charter Mode instructions.

---

## Milestone Mode

> **Conditional loading:** Read `skills/build/milestone-mode.md` for the full Milestone Mode instructions.

---

## Workspace-Mode Build (`--milestone` at Workspace Root)

> **Conditional loading:** Read `skills/build/workspace-mode.md` for the full Workspace-Mode Build instructions.

---

## Dry Run Mode

When `--dry-run` is specified, show the full pipeline plan without executing any skill, writing any file, or modifying any state.

### Dry Run with `--spec <path>`

Show:
1. The spec path and its current status.
2. Which pipeline steps would **execute** vs **skip** (based on existing `.review.md`, `.plan.md`, `--no-route` flag).
3. If a `.plan.md` exists, show the estimated task count from the plan.
4. If a build state file exists, note whether `--resume` would change the pipeline.
5. Flag any `completed_with_warnings` conditions -- specs that may need attention even after previously passing review.

### Dry Run with `--charter <module>`

Show:
1. All discovered specs under `.context-index/specs/features/<module>/` (with their frontmatter status).
2. Dependency order (from `depends-on` frontmatter or charter Capability Map order).
3. Per-spec step breakdown: which steps would execute vs skip.
4. Total estimated tasks across all specs (from existing plans).
5. Specs that would be skipped entirely (draft status, not ready for pipeline mode).

### Dry Run with `--milestone <name>` (Workspace Mode)

When `--dry-run` is combined with `--milestone` in workspace-mode (`detectWorkspace` non-null, `currentRepoSlug` null), show the cross-repo build plan:

```
Dry Run: Workspace Build for milestone '<name>'

  Repo order (topological):
    1. <repo-slug> (upstream — no dependencies)
    2. <repo-slug> (depends on: <upstream-slug>)
    ...

  Per-repo spec breakdown:
    <repo-slug>:
      - <spec-path>: Step 1 Review SKIP, Step 2 Plan EXECUTE, ...
    ...
```

### Dry Run with `--milestone <name>` (Single-Repo)

Show:
1. All discovered specs for the milestone (with their frontmatter status).
2. Dependency order (if applicable).
3. Per-spec step breakdown: which steps would execute vs skip.
4. Total estimated tasks across all specs (from existing plans).
5. Specs that would be skipped entirely (already completed, draft status).

### Output Format

**Persona adaptation:** The formats below are defaults for the Developer persona. If a different persona is active, adapt the chat summary to its output rules.

```
Dry Run: Build Pipeline for <spec or milestone>

  Spec: .context-index/specs/features/<module>/<spec>.spec.md
    Step 1: Review    — SKIP (review.md exists, current)
    Step 2: Plan      — SKIP (plan.md exists, 5 tasks)
    Step 3: Route     — EXECUTE
    Step 4: Implement — EXECUTE (5 tasks)
    Step 5: Validate  — EXECUTE

  Gates: fast (test, lint), integration (test), e2e (smoke, full)

  ⚠ completed_with_warnings: <spec> passed review with notes — verify notes are addressed.

  Retry policy: max_retries=<N> (from user-config)

  Estimated effort: 5 tasks across 3 active steps.
```

**Gate tier summary in dry-run:** Read `governance/gates.yaml` for display purposes only — show tier names and gate IDs grouped by tier (e.g., "Gates: fast (test, lint), integration (test), e2e (smoke)"). This is a display-only read, not gate resolution — the orchestrator does not apply severity defaults or tier ordering. If `governance/gates.yaml` does not exist or has no gates, show "Gates: none configured."

`--dry-run` is strictly read-only. It never invokes a skill, writes a file, or modifies build state.

---

## Single Spec Mode (`--spec`)

When `--spec <path>` is invoked without `--resume`, `--charter`, `--milestone`, or `--dry-run`:

1. Verify the spec file exists. If not, print: "Spec not found: `<path>`" and stop.
2. Create or reset the build state file for this spec.
3. If `tasks.backend` is configured, find the matching issue for this spec and mark it `in_progress`.
4. Execute the 5-step pipeline in order (see Build Pipeline above).
5. On completion, print the summary.

### Summary Output

```
Build complete.

  Spec: <path>
  Status: PASSED | FAILED at step <N> (<step-name>)
  Steps:
    1. Review    — completed | skipped | failed
    2. Plan      — completed | skipped | failed
    3. Route     — completed | skipped
    4. Implement — completed | failed
    5. Validate  — PASS | FAIL | PASS (after N retry cycles)
  Retry cycles: 0 | N of M (checks fixed: [...], regressions: [...])
```

---

## Error Cases

| Condition | Expected Behavior |
|-----------|-------------------|
| `.context-index/` missing | Print "Run `/adev:init` first" and stop |
| `--spec` file not found | Print "Spec not found: `<path>`" and stop |
| `--charter` module directory not found | Print "Module directory not found: `.context-index/specs/features/<module>/`" and stop |
| `--charter` finds no specs in module | Print "No specs found under `.context-index/specs/features/<module>/`" and stop |
| `--milestone` finds no matching specs | Print "No specs found for milestone `<name>`" and stop |
| `--resume` with no build state files | Print "No interrupted build found" and stop |
| Review returns BLOCK | Stop build for that spec, save state, report findings |
| Quality gates fail during implement | Stop build for that spec, save state, report failures |
| Validation returns FAIL (max_retries=0) | Report FAIL but mark build as completed (informational) |
| Validation returns FAIL (max_retries>0) | Enter retry loop: extract failures, re-implement scoped to failures, re-validate. Stop on budget exhaustion, no progress, or regression |
| Retry cycle causes regression | Stop retrying immediately, report regression. Do not exhaust remaining budget |
| Retry cycle makes no progress | Stop retrying, report same failures persisting |
| `build.max_retries` > 3 in user-config | Clamp to 3 with warning |
| `--from <step>` with invalid step name | Print "Invalid step: `<name>`. Valid steps: specify, review, plan, route, implement, validate" and stop |
| Circular dependencies in milestone mode | Print warning, proceed in discovery order |

---

## Key Principles

1. **Dispatch as subagent, never inline.** Every pipeline step MUST be dispatched as a fresh subagent via the Agent tool. The subagent invokes the child skill via the Skill tool. The orchestrator never performs review, planning, routing, implementation, or validation itself — not even partially. See the Delegation Protocol section.

2. **Fail fast, retry smart, resume gracefully.** When a step fails, stop immediately for that spec, save state, and report. Exception: when `build.max_retries` in user-config is > 0 and validate fails, the orchestrator can retry the implement→validate loop with scoped failure context. Retries stop on budget exhaustion, no progress, or regression. The user can always fix issues manually and `--resume` without re-running completed steps.

3. **Incremental state persistence.** Build state is saved after every step, not just at the end. An interrupted build (network failure, timeout, user abort) always has an accurate state file.

4. **Milestone independence.** In `--milestone` mode, specs are independent units. One spec's failure does not cascade to unrelated specs. Only explicit `depends-on` relationships create blocking dependencies.

5. **Dry run is sacred.** `--dry-run` is strictly read-only. It never invokes a skill, writes a file, or modifies state. It exists to give the user confidence before committing to a potentially long build.

6. **Pipeline order is fixed.** The 5-step order (review, plan, route, implement, validate) is invariant. Steps can be skipped based on conditions, but they are never reordered.

7. **Issue board is optional.** All issue board operations are guarded by `tasks.backend` in the manifest. If unconfigured, the build runs identically but without issue tracking.

8. **One step per turn.** The orchestrator dispatches exactly one pipeline step per invocation, persists state, and re-invokes itself for the next step. It never runs two or more steps in a single turn. This prevents context accumulation from causing step-skipping. See the One-Step-Per-Invocation Dispatch section.

---

## Red Flags

**Never:**
- Execute a pipeline step directly from the orchestrator's context — every step MUST go through a subagent via the Agent tool
- Call the Skill tool directly from the orchestrator for a pipeline step — the Skill tool is called by the subagent, not the orchestrator
- Read source code, run tests, dispatch implementation subagents, or write reports from the orchestrator — these happen inside the step subagent's isolated context
- Attempt to "summarize" what a child skill does and do it yourself — each skill has dozens of substeps you cannot see from this file
- Skip the Agent tool dispatch because "it's just a small step" — even the route step (the lightest) must be a subagent to maintain the isolation guarantee
- Inline implementation work (TDD, specialist routing, review) because it "seems simpler" — the subagent handles this when it loads `/adev:implement` via the Skill tool
- Inline validation checks because it "seems faster" — the subagent runs the full 13-check suite when it loads `/adev:validate` via the Skill tool
- Modify build state for a step before the subagent has returned its result
- Continue to the next step if the subagent has not fully completed and returned its STEP_RESULT
- Parse or act on intermediate output from the subagent — only the final STEP_RESULT matters for orchestration decisions
- Introspect tool availability before dispatching — never scan the loaded tool list, the deferred-tools list, or ToolSearch results looking for "Agent" (or "Task") and self-abort based on the result. Agent is eagerly loaded and not deferred, so it is correctly absent from the deferred-tools list; that absence is NOT evidence of unavailability. Dispatch optimistically — the harness is the only authority on tool availability.
- Record a step as FAILED with error `"Agent ... not available"` or `"Task ... not available"` without first attempting an actual `Agent({...})` call and observing the harness reject it. The orchestrator must attempt the Agent call before recording any tool-unavailability failure — prose-level self-abort is a build bug, not a safe fallback. Note: there is no `Task` tool in this CLI; Agent is the only dispatcher.

## API reference

Lifecycle event log (gating between sub-skills, step events, next-step discovery for resume):

- `currentState(projectRoot, specPath)` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — read the projection (`steps`, `currentStep`, `planTasks`, `interventions`).
- `requireGate(state, "<prior-step>", { mode })` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — hard-blocks (or warns) before dispatching each sub-skill.
- `resolveGateMode(loadManifest(projectRoot))` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — resolves `manifest.lifecycle.gate_mode` (`strict` default, or `advisory`).
- `reportStep(projectRoot, specPath, { step, status, verdict?, totals?, model_breakdown?, skipped_lines? })` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — emit step entry/exit so the next turn's `currentState` is fresh. Cost fields are optional and only included in `step_completed` events.
- `listLifecycleStates(projectRoot)` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — aggregate per-spec projections (used by milestone-mode and the no-args resume scan).

Build orchestrator resume cache:

- `readBuildState`, `createBuildState`, `recordStepResult`, `getNextStep` from `<ADEV_ROOT>/lib/build-state.mjs` — programmatic resume state. The helper owns its on-disk shape; skill prose does not manipulate its underlying storage directly.

Execution state (cross-session resume tracking):

- `readExecutionState`, `writeExecutionState`, `clearExecutionState` from `<ADEV_ROOT>/lib/execution-state.mjs` — `.context-index/.execution-state.json` for session-level resume.

Issue board (guarded by `tasks.backend` configuration):

- `getIssueManager(manifest)` from `<ADEV_ROOT>/lib/issues/registry.mjs` — returns the active adapter for epic-level work-item tracking.
- `IssueManagerInterface` — `init`, `create`, `update`, `close`, `list`, `get`, `listEpics`, `createEpic`, `updateEpic`, `addDependency`, `walkTree`.

Manifest:

- `loadManifest(projectRoot)` from `<ADEV_ROOT>/lib/manifest.mjs` — parses `.context-index/manifest.yaml`.
