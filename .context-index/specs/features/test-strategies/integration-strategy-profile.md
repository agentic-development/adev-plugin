---
charter: test-strategies
status: implemented
revision: 1
charter-revision: 2
created: 2026-04-27
updated: 2026-04-27
charter-extension: true
---

# Live Spec: Integration Strategy Profile

**Capability:** Define the `integration` strategy profile — a 9th strategy type for behavioral tests that run against real external infrastructure (cloud APIs, databases, message queues, HTTP services) with no mocking at the infrastructure layer.

> **Charter extension note:** The test-strategies charter defines exactly 8 strategies in the Strategy Type Registry. The `integration` strategy is a 9th, justified by the Quality Attribute: "Adding a 9th strategy requires only a new profile Live Spec and a detection heuristic entry — no changes to the core abstraction." The following specs must be updated to reflect this addition:
> - `strategy-type-registry` — acceptance criterion "exactly 8 strategy types" → 9; add registry entry (see Actionable Task Map for draft values)
> - `strategy-profile-contract` — precondition "one of the 8 known slugs" → validated against registry dynamically; acceptance criterion "getStrategyProfile returns a valid profile for any of the 8 strategy IDs" → 9
> - `cross-strategy-gaming-patterns` — precondition "any of the 8 types" → "any registered strategy type"

## Behavioral Contract

### Preconditions

- The task involves an external system (cloud provider API, relational/document/graph database, message queue, third-party HTTP API, blob storage) that the implementation code calls directly.
- A strategy assignment of `integration` has been made for the task (by the plan skill, spec frontmatter, or manifest declaration).
- The infrastructure requirements block has been populated (see Behavior 3) before write-test proceeds to RED phase.

### Behaviors

**1. Infrastructure boundary definition**

When write-test is assigned strategy `integration`, then the infrastructure layer is defined as: any process, service, or API that runs outside the test process boundary — including managed cloud services (AWS, GCP, Azure), self-hosted databases (Postgres, MySQL, MongoDB, Redis), managed databases (RDS, Cloud SQL, Cosmos DB), message brokers (SQS, SNS, Kafka, RabbitMQ, Pub/Sub), blob storage (S3, GCS, Azure Blob), and third-party HTTP APIs (Stripe, Twilio, SendGrid, etc.).

The infrastructure layer must NOT be mocked, stubbed, or replaced with in-process substitutes in integration tests. This is the defining constraint of this strategy.

**2. RED/GREEN definition**

- **RED:** The test fails because the system under test behaves incorrectly against real infrastructure — an assertion about state, response, or side-effect fails, or a required operation raises an unexpected error. RED caused by missing credentials, unreachable hosts, or test setup failures is NOT a valid RED and must be resolved as infrastructure setup before the TDD cycle continues.
- **GREEN:** All behavioral assertions pass against live external infrastructure. The test verifies that the implementation correctly interacts with the real service under realistic conditions.

**3. Mandatory infrastructure requirements block**

When write-test begins the RED phase for an integration task, then before authoring any test code it must emit an explicit **Infrastructure Requirements** block in the following format:

```
## Infrastructure Requirements

**Strategy:** integration
**External systems:** <comma-separated list, e.g., "AWS S3, AWS SQS, Postgres 15">

### Credentials / Environment Variables
> **Never record actual credential values here.** List env var names and descriptions only.
> Note: connection-string variables like `DATABASE_URL` embed passwords — treat them as secrets.

| Variable | Description |
|----------|-------------|
| AWS_ACCESS_KEY_ID | AWS access key for the dedicated test account (identifier, not secret — but rotate regularly) |
| AWS_SECRET_ACCESS_KEY | AWS secret key — inject as CI secret, never commit |
| AWS_REGION | AWS region for test resources |
| DATABASE_URL | Connection string including credentials — inject as CI secret, never commit |

### Pre-Provisioned State
- S3 bucket `adev-test-<random>` must exist in the test account
- SQS queue `adev-test-queue` must exist and be empty before each test run
- Postgres database `adev_test` must be migrated to the latest schema

### Connectivity Requirements
- Test runner must have network access to AWS endpoints
- Test runner must have network access to the database host on port 5432

### CI Notes
- These tests require real AWS credentials — they CANNOT run without them
- Use a dedicated test account with scoped IAM permissions (least privilege)
- Tests are in a dedicated file glob (e.g., `tests/integration/**`) and excluded from the default `npm test` run; run with: `npm run test:integration` (add a script to package.json that invokes `node --test tests/integration/**`) or filter by name pattern: `node --test --test-name-pattern "integration"`
- Expected run time: 30–120 seconds (network I/O dominates)
```

This block is emitted as part of the write-test handoff artifact and must be present before the implementation task begins.

**4. Gaming rules and mocking boundaries**

The infrastructure boundary for gaming detection is defined as: **the specific external system that the module under test is designed to wrap, connect to, or adapt.**

This is determined by the module's purpose, not its position in the call stack:

| Module purpose | Infrastructure boundary | What mocking is allowed |
|---|---|---|
| S3 adapter (wraps S3) | AWS S3 API | Internal helper functions, retry logic, serialization |
| Order service (calls S3 adapter) | The Order service's behavior | The S3 adapter itself — mock `uploadFile()` |
| Queue consumer (reads from SQS) | AWS SQS | Message parsing logic, downstream handlers |
| Payment service (calls Stripe adapter) | The Payment service's behavior | The Stripe adapter — mock `chargeCard()` |

**Rule:** If the thing being mocked IS the external system the module wraps → gaming violation. If the thing being mocked is a layer ABOVE the infrastructure (another adapter, a service, a helper) → allowed.

**Explicitly allowed in integration tests:**
- Mocking internal helper functions within the module under test
- Mocking retry/backoff logic to keep tests fast
- Mocking the system clock or random number generation
- Mocking unrelated external calls that are not the subject of this integration test
- Calling the real infrastructure SDK/driver/client directly — this is the point

**Prohibited gaming patterns**

The following patterns are explicitly prohibited when applied to the declared infrastructure boundary. Their presence causes `/adev:validate` to block the PR:

- **Boundary mocking:** Using any stub, mock, intercept, or in-process fake to replace the specific external system this module wraps (e.g., mocking `S3Client` in an S3 adapter test, mocking the database driver in a repository test).
- **In-process substitutes for the boundary system:** Using SQLite instead of Postgres, an in-memory queue instead of SQS, a local HTTP server instead of the real third-party API — unless the project has explicitly documented this as an accepted trade-off in the spec's `infra_requirements.notes` field and in team onboarding documentation.
- **Credential-absent pass:** Tests that pass when the required env vars are unset. Tests must fail fast with a clear message when credentials are missing — they must not silently skip assertions.
- **CI bypass:** `if (process.env.CI) { skip() }` or equivalent. Integration tests must run in CI when credentials are available.
- **Stale state dependency:** Tests that rely on state left by a prior test run (no `before`/`after` setup/teardown).
- **Cross-test coupling:** Tests that fail when run in isolation because they depend on side effects of other integration tests in the same suite.

**5. Assertion rules**

- Tests must verify behavior against real external state: actual database rows, actual S3 objects, actual queue message counts, actual HTTP response bodies from live endpoints.
- Tests must cover at least one error path that only manifests with real infrastructure (e.g., constraint violations, rate limits, eventual consistency, idempotency).
- Tests must clean up all state they create (idempotent teardown). Shared state between tests is prohibited.
- Timeout values must be set explicitly and documented. Tests that wait indefinitely are prohibited.
- Tests must not depend on production data or production accounts — a dedicated test account/environment is required.

**6. Seed data and test isolation**

- All test data must be created by the test's `before`/`setup` hook and destroyed by its `after`/`teardown` hook.
- Random suffixes or UUIDs must be used for resource names to prevent cross-run collisions (e.g., `adev-test-bucket-${crypto.randomUUID()}`).
- Tests must be runnable in parallel without interference (isolation via unique resource names, not via sequential execution).

**7. Detection heuristics**

Auto-detection for the `integration` strategy is path-based and manifest-configurable. No import scanning is performed (consistent with the Strategy Detection Heuristics spec, which uses file globbing only).

**Project-level indicators (high confidence):**
- Presence of cloud provider configuration files: `.aws/config`, `serverless.yml`, `serverless.yaml`, `pulumi.yaml`, `firebase.json`, `app.yaml` (GCP)
- Presence of an `integrations/`, `adapters/`, `connectors/` top-level directory

**Task-level path patterns (medium confidence):**
- Task file paths match `**/adapters/**`, `**/integrations/**`, `**/connectors/**`, `**/clients/**`, `**/providers/**`
- Task file paths match `**/*-adapter.*`, `**/*-connector.*`, `**/*-client.*`, `**/*-gateway.*`

**Manifest-declared (high confidence, overrides path detection):**
Projects explicitly declare integration strategy paths in manifest.yaml:
```yaml
test_strategies:
  - strategy_id: integration
    paths:
      - "src/adapters/**"
      - "src/infrastructure/**"
      - "lib/clients/**"
    # command and tier are optional; omit to use defaults
```
When a manifest declaration is present, it is the authoritative source. Path heuristics are only used as a fallback when no manifest declaration exists.

Detection confidence: **high** when manifest-declared or project-level indicator files are present; **medium** when task-level path patterns match only.

**8. Handoff format**

When handing off a completed integration test cycle, provide:

- The infrastructure requirements block (see Behavior 3)
- Test file paths
- List of external systems verified (service, operation, assertion)
- Teardown verification: confirmation that all created resources were deleted
- CI invocation command (e.g., `npm run test:integration` or `node --test --test-name-pattern "integration"`)
- Total run time observed during RED verification

### Error Cases

| Code | Trigger | Behavior |
|---|---|---|
| `INTEGRATION_NO_CREDENTIALS` | Required env vars are missing when tests run | Block: "Integration tests require credentials. Set the variables listed in the Infrastructure Requirements block before running." Do NOT count as RED. |
| `INTEGRATION_HOST_UNREACHABLE` | External host is unreachable (DNS failure, firewall, VPC issue) | Block: "External host unreachable — this is a setup error, not a test failure. Verify network access before interpreting this as a behavioral defect." Do NOT count as RED. |
| `INTEGRATION_STALE_STATE` | Test finds pre-existing state from a previous run | Block: "Integration test found unexpected pre-existing state. Ensure teardown is idempotent and was executed before this run." |
| `INTEGRATION_NO_REQUIREMENTS_BLOCK` | write-test proceeds to RED without emitting infrastructure requirements block | Block: "Infrastructure requirements must be documented before writing integration tests. Emit the requirements block first." |

## Constitution Reference

- **"Skills are primarily markdown"** — The integration strategy profile is a set of instructions consumed by write-test. The infrastructure requirements block is a markdown artifact, not executable code.
- **"Minimize external dependencies"** — No new npm dependencies required. The integration tests themselves may use existing SDKs already in the project's dependencies.
- **"Hook protocol compliance"** — Gaming detection by `/adev:validate` uses the same hook exit code protocol (0 = pass, 2 = block). The list of prohibited patterns is the trigger set for gaming detection.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Author integration profile document | Write this profile as a markdown reference loaded by write-test | small |
| Update strategy-type-registry | Add `integration` as a 9th strategy with descriptor: id=integration, name="Integration", domain="external service adapters and connectors", red_semantics="assertion fails against real infrastructure", green_semantics="all assertions pass against live external systems", typical_tools="cloud SDKs, database drivers, HTTP clients" | small |
| Update strategy-profile-contract | Change hardcoded "8 known slugs" precondition to validate against the registry dynamically; update acceptance criteria count | small |
| Update cross-strategy-gaming-patterns | Change "any of the 8 types" to "any registered strategy type" | small |
| Update detection heuristics | Add path patterns for integration strategy auto-detection (file globbing only — no import scanning) | medium |
| Update write-test SKILL.md | Load integration profile when strategy is `integration`; emit infra requirements block before RED | medium |
| Add gaming detection rules | Extend validate/implement gaming detection to cover integration-specific prohibited patterns | medium |
| Update manifest schema | Document `integration` as a valid strategy ID in manifest schema | small |

## Acceptance Criteria

- [ ] Strategy ID `integration` is registered in the strategy type registry as a valid strategy
- [ ] write-test, when assigned strategy `integration`, emits an infrastructure requirements block before beginning RED phase
- [ ] The requirements block lists: external systems, required credentials (env vars), pre-provisioned state, connectivity requirements, CI notes
- [ ] Infrastructure layer mocking (jest.mock, nock, msw, in-memory DB substitutes) is flagged as a gaming violation and blocks the PR
- [ ] Offline tests (passing without credentials or network access) are flagged as gaming violations
- [ ] Tests that create state must clean it up — stale state causes a validation block
- [ ] Auto-detection assigns `integration` strategy for tasks whose file paths match `adapters/`, `integrations/`, `connectors/`, `clients/`, or `providers/` path patterns
- [ ] Manifest-declared `test_strategies.integration.paths` takes precedence over path heuristics
- [ ] Detection uses file globbing only — no import scanning or content parsing
- [ ] Detection produces `INTEGRATION_NO_CREDENTIALS` (not RED) when credentials are missing
- [ ] Detection produces `INTEGRATION_HOST_UNREACHABLE` (not RED) when external hosts are unreachable
- [ ] All quality gates pass
- [ ] No constitutional violations introduced

## Permitted Tools

AWS SDK v3, Google Cloud client libraries, Azure SDK, `pg` (node-postgres), `mysql2`, `mongodb` driver, `ioredis`, `amqplib`, `kafkajs`, `undici`/`fetch` for HTTP, Testcontainers (when documented as the project's accepted local substitute), Playwright for browser-based integration checks.
