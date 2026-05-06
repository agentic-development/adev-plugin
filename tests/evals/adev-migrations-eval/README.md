# adev-migrations-eval

## Overview

A self-contained data migration project with two parallel ETL pipelines processing the same source data. The legacy pipeline uses custom Python code driven by YAML configuration files; the modern pipeline uses dbt with DuckDB. Both pipelines read from the same CSV sources and produce comparable output, enabling direct comparison of results.

This project serves as an eval target for benchmarking adev skill quality and as an onboarding demo where new users experience the full adev lifecycle on a real codebase.

## Quick Start

```bash
# Install dependencies
pip install -r requirements.txt

# Run the legacy pipeline
python run_legacy.py

# Run the modern (dbt) pipeline
dbt run --project-dir dbt_project --profiles-dir dbt_project
python export_dbt_output.py

# Compare outputs
python compare_outputs.py

# Run tests
python -m pytest tests/
```

## Architecture

The project contains two independent ETL implementations:

**Legacy Pipeline** (`legacy/`)
- Config-driven Python pipeline reading YAML configuration from `legacy/config.yaml`
- Loads CSV sources, merges tables via custom join functions, aggregates by customer
- Writes output to `data/output/legacy/order_summary.csv`

**Modern Pipeline** (`dbt_project/`)
- dbt project with DuckDB adapter
- Staging models read source CSVs via DuckDB's `read_csv_auto()`
- Mart model joins and aggregates using standard SQL with LEFT JOIN
- Output exported to `data/output/modern/order_summary.csv` via `export_dbt_output.py`

**Data Flow:**
```
data/source/*.csv
    |
    +---> legacy/ pipeline ---> data/output/legacy/order_summary.csv
    |
    +---> dbt_project/ pipeline ---> data/output/modern/order_summary.csv
    |
    +---> compare_outputs.py (diffs the two outputs)
```

## TODO Features

1. **Add product category dimension** (simple) -- Extend both pipelines to include product category in the order summary. Exercises: specify, implement.
2. **Data validation layer** (medium) -- Add pre-pipeline validation for source CSVs including schema checks, null checks, and referential integrity. Exercises: brainstorm, specify, implement, validate.
3. **Incremental loading** (complex) -- Make the dbt pipeline incremental, processing only new orders since the last run. Exercises: brainstorm, specify, plan, implement, validate.
4. **Legacy pipeline deprecation report** (medium) -- Generate a report showing which legacy config entries map to which dbt models, highlighting unmigrated transforms. Exercises: specify, plan, implement.
5. **Output reconciliation dashboard** (medium) -- Extend `compare_outputs.py` to produce an HTML report with row-level diffs and summary statistics. Exercises: brainstorm, specify, implement.

## License

MIT License. See [LICENSE](LICENSE) for details.
