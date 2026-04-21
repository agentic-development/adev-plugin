---
topic: "Tiered test gates: best practices for integration and UI/E2E test timing in agentic development"
date: "2026-04-14"
relates-to: ""
sources:
  - internal
  - web
status: draft
---

## Summary

Industry consensus (Martin Fowler, Google, Thoughtworks) recommends **progressive confidence** — each lifecycle stage runs broader but slower tests, with fail-fast gating between tiers. The adev framework currently treats all tests as a single gate (`npm test`), missing the opportunity to run integration and E2E tests at appropriate lifecycle stages. Applying tiered test gates to `/adev:validate` and `/adev:implement` would align with established CI/CD patterns while keeping the inner development loop fast.

## Findings

### Internal

The adev framework has five testing touchpoints across its lifecycle:

1. **`/adev:write-test`** — Writes RED phase unit tests only. No integration/E2E distinction (`skills/write-test/SKILL.md`).

2. **`/adev:implement`** — Runs unit tests per task in the TDD loop (Step 2). Visual verification via Playwright snapshots for UI files (Step 2e). No integration test step after all tasks complete. The plan skill mentions "integration tests after all units are wired" in task ordering (Step 5) but nothing enforces or runs them distinctly.

3. **`/adev:validate`** — Check 1 (Quality Gates) runs a single `npm test` command from `manifest.yaml gates.test`. No tiered execution. Check 11 (Visual Verification) uses Playwright MCP snapshots — agent-driven visual inspection, not automated E2E test scripts.

4. **`/adev:build`** — Orchestrates implement → validate with the same single-gate model.

5. **`manifest.yaml`** — Current schema supports only `gates.test: "npm test"`. No tier structure (`gates:118-124`).

**Key gap:** The framework has no mechanism to declare or execute tests by category (unit, integration, e2e). Projects that define separate test commands (e.g., `npm run test:unit`, `npm run test:integration`, `npm run test:e2e`) have no way to surface this to the lifecycle.

### Web

#### Testing Pyramid and CI/CD Pipeline Staging

The industry-standard pipeline maps test categories to stages of increasing confidence:

| Stage | Tests | Speed | Gate Behavior |
|-------|-------|-------|---------------|
| 1. Commit | Lint, unit tests, build | Seconds–minutes | Fail-fast; blocks all subsequent stages |
| 2. Integration | Integration tests, contract tests | Minutes | Fail-fast; blocks acceptance stage |
| 3. Acceptance | Smoke E2E, visual regression | Minutes–tens of minutes | Fail-fast; blocks deploy |
| 4. Pre-production | Full E2E suite, perf tests | Tens of minutes | Blocks release |
| 5. Production | Smoke tests, synthetic monitoring | Ongoing | Alerts, rollback |

**Distribution guidance (70/20/10 rule):** ~70% unit tests, ~20% integration, ~10% E2E. Google reports ~80/15/5 in "Software Engineering at Google" Ch.11.

#### Google's Size-Based Categorization

Google categorizes tests by **size** (execution constraints) rather than type (what they test):

| Size | Constraints | Mapping | When to Run |
|------|-------------|---------|-------------|
| Small | Single process, no I/O | Unit tests | Every commit, every iteration |
| Medium | Multi-process, localhost I/O | Integration tests | Every PR, pre-merge |
| Large | No restrictions, real infra | E2E, perf tests | Smoke on PR; full pre-deploy |

This is more actionable than the unit/integration/E2E taxonomy because it maps directly to execution speed and resource needs. Source: Google Testing Blog, "Test Sizes" (2010).

#### Integration Test Timing

**Consensus: Run on every PR/pre-merge, after unit tests pass.**

Martin Fowler's Deployment Pipeline (from "Continuous Delivery" by Humble & Farley): first stage runs fast unit tests with test doubles; second stage runs integration tests against real dependencies (databases, APIs). Each stage gates the next. Deferring integration tests to post-merge increases bug fix cost and can block other developers.

#### UI/E2E Test Timing

**Consensus: Smoke suite pre-merge; full suite post-merge or pre-deploy.**

| Strategy | Pros | Cons |
|----------|------|------|
| Pre-merge (smoke) | Gates bad merges; fast enough | Doesn't catch all regressions |
| Post-merge (full) | Tests merged state; no PR delay | Broken main possible |
| Pre-deploy (staging) | Real infra | Late feedback; rollback needed |

Practical recommendations:
- Run 10-20 critical-path E2E tests on every PR
- Run full E2E suite post-merge on main branch or pre-deploy
- Use selective execution — changes to checkout trigger checkout E2E, not the full suite
- Quarantine flaky tests: if a test fails >2x in 30 days without a code change, remove from blocking suite

Source: Martin Fowler, "The Practical Test Pyramid" (Ham Vocke, Thoughtworks).

#### AI Agent Testing Workflows

Emerging practices for agentic development (2025-2026):

