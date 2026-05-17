# Live Spec: adev:build Orchestrator

<!-- Live Spec within the strategic-planning charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/strategic-planning/charter.md -->

---
charter: strategic-planning
status: implemented
risk_level: high
milestone: v2
revision: 7
charter-revision: 3
created: 2026-04-05
updated: 2026-05-05
source-manifest:
  sha: "83090b0"
  files:
    - skills/build/SKILL.md
    - skills/build/resume-mode.md
    - tests/skills/build-one-step-dispatch.test.mjs
    - tests/skills/build-full-pipeline.test.mjs
    - tests/skills/build-milestone-and-stale.test.mjs
  computed-at: "2026-05-05T00:00:00.000Z"
drift_detected: true
drift_source: skills/build/SKILL.md
drift_at: 2026-05-15T18:27:08.638Z
---

## Behavioral Contract

### Preconditions

- `.context-index/` exists with `constitution.md` and `manifest.yaml`
- At least one Live Spec exists (either specified via `--spec` or found via `--milestone` filter)

### Pipeline Modes

The build skill has two pipeline modes. The mode determines the starting point and auto-fix loops available.

**Full Pipeline** (`--full` flag): `specify → review (with blocker-fix loop) → plan → route → implement → validate (with retry loop)`

Use when starting from scratch or when the spec needs to be written or revised as part of the build. Includes an auto-fix loop that re-authors the spec when review returns BLOCK, then re-runs review.

**Implement Pipeline** (default, `--spec <path>`): `plan → route → implement → validate (with retry loop)`

Use when the spec is already written and reviewed. Assumes a valid `.review.md` with PASS verdict exists (or plan already exists). Skips specify and review. Includes the validate→implement retry loop if `build.max_retries > 0`.

Both modes support `--milestone <name>` to batch-build multiple specs. Route runs by default between plan and implement — use `--no-route` only to explicitly disable it.

### Behaviors

