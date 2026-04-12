# Live Spec: adev:build Orchestrator

<!-- Live Spec within the strategic-planning charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/strategic-planning/charter.md -->

---
charter: strategic-planning
status: review-pending
risk_level: high
milestone: v2
revision: 1
charter-revision: 1
created: 2026-04-05
updated: 2026-04-05
source-manifest:
  sha: "472fd8e"
  files:
    - skills/assess/SKILL.md
    - skills/build/SKILL.md
    - skills/issues/SKILL.md
    - skills/start/SKILL.md
    - tests/skills/assess.test.mjs
  computed-at: "2026-04-12T11:48:02.749Z"
---

## Behavioral Contract

### Preconditions

- `.context-index/` exists with `constitution.md` and `manifest.yaml`
- At least one Live Spec exists (either specified via `--spec` or found via `--phase` filter)

### Behaviors

1. **When** `--spec <path>` is invoked **then** the skill chains: review-specs → route → plan → implement → validate for that single spec
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

### Build Pipeline Steps (per spec)

```
Step 1: Review    — invoke /adev:review-specs --spec <path>
                     Skip if .review.md exists and is current
                     STOP if verdict is BLOCK

Step 2: Plan      — invoke /adev:plan --spec <path>
                     Skip if .plan.md exists
                     STOP if constitution violation detected

Step 3: Route     — invoke /adev:route --plan <plan-path>
                     Optional: route annotations are advisory
                     Skip if --no-route flag set

Step 4: Implement — invoke /adev:implement <plan-path>
                     STOP if quality gates fail

Step 5: Validate  — invoke /adev:validate --spec <path> --plan <plan-path>
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
