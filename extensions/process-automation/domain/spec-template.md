# Live Spec: {{ spec_title }}

<!-- Live Spec within the {{ module_name }} charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/{{ module_name }}/charter.md -->

---
charter: {{ module_name }}
status: draft  <!-- draft | review-pending | review-passed | review-blocked | implemented | validated -->
risk_level: medium  <!-- high | medium | low. Used by governance risk policies. -->
milestone:        <!-- optional — milestone from charter capability map, or explicit override (e.g., v1, v2, mvp) -->
revision: 1
charter-revision: 1
created: {{ date }}
updated: {{ date }}
# infra_requirements:   # Optional. Declare when this capability touches external systems.
#   env_file: ".env.test"            # Optional. Path to env file (must be within project root). Default: .env.test
#   systems:
#     - name: "AWS S3"
#       env_vars: [AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION]
#       cli_tools:                   # Optional. CLI tools to verify on PATH.
#         - aws                      # String form: existence check only
#         - name: docker             # Object form: existence + version check
#           version: ">=24"
#       probe: "aws sts get-caller-identity"  # Optional. Connectivity command (exit 0 = pass). Only $VAR expansion — no pipes/redirects.
#       check_level: full            # Optional. "full" (default) | "presence-only" | "skip"
#       timeout: 10                  # Optional. Probe timeout in seconds (default: 10).
#       notes: "Dedicated test account. Scope IAM to specific actions/ARNs."
#   ci_tag: "integration"
# Security: env var names only — MUST NOT contain actual credential values.
---

<!-- # tracker-ref: -->

## Behavioral Contract

<!-- One-paragraph summary of what this spec defines. -->

## System Constitution Reference

<!-- Which constitutional principles are most relevant to this spec.
     This helps reviewers and implementers know which rules apply. -->

- **Principle:** "{{ principle_text }}" — Applies because ...
- ...

## Actionable Task Map

<!-- A preliminary breakdown of implementation tasks.
     /adev:plan will refine this into a detailed plan after review. -->

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| ... | ... | small / medium / large |

## Visual Expectations

<!-- For UI tasks only. Delete this section for backend-only specs.
     Describe what the user SEES, not what the code does.
     These are verified by browser snapshot during /adev:implement and /adev:validate.
     Be specific: sizes, positions, colors, states, responsive breakpoints. -->

- ...
- **Loading state:** ...
- **Error state:** ...
- **Mobile (< 768px):** ...

## Acceptance Criteria

<!-- Checkboxes for each verifiable criterion. -->

## Preconditions

<!-- What must be true before the workflow runs. System availability, credentials, queue state. -->

## Behaviors

<!-- "When X happens, then Y is the result." Concrete, testable statements about workflow outcomes. -->

## Postconditions

<!-- What is guaranteed to be true after the workflow completes. State changes, notifications sent. -->

## Error Cases

| Condition | Trigger | Outcome |
|-----------|---------|---------|

## Integration Points

<!-- External system touchpoints exercised by this spec's behaviors. -->

| System | Operation | Expected Response | Timeout |
|--------|-----------|-------------------|---------|

## Recovery Actions

<!-- Compensation logic per failure mode. What to undo, retry, or escalate. -->

| Failure Mode | Recovery Action | Max Retries | Escalation |
|-------------|----------------|-------------|------------|
