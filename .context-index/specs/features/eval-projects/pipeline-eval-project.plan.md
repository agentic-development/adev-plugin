<!-- DO NOT EDIT statuses inline — see lifecycle log pipeline-eval-project.jsonl -->
# Implementation Plan: Pipeline Eval Project

> **Methodology:** adev
> **Charter:** .context-index/specs/features/eval-projects/charter.md
> **Spec:** .context-index/specs/features/eval-projects/pipeline-eval-project.spec.md
> **Review:** PASS (2026-05-06)
> **Platform:** Python 3.11+, DuckDB, pytest

**Goal:** Create a self-contained Python weather station data pipeline project (`adev-pipeline-eval`) that serves as an eval target and onboarding demo for the adev framework.

**Architecture:** The project is a standalone Git repo with a four-stage pipeline (ingest, clean, aggregate, load) orchestrated by `run_pipeline.py`. DuckDB runs in-process as an embedded database — no Docker or external services needed. The project includes a deliberately planted off-by-one bug in the aggregate stage's SQL filter, unit tests that pass despite the bug, and a `with-context` branch pre-populated with `.context-index/` for adev eval runs. The project is registered as a git submodule in adev-plugin at `tests/evals/adev-pipeline-eval/`.

---

## File Structure

**Create:**
- `tests/evals/adev-pipeline-eval/run_pipeline.py` — Pipeline orchestrator
- `tests/evals/adev-pipeline-eval/stages/__init__.py` — Package init
- `tests/evals/adev-pipeline-eval/stages/ingest.py` — CSV to DuckDB staging
- `tests/evals/adev-pipeline-eval/stages/clean.py` — Data cleaning and flagging
- `tests/evals/adev-pipeline-eval/stages/aggregate.py` — Daily averages (contains planted bug)
- `tests/evals/adev-pipeline-eval/stages/load.py` — DuckDB to CSV export
- `tests/evals/adev-pipeline-eval/data/raw/stations.csv` — 8 weather stations seed data
- `tests/evals/adev-pipeline-eval/data/raw/readings.csv` — ~500 readings across 30 days
- `tests/evals/adev-pipeline-eval/data/output/.gitkeep` — Output directory placeholder
- `tests/evals/adev-pipeline-eval/tests/test_ingest.py` — Ingest unit tests
- `tests/evals/adev-pipeline-eval/tests/test_clean.py` — Clean unit tests
- `tests/evals/adev-pipeline-eval/tests/test_load.py` — Load unit tests
- `tests/evals/adev-pipeline-eval/tests/__init__.py` — Test package init
- `tests/evals/adev-pipeline-eval/requirements.txt` — duckdb only
- `tests/evals/adev-pipeline-eval/README.md` — Shared conventions template
- `tests/evals/adev-pipeline-eval/LICENSE` — MIT license
- `tests/evals/adev-pipeline-eval/.gitignore` — Ignore output and DuckDB files
- `tests/evals/data-pipeline/scenarios/.gitkeep` — Eval harness scaffold
- `tests/evals/data-pipeline/rubrics/.gitkeep` — Eval harness scaffold

