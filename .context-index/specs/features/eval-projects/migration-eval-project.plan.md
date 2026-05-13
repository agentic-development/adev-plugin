<!-- DO NOT EDIT statuses inline — see lifecycle log migration-eval-project.jsonl -->
# Implementation Plan: Migration Eval Project

> **Methodology:** adev
> **Charter:** .context-index/specs/features/eval-projects/charter.md
> **Spec:** .context-index/specs/features/eval-projects/migration-eval-project.spec.md
> **Review:** PASS (2026-05-06)
> **Platform:** Python 3.11+, dbt-duckdb, DuckDB, PyYAML

**Goal:** Build a self-contained Python project with two parallel ETL pipelines (legacy Python+YAML and modern dbt+DuckDB) processing the same CSV data, where the legacy pipeline contains a planted bug that silently drops rows with NULL region values.

**Architecture:** The project is a standalone Git repository (`adev-migrations-eval`) with no external service dependencies — DuckDB and SQLite run in-process. Two independent pipeline implementations (legacy custom Python and dbt+DuckDB) read the same source CSVs and produce comparable output. A comparison tool reveals the discrepancy caused by the planted bug. The project is registered as a submodule in adev-plugin at `tests/evals/adev-migrations-eval/`.

---

## File Structure

**Create:**
- `tests/evals/adev-migrations-eval/` — project root (new Git repo, registered as submodule)
- `tests/evals/adev-migrations-eval/run_legacy.py` — Legacy pipeline orchestrator
- `tests/evals/adev-migrations-eval/compare_outputs.py` — Diff tool for legacy vs modern output
- `tests/evals/adev-migrations-eval/requirements.txt` — Python dependencies
- `tests/evals/adev-migrations-eval/README.md` — Project README following shared conventions
- `tests/evals/adev-migrations-eval/LICENSE` — MIT license
- `tests/evals/adev-migrations-eval/.gitignore` — Ignore data/output/, __pycache__, etc.
- `tests/evals/adev-migrations-eval/data/source/customers.csv` — 25 customers, 3 with NULL region
- `tests/evals/adev-migrations-eval/data/source/orders.csv` — ~80 orders
- `tests/evals/adev-migrations-eval/data/source/products.csv` — 15 products
- `tests/evals/adev-migrations-eval/legacy/config.yaml` — Source paths, column mappings, join keys
- `tests/evals/adev-migrations-eval/legacy/transforms.py` — Transform functions (contains planted bug)
- `tests/evals/adev-migrations-eval/legacy/loaders.py` — CSV reader/writer
- `tests/evals/adev-migrations-eval/legacy/pipeline.py` — Stage sequencing
- `tests/evals/adev-migrations-eval/legacy/__init__.py` — Package init
- `tests/evals/adev-migrations-eval/dbt_project/dbt_project.yml` — dbt project config
- `tests/evals/adev-migrations-eval/dbt_project/profiles.yml` — DuckDB connection config
- `tests/evals/adev-migrations-eval/dbt_project/models/staging/stg_customers.sql` — Staging model
- `tests/evals/adev-migrations-eval/dbt_project/models/staging/stg_orders.sql` — Staging model
- `tests/evals/adev-migrations-eval/dbt_project/models/staging/stg_products.sql` — Staging model
- `tests/evals/adev-migrations-eval/dbt_project/models/marts/order_summary.sql` — Mart model
- `tests/evals/adev-migrations-eval/dbt_project/seeds/` — Symlinks to data/source/ CSVs
- `tests/evals/adev-migrations-eval/tests/test_transforms.py` — Unit tests for transform functions
- `tests/evals/adev-migrations-eval/tests/test_loaders.py` — Unit tests for CSV loaders
- `tests/evals/adev-migrations-eval/tests/__init__.py` — Test package init
- `tests/evals/data-migration/scenarios/.gitkeep` — Eval harness scaffold
- `tests/evals/data-migration/rubrics/.gitkeep` — Eval harness scaffold

**Modify:**
- `.gitmodules` — Add submodule entry for `tests/evals/adev-migrations-eval`

**Reference (read, do not modify):**
- `.context-index/specs/features/eval-projects/charter.md` — Capability map and invariants
- `.context-index/specs/features/eval-projects/shared-conventions.spec.md` — Structural conventions for all eval projects

