---
charter: tiered-test-gates
status: superseded
risk_level: low
revision: 2
charter-revision: 2
created: 2026-04-15
updated: 2026-04-15
---

# Live Spec: Build Tier Passthrough

## Behavioral Contract

### Preconditions

- `/adev:build` is executing a pipeline for one or more specs
- `.context-index/manifest.yaml` exists (gates section may or may not be present)
- The tiered-gate-schema resolution rules apply to any gates configuration

### Behaviors

1. **When** `/adev:build` invokes `/adev:implement` (Step 4) and tiered gates are configured in manifest.yaml **then** the implement skill reads the manifest directly and resolves the tiered gates itself. The build orchestrator does not evaluate or execute gate commands — it delegates entirely to the invoked skill.

2. **When** `/adev:build` invokes `/adev:validate` (Step 5) and tiered gates are configured **then** the validate skill reads the manifest directly and applies the tiered sub-check structure (1a/1b/1c). The build orchestrator does not evaluate or execute gate commands.

3. **When** the implement step (Step 4) fails due to integration gate failure **then** the build pipeline stops for that spec. Build state records the failure with context: tier name, failing command, and severity. The validate step (Step 5) does not execute.

4. **When** the validate step (Step 5) reports a PASS status but contains warning-severity tier failures in its warnings section **then** the build pipeline interprets this as PASS_WITH_WARNINGS. Build state records the warnings but does not treat the result as a build failure.

5. **When** `--dry-run` is passed **then** the build orchestrator reads the `gates:` section of manifest.yaml for display purposes only (tier names and command keys, not evaluating or executing them). It shows a summary line: "Gates: fast (test, lint), integration (test), e2e (smoke)" or "Gates: flat (test)" or "Gates: none configured." This is a display-only read, not gate resolution — the orchestrator does not apply fallback rules, severity defaults, or tier ordering. It reports what is declared in the YAML as-is.

6. **When** gates are not configured (empty or missing `gates:` section) **then** both implement and validate skills handle this per their own specs. The build pipeline executes Steps 4 and 5 with no tier-related state, producing the same outcomes as today. The dry-run preview shows "Gates: none configured."

### Postconditions

- The build orchestrator's pipeline report includes gate tier information for each spec processed
- Build state reflects tier-specific failures (which tier failed, which command, severity)
- The build orchestrator contains no gate evaluation or execution logic — it is a delegation layer that reads tier names for dry-run display only

### Error Cases

| Condition | Expected Behavior | Status |
|-----------|-------------------|--------|
| Implement step fails on integration gates | Build stops for this spec. Build state records tier-specific failure context. Next spec in batch (if `--phase`) proceeds independently. | FAIL |
| Validate step has warning-tier failures | Build records PASS_WITH_WARNINGS. Not treated as build failure. | WARN |

## System Constitution Reference

- **Principle 2: "Skills are primarily markdown"** — The build orchestrator delegates to implement and validate skills. Gate evaluation and execution logic lives in those skills, not in the orchestrator. The only manifest read in build is for dry-run display.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Update build SKILL.md for tiered gates | Update Step 4 stop conditions to include integration gate failure. Update Step 5 outcomes to include PASS_WITH_WARNINGS. Add dry-run gate tier summary (display-only read of manifest). Add Behavior 6 backward-compat note. | small |
| Update build state schema | Extend build state to record tier-specific failure context (tier name, command, severity) when failures are reported by implement or validate. | small |

## Acceptance Criteria

- [ ] Build orchestrator delegates gate evaluation and execution entirely to implement and validate skills
- [ ] Integration gate failure in implement step stops the build pipeline for that spec
- [ ] Warning-severity tier failures in validate are recorded as PASS_WITH_WARNINGS
- [ ] `--dry-run` preview shows configured gate tiers (display-only read, no resolution logic)
- [ ] Build state records tier-specific failure context (tier, command, severity)
- [ ] No-gates path produces identical outcomes to current behavior (Behavior 6)
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
