---
charter: eval-projects
status: implemented
risk_level: low
milestone:
revision: 2
charter-revision: 1
created: 2026-05-06
updated: 2026-05-06
source-manifest:
  sha: "af60ab5"
  files:
    - tests/evals/data-migration/rubrics/.gitkeep
    - tests/evals/data-migration/scenarios/.gitkeep
  computed-at: "2026-05-11T16:09:58.839Z"
---

# Live Spec: Migration Eval Project

<!-- Live Spec within the eval-projects charter.
     Python+YAML legacy ETL migrating to dbt+DuckDB.
     Parent Charter: .context-index/specs/features/eval-projects/charter.md -->

## Behavioral Contract

A self-contained Python project (`adev-migrations-eval`) with two parallel ETL pipelines processing the same source data: a legacy custom Python pipeline driven by YAML config files, and a modern dbt+DuckDB pipeline. Both produce comparable output from the same CSV sources. The legacy pipeline contains a planted bug that silently drops rows. No Docker required — DuckDB and SQLite run in-process.

### Preconditions

- Python 3.11+ is installed
- `pip install -r requirements.txt` has been run (dependencies: `duckdb`, `dbt-duckdb`, `pyyaml`)
- Source data exists at `data/source/customers.csv`, `data/source/orders.csv`, `data/source/products.csv`
- Shared conventions from `shared-conventions.spec.md` are satisfied

### Behaviors

1. **When** `python run_legacy.py` is executed **then** it reads YAML config from `legacy/config.yaml`, processes source CSVs through the legacy pipeline, and writes output to `data/output/legacy/`.

2. **When** `dbt run --project-dir dbt_project` is executed **then** it processes the same source CSVs through dbt models and writes output to `data/output/modern/`.

3. **When** both pipelines complete **then** `data/output/legacy/order_summary.csv` and `data/output/modern/order_summary.csv` contain the same columns: customer_id, customer_name, total_orders, total_revenue, avg_order_value.

4. **When** the outputs are compared row-by-row **then** the legacy output has fewer rows than the modern output. The legacy pipeline silently drops customers whose `region` column is NULL during a JOIN, while the dbt pipeline correctly includes them with `region` as NULL.

5. **When** `python run_legacy.py` is executed **then** the legacy pipeline reads `legacy/config.yaml` for: source paths, column mappings, join keys, and output path. The config is the single source of truth for pipeline behavior.

6. **When** `python -m pytest tests/` is run **then** all unit tests pass. Tests cover individual transform functions with non-NULL test data — no NULL region values in test fixtures.

7. **When** `python compare_outputs.py` is run **then** it prints a diff summary showing row count differences and missing customer IDs between legacy and modern outputs.

### Planted Bug

The legacy pipeline's JOIN between customers and orders uses an INNER JOIN through a custom `merge_tables()` function. The function filters out rows where any non-key column is NULL before joining, intended as a "data quality" step. This silently drops 3 customers whose `region` is NULL, even though region is not a join key. The dbt pipeline uses a standard LEFT JOIN that preserves these customers.

**Symptom:** `compare_outputs.py` shows the legacy output has 3 fewer customers than the modern output. The missing customers all have NULL region values.

**Root cause:** `legacy/transforms.py`, line ~60, `merge_tables()` calls `df.dropna()` on the entire dataframe before joining instead of only checking the join key columns.

**Discovery path:** Run both pipelines, run `compare_outputs.py`, identify missing customer IDs, check their source data — all have `region=NULL`. Trace to the merge function.

### Postconditions

- Both pipelines produce output in `data/output/legacy/` and `data/output/modern/`
- `compare_outputs.py` works and reveals the discrepancy
- All unit tests pass on both branches
- The dbt pipeline produces the correct (complete) output

### Error Cases

| Condition | Expected Behavior | Exit Code |
|-----------|-------------------|-----------|
| Missing source CSV | Pipeline exits with "Source file not found: <path>" | 1 |
| Malformed YAML config | Legacy pipeline exits with "Config parse error" | 1 |
| dbt project missing `profiles.yml` | `dbt run` fails with dbt's standard error | 1 |
| Output directory not writable | Pipeline exits with permission error | 1 |

## Project Structure

