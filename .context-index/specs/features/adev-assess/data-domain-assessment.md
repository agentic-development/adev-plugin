# Live Spec: Data Domain Assessment

<!-- Live Spec within the adev-assess charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/adev-assess/charter.md -->

---
charter: adev-assess
status: draft
risk_level: low
milestone: v2
revision: 1
charter-revision: 1
created: 2026-03-24
updated: 2026-03-24
charter-extension: true
---

## Behavioral Contract

### Preconditions

- The skill is invoked with `--domain` flag (or defaults to `code`)
- Target directory is the current working directory (cwd) or explicitly specified

### Behaviors

1. **When** `--domain code` is set **then** assess using 8 structural dimensions
2. **When** `--domain code` and `.context-index/` exists **then** add 3 adev dimensions (total 11)
3. **When** `--domain data` is set **then** assess using 14 dimensions (8 shared + 6 data-specific)
4. **When** no `--domain` flag is provided **then** default to `code` domain
5. **When** dimension is assessed **then** produce score 0-100 with evidence
6. **When** total score is calculated **then** derive maturity level (L1-L5)
7. **When** assessment completes **then** output in specified format (markdown/json)

### Postconditions

- Domain flag is respected in dimension selection
- JSON output includes `domain` field
- Markdown output shows domain label
- No files modified on filesystem

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Invalid --domain value provided | Print error with valid options (code, data) | 1 |
| No matching files for dimension | Score as 0 with evidence "No evidence found" | N/A |

## Shared Dimensions (code + data)

These dimensions apply to both code and data domains:

| Dimension | Weight | Scoring Criteria |
|-----------|--------|-----------------|
| Documentation | 12.5% | README.md presence, docs/ directory |
| Dependency Hygiene | 12.5% | package.json quality, lock file presence |
| Build Configuration | 12.5% | Build scripts, config files (adapted for data tools in data domain) |
| Spec Sources | 12.5% | Architecture docs, ADRs, data contracts in data domain |

### Code Domain Dimensions (Full Set)

When `--domain code` is set, the following 8 structural dimensions are assessed:

| Dimension | Weight | Scoring Criteria |
|-----------|--------|-----------------|
| Test Infrastructure | 12.5% | Test files, test framework, coverage |
| Type Safety | 12.5% | TypeScript, JSDoc, type annotations |
| Modularity | 12.5% | File organization, single responsibility |
| Naming | 12.5% | Consistent naming conventions |
| Documentation | 12.5% | README, docs, comments |
| Dependency Hygiene | 12.5% | package.json quality |
| Build Configuration | 12.5% | Build scripts, lint config |
| Spec Sources | 12.5% | Architecture docs, ADRs |

When `.context-index/` exists, 3 additional adev dimensions are assessed (total 11):
- Adev Context Index
- Adev Skills
- Adev Hooks

## Data-Specific Dimensions

These dimensions only apply when `--domain data` is set:

| Dimension | Weight | Patterns to Detect |
|-----------|--------|-------------------|
| Orchestration | 16.67% | `dags/`, `airflow/`, `Dagster/`, `prefect/`, `*.cron`, workflow files |
| Data Lineage | 16.67% | `lineage/`, dbt source/ref usage, schema.yml with refs |
| Schema Management | 16.67% | `dbt_project.yml`, `models/`, `schemas/`, `.schema.json` |
| Data Quality | 16.67% | `great_expectations/`, `expectations/`, `.soda/`, dbt tests |
| Infrastructure as Code | 16.67% | `terraform/`, `*.tf`, `cloudformation/`, `Pulumi.yaml` |
| Metadata | 16.67% | `catalog/`, `metadata/`, data docs, `.metadata.json` |

## System Constitution Reference

- **Principle:** "Minimize external dependencies" — Uses only Node.js built-ins for file inspection
- **Principle:** "Skills are primarily markdown" — The skill is defined in SKILL.md
- **Principle:** "Pure ESM" — All companion code uses .mjs extension

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Update SKILL.md | Add --domain flag and data dimensions section | medium |
| Add data dimension scoring logic | Implement 6 new dimension assessors | medium |
| Add data domain tests | Create sample project and test scoring | small |
| Update JSON output schema | Add domain field to report | small |

## Acceptance Criteria

- [ ] `--domain code` returns 8 structural dimensions
- [ ] `--domain code` with .context-index/ returns 11 dimensions (8 + 3 adev)
- [ ] `--domain data` returns 14 dimensions (8 shared + 6 data-specific)
- [ ] Invalid --domain value shows error with valid options
- [ ] JSON output includes domain field
- [ ] Markdown output shows domain label
- [ ] All quality gates pass (tests, lint)
- [ ] No constitutional violations introduced