---

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/eval-projects/migration-eval-project.spec.md` (Project Structure, Preconditions)
- Charter: `.context-index/specs/features/eval-projects/charter.md` (capability: Migration Eval Project)
- Cross-cutting: `.context-index/specs/features/eval-projects/shared-conventions.spec.md` (Behavior 1: branch structure)

### Task 2 Context
- Spec: `.context-index/specs/features/eval-projects/migration-eval-project.spec.md` (Behaviors 1, 5; Planted Bug; Error Cases)
- Charter: `.context-index/specs/features/eval-projects/charter.md` (capability: Migration Eval Project)

### Task 3 Context
- Spec: `.context-index/specs/features/eval-projects/migration-eval-project.spec.md` (Behaviors 2, 3; Project Structure — dbt_project/)
- Charter: `.context-index/specs/features/eval-projects/charter.md` (capability: Migration Eval Project)

### Task 4 Context
- Spec: `.context-index/specs/features/eval-projects/migration-eval-project.spec.md` (Behaviors 4, 7; Planted Bug — symptom and discovery path)
- Charter: `.context-index/specs/features/eval-projects/charter.md` (capability: Migration Eval Project)

### Task 5 Context
- Spec: `.context-index/specs/features/eval-projects/migration-eval-project.spec.md` (Behavior 6; Planted Bug — "NOT detectable by unit tests")
- Charter: `.context-index/specs/features/eval-projects/charter.md` (capability: Migration Eval Project)

### Task 6 Context
- Spec: `.context-index/specs/features/eval-projects/migration-eval-project.spec.md` (Postconditions, Acceptance Criteria)
- Charter: `.context-index/specs/features/eval-projects/charter.md` (capability: Migration Eval Project)

### Task 7 Context
- Spec: `.context-index/specs/features/eval-projects/migration-eval-project.spec.md` (TODO Features, Acceptance Criteria — README)
- Cross-cutting: `.context-index/specs/features/eval-projects/shared-conventions.spec.md` (Behavior 7: README sections, Behavior 8: TODO features)

### Task 8 Context
- Spec: `.context-index/specs/features/eval-projects/migration-eval-project.spec.md` (Acceptance Criteria — submodule, eval harness)
- Cross-cutting: `.context-index/specs/features/eval-projects/shared-conventions.spec.md` (Behavior 9: submodule, Behavior 10: eval harness)

### Task 9 Context
- Spec: `.context-index/specs/features/eval-projects/migration-eval-project.spec.md` (Acceptance Criteria — with-context branch)
- Cross-cutting: `.context-index/specs/features/eval-projects/shared-conventions.spec.md` (Behavior 3: with-context branch, Behavior 4: diff against main)

---

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3 → Task 4 (data foundation → legacy pipeline → dbt pipeline → compare tool)
- Group B (sequential, depends on Task 2): Task 5 (unit tests depend on legacy pipeline code)
- Group C (sequential, depends on Tasks 4, 5): Task 6 (end-to-end verification)
- Group D (independent after Task 1): Task 7 (README)
- Group E (depends on Task 6): Task 8 → Task 9 (submodule registration, eval harness, with-context branch)

Groups A and D can partially overlap. Group B depends on Group A Task 2 completion.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Create repo and seed data | small | unit | — | 5 create |
| 2 | Implement legacy pipeline | medium | unit | Task 1 | 6 create |
| 3 | Implement dbt project | medium | unit | Task 1 | 7 create |
| 4 | Implement compare tool | small | unit | Task 2, Task 3 | 1 create |
| 5 | Write unit tests | medium | unit | Task 2 | 3 create |
| 6 | Verify end-to-end and planted bug | medium | unit | Task 4, Task 5 | 0 create |
| 7 | Write README and LICENSE | small | unit | Task 1 | 2 create |
| 8 | Register submodule and eval harness scaffold | small | unit | Task 6 | 3 create, 1 modify |
| 9 | Create with-context branch | medium | unit | Task 8 | 4 create |

---

### Task 1: Create repo and seed data [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=5 pattern=2 blast=5 novelty=5
**Rationale:** Fully specified seed data with exact row counts and NULL constraints; mechanical file creation with no architectural decisions.

**Charter capability:** Migration Eval Project
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `tests/evals/adev-migrations-eval/data/source/customers.csv`
- Create: `tests/evals/adev-migrations-eval/data/source/orders.csv`
- Create: `tests/evals/adev-migrations-eval/data/source/products.csv`
- Create: `tests/evals/adev-migrations-eval/requirements.txt`
- Create: `tests/evals/adev-migrations-eval/.gitignore`

**Tests:** `tests/evals/adev-migrations-eval/tests/test_loaders.py` — created in Task 5; this task creates the data that tests will verify.

- [x] **Write failing test**

Create a minimal test that verifies the source data files exist and have the expected row counts:

```python
# tests/evals/adev-migrations-eval/tests/test_data.py (temporary verification)
import csv
import os

