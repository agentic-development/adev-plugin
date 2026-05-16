# Check 9: Transition Gates

If `governance/gates.yaml` defines `implement-to-validate` or `implement-to-merge` transition:

1. Verify each `required_gates` was run and passed in Check 1.
2. If a required gate was skipped (probabilistic/no command) → log "manual verification required."
3. Note `approver_role` if present (informational).
4. If no transitions configured in `governance/gates.yaml` (or `governance/` absent) → SKIP: "No transitions configured."
