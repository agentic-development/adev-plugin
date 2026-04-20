---
strategy_id: policy
red_exit_condition: "Conftest/OPA policy exits non-zero because the resource does not meet the policy — deny rule fires on non-compliant configuration"
green_exit_condition: "All policies pass — conftest test exits zero, all deny rules satisfied, both compliant and non-compliant inputs tested"
gaming_blockers:
  - "Checking key existence without value validation — policy checks that a tag key exists but not its value"
  - "Policies that only assert resource count — 'has 3 security groups' instead of checking their rules"
  - "Policies that pass on empty input — no deny rules fire when no resources are present"
  - "Overly permissive allow rules that match everything"
  - "Policies that check non-security properties only — tags but not encryption, labels but not RBAC"
assertion_rules: "Rego deny rules must check concrete values, not just key presence. Policies must cover security-sensitive properties (encryption, public access, privileged containers, RBAC). Must test both compliant AND non-compliant inputs."
seed_data_rule: "Terraform plan JSON or K8s manifest fixtures with both compliant and non-compliant resources. Include edge cases: empty resource blocks, resources with all defaults, resources with explicit overrides."
handoff_format: "Policy file paths (Rego, Sentinel) + plan/manifest fixture paths + conftest/OPA command + expected deny count for non-compliant fixtures + framework name"
permitted_tools:
  - "Conftest"
  - "OPA"
  - "Sentinel"
  - "Checkov"
  - "tfsec"
  - "kubeconform"
  - "Hadolint"
  - "Datree"
  - "Pluto"
---

# Policy Strategy Profile

Policy-as-code validation profile for infrastructure-as-code, Kubernetes manifests, and configuration files. Verifies compliance through deny rules against plan/manifest output.