def test_customers_csv_exists():
    path = os.path.join(os.path.dirname(__file__), '..', 'data', 'source', 'customers.csv')
    assert os.path.exists(path)
    with open(path) as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    assert len(rows) == 25
    # Verify 3 customers have NULL region
    null_regions = [r for r in rows if r.get('region', '').strip() == '' or r.get('region') is None]
    assert len(null_regions) == 3
```

- [x] **Verify test fails**

Run: `cd tests/evals/adev-migrations-eval && python -m pytest tests/test_data.py -v`
Expected: FAIL — file not found or directory does not exist

- [x] **Implement**

1. Initialize the repo directory structure at `tests/evals/adev-migrations-eval/`.
2. Create `data/source/customers.csv` with 25 customers. Columns: `customer_id`, `customer_name`, `email`, `region`, `created_at`. Three customers (IDs 8, 15, 22) have empty/NULL `region` values.
3. Create `data/source/orders.csv` with ~80 orders. Columns: `order_id`, `customer_id`, `product_id`, `quantity`, `order_date`, `total_amount`. Distribute orders across all 25 customers including the 3 with NULL region.
4. Create `data/source/products.csv` with 15 products. Columns: `product_id`, `product_name`, `category`, `price`.
5. Create `requirements.txt`: `duckdb`, `dbt-duckdb`, `pyyaml`, `pytest`.
6. Create `.gitignore`: `data/output/`, `__pycache__/`, `*.pyc`, `.pytest_cache/`, `dbt_project/target/`, `dbt_project/logs/`, `dbt_project/dbt_packages/`.

- [x] **Verify test passes**

Run: `cd tests/evals/adev-migrations-eval && python -m pytest tests/test_data.py -v`
Expected: PASS

- [x] **Commit**

Branch: `feat/eval-projects/migration-eval-project`

```bash
git add tests/evals/adev-migrations-eval/data/source/ tests/evals/adev-migrations-eval/requirements.txt tests/evals/adev-migrations-eval/.gitignore tests/evals/adev-migrations-eval/tests/
git commit -m "feat(eval-projects): create migration eval project repo with seed data

Spec: .context-index/specs/features/eval-projects/migration-eval-project.spec.md
Plan-task: 1"
```

---

### Task 2: Implement legacy pipeline [specialist: none]

**Routing:** auto-agent (score: 16/20)
**Scores:** spec=5 pattern=2 blast=5 novelty=4
**Rationale:** Planted bug behavior is precisely specified with exact root cause location; standard Python CSV processing with config-driven pipeline.

**Charter capability:** Migration Eval Project
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Create: `tests/evals/adev-migrations-eval/legacy/__init__.py`
- Create: `tests/evals/adev-migrations-eval/legacy/config.yaml`
- Create: `tests/evals/adev-migrations-eval/legacy/loaders.py`
- Create: `tests/evals/adev-migrations-eval/legacy/transforms.py`
- Create: `tests/evals/adev-migrations-eval/legacy/pipeline.py`
- Create: `tests/evals/adev-migrations-eval/run_legacy.py`

**Tests:** `tests/evals/adev-migrations-eval/tests/test_transforms.py` — created in Task 5

- [x] **Write failing test**

Create a test that verifies the legacy pipeline runs and produces output:

```python
# tests/evals/adev-migrations-eval/tests/test_pipeline_smoke.py
import subprocess
import os

def test_legacy_pipeline_produces_output():
    project_root = os.path.join(os.path.dirname(__file__), '..')
    result = subprocess.run(['python', 'run_legacy.py'], cwd=project_root, capture_output=True, text=True)
    assert result.returncode == 0, f"Legacy pipeline failed: {result.stderr}"
    output_dir = os.path.join(project_root, 'data', 'output', 'legacy')
    assert os.path.exists(os.path.join(output_dir, 'order_summary.csv'))
