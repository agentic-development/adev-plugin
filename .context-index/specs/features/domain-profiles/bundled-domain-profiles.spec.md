# Live Spec: Bundled Domain Profiles

<!-- Live Spec within the domain-profiles charter.
     This defines the content of the three bundled domain profiles.
     Parent Charter: .context-index/specs/features/domain-profiles/charter.md -->

---
charter: domain-profiles
status: validated
risk_level: low
milestone: v1
revision: 6
charter-revision: 5
created: 2026-05-07
updated: 2026-05-10
source-manifest:
  sha: "e6d1b22"
  files:
    - docs/getting-started.md
    - docs/project-types.md
    - templates/domains/data-engineering/gate-config.yaml
    - templates/domains/data-engineering/gates.yaml
    - templates/domains/data-engineering/reviewers.yaml
    - templates/domains/data-engineering/test-config.yaml
    - templates/domains/data-engineering/verification.yaml
    - templates/domains/process-automation/gate-config.yaml
    - templates/domains/process-automation/gates.yaml
    - templates/domains/process-automation/reviewers.yaml
    - templates/domains/process-automation/test-config.yaml
    - templates/domains/process-automation/verification.yaml
    - templates/domains/software/gate-config.yaml
    - templates/domains/software/gates.yaml
    - templates/domains/software/reviewers.yaml
    - templates/domains/software/test-config.yaml
    - templates/domains/software/verification.yaml
    - tests/domains/backward-compat.test.mjs
    - tests/domains/bundled-profiles.test.mjs
  computed-at: "2026-05-11T16:09:28.512Z"
---

## Behavioral Contract

This spec defines the content and structure of three bundled domain profiles — `software`, `data-engineering`, and `process-automation` — shipped in `<plugin-root>/templates/domains/`. The `software` profile is the default and contains all current framework hardcoded defaults extracted into config files. Each profile provides a complete overlay set tailored to its domain. Users activate a profile by setting `domain: <name>` in their manifest or charter frontmatter.

### Preconditions

- Domain resolution and overlay loading are implemented (see `domain-resolution-and-overlay-structure.spec.md`)
- Skill integration points are implemented (see `domain-aware-skill-integration.spec.md`)
- The profile directories exist at `<plugin-root>/templates/domains/<name>/`

### Overlay File Inventory

Each bundled profile directory contains these files:

| File | Purpose |
|------|---------|
| `charter-template.md` | Complete charter template with domain-specific section names, vocabulary, quality attribute suggestions |
| `spec-template.md` | Complete spec template with domain-specific section names, error case columns, expectations sections |
| `reviewers.yaml` | Default reviewer entries with merge strategy |
| `gates.yaml` | Quality gate commands |
| `verification.yaml` | Verification approach (type, trigger_patterns, tool) |
| `gate-config.yaml` | Lifecycle gate file exclusions and bash passthrough commands |
| `test-config.yaml` | Permitted test tools, gaming detection thresholds, skip patterns |

### Behaviors

**Software Profile (Default)**

The `software` profile contains all current hardcoded framework defaults extracted verbatim into config files. Activating `domain: software` (or having no domain declaration) produces identical behavior to the framework before domain profiles were introduced.

1. **When** `domain: software` is active and brainstorm loads the charter template **then** the charter template uses the current section names: Business Intent, Scope and Boundaries, Domain Model (Entities, Relationships, Invariants), Capability Map, Interface Contracts, Quality Attributes. Quality attribute suggestions include: latency (p50/p95/p99), throughput, availability, error rate, test coverage.

2. **When** `domain: software` is active and specify loads the spec template **then** the spec template uses the current section names: Behavioral Contract, Preconditions, Behaviors, Postconditions, Error Cases (with Condition / Expected Behavior / Error Code columns), Visual Expectations, Acceptance Criteria.

3. **When** `domain: software` is active and review-specs loads the reviewer overlay **then** three reviewers are configured: `structural-architect` (profile: `reviewer-reasoning`), `security-reviewer` (profile: `reviewer-capable`), `consistency-analyzer` (profile: `reviewer-fast`). `merge_strategy: append`. `blocker_threshold: 1`.