- **During implementation (inner loop):** Run unit tests continuously as the agent codes. Fail fast, fix fast.
- **After all tasks (outer loop):** Run integration tests to verify cross-component wiring.
- **Validation phase:** Run the broader suite including smoke E2E. Fail-fast on quality gates.
- **Pre-merge:** Same tests a human developer would run at the same lifecycle points.
- **Key principle:** Agents can run tests more frequently than humans (on every iteration, not just before commit), so the tiered approach lets them stay fast on the inner loop while catching integration issues before handoff.

Sources: Tricentis QA Trends 2026, TestQuality "The Shift to Agentic QA" (2026).

## Code Examples

```yaml
# Example: Tiered gates schema for manifest.yaml
# Source: Derived from research findings, adapted to adev conventions

gates:
  # Tier 1: Fast — runs during TDD loop and as first validate gate
  fast:
    test: "npm test"
    lint: "npm run lint"           # optional
    typecheck: "npm run typecheck" # optional

  # Tier 2: Integration — runs after all tasks complete in /adev:implement
  integration:
    test: "npm run test:integration"

  # Tier 3: E2E — runs during /adev:validate, smoke subset on PR
  e2e:
    smoke: "npm run test:e2e:smoke"
    full: "npm run test:e2e"
```

```
# Example: Tiered fail-fast in /adev:validate Check 1
# Source: Martin Fowler's Deployment Pipeline model

Check 1a: Fast Gates (unit + lint + typecheck)
  → FAIL? Stop. Report. Skip all subsequent checks.
  → PASS? Continue.

Check 1b: Integration Gates
  → FAIL? Stop. Report. Skip Checks 2-11.
  → PASS? Continue.

Check 1c: E2E Smoke Gates
  → FAIL? Report as WARN (non-blocking) or FAIL (configurable).
  → PASS? Continue to Check 2.
```

## Recommendations

1. **Extend `manifest.yaml` gates schema to support tiers** — Replace the flat `gates.test` with a tiered structure (`gates.fast`, `gates.integration`, `gates.e2e`). Projects that don't define tiers fall back to current behavior (single `gates.test`). This respects Principle 2 (skills are markdown — the schema change is in YAML config, not executable code) and requires no new dependencies (Principle 1).

2. **Split `/adev:validate` Check 1 into tiered fail-fast** — Run fast gates first, then integration, then E2E smoke. Each tier gates the next. This matches the Deployment Pipeline model and gives users actionable feedback faster. The current fail-fast behavior is preserved for the fast tier.

3. **Add integration test step to `/adev:implement` Step 3** — After all tasks complete and before the final cross-task review, run `gates.integration` if defined. This catches wiring issues between tasks before validation. Aligns with the "outer loop" recommendation for agentic workflows.

4. **Allow E2E gate severity configuration** — E2E tests are inherently flakier. Let projects configure whether E2E gate failures are `error` (blocks validation) or `warning` (reported but non-blocking). Default to `warning` for the full suite, `error` for smoke.

5. **Keep visual verification (Check 11) separate from E2E gates** — The current Playwright snapshot approach serves a different purpose (agent-driven visual inspection) than automated E2E test scripts. Both should exist: Check 11 for visual verification, tiered gates for scripted E2E tests. They complement each other.

6. **Backward compatibility** — If `gates.test` exists without tiers, treat it as `gates.fast.test`. No migration required for existing projects.

## References

### Internal Files
- `skills/validate/SKILL.md` — Current 12-check validation with single quality gate
- `skills/implement/SKILL.md` — TDD enforcement and visual verification during implementation
- `skills/write-test/SKILL.md` — RED phase test authoring
- `skills/build/SKILL.md` — End-to-end pipeline orchestrator
- `.context-index/manifest.yaml:118-124` — Current flat gates schema

### Web Sources
- [Martin Fowler — The Practical Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html) — Test categorization and pyramid distribution
- [Martin Fowler — Deployment Pipeline](https://martinfowler.com/bliki/DeploymentPipeline.html) — Staged pipeline model with gated test tiers
- [Martin Fowler — Test Pyramid](https://martinfowler.com/bliki/TestPyramid.html) — Original pyramid concept
- [Google Testing Blog — Test Sizes](https://testing.googleblog.com/2010/12/test-sizes.html) — Size-based categorization (small/medium/large)
- [Google Testing Blog — Just Say No to More End-to-End Tests](https://testing.googleblog.com/2015/04/just-say-no-to-more-end-to-end-tests.html) — E2E test minimization
- [Software Engineering at Google, Ch.11](https://abseil.io/resources/swe-book/html/ch11.html) — Testing overview, 80/15/5 distribution
- [AWS — Testing Stages in CI/CD](https://docs.aws.amazon.com/whitepapers/latest/practicing-continuous-integration-continuous-delivery/testing-stages-in-continuous-integration-and-continuous-delivery.html) — Pipeline stage model
- [Tricentis — QA Trends 2026: AI, Agents, and the Future of Testing](https://www.tricentis.com/blog/qa-trends-ai-agentic-testing) — Agentic QA practices
- [TestQuality — The Shift to Agentic QA (2026)](https://testquality.com/the-shift-to-agentic-qa-beyond-automated-testing-to-autonomous-ai-generation-in-2026/) — Autonomous test generation
