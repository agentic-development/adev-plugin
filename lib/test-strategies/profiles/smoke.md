---
strategy_id: smoke
red_exit_condition: "Smoke check exits non-zero because the service, migration, or deployment is not running or not working correctly"
green_exit_condition: "Smoke check passes — service responds to health check, migration completes, deployment is healthy, CLI exits zero with expected output"
gaming_blockers:
  - "Smoke tests that only check process exit code without verifying any response content"
  - "Health checks that return 200 even when the service is degraded — no body validation"
  - "Checks that pass on empty or default responses without verifying expected content"
  - "Overly broad 'it didn't crash' assertions with no meaningful property verification"
assertion_rules: "Smoke tests must verify at least one meaningful response property — status code plus body contains expected key, or exit code plus stdout contains expected output. Must have a reasonable timeout. Must test the actual deployed/running artifact, not a mock."
seed_data_rule: "Minimal — smoke tests use whatever state the system starts with. Document expected preconditions (database migrated, config file exists, environment variables set). No complex test data setup."
handoff_format: "Smoke script paths + target URL or command + expected response shape + timeout value + precondition checklist"
permitted_tools:
  - "curl"
  - "httpie"
  - "wget"
  - "custom shell scripts"
  - "Docker healthcheck"
  - "Kubernetes readiness probes"
  - "Playwright"
  - "Testcontainers"
  - "supertest"
---

# Smoke Strategy Profile

Lightweight integration check profile. Verifies that a service, migration, or deployment is operational with minimal but meaningful assertions.