4. **When** `domain: software` is active and validate loads the gate overlay **then** the current gate commands are loaded (as currently defined in `governance/gates.yaml` defaults). Severity defaults: quality-gate=error, subagent-review=error, deterministic-check=error, observational=info.

5. **When** `domain: software` is active and implement loads the verification config **then** verification uses `type: visual` with `trigger_patterns: ["*.html", "*.jsx", "*.tsx", "*.vue", "*.svelte"]` and `tool: playwright`. Breakpoints: 375 (mobile), 768 (tablet), 1280 (desktop).

6. **When** `domain: software` is active and lifecycle gate hooks load gate-config **then** the current 27 file exclusion patterns are loaded (`.context-index/**`, `*.test.*`, `*.spec.*`, `node_modules/**`, etc.) and the current 31 bash passthrough commands are loaded (`npm test`, `npx jest`, `npx vitest`, `npm run lint`, etc.).

7. **When** `domain: software` is active and write-test/implement load test-config **then** `permitted_tools: ["node:test", "jest", "vitest", "mocha", "pytest", "go test", "cargo test"]`, `max_test_file_size: 512000` (500 KB), and JavaScript-specific skip patterns (`\.skip\(`, `xit\(`, `xdescribe\(`, `\.todo\(`, `test\.skip\(`, `it\.skip\(`, `describe\.skip\(`) are loaded.

**Data-Engineering Profile**

8. **When** `domain: data-engineering` is active and brainstorm loads the charter template **then** the charter template uses domain vocabulary: "Data Contract" instead of "Interface Contracts", "Pipeline Stages" instead of generic capability descriptions, includes a "Data Lineage" section, and "Domain Model" is replaced with "Data Model" (Sources, Transformations, Outputs). Quality attribute suggestions include: freshness SLA, completeness (null rate), accuracy, row count stability, schema drift detection.

9. **When** `domain: data-engineering` is active and specify loads the spec template **then** the spec template replaces "HTTP Status / Error Code" in the error case table with "Failure Mode / Recovery Action", replaces "Visual Expectations" with "Data Quality Expectations" (schema validation rules, freshness thresholds, completeness constraints), and adds an "Output Schema" section.

10. **When** `domain: data-engineering` is active and review-specs loads the reviewer overlay **then** a "Data Contract Reviewer" entry with `id: "data-contract-reviewer"` is configured with `merge_strategy: append`. The reviewer's prompt focuses on data contracts, schema completeness, and SLA definitions.

11. **When** `domain: data-engineering` is active and validate loads the gate overlay **then** a gate with `id: "data-quality"` checks for schema validation and data fixture definitions. Severity defaults adjusted: observational=warning (data issues are more consequential).

12. **When** `domain: data-engineering` is active and implement loads the verification config **then** verification uses `type: output` with `trigger_patterns: ["*.parquet", "*.csv", "*.json", "*.yaml"]` and `tool: none` (assertion-based output comparison).

13. **When** `domain: data-engineering` is active and lifecycle gate hooks load gate-config **then** file exclusions include data-specific patterns (`*.parquet`, `*.duckdb`, `seeds/**`, `target/**`) and bash passthrough includes data-specific commands (`dbt run`, `dbt test`, `dbt build`, `python -m pytest`).

14. **When** `domain: data-engineering` is active and write-test/implement load test-config **then** `permitted_tools: ["pytest", "dbt test", "node:test"]`, `max_test_file_size: 1048576` (1 MB — data test files can be larger), and Python/dbt-specific skip patterns (`@pytest.mark.skip`, `pytest.skip(`, `enabled: false`).

**Process-Automation Profile**

15. **When** `domain: process-automation` is active and brainstorm loads the charter template **then** the charter template uses domain vocabulary: "Integration Points" instead of "Interface Contracts", "Workflow Steps" instead of generic capabilities, includes a "Recovery & Compensation" section. Quality attribute suggestions include: end-to-end latency, retry success rate, dead-letter rate, recovery time objective (RTO).

