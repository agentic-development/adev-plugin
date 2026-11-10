---
topic: "What integration tests really mean and how software teams ensure production confidence"
date: "2026-04-27"
relates-to: ""
sources:
  - internal
  - web
status: draft
---

## Summary

The software industry has moved well beyond "integration test" as a fixed layer in the testing pyramid. Leading engineering teams (Google, Netflix, Spotify) treat testing as a production confidence strategy that spans pre-deploy test suites, progressive delivery mechanisms (feature flags, canary deploys), chaos engineering, synthetic monitoring, and SLO-based observability. adev already has a rich internal foundation for this shift — the test-strategies module (8 strategy types, now extended with a 9th `integration` profile), the tiered gates research, and the infra-requirements spec — but key lifecycle gaps remain: adev's validate and implement phases still run a single-tier gate, and the framework has no vocabulary for production-side confidence (canary verification, synthetic probes, SLO burn alerts).

## Findings

### Internal

**Test Strategies Module — 8 strategy types with integration as the 9th**

The `lib/test-strategies/registry.mjs` defines 8 strategies: contract, fixture, policy, schema, smoke, threshold, unit, visual. The `integration` strategy was added as a 9th via `integration-strategy-profile.md`, with a behavioral contract that prohibits infrastructure mocking and mandates an explicit Infrastructure Requirements block before RED phase.

*Attribution:* `lib/test-strategies/registry.mjs:1-131`, `lib/test-strategies/profiles.mjs:1-228`

**Integration Strategy Profile — no-mock boundary, real infra required**

The integration profile defines the "infrastructure boundary" as any process running outside the test process: managed cloud services, self-hosted and managed databases, message brokers, blob storage, third-party HTTP APIs. Mocking any of these at the boundary is a gaming violation that blocks the PR via `/adev:validate`. The profile distinguishes between `INTEGRATION_NO_CREDENTIALS` (setup error, not RED) and `INTEGRATION_HOST_UNREACHABLE` (network error, not RED), preventing agents from misclassifying environment failures as behavioral defects.

*Attribution:* `.context-index/specs/features/test-strategies/integration-strategy-profile.md:28-172`

**Plan Infrastructure Requirements — surfaces prerequisite gap before implementation**

The `plan-infra-requirements.md` spec extends the plan skill to emit a consolidated `## Test Infrastructure Requirements` section whenever tasks involve strategies `integration`, `smoke`, `schema`, or `policy`. This section lists external systems, required credentials (env var names only — never values), pre-provisioned state, connectivity requirements, and CI invocation commands. Plan does not block when requirements are unresolved — it surfaces them in an `### Unresolved Requirements` table for human review.

*Attribution:* `.context-index/specs/features/test-strategies/plan-infra-requirements.md:13-210`

**Test-strategies charter — confidence vs. coverage framing**

The charter explicitly frames the 8 strategies as a "strategy abstraction layer that decouples the TDD lifecycle from unit-test assumptions," adapting RED-GREEN-REFACTOR semantics to the "actual domain of work — whether that's business logic, database migrations, data pipelines, infrastructure-as-code, service integrations, performance requirements, or UI components."

*Attribution:* `.context-index/specs/features/test-strategies/charter.md:8-12`

**Existing tiered test gates research — single gate is the current gap**

The April 2026 `tiered-test-gates-best-practices.md` research artifact identified that adev treats all tests as a single gate (`npm test`). The manifest schema supports only `gates.test`. The recommended remediation is a tiered `gates.fast` / `gates.integration` / `gates.e2e` structure with fail-fast between tiers — still not implemented as of this research.

*Attribution:* `.context-index/research/tiered-test-gates-best-practices.md:1-170`

**Gaming detection as a quality gate**

`/adev:validate` uses exit codes (0 = pass, 2 = block) to enforce gaming rules. The integration profile adds integration-specific prohibited patterns: boundary mocking, in-process substitutes (SQLite for Postgres, in-memory queue for SQS), credential-absent passes, CI bypass via `if (process.env.CI) { skip() }`, stale state dependency, and cross-test coupling.

*Attribution:* `.context-index/specs/features/test-strategies/integration-strategy-profile.md:103-110`

**No production-side confidence mechanisms in current adev lifecycle**

Searching across all specs, skills, and the constitution finds no mention of canary deployment verification, feature flag lifecycle, synthetic monitoring probes, SLO error budgets, or chaos experiments. The current lifecycle ends at `/adev:validate` — pre-deploy, pre-merge. The production confidence gap is entirely unaddressed by the framework today.

