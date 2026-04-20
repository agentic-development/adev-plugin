---
charter: test-strategies
charter-extension: true
status: review-passed
revision: 1
charter-revision: 2
created: 2026-04-20
updated: 2026-04-20
---

# Live Spec: Policy Strategy Profile

## Capability

The **policy** strategy profile drives RED/GREEN test cycles for policy-as-code validation. It targets infrastructure-as-code (IaC) plan output, Kubernetes manifests, Dockerfiles, and other declarative resource definitions. Tests pass when all policy rules pass against the input artifact; tests fail when any deny rule fires.

This profile is activated when `strategy: policy` is declared in the test configuration or when the `/adev:write-test` skill detects a Rego, Sentinel, or Checkov policy file alongside a plan or manifest artifact.

Permitted tools: Conftest, OPA, Sentinel, Checkov, tfsec, kubeconform, Hadolint.

---

## Behavioral Contract

### Preconditions

- A policy framework binary must be present and resolvable on `$PATH` (Conftest, OPA, Checkov, etc.).
- At least one policy file must exist (`.rego`, `.sentinel`, `.tf`, Checkov config).
- A plan or manifest input file must be present (Terraform plan JSON, Kubernetes YAML, Dockerfile, etc.).
- The policy file must be syntactically valid before the RED phase begins.

### Behaviors

#### 1. RED / GREEN Cycle

- **RED state:** the policy tool exits non-zero because at least one resource in the input violates a deny rule. The failure must be attributable to a resource property violation — not to a malformed policy file or missing input artifact.
- **GREEN state:** the policy tool exits zero; all deny rules pass against the input artifact, meaning every resource meets the required policy constraints.
- The cycle is complete only when a single, targeted code or configuration change causes the transition from RED to GREEN without modifying the policy rules themselves.

#### 2. Test Authoring

- Write Rego `deny` rules (or equivalent framework constructs) that check concrete resource property **values**, not merely key existence.
- Policy rules must cover security-sensitive properties: encryption settings, public access flags, privileged container flags, RBAC bindings, required tags/labels, open security group ingress.
- Each policy file must include at least one compliant fixture path and one non-compliant fixture path documented in comments or a companion test file.
- Policy rules must be scoped to specific resource types to avoid false positives on unrelated resources.

#### 3. Gaming Patterns (must be detected and blocked)

| Pattern | Detection Signal |
|---|---|
| Key existence check without value validation | `input.resource[_].field` used in condition without value comparison |
| Policy asserts only resource count | deny rule body reduces to `count(resources) == 0` with no property check |
| Policy passes on empty input | policy exits 0 when supplied an empty `{}` or `[]` fixture |
| Overly permissive allow rule | `allow { true }` or unconditional allow overriding deny rules |
| Thresholds on non-security properties only | policy covers naming conventions but skips encryption/access controls |

When a gaming pattern is detected, the hook must emit a `POLICY_GAMING_DETECTED` advisory with the specific pattern name and the line reference in the policy file.

#### 4. Assertion Rules

- Rego deny rules must compare property values to expected literals or sets (e.g., `input.encryption != "AES256"`), not merely assert property existence.
- Policies must cover at minimum one security-sensitive property per resource type under test.
- Test fixtures must include both a compliant resource and a non-compliant resource; the test suite must verify deny fires on the non-compliant fixture and does not fire on the compliant fixture.
- `abortOnFail` or equivalent early-exit behavior should be enabled so a catastrophic misconfiguration does not silently mask deny violations.

#### 5. Seed Data

- Terraform plan JSON or Kubernetes manifest fixtures with at least two variants: one resource set that passes all policies, one resource set that triggers at least one deny rule.
- Fixture files must be stored alongside policy files under a `fixtures/` or `testdata/` subdirectory.
- For Dockerfile policies, seed data must include a Dockerfile with a known violation (e.g., `USER root`, no `HEALTHCHECK`) and a compliant counterpart.

#### 6. Handoff (inputs the skill must surface)

The `/adev:write-test` skill must surface the following before generating test scaffolding:

