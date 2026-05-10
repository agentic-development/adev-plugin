# Live Spec: Deploy Core

<!-- Live Spec within the deploy charter.
     This defines the behavioral contract for the core deployment pipeline:
     config schema, step execution, milestone integration, and failure recovery.
     Parent Charter: .context-index/specs/features/deploy/charter.md -->

---
charter: deploy
status: validated
risk_level: medium
milestone: v1
revision: 3
charter-revision: 1
created: 2026-05-09
updated: 2026-05-09
tracker-ref: issue-345
---

## Behavioral Contract

This spec covers four Must-have capabilities from the deploy charter: Deploy Config Schema, Deploy Execute, Milestone Integration, and Failure and Rollback. Together they form the minimum viable deployment pipeline: define deployment steps in YAML, execute them in order, integrate with shipped milestones for version resolution, and handle failures safely with rollback guidance.

### Preconditions

- `.context-index/deploy.yaml` exists and passes schema validation (for execute/failure capabilities)
- Node.js runtime is available (shell steps use `execFile`)
- For milestone integration: `lib/milestones.mjs` must exist and export `loadMilestones(projectRoot)`. This module is a dependency from the milestone-lifecycle feature and must be implemented before Task 9. If the module does not exist at implementation time, Task 9 is blocked.
- For milestone integration: `milestones.yaml` exists with at least one shipped milestone, OR `--version <tag>` is provided explicitly
- For rollback: the deploy config contains `rollback` entries for relevant steps

### Behaviors

1. **When** `loadDeployConfig(projectRoot)` is called with a valid `.context-index/deploy.yaml` **then** it returns a DeployConfig object with parsed `environments`, `steps`, and `variables` fields, preserving step order.

2. **When** `loadDeployConfig(projectRoot)` is called and no `deploy.yaml` exists **then** it returns `null` (not an error) so the skill can print a user-friendly message.

3. **When** `validateDeployConfig(config)` is called on a config with duplicate step IDs within an environment **then** it returns an errors array containing a descriptive error for each duplicate.

4. **When** `validateDeployConfig(config)` is called on a config where `shell` or `ci-trigger` steps contain inline secret patterns **then** it returns an errors array flagging each violation with the step ID and a description. Detection uses these regex patterns applied to command strings and argument values:
   - High-entropy strings: tokens matching `[A-Za-z0-9+/=_-]{32,}` (base64/hex-like, 32+ chars)
   - Prefixed API keys: `(sk|pk|api|token|key|secret|password|bearer)[_-]?[A-Za-z0-9]{16,}` (case-insensitive)
   - AWS-style keys: `(AKIA|ASIA)[A-Z0-9]{16}`
   - Generic password patterns: `(password|passwd|pwd)\s*[:=]\s*\S+` (case-insensitive)

   **Known limitations (best-effort, not a security guarantee):** This detection is heuristic. It does not catch base64-encoded secrets, concatenated tokens, secrets split across variables, or novel formats. Users must not rely on this as a hard security control — env var references are the required pattern for all credentials.

5. **When** `/adev:deploy` is invoked without `--version` **then** the skill reads `milestones.yaml`, finds the most recently shipped milestone, and uses its version/tag for the deploy run. If no shipped milestone exists, it stops with: "No shipped milestone found. Use `--version <tag>` to deploy explicitly."

6. **When** `/adev:deploy --version v1.2.3` is invoked **then** the skill uses the provided version directly, bypassing milestone lookup entirely.

7. **When** `/adev:deploy` executes a `shell` step **then** it runs the command via `execFile` with `shell: false` (array args, no interpolation), captures stdout/stderr, and records the result (exit code, duration) in the DeployRun.

8. **When** `/adev:deploy` executes a `manual` step **then** it prints the step's `instructions` field to the user, waits for user confirmation ("done" / "skip" / "abort"), and records the user's response in the DeployRun.

9. **When** `/adev:deploy` executes a `verify` step **then** it runs the verification command and treats exit code 0 as pass, non-zero as fail. A verify failure is treated the same as a step failure (triggers the failure flow).

