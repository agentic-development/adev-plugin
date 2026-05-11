# Live Spec: Pipeline Eval Project

<!-- Live Spec within the eval-projects charter.
     Python weather station data pipeline with DuckDB.
     Parent Charter: .context-index/specs/features/eval-projects/charter.md -->

---
charter: eval-projects
status: validated
risk_level: low
milestone: v1
revision: 2
charter-revision: 1
created: 2026-05-06
updated: 2026-05-06
source-manifest:
  sha: "10d2549"
  files:
    - tests/evals/adev-pipeline-eval/.gitignore
    - tests/evals/adev-pipeline-eval/LICENSE
    - tests/evals/adev-pipeline-eval/README.md
    - tests/evals/adev-pipeline-eval/data/output/.gitkeep
    - tests/evals/adev-pipeline-eval/data/raw/readings.csv
    - tests/evals/adev-pipeline-eval/data/raw/stations.csv
    - tests/evals/adev-pipeline-eval/requirements.txt
    - tests/evals/adev-pipeline-eval/run_pipeline.py
    - tests/evals/adev-pipeline-eval/stages/__init__.py
    - tests/evals/adev-pipeline-eval/stages/aggregate.py
    - tests/evals/adev-pipeline-eval/stages/clean.py
    - tests/evals/adev-pipeline-eval/stages/ingest.py
    - tests/evals/adev-pipeline-eval/stages/load.py
    - tests/evals/adev-pipeline-eval/tests/__init__.py
    - tests/evals/adev-pipeline-eval/tests/test_clean.py
    - tests/evals/adev-pipeline-eval/tests/test_ingest.py
    - tests/evals/adev-pipeline-eval/tests/test_load.py
    - tests/evals/data-pipeline/rubrics/.gitkeep
    - tests/evals/data-pipeline/scenarios/.gitkeep
  computed-at: "2026-05-11T16:09:58.840Z"
---

## Behavioral Contract

A self-contained Python project (`adev-pipeline-eval`) that ingests weather station CSV data, cleans it, computes daily aggregates, and loads results into a DuckDB database. The pipeline runs end-to-end with `python run_pipeline.py` and produces a summary report. No Docker required — DuckDB runs in-process.

### Preconditions

- Python 3.11+ is installed
- `pip install -r requirements.txt` has been run (only dependency: `duckdb`)
- Seed data exists at `data/raw/stations.csv` and `data/raw/readings.csv`
- Shared conventions from `shared-conventions.spec.md` are satisfied (branch layout, README structure, etc.)

### Behaviors

1. **When** `python run_pipeline.py` is executed **then** it runs four stages in order: ingest → clean → aggregate → load, printing stage names and row counts to stdout.

2. **When** the ingest stage runs **then** it reads `data/raw/stations.csv` (station_id, name, latitude, longitude, elevation) and `data/raw/readings.csv` (station_id, timestamp, temperature_c, humidity_pct, pressure_hpa) into DuckDB staging tables.

3. **When** the clean stage runs **then** it removes rows with NULL temperature readings, clamps humidity to [0, 100], and flags readings where pressure is outside [870, 1084] hPa as anomalies (kept but flagged, not dropped).

4. **When** the aggregate stage runs **then** it computes daily averages (avg_temp, avg_humidity, avg_pressure, reading_count) per station per day, stored in a `daily_summaries` table.

5. **When** the load stage runs **then** it exports `daily_summaries` to `data/output/daily_report.csv` and prints a summary line: total stations, total days, total readings processed.

6. **When** the pipeline completes successfully **then** `data/output/daily_report.csv` exists, is valid CSV with headers, and contains one row per station-day combination.

7. **When** `python -m pytest tests/` is run **then** all unit tests pass. Tests cover ingest parsing, clean transformations, and load output format. Tests do NOT cover aggregate correctness at the integration level (this is where the planted bug hides).

### Planted Bug

The aggregate stage filters stations using `station_id < max_station_id` instead of `station_id <= max_station_id`. This silently excludes the station with the highest alphabetical station_id from all daily averages. The output CSV has correct format and headers but is missing rows for one station. The unit tests pass because they test aggregation logic with hardcoded station lists, not the filter query.

**Symptom:** Running the pipeline and counting distinct stations in the output yields one fewer station than in the input. The missing station is whichever sorts last alphabetically.

**Root cause:** `aggregate.py`, line ~35, SQL WHERE clause uses `<` instead of `<=`.

**Discovery path:** Compare `SELECT DISTINCT station_id FROM readings` against `SELECT DISTINCT station_id FROM daily_summaries`. One station is missing. Trace to the aggregation query.

### Postconditions