```

- [x] **Verify test fails**

Run: `cd tests/evals/adev-migrations-eval && python -m pytest tests/test_pipeline_smoke.py -v`
Expected: FAIL — `run_legacy.py` not found or import error

- [x] **Implement**

1. Create `legacy/__init__.py` (empty package init).
2. Create `legacy/config.yaml`:
   ```yaml
   sources:
     customers: data/source/customers.csv
     orders: data/source/orders.csv
     products: data/source/products.csv
   output:
     path: data/output/legacy
   joins:
     orders_customers:
       left: orders
       right: customers
       key: customer_id
   columns:
     order_summary:
       - customer_id
       - customer_name
       - total_orders
       - total_revenue
       - avg_order_value
   ```
3. Create `legacy/loaders.py` with functions:
   - `load_csv(path)` → returns list of dicts
   - `write_csv(data, path, columns)` → writes list of dicts to CSV
   - Error handling: raise with "Source file not found: <path>" on missing file
4. Create `legacy/transforms.py` with functions:
   - `merge_tables(left, right, key)` — **PLANTED BUG**: calls equivalent of `dropna()` on the entire left dataframe before joining, dropping rows where ANY column is NULL (including `region`), instead of only checking the join key column. Uses INNER JOIN semantics.
   - `aggregate_orders(joined_data)` — groups by customer, computes total_orders, total_revenue, avg_order_value
5. Create `legacy/pipeline.py` with `run_pipeline(config_path)` that orchestrates: load config → load CSVs → merge → aggregate → write output.
6. Create `run_legacy.py` as the entry point: parses `legacy/config.yaml` and calls `run_pipeline()`. Handles "Config parse error" on malformed YAML.

- [x] **Verify test passes**

Run: `cd tests/evals/adev-migrations-eval && python -m pytest tests/test_pipeline_smoke.py -v`
Expected: PASS — output file created (with 22 rows, missing 3 NULL-region customers)

- [x] **Commit**

```bash
git add tests/evals/adev-migrations-eval/legacy/ tests/evals/adev-migrations-eval/run_legacy.py
git commit -m "feat(eval-projects): implement legacy pipeline with planted NULL-region bug

Spec: .context-index/specs/features/eval-projects/migration-eval-project.spec.md
Plan-task: 2"
```

---

### Task 3: Implement dbt project [specialist: none]

**Routing:** assisted-agent (score: 13/20)
**Scores:** spec=4 pattern=1 blast=5 novelty=3
**Rationale:** No dbt/DuckDB sample or precedent in codebase (pattern=1 override); dbt configuration, DuckDB adapter, and CSV export require domain-specific knowledge not present in golden samples.

**Charter capability:** Migration Eval Project
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Create: `tests/evals/adev-migrations-eval/dbt_project/dbt_project.yml`
- Create: `tests/evals/adev-migrations-eval/dbt_project/profiles.yml`
- Create: `tests/evals/adev-migrations-eval/dbt_project/models/staging/stg_customers.sql`
- Create: `tests/evals/adev-migrations-eval/dbt_project/models/staging/stg_orders.sql`
- Create: `tests/evals/adev-migrations-eval/dbt_project/models/staging/stg_products.sql`
- Create: `tests/evals/adev-migrations-eval/dbt_project/models/marts/order_summary.sql`
- Create: `tests/evals/adev-migrations-eval/dbt_project/seeds/` (symlinks or seed files)

**Tests:** `tests/evals/adev-migrations-eval/tests/test_pipeline_smoke.py` — extended to cover dbt

- [x] **Write failing test**

Extend the smoke test to verify dbt pipeline runs:

```python
# Add to tests/test_pipeline_smoke.py
def test_dbt_pipeline_produces_output():
    project_root = os.path.join(os.path.dirname(__file__), '..')
    dbt_project = os.path.join(project_root, 'dbt_project')
    result = subprocess.run(['dbt', 'run', '--project-dir', dbt_project, '--profiles-dir', dbt_project],
                          capture_output=True, text=True, cwd=project_root)
    assert result.returncode == 0, f"dbt run failed: {result.stderr}"
    output_path = os.path.join(project_root, 'data', 'output', 'modern', 'order_summary.csv')
    assert os.path.exists(output_path)
```

- [x] **Verify test fails**

Run: `cd tests/evals/adev-migrations-eval && python -m pytest tests/test_pipeline_smoke.py::test_dbt_pipeline_produces_output -v`
Expected: FAIL — dbt_project.yml not found or dbt not installed

- [x] **Implement**

1. Create `dbt_project/dbt_project.yml` with project name `adev_migrations_eval`, profile reference, and model paths.
2. Create `dbt_project/profiles.yml` configuring DuckDB as the adapter with an in-memory or file-based database. Output to `data/output/modern/`.
3. Create staging models:
   - `stg_customers.sql` — reads from `data/source/customers.csv` via DuckDB's `read_csv_auto()` or dbt seeds
   - `stg_orders.sql` — reads from `data/source/orders.csv`
   - `stg_products.sql` — reads from `data/source/products.csv`
4. Create `models/marts/order_summary.sql` — joins customers and orders using a LEFT JOIN (preserving NULL region customers), groups by customer, computes total_orders, total_revenue, avg_order_value. Outputs same columns as legacy pipeline.
5. Configure dbt to export the final mart as CSV to `data/output/modern/order_summary.csv` (use dbt's `on-run-end` hook or a post-hook to export, or use a custom materialization that writes CSV).
6. Create seed files or symlinks in `dbt_project/seeds/` pointing to `data/source/` CSVs.

- [x] **Verify test passes**

Run: `cd tests/evals/adev-migrations-eval && pip install -r requirements.txt && python -m pytest tests/test_pipeline_smoke.py::test_dbt_pipeline_produces_output -v`
Expected: PASS — output file created with 25 rows (all customers, including 3 with NULL region)

- [x] **Commit**

```bash
git add tests/evals/adev-migrations-eval/dbt_project/
git commit -m "feat(eval-projects): implement dbt+DuckDB pipeline with correct LEFT JOIN