10. **When** `/adev:deploy` executes a `gate` step **then** it runs the step's `command` field repeatedly (polling) until it exits with code 0. Polling uses a configurable `interval` (default: 10s, minimum: 5s) and `timeout` (default: 300s). If the timeout expires before exit code 0, the gate fails and triggers the failure flow.

11. **When** `/adev:deploy` executes a `ci-trigger` step **then** it runs the step's `command` field to dispatch the CI job (the command is responsible for triggering the job and outputting a job identifier to stdout). It then runs the step's `poll_command` field repeatedly to check job status, using a configurable `interval` (default: 30s, minimum: 10s) and `timeout` (default: 1800s). The `poll_command` must exit 0 for success, non-zero for failure or in-progress (distinguished by exit code: 1 = failed, 2 = in-progress).

12. **When** any step fails during execution **then** the skill immediately stops execution, reports which steps succeeded and which failed, and surfaces the `rollback` steps from the config for all completed steps (in reverse order). Rollback steps are displayed as instructions — they are never auto-executed.

13. **When** the user confirms rollback execution after a failure **then** the skill executes the rollback steps one at a time, each requiring explicit user confirmation before proceeding to the next.

14. **When** all steps complete successfully **then** the skill reports a summary with version, environment, step results, and total duration.

15. **When** `validateDeployConfig(config)` is called on a config with env var references (e.g., `$NPM_TOKEN`) **then** it checks whether those env vars are currently set in the environment and warns (not errors) for any that are missing. Warning messages include the variable name but never the value.

16. **When** step execution captures stdout/stderr that contains values matching any of the env vars referenced in the deploy config **then** those values are replaced with `<REDACTED:$VAR_NAME>` before recording in the DeployRun or printing to the user. Redaction applies to all output paths: console display, DeployRun records, and any future deploy history artifacts.

### Postconditions

- After a successful deploy run, all steps have `status: "succeeded"` in the DeployRun record
- After a failed deploy run, the DeployRun records the exact failure point and all preceding step results
- No secrets are ever logged to stdout, deploy history, or any artifact file
- `deploy.yaml` is never modified by the deploy skill (read-only)

### Error Cases

Error codes below are symbolic identifiers for spec readability and structured error reporting within `lib/deploy.mjs` return values. The CLI skill itself uses standard exit codes (0 = success, 1 = failure) per the constitution.

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `deploy.yaml` not found | Print "No deploy.yaml found. Run `/adev:deploy init` to set up deployment." and exit | NO_CONFIG |
| `deploy.yaml` fails schema validation | Print validation errors with step IDs and line references, exit without executing | INVALID_CONFIG |
| Duplicate step IDs in environment | Validation error listing each duplicate | DUPLICATE_STEP_ID |
| Inline secret detected in shell/ci-trigger step | Validation error: "Step `<id>` contains what appears to be an inline secret. Use env var references instead." | INLINE_SECRET |
| `--version` not provided and no shipped milestone | "No shipped milestone found. Use `--version <tag>` to deploy explicitly." | NO_VERSION |
| `shell` step exits non-zero | Stop deploy, report failure, surface rollback steps | STEP_FAILED |
| `verify` step exits non-zero | Stop deploy, report verification failure, surface rollback steps | VERIFY_FAILED |
| `gate` step times out | Stop deploy, report timeout, surface rollback steps | GATE_TIMEOUT |
| `ci-trigger` job fails | Stop deploy, report CI failure, surface rollback steps | CI_FAILED |
| `manual` step user aborts | Stop deploy, report user abort, surface rollback steps | USER_ABORT |
| `execFile` command not found | Stop deploy, report "Command not found: `<cmd>`", surface rollback steps | CMD_NOT_FOUND |
| Env var referenced in step not set | Warning before execution (not blocking) | ENV_VAR_MISSING |

## System Constitution Reference

