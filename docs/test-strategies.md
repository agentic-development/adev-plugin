# Test Strategies

Guide for configuring domain-specific TDD in your project. Test strategies customize how `/adev:plan` and `/adev:write-test` handle the RED-GREEN-REFACTOR cycle for different types of work.

> **Zero-config is fine.** Without any configuration, all tasks use the `unit` strategy — the same behavior as before test strategies existed. You only need this guide if your project includes database migrations, data pipelines, infrastructure-as-code, service contracts, performance tests, or UI components.

## How it works

Traditional TDD assumes unit tests: write a failing test, implement the code, tests pass. But "write a failing test" means very different things depending on what you're building:

| You're building... | The "test" is... | RED means... |
|---|---|---|
| Business logic | A unit test with mocked boundaries | Test runner exits non-zero |
| A database migration | A schema assertion script | Assertion fails because column doesn't exist yet |
| A dbt model | An input/output fixture comparison | Transform output doesn't match expected fixture |
| A Terraform module | An OPA/Conftest policy | Policy denies non-compliant resource |
| A service integration | A consumer contract (Pact) | Provider verification fails |
| A performance requirement | A benchmark with thresholds | Latency exceeds p95 target |
| A UI component | A screenshot comparison | Visual diff from baseline |
| A deployment | A smoke health check | Service doesn't respond |

Test strategies let `/adev:write-test` follow the right rules for each domain, including domain-specific gaming detection (e.g., "testing a migration on an empty database" is the schema equivalent of "using toBeTruthy() as the sole assertion").

## The 9 strategies

| Strategy | Domain | Typical tools |
|----------|--------|---------------|
| `unit` | Business logic, APIs, pure functions | node:test, jest, vitest, pytest, go test |
| `schema` | Database migrations, schema changes | pgTAP, Testcontainers, Flyway, Prisma, Alembic |
| `fixture` | Data pipelines, ETL, dbt models | dbt tests, Great Expectations, Soda Core |
| `policy` | IaC, K8s manifests, Dockerfiles | Conftest, OPA, Sentinel, Checkov, kubeconform |
| `contract` | Service integrations, API boundaries | Pact, Spring Cloud Contract, Specmatic |
| `integration` | External service adapters and connectors | AWS SDK v3, node-postgres, ioredis, kafkajs, undici |
| `threshold` | Performance, load testing | k6, Gatling, Locust, Artillery, hyperfine |
| `visual` | UI components, design systems | Chromatic, Percy, Playwright, Storybook |
| `smoke` | Deployments, migrations, glue code | curl, Docker healthcheck, Testcontainers |

## For existing projects

### Option 1: Auto-detection (no config needed)

The framework auto-detects strategies from your project structure:

- `dbt_project.yml` or `profiles.yml` in your repo &rarr; `fixture` strategy available
- `*.tf` files or `terraform/` directory &rarr; `policy`
- `migrations/`, `prisma/schema.prisma`, `alembic/` &rarr; `schema`
- `*.proto`, `openapi.yaml`, `contracts/` &rarr; `contract`
- `src/components/` with React/Vue/Svelte/Angular &rarr; `visual`
- `k6/`, `locust/`, `artillery/` &rarr; `threshold`
- `adapters/`, `integrations/`, `connectors/` directories &rarr; `integration`
- `serverless.yml`, `pulumi.yaml`, `firebase.json` in the repo root &rarr; `integration`
- Files named `*-adapter.*`, `*-client.*`, `*-gateway.*`, `*-connector.*` &rarr; `integration` (medium confidence)

When `/adev:plan` decomposes a spec into tasks, it checks each task's file paths and assigns the strategy automatically. A migration task gets `schema`, a component task gets `visual`, an API task gets `unit`.

**You don't need to change anything.** Just run `/adev:plan` and `/adev:implement` as usual — strategy detection happens transparently.

### Option 2: Manifest declaration (explicit control)

For projects where auto-detection isn't enough, or where you want to override the defaults, add a `test_strategies` section to `.context-index/manifest.yaml`:

```yaml
test_strategies:
  - strategy_id: schema
    command: ["npm", "run", "test:migrations"]
    tier: integration
    paths: ["migrations/**", "prisma/migrations/**"]

  - strategy_id: fixture
    command: ["dbt", "test"]
    tier: integration
    paths: ["models/**", "macros/**"]

  - strategy_id: policy
    command: ["conftest", "test"]
    tier: fast
    paths: ["terraform/**", "k8s/**"]

  - strategy_id: integration
    command: ["node", "--test", "--test-name-pattern", "integration"]
    tier: integration
    paths: ["src/adapters/**", "lib/clients/**"]
```

Each entry declares:
- `strategy_id` — one of the 8 strategy types
- `command` — array of command + args (executed via `spawn`, never shell-interpolated)
- `tier` — which gate tier runs this (`fast`, `integration`, or `e2e`). Defaults to `fast`
- `paths` — file glob patterns that trigger this strategy

