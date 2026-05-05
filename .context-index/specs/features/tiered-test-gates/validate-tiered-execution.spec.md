---
charter: tiered-test-gates
status: superseded
risk_level: medium
revision: 2
charter-revision: 2
created: 2026-04-15
updated: 2026-04-15
---

# Live Spec: Validate Tiered Execution

## Behavioral Contract

### Preconditions

- `.context-index/manifest.yaml` exists with a `gates:` section (flat or tiered)
- The gate resolution rules from `tiered-gate-schema.md` apply — TierConfig is resolved before execution begins
- `/adev:validate` has been invoked with `--spec <path>`

### Behaviors

1. **When** TierConfig contains tiered gates (fast, integration, e2e) **then** Check 1 is split into sub-checks: Check 1a (fast tier), Check 1b (integration tier), Check 1c (e2e tier). Each sub-check runs its commands sequentially. If a command within a tier exits non-zero with `severity: error`, remaining commands in that tier are skipped (intra-tier fail-fast). If a command exits non-zero with `severity: warning`, the failure is recorded as WARN and the next command in the tier proceeds.

2. **When** TierConfig uses fallback mode (flat `gates.test` auto-wrapped into `gates.fast`) **then** Check 1 executes as a single check using the existing "Check 1" label (no sub-check notation). Check 1b and 1c are skipped silently. Report format is identical to the current single-gate model — no visible change for existing projects.

3. **When** a tier with `severity: error` contains a command that exits non-zero **then** all subsequent tiers are skipped and Checks 2–10 are skipped. The report includes the failing tier, command, exit code, and stdout/stderr output (truncated to last 8 KB per stream). The report's overall status is FAIL. **Exception:** Check 11 (Visual Verification) follows its existing independent trigger rules for UI files — if the spec references UI files, Check 11 is noted as pending regardless of Check 1 outcome (preserving current SKILL.md behavior).

4. **When** a tier with `severity: warning` contains a command that exits non-zero **then** the failure is recorded as WARN in the report. Subsequent tiers continue executing. Checks 2–11 continue executing. The report's overall status is not affected by warning-tier failures alone.

5. **When** a tier is not defined in the TierConfig (e.g., no `gates.integration`) **then** the corresponding sub-check is skipped with a note: "<tier> tier not configured — skipped." The next defined tier executes.

6. **When** `--fix` is passed and a fast-tier lint or formatting gate fails **then** the auto-fix attempt runs before reporting (existing behavior). If the fix resolves the failure, the gate is recorded as PASS (auto-fixed). Auto-fix applies only to the fast tier — integration and e2e commands are never auto-fixed.

7. **When** `governance/gates.yaml` exists **then** it takes precedence over manifest gates for Check 1 (existing behavior from tiered-gate-schema spec, Behavior 9). Governance gates always execute as a flat Check 1 — they follow their own schema (`kind`, `command`, `required` fields) and do not support tiered sub-checks. The tiered sub-check structure (1a/1b/1c) only applies when manifest gates are used as fallback (i.e., governance/gates.yaml does not exist).

8. **When** all tiers pass (or only warning-severity tiers fail) **then** Checks 2–11 proceed as normal. The report includes a tier summary showing each tier's status, commands run, and duration.

9. **When** Check 1 resolves gate sources **then** the resolution order is: (1) `governance/gates.yaml` if it exists (flat execution, existing behavior), (2) `manifest.yaml` `gates:` section (tiered or flat per resolution rules). The constitution's Quality Gates section (`## Quality Gates` in `constitution.md`) is the human-readable source from which `manifest.yaml` `gates:` values are derived — it is not a separate runtime fallback. If both governance and manifest gates are absent, Check 1 is skipped per Behavior 6 in tiered-gate-schema spec.

### Postconditions

- Check 1 in the validation report shows sub-checks (1a, 1b, 1c) when tiered manifest gates are configured and governance/gates.yaml does not exist
- In fallback mode (flat gates) or governance mode, Check 1 uses the existing single-check label
- Each sub-check reports a GateResult per command: tier name, command, pass/fail/warn/skip status, duration, and output for failures
- The fail-fast semantic is preserved: error-severity failure in any tier stops subsequent tiers and Checks 2–10 (Check 11 exception for UI files preserved)
- Warning-severity failures are aggregated in the report's warnings section

### Error Cases

| Condition | Expected Behavior | Status |
|-----------|-------------------|--------|
| A gate command exits non-zero | Report as tier's severity (FAIL for error, WARN for warning) with command output (truncated to 8 KB) | FAIL/WARN |
| A gate command is not found (e.g., `npx playwright` not installed) | Report as FAIL with the shell error. Treat per tier's severity. | FAIL/WARN |
| TierConfig has zero tiers (empty/missing gates) | Skip Check 1 entirely. Emit suggestion per tiered-gate-schema spec Behavior 6. Proceed to Check 2. | SKIP |

## System Constitution Reference

- **Principle 2: "Skills are primarily markdown"** — Tiered execution logic is described in SKILL.md instructions. No executable code is required for gate resolution; the skill reads manifest.yaml and applies the resolution rules inline.
- **Principle 1: "Minimize external dependencies"** — Gate commands are executed via shell (`child_process`), consistent with current behavior. No new dependencies.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Update validate SKILL.md Check 1 | Rewrite Check 1 to read tiered gates from manifest.yaml using the resolution rules from tiered-gate-schema spec. Split into sub-checks 1a/1b/1c with fail-fast between error-severity tiers and warn-through for warning-severity tiers. Preserve governance/gates.yaml precedence as flat Check 1. Remove constitution Quality Gates as a separate fallback (manifest.yaml is the runtime source). | medium |
| Add tier summary to report format | Extend the validation report template to include a tier summary section after Check 1, showing each tier's status, commands, and duration. | small |
| Update Check 1 documentation | Ensure the existing fail-fast note, `--fix` behavior, and Check 11 UI exception documentation in SKILL.md reflects the tiered structure. | small |

## Acceptance Criteria

- [ ] Check 1 splits into sub-checks 1a/1b/1c when tiered manifest gates are configured (and governance/gates.yaml absent)
- [ ] Fallback mode (flat `gates.test`) uses existing "Check 1" label with no sub-check notation
- [ ] Governance/gates.yaml executes as flat Check 1 (no tiered sub-checks, existing behavior)
- [ ] Error-severity tier failure stops subsequent tiers and skips Checks 2–10 (Check 11 exception preserved)
- [ ] Warning-severity tier failure records WARN and allows subsequent tiers and checks to proceed
- [ ] Intra-tier fail-fast: if a command within an error-severity tier fails, remaining commands in that tier are skipped
- [ ] Undefined tiers are skipped with an informational note
- [ ] `--fix` auto-fix applies only to fast tier
- [ ] Gate resolution order is: governance → manifest (constitution is not a separate runtime fallback)
- [ ] Tier summary appears in the validation report with GateResult per command (status, duration, output)
- [ ] Command output in reports is truncated to 8 KB per stream
- [ ] Empty/missing gates section skips Check 1 and emits a suggestion
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
