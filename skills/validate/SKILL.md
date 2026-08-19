---
name: adev:validate
description: "Post-implementation validation with a trimmed code-time check set (quality gates, source manifest, code-drift advisory, spec compliance with scope-expansion sub-finding, constitution compliance with evidence-citation contract, optionally governance boundaries and transition gates, and visual verification for UI implementations). Fail-fast on quality gates. Structured PASS/FAIL report with migration-orientation footer pointing users to /adev:hygiene, /adev:reconcile, and /adev:review-specs for relocated concerns. Use when the user says 'validate the implementation', 'check if it works', 'run validation', 'verify the feature', or after implementation is complete and needs quality assurance."
---

# Validate Implementation

Run post-implementation validation against specs, constitution, charters, ADRs, quality gates, governance boundaries, and transition gates. Produces a structured report with PASS/FAIL per check and specific file references for every failure.

### Load Skill Extensions

**Load Skill Extensions:** Load any skill extension instructions before proceeding:

```bash
adev skill-ext load --skill validate
```

If the output is not `__NONE__`, incorporate it as additional standing instructions that apply to this skill's entire execution. Frame it as: *"The following skill extension instructions apply to this invocation (source: installed domain extensions and/or project-level overrides)."* If the output is `__NONE__`, continue normally.

---

### Dispatch Turn Discipline

**Always pass `run_in_background: false` on every `Agent({...})` dispatch in this skill.** The harness backgrounds Agent dispatches by default: the call returns immediately with a task ID and the caller is only re-invoked by a completion notification. That notification path is reliable only at the top level of a session — inside a nested subagent context it does not re-invoke the caller, so a backgrounded dispatch stalls the pipeline (field-observed as steps that auto-background and never return a result).

**Never end your turn to wait for a dispatched subagent.** A synchronous dispatch (`run_in_background: false`) returns its final result directly in the tool call — there is nothing to wait for. If a dispatch ever returns a task ID instead of a result, that is a bug in the dispatch (the rule above was violated, or the harness backgrounded it anyway): fix the dispatch and re-run it synchronously. Do not end the turn hoping a completion notification will resume you — in a nested subagent context it will not. If this skill is itself running as a dispatched subagent (e.g., a build pipeline step), your own caller is waiting on a result contract — for build pipeline steps this is the `STEP_RESULT` format defined in `skills/build/SKILL.md`. Ending your turn without that result to report is a protocol violation, not a valid pause point.


## Arguments

- `--spec <path>`: validate against a specific Live Spec (required)
- `--plan <path>`: cross-reference the implementation plan (optional, improves traceability)
- `--fix`: attempt to auto-fix minor issues (lint errors, formatting) before reporting
- `--no-infra`: skip infrastructure preflight checks (user-only — the agent must never set this flag)
- `--tier <full|quick>`: rigor tier (graduated-rigor-tiers spec). `full` (default) runs the whole check set; `quick` runs Check 1 (quality gates, fail-fast) plus a single synthesized spec+constitution compliance check, and skips the remaining checks. Overrides any routing/risk-policy signal. Invalid value → `INVALID_TIER`.

## Prerequisites

Before starting, verify:

1. **Context Index exists.** `.context-index/` must be present with `constitution.md` and `manifest.yaml`.
2. **Spec exists.** The target Live Spec must exist and be readable.
3. **Implementation exists.** The files referenced in the spec or plan must exist. If the spec references files that do not exist, the implementation is incomplete. Report this immediately without running the full check suite.

### Step 0a: Implement-step gate (FIRST action)

Before any validation work, gate on the prior step via the lifecycle log, then emit the step-started event:

```bash
adev gate require --skill validate --spec <spec-path>
adev report --type step --spec <spec-path> --step validate --status started
```

