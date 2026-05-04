---
charter: test-strategies
status: validated
revision: 2
charter-revision: 2
created: 2026-04-20
updated: 2026-05-04
---

# Spec: Strategy Type Registry

## Capability

Define the 9 strategy types with summary traits (RED/GREEN semantics, domain, typical tools).

## Preconditions

- The test-strategies module is loaded by a consuming skill (plan, write-test, implement, validate)

## Behavioral Contract

### Behaviors

1. When the module is loaded, then it exposes a registry of exactly 9 strategy types: `unit`, `schema`, `contract`, `fixture`, `integration`, `policy`, `threshold`, `visual`, `smoke`
2. When a consumer queries a strategy by ID, then the registry returns: `id` (slug), `name`, `description`, `red_semantics` (what RED means for this strategy), `green_semantics` (what GREEN means), `domain` (what kind of work this strategy applies to), `typical_tools` (frameworks/tools commonly used)
3. When a consumer queries a strategy ID that is not one of the 9 defined types, then the registry returns `null` (not an error — fallback is handled by the assignment protocol)
4. When the registry is enumerated, then strategies are returned in a stable, alphabetical order by ID

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Query with empty string | Returns null | STRATEGY_NOT_FOUND |
| Query with undefined/null | Returns null | STRATEGY_NOT_FOUND |

## Constitution Reference

- "Skills are primarily markdown" — Strategy type definitions are markdown tables consumed by skills, not executable code
- "Minimize external dependencies" — Registry is a pure data structure using Node.js built-ins only

## Strategy Registry

| id | name | description | red_semantics | green_semantics | domain | typical_tools |
|----|------|-------------|---------------|-----------------|--------|---------------|
| `contract` | Contract Testing | Consumer-driven contract testing | Provider verification exits non-zero | Provider verification passes all consumer contracts | service integrations, API boundaries | Pact, Spring Cloud Contract, Specmatic |
| `fixture` | Fixture-Based Testing | Input/output fixture-based testing for data transforms | Transform output does not match expected fixture | Transform output matches the expected fixture exactly | data pipelines, ETL, dbt models | dbt tests, Great Expectations, Soda Core, SQLMesh |
| `integration` | Integration Testing | Behavioral tests against real external infrastructure with no mocking at the infrastructure layer | Assertion fails against real infrastructure; credential/connectivity errors are NOT RED | All assertions pass against live external systems | external service adapters and connectors | AWS SDK v3, node-postgres, mysql2, mongodb driver, ioredis, kafkajs, undici |
| `policy` | Policy-as-Code Testing | Policy-as-code validation against defined rules | Policy evaluation exits non-zero | All policy checks pass | infrastructure-as-code, Kubernetes manifests, config | Conftest, OPA, Sentinel, Checkov, kubeconform |
| `schema` | Schema Migration Testing | Database migration testing with schema assertions | Migration assertion exits non-zero | Migration runs successfully and all schema assertions pass | database migrations, schema changes | pgTAP, Testcontainers, Flyway, dbmate |
| `smoke` | Smoke Testing | Lightweight integration checks | Smoke check exits non-zero | Smoke check passes with exit zero | deployments, migrations, glue code | curl, httpie, custom scripts |
| `threshold` | Performance Threshold Testing | Performance benchmark testing with explicit pass/fail thresholds | Benchmark exits non-zero | All performance thresholds are met | performance requirements, load testing | k6, Gatling, Locust, Artillery, hyperfine |
| `unit` | Unit Testing | Standard unit testing with mocked external boundaries | Test runner exits non-zero | Test runner exits zero | business logic, pure functions, API endpoints | node:test, jest, vitest, pytest, go test, cargo test |
| `visual` | Visual Regression Testing | Visual regression testing using screenshot comparison | Screenshot diff exits non-zero | Zero visual diffs from approved baseline | UI components, design systems | Chromatic, Percy, Playwright toHaveScreenshot, Loki |

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Define strategy type data structure | Create the 9 strategy type objects with all required fields | medium |
| Implement registry lookup function | `getStrategy(id)` and `listStrategies()` functions | small |
| Write registry documentation | Markdown reference table of all 9 strategies and their traits | small |

## Acceptance Criteria

- [ ] Registry contains exactly 9 strategy types
- [ ] Each strategy has all required fields: `id`, `name`, `description`, `red_semantics`, `green_semantics`, `domain`, `typical_tools`
- [ ] Unknown strategy IDs return `null` without throwing
- [ ] Enumeration returns strategies in stable alphabetical order
- [ ] No external dependencies introduced
- [ ] All quality gates pass
- [ ] No constitutional violations introduced
