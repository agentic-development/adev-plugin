---
strategy_id: integration
red_exit_condition: "Test fails because the system under test behaves incorrectly against real infrastructure — an assertion about state, response, or side-effect fails. RED caused by missing credentials (INTEGRATION_NO_CREDENTIALS) or unreachable hosts (INTEGRATION_HOST_UNREACHABLE) is NOT valid RED — these are setup errors that must be resolved before the TDD cycle begins."
green_exit_condition: "All behavioral assertions pass against live external infrastructure. The implementation correctly interacts with the real service under realistic conditions — actual database rows exist, actual S3 objects were created/deleted, actual queue messages were sent/received."
gaming_blockers:
  - "Boundary mocking — mocking the specific external system this module wraps (e.g., jest.mock('S3Client') in an S3 adapter test, mocking the DB driver in a repository test)"
  - "In-process substitutes — using SQLite instead of Postgres, in-memory queue instead of SQS, local HTTP server instead of the real third-party API (unless explicitly documented in spec infra_requirements.notes)"
  - "Credential-absent pass — tests that pass when required env vars are unset; tests must fail (not skip) when credentials are missing or infrastructure is unreachable. Skipping requires explicit user configuration via `on_fail: skip` in the spec's `infra_requirements` block. The agent must never add skip guards (`describe.skipIf`, `canConnect`, `skipUnless`, `process.exit`) autonomously."
  - "CI bypass — if (process.env.CI) { skip() } or equivalent; integration tests must run in CI when credentials are available"
  - "Agent-initiated skip — `describe.skipIf(!canConnect)`, `describe.skip`, `skipUnless(hasCredentials)`, or any conditional skip tied to infrastructure availability that was not explicitly requested by the user via `on_fail: skip` in infra_requirements"
  - "Stale state dependency — tests that rely on state left by a prior test run; setup/teardown must be idempotent"
  - "Cross-test coupling — tests that fail when run in isolation because they depend on side effects of other integration tests"
assertion_rules: "Assert against real external state: actual database rows, actual S3 objects, actual queue message counts, actual HTTP response bodies from live endpoints. Cover at least one error path that only manifests with real infrastructure (constraint violations, rate limits, idempotency). Never assert against mocked or simulated responses."
seed_data_rule: "All test data created in before/setup hook and destroyed in after/teardown hook. Random suffixes or UUIDs required for resource names to prevent cross-run collisions (e.g., adev-test-bucket-${crypto.randomUUID()}). Tests must be runnable in parallel without interference via unique resource names."
handoff_format: "Infrastructure requirements block (systems, env vars, pre-provisioned state, connectivity, CI notes) + test file paths + list of external systems verified (service/operation/assertion) + teardown verification (all created resources deleted) + CI invocation command + total run time observed during RED verification"
permitted_tools:
  - "AWS SDK v3 (from project dependencies)"
  - "Google Cloud client libraries (from project dependencies)"
  - "Azure SDK (from project dependencies)"
  - "pg (node-postgres, from project dependencies)"
  - "mysql2 (from project dependencies)"
  - "mongodb driver (from project dependencies)"
  - "ioredis (from project dependencies)"
  - "amqplib (from project dependencies)"
  - "kafkajs (from project dependencies)"
  - "undici or fetch (from project dependencies)"
  - "Testcontainers (when documented as accepted local substitute in spec infra_requirements.notes)"
---

# Integration Strategy Profile

Behavioral tests against real external infrastructure. No mocking at the infrastructure boundary. Tests verify actual interactions with live cloud APIs, databases, message queues, and third-party HTTP services.

## Infrastructure Boundary Rule

The infrastructure boundary is the specific external system that the module under test is designed to wrap, connect to, or adapt. Mocking that system is a gaming violation. Mocking layers above it (other adapters, helpers, internal functions) is allowed.

| Module purpose | Infrastructure boundary | Mocking allowed |
|---|---|---|
| S3 adapter | AWS S3 API | Internal helpers, retry logic, serialization |
| Order service (calls S3 adapter) | Order service behavior | The S3 adapter — mock `uploadFile()` |
| Queue consumer | AWS SQS | Message parsing, downstream handlers |

## Error Codes

- `INTEGRATION_NO_CREDENTIALS` — required env vars missing; block with clear message, do NOT count as RED
- `INTEGRATION_HOST_UNREACHABLE` — external host unreachable; block with clear message, do NOT count as RED
- `INTEGRATION_STALE_STATE` — pre-existing state found; block, fix teardown
- `INTEGRATION_NO_REQUIREMENTS_BLOCK` — RED started without emitting infrastructure requirements block; block