*Attribution:* `.context-index/specs/product.md`, skills directory (no matches for canary, synthetic monitoring, feature flag, SLO)

---

### Web

**The testing pyramid (Mike Cohn, ~2009) and its discontents**

The classic pyramid — many unit tests, fewer integration tests, fewest E2E tests — encodes a speed and cost heuristic: bugs cost roughly 10x more per tier to find and fix. It remains broadly applicable in 2025 because these economics have not changed, but it was never meant to describe what builds _production confidence_ — only how to distribute test investment for efficiency.

*Source:* [Martin Fowler — Test Pyramid](https://martinfowler.com/bliki/TestPyramid.html); [Semaphore — Testing Pyramid](https://semaphore.io/blog/testing-pyramid); [Why the Test Pyramid Still Matters in 2025](https://qalified.com/blog/test-pyramid-for-engineering-teams/)

**The testing trophy (Kent C. Dodds, 2018) — ROI-weighted, integration-centric**

Dodds proposed the trophy as a "general guide for the return on investment" of different testing forms. The trophy's wide middle band is integration tests, which are "the heart of the model." The core principle: "The more your tests resemble the way your software is used, the more confidence they can give you." As of 2024–2025, Dodds has begun reconsidering whether E2E tests (via Playwright and Vitest Browser Mode) should occupy a larger proportion, given their dramatically improved speed and reduced flakiness.

*Source:* [Kent C. Dodds — The Testing Trophy and Testing Classifications](https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications); [Does the testing trophy need updating for 2025?](https://kentcdodds.com/calls/05/02/does-the-testing-trophy-need-updating-for-2025)

**Martin Fowler — "On the Diverse And Fantastical Shapes of Testing" (2021)**

Fowler's most important observation: the shape debates (pyramid vs. trophy vs. honeycomb) are a distraction. What matters is whether tests "establish clear boundaries, run quickly and reliably, and only fail for useful reasons." Fowler notes that almost no teams achieve this. He emphasizes that "integration test" is a famously ambiguous term: different authors mean different things by it. Teams should define their terms explicitly rather than adopting a shape as a religion.

*Source:* [Martin Fowler — On the Diverse And Fantastical Shapes of Testing](https://martinfowler.com/articles/2021-test-shapes.html)

**Google's size-based categorization — constraints not type**

Google (as documented in _Software Engineering at Google_, Ch. 11) categorizes tests by _size_ (execution constraints), not type (what they test):
- **Small:** Single process, no I/O — unit tests. Run every commit, every iteration.
- **Medium:** Multi-process, localhost I/O allowed — integration tests. Run every PR, pre-merge.
- **Large:** No restrictions, real infra — E2E and performance tests. Smoke on PR, full pre-deploy.

Distribution: roughly 80% small / 15% medium / 5% large. This is more actionable than the type taxonomy because it maps directly to execution constraints and resource needs.

*Source:* [Software Engineering at Google, Ch.11](https://abseil.io/resources/swe-book/html/ch11.html); [Google Testing Blog — Test Sizes](https://testing.googleblog.com/2010/12/test-sizes.html)

**Spotify's testing honeycomb — integration-centric for microservices**

Spotify's 2018 engineering blog proposed the honeycomb for microservice architectures: the largest section is integration tests (API-level interactions between a service and its immediate neighbors), the smallest is "integrated tests" (full end-to-end), and "implementation detail tests" (unit tests) are a thin band. The rationale: "the biggest complexity in a microservice is not within the service itself, but in how it interacts with others." A 2020 study confirmed: over 60% of production bugs in microservices were integration failures, not single-service logic errors.

*Source:* [Spotify Engineering — Testing of Microservices](https://engineering.atspotify.com/2018/01/testing-of-microservices); [Understand the Testing Honeycomb for Microservices](https://app.studyraid.com/en/read/52108/2487929/the-testing-honeycomb-for-microservices)

**Consumer-driven contract testing (CDCT) — API compatibility without full integration**

Contract testing (via Pact, Spring Cloud Contract, Specmatic) verifies API compatibility between a consumer and provider _in isolation_, without requiring both to be deployed simultaneously. Pactflow's `can-i-deploy` check enables CI/CD gates that prevent deploying a change that would break a known consumer's contract. A 2025 research paper confirms CDCT "promotes faster feedback iterations than classic integration testing" and is best suited when the pool of API consumers is known and limited.

*Source:* [Pact Docs](https://docs.pact.io/); [Pactflow — What is Consumer-Driven Contract Testing](https://pactflow.io/what-is-consumer-driven-contract-testing/); [Ensuring Syntactic Interoperability Using CDCT (Wiley, 2025)](https://onlinelibrary.wiley.com/doi/10.1002/stvr.70006)

**What actually fails in production that tests miss**

The most common categories of production failures that escape pre-deploy test suites:

1. **State coverage gaps** — Synthetic load covers code paths, not state space. Caches, cookies, request affinity, and accumulated state create failure modes invisible to clean-slate test environments.
2. **Organic traffic patterns** — Artificial load doesn't replicate real user behavior distribution: bursty patterns, long-tail edge cases, specific device/locale combinations.
3. **Non-representative canary populations** — A 1% canary that looks healthy may miss bugs that only manifest for specific user cohorts (device type, subscription tier, geography).
4. **Scale-dependent failures** — Microservice queuing behavior, third-party API rate limits, connection pool exhaustion: these only appear under real production load.
5. **Environment delta** — The persistent gap between staging and production: different data volumes, different network latencies, different dependency versions, missing or stale secrets.
6. **Non-metric UX failures** — Error rates and latency look fine but users are confused or the workflow is broken. Metrics miss user intent.

*Source:* [Google SRE — Canary Release: Deployment Safety and Efficiency](https://sre.google/workbook/canarying-releases/); [Production Testing: What It Is and How to Do It Safely](https://bugbug.io/blog/software-testing/production-testing/); [Canary release vs smoke testing](https://www.getunleash.io/blog/canary-release-vs-smoke-test)

**Feature flags as production confidence infrastructure**

89% of engineering organizations now use feature flags as part of their deployment strategy (LaunchDarkly 2024 State of Feature Management). Martin Fowler's taxonomy identifies four toggle types: Release (hide incomplete code), Experiment (A/B testing), Ops (runtime circuit breakers), Permissioning (user cohort gating). This makes feature flags not just a deployment mechanism but a production testing mechanism — "test in production without exposing it to the wrong users."

*Source:* [LaunchDarkly — Feature Flags 101](https://launchdarkly.com/blog/what-are-feature-flags/); [Feature flags in production: progressive delivery guide](https://www.askantech.com/feature-flags-production-progressive-delivery-implementation-guide/)

**Netflix — chaos engineering as systematic production testing**

Netflix's Chaos Monkey and ChAP (Chaos Automation Platform) operate in production: injecting failures, partition events, and latency spikes to discover vulnerabilities before they become outages. The discipline: "experimenting on production to find vulnerabilities in the system before they render it unusable for customers." Chaos Engineering 2.0 (2024–2025) adds AI-guided experiment orchestration and policy-as-code guardrails to limit blast radius.

*Source:* [Testing in Production the Netflix Way](https://launchdarkly.com/blog/testing-in-production-the-netflix-way/); [Netflix Chaos Engineering Blog](https://netflixtechblog.com/tagged/chaos-engineering); [Chaos Engineering 2.0 (JCSP, 2025)](https://journals.stecab.com/jcsp/article/view/846)

**SLO-based observability — production confidence as a continuous signal**

SLOs (Service Level Objectives) with error budgets give teams a principled framework for deciding when to prioritize reliability work vs. feature delivery. Honeycomb (2025) integrates SLOs directly into debugging workflows, with automated investigations that fire when an SLO burn rate exceeds a threshold. This represents the current state-of-the-art in production confidence: continuous measurement against defined behavioral targets, not one-time pre-deploy checks.

*Source:* [Honeycomb — SRE + Honeycomb: Observability for Service Reliability](https://www.honeycomb.io/blog/sre-honeycomb-observability-for-service-reliability); [Honeycomb Pro: Now With Metrics & SLOs](https://www.honeycomb.io/blog/honeycomb-pro-now-with-metrics-slos)

---

## Code Examples

```yaml
# Example: Google's size-based test distribution recommendation
# Source: Software Engineering at Google, Ch.11 (https://abseil.io/resources/swe-book/html/ch11.html)
#
# Maps to adev's gate tiers:
#   small  → gates.fast   (node:test unit tests, lint, typecheck)
#   medium → gates.integration (node:test integration tests, real infra required)
#   large  → gates.e2e    (Playwright, full E2E suite)
#
# Distribution: ~80% small / ~15% medium / ~5% large

gates:
  fast:
    test: "npm test"               # unit tests only, no I/O
  integration:
    test: "npm run test:integration"  # real infra, credentials required
  e2e:
    smoke: "npm run test:e2e:smoke"   # 10-20 critical paths, blocking
    full:  "npm run test:e2e"         # full suite, non-blocking on PR
```

```markdown
# Example: Integration strategy's Infrastructure Requirements block format
# Source: .context-index/specs/features/test-strategies/integration-strategy-profile.md:43-75

## Infrastructure Requirements

**Strategy:** integration
**External systems:** AWS S3, Postgres 15

### Credentials / Environment Variables
| Variable | Description |
|----------|-------------|
| AWS_ACCESS_KEY_ID | AWS access key — rotate regularly |
| AWS_SECRET_ACCESS_KEY | AWS secret key — inject as CI secret, never commit |
| DATABASE_URL | Connection string — inject as CI secret (contains credentials) |

### CI Notes
- Excluded from default npm test run
- Run with: npm run test:integration
- Expected run time: 30–120 seconds
```

```js
// Example: Isolation pattern — random suffix for test resources (no cross-run collisions)
// Source: .context-index/specs/features/test-strategies/integration-strategy-profile.md:121-126
// Mandated by integration strategy Behavior 6 (seed data and test isolation)

import { randomUUID } from 'node:crypto';

const bucketName = `adev-test-${randomUUID()}`;

test.afterEach(async () => {
  await s3.deleteBucket({ Bucket: bucketName }).promise();
});
```

---

## Recommendations

1. **Implement tiered gates in manifest.yaml** — Replace the flat `gates.test` with `gates.fast` / `gates.integration` / `gates.e2e` (as already recommended in the tiered-test-gates research). Projects without tier config fall back to current behavior. This is the single highest-leverage change to bring adev's pre-deploy confidence model in line with Google's size-based approach and the Deployment Pipeline model. Grounded in Principle 1 (no new dependencies — pure YAML schema change) and Principle 2 (skills are markdown — the tier logic lives in skill instructions, not runtime code).

2. **Extend `/adev:validate` Check 1 to run tiers in fail-fast sequence** — Run `gates.fast` first, then `gates.integration` (if configured), then `gates.e2e.smoke` (if configured). Each tier gates the next. This matches the pre-existing tiered-test-gates recommendation and directly implements Deployment Pipeline gating. No constitutional violations.

3. **Add an integration test step to `/adev:implement` after all tasks complete** — After all tasks are done and before the final cross-task review, run `gates.integration` if configured. This catches wiring failures between tasks early, before validate. Grounded in the finding that 60%+ of microservice production bugs are integration failures (Spotify, 2020).

4. **Adopt a "production confidence layer" concept in adev's framework vocabulary** — The lifecycle today ends at validate (pre-deploy, pre-merge). A future `gates.production` tier could declare: canary verification checks (synthetic probes against a canary deploy), SLO burn rate thresholds (error budget tracking), and feature flag rollout targets. This would let adev express the full confidence chain from RED unit test to SLO-verified production. This is a significant scope extension requiring human approval (per constitution: "Adding new skills to the lifecycle order").

5. **Add static analysis as a mandatory tier-0 gate** — Kent C. Dodds' testing trophy includes a static layer (TypeScript, ESLint) as the base of the confidence pyramid, below unit tests. adev's `gates.fast` should explicitly include a `lint` and optional `typecheck` field alongside `test`. Principle 1 compliance: no new dependencies — projects already define linters if they want them.

6. **Codify the "not RED until infra is healthy" rule across all infrastructure-requiring strategies** — The integration profile's `INTEGRATION_NO_CREDENTIALS` and `INTEGRATION_HOST_UNREACHABLE` error codes are the right pattern. The smoke, schema, and policy strategies should adopt the same protocol: setup failures are categorically different from behavioral test failures. This prevents agents from misinterpreting environment problems as code defects.

7. **Document the distinction between "integration test" and "integrated test" in adev's strategy vocabulary** — Spotify's honeycomb uses "integration tests" for API-level service-neighbor checks and "integrated tests" for full end-to-end multi-service flows. Martin Fowler notes this ambiguity is a source of constant miscommunication. adev's `integration` strategy as currently defined is Spotify's "integration test" (one service, real infrastructure it wraps). adev should add a note in the registry distinguishing these concepts, so users don't map their full E2E multi-service flows to this strategy when `e2e` or `smoke` is the right fit.

---

## References

### Internal Files

- `.context-index/specs/features/test-strategies/charter.md` — Test Strategies feature charter defining the 8-strategy abstraction layer
- `.context-index/specs/features/test-strategies/integration-strategy-profile.md` — Integration strategy (9th type): no-mock boundary, infra requirements block, gaming rules
- `.context-index/specs/features/test-strategies/plan-infra-requirements.md` — Plan skill extension: emits infrastructure requirements section for non-unit strategies
- `.context-index/specs/features/test-strategies/integration-strategy-profile.review.md` — Architecture review findings (PASS_WITH_NOTES) for integration profile
- `.context-index/specs/features/test-strategies/plan-infra-requirements.review.md` — Architecture review findings (PASS_WITH_NOTES) for plan infra requirements
- `.context-index/research/tiered-test-gates-best-practices.md` — Prior research (2026-04-14) on tiered gate timing and CI/CD pipeline staging
- `lib/test-strategies/registry.mjs` — 8 strategy type definitions (contract, fixture, policy, schema, smoke, threshold, unit, visual)
- `lib/test-strategies/profiles.mjs` — Strategy profile loader with frontmatter parsing and fallback to unit profile

### Web Sources

- [Martin Fowler — Test Pyramid](https://martinfowler.com/bliki/TestPyramid.html) — Original pyramid concept and economics
- [Martin Fowler — On the Diverse And Fantastical Shapes of Testing](https://martinfowler.com/articles/2021-test-shapes.html) — Why shape debates are a distraction; importance of clear boundaries
- [Kent C. Dodds — The Testing Trophy and Testing Classifications](https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications) — Trophy model: ROI-weighted, integration-centric
- [Kent C. Dodds — Does the testing trophy need updating for 2025?](https://kentcdodds.com/calls/05/02/does-the-testing-trophy-need-updating-for-2025) — 2025 reconsideration with Playwright/Vitest Browser Mode
- [Spotify Engineering — Testing of Microservices](https://engineering.atspotify.com/2018/01/testing-of-microservices) — Testing honeycomb for microservices
- [Software Engineering at Google, Ch.11](https://abseil.io/resources/swe-book/html/ch11.html) — Size-based test categorization (small/medium/large), 80/15/5 distribution
- [Google Testing Blog — Test Sizes](https://testing.googleblog.com/2010/12/test-sizes.html) — Execution constraints as the primary categorization axis
- [Testing in Production the Netflix Way](https://launchdarkly.com/blog/testing-in-production-the-netflix-way/) — Chaos engineering and production experiments
- [Netflix Chaos Engineering Blog](https://netflixtechblog.com/tagged/chaos-engineering) — ChAP, Chaos Monkey, production vulnerability discovery
- [Chaos Engineering 2.0 (JCSP, 2025)](https://journals.stecab.com/jcsp/article/view/846) — AI-guided orchestration and policy-as-code guardrails
- [Google SRE — Canary Release: Deployment Safety and Efficiency](https://sre.google/workbook/canarying-releases/) — Production canary verification, failure modes that escape staging
- [Production Testing: What It Is and How to Do It Safely](https://bugbug.io/blog/software-testing/production-testing/) — Categories of production failures: state, traffic, scale, environment delta
- [LaunchDarkly — Feature Flags 101](https://launchdarkly.com/blog/what-are-feature-flags/) — Fowler's four toggle types; 89% adoption statistic
- [Feature flags in production: progressive delivery guide](https://www.askantech.com/feature-flags-production-progressive-delivery-implementation-guide/) — Progressive delivery implementation patterns
- [Pact Docs](https://docs.pact.io/) — Consumer-driven contract testing reference
- [Pactflow — What is Consumer-Driven Contract Testing](https://pactflow.io/what-is-consumer-driven-contract-testing/) — `can-i-deploy` CI gate
- [Ensuring Syntactic Interoperability Using CDCT (Wiley, 2025)](https://onlinelibrary.wiley.com/doi/10.1002/stvr.70006) — Academic validation of CDCT for microservices
- [Honeycomb — SRE + Honeycomb: Observability for Service Reliability](https://www.honeycomb.io/blog/sre-honeycomb-observability-for-service-reliability) — SLO-based production confidence
- [Honeycomb Pro: Now With Metrics & SLOs](https://www.honeycomb.io/blog/honeycomb-pro-now-with-metrics-slos) — Error budget-driven development prioritization
- [Pyramid or Crab? Find a testing strategy that fits](https://web.dev/articles/ta-strategies) — web.dev survey of testing shapes and when each fits