- `data/output/daily_report.csv` exists with valid CSV content
- DuckDB database file exists at `data/pipeline.duckdb`
- All unit tests pass on both `main` and `with-context` branches
- The planted bug is present and produces the described symptom

### Error Cases

| Condition | Expected Behavior | Exit Code |
|-----------|-------------------|-----------|
| Missing `data/raw/` directory | Pipeline exits with "Seed data not found" message | 1 |
| Malformed CSV (wrong column count) | Ingest stage exits with parse error and file path | 1 |
| Empty readings file (headers only) | Pipeline completes but output CSV has headers only, summary shows 0 readings | 0 |
| DuckDB file locked by another process | Pipeline exits with "Database locked" message | 1 |

## Project Structure

```
adev-pipeline-eval/
├── run_pipeline.py           # Orchestrator — calls stages in order
├── stages/
│   ├── __init__.py
│   ├── ingest.py             # CSV → DuckDB staging tables
│   ├── clean.py              # Null removal, clamping, anomaly flagging
│   ├── aggregate.py          # Daily averages per station (contains planted bug)
│   └── load.py               # DuckDB → output CSV + summary
├── data/
│   ├── raw/
│   │   ├── stations.csv      # 8 weather stations, static seed data
│   │   └── readings.csv      # ~500 readings across 30 days
│   └── output/               # Created by pipeline (gitignored)
├── tests/
│   ├── test_ingest.py
│   ├── test_clean.py
│   └── test_load.py
├── requirements.txt          # duckdb only
├── README.md                 # Follows shared conventions template
└── LICENSE
```

## System Constitution Reference

- **"Minimize external dependencies"** — Single dependency: `duckdb`. All pipeline logic uses Python stdlib.
- **"Skills are primarily markdown"** — The `with-context` branch's `.context-index/` contains only markdown/YAML, no Python.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Create repo and seed data | Initialize `adev-pipeline-eval`, generate `stations.csv` (8 stations) and `readings.csv` (~500 rows) | small |
| Implement ingest stage | Read CSVs into DuckDB staging tables | small |
| Implement clean stage | NULL removal, humidity clamping, pressure anomaly flagging | small |
| Implement aggregate stage | Daily averages per station with planted bug in filter | medium |
| Implement load stage | Export to CSV, print summary | small |
| Implement orchestrator | `run_pipeline.py` calling stages in order | small |
| Write unit tests | Tests for ingest, clean, load (not aggregate integration) | medium |
| Create `with-context` branch | Branch off main, populate `.context-index/` with constitution, manifest, platform-context, extracted spec | medium |
| Verify end-to-end | Inside `tests/evals/adev-pipeline-eval/`: run `pip install -r requirements.txt && python run_pipeline.py`, verify output CSV exists and is valid | medium |
| Verify planted bug | Compare distinct station_id counts between input and output — confirm one station is missing from output | small |
| Verify unit tests | Run `python -m pytest tests/` inside the project — all tests must pass despite the planted bug | small |
| Write README | Follow shared conventions template with 5 TODO features | small |
| Register submodule | Add to adev-plugin at `tests/evals/adev-pipeline-eval/` | small |

## TODO Features (for README)

1. **Add wind speed metric** (simple) — Add wind_speed_kmh column to readings, update clean and aggregate stages. Exercises: specify, plan, implement.
2. **Weekly rollup report** (medium) — Aggregate daily summaries into weekly summaries with min/max/avg. Exercises: brainstorm, specify, implement, validate.
3. **Station metadata enrichment** (simple) — Join station elevation/location into daily report output. Exercises: specify, implement.
4. **Anomaly alert system** (complex) — Detect outlier readings (>2σ from station mean) and write alerts to `data/output/alerts.csv`. Exercises: brainstorm, specify, plan, implement, validate.
5. **Pipeline idempotency** (medium) — Make pipeline safe to re-run without duplicating data. Exercises: specify, plan, implement, validate.

## Acceptance Criteria

- [ ] Repo exists as `adev-pipeline-eval` with `main` and `with-context` branches
- [ ] `python run_pipeline.py` completes successfully on `main` branch
- [ ] Output CSV is valid with correct headers and station-day rows
- [ ] Planted bug is present: one station missing from output (last alphabetically)
- [ ] All unit tests pass (`python -m pytest tests/`)
- [ ] Planted bug is NOT detectable by unit tests
- [ ] `with-context` branch has valid `.context-index/` with extracted spec
- [ ] README follows shared conventions (6 sections in order, 5 TODO features)
- [ ] Registered as submodule at `tests/evals/adev-pipeline-eval/`
- [ ] Eval harness scaffold exists at `tests/evals/data-pipeline/scenarios/` and `rubrics/`
- [ ] Only dependency is `duckdb` in requirements.txt
- [ ] All quality gates pass
- [ ] No constitutional violations introduced