Spec: .context-index/specs/features/eval-projects/migration-eval-project.spec.md
Plan-task: 3"
```

---

### Task 4: Implement compare tool [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=5 pattern=2 blast=5 novelty=5
**Rationale:** Compare tool behavior is fully specified (row count diff, missing IDs, exit codes); single-file mechanical CSV comparison.

**Charter capability:** Migration Eval Project
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2, Task 3
**Files:**
- Create: `tests/evals/adev-migrations-eval/compare_outputs.py`

**Tests:** `tests/evals/adev-migrations-eval/tests/test_pipeline_smoke.py` — extended to cover comparison

- [x] **Write failing test**

```python
# Add to tests/test_pipeline_smoke.py
def test_compare_outputs_runs():
    project_root = os.path.join(os.path.dirname(__file__), '..')
    result = subprocess.run(['python', 'compare_outputs.py'], cwd=project_root, capture_output=True, text=True)
    assert result.returncode == 0, f"Compare tool failed: {result.stderr}"
    # Should report row count difference
    assert 'row' in result.stdout.lower() or 'difference' in result.stdout.lower()
```

- [x] **Verify test fails**

Run: `cd tests/evals/adev-migrations-eval && python -m pytest tests/test_pipeline_smoke.py::test_compare_outputs_runs -v`
Expected: FAIL — `compare_outputs.py` not found

- [x] **Implement**

Create `compare_outputs.py` that:
1. Reads `data/output/legacy/order_summary.csv` and `data/output/modern/order_summary.csv`.
2. Compares row counts between legacy and modern output.
3. Identifies missing customer IDs (present in modern but absent in legacy).
4. Prints a diff summary showing: row count per file, row count difference, list of missing customer IDs, and a note about the discrepancy.
5. Exits with code 0 (comparison tool, not assertion tool — it reports, does not fail).
6. Error handling: if either output file is missing, print "Output file not found: <path>" and exit with code 1.

- [x] **Verify test passes**

Run: `cd tests/evals/adev-migrations-eval && python run_legacy.py && dbt run --project-dir dbt_project --profiles-dir dbt_project && python -m pytest tests/test_pipeline_smoke.py::test_compare_outputs_runs -v`
Expected: PASS

- [x] **Commit**

```bash
git add tests/evals/adev-migrations-eval/compare_outputs.py
git commit -m "feat(eval-projects): implement compare tool for legacy vs modern output diff

Spec: .context-index/specs/features/eval-projects/migration-eval-project.spec.md
Plan-task: 4"
```

---

### Task 5: Write unit tests [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=5 pattern=3 blast=5 novelty=4
**Rationale:** Test expectations are explicit (no NULL data constraint clearly stated); existing test helper samples provide general patterns; single-module scope.

**Charter capability:** Migration Eval Project
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2
**Files:**
- Create: `tests/evals/adev-migrations-eval/tests/__init__.py`
- Create: `tests/evals/adev-migrations-eval/tests/test_transforms.py`
- Create: `tests/evals/adev-migrations-eval/tests/test_loaders.py`

**Tests:** `tests/evals/adev-migrations-eval/tests/test_transforms.py`, `tests/evals/adev-migrations-eval/tests/test_loaders.py`

- [x] **Write failing test**

Create the test files with test cases that exercise the transform and loader functions:

**test_transforms.py:**
- `test_merge_tables_joins_on_key` — merges two tables on a shared key, verifies all rows present. Uses test data with NO NULL values in any column (critical: the planted bug is not detectable by unit tests).
- `test_merge_tables_no_matching_keys` — verifies empty result when no keys match.
- `test_aggregate_orders_computes_totals` — verifies correct total_orders, total_revenue, avg_order_value.
- `test_aggregate_orders_single_customer` — edge case with one customer.

**test_loaders.py:**
- `test_load_csv_reads_file` — loads a known CSV, verifies row count and column names.
- `test_load_csv_missing_file_raises` — verifies "Source file not found" error.
- `test_write_csv_creates_file` — writes data, reads it back, verifies match.

**CRITICAL CONSTRAINT:** All test fixtures must use data where no column has NULL/empty values. This ensures the planted bug (`dropna()` before join) does not trigger during tests, making tests pass despite the bug.

- [x] **Verify test fails**

Run: `cd tests/evals/adev-migrations-eval && python -m pytest tests/test_transforms.py tests/test_loaders.py -v`
Expected: FAIL — import errors if Task 2 code has issues, or tests verify correct behavior

- [x] **Implement**

Write the test implementations as described above. Each test uses inline fixture data (not the source CSVs) with complete, non-NULL values in every field.

- [x] **Verify test passes**

Run: `cd tests/evals/adev-migrations-eval && python -m pytest tests/ -v`
Expected: PASS — all unit tests pass, including merge_tables tests (because test data has no NULLs)

- [x] **Commit**

```bash
git add tests/evals/adev-migrations-eval/tests/
git commit -m "feat(eval-projects): add unit tests for transforms and loaders (no NULL test data)