- **"Minimize external dependencies"** -- The deploy library (`lib/deploy.mjs`) uses only Node.js built-ins: `fs` for YAML reading, `child_process.execFile` for shell steps, `crypto` for any hashing needs. No YAML parser dependency — reuses the existing `parseYaml` from `lib/profiles/yaml.mjs`. The parser is constrained to a strict subset: scalar values, sequences (block and flow), and plain mappings. The following YAML features are explicitly rejected by `validateDeployConfig`: anchors/aliases (`&`/`*`), multi-document (`---` separators after the first), merge keys (`<<:`), and tag directives (`!`). Any input containing these constructs produces an `INVALID_CONFIG` error. This prevents parser-ambiguity attacks where crafted YAML exploits differences between parser implementations.

- **"Skills are primarily markdown"** -- `/adev:deploy` SKILL.md contains the structured instructions for Claude. `lib/deploy.mjs` is companion code providing `loadDeployConfig()`, `validateDeployConfig()`, and `executeDeploy()` functions.

- **"Pure ESM"** -- `lib/deploy.mjs` uses ESM imports/exports exclusively. No CommonJS.

- **"Hook protocol compliance"** -- Deploy does not introduce new hooks but follows the existing pattern where tools read env vars and output structured results to stdout.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| 1. Deploy config schema and loader | Define `deploy.yaml` schema, implement `loadDeployConfig()` and `validateDeployConfig()` in `lib/deploy.mjs` | medium |
| 2. Secret detection in validation | Implement regex-based inline secret detection for shell/ci-trigger step commands | small |
| 3. Step executor framework | Implement the step execution engine: ordered execution, result recording, and the `executeDeploy()` orchestrator | medium |
| 4. Shell step executor | Implement `execFile`-based shell step execution with stdout/stderr capture and timeout support | small |
| 5. Manual step executor | Implement manual step display and user confirmation flow (done/skip/abort) | small |
| 6. Verify step executor | Implement verification command execution with pass/fail interpretation | small |
| 7. Gate step executor | Implement gate polling with configurable timeout and condition checking | medium |
| 8. CI-trigger step executor | Implement CI job dispatch and status polling | medium |
| 9. Milestone integration | Implement version resolution from `milestones.yaml` shipped entries, with `--version` override | small |
| 10. Failure and rollback flow | Implement fail-fast behavior, rollback step surfacing, and confirmed rollback execution | medium |
| 11. Deploy skill SKILL.md | Author `skills/deploy/SKILL.md` with full deployment orchestration instructions | medium |
| 12. Deploy run summary | Implement end-of-deploy summary output with version, environment, step results, duration | small |

## Acceptance Criteria

- [ ] `loadDeployConfig()` correctly parses a valid `deploy.yaml` with flat steps and returns a DeployConfig
- [ ] `loadDeployConfig()` returns `null` when no `deploy.yaml` exists
- [ ] `validateDeployConfig()` rejects configs with duplicate step IDs
- [ ] `validateDeployConfig()` rejects configs with inline secrets in shell/ci-trigger commands
- [ ] `validateDeployConfig()` warns about missing env vars without blocking
- [ ] Shell steps execute via `execFile` with `shell: false` (no shell interpolation)
- [ ] Manual steps print instructions and wait for user confirmation
- [ ] Verify steps treat exit 0 as pass and non-zero as fail
- [ ] Gate steps poll with timeout and fail on expiry
- [ ] CI-trigger steps dispatch and poll for completion
- [ ] Version is resolved from most recent shipped milestone when `--version` is omitted
- [ ] `--version <tag>` bypasses milestone lookup entirely
- [ ] On step failure, execution stops immediately and rollback steps are surfaced
- [ ] Rollback steps are never auto-executed -- each requires user confirmation
- [ ] Successful deploy prints summary with version, environment, steps, and duration
- [ ] No secrets appear in stdout output, deploy history, or any written artifact
- [ ] Step stdout/stderr is scrubbed for env var values before recording or display
- [ ] YAML parser rejects anchors, aliases, multi-document, merge keys, and tag directives
- [ ] Secret detection uses the four defined regex patterns and documents bypass limitations
- [ ] Gate steps poll with minimum 5s interval and configurable timeout
- [ ] CI-trigger steps use `command` for dispatch and `poll_command` for status, with minimum 10s poll interval
- [ ] `skills/deploy/SKILL.md` exists with structured deployment instructions
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