16. **When** `domain: process-automation` is active and specify loads the spec template **then** the spec template replaces "HTTP Status / Error Code" with "Trigger / Outcome", adds an "Integration Points" section listing external system touchpoints, and adds a "Recovery Actions" section defining compensation logic per failure mode.

17. **When** `domain: process-automation` is active and review-specs loads the reviewer overlay **then** an "Integration Reviewer" entry with `id: "integration-reviewer"` is configured with `merge_strategy: append`. The reviewer's prompt focuses on integration point completeness and recovery action coverage.

18. **When** `domain: process-automation` is active and validate loads the gate overlay **then** a gate with `id: "flow-coverage"` checks for integration point tests and recovery action tests.

19. **When** `domain: process-automation` is active and implement loads the verification config **then** verification uses `type: flow` with `trigger_patterns: ["*.workflow.yaml", "*.flow.json", "*.bpmn"]` and `tool: none`.

20. **When** `domain: process-automation` is active and lifecycle gate hooks load gate-config **then** file exclusions include automation-specific patterns (`*.workflow.yaml`, `*.bpmn`, `flows/**`) and bash passthrough includes automation-specific commands (`python -m pytest`, `npm test`, `npx jest`).

21. **When** `domain: process-automation` is active and write-test/implement load test-config **then** `permitted_tools: ["pytest", "node:test", "jest"]`, `max_test_file_size: 524288` (512 KB), and Python/JS skip patterns.

**Shared: Profile Completeness and Customization**

22. **When** a bundled profile directory is inspected **then** it contains exactly seven files: `charter-template.md`, `spec-template.md`, `reviewers.yaml`, `gates.yaml`, `verification.yaml`, `gate-config.yaml`, and `test-config.yaml`.

23. **When** a user wants to customize a bundled profile **then** they create a new custom domain with `extends: <bundled-name>` in `.context-index/domains/<custom-name>/domain.yaml`. They place only the files they want to override in the custom domain directory — missing files are inherited from the parent profile. Users CANNOT create `.context-index/domains/<bundled-name>/` directly (enforced by `BUNDLED_OVERRIDE_BLOCKED` in `loadDomainConfig()`).

24. **When** a user wants to reset all customizations **then** they change `domain: <custom-name>` back to `domain: <bundled-name>` in their manifest or charter frontmatter. The bundled profile is always pristine and unmodified. Optionally, the custom domain directory can be deleted.

25. **When** a project has governance files (`.context-index/governance/review.yaml`, `gates.yaml`) **then** those are applied as a second layer on top of the resolved domain profile, per the merge order defined in the resolution spec.

**Software Profile Backward Compatibility**

26. **When** the `software` profile is active on a project that previously had no domain configuration **then** all behavior is identical to the pre-domain-profiles framework. This is verified by a dedicated backward-compatibility test suite that compares outputs before and after the migration.

### Postconditions

- All three profiles are self-contained within their directory — no profile references files outside its own directory.
- Each profile's overlays are valid inputs for their respective skill integration points.
- The `software` profile produces identical behavior to the pre-domain-profiles framework.
- Both non-software profiles use `merge_strategy: append` for reviewer overlays and introduce new gate IDs that do not collide with any `software` profile gate ID.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Bundled profile directory is missing (e.g., deleted from plugin installation) | `loadDomainConfig()` returns `null` for all types; skills warn and use empty config | DOMAIN_NOT_FOUND |
| User partially overrides a bundled profile (e.g., only `charter-template.md` in project-local) | Project-local file wins for that type; remaining types fall back to bundled | — |
| Profile reviewer references an execution profile not available in the project | Reviewer entry skipped with warning (handled by skill integration spec) | UNKNOWN_PROFILE |
| Software profile config file is malformed | `DOMAIN_CONFIG_PARSE_ERROR` at load time; skill cannot proceed with empty config for critical types | DOMAIN_CONFIG_PARSE_ERROR |

## System Constitution Reference