| Field | Description |
|---|---|
| `policy_paths` | Glob or list of policy file paths (`.rego`, `.sentinel`, Checkov config) |
| `input_paths` | Plan JSON or manifest fixture paths (compliant + non-compliant) |
| `tool_command` | Full invocation command (e.g., `conftest test --policy ./policy plan.json`) |
| `expected_deny_count` | Number of deny violations expected for the non-compliant fixture |
| `framework` | Detected framework name (`conftest`, `opa`, `checkov`, `sentinel`, etc.) |

#### 7. RED Verification

Before declaring the cycle complete, the hook must verify that:

- The policy tool exits non-zero **because** a resource property violates a deny rule — not because the policy file has a syntax error or the input artifact is absent.
- The error output contains at least one deny rule name or violation message referencing a resource property.
- Switching to the compliant input fixture causes the tool to exit zero without modifying the policy rules.

### Error Cases

| Code | Trigger | Severity | Action |
|---|---|---|---|
| `POLICY_SYNTAX_ERROR` | Policy framework reports a parse or compilation error | Block | Emit the parse error details; do not proceed to RED phase |
| `POLICY_NO_FRAMEWORK` | No recognized policy tool binary found on `$PATH` | Advisory | List permitted tools; suggest installation path |
| `POLICY_NO_INPUT` | No plan/manifest input file found or path is invalid | Block | Emit guidance: specify input path before running |
| `POLICY_GAMING_DETECTED` | Gaming pattern detected in policy rule | Advisory | Emit pattern name and line reference; request revision |
| `POLICY_EMPTY_INPUT_PASS` | Policy exits 0 on empty `{}` or `[]` input | Block | Require input guard in policy or non-empty fixture |

---

## Constitution Reference

- **Principle: Tests must be falsifiable.** Policy tests that pass on empty input or check only key existence are not falsifiable and violate this principle.
- **Principle: RED must be caused by the subject under test.** A syntax error in the policy file is not a valid RED state; the resource must be the cause of failure.
- **Principle: Security properties are first-class.** Policies that omit encryption, public access, or privilege escalation checks are incomplete regardless of other coverage.

---

## Actionable Task Map

| Task | Owner | Depends On |
|---|---|---|
| Detect policy framework from `$PATH` and project files | hook: `pre-tool-use` | — |
| Validate policy syntax before RED phase | hook: `pre-tool-use` | framework detected |
| Verify non-compliant fixture triggers expected deny count | hook: `post-tool-use` | RED phase complete |
| Verify compliant fixture passes all policies | hook: `post-tool-use` | GREEN phase complete |
| Emit `POLICY_GAMING_DETECTED` when gaming pattern found | hook: `pre-tool-use` | policy file read |
| Surface handoff fields in `/adev:write-test` output | skill: write-test | framework + fixtures present |
| Block on `POLICY_SYNTAX_ERROR` before any test run | hook: `pre-tool-use` | policy file present |
| Block on `POLICY_NO_INPUT` when fixture path is absent | hook: `pre-tool-use` | input path checked |

---

## Acceptance Criteria

- [ ] Given a Rego policy with a `deny` rule checking encryption value and a non-compliant Terraform plan JSON, Conftest exits non-zero and the hook confirms RED state is valid (not a syntax error).
- [ ] Given the same policy and a compliant Terraform plan JSON, Conftest exits zero and the hook confirms GREEN state.
- [ ] Given a policy that checks only key existence (`input.resource[_].encryption`), the hook emits `POLICY_GAMING_DETECTED` before the test runs.
- [ ] Given a policy that exits 0 on `{}` input, the hook emits `POLICY_EMPTY_INPUT_PASS` and blocks the cycle.
- [ ] Given a malformed `.rego` file, the hook emits `POLICY_SYNTAX_ERROR` with the parse details and does not proceed to the RED phase.
- [ ] Given no recognized policy tool on `$PATH`, the hook emits `POLICY_NO_FRAMEWORK` as an advisory.
- [ ] Given no input fixture path, the hook emits `POLICY_NO_INPUT` and blocks.
- [ ] The `/adev:write-test` skill surfaces all five handoff fields when `strategy: policy` is active.
- [ ] Seed fixtures for both compliant and non-compliant resources are generated under `fixtures/` alongside the policy file.