In strict mode (default — resolved from `manifest.yaml`'s `lifecycle.gate_mode`), `adev gate require` exits `2` if the `implement` step did not complete with a passing verdict — the skill stops and the operator is told which prior step is missing. In advisory mode, it emits a warning and exits `0`. Do NOT catch the failure — surface the helper's stderr unchanged. Path-containment is enforced by the helper (`INVALID_PROJECT_ROOT` / `INVALID_SPEC_PATH`); skill prose MUST NOT pre-validate paths.

Emit a matching exit event in the new "Step Z: Emit lifecycle completion" section after the validation report is written. The exit event carries the aggregate verdict (PASS / PASS_WITH_NOTES / FAIL) computed from the consolidated check results.

### Step 0a-fail: Failure-path exit event

An aggregate `FAIL` verdict is **not** this section's business — a validation run that completed and concluded FAIL exits through the Step Z `--status completed --verdict FAIL` line. This section covers the case where validation aborts before it can compute any aggregate at all.

Whenever the skill stops after the `--status started` event above without reaching Step Z, emit the terminal event before surfacing the error to the operator:

```bash
adev report --type step --spec <spec-path> --step validate --status failed --verdict FAIL
```

`--verdict FAIL` is required, not decorative. The projection's aggregation pass in `lib/lifecycle-state.mjs` only treats a step terminal as explicit when it carries a string verdict; a `step_failed` emitted without one is overwritten by the verdict synthesized from whatever `validator_report` events already landed, so a run that aborted after two passing checks would project as `{verdict: PASS, status: completed}` — a dead run indistinguishable from a clean one.

Abort paths in this skill that MUST emit it:

| Step | Abort |
|---|---|
| Preflight | `adev preflight run` reports `report.passed === false` — execution is blocked pending operator direction. The agent must never set `--no-infra` or `ADEV_NO_INFRA` autonomously to get past it. |
| Preflight | `lib/infra-preflight.mjs` fails to import. |
| Step 0 | `loadValidateConfig` throws `MISSING_VALIDATE_CONFIG` — no checks dispatch and no report is written. |
| Step 0 | Any other `loadValidateConfig` loader error (`INVALID_CHECK_ID`, `DETERMINISTIC_PROJECT`, unresolvable prompt URI, profile resolution failure, `after` cycle) — "abort on any loader error". |

The Prerequisites block (missing `.context-index/`, missing spec, missing implementation files) runs *before* the `--status started` event and therefore strands nothing — do not emit for those.

**Known gap (not this skill's to fix):** `adev report --type step` accepts no `--error` flag, so the abort's error code cannot be carried on the event even though the `step_failed` schema has an `error` field. Name the code in operator-facing output; widening the CLI surface is a follow-up.

## Workspace-Aware Validation Mode

Applies only at a multi-repo workspace root.

> **Conditional loading:** Read `skills/validate/references/workspace-mode.md` for the full instructions. Do not act on this section from the summary above.

## Preflight: Infrastructure Verification

After verifying prerequisites, check whether the spec declares `infra_requirements`. If so, run the infrastructure preflight before proceeding to validation checks.

**`--no-infra` resolution:** Read `--no-infra` flag from arguments. If not passed, check `ADEV_NO_INFRA` env var (only exact value `1` activates bypass). Read once at skill entry, convert to `options.noInfra`. The agent must never set `--no-infra` or `ADEV_NO_INFRA` autonomously — if preflight fails, report the failure and wait for user direction.

**Invocation:** Run the preflight via the CLI:

```bash
adev preflight run --spec <specPath> [--plan <planPath>] [--timeout N] [--no-infra]
```

Where `<specPath>` is the `--spec` argument and `<planPath>` is the `--plan` argument (omit `--plan` when not provided). Stdout is a single JSON object — the preflight report. Exit codes: 0 on PASS or skipped, 2 on FAIL, 1 on argument errors.

If `report.passed === false`, display the formatted report and block:

```
Execution blocked. Options:
  1. Fix the issues above and retry
  2. Re-run with --no-infra to bypass (user decision only)
```

If `report.passed === true` and `report.skipped === true`, emit: "Infrastructure preflight skipped (--no-infra)."

If `lib/infra-preflight.mjs` fails to import, block with: "Infrastructure preflight library could not be loaded: <error>. Fix the library before proceeding."

## Step 0: Load Check Registry

Resolves the check registry and each entry prompt URI before any check runs.

> **Conditional loading:** Read `skills/validate/references/step-0-load-check-registry.md` for the full instructions. Do not act on this section from the summary above.

## Execution Strategy

Ordering, parallelism, and fail-fast rules across the whole check set.

> **Conditional loading:** Read `skills/validate/references/execution-strategy.md` for the full instructions. Do not act on this section from the summary above.

## The Checks

> **Source of truth for per-check prompts:** As of `validate-config-single-source.spec.md`, the substantive prompt body for each subagent-review / deterministic-check / observational check lives in `skills/validate/checks/<id>.md`, referenced from the registry via the `plugin:validate/checks/<id>.md` URI. The sections below describe each check's purpose, orchestration semantics, and execution guards. The dispatch loop reads the prompt from the registry entry's `resolvedPromptPath`, not from the prose in this file. When the two diverge, the externalized file wins.

### Check 1: Quality Gates (fail-fast, tiered)

Runs the resolved gate set in tiers and fails fast. Emits exactly one validator_report for the whole check.

> **Conditional loading:** Read `skills/validate/references/checks-orchestration/check-1-quality-gates.md` for the full instructions. Do not act on this section from the summary above.

### Check 1.5: Source Manifest Verification

Verifies the source manifest matches what the implementation actually touched.

> **Conditional loading:** Read `skills/validate/references/checks-orchestration/check-1.5-source-manifest.md` for the full instructions. Do not act on this section from the summary above.

### Check 1.6: Code-Side Drift Warning

Advisory only: warns when code has drifted from the spec since implementation.

> **Conditional loading:** Read `skills/validate/references/checks-orchestration/check-1.6-code-drift.md` for the full instructions. Do not act on this section from the summary above.

### Check 2: Spec Compliance

Subagent review of implementation against the spec, including the scope-expansion sub-finding.

> **Conditional loading:** Read `skills/validate/references/checks-orchestration/check-2-spec-compliance.md` for the full instructions. Do not act on this section from the summary above.

### Check 4: Constitution Compliance

Subagent review against the constitution, under the evidence-citation contract.

> **Conditional loading:** Read `skills/validate/references/checks-orchestration/check-4-constitution.md` for the full instructions. Do not act on this section from the summary above.

### Check 8: Boundary Compliance

Deterministic CLI read (adev boundaries check --json). SKIPs when the project declares no boundary rules.

> **Conditional loading:** Read `skills/validate/references/checks-orchestration/check-8-boundaries.md` for the full instructions. Do not act on this section from the summary above.

### Check 9: Transition Gates

Deterministic CLI read (adev gate transitions --json). SKIPs with no implement-to-validate transition.

> **Conditional loading:** Read `skills/validate/references/checks-orchestration/check-9-transition-gates.md` for the full instructions. Do not act on this section from the summary above.

### Check 11: Visual Verification (UI projects)

Runs only for UI implementations that clear the trigger guard.

> **Conditional loading:** Read `skills/validate/references/checks-orchestration/check-11-visual-verification.md` for the full instructions. Do not act on this section from the summary above.

## Per-Check Event Emission

Which lifecycle events each check emits, and their payloads.

> **Conditional loading:** Read `skills/validate/references/per-check-event-emission.md` for the full instructions. Do not act on this section from the summary above.

## Report Format

The exact structure of the PASS/FAIL report, including the migration-orientation footer.

> **Conditional loading:** Read `skills/validate/references/report-format.md` for the full instructions. Do not act on this section from the summary above.

## Overall Status

How per-check outcomes roll up into the single PASS/FAIL verdict.

> **Conditional loading:** Read `skills/validate/references/overall-status.md` for the full instructions. Do not act on this section from the summary above.

## Step Z: Emit lifecycle completion event

After the validation report has been written to disk (Step 14 / atomic-write commit), emit the matching exit event paired with Step 0a's `started` emission. The verdict is the aggregate computed from the consolidated check results:

- All dispatched checks PASS → `--verdict PASS`
- At least one check returned PASS_WITH_NOTES, no FAILs → `--verdict PASS_WITH_NOTES`
- Any FAIL → `--verdict FAIL`

```bash
adev report --type step --spec <spec-path> --step validate --status completed --verdict <aggregate> --from-summary
```

This event is REQUIRED. Without it, the lifecycle log shows `lifecycle_step:validate started` with no terminal event, and any future skill that gates on validate completion will block permanently.

## After Validation

What to do with the verdict, including the migration-orientation footer.

> **Conditional loading:** Read `skills/validate/references/after-validation.md` for the full instructions. Do not act on this section from the summary above.

## Red Flags

**Never:**
- Continue to Checks 2-13 if Check 1 (Quality Gates) failed
- Skip any of the dispatched registry checks (except when fail-fast applies to Check 1, or when the `quick` rigor tier is resolved — see Execution Strategy → Resolve Rigor Tier)
- Report PASS when any check has unresolved failures
- Modify implementation code during validation (validation is read-only, except `--fix` for lint/formatting)
- Trust implementer claims without reading the actual code
- Skip specialist review when the scoring algorithm produces matches
- Skip visual verification for UI files when Playwright is not available (block and ask the user to install it — Case B in the Check 11 trigger guard)
- Record SKIP for Check 11 when UI files ARE present (SKIP is only valid when no UI files are touched — Cases A and D)
- Suggest merging to a protected branch (always suggest PR for protected branches)

## API reference

Lifecycle event log:

- `currentState(projectRoot, specPath)` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — read the projection. `state.steps.validate` aggregates this skill's per-check results.
- `requireGate(state, "implement", { mode })` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — hard-blocks (or warns) when implementation is not complete.
- `resolveGateMode(loadManifest(projectRoot))` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — resolves `manifest.lifecycle.gate_mode`.
- `reportStep(projectRoot, specPath, { step: "validate", status })` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — emits skill entry/exit.
- `reportValidator(projectRoot, specPath, { step, validator, verdict, error, score, duration_ms })` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — emits one event per check. Severity is stamped at write time.

Rigor tiers:

- `resolveRigorMode({ skill: "validate", riskLevel, policies, tierOverride, routingEasy })` from `<ADEV_ROOT>/lib/governance/rigor-mode.mjs` — resolves `full` | `quick` (Execution Strategy). Precedence: tier override > routing signal > risk policy (`validate_mode`) > `full`.
- `loadRigorPolicies(projectRoot)` from `<ADEV_ROOT>/lib/governance/rigor-mode.mjs` — reads `risk-policies.yaml` `policies` map.

Manifest:

- `loadManifest(projectRoot)` from `<ADEV_ROOT>/lib/manifest.mjs` — parses `.context-index/manifest.yaml`.