1. **When** `--spec <path>` is invoked without `--full` **then** the skill runs the Implement Pipeline: plan → route → implement → validate for that single spec
2. **When** `--spec <path> --full` is invoked **then** the skill runs the Full Pipeline: specify → review (with blocker-fix loop) → plan → route → implement → validate for that single spec
3. **When** `--milestone <name>` is invoked without `--full` **then** the skill discovers all specs with `milestone: <name>` in frontmatter, filters to those with status `review-passed`, `implemented`, or `validated`, and builds each in dependency order using the Implement Pipeline. Specs with any other status are skipped with a visible note: "Skipped <spec> (status: <status>): not ready for Implement Pipeline. Run /adev:review-specs or use --full."
3a. **When** `--milestone <name> --full` is invoked **then** the filter includes `review-pending` specs — the Full Pipeline runs specify and review for each before planning. Specs with status `review-blocked` are also included; the Full Pipeline re-specifies and re-reviews them, allowing auto-fix to resolve prior blockers
4. **When** a step fails (e.g., review returns BLOCK and blocker-fix budget is exhausted) **then** the build stops, reports the failure with context, and saves build state for resume
5. **When** `--resume` is invoked **then** the skill reads `.context-index/lifecycle-state/<slug>.json`, identifies the last successful step, and resumes from the next step. Scans for stale builds (see Stale Build Detection below) and surfaces them if found
5a. **When** `--resume --from <step>` is invoked **then** the skill overrides the automatic resume point and begins execution from the named step (e.g., `--from implement` skips plan and route, starting at implement). Valid step names: `specify`, `review`, `plan`, `route`, `implement`, `validate`. Invalid step name → print error and stop
6. **When** `--dry-run` is invoked **then** the skill shows what would happen at each phase (specs found, pipeline mode, steps to execute, estimated task counts, retry policy) without executing any skill
7. **When** a spec already has a plan (`.plan.md` exists) **then** the plan step is skipped
8. **When** a spec has already passed review (`.review.md` exists with PASS verdict, not stale) **then** both the specify step (Step 0) and the review step (Step 1) are skipped in Full Pipeline — the pipeline continues from plan
8a. **When** a spec file exists but has no `.review.md` **then** Full Pipeline Step 0 dispatches `/adev:specify` in `--revise` mode (not creation mode) to avoid clobbering an existing spec
9. **When** the pipeline reaches the route step **then** the orchestrator MUST dispatch the route subagent — this step MUST NOT be skipped, inlined, or treated as a no-op even if no specialists are registered in the manifest. Use `--no-route` to explicitly disable route for the current build
10. **When** building multiple specs via `--milestone` **then** each spec's build is independent — failure of one spec does not block others unless they have explicit dependencies
11. **When** each step completes **then** the build state file is updated with the completed step and timestamp
12. **When** the full build completes successfully **then** the build state file is marked `status: completed` and a summary is printed
13. **When** executing any pipeline step **then** the orchestrator MUST dispatch a fresh subagent via the Agent tool with a forked context. The subagent's prompt includes a context packet (pipeline context + step context) and instructs it to invoke the target skill via the Skill tool, run it to completion, and return a structured STEP_RESULT. The orchestrator never calls the Skill tool directly for pipeline steps — only subagents do
14. **When** assembling a subagent prompt **then** the orchestrator includes two context sections: (a) pipeline context — spec path, spec title, phase, pipeline mode, pipeline position, workspace state, issue board config; (b) step context — step-specific fields read from artifact files on disk (e.g., review verdict from `.review.md`, plan path from `.plan.md`, task count, route annotations). Step context is always read from disk, never from prior subagent results, to ensure correctness across resumed builds
15. **When** a subagent returns its STEP_RESULT **then** the orchestrator reads only the status, verdict, artifacts, summary, and error fields to make orchestration decisions (skip/stop/continue) and to persist in build state. The orchestrator does not parse or act on intermediate skill output
16. **When** the build skill is loaded **then** it runs in a forked context (`context: fork` in frontmatter) to isolate the entire build pipeline from the parent conversation. Each pipeline step is further isolated by running as a subagent within this fork
17. **When** review returns BLOCK in Full Pipeline mode **then** the orchestrator enters a specify→review blocker-fix loop: extracts the blocking issues from `.review.md`, dispatches a specify subagent with `--revise --blocker-context <findings>` to fix the spec, then re-dispatches review. The loop stops on: PASS verdict, budget exhaustion (`build.max_review_retries`, default 2), or no progress (same blockers reappear after revision)
18. **When** `build.max_review_retries` is 0 **then** review BLOCK stops the build immediately (no auto-fix). When absent, the default of 2 applies
19. **When** validate returns FAIL and `build.max_retries > 0` and retry budget remains **then** the orchestrator enters a validate→implement retry loop — see Appendix: Retry Policy
20. **When** `build.max_retries` is 0 or absent in user-config **then** validate FAIL is recorded and the build completes without retry (fail-fast default)
21. **When** resolving `build.max_retries` or `build.max_review_retries` **then** follow the same hierarchy as persona resolution: local `.context-index/user-config` → global `<PLUGIN_ROOT>/user-config` → default. Uses `parseUserConfig()` from `lib/persona.mjs`

### One-Step-Per-Invocation Dispatch Model

The build orchestrator executes **exactly one pipeline step per turn**, then yields control. This is the primary structural mechanism preventing the agent from skipping steps or inlining work.

22. **When** the orchestrator determines the next step to execute **then** it dispatches exactly ONE subagent for that step, records the result in build state, and STOPS. It does not proceed to the next step in the same turn. The next step is executed on the following orchestrator turn (via self-re-invocation or user-triggered resume).

23. **When** a subagent returns its STEP_RESULT and the build is not complete **then** the orchestrator writes updated build state, prints a one-line progress report (`"Step N (<name>) — <verdict>. Next: Step N+1 (<name>)."`), and re-invokes `/adev:build --resume --spec <path>` via the Skill tool to continue the pipeline in a fresh turn.

24. **When** the orchestrator re-invokes itself **then** the new invocation starts with a clean context (per `context: fork`), reads build state from disk, and determines the next incomplete step — it has no memory of prior turns. This creates a hard context boundary between steps.

25. **When** the orchestrator identifies that all steps are complete (or a stop condition is met) **then** it does NOT re-invoke. It prints the final summary and exits.

26. **When** the orchestrator loads **then** it MUST determine its current step by reading `.context-index/lifecycle-state/<slug>.json` BEFORE taking any action. The build state file is the single source of truth for pipeline position — not in-context memory, not the conversation history.

27. **When** the orchestrator's prompt is assembled **then** it contains ONLY the instructions for the dispatch loop (read state → determine next step → dispatch ONE subagent → record result → re-invoke or stop). It does NOT contain the full behavioral details of child skills. The orchestrator sees step names and dispatch instructions, never implementation details.

28. **When** the `--verbose` flag is set **then** the orchestrator prints its reasoning before each dispatch (which step, why not skipped, what context packet was assembled) but still executes only one step per turn.

