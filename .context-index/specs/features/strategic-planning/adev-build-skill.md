# Live Spec: adev:build Orchestrator

<!-- Live Spec within the strategic-planning charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/strategic-planning/charter.md -->

---
charter: strategic-planning
status: validated
risk_level: high
milestone: v2
revision: 3
charter-revision: 1
created: 2026-04-05
updated: 2026-04-21
source-manifest:
  sha: "2d82a17"
  files:
    - skills/build/SKILL.md
    - templates/manifest-template.yaml
  computed-at: "2026-04-21T15:18:29.025Z"
---

## Behavioral Contract

### Preconditions

- `.context-index/` exists with `constitution.md` and `manifest.yaml`
- At least one Live Spec exists (either specified via `--spec` or found via `--phase` filter)

### Behaviors

1. **When** `--spec <path>` is invoked **then** the skill chains: review-specs → plan → route → implement → validate for that single spec
2. **When** `--phase <name>` is invoked **then** the skill discovers all specs with `milestone: <name>` in frontmatter, filters to those with status `review-pending` or later, and builds each in dependency order
3. **When** a step fails (e.g., review returns BLOCK) **then** the build stops immediately, reports the failure with context, and saves build state for resume
4. **When** `--resume` is invoked **then** the skill reads `.context-index/build-state/<slug>.json`, identifies the last successful step, and resumes from the next step
5. **When** `--dry-run` is invoked **then** the skill shows what would happen at each phase (specs found, steps to execute, estimated task counts) without executing any skill
6. **When** a spec has already passed review (`.review.md` exists with PASS verdict, not stale) **then** the review-specs step is skipped for that spec
7. **When** a spec already has a plan (`.plan.md` exists) **then** the plan step is skipped for that spec
8. **When** routing is available (spec has been planned) **then** the route step runs; otherwise it is skipped
9. **When** building multiple specs via `--phase` **then** each spec's build is independent — failure of one spec does not block others unless they have explicit dependencies
10. **When** each phase completes **then** the build state file is updated with the completed step and timestamp
11. **When** the full build completes successfully **then** the build state file is marked `status: completed` and a summary is printed
12. **When** executing any pipeline step **then** the orchestrator MUST dispatch a fresh subagent via the Agent tool. The subagent's prompt includes a context packet (pipeline context + step context) and instructs it to invoke the target skill via the Skill tool, run it to completion, and return a structured STEP_RESULT. The orchestrator never calls the Skill tool directly for pipeline steps — only subagents do.
13. **When** assembling a subagent prompt **then** the orchestrator includes two context sections: (a) pipeline context — spec path, spec title, phase, pipeline position, workspace state, issue board config — common to all steps; (b) step context — step-specific fields read from artifact files on disk (e.g., review verdict from `.review.md`, plan path from `.plan.md`, task count, route annotations). Step context is always read from disk, never from prior subagent results, to ensure correctness across resumed builds.
14. **When** a subagent returns its STEP_RESULT **then** the orchestrator reads only the status, verdict, artifacts, summary, and error fields to make orchestration decisions (skip/stop/continue) and to persist in build state. The orchestrator does not parse or act on intermediate skill output.
15. **When** the build skill is loaded **then** it runs in a forked context (`context: fork` in frontmatter) to isolate the entire build pipeline from the parent conversation. Each pipeline step is further isolated by running as a subagent within this fork.
16. **When** validate returns FAIL and `build.max_retries` from user-config is > 0 and retry budget remains **then** the orchestrator enters a validate→implement retry loop: extracts specific failures from the validation report, re-dispatches implement scoped to those failures (with RETRY_CONTEXT in the prompt), then re-dispatches validate. The loop stops on: budget exhaustion, no progress (same checks failing), or regression (previously-passing check now fails).
17. **When** `build.max_retries` is 0 or absent in user-config **then** validate FAIL is recorded as informational and the build completes without retry (fail-fast default behavior).
18. **When** `build.max_retries` exceeds 3 **then** clamp to 3 with a warning.
19. **When** resolving `build.max_retries` **then** follow the same hierarchy as persona resolution: local `.context-index/user-config` → global `<PLUGIN_ROOT>/user-config` → default `0`. Uses `parseUserConfig()` from `lib/persona.mjs`.

### Build Pipeline Steps (per spec)

Each step is dispatched as a fresh subagent via the Agent tool. The orchestrator checks skip/stop conditions on artifacts before dispatch and reads the subagent's STEP_RESULT after it returns.