Spec: .context-index/specs/features/eval-projects/migration-eval-project.spec.md
Plan-task: 5"
```

---

### Task 6: Verify end-to-end and planted bug [specialist: none]

**Routing:** auto-agent (score: 16/20)
**Scores:** spec=5 pattern=2 blast=5 novelty=4
**Rationale:** Verification criteria are exact (25 vs 22 rows, 3 missing customers); no new files created, just running and asserting against prior work.

**Charter capability:** Migration Eval Project
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 4, Task 5
**Files:**
- No new files created — this is a verification task

**Tests:** `tests/evals/adev-migrations-eval/tests/test_pipeline_smoke.py`

- [x] **Write failing test**

Add comprehensive end-to-end verification tests:

```python
# Add to tests/test_pipeline_smoke.py
def test_planted_bug_legacy_drops_null_region_customers():
    """Verify the planted bug: legacy output has fewer rows than modern."""
    project_root = os.path.join(os.path.dirname(__file__), '..')
    # Run both pipelines
    subprocess.run(['python', 'run_legacy.py'], cwd=project_root, check=True)
    subprocess.run(['dbt', 'run', '--project-dir', 'dbt_project', '--profiles-dir', 'dbt_project'],
                  cwd=project_root, check=True)
    
    import csv
    legacy_path = os.path.join(project_root, 'data', 'output', 'legacy', 'order_summary.csv')
    modern_path = os.path.join(project_root, 'data', 'output', 'modern', 'order_summary.csv')
    
    with open(legacy_path) as f:
        legacy_rows = list(csv.DictReader(f))
    with open(modern_path) as f:
        modern_rows = list(csv.DictReader(f))
    
    # Modern has all 25 customers, legacy has 22 (3 dropped due to NULL region)
    assert len(modern_rows) == 25
    assert len(legacy_rows) == 22
    assert len(modern_rows) - len(legacy_rows) == 3

def test_unit_tests_pass_despite_planted_bug():
    """Verify that unit tests pass even though the planted bug exists."""
    project_root = os.path.join(os.path.dirname(__file__), '..')
    result = subprocess.run(['python', '-m', 'pytest', 'tests/test_transforms.py', 'tests/test_loaders.py', '-v'],
                          cwd=project_root, capture_output=True, text=True)
    assert result.returncode == 0, f"Unit tests should pass despite bug: {result.stdout}"
```

- [x] **Verify test fails**

Run: `cd tests/evals/adev-migrations-eval && python -m pytest tests/test_pipeline_smoke.py -v -k "planted_bug or unit_tests_pass"`
Expected: FAIL — if pipelines not yet run or output counts differ from expected

- [x] **Implement**

No code changes — this task verifies that everything built in Tasks 1-5 works together correctly. If any assertion fails, fix the upstream task (adjust seed data counts, fix pipeline logic, etc.) until all verification tests pass.

- [x] **Verify test passes**

Run: `cd tests/evals/adev-migrations-eval && pip install -r requirements.txt && python run_legacy.py && dbt run --project-dir dbt_project --profiles-dir dbt_project && python -m pytest tests/ -v`
Expected: PASS — all tests pass including end-to-end verification

- [x] **Commit**

```bash
git add tests/evals/adev-migrations-eval/tests/
git commit -m "feat(eval-projects): verify end-to-end pipelines and planted bug behavior