#### Rationale

This model prevents the "finish the work" failure mode where accumulated context causes the agent to skip lifecycle steps. By executing one step per turn and re-invoking with a fresh context, the orchestrator never accumulates enough context to feel compelled to shortcut. Each turn has a single, narrow task: dispatch one subagent.

### Stale Build Detection

When `--resume` is invoked (or at the start of a new `--spec` build), scan `.context-index/lifecycle-state/` for `<slug>.json` files where:
- `status` is `in_progress`, AND
- all recorded steps have `status: skipped`

These are **zombie builds** — the orchestrator ran but only evaluated skip conditions and never executed a real step. Report them:

> Found stale build: `<spec-slug>` (started: <date>, all steps skipped)
> Resume with: `/adev:build --resume --spec <path> --from implement`

If a new `--spec` build matches a zombie build's slug, warn the user and ask whether to resume or overwrite.

### Build Pipeline Steps (per spec)

Each step is dispatched as a fresh subagent via the Agent tool with a forked context. The orchestrator checks skip/stop conditions on artifacts before dispatch and reads the subagent's STEP_RESULT after it returns.

**Full Pipeline** (`--full`):

```
Step 0: Specify   — Agent dispatch → subagent invokes /adev:specify --spec <path>
                     If spec file exists: dispatched with --revise (revision mode, not overwrite)
                     If spec file does not exist: dispatched in creation mode
                     Skip if spec exists AND .review.md exists with PASS verdict (spec is already reviewed)

Step 1: Review    — Agent dispatch → subagent invokes /adev:review-specs --spec <path>
                     Skip if .review.md exists and is current (PASS verdict)
                     If BLOCK: enter blocker-fix loop (re-specify → re-review, max build.max_review_retries)
                     STOP if still BLOCK after budget exhausted

Step 2: Plan      — Agent dispatch → subagent invokes /adev:plan --spec <path>
                     Skip if .plan.md exists
                     STOP if constitution violation detected

Step 3: Route     — Agent dispatch → subagent invokes /adev:route --plan <plan-path>
                     ALWAYS runs — MUST NOT be skipped even if no specialists registered
                     Skip only if --no-route flag is explicitly set

Step 4: Implement — Agent dispatch → subagent invokes /adev:implement <plan-path>
                     Subagent's isolated context handles TDD, specialist routing,
                     review, source manifest, commit trailers, DoD
                     STOP if quality gates fail

Step 5: Validate  — Agent dispatch → subagent invokes /adev:validate --spec <path> --plan <plan-path>
                     Subagent's isolated context runs full 13-check suite
                     If FAIL and build.max_retries > 0: enter retry loop (see Appendix)
                     Report PASS/FAIL
```

**Implement Pipeline** (default, `--spec <path>` without `--full`):

```
Step 1: Plan      — Agent dispatch → subagent invokes /adev:plan --spec <path>
                     Skip if .plan.md exists
                     STOP if constitution violation detected

Step 2: Route     — Agent dispatch → subagent invokes /adev:route --plan <plan-path>
                     ALWAYS runs — MUST NOT be skipped even if no specialists registered
                     Skip only if --no-route flag is explicitly set

Step 3: Implement — Agent dispatch → subagent invokes /adev:implement <plan-path>
                     Subagent's isolated context handles TDD, specialist routing,
                     review, source manifest, commit trailers, DoD
                     STOP if quality gates fail

Step 4: Validate  — Agent dispatch → subagent invokes /adev:validate --spec <path> --plan <plan-path>
                     Subagent's isolated context runs full 13-check suite
                     If FAIL and build.max_retries > 0: enter retry loop (see Appendix)
                     Report PASS/FAIL
```

### Build State File Format

```json
{
  "spec": "<path>",
  "phase": "<milestone-name or null>",
  "status": "in_progress | completed | failed",
  "steps": [
    { "name": "specify", "status": "skipped", "timestamp": "ISO-8601" },
    { "name": "review", "status": "completed", "timestamp": "ISO-8601" },
    { "name": "plan", "status": "completed", "timestamp": "ISO-8601" },
    { "name": "route", "status": "completed", "timestamp": "ISO-8601" },
    { "name": "implement", "status": "failed", "timestamp": "ISO-8601", "error": "..." },
    { "name": "validate", "status": "completed", "timestamp": "ISO-8601" }
  ],
  "started": "ISO-8601",
  "updated": "ISO-8601"
}
```