**Reference (read, do not modify):**
- `.context-index/specs/features/eval-projects/shared-conventions.spec.md` — Branch layout, README structure, planted bug rules
- `.context-index/specs/features/eval-projects/charter.md` — Capability map and domain model

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/eval-projects/pipeline-eval-project.spec.md` (Project Structure, Preconditions)
- Charter: `.context-index/specs/features/eval-projects/charter.md` (capability: Pipeline Eval Project)
- Cross-cutting: `.context-index/specs/features/eval-projects/shared-conventions.spec.md` (Behaviors 1-2, 9-10)

### Task 2 Context
- Spec: `.context-index/specs/features/eval-projects/pipeline-eval-project.spec.md` (Project Structure, seed data columns)
- Charter: `.context-index/specs/features/eval-projects/charter.md` (quality: Reproducibility — static seed data)

### Task 3 Context
- Spec: `.context-index/specs/features/eval-projects/pipeline-eval-project.spec.md` (Behavior 2 — ingest stage)
- Spec: `.context-index/specs/features/eval-projects/pipeline-eval-project.spec.md` (Error Cases — missing data, malformed CSV)

### Task 4 Context
- Spec: `.context-index/specs/features/eval-projects/pipeline-eval-project.spec.md` (Behavior 3 — clean stage)

### Task 5 Context
- Spec: `.context-index/specs/features/eval-projects/pipeline-eval-project.spec.md` (Behavior 4 — aggregate stage, Planted Bug section)
- Charter: `.context-index/specs/features/eval-projects/charter.md` (invariant: bug produces wrong output, not crashes)

### Task 6 Context
- Spec: `.context-index/specs/features/eval-projects/pipeline-eval-project.spec.md` (Behavior 5 — load stage)

### Task 7 Context
- Spec: `.context-index/specs/features/eval-projects/pipeline-eval-project.spec.md` (Behavior 1 — orchestrator)
- Spec: `.context-index/specs/features/eval-projects/pipeline-eval-project.spec.md` (Error Cases — all)

### Task 8 Context
- Spec: `.context-index/specs/features/eval-projects/pipeline-eval-project.spec.md` (Behavior 7 — unit tests)
- Spec: `.context-index/specs/features/eval-projects/pipeline-eval-project.spec.md` (Planted Bug — tests must NOT detect the bug)

### Task 9 Context
- Spec: `.context-index/specs/features/eval-projects/pipeline-eval-project.spec.md` (TODO Features section)
- Cross-cutting: `.context-index/specs/features/eval-projects/shared-conventions.spec.md` (Behaviors 7-8 — README structure)

### Task 10 Context
- Spec: `.context-index/specs/features/eval-projects/pipeline-eval-project.spec.md` (Postconditions, Acceptance Criteria)
- Cross-cutting: `.context-index/specs/features/eval-projects/shared-conventions.spec.md` (Behaviors 2, 5 — main branch validation)

### Task 11 Context
- Cross-cutting: `.context-index/specs/features/eval-projects/shared-conventions.spec.md` (Behaviors 3-4 — with-context branch)

### Task 12 Context
- Cross-cutting: `.context-index/specs/features/eval-projects/shared-conventions.spec.md` (Behaviors 9-10 — submodule, eval harness)
- Charter: `.context-index/specs/features/eval-projects/charter.md` (Dependencies — `.gitmodules`, `tests/evals/`)

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7 (project setup through orchestrator)
- Group B (depends on Group A): Task 8 (unit tests depend on all stages being implemented)
- Group C (depends on Group A): Task 9 (README depends on project structure being finalized)
- Group D (depends on Groups A-C): Task 10 (end-to-end verification)
- Group E (depends on Task 10): Task 11 (with-context branch requires verified main)
- Group F (depends on Task 10): Task 12 (submodule registration requires complete repo)

Tasks 8 and 9 can run in parallel. Tasks 11 and 12 can run in parallel.

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Initialize repo and project structure | small | unit | — | 4 create |
| 2 | Generate seed data | small | unit | Task 1 | 2 create |
| 3 | Implement ingest stage | small | unit | Task 1 | 1 create |
| 4 | Implement clean stage | small | unit | Task 3 | 1 create |
| 5 | Implement aggregate stage with planted bug | medium | unit | Task 3 | 1 create |
| 6 | Implement load stage | small | unit | Task 3 | 1 create |
| 7 | Implement pipeline orchestrator | small | unit | Task 3-6 | 1 create |
| 8 | Write unit tests | medium | unit | Task 3-6 | 3 create |
| 9 | Write README with TODO features | small | unit | Task 1 | 1 create |
| 10 | Verify end-to-end pipeline and planted bug | medium | unit | Task 7-8 | 0 create |
| 11 | Create with-context branch | medium | unit | Task 10 | 4 create |
| 12 | Register submodule and scaffold eval harness | small | unit | Task 10 | 3 create |

---

### Task 1: Initialize repo and project structure [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=5 pattern=2 blast=5 novelty=5
**Rationale:** Fully specified scaffolding with exact file contents; no golden sample but purely mechanical work.

**Charter capability:** Pipeline Eval Project
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `tests/evals/adev-pipeline-eval/.gitignore`
- Create: `tests/evals/adev-pipeline-eval/requirements.txt`
- Create: `tests/evals/adev-pipeline-eval/stages/__init__.py`
- Create: `tests/evals/adev-pipeline-eval/LICENSE`

**Tests:** `tests/evals/adev-pipeline-eval/tests/test_ingest.py` — test file created in Task 8; this task establishes the directory structure only.

- [x] **Create project directory and initial files**

Create the `tests/evals/adev-pipeline-eval/` directory tree:

```
adev-pipeline-eval/
├── stages/
│   └── __init__.py           # empty package init
├── data/
│   ├── raw/                  # seed data goes here (Task 2)
│   └── output/
│       └── .gitkeep
├── tests/
│   └── __init__.py           # empty test package init
├── .gitignore
├── requirements.txt
└── LICENSE
```

`.gitignore`:
```
data/output/*.csv
data/*.duckdb
__pycache__/
*.pyc
.pytest_cache/
```

`requirements.txt`:
```
duckdb
```

`LICENSE`: MIT license with year 2026.

`stages/__init__.py` and `tests/__init__.py`: empty files.

- [x] **Initialize git repo**

```bash
cd tests/evals/adev-pipeline-eval
git init
git add .
git commit -m "chore: initialize project structure"
```

---

### Task 2: Generate seed data [specialist: none]

**Routing:** assisted-agent (score: 15/20)
**Scores:** spec=5 pattern=1 blast=5 novelty=4
**Rationale:** Seed data columns and constraints are explicit, but no golden sample for data generation exists (pattern=1 override to assisted).

**Charter capability:** Pipeline Eval Project
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Create: `tests/evals/adev-pipeline-eval/data/raw/stations.csv`
- Create: `tests/evals/adev-pipeline-eval/data/raw/readings.csv`

**Tests:** Seed data format is verified by `test_ingest.py` in Task 8.

- [x] **Create stations.csv**

8 weather stations with columns: `station_id,name,latitude,longitude,elevation`

Station IDs should be alphabetically sortable strings (e.g., `STN-A` through `STN-H`). The last alphabetically (`STN-H`) will be the one excluded by the planted bug.

```csv
station_id,name,latitude,longitude,elevation
STN-A,Alpine Ridge,47.3769,8.5417,1520
STN-B,Bay Harbor,37.7749,-122.4194,5
STN-C,Cedar Valley,40.7128,-74.0060,25
STN-D,Desert Flats,33.4484,-112.0740,331
STN-E,Eagle Peak,39.7392,-104.9903,1609
STN-F,Frost Meadow,61.2181,-149.9003,30
STN-G,Glacier Point,46.8523,-121.7603,2100
STN-H,Highland Moor,56.4907,-4.2026,450
```

- [x] **Create readings.csv**

~500 readings across 30 days with columns: `station_id,timestamp,temperature_c,humidity_pct,pressure_hpa`

Requirements:
- Cover all 8 stations (STN-A through STN-H)
- Span 30 days (e.g., 2026-01-01 through 2026-01-30)
- ~2 readings per station per day
- Include some NULL temperature values (for clean stage to remove)
- Include some humidity values outside [0, 100] (for clean stage to clamp)
- Include some pressure values outside [870, 1084] hPa (for clean stage to flag as anomalies)
- All data is static — no randomization

- [x] **Commit seed data**

```bash
git add data/raw/
git commit -m "feat: add seed data (8 stations, ~500 readings)"
```

---

### Task 3: Implement ingest stage [specialist: none]

**Routing:** assisted-agent (score: 16/20)
**Scores:** spec=5 pattern=1 blast=5 novelty=5
**Rationale:** Implementation code is given in the plan with exact function signatures and SQL; no Python/DuckDB golden sample (pattern=1 override).

**Charter capability:** Pipeline Eval Project
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Create: `tests/evals/adev-pipeline-eval/stages/ingest.py`

**Tests:** `tests/evals/adev-pipeline-eval/tests/test_ingest.py` (created in Task 8)

- [x] **Write failing test**

(Test written in Task 8 — this task focuses on implementation. The TDD cycle is completed when Task 8 runs after this.)

- [x] **Implement ingest.py**

```python
import duckdb
import os

def run_ingest(conn):
    """Read CSV files into DuckDB staging tables."""
    data_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'raw')

    if not os.path.isdir(data_dir):
        raise FileNotFoundError("Seed data not found")

    stations_path = os.path.join(data_dir, 'stations.csv')
    readings_path = os.path.join(data_dir, 'readings.csv')

    conn.execute(f"""
        CREATE OR REPLACE TABLE stations AS
        SELECT * FROM read_csv_auto('{stations_path}')
    """)

    conn.execute(f"""
        CREATE OR REPLACE TABLE readings AS
        SELECT * FROM read_csv_auto('{readings_path}')
    """)

    station_count = conn.execute("SELECT COUNT(*) FROM stations").fetchone()[0]
    reading_count = conn.execute("SELECT COUNT(*) FROM readings").fetchone()[0]

    print(f"  Ingest: {station_count} stations, {reading_count} readings loaded")
    return station_count, reading_count
```

Handle error cases: missing directory raises `FileNotFoundError` with "Seed data not found"; malformed CSV surfaces DuckDB's parse error with file path.

- [x] **Commit**

```bash
git add stages/ingest.py
git commit -m "feat: implement ingest stage"
```

---

### Task 4: Implement clean stage [specialist: none]

**Routing:** assisted-agent (score: 16/20)
**Scores:** spec=5 pattern=1 blast=5 novelty=5
**Rationale:** Exact SQL transformations and function structure given; no Python/DuckDB golden sample (pattern=1 override).

**Charter capability:** Pipeline Eval Project
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 3
**Files:**
- Create: `tests/evals/adev-pipeline-eval/stages/clean.py`

**Tests:** `tests/evals/adev-pipeline-eval/tests/test_clean.py` (created in Task 8)

- [x] **Implement clean.py**

```python
def run_clean(conn):
    """Clean readings: remove NULL temps, clamp humidity, flag pressure anomalies."""

    # Remove rows with NULL temperature
    conn.execute("""
        DELETE FROM readings WHERE temperature_c IS NULL
    """)

    # Clamp humidity to [0, 100]
    conn.execute("""
        UPDATE readings SET humidity_pct = CASE
            WHEN humidity_pct < 0 THEN 0
            WHEN humidity_pct > 100 THEN 100
            ELSE humidity_pct
        END
    """)

    # Flag pressure anomalies (keep but flag)
    conn.execute("""
        ALTER TABLE readings ADD COLUMN IF NOT EXISTS pressure_anomaly BOOLEAN DEFAULT false
    """)
    conn.execute("""
        UPDATE readings SET pressure_anomaly = (pressure_hpa < 870 OR pressure_hpa > 1084)
    """)

    remaining = conn.execute("SELECT COUNT(*) FROM readings").fetchone()[0]
    anomalies = conn.execute("SELECT COUNT(*) FROM readings WHERE pressure_anomaly").fetchone()[0]

    print(f"  Clean: {remaining} readings retained, {anomalies} pressure anomalies flagged")
    return remaining, anomalies
```

- [x] **Commit**

```bash
git add stages/clean.py
git commit -m "feat: implement clean stage"
```

---

### Task 5: Implement aggregate stage with planted bug [specialist: none]

**Routing:** assisted-agent (score: 14/20)
**Scores:** spec=5 pattern=1 blast=5 novelty=3
**Rationale:** Code with deliberate bug is specified, but careful implementation needed to avoid hinting at the bug in comments or code; no golden sample (pattern=1 override).

**Charter capability:** Pipeline Eval Project
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 3
**Files:**
- Create: `tests/evals/adev-pipeline-eval/stages/aggregate.py`

**Tests:** `tests/evals/adev-pipeline-eval/tests/test_clean.py` — unit tests use hardcoded station lists and do NOT test the filter query.

- [x] **Implement aggregate.py**

The planted bug: the WHERE clause uses `<` instead of `<=` when filtering stations, causing the station with the highest alphabetical station_id to be excluded from aggregation results.

```python
def run_aggregate(conn):
    """Compute daily averages per station. Contains planted off-by-one bug."""

    max_station = conn.execute(
        "SELECT MAX(station_id) FROM readings"
    ).fetchone()[0]

    # BUG: uses < instead of <= which excludes the max station_id
    conn.execute(f"""
        CREATE OR REPLACE TABLE daily_summaries AS
        SELECT
            station_id,
            CAST(timestamp AS DATE) AS day,
            AVG(temperature_c) AS avg_temp,
            AVG(humidity_pct) AS avg_humidity,
            AVG(pressure_hpa) AS avg_pressure,
            COUNT(*) AS reading_count
        FROM readings
        WHERE station_id < '{max_station}'
        GROUP BY station_id, CAST(timestamp AS DATE)
    """)

    summary_count = conn.execute("SELECT COUNT(*) FROM daily_summaries").fetchone()[0]
    station_count = conn.execute("SELECT COUNT(DISTINCT station_id) FROM daily_summaries").fetchone()[0]

    print(f"  Aggregate: {summary_count} daily summaries for {station_count} stations")
    return summary_count, station_count
```

**Critical:** The bug must NOT be documented, commented, or hinted at anywhere in the project's `main` branch files. The `# BUG:` comment above is for the plan only — in the actual implementation, do not include any comment about the bug.

- [x] **Commit**

```bash
git add stages/aggregate.py
git commit -m "feat: implement aggregate stage"
```

---

### Task 6: Implement load stage [specialist: none]

**Routing:** assisted-agent (score: 16/20)
**Scores:** spec=5 pattern=1 blast=5 novelty=5
**Rationale:** Exact implementation code provided; no Python/DuckDB golden sample (pattern=1 override).

**Charter capability:** Pipeline Eval Project
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 3
**Files:**
- Create: `tests/evals/adev-pipeline-eval/stages/load.py`

**Tests:** `tests/evals/adev-pipeline-eval/tests/test_load.py` (created in Task 8)

- [x] **Implement load.py**

```python
import os

def run_load(conn):
    """Export daily_summaries to CSV and print summary."""

    output_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'output')
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, 'daily_report.csv')

    conn.execute(f"""
        COPY daily_summaries TO '{output_path}' (HEADER, DELIMITER ',')
    """)

    total_stations = conn.execute(
        "SELECT COUNT(DISTINCT station_id) FROM daily_summaries"
    ).fetchone()[0]
    total_days = conn.execute(
        "SELECT COUNT(DISTINCT day) FROM daily_summaries"
    ).fetchone()[0]
    total_readings = conn.execute(
        "SELECT SUM(reading_count) FROM daily_summaries"
    ).fetchone()[0]

    print(f"  Load: {total_stations} stations, {total_days} days, {total_readings} readings processed")
    return output_path
```

- [x] **Commit**

```bash
git add stages/load.py
git commit -m "feat: implement load stage"
```

---

### Task 7: Implement pipeline orchestrator [specialist: none]

**Routing:** assisted-agent (score: 16/20)
**Scores:** spec=5 pattern=1 blast=5 novelty=5
**Rationale:** Full orchestrator code given with error handling; no Python pipeline orchestrator sample (pattern=1 override).

**Charter capability:** Pipeline Eval Project
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 3, Task 4, Task 5, Task 6
**Files:**
- Create: `tests/evals/adev-pipeline-eval/run_pipeline.py`

**Tests:** End-to-end verification in Task 10.

- [x] **Implement run_pipeline.py**

```python
#!/usr/bin/env python3
"""Weather station data pipeline — ingest, clean, aggregate, load."""
import sys
import os
import duckdb

from stages.ingest import run_ingest
from stages.clean import run_clean
from stages.aggregate import run_aggregate
from stages.load import run_load

def main():
    db_path = os.path.join(os.path.dirname(__file__), 'data', 'pipeline.duckdb')

    try:
        conn = duckdb.connect(db_path)
    except duckdb.IOException:
        print("Error: Database locked", file=sys.stderr)
        sys.exit(1)

    try:
        print("Stage 1: Ingest")
        run_ingest(conn)

        print("Stage 2: Clean")
        run_clean(conn)

        print("Stage 3: Aggregate")
        run_aggregate(conn)

        print("Stage 4: Load")
        run_load(conn)

        print("\nPipeline complete.")
    except FileNotFoundError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        conn.close()

if __name__ == '__main__':
    main()
```

- [x] **Commit**

```bash
git add run_pipeline.py
git commit -m "feat: implement pipeline orchestrator"
```

---

### Task 8: Write unit tests [specialist: none]

**Routing:** assisted-agent (score: 13/20)
**Scores:** spec=4 pattern=1 blast=5 novelty=3
**Rationale:** Test expectations described but exact assertions not given; must carefully avoid testing the planted bug's filter query; no pytest golden sample (pattern=1 override).

**Charter capability:** Pipeline Eval Project
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 3, Task 4, Task 5, Task 6
**Files:**
- Create: `tests/evals/adev-pipeline-eval/tests/test_ingest.py`
- Create: `tests/evals/adev-pipeline-eval/tests/test_clean.py`
- Create: `tests/evals/adev-pipeline-eval/tests/test_load.py`

**Tests:** These ARE the test files.

- [x] **Write test_ingest.py**

Test that ingest reads CSV data into DuckDB tables correctly. Use a temporary DuckDB connection and small inline CSV fixtures (not the full seed data). Test:
- Stations table has expected columns
- Readings table has expected columns
- Row counts match input data

- [x] **Write test_clean.py**

Test clean transformations with controlled input data. Test:
- NULL temperature rows are removed
- Humidity values below 0 are clamped to 0
- Humidity values above 100 are clamped to 100
- Pressure anomalies are flagged correctly (outside [870, 1084])
- Non-anomalous pressure readings are not flagged

**Important:** Tests must use hardcoded station lists — they must NOT test the aggregate stage's station filter query. This ensures the planted bug is not detectable by unit tests.

- [x] **Write test_load.py**

Test that load exports a valid CSV file. Use a pre-populated DuckDB `daily_summaries` table. Test:
- Output CSV file is created
- CSV has expected headers
- Row count matches input table

- [x] **Verify all tests pass**

```bash
cd tests/evals/adev-pipeline-eval
pip install -r requirements.txt
python -m pytest tests/ -v
```

Expected: ALL PASS

- [x] **Commit**

```bash
git add tests/
git commit -m "test: add unit tests for ingest, clean, and load stages"
```

---

### Task 9: Write README with TODO features [specialist: none]

**Routing:** assisted-agent (score: 16/20)
**Scores:** spec=5 pattern=1 blast=5 novelty=5
**Rationale:** Exact section structure and feature list defined; must not mention planted bug; no Python README golden sample (pattern=1 override).

**Charter capability:** Pipeline Eval Project
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Create: `tests/evals/adev-pipeline-eval/README.md`

**Tests:** README structure verified manually against shared conventions in Task 10.

- [x] **Write README.md**

Follow the shared conventions template with exactly these sections in order:

1. **Project Title** — `adev-pipeline-eval`
2. **Overview** — Weather station data pipeline with DuckDB
3. **Quick Start** — `pip install -r requirements.txt && python run_pipeline.py`
4. **Architecture** — Four-stage pipeline diagram (ingest, clean, aggregate, load)
5. **TODO Features** — Exactly 5 features:
   1. Add wind speed metric (simple) — Exercises: specify, plan, implement
   2. Weekly rollup report (medium) — Exercises: brainstorm, specify, implement, validate
   3. Station metadata enrichment (simple) — Exercises: specify, implement
   4. Anomaly alert system (complex) — Exercises: brainstorm, specify, plan, implement, validate
   5. Pipeline idempotency (medium) — Exercises: specify, plan, implement, validate
6. **License** — MIT

**Critical:** The README must NOT mention, hint at, or document the planted bug. No "known issues" section. No comments about missing stations.

- [x] **Commit**

```bash
git add README.md
git commit -m "docs: add README with TODO features"
```

---

### Task 10: Verify end-to-end pipeline and planted bug [specialist: none]

**Routing:** assisted-agent (score: 15/20)
**Scores:** spec=5 pattern=1 blast=5 novelty=4
**Rationale:** Exact verification commands and assertions given; verification-only (no files modified); no verification sample (pattern=1 override).

**Charter capability:** Pipeline Eval Project
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 7, Task 8
**Files:**
- No files created or modified — verification only

**Tests:** End-to-end verification script (run inline, not persisted).

- [x] **Run end-to-end pipeline**

```bash
cd tests/evals/adev-pipeline-eval
pip install -r requirements.txt
python run_pipeline.py
```

Verify:
- Pipeline prints stage names and row counts
- `data/output/daily_report.csv` exists
- CSV has headers: `station_id,day,avg_temp,avg_humidity,avg_pressure,reading_count`
- `data/pipeline.duckdb` exists

- [x] **Verify planted bug**

```bash
cd tests/evals/adev-pipeline-eval
python -c "
import duckdb
conn = duckdb.connect('data/pipeline.duckdb')
input_stations = conn.execute('SELECT COUNT(DISTINCT station_id) FROM readings').fetchone()[0]
output_stations = conn.execute('SELECT COUNT(DISTINCT station_id) FROM daily_summaries').fetchone()[0]
print(f'Input stations: {input_stations}, Output stations: {output_stations}')
assert output_stations == input_stations - 1, f'Expected {input_stations - 1} output stations, got {output_stations}'
print('Planted bug confirmed: one station missing from output')
conn.close()
"
```

- [x] **Verify unit tests still pass**

```bash
python -m pytest tests/ -v
```

Expected: ALL PASS (bug is not detected by unit tests)

- [x] **Commit verified state**

```bash
git add -A
git commit -m "chore: verify end-to-end pipeline and planted bug"
```

---

### Task 11: Create with-context branch [specialist: none]

**Routing:** assisted-agent (score: 13/20)
**Scores:** spec=4 pattern=1 blast=5 novelty=3
**Rationale:** Branch structure defined but context-index content is sketched not exact; requires composing constitution/manifest/spec for a Python project; no sample (pattern=1 override).

**Charter capability:** Pipeline Eval Project
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 10
**Files:**
- Create: `tests/evals/adev-pipeline-eval/.context-index/constitution.md`
- Create: `tests/evals/adev-pipeline-eval/.context-index/manifest.yaml`
- Create: `tests/evals/adev-pipeline-eval/.context-index/platform-context.yaml`
- Create: `tests/evals/adev-pipeline-eval/.context-index/specs/features/pipeline/pipeline-data-processing.spec.md` (extracted spec)

**Tests:** Branch verification is manual — diff against main should show only `.context-index/` additions.

- [x] **Create with-context branch**

```bash
cd tests/evals/adev-pipeline-eval
git checkout -b with-context
```

- [x] **Populate .context-index/**

Create minimal but valid context:

**constitution.md** — Project identity, principles (minimize deps, use DuckDB, Python stdlib), coding standards (PEP 8, type hints optional), quality gates (`python -m pytest tests/`).

**manifest.yaml** — Project name, modules (stages, tests), gates (pytest), no specialists.

**platform-context.yaml** — Python 3.11+, DuckDB, pytest, pip.

**Extracted spec** — A spec for the existing pipeline data processing behavior (extracted from the working code, not describing TODO features). This gives eval runs a spec to work with.

- [x] **Verify with-context branch**

```bash
# Verify only .context-index/ differs from main
git diff main --name-only | grep -v "^\.context-index/" && echo "ERROR: non-context files differ" || echo "OK: only .context-index/ differs"

# Verify tests still pass
python -m pytest tests/ -v
```

- [x] **Commit and switch back**

```bash
git add .context-index/
git commit -m "feat: add .context-index/ for adev eval runs"
git checkout main
```

---

### Task 12: Register submodule and scaffold eval harness [specialist: none]

**Routing:** assisted-agent (score: 13/20)
**Scores:** spec=4 pattern=1 blast=4 novelty=4
**Rationale:** Commands given but touches repo-root .gitmodules; submodule URL may need adjustment; no submodule sample (pattern=1 override).

**Charter capability:** Pipeline Eval Project, Eval Harness Scaffolds
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 10
**Files:**
- Create: `tests/evals/data-pipeline/scenarios/.gitkeep`
- Create: `tests/evals/data-pipeline/rubrics/.gitkeep`
- Modify: `.gitmodules` (if exists) — add submodule entry

**Tests:** Submodule status check.

- [x] **Register as git submodule**

From the adev-plugin root:

```bash
git submodule add ./tests/evals/adev-pipeline-eval tests/evals/adev-pipeline-eval
```

Note: Since this is a local repo during development, the submodule URL will be updated to a remote URL when the repo is published. For now, register with a relative path.

- [x] **Scaffold eval harness directories**

```bash
mkdir -p tests/evals/data-pipeline/scenarios
mkdir -p tests/evals/data-pipeline/rubrics
touch tests/evals/data-pipeline/scenarios/.gitkeep
touch tests/evals/data-pipeline/rubrics/.gitkeep
```

- [x] **Verify submodule**

```bash
git submodule status | grep adev-pipeline-eval
```

- [x] **Commit**

```bash
git add .gitmodules tests/evals/
git commit -m "feat: register pipeline eval project and scaffold eval harness"
```

---

## Quality Gates

After all tasks are complete, run the full quality gate suite:

- [x] Tests pass: `npm test` (adev-plugin tests)
- [x] Pipeline tests pass: `cd tests/evals/adev-pipeline-eval && python -m pytest tests/ -v`
- [x] Pipeline runs: `cd tests/evals/adev-pipeline-eval && python run_pipeline.py`
- [x] Planted bug verified: output has 7 stations instead of 8
- [x] All acceptance criteria from spec satisfied