Spec: .context-index/specs/features/eval-projects/migration-eval-project.spec.md
Plan-task: 6"
```

---

### Task 7: Write README and LICENSE [specialist: none]

**Routing:** auto-agent (score: 16/20)
**Scores:** spec=4 pattern=2 blast=5 novelty=5
**Rationale:** README sections and TODO features are enumerated in spec and shared conventions; mechanical template application with 2 files.

**Charter capability:** Migration Eval Project
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Create: `tests/evals/adev-migrations-eval/README.md`
- Create: `tests/evals/adev-migrations-eval/LICENSE`

**Tests:** `tests/evals/adev-migrations-eval/tests/test_pipeline_smoke.py` — verify README structure

- [x] **Write failing test**

```python
# Add to tests/test_pipeline_smoke.py
def test_readme_follows_shared_conventions():
    """Verify README has exactly 6 sections in the required order."""
    project_root = os.path.join(os.path.dirname(__file__), '..')
    readme_path = os.path.join(project_root, 'README.md')
    assert os.path.exists(readme_path)
    with open(readme_path) as f:
        content = f.read()
    # Must have these 6 sections in order
    sections = ['# ', '## Overview', '## Quick Start', '## Architecture', '## TODO Features', '## License']
    for section in sections:
        assert section in content, f"Missing section: {section}"
```

- [x] **Verify test fails**

Run: `cd tests/evals/adev-migrations-eval && python -m pytest tests/test_pipeline_smoke.py::test_readme_follows_shared_conventions -v`
Expected: FAIL — README.md not found

- [x] **Implement**

1. Create `README.md` following shared conventions (6 sections in order):
   - **Project Title:** `# adev-migrations-eval`
   - **Overview:** Brief description of the dual-pipeline data migration project
   - **Quick Start:** `pip install -r requirements.txt`, `python run_legacy.py`, `dbt run --project-dir dbt_project --profiles-dir dbt_project`, `python compare_outputs.py`
   - **Architecture:** Description of legacy vs modern pipeline, data flow diagram
   - **TODO Features:** 5 features as specified in the spec:
     1. Add product category dimension (simple) — Exercises: specify, implement
     2. Data validation layer (medium) — Exercises: brainstorm, specify, implement, validate
     3. Incremental loading (complex) — Exercises: brainstorm, specify, plan, implement, validate
     4. Legacy pipeline deprecation report (medium) — Exercises: specify, plan, implement
     5. Output reconciliation dashboard (medium) — Exercises: brainstorm, specify, implement
   - **License:** MIT
2. Create `LICENSE` with MIT license text.

- [x] **Verify test passes**

Run: `cd tests/evals/adev-migrations-eval && python -m pytest tests/test_pipeline_smoke.py::test_readme_follows_shared_conventions -v`
Expected: PASS

- [x] **Commit**

```bash
git add tests/evals/adev-migrations-eval/README.md tests/evals/adev-migrations-eval/LICENSE
git commit -m "feat(eval-projects): add README and LICENSE following shared conventions

Spec: .context-index/specs/features/eval-projects/migration-eval-project.spec.md
Plan-task: 7"
```

---

### Task 8: Register submodule and eval harness scaffold [specialist: none]

**Routing:** assisted-agent (score: 13/20)
**Scores:** spec=4 pattern=2 blast=4 novelty=3
**Rationale:** Git submodule registration with a local repo requires careful setup; touches .gitmodules at repo root (cross-module boundary); no submodule registration sample exists.

**Charter capability:** Migration Eval Project, Eval Harness Scaffolds
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 6
**Files:**
- Create: `tests/evals/data-migration/scenarios/.gitkeep`
- Create: `tests/evals/data-migration/rubrics/.gitkeep`
- Modify: `.gitmodules` (add submodule entry)

**Tests:** Verification via git commands

- [x] **Write failing test**

```bash
# Verify submodule registration
git submodule status tests/evals/adev-migrations-eval
# Should show the submodule; currently fails because not registered
```

- [x] **Verify test fails**

Run: `git submodule status tests/evals/adev-migrations-eval`
Expected: FAIL — submodule not registered

- [x] **Implement**

1. Initialize `tests/evals/adev-migrations-eval/` as a Git repo (if not already) and create an initial commit.
2. Register it as a submodule: `git submodule add <path-or-url> tests/evals/adev-migrations-eval`.
   - Note: if this is a local-only project for now, register with relative path or create a bare repo. The exact approach depends on whether a remote exists.
3. Create eval harness scaffold:
   - `tests/evals/data-migration/scenarios/.gitkeep`
   - `tests/evals/data-migration/rubrics/.gitkeep`