Valid step names: `specify`, `review`, `plan`, `route`, `implement`, `validate`.
```

### Postconditions

- Each spec that passes all steps has status `validated`
- Build state file at `.context-index/lifecycle-state/<slug>.json` records outcome
- Issue board reflects current state (if configured)
- Summary printed: N specs attempted, N passed, N failed, N skipped

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| No spec found for `--spec` | Print "Spec not found: <path>" and stop | N/A |
| No specs found for `--milestone` | Print "No specs found for milestone '<name>'" and stop | N/A |
| `--resume` but no build state file | Print "No interrupted build found" and stop | N/A |
| Zombie build found on `--resume` | Report stale build with resume command; ask to resume or overwrite | N/A |
| Review BLOCK (Full Pipeline, no retries) | Stop build, report review findings, save state | N/A |
| Review BLOCK (Full Pipeline, blocker-fix loop exhausted) | Stop build, report all fix attempts failed, save state | N/A |
| Quality gates fail during implement | Stop build for that spec, report failures, save state | N/A |
| Validation FAIL (max_retries = 0) | Report failures but mark build as completed (fail-fast default) | N/A |
| Validation FAIL (retry loop exhausted or no progress) | Report final FAIL with retry history, mark build failed | N/A |
| Implement Pipeline invoked without reviewed spec | Warn: "No .review.md found for <spec>. Run with --full to include review, or run /adev:review-specs first." | N/A |

## Workspace Build Mode

When invoked from a workspace root (a directory containing a `workspace.yaml` manifest listing child repos), the build skill operates in Workspace Build Mode. This is a distinct code path from single-repo builds.

- Workspace build mode is triggered when the CWD contains a `workspace.yaml` and no `.context-index/` of its own
- The orchestrator performs a topological sort of child repos based on declared dependencies in `workspace.yaml`
- Each child repo is built in dependency order using its own pipeline mode (Full or Implement)
- Failure in a child repo stops dependents but not independent repos
- Build state files are written per-repo at `<child-repo>/.context-index/lifecycle-state/<slug>.json`
- Workspace-level summary is printed after all child builds complete

See the `workspace-aware-vision` spec for the full workspace topology spec.

## System Constitution Reference

- **Principle:** "Skills are primarily markdown" — The skill is a SKILL.md; build state is JSON (supporting data, not a skill)
- **Architecture Boundary:** "Adding new skills to the lifecycle order" — Build orchestrates existing skills without changing their gates or order; it is a convenience wrapper, not a new lifecycle phase

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Create SKILL.md | Write the skill with pipeline steps, resume logic, phase batching | large |
| Define build state format | JSON schema for `.context-index/lifecycle-state/<slug>.json` files | small |
| Create lifecycle-state directory | Ensure directory exists or is created on first build | small |

## Issue Board Integration

- **Start**: If building a single spec, find the matching issue and mark `in_progress`. If building a phase, mark the milestone epic `in_progress`.
- **During**: Delegates to child skills — each handles its own issue board updates (plan creates issues, implement marks them in_progress/closed, validate adds notes)
- **End**: If build completes, report final status. Does not close the milestone epic (that's a manual/vision decision).
- Guard pattern: check `tasks.backend` in manifest; skip if unconfigured

## Acceptance Criteria

### Pipeline Modes
- [ ] `--spec <path>` (no `--full`) runs Implement Pipeline: plan → route → implement → validate
- [ ] `--spec <path> --full` runs Full Pipeline: specify → review → plan → route → implement → validate
- [ ] `--milestone <name>` (no `--full`) filters to `review-passed` or later specs and builds each using Implement Pipeline
- [ ] `--milestone <name>` skips `review-pending` and `review-blocked` specs with a visible note per spec
- [ ] `--milestone <name> --full` includes `review-pending` specs and runs Full Pipeline for each
- [ ] Implement Pipeline warns and stops if no `.review.md` found for the spec
- [ ] Route step runs by default in both pipeline modes — orchestrator dispatches route subagent even when no specialists are registered
- [ ] `--no-route` flag explicitly disables route for the current build
- [ ] `--dry-run` shows pipeline mode, steps to execute, retry policy, and estimated task counts without executing

### Review Blocker-Fix Loop (Full Pipeline)
- [ ] When review returns BLOCK, orchestrator extracts blocking issues and dispatches specify subagent with `--revise --blocker-context <findings>`
- [ ] Re-review is dispatched after revision; loop repeats up to `build.max_review_retries` (default 2)
- [ ] Loop stops immediately on PASS
- [ ] Loop stops on no-progress (same blockers after revision)
- [ ] Loop stops after budget exhaustion; build stops with summary of all fix attempts
- [ ] `build.max_review_retries = 0` disables auto-fix; BLOCK stops immediately

### Validation Retry Loop (both modes)
- [ ] `build.max_retries > 0` enables validate→implement retry loop (see Appendix)
- [ ] `build.max_retries = 0` or absent means FAIL is recorded and build completes without retry
- [ ] Retry budget clamped to max 3

### Skip Conditions
- [ ] Plan step skipped if `.plan.md` exists
- [ ] Full Pipeline Step 0 (Specify) skipped if `.review.md` exists with PASS verdict (spec already reviewed)
- [ ] Full Pipeline Step 0 dispatches `/adev:specify --revise` when spec exists but has no `.review.md`
- [ ] Review step skipped in Full Pipeline if `.review.md` exists with PASS verdict and is not stale

### Resume and Stale Builds
- [ ] `--resume` reads `.context-index/lifecycle-state/<slug>.json` and resumes from next uncompleted step
- [ ] `--resume --from <step>` overrides the automatic resume point; valid step names: `specify`, `review`, `plan`, `route`, `implement`, `validate`
- [ ] `--resume --from <invalid-step>` prints an error and stops
- [ ] On `--resume`, stale build detection scans for zombie builds (in_progress + all steps skipped) and reports them with suggested resume command
- [ ] On new `--spec` build, warns if a zombie build exists for the same slug

### One-Step-Per-Invocation Dispatch
- [ ] Orchestrator executes exactly ONE pipeline step per turn — never two or more steps in a single invocation
- [ ] After dispatching one subagent and recording result, orchestrator re-invokes itself via Skill tool for the next step
- [ ] Each re-invocation starts with a fresh forked context — no memory of prior turns
- [ ] Pipeline position is determined solely from build state file on disk, never from conversation context
- [ ] Orchestrator prompt contains only dispatch-loop instructions, not child skill implementation details
- [ ] Final step (or stop condition) exits without re-invocation and prints summary
- [ ] `--verbose` causes reasoning output but does not change one-step-per-turn behavior

### Subagent and Fork Isolation
- [ ] Each pipeline step dispatched as a fresh subagent via Agent tool with forked context
- [ ] Orchestrator never calls Skill tool directly for pipeline steps — only subagents do
- [ ] Subagent prompts include pipeline context (spec path, title, phase, pipeline mode, position, workspace, issue board)
- [ ] Step context assembled from disk artifacts (`.review.md`, `.plan.md`, spec frontmatter), never from prior subagent memory
- [ ] Subagents return structured STEP_RESULT (status, verdict, artifacts, summary, error)
- [ ] Build skill uses `context: fork` in frontmatter
- [ ] Resumed builds assemble step context from disk, not from session memory

### Build State
- [ ] Build state file written at each step with step name, status, and timestamp
- [ ] Build state marked `status: completed` on success
- [ ] Build state files are ephemeral — not committed to git
- [ ] Build state records retry history when retry loop is used
- [ ] Phase mode summary printed at end: N specs attempted, N passed, N failed, N skipped

### Quality
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced

## Appendix: Retry Policy

The validate→implement retry loop is an optional mechanism for automatically fixing validation failures. It is disabled by default (`build.max_retries = 0`).

**When triggered:** validate returns FAIL and `build.max_retries > 0` and retry budget remains.

**Loop steps:**
1. Extract specific failing checks from the validation report
2. Dispatch implement subagent scoped to those failures (with `RETRY_CONTEXT` in the prompt identifying the failing checks)
3. Dispatch validate subagent
4. Evaluate STEP_RESULT

**Stop conditions:**
- PASS verdict
- Budget exhausted (cycle count ≥ `build.max_retries`, clamped to 3)
- No progress: same checks failing after a retry cycle
- Regression: a previously-passing check now fails

**Build state during retry:**
```json
{
  "retries": [
    { "cycle": 1, "verdict": "FAIL", "failing_checks": ["check-5", "check-11"] },
    { "cycle": 2, "verdict": "FAIL", "failing_checks": ["check-5"] }
  ]
}
```

**Configuration:** `build.max_retries` in user-config (local `.context-index/user-config` → global `<PLUGIN_ROOT>/user-config` → default 0). Resolved via `parseUserConfig()` from `lib/persona.mjs`.
