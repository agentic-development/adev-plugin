const STRATEGIES = Object.freeze([
  Object.freeze({
    id: 'contract',
    name: 'Contract Testing',
    description:
      'Consumer-driven contract testing that verifies a provider implements the API endpoints expected by its consumers. Catches integration mismatches before deployment.',
    redSemantics:
      'Consumer contract verification exits non-zero because the provider does not implement the expected endpoint or response shape.',
    greenSemantics:
      'Provider verification passes all consumer contracts with exit zero.',
    domain: 'service integrations, API boundaries',
    typicalTools: Object.freeze(['Pact', 'Spring Cloud Contract', 'Specmatic']),
  }),
  Object.freeze({
    id: 'fixture',
    name: 'Fixture-Based Testing',
    description:
      'Input/output fixture-based testing for data transforms that compares actual output against expected fixture files. Ideal for deterministic data pipelines and ETL processes.',
    redSemantics:
      'Transform output does not match the expected fixture file, causing the comparison to exit non-zero.',
    greenSemantics:
      'Transform output matches the expected fixture exactly, exiting zero.',
    domain: 'data pipelines, ETL, dbt models',
    typicalTools: Object.freeze([
      'dbt tests',
      'Great Expectations',
      'Soda Core',
      'SQLMesh',
    ]),
  }),
  Object.freeze({
    id: 'policy',
    name: 'Policy-as-Code Testing',
    description:
      'Policy-as-code validation that evaluates a plan or manifest against defined rules and constraints. Ensures infrastructure and configuration changes comply with organizational standards.',
    redSemantics:
      'The conftest or OPA policy evaluation exits non-zero because a resource does not meet the defined policy.',
    greenSemantics: 'All policy checks pass with exit zero.',
    domain: 'infrastructure-as-code, Kubernetes manifests, config',
    typicalTools: Object.freeze([
      'Conftest',
      'OPA',
      'Sentinel',
      'Checkov',
      'kubeconform',
    ]),
  }),
  Object.freeze({
    id: 'schema',
    name: 'Schema Migration Testing',
    description:
      'Database migration testing with schema assertions that verify a schema change exists and behaves correctly on seeded data. Catches regressions in migration scripts before they reach production.',
    redSemantics:
      'Migration assertion script exits non-zero because the expected schema change does not exist.',
    greenSemantics:
      'Migration runs successfully and all schema assertions pass on seeded data, exiting zero.',
    domain: 'database migrations, schema changes',
    typicalTools: Object.freeze([
      'pgTAP',
      'Testcontainers',
      'Flyway',
      'dbmate',
    ]),
  }),
  Object.freeze({
    id: 'smoke',
    name: 'Smoke Testing',
    description:
      'Lightweight integration checks that verify a deployed service, migration, or piece of glue code runs without errors. The goal is confidence, not coverage.',
    redSemantics:
      'The smoke check exits non-zero because the service does not respond, the migration fails, or the deployment is broken.',
    greenSemantics:
      'The smoke check passes with exit zero — the service responds and the migration or deployment completes without error.',
    domain: 'deployments, migrations, glue code',
    typicalTools: Object.freeze(['curl', 'httpie', 'custom scripts']),
  }),
  Object.freeze({
    id: 'threshold',
    name: 'Performance Threshold Testing',
    description:
      'Performance benchmark testing with explicit pass/fail thresholds defined in code or configuration. Turns performance requirements into executable gates.',
    redSemantics:
      'The benchmark exits non-zero because one or more performance metrics do not meet the defined threshold.',
    greenSemantics:
      'All performance thresholds are met and the benchmark exits zero.',
    domain: 'performance requirements, load testing',
    typicalTools: Object.freeze([
      'k6',
      'Gatling',
      'Locust',
      'Artillery',
      'hyperfine',
    ]),
  }),
  Object.freeze({
    id: 'unit',
    name: 'Unit Testing',
    description:
      'Standard unit testing with mocked external boundaries that isolates and verifies individual behaviors. The foundational TDD strategy for business logic and pure functions.',
    redSemantics:
      'The test runner exits non-zero because the behavior under test is not yet implemented.',
    greenSemantics:
      'The test runner exits zero — all assertions pass after implementation.',
    domain: 'business logic, pure functions, API endpoints',
    typicalTools: Object.freeze([
      'node:test',
      'jest',
      'vitest',
      'pytest',
      'go test',
      'cargo test',
    ]),
  }),
  Object.freeze({
    id: 'visual',
    name: 'Visual Regression Testing',
    description:
      'Visual regression testing using screenshot comparison against an approved baseline. Catches unintended UI changes in components and design systems.',
    redSemantics:
      'Screenshot diff exits non-zero because the component does not match the baseline or no baseline exists yet.',
    greenSemantics:
      'Zero visual diffs from the approved baseline, exiting zero.',
    domain: 'UI components, design systems',
    typicalTools: Object.freeze([
      'Chromatic',
      'Percy',
      'Playwright toHaveScreenshot',
      'Loki',
    ]),
  }),
]);

const STRATEGY_MAP = new Map(STRATEGIES.map((s) => [s.id, s]));

/**
 * Returns the strategy object for the given id, or null if not found.
 * @param {string} id
 * @returns {object|null}
 */
export function getStrategy(id) {
  if (id === null || id === undefined || id === '') return null;
  return STRATEGY_MAP.get(id) ?? null;
}

/**
 * Returns all strategies in alphabetical order by id.
 * @returns {readonly object[]}
 */
export function listStrategies() {
  return STRATEGIES;
}
