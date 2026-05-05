---
charter: tiered-test-gates
status: superseded
risk_level: medium
revision: 2
charter-revision: 2
created: 2026-04-15
updated: 2026-04-15
---

# Live Spec: Implement Integration Gate

## Behavioral Contract

### Preconditions

- `/adev:implement` is executing a plan and all tasks have completed successfully (Step 2 loop finished)
- `.context-index/manifest.yaml` exists with a `gates:` section
- The gate resolution rules from `tiered-gate-schema.md` apply

### Behaviors

1. **When** all tasks in the plan are complete and `gates.integration` is defined in the TierConfig **then** the integration tier commands execute after Step 2 (per-task loop) and before Step 3 (Final Review). Each command in the integration tier runs sequentially. This step is labeled "Step 2-post: Integration Gate" to avoid renumbering existing steps.

2. **When** the integration tier passes **then** execution proceeds to Step 3 (Final Review) as normal. The implementation report includes an "Integration Gates" section showing commands run, status, and duration.

3. **When** the integration tier contains a command that exits non-zero and the tier has `severity: error` (default) **then** implementation halts. A failure report is emitted immediately with command output (truncated to 8 KB per stream). Steps 3 (Final Review), 4 (Completion), and all subsequent steps do not execute. Execution state is written as `status: "blocked"` with `blockers` set to the integration gate failure details and `nextAction` set to "Fix integration issues and re-run /adev:implement or /adev:validate."

4. **When** the integration tier contains a command that exits non-zero and the tier has `severity: warning` **then** the failure is recorded as WARN. Step 3 (Final Review) proceeds. The warning is included in the Step 4 completion report.

5. **When** `gates.integration` is not defined in the TierConfig **then** the integration gate step is skipped entirely with no output. Step 3 follows Step 2 directly (current behavior preserved).

6. **When** `--task <N>` is passed (single-task re-run) **then** the integration gate step is skipped. Integration gates only run when all tasks complete in a full plan execution.

7. **When** the integration tier contains multiple commands (e.g., `test: "npm run test:integration"`, `contract: "npm run test:contracts"`) **then** commands execute sequentially. All commands within the tier share the tier's severity — individual commands do not have their own severity. If any command exits non-zero with `severity: error`, remaining integration commands are skipped.

8. **When** `/adev:implement` resolves gates for the integration step **then** it reads from `manifest.yaml` only. Governance/gates.yaml does not apply to the integration gate step in implement (per tiered-gate-schema spec, Behavior 9: governance gates only apply to `/adev:validate` Check 1). This is orthogonal to the existing Step 2h per-task governance gates, which continue to operate independently.

9. **When** the `e2e` tier is defined in the TierConfig **then** it is excluded from `/adev:implement`. Only the fast tier (per-task in Step 2) and integration tier (post-all-tasks in Step 2-post) execute during implementation. E2E gates execute only during `/adev:validate` Check 1c.

### Postconditions

- Integration tier results are included in the Step 4 completion report (on success or warning-severity failure)
- On error-severity failure, a standalone failure report is emitted and execution state is set to `blocked`
- If integration tier was executed, the report shows a GateResult per command: tier name, command, pass/fail/warn status, duration, and output for failures

### Error Cases

| Condition | Expected Behavior | Status |
|-----------|-------------------|--------|
| Integration command exits non-zero | Treat per tier severity: error → halt with failure report; warning → record WARN and continue | FAIL/WARN |
| Integration command is not found (e.g., binary not installed) | Report as FAIL with the shell error. Treat per tier severity. | FAIL/WARN |
| Dev server or test infra not running | Report the error output. Do not auto-start infrastructure — that is the project's responsibility. | FAIL/WARN |

## System Constitution Reference

- **Principle 2: "Skills are primarily markdown"** — The integration gate step is added as instructions in SKILL.md. The skill reads manifest.yaml and runs the declared commands via shell. No executable companion code required.
- **Principle 1: "Minimize external dependencies"** — Commands are executed via `child_process` (existing pattern). No new dependencies.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Add Step 2-post to implement SKILL.md | Insert a new labeled step "Step 2-post: Integration Gate" between Step 2 and Step 3. Read `gates.integration` from manifest.yaml using tiered-gate-schema resolution rules, execute commands sequentially, write execution state as `blocked` on error-severity failure. Exclude E2E tier explicitly. | medium |
| Update completion report format | Add an "Integration Gates" section to the Step 4 completion report template showing GateResult per command. | small |
| Document skip conditions and tier scope | Document that integration gates skip for `--task <N>`, skip when `gates.integration` is undefined, and that E2E tier is excluded from implement. | small |

## Acceptance Criteria

- [ ] Integration tier commands run after all tasks complete (Step 2-post) and before Final Review (Step 3)
- [ ] Integration tier error-severity failure halts implementation, emits failure report, sets execution state to `blocked`
- [ ] Integration tier warning-severity failure records WARN and allows Step 3 to proceed
- [ ] Integration gate step is skipped when `gates.integration` is not defined
- [ ] Integration gate step is skipped when `--task <N>` is used (single-task re-run)
- [ ] E2E tier is explicitly excluded from implementation (only fast and integration tiers run)
- [ ] Multiple integration commands execute sequentially, sharing the tier's severity, with intra-tier fail-fast on error
- [ ] Integration results appear in the Step 4 completion report (on success or warning)
- [ ] Governance/gates.yaml does not apply to the integration gate step (manifest only)
- [ ] Step 2h per-task governance gates continue to operate independently
- [ ] Current behavior is preserved when no tiered gates are configured
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
