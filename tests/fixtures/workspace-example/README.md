# Workspace Example — Test Fixture

A realistic multi-repo workspace fixture for testing the adev workspace feature. Models a simplified data platform with 3 repos connected by a dependency graph.

## Structure

```
workspace-example/
├── adev-workspace.yaml       # Workspace config: 3 repos + 2 dependencies
├── .context-index/           # Workspace-level context
│   └── specs/
│       └── features/
│           └── customer-ltv/
│               └── charter.md
├── repos/
│   ├── dbt-models/           # Transformation layer (upstream)
│   │   ├── .context-index/
│   │   │   ├── manifest.yaml
│   │   │   └── specs/features/customer-ltv/
│   │   │       └── ltv-model.md
│   │   └── models/
│   │       └── customer_ltv.sql
│   ├── data-api/             # Serving layer (depends on dbt-models)
│   │   ├── .context-index/
│   │   │   ├── manifest.yaml
│   │   │   └── specs/features/customer-ltv/
│   │   │       └── ltv-endpoint.md
│   │   └── src/
│   │       └── routes/ltv.js
│   └── airflow-dags/         # Orchestration layer (depends on dbt-models)
│       ├── .context-index/
│       │   ├── manifest.yaml
│       │   └── specs/features/customer-ltv/
│       │       └── ltv-schedule.md
│       └── dags/
│           └── customer_ltv_dag.py
```

## Dependency Graph

```
       airflow-dags
            │
            │ orchestrates
            ▼
       dbt-models  ◀──── consumes ──── data-api
```

Using the `from → to` convention (from depends on to):

- `data-api → dbt-models` (API consumes dbt outputs)
- `airflow-dags → dbt-models` (Airflow orchestrates dbt)

Topological order for planning: `dbt-models` first, then `data-api` and `airflow-dags` in parallel.

## Cross-Repo References

- `data-api/customer-ltv/ltv-endpoint.md` has `depends-on: ["@dbt-models/ltv-model"]`
- `airflow-dags/customer-ltv/ltv-schedule.md` has `depends-on: ["@dbt-models/ltv-model"]`

## Testable Scenarios

| Scenario | How to Test |
|----------|-------------|
| Workspace detection | `detectWorkspace` from any repo subdir returns the workspace root |
| Current repo resolution | `detectWorkspace` from `repos/data-api/src/` sets `currentRepoSlug: "data-api"` |
| Workspace root resolution | `detectWorkspace` from workspace root sets `currentRepoSlug: null` |
| Context resolution | `resolveWorkspaceContext` returns 2 sibling repos from `data-api` |
| Cross-repo ref resolution | `resolveRef(root, cfg, "@dbt-models/ltv-model")` returns absolute path to `ltv-model.md` |
| Null for unknown ref | `resolveRef(root, cfg, "@unknown/spec")` returns `null` |
| Dependency graph | `config.dependencies` has 2 entries |
| Topological ordering | dbt-models has no dependencies, api and airflow both depend on it |

## Notes

- All source files are minimal stubs (1-3 lines) — this fixture is for testing workspace structure, not code analysis.
- Each repo's `.context-index/manifest.yaml` is minimal but valid.
- Specs are marked `status: review-passed` so they're treated as stable cross-repo references.
- No `.git/` directories — this is a filesystem fixture, not a real git setup.