```
Step 1: Review    — Agent dispatch → subagent invokes /adev:review-specs --spec <path>
                     Skip if .review.md exists and is current
                     STOP if verdict is BLOCK

Step 2: Plan      — Agent dispatch → subagent invokes /adev:plan --spec <path>
                     Skip if .plan.md exists
                     STOP if constitution violation detected

Step 3: Route     — Agent dispatch → subagent invokes /adev:route --plan <plan-path>
                     Optional: route annotations are advisory
                     Skip if --no-route flag set

Step 4: Implement — Agent dispatch → subagent invokes /adev:implement <plan-path>
                     Subagent's isolated context handles TDD, specialist routing,
                     review, source manifest, commit trailers, DoD
                     STOP if quality gates fail

Step 5: Validate  — Agent dispatch → subagent invokes /adev:validate --spec <path> --plan <plan-path>
                     Subagent's isolated context runs full 13-check suite
                     Report PASS/FAIL
```

### Build State File Format

```json
{
  "spec": "<path>",
  "phase": "<milestone-name or null>",
  "status": "in_progress | completed | failed",
  "steps": [
    { "name": "review", "status": "completed", "timestamp": "ISO-8601" },
    { "name": "plan", "status": "completed", "timestamp": "ISO-8601" },
    { "name": "implement", "status": "failed", "timestamp": "ISO-8601", "error": "..." }
  ],
  "started": "ISO-8601",
  "updated": "ISO-8601"
}
```

### Postconditions

- Each spec that passes all steps has status `validated`
- Build state file at `.context-index/build-state/<slug>.json` records outcome
- Issue board reflects current state (if configured)
- Summary printed: N specs attempted, N passed, N failed, N skipped

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| No spec found for `--spec` | Print "Spec not found: <path>" and stop | N/A |
| No specs found for `--phase` | Print "No specs found for milestone '<name>'" and stop | N/A |
| `--resume` but no build state file | Print "No interrupted build found" and stop | N/A |
| Review returns BLOCK | Stop build for that spec, report review findings, save state | N/A |
| Quality gates fail during implement | Stop build for that spec, report failures, save state | N/A |
| Validation FAIL | Report failures but mark build as completed (validation is informational) | N/A |

## System Constitution Reference

- **Principle:** "Skills are primarily markdown" — The skill is a SKILL.md; build state is JSON (supporting data, not a skill)
- **Architecture Boundary:** "Adding new skills to the lifecycle order" — Build orchestrates existing skills without changing their gates or order; it is a convenience wrapper, not a new lifecycle phase

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Create SKILL.md | Write the skill with pipeline steps, resume logic, phase batching | large |
| Define build state format | JSON schema for `.context-index/build-state/` files | small |
| Create build-state directory | Ensure directory exists or is created on first build | small |

## Issue Board Integration

- **Start**: If building a single spec, find the matching issue and mark `in_progress`. If building a phase, mark the milestone epic `in_progress`.
- **During**: Delegates to child skills — each handles its own issue board updates (plan creates issues, implement marks them in_progress/closed, validate adds notes)
- **End**: If build completes, report final status. Does not close the milestone epic (that's a manual/vision decision).
- Guard pattern: check `tasks.backend` in manifest; skip if unconfigured

## Acceptance Criteria

- [ ] `--spec <path>` builds a single spec end-to-end
- [ ] `--phase <name>` discovers and builds all matching specs
- [ ] Stops on review BLOCK
- [ ] Stops on quality gate failure during implement
- [ ] Skips review if .review.md exists and is current
- [ ] Skips plan if .plan.md exists
- [ ] `--resume` correctly resumes from last successful step
- [ ] `--dry-run` shows pipeline without executing
- [ ] Build state file is written at each step
- [ ] Phase mode handles spec dependencies (independent failures don't block others)
- [ ] Summary printed at end with pass/fail/skip counts
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
- [ ] Each pipeline step is dispatched as a fresh subagent via the Agent tool — orchestrator never calls Skill tool directly for pipeline steps
- [ ] Subagent prompts include pipeline context (spec path, title, phase, position, workspace, issue board) and step-specific context (review verdict, plan path, route annotations, etc.)
- [ ] Step context is assembled by reading artifact files on disk (`.review.md`, `.plan.md`, spec frontmatter), never from prior subagent result memory
- [ ] Subagents invoke child skills via the Skill tool within their isolated context and return structured STEP_RESULT (status, verdict, artifacts, summary, error)
- [ ] Child skills execute their full protocol within the subagent's context (implement runs all 6 steps including source manifest, commit trailers, DoD; validate runs all 13 checks)
- [ ] Build skill uses `context: fork` to isolate the entire pipeline from the parent conversation
- [ ] Orchestrator only reads STEP_RESULT fields to make orchestration decisions — does not read source code, run tests, or write reports directly
- [ ] Resumed builds assemble step context from disk state, not from memory of previous sessions
- [ ] `build.max_retries` in user-config controls validate→implement retry loop (default 0 = disabled, max 3), resolved via local → global → default hierarchy using `parseUserConfig()`
- [ ] Retry loop extracts specific failures from validation report and scopes re-implementation to those failures
- [ ] Retry stops on no progress (same checks failing), regression (previously-passing check fails), or budget exhaustion
- [ ] Build state records retry history (cycle count, per-cycle verdict, failed checks)
- [ ] Dry-run output shows retry policy from manifest
