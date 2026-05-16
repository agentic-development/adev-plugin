# Check 8: Boundary Compliance

If the `governance/` directory does not exist → SKIP: "No governance directory configured."

If `governance/` exists but `.context-index/governance/boundaries.yaml` is missing → PASS (no rules configured).

If `governance/boundaries.yaml` exists, collect all files changed. For each boundary rule:

1. Run regex `pattern` against file contents, respecting `exclude` globs.
2. `severity: error` → FAIL
3. `severity: warning` → WARN (does not cause overall FAIL)
4. Apply charter-specific overrides from `governance/overrides/<slug>.yaml` if present.