- **"Skills are primarily markdown"** — Profile overlays are markdown and YAML data files. They contain no executable logic.
- **"Minimize external dependencies"** — Profile content is static files shipped with the plugin. No additional dependencies.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Extract `software/charter-overlay.md` | Extract current charter template section names and quality attribute suggestions | small |
| Extract `software/spec-overlay.md` | Extract current spec template section names and error case columns | small |
| Extract `software/reviewers.yaml` | Extract current 3 default reviewers from `lib/governance/review-config.mjs` and `templates/review-specs/defaults.yaml` | small |
| Extract `software/gates.yaml` | Extract current gate commands and severity defaults | small |
| Extract `software/verification.yaml` | Extract current visual verification config (Playwright, breakpoints) | small |
| Extract `software/gate-config.yaml` | Extract current 44 file exclusions and 32 bash passthrough commands from `lib/lifecycle-gate-config.mjs` | small |
| Extract `software/test-config.yaml` | Extract current permitted_tools, max_test_file_size, skip patterns from `lib/test-strategies/` | small |
| Author `data-engineering/` overlays (7 files) | Charter overlay, spec overlay, reviewers, gates, verification, gate-config, test-config for data pipelines | medium |
| Author `process-automation/` overlays (7 files) | Charter overlay, spec overlay, reviewers, gates, verification, gate-config, test-config for workflows | medium |
| Write backward-compatibility tests | Verify software profile produces identical outputs to pre-domain-profiles framework | medium |
| Write content validation tests | Verify all 21 overlay files parse correctly and match expected structure | medium |
| Update `docs/project-types.md` | Document each bundled profile with overlay contents, quality attributes, and customization examples | medium |
| Update `docs/getting-started.md` | Add domain profile selection section with examples | small |

## Acceptance Criteria

- [ ] `templates/domains/software/` contains all 7 overlay files
- [ ] `templates/domains/data-engineering/` contains all 7 overlay files
- [ ] `templates/domains/process-automation/` contains all 7 overlay files
- [ ] Software profile reviewer config matches current hardcoded defaults exactly (structural-architect, security-reviewer, consistency-analyzer)
- [ ] Software profile gate-config matches current `DEFAULT_FILE_EXCLUSIONS` (27 patterns) and `DEFAULT_BASH_PASSTHROUGH` (31 commands) exactly
- [ ] Software profile test-config matches current `permitted_tools`, `MAX_FILE_SIZE` (512000), and `SKIP_RE` (7 patterns) exactly
- [ ] Software profile verification config matches current Playwright visual verification defaults
- [ ] Backward-compatibility tests pass: software profile produces identical behavior to pre-domain-profiles framework
- [ ] Data-engineering charter template uses domain vocabulary (Data Contract, Pipeline Stages, Data Lineage)
- [ ] Data-engineering spec template uses Failure Mode / Recovery Action error columns and Data Quality Expectations
- [ ] Data-engineering reviewer appends a Data Contract Reviewer
- [ ] Data-engineering verification uses `type: output`
- [ ] Data-engineering gate-config includes data-specific exclusions and passthrough commands
- [ ] Data-engineering test-config includes pytest, dbt test as permitted tools
- [ ] Process-automation charter template uses domain vocabulary (Integration Points, Workflow Steps, Recovery & Compensation)
- [ ] Process-automation spec template uses Trigger / Outcome error columns with Integration Points and Recovery Actions
- [ ] Process-automation reviewer appends an Integration Reviewer
- [ ] Process-automation verification uses `type: flow`
- [ ] All overlay files are parseable by their respective loaders
- [ ] Bundled profiles cannot be overridden directly (`BUNDLED_OVERRIDE_BLOCKED`)
- [ ] Custom domains with `extends: <bundled>` inherit missing files from parent
- [ ] Resetting to bundled profile = changing domain name back (no file cleanup needed)
- [ ] Governance files are applied as a second layer on top of domain profiles
- [ ] `docs/project-types.md` documents each bundled profile (software, data-engineering, process-automation) with overlay contents and customization examples
- [ ] `docs/getting-started.md` includes a section on choosing and configuring a domain profile
- [ ] All quality gates pass (tests, lint)
- [ ] No constitutional violations introduced