- [x] **Verify test passes**

Run: `git submodule status tests/evals/adev-migrations-eval` and `ls tests/evals/data-migration/scenarios/.gitkeep tests/evals/data-migration/rubrics/.gitkeep`
Expected: PASS — submodule registered, scaffold directories exist

- [x] **Commit**

```bash
git add .gitmodules tests/evals/adev-migrations-eval tests/evals/data-migration/
git commit -m "feat(eval-projects): register migration eval as submodule and scaffold eval harness

Spec: .context-index/specs/features/eval-projects/migration-eval-project.spec.md
Plan-task: 8"
```

---

### Task 9: Create with-context branch [specialist: none]

**Routing:** assisted-agent (score: 14/20)
**Scores:** spec=4 pattern=2 blast=5 novelty=3
**Rationale:** Creating a mock .context-index/ inside a sub-repo requires composing manifest, constitution, and spec from scratch; no sample for this pattern; branch management adds complexity.

**Charter capability:** Migration Eval Project, With-Context Branches
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 8
**Files:**
- Create: `tests/evals/adev-migrations-eval/.context-index/constitution.md`
- Create: `tests/evals/adev-migrations-eval/.context-index/manifest.yaml`
- Create: `tests/evals/adev-migrations-eval/.context-index/platform-context.yaml`
- Create: `tests/evals/adev-migrations-eval/.context-index/specs/features/migration/data-migration.spec.md`

**Tests:** Verification via git commands and file inspection

- [x] **Write failing test**

```bash
# Inside adev-migrations-eval repo:
git branch --list with-context
# Should show with-context branch; currently fails because it does not exist
```

- [x] **Verify test fails**

Run: `cd tests/evals/adev-migrations-eval && git branch --list with-context`
Expected: FAIL — branch does not exist

- [x] **Implement**

1. Inside the `adev-migrations-eval` repo, ensure all work from Tasks 1-8 is committed on `main`.
2. Create a new branch: `git checkout -b with-context`.
3. Create `.context-index/` directory with:
   - `constitution.md` — project-specific constitution for the migration eval project (Python conventions, data pipeline principles)
   - `manifest.yaml` — project metadata, module definitions (legacy, dbt_project), quality gates (`python -m pytest tests/`)
   - `platform-context.yaml` — Python 3.11+, dbt-duckdb, DuckDB, PyYAML
   - `specs/features/migration/data-migration.spec.md` — an extracted spec covering one of the TODO features (e.g., "Add product category dimension") to give users a starting point for the adev lifecycle
4. Verify: `git diff main..with-context` shows ONLY additions inside `.context-index/`. No source code changes.
5. Commit on the `with-context` branch.
6. Switch back to `main`: `git checkout main`.

- [x] **Verify test passes**

Run: `cd tests/evals/adev-migrations-eval && git branch --list with-context`
Expected: PASS — branch exists

Additional verification:
- `git diff main..with-context --name-only` shows only `.context-index/` files
- `git checkout with-context && python -m pytest tests/ && git checkout main` — tests still pass on with-context

- [x] **Commit**

```bash
# Commit happens on the with-context branch inside adev-migrations-eval
# Then update the submodule reference in adev-plugin
git add tests/evals/adev-migrations-eval
git commit -m "feat(eval-projects): create with-context branch for migration eval project

Spec: .context-index/specs/features/eval-projects/migration-eval-project.spec.md
Plan-task: 9"
```

---

## Quality Gates

After all tasks are complete, run the full quality gate suite:

- [x] Tests pass: `npm test` (adev-plugin's own test suite — ensure no regressions)
- [x] All acceptance criteria from spec satisfied:
  - [x] Repo exists as `adev-migrations-eval` with `main` and `with-context` branches
  - [x] `python run_legacy.py` completes and writes to `data/output/legacy/`
  - [x] `dbt run --project-dir dbt_project` completes and writes to `data/output/modern/`
  - [x] `python compare_outputs.py` reveals the row count discrepancy
  - [x] Planted bug is present: legacy drops 3 customers with NULL region
  - [x] All unit tests pass (`python -m pytest tests/`)
  - [x] Planted bug is NOT detectable by unit tests
  - [x] `with-context` branch has valid `.context-index/` with extracted spec
  - [x] README follows shared conventions (6 sections in order, 5 TODO features)
  - [x] Registered as submodule at `tests/evals/adev-migrations-eval/`
  - [x] Eval harness scaffold exists at `tests/evals/data-migration/scenarios/` and `rubrics/`
  - [x] All quality gates pass
  - [x] No constitutional violations introduced