Manifest entries take precedence over auto-detection. The first matching entry wins when paths overlap.

### Option 3: Spec-level override

For individual specs where you know the right strategy, add `test_strategy` to the spec's YAML frontmatter:

```yaml
---
charter: my-feature
status: review-pending
test_strategy: schema
---
```

This overrides both manifest declarations and auto-detection for all tasks in that spec.

## Priority chain

When `/adev:plan` assigns a strategy to a task, it follows this priority (highest wins):

1. **Spec-declared** — `test_strategy` in the spec frontmatter (confidence: high)
2. **Manifest** — first matching `test_strategies` entry by path glob (confidence: high)
3. **Auto-detected** — heuristic from task file paths (confidence: varies)
4. **Fallback** — `unit` (confidence: high)

Every assignment logs its source so you can audit why a task got a particular strategy.

## For new projects

Run `/adev:init`. The manifest template includes a commented `test_strategies` section. Uncomment the entries that match your stack.

If your project is purely business logic (Node.js API, Python service, Go CLI), you don't need to configure anything — `unit` is the default and covers standard TDD.

If your project spans multiple domains (e.g., a fullstack app with a database, React frontend, and Terraform infra), auto-detection handles this automatically — each task gets the right strategy based on which files it touches.

## What changes in practice

### In `/adev:plan` output

Each task now shows its assigned strategy:

```markdown
### Task 1: Add user email column [specialist: none]

**Strategy:** schema (source: detected, confidence: high)
**Files:**
- Create: prisma/migrations/002_add_email/migration.sql
- Test: tests/migrations/002_add_email.test.mjs
```

When any task uses a non-unit strategy, the plan includes a Strategy Summary:

```markdown
## Strategy Summary

| Strategy | Tasks | Source |
|----------|-------|--------|
| unit     | 3     | fallback |
| schema   | 2     | detected |
| visual   | 1     | detected |
```

### In `/adev:write-test`

Instead of always using the 9 hardcoded gaming patterns and mocking boundary rules, write-test loads the profile for the assigned strategy. For a `schema` task:

- **RED means:** migration assertion script exits non-zero because the schema change doesn't exist yet
- **Gaming detection catches:** testing on empty database, migration-runs-only assertions, missing rollback verification
- **Seed data requires:** representative production-like data seeded before migration
- **Handoff block includes:** migration file paths, assertion scripts, seed data, schema snapshots

For a `unit` task, behavior is identical to before — the unit profile codifies the existing rules.

### What stays the same

- Projects without `test_strategies` config behave identically to before
- The TDD cycle is still RED-GREEN-REFACTOR
- Gaming detection still blocks vacuous tests
- Handoff blocks are still immutable
- All existing tests continue to pass

## Adopting the integration strategy

The `integration` strategy is for behavioral tests that run against **real external infrastructure** — cloud APIs, managed databases, message queues, and third-party HTTP services. It is the only strategy that prohibits mocking at the infrastructure layer.

### The core rule

If the module you are testing is designed to _wrap or adapt_ an external system (an S3 adapter, a Postgres repository, a Stripe gateway), the external system itself must not be mocked. Mocking it produces a test that doesn't verify the thing that matters.

```
Module purpose             Infrastructure boundary        Mocking allowed
────────────────────────────────────────────────────────────────────────────
S3 adapter (wraps S3)  →   AWS S3 API               →   Retry logic, helpers
Order service (calls       The Order service's            The S3 adapter itself
  S3 adapter)          →   behavior                 →   (mock uploadFile())
Queue consumer         →   AWS SQS                  →   Message parsing,
  (reads SQS)                                           downstream handlers
```

### Step 1 — Declare infrastructure requirements in the spec

During `/adev:specify`, Step 4.5 prompts for infrastructure requirements when a capability touches external systems. The answers are written into the spec frontmatter:

```yaml
infra_requirements:
  systems:
    - name: "AWS S3"
      env_vars: [AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, TEST_BUCKET]
      notes: "Dedicated test account. Scope IAM to s3:PutObject, s3:GetObject, s3:DeleteObject, s3:ListBucket on test bucket ARN only."
  ci_tag: "integration"
```

> **Security invariant:** This block contains env var _names_ only. Never record actual credential values, tokens, or connection strings with embedded passwords in spec files — they are committed to the repository.

### Step 2 — Write tests with a credential guard

Every integration test file must fail fast with a clear message when credentials are missing. Missing credentials are **not** RED — they are a setup error.

```javascript
// Credential guard — must appear before any test code
const REQUIRED = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION', 'TEST_BUCKET'];
const missing = REQUIRED.filter(v => !process.env[v]);
if (missing.length > 0) {
  console.error(
    `INTEGRATION_NO_CREDENTIALS: Integration tests require credentials.\n` +
    `Missing: ${missing.join(', ')}\n` +
    `Set the variables listed in the Infrastructure Requirements block before running.`
  );
  process.exit(1);
}
```

