# Research: Charter & Spec Structure — Domain Fit Analysis

**Date:** 2026-05-09
**Scope:** Evaluate whether adev's charter and spec templates fit non-code domains (data pipelines, APIs, CI/CD, migrations)
**Sources:** Eval fixture projects, brainstorm/specify SKILL.md, real charters and specs from the codebase

## Context

The brainstorm skill produces Feature Charters with 6 sections: Business Intent, Scope and Boundaries, Domain Model, Capability Map, Interface Contracts, Quality Attributes. The specify skill produces Live Specs with: Behavioral Contract (Preconditions/Behaviors/Postconditions/Error Cases), System Constitution Reference, Actionable Task Map, Acceptance Criteria. This research evaluates how well these structures serve different project domains.

## What Works Universally

- **Capability Map** is the strongest section — a capability is a capability regardless of domain ("CLV mart model" for data, "GET /orders with filters" for APIs, "Canary workflow" for CI/CD)
- **Scope and Boundaries** is domain-agnostic and consistently useful
- **Behavioral Contract (When/Then)** works across domains because it focuses on observable behavior, not implementation
- **Acceptance Criteria** translate well to any domain since they're concrete checkboxes

## Findings: Where the Structure Shows Strain

### 1. Domain Model — Awkward for Non-Entity Domains

The Domain Model section (Entities table, Relationships, Invariants) assumes object/resource thinking. Maps well to API services (User, Order, Payment), database migrations (Schema, Migration, Version), and data pipelines (Model, Source, Seed). Forced for CI/CD pipelines — a pipeline is a process, not a data model. The real structure is a DAG of stages with artifact contracts between them. Similarly strained for frontend (component trees and state flow don't fit entity-relationship tables) and infrastructure-as-code (deployment topology, not data relationships).

**Recommendation:** Make Domain Model optional or offer alternative framings (Process Flow, Stage Map) for process-oriented domains.

### 2. Interface Contracts — Missing Data Contracts

Interface Contracts work for APIs (endpoints) and code modules (exports). For data domains, the critical contract is the data contract — output schema, grain (one row per what?), freshness SLA, and quality dimensions (not null, unique, referential integrity). None of these fit the current "Interface | Type | Description" table.

**Recommendation:** Add Data Contract guidance to Interface Contracts for data projects — prompt for schema, grain, freshness, quality dimensions.

### 3. Error Cases — Domain-Specific Error Categories

The Error Cases table is generic. Different domains have fundamentally different error taxonomies:
- Data pipelines: schema drift, null violations, row count anomalies, stale sources, duplicate keys
- APIs: HTTP status codes, auth failures, rate limits, timeout cascading
- CI/CD: stage failures, secret unavailability, resource contention, flaky tests
- Migrations: lock contention, partial application, incompatible schema state

The template doesn't guide users toward their domain's error patterns.

**Recommendation:** Add domain-specific error prompts based on project type — suggest relevant error categories during brainstorm/specify.

### 4. Quality Attributes — Too Generic

The Quality Attributes table ("Attribute | Requirement") provides no domain-specific prompts. Data pipelines care about freshness, completeness, accuracy. APIs care about latency (p50/p95/p99), throughput, availability. CI/CD cares about build time, reliability (flake rate), rollback time.

**Recommendation:** Suggest domain-appropriate quality attributes based on `platform-context.yaml` type detection.

### 5. TDD Assumptions Don't Translate to All Domains

The plan's TDD structure (write failing test, implement, verify) assumes code-centric development:
- SQL/dbt models: can't write a "failing test" — the dbt pattern is write model, add schema tests, run `dbt test`. RED phase doesn't apply.
- CI/CD workflows: linting works, but traditional failing tests don't. Testing is dry-run or manual trigger.
- Infrastructure: Terraform plan/apply doesn't follow TDD.

**Recommendation:** Support non-TDD implementation patterns in the plan skill — "assert-after" for SQL, "lint-and-dry-run" for infrastructure.

### 6. Missing: Environment/Deployment Topology

No charter section captures where things run. For data pipelines this matters (dev DuckDB vs. prod Snowflake). For APIs (staging vs. production auth). For CI/CD, it IS the domain. Platform-context captures tech stack but not deployment progression (dev, staging, prod).

**Recommendation:** Consider an Environment/Topology section in charters for projects where deployment context shapes behavior.

## Eval Fixture Status

| Fixture | Status | Has .context-index/ |
|---------|--------|-------------------|
| adev-data-eval (dbt + DuckDB) | Fully initialized with project structure | No |
| adev-api-eval (API service) | Empty (uninitialized submodule) | No |
| adev-pipeline-eval (CI/CD) | Empty (uninitialized submodule) | No |
| adev-migrations-eval (migrations) | Empty (uninitialized submodule) | No |

Only adev-data-eval has actual project content. The other three are stubs. None have been initialized with adev — they're brownfield fixtures waiting for `/adev:init`.

## Conclusion

The core structure is sound — behavioral contracts and capability maps are genuinely domain-agnostic. The gaps are in the guidance and prompts within each section, not the sections themselves. The templates assume a code-centric, entity-oriented, TDD-native domain. When a domain doesn't fit that mold, users get a structure that works but doesn't actively help them think about their domain's unique concerns. The fix is domain-aware prompting, not structural changes to the template.
