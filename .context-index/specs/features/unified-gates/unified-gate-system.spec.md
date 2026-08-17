---
charter: unified-gates
status: validated
risk_level: medium
revision: 2
charter-revision: 2
created: 2026-04-15
updated: 2026-04-15
supersedes:
  - .context-index/specs/features/tiered-test-gates/tiered-gate-schema.md
  - .context-index/specs/features/tiered-test-gates/validate-tiered-execution.md
  - .context-index/specs/features/tiered-test-gates/implement-integration-gate.md
  - .context-index/specs/features/tiered-test-gates/build-tier-passthrough.md
  - .context-index/specs/features/tiered-test-gates/e2e-playwright-scripts.md
source-manifest:
  sha: "7ceb782"
  files:
    - templates/gates-template.yaml
    - templates/manifest-template.yaml
    - skills/validate/SKILL.md
    - skills/implement/SKILL.md
    - skills/build/SKILL.md
    - skills/hygiene/SKILL.md
    - skills/init/SKILL.md
    - tests/templates/gates-template.test.mjs
    - tests/templates/manifest-template.test.mjs
    - .context-index/specs/features/unified-gates/unified-gate-system.spec.md
    - .context-index/specs/features/unified-gates/charter.md
    - .context-index/constitution.md
  computed-at: "2026-04-25T21:55:13.860Z"
drift_detected: true
---

# Live Spec: Unified Gate System

## Behavioral Contract

### Preconditions

- `.context-index/governance/gates.yaml` may or may not exist
- `manifest.yaml` may or may not contain a legacy `gates:` section
- Skills that consume gates (validate, implement, build, hygiene, review-specs) are invoked during the adev lifecycle

### Behaviors

#### Schema and Resolution

1. **When** `governance/gates.yaml` exists and contains a `gates:` list **then** each gate entry is parsed with fields: `id` (required), `name`, `kind`, `tier`, `command`, `scope`, `required`, `severity`, `triggers`, `group` (e2e-only). Gates are grouped by `tier` into an ordered execution sequence (fast -> integration -> e2e).

2. **When** a gate omits `tier` **then** it defaults to `fast`.

3. **When** a gate omits `kind` **then** it defaults to `deterministic`.

4. **When** a gate omits `severity` **then** the tier default applies: `error` for fast and integration, `warning` for e2e.

5. **When** a gate has `required: false` **then** its effective severity is `warning` regardless of any explicit `severity` value or tier default.

6. **When** a gate has `kind: probabilistic` **then** it should not have a `command` field. If a `command` is present, it is ignored and a warning is emitted: "Gate '<id>' is probabilistic but has a command — command ignored." Skills skip probabilistic gates during shell execution with note: "Gate '<id>' is probabilistic — requires manual or eval-based verification."

7. **When** an e2e-tier gate has a `group` field set to `smoke` or `full` **then** gates in the `smoke` group execute before `full`. Default severity: `error` for smoke, `warning` for full. If a smoke gate fails with error severity, full gates are skipped.

#### Validate Check 1 — Tiered Execution

8. **When** `/adev:validate` runs Check 1 and `governance/gates.yaml` exists **then** it reads gates, groups by tier, and executes as sub-checks: Check 1a (fast), Check 1b (integration), Check 1c (e2e). Each sub-check runs its tier's deterministic gates sequentially.

9. **When** a gate with `severity: error` exits non-zero **then** remaining gates in that tier — regardless of their individual severity — are skipped with status `skip` (intra-tier fail-fast), all subsequent tiers are skipped, and Checks 2-10 are skipped. Check 11 follows its existing independent UI trigger rules.

10. **When** a gate with `severity: warning` exits non-zero **then** the failure is recorded as WARN. Remaining gates in the tier and subsequent tiers continue. Checks 2-11 proceed.

11. **When** TierConfig has no gates assigned to a tier **then** that sub-check is skipped with note: "<tier> tier — no gates configured, skipped."

12. **When** `--fix` is passed and a fast-tier gate fails **then** auto-fix is attempted (existing behavior). Integration and e2e gates are never auto-fixed.

#### Implement Step 2-post — Integration Gate

13. **When** all tasks in `/adev:implement` are complete and `governance/gates.yaml` defines integration-tier gates **then** those gates execute before Step 3 (Final Review). Failure with error severity blocks implementation. Warning severity records WARN and proceeds.

14. **When** `--task <N>` is passed (single-task re-run) **then** the integration gate step is skipped.

15. **When** no integration-tier gates are defined **then** Step 2-post is skipped silently (current behavior preserved).

#### Build — Delegation

