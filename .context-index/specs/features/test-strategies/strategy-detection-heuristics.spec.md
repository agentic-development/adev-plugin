---
charter: test-strategies
status: validated
revision: 1
charter-revision: 2
created: 2026-04-20
updated: 2026-05-04
source-manifest:
  files:
    - lib/test-strategies/detection.mjs
  computed-at: "2026-05-10T23:51:01.456Z"
---

# Spec: Strategy Detection Heuristics

## Capability

Auto-detect available strategies from project files (`dbt_project.yml` -> fixture, Terraform -> policy, etc.) and task file paths (`migrations/` -> schema).

## Preconditions

- A project root directory exists and is accessible
- The strategy type registry is available

## Behavioral Contract

### Behaviors — Project-Level Detection

1. When `detectStrategies(projectRoot)` is called, then it scans for project indicator files and returns a list of detected strategy IDs with confidence levels
2. When the project root contains `dbt_project.yml` or `profiles.yml`, then `fixture` strategy is detected with high confidence
3. When the project root contains `*.tf` files or a `terraform/` directory, then `policy` strategy is detected with high confidence
4. When the project root contains `Dockerfile`, `k8s/`, `kubernetes/`, or `helm/` directories, then `policy` strategy is detected with medium confidence
5. When the project root contains a `migrations/` directory, `prisma/schema.prisma`, `alembic/`, or `flyway/` config, then `schema` strategy is detected with high confidence
6. When the project root contains `*.proto` files, `openapi.yaml`, or a `contracts/` directory, then `contract` strategy is detected with high confidence
7. When the project root contains component-style directories (`src/components/`, `app/components/`) with UI framework indicators (React, Vue, Svelte, Angular), then `visual` strategy is detected with medium confidence
8. When the project root contains `k6/`, `locust/`, `artillery/`, or `*.bench.*` files, then `threshold` strategy is detected with medium confidence
9. When no indicator files are found for a strategy, then that strategy is not included in the detection results
10. When `detectStrategies()` completes, then `unit` is always included in the results (it applies to every project) with high confidence

### Behaviors — Task-Level Detection

11. When a task's file paths include files under `migrations/`, `prisma/migrations/`, or `alembic/versions/`, then strategy resolves to `schema`
12. When a task's file paths include `*.tf`, `*.tfvars`, or Kubernetes manifests, then strategy resolves to `policy`
13. When a task's file paths include dbt model files (`models/**/*.sql`), then strategy resolves to `fixture`
14. When a task's file paths include `*.proto`, `*.pact.json`, or OpenAPI spec files, then strategy resolves to `contract`
15. When a task's file paths include UI component files in detected UI framework directories, then strategy resolves to `visual`
16. When a task's file paths match none of the above heuristics, then strategy resolves to `unit`

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `projectRoot` does not exist | Returns empty list with warning | INVALID_PROJECT_ROOT |
| `projectRoot` is not readable | Returns empty list with warning | PERMISSION_DENIED |
| Detection takes longer than 2 seconds | Aborts and returns partial results with warning | DETECTION_TIMEOUT |

## Constitution Reference

- "Minimize external dependencies" — Detection uses Node.js `fs.glob`/`readdir` only, no external tools
- "Skills are primarily markdown" — Detection heuristic rules are documented as a reference table in the skill markdown

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Define indicator file mapping | Map project files to strategy IDs with confidence levels | medium |
| Implement project-level detection | `detectStrategies(projectRoot)` using file globbing | medium |
| Implement task-level detection | `detectTaskStrategy(filePaths)` using path pattern matching | medium |
| Performance constraint | Ensure detection completes in under 2s on 10k-file repos | small |

## Acceptance Criteria

- [ ] `detectStrategies()` returns correct strategies for dbt, Terraform, Prisma, React, k6, protobuf, and plain Node.js projects
- [ ] `unit` is always present in detection results
- [ ] Detection uses file globbing only (no content parsing)
- [ ] Completes in under 2 seconds on repos with up to 10k files
- [ ] Task-level detection resolves file paths to the correct strategy
- [ ] Deterministic: same inputs always produce same outputs
- [ ] No external dependencies
- [ ] All quality gates pass
- [ ] No constitutional violations introduced
