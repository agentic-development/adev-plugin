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

## The 8 strategies

| Strategy | Domain | Typical tools |
|----------|--------|---------------|
| `unit` | Business logic, APIs, pure functions | node:test, jest, vitest, pytest, go test |
| `schema` | Database migrations, schema changes | pgTAP, Testcontainers, Flyway, Prisma, Alembic |
| `fixture` | Data pipelines, ETL, dbt models | dbt tests, Great Expectations, Soda Core |
| `policy` | IaC, K8s manifests, Dockerfiles | Conftest, OPA, Sentinel, Checkov, kubeconform |
| `contract` | Service integrations, API boundaries | Pact, Spring Cloud Contract, Specmatic |
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

To add a 9th strategy (e.g., `accessibility`), create the profile markdown and add a detection heuristic. No changes to the core abstraction required.

## Troubleshooting

**"All my tasks show unit/fallback"** — Your project structure doesn't match any detection heuristic. Either add `test_strategies` to your manifest, or add `test_strategy` to your spec frontmatter.

**"Wrong strategy detected"** — Manifest entries override detection. Add an explicit entry with the correct strategy and path globs.

**"Strategy profile not found — falling back to unit"** — The profile markdown file doesn't exist at `lib/test-strategies/profiles/<strategy>.md`. All 8 built-in profiles ship with the plugin.

**"Low confidence strategy assignment"** — The detection heuristic found a weak signal. Review the assignment in the plan output and override via manifest or spec frontmatter if needed.