16. **When** `/adev:build` invokes implement or validate **then** those skills read `governance/gates.yaml` directly. The build orchestrator delegates entirely — it does not evaluate or execute gates.

17. **When** `/adev:build --dry-run` is passed **then** it reads `governance/gates.yaml` for display only, showing tier names and gate IDs: "Gates: fast (test, lint), integration (test), e2e (smoke)".

#### Explicit Skip Reporting

18. **When** `governance/gates.yaml` does not exist **then** Check 1 reports SKIP with advisory: "No governance/gates.yaml found. Quality gates are not configured. Run `/adev:init` to set up gates."

19. **When** `governance/gates.yaml` does not exist **then** Check 8 (Boundary Compliance) reports SKIP: "No governance directory configured." Check 9 (Transition Gates) reports SKIP: "No transitions configured." Neither reports PASS.

20. **When** `governance/gates.yaml` exists but contains misconfiguration (empty gates list, gate ID referenced in transitions but not defined, invalid severity value) **then** the affected check reports WARN with specific details, not silent PASS.

21. **When** the validation report is generated **then** the summary includes a count of skipped checks with a setup guidance line if any checks were skipped due to missing configuration.

#### Manifest Gates Removal

22. **When** `/adev:init` scaffolds a new project **then** it generates `governance/gates.yaml` from the updated template. The manifest template no longer contains a `gates:` section.

23. **When** `/adev:hygiene` or `/adev:validate` detects a `gates:` section in `manifest.yaml` **then** it emits a migration warning: "Legacy gates: section found in manifest.yaml. This is no longer used. Move gate definitions to governance/gates.yaml."

23b. **When** `/adev:init` detects an existing `manifest.yaml` with a `gates:` section and no `governance/gates.yaml` **then** it prints a migration notice: "Legacy gates found in manifest.yaml. To adopt the unified gates system, move your gate definitions to governance/gates.yaml." and offers to scaffold `governance/gates.yaml` from the template.

#### Transitions

24. **When** `governance/gates.yaml` contains a `transitions` section **then** validate Check 9 reads `required_gates` and verifies each referenced gate ID was executed and passed in Check 1. `approver_role` is noted as informational.

25. **When** review-specs reads `transitions.spec-to-plan` **then** it notes the `approver_role` in the review report footer (unchanged behavior, same file location).

#### Hygiene Pass 8

26. **When** `/adev:hygiene` runs Pass 8 **then** it validates `governance/gates.yaml` structure: YAML parseable, gate IDs unique, `tier` values valid (fast/integration/e2e), transition `required_gates` reference existing gate IDs, `severity` values valid (error/warning).

#### Template

27. **When** the `gates-template.yaml` is generated **then** it includes commented examples showing a full gate definition with all fields (`id`, `name`, `kind`, `tier`, `command`, `scope`, `required`, `severity`, `triggers`) and a transitions section.

### Postconditions

- `governance/gates.yaml` is the sole source of truth for gate definitions — no fallback chains, no precedence rules
- All consuming skills (validate, implement, build, hygiene, review-specs) read from `governance/gates.yaml` only
- Validation reports never show PASS for checks that were not executed — they show SKIP with guidance
- Misconfigured gates produce WARN with actionable details
- The manifest template no longer contains a `gates:` section
- Existing projects with `manifest.yaml gates:` receive a migration warning

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `governance/gates.yaml` does not exist | Check 1 SKIP with advisory to run `/adev:init` | SKIP |
| `governance/gates.yaml` is malformed YAML | Check 1 FAIL with parse error details | FAIL |
| Gate has empty `command` and `kind: deterministic` | WARN: "Gate '<id>' has no command — skipped" | WARN |
| Gate has `kind: probabilistic` with a `command` | WARN: "Gate '<id>' is probabilistic but has a command — command ignored" | WARN |
| `severity` value is not `error` or `warning` | WARN: "Invalid severity '<value>' for gate '<id>', defaulting to error" | WARN |
| Transition references nonexistent gate ID | WARN: "Transition '<id>' references unknown gate '<gate-id>'" | WARN |
| Duplicate gate IDs | WARN: "Duplicate gate ID '<id>' — second definition ignored" | WARN |
| `manifest.yaml` contains legacy `gates:` section | Migration warning emitted by hygiene and validate | WARN |
| Gate has invalid `tier` value (not fast/integration/e2e) | WARN: "Gate '<id>' has invalid tier '<value>', defaulting to fast" | WARN |
| Gate command not found on PATH | Report as FAIL with shell error, treat per gate's severity | FAIL/WARN |
| Command output exceeds 8 KB | Truncate to last 8 KB per stream (stdout/stderr) | — |