Running the test without credentials produces:

```
INTEGRATION_NO_CREDENTIALS: Integration tests require credentials.
Missing: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, TEST_BUCKET
Set the variables listed in the Infrastructure Requirements block before running.
Exit code: 1
```

### Step 3 — Use UUID suffixes and clean up in teardown

Tests must not leave state behind, and must be safe to run in parallel.

```javascript
import { describe, it, before, after } from 'node:test';
import { randomUUID } from 'node:crypto';

describe('S3 adapter — integration', () => {
  let testKey;

  before(() => {
    // UUID suffix prevents cross-run collisions
    testKey = `adev-test/${randomUUID()}/file.txt`;
  });

  after(async () => {
    // Idempotent teardown — always runs, even if tests fail
    try { await remove(BUCKET, testKey); } catch { /* already gone */ }
  });

  it('integration: upload creates a real S3 object', async () => {
    const result = await upload(BUCKET, testKey, 'payload');
    assert.strictEqual(result.bucket, BUCKET);
  });
});
```

### Step 4 — Activate the integration gate

In `governance/gates.yaml`, promote the integration gate from stub to active:

```yaml
- id: integration-test
  name: Integration Tests
  kind: deterministic
  tier: integration
  command: "node --test --test-name-pattern 'integration'"
  required: true      # was: false
  severity: error     # was: warning
  triggers:
    - post-implement
    - pre-merge
```

The integration tier only runs `post-implement` and `pre-merge` — not on every task. This keeps `npm test` (fast tier) instant while still enforcing real-infra verification before merging.

### Step 5 — Set CI secrets

Add the variables listed in `infra_requirements.systems[].env_vars` as CI secrets (GitHub Actions, GitLab CI, etc.). Use a **dedicated test account** with scoped IAM permissions — not your production account.

```yaml
# .github/workflows/test.yml (excerpt)
- name: Run integration tests
  env:
    AWS_ACCESS_KEY_ID: ${{ secrets.TEST_AWS_ACCESS_KEY_ID }}
    AWS_SECRET_ACCESS_KEY: ${{ secrets.TEST_AWS_SECRET_ACCESS_KEY }}
    AWS_REGION: us-east-1
    TEST_BUCKET: ${{ secrets.TEST_BUCKET }}
  run: npm run test:integration
```

### Gaming violations that block the PR

`/adev:validate` blocks the PR if any of these patterns are detected in integration test files:

| Pattern | What triggers it | Why it's a violation |
|---------|-----------------|---------------------|
| `BOUNDARY_MOCKING` | `jest.mock('@aws-sdk/...')`, `nock(...)`, `sinon.stub(client, 'send')` | Mocks the external system the module wraps — the test no longer verifies real behavior |
| `CI_BYPASS` | `if (process.env.CI) { skip() }` | Integration tests must run in CI when credentials are available |
| `CREDENTIAL_ABSENT_PASS` | SDK client instantiated without an env var guard | Tests pass silently when credentials are missing — vacuous pass |

### When NOT to use the integration strategy

| Situation | Right strategy |
|-----------|---------------|
| You are testing business logic that _calls_ an adapter | `unit` — mock the adapter, not the infrastructure |
| You are verifying that a migration script produces the right schema | `schema` |
| You are verifying a service implements a consumer contract | `contract` |
| You need a quick smoke check that a deployed service responds | `smoke` |

Use `integration` when the module's _entire purpose_ is the infrastructure interaction itself.

## Extending with custom profiles

Each strategy profile is a markdown file at `lib/test-strategies/profiles/<strategy>.md` with YAML frontmatter defining 8 fields:

| Field | What it controls |
|-------|-----------------|
| `red_exit_condition` | What must exit non-zero to confirm RED state |
| `green_exit_condition` | What must exit zero to confirm GREEN state |
| `gaming_blockers` | Domain-specific patterns that indicate vacuous tests |
| `assertion_rules` | What assertions are valid for this strategy |
| `seed_data_rule` | How test data must be prepared |
| `handoff_format` | Structure of the immutable handoff block |
| `permitted_tools` | Which test frameworks are valid |

To add a 10th strategy (e.g., `accessibility`), create the profile markdown and add a detection heuristic. No changes to the core abstraction required.

## Troubleshooting

**"All my tasks show unit/fallback"** — Your project structure doesn't match any detection heuristic. Either add `test_strategies` to your manifest, or add `test_strategy` to your spec frontmatter.

**"Wrong strategy detected"** — Manifest entries override detection. Add an explicit entry with the correct strategy and path globs.

**"Strategy profile not found — falling back to unit"** — The profile markdown file doesn't exist at `lib/test-strategies/profiles/<strategy>.md`. All 9 built-in profiles ship with the plugin.

**"Low confidence strategy assignment"** — The detection heuristic found a weak signal. Review the assignment in the plan output and override via manifest or spec frontmatter if needed.