```
adev-migrations-eval/
├── run_legacy.py             # Legacy pipeline orchestrator
├── compare_outputs.py        # Diff tool for legacy vs modern output
├── legacy/
│   ├── config.yaml           # Source paths, column mappings, join keys
│   ├── transforms.py         # Transform functions (contains planted bug)
│   ├── loaders.py            # CSV reader/writer
│   └── pipeline.py           # Stage sequencing
├── dbt_project/
│   ├── dbt_project.yml
│   ├── profiles.yml          # DuckDB connection config
│   ├── models/
│   │   ├── staging/
│   │   │   ├── stg_customers.sql
│   │   │   ├── stg_orders.sql
│   │   │   └── stg_products.sql
│   │   └── marts/
│   │       └── order_summary.sql
│   └── seeds/                # Symlinks to data/source/ CSVs
├── data/
│   ├── source/
│   │   ├── customers.csv     # 25 customers, 3 with NULL region
│   │   ├── orders.csv        # ~80 orders
│   │   └── products.csv      # 15 products
│   └── output/               # Created by pipelines (gitignored)
├── tests/
│   ├── test_transforms.py
│   └── test_loaders.py
├── requirements.txt          # duckdb, dbt-duckdb, pyyaml
├── README.md
└── LICENSE
```

## System Constitution Reference

- **"Minimize external dependencies"** — Three dependencies: `duckdb`, `dbt-duckdb`, `pyyaml`. All standard for a data project. dbt-duckdb pulls dbt-core transitively.
- **"Skills are primarily markdown"** — `with-context` branch is pure markdown/YAML.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Create repo and seed data | Initialize repo, generate customers (25), orders (~80), products (15) CSVs | small |
| Implement legacy pipeline | Config-driven transforms, loaders, pipeline orchestration with planted bug | medium |
| Implement dbt project | Staging models, marts, profiles for DuckDB | medium |
| Implement compare tool | `compare_outputs.py` that diffs legacy vs modern output | small |
| Write unit tests | Tests for transforms and loaders with clean test data | medium |
| Verify end-to-end | Inside `tests/evals/adev-migrations-eval/`: run `pip install -r requirements.txt && python run_legacy.py && dbt run --project-dir dbt_project`, verify both outputs exist | medium |
| Verify planted bug | Run `python compare_outputs.py` — confirm legacy output has 3 fewer customers than modern output, all with NULL region | small |
| Verify unit tests | Run `python -m pytest tests/` inside the project — all tests must pass despite the planted bug | small |
| Create `with-context` branch | Branch off main, populate `.context-index/` | medium |
| Write README | Follow shared conventions template with 5 TODO features | small |
| Register submodule | Add to adev-plugin at `tests/evals/adev-migrations-eval/` | small |

## TODO Features (for README)

1. **Add product category dimension** (simple) — Extend both pipelines to include product category in the order summary. Exercises: specify, implement.
2. **Data validation layer** (medium) — Add pre-pipeline validation for source CSVs (schema checks, null checks, referential integrity). Exercises: brainstorm, specify, implement, validate.
3. **Incremental loading** (complex) — Make the dbt pipeline incremental (process only new orders since last run). Exercises: brainstorm, specify, plan, implement, validate.
4. **Legacy pipeline deprecation report** (medium) — Generate a report showing which legacy config entries map to which dbt models, highlighting unmigrated transforms. Exercises: specify, plan, implement.
5. **Output reconciliation dashboard** (medium) — Extend `compare_outputs.py` to produce an HTML report with row-level diffs and summary stats. Exercises: brainstorm, specify, implement.

## Acceptance Criteria

- [ ] Repo exists as `adev-migrations-eval` with `main` and `with-context` branches
- [ ] `python run_legacy.py` completes and writes to `data/output/legacy/`
- [ ] `dbt run --project-dir dbt_project` completes and writes to `data/output/modern/`
- [ ] `python compare_outputs.py` reveals the row count discrepancy
- [ ] Planted bug is present: legacy drops 3 customers with NULL region
- [ ] All unit tests pass (`python -m pytest tests/`)
- [ ] Planted bug is NOT detectable by unit tests (test fixtures have no NULL regions)
- [ ] `with-context` branch has valid `.context-index/` with extracted spec
- [ ] README follows shared conventions (6 sections in order, 5 TODO features)
- [ ] Registered as submodule at `tests/evals/adev-migrations-eval/`
- [ ] Eval harness scaffold exists at `tests/evals/data-migration/scenarios/` and `rubrics/`
- [ ] All quality gates pass
- [ ] No constitutional violations introduced
