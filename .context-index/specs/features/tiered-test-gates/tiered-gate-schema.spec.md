---
charter: tiered-test-gates
status: superseded
risk_level: medium
revision: 2
charter-revision: 2
created: 2026-04-14
updated: 2026-04-14
---

# Live Spec: Tiered Gate Schema

## Behavioral Contract

### Preconditions

- A `.context-index/manifest.yaml` file exists and contains a `gates:` section
- The `gates:` section contains either flat keys (e.g., `gates.test: "npm test"`) or tiered keys (`gates.fast`, `gates.integration`, `gates.e2e`)

### Behaviors

1. **When** `manifest.yaml` contains `gates.fast`, `gates.integration`, or `gates.e2e` keys **then** the skill resolves a tiered TierConfig with each defined tier in order (fast → integration → e2e), each containing its declared commands.

2. **When** `manifest.yaml` contains flat gate keys (e.g., `gates.test: "npm test"`, `gates.lint: "npm run lint"`) without any tier keys **then** all flat keys are auto-wrapped into `gates.fast` and the TierConfig uses fallback mode.

3. **When** a tier declares a `severity` key **then** that value (`error` or `warning`) is used for all commands in that tier.

4. **When** a tier does not declare a `severity` key **then** the default severity applies: `error` for `fast` and `integration`, `warning` for `e2e`.

5. **When** the `e2e` tier contains direct command keys (e.g., `test: "npx playwright test"`) **then** it is treated as a leaf tier like `fast` and `integration` — all commands share the tier's severity. **When** the `e2e` tier instead contains `smoke` and/or `full` sub-keys **then** each sub-key is treated as a named command group with independent severity: `error` for `smoke`, `warning` for `full` by default. **When** `e2e` contains both direct commands and sub-keys **then** direct commands are ignored and a warning is emitted: "Mixed direct and sub-key commands in e2e tier. Direct commands ignored."

6. **When** `gates:` is empty or missing **then** the TierConfig contains zero tiers, skills skip gate execution, and emit a suggestion: "No quality gates configured in manifest.yaml. Add a `gates:` section to enable automated test execution. See the tiered-test-gates charter for schema options."

7. **When** both flat keys and tier keys coexist under `gates:` **then** the flat keys are ignored and a warning is emitted: "Mixed flat and tiered gates detected. Flat keys ignored: <list of ignored keys>."

8. **When** `gates:` contains keys that are not recognized tier names (`fast`, `integration`, `e2e`) and are not flat command keys (string values) **then** a warning is emitted: "Unrecognized gate tier '<key>' ignored. Valid tiers: fast, integration, e2e."

9. **When** `governance/gates.yaml` exists **then** it takes precedence over `manifest.yaml` gates for `/adev:validate` Check 1 (existing behavior preserved). The tiered manifest gates serve as fallback when governance gates are not configured. `/adev:implement` and `/adev:build` always read from `manifest.yaml` gates regardless of governance.

10. **When** all implementation tasks in `/adev:implement` are complete **then** the `integration` tier (if defined) is executed before the final cross-task review. If the integration tier fails with `severity: error`, implementation halts and the failure is reported. If `severity: warning`, the warning is recorded and the cross-task review proceeds.

### Postconditions

- A TierConfig is resolved with zero or more tiers, each containing commands and a severity level
- Each consuming skill independently re-resolves gates from `manifest.yaml` using the resolution rules defined in this spec — there is no shared runtime object
- Any warnings or suggestions are emitted to the user

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `gates.fast` contains no commands | Warn: "fast tier declared but has no commands" — tier is skipped | WARN |
| `severity` value is not `error` or `warning` | Warn: "Invalid severity '<value>' for tier '<tier>', defaulting to error" | WARN |
| Gate command string is empty | Skip that command, warn: "Empty command for '<key>' in tier '<tier>'" | WARN |
| Unrecognized tier key | Warn: "Unrecognized gate tier '<key>' ignored" — key is skipped | WARN |
| `manifest.yaml` is malformed YAML | Skill fails with existing YAML parse error — no special handling | FAIL |

### Gate Command Format

Gate commands are shell strings passed to `child_process.execSync()` (or equivalent shell execution). They are treated as opaque shell commands, consistent with how the current `gates.test: "npm test"` works. No sanitization is applied — the manifest is a trusted, developer-authored configuration file under version control.

## System Constitution Reference

- **Principle 2: "Skills are primarily markdown"** — Gate resolution logic is described in skill markdown instructions, not as required executable code. Each consuming skill re-resolves gates by reading `manifest.yaml` and applying the rules from this spec. The resolution logic is documented once in this spec and referenced by other skills, not duplicated.
- **Principle 1: "Minimize external dependencies"** — No new dependencies. YAML parsing uses whatever the skill's host environment provides. Shell commands are executed via `child_process`.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Define tiered gates YAML schema | Document the `gates.fast`, `gates.integration`, `gates.e2e` structure with severity and command keys in manifest.yaml | small |
| Implement gate resolution logic in skill markdown | Write the resolution instructions as a reusable reference section: detect flat vs tiered, apply defaults, handle mixed keys, handle missing gates, handle unrecognized keys | medium |
| Update `templates/manifest.yaml` | Update the manifest template to include commented examples of tiered gates | small |
| Update validate SKILL.md | Modify Check 1 to read tiered config (as fallback after governance/gates.yaml), reference the resolution logic from this spec | medium |
| Update implement SKILL.md | Add integration tier execution after all tasks complete, before final cross-task review (Step 3) | small |
| Update build SKILL.md | Add tier-aware gate passthrough when invoking implement and validate | small |

## Acceptance Criteria

- [ ] `manifest.yaml` with tiered gates (`gates.fast.test`, `gates.integration.test`, `gates.e2e.smoke`) is correctly resolved into an ordered TierConfig
- [ ] `manifest.yaml` with flat gates (`gates.test: "npm test"`) is auto-wrapped into `gates.fast.test` — zero behavior change for existing projects
- [ ] Mixed flat and tiered keys emits a warning listing ignored keys and uses only tiered keys
- [ ] Missing or empty `gates:` section skips execution and suggests adding gates
- [ ] Default severity applies correctly: `error` for fast/integration, `warning` for e2e
- [ ] E2E tier with direct commands works as a leaf tier; E2E with smoke/full sub-keys works as a container with independent severity defaults
- [ ] Explicit `severity` on a tier overrides the default
- [ ] Invalid severity values default to `error` with a warning
- [ ] Unrecognized tier keys are ignored with a warning
- [ ] `governance/gates.yaml` takes precedence over manifest gates in validate (existing behavior preserved)
- [ ] Integration tier runs after all implement tasks, before cross-task review, with correct failure semantics
- [ ] `templates/manifest.yaml` includes commented tiered gates example
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