## System Constitution Reference

- **Principle 2: "Skills are primarily markdown"** — Gate resolution logic is described in skill markdown instructions, not as required executable code. Each consuming skill reads `governance/gates.yaml` and applies the resolution rules inline.
- **Principle 1: "Minimize external dependencies"** — No new dependencies. YAML parsing uses whatever the skill's host environment provides. Shell commands are executed via `child_process`.
- **Architecture Boundary: "Changing the hook protocol"** requires human approval — this spec does not change the hook protocol. Gate execution remains shell-based via skill instructions.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Update gates-template.yaml | Rewrite template with unified schema: `id`, `name`, `kind`, `tier`, `command`, `scope`, `required`, `severity`, `triggers`, plus `transitions` section | medium |
| Update validate SKILL.md Check 1 | Remove governance-vs-manifest precedence logic. Read `governance/gates.yaml` only. Group by tier, execute as 1a/1b/1c with fail-fast. | medium |
| Update validate SKILL.md Checks 8-9 | Change Check 8 (boundaries) and Check 9 (transitions) from silent PASS to SKIP when governance is absent. Add WARN for misconfiguration. | small |
| Add skip summary to validate report | Add a summary line at end of report counting skipped checks with setup guidance | small |
| Update implement SKILL.md Step 2-post | Change gate source from manifest to `governance/gates.yaml`. Read integration-tier gates only. | small |
| Update build SKILL.md | Change dry-run display to read `governance/gates.yaml`. Remove manifest gate references. | small |
| Update hygiene SKILL.md Pass 8 | Validate unified schema structure (tier values, severity values, gate ID uniqueness, transition refs) | small |
| Update manifest-template.yaml | Remove `gates:` section from manifest template | small |
| Add legacy gates detection | Add migration warning to validate and hygiene when `manifest.yaml` contains `gates:` | small |
| Update /adev:init scaffolding | Generate `governance/gates.yaml` during init. Remove manifest gates generation. | medium |
| Mark superseded specs | Set status to `superseded` on 5 tiered-test-gates specs | small |

## Acceptance Criteria

- [ ] `governance/gates.yaml` with tiered gates (gates assigned to fast/integration/e2e tiers) is correctly resolved into an ordered TierConfig
- [ ] Gates without explicit `tier` default to `fast`
- [ ] Gates without explicit `kind` default to `deterministic`
- [ ] Gates without explicit `severity` get tier defaults: `error` for fast/integration, `warning` for e2e
- [ ] `required: false` forces `severity: warning` regardless of other settings
- [ ] `kind: probabilistic` gates are skipped during shell execution with an informational note
- [ ] E2E gates with `group: smoke` execute before `group: full` with independent severity defaults
- [ ] Validate Check 1 splits into sub-checks 1a/1b/1c when `governance/gates.yaml` exists
- [ ] Error-severity gate failure stops subsequent tiers and skips Checks 2-10 (Check 11 exception preserved)
- [ ] Warning-severity gate failure records WARN and allows subsequent checks to proceed
- [ ] Intra-tier fail-fast: error-severity failure within a tier skips remaining gates in that tier
- [ ] Undefined tiers are skipped with an informational note
- [ ] `--fix` auto-fix applies only to fast tier
- [ ] Implement Step 2-post reads integration-tier gates from `governance/gates.yaml`
- [ ] Build dry-run displays tier summary from `governance/gates.yaml`
- [ ] Implement Step 2-post is skipped when `--task <N>` is passed (single-task re-run)
- [ ] Check 1 reports SKIP (not PASS) when `governance/gates.yaml` does not exist
- [ ] Check 8 reports SKIP (not PASS) when governance directory is absent
- [ ] Check 9 reports SKIP (not PASS) when no transitions are configured
- [ ] Misconfigured gates produce WARN with actionable details
- [ ] Validation report summary includes count of skipped checks with setup guidance
- [ ] Legacy `gates:` section in `manifest.yaml` triggers a migration warning
- [ ] `manifest-template.yaml` no longer contains a `gates:` section
- [ ] `gates-template.yaml` uses the unified schema with all fields
- [ ] `/adev:init` scaffolds `governance/gates.yaml` instead of manifest gates
- [ ] Hygiene Pass 8 validates unified schema structure
- [ ] Transition `required_gates` reference existing gate IDs
- [ ] Command output truncated to 8 KB per stream in failure reports
- [ ] All 5 tiered-test-gates specs marked as `superseded`
- [ ] All quality gates pass
- [ ] No constitutional violations introduced
