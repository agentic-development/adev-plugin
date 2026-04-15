---
charter: tiered-test-gates
status: review-passed
risk_level: medium
revision: 2
charter-revision: 2
created: 2026-04-15
updated: 2026-04-15
---

# Live Spec: E2E Playwright Scripts

## Behavioral Contract

### Preconditions

- `.context-index/manifest.yaml` contains a `gates.e2e` section with one or more commands
- The gate resolution rules from `tiered-gate-schema.md` apply (including `smoke`/`full` sub-key handling)
- The E2E gate commands are project-defined shell strings (e.g., `npx playwright test`, `npm run test:e2e:smoke`)

### Behaviors

1. **When** `gates.e2e` is defined with direct command keys (e.g., `test: "npx playwright test"`) **then** the commands are treated as a leaf tier — all commands share the tier's severity (default: `warning`). Commands execute sequentially during `/adev:validate` Check 1c.

2. **When** `gates.e2e` is defined with `smoke` and/or `full` sub-keys **then** each sub-key is treated as a named command group. `smoke` commands execute first with default `severity: error`. `full` commands execute second with default `severity: warning`. If `smoke` exits non-zero with error severity, `full` is skipped.

3. **When** E2E gate commands execute during `/adev:validate` Check 1c **then** they run independently of Check 11 (Visual Verification). Check 1c runs automated test scripts via shell commands (`child_process`). Check 11 runs agent-driven visual inspection via Playwright MCP snapshots (`browser_navigate`, `browser_snapshot`). These are separate systems: E2E gate commands invoke Playwright via shell (e.g., `npx playwright test`) and have no dependency on the Playwright MCP server used by Check 11. Both checks execute in the same validation run. **Execution order:** Check 1c runs as part of the Check 1 tier sequence (before Checks 2–10). Check 11 runs at its defined position. Application state isolation between the two is the project's responsibility (e.g., use separate test databases or reset state between suites).

4. **When** an E2E gate command exits non-zero with `severity: warning` **then** it is recorded in the validation report as WARN with command output (truncated to 8 KB per stream). The overall validation does not fail. Subsequent checks (2–11) continue.

5. **When** an E2E gate command exits non-zero with `severity: error` (e.g., `smoke` sub-key default) **then** it is treated as a Check 1 failure — subsequent tiers and Checks 2–10 are skipped (Check 11 exception for UI files preserved). The report's overall status is FAIL.

6. **When** `gates.e2e` contains both direct commands and `smoke`/`full` sub-keys **then** direct commands are ignored and a warning is emitted per tiered-gate-schema spec Behavior 5.

7. **When** `/adev:implement` executes **then** E2E gates do NOT run. This exclusion is enforced by the implement-integration-gate spec (Behavior 9), which explicitly limits implementation to fast and integration tiers only. E2E gates execute only during `/adev:validate` Check 1c.

### Postconditions

- E2E gate results appear in the Check 1c section of the validation report
- Check 11 (Visual Verification) results appear separately, unaffected by E2E gate outcomes
- The report distinguishes between scripted E2E test results (Check 1c) and visual verification results (Check 11)

### Error Cases

| Condition | Expected Behavior | Status |
|-----------|-------------------|--------|
| Playwright CLI not installed and E2E command references it | Report as FAIL with shell error ("command not found"). Treat per sub-key severity. Does NOT trigger the Check 11 Playwright MCP installation block — these are separate systems (shell CLI vs MCP server). | FAIL/WARN |
| `smoke` sub-key passes but `full` sub-key exits non-zero | `smoke` recorded as PASS, `full` recorded per its severity (default WARN). Overall validation continues. | WARN |

## System Constitution Reference

- **Principle 2: "Skills are primarily markdown"** — E2E gate execution is described in SKILL.md as instructions. The commands are shell strings declared in manifest.yaml and executed by the agent. No companion code required.
- **Principle 1: "Minimize external dependencies"** — The framework does not install or manage Playwright. Projects declare their own E2E test commands. The framework only executes them.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Add Check 1c documentation to validate SKILL.md | Document the E2E sub-check in Check 1, covering both leaf-tier and smoke/full sub-key modes. Clarify the separation from Check 11 (shell CLI vs Playwright MCP). Note execution order and state isolation responsibility. | small |
| Update templates/manifest.yaml | Add commented E2E gate examples showing both direct commands and smoke/full sub-keys. | small |

## Acceptance Criteria

- [ ] E2E tier commands execute during `/adev:validate` Check 1c
- [ ] E2E gates do NOT execute during `/adev:implement` (enforced by implement-integration-gate Behavior 9)
- [ ] Leaf-tier E2E (direct commands) uses default `severity: warning`
- [ ] `smoke` sub-key uses default `severity: error`; `full` sub-key uses default `severity: warning`
- [ ] `smoke` failure with error severity skips `full` and triggers fail-fast
- [ ] E2E gate results appear separately from Check 11 (Visual Verification) in the report
- [ ] Check 1c uses shell-based Playwright (`npx playwright test`), independent of Playwright MCP server
- [ ] Mixed direct commands and sub-keys in `e2e` emits warning and ignores direct commands
- [ ] `templates/manifest.yaml` includes commented E2E gate examples
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
