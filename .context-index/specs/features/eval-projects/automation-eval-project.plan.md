<!-- DO NOT EDIT statuses inline — see lifecycle log automation-eval-project.jsonl -->
# Implementation Plan: Automation Eval Project

> **Methodology:** adev
> **Charter:** .context-index/specs/features/eval-projects/charter.md
> **Spec:** .context-index/specs/features/eval-projects/automation-eval-project.spec.md
> **Review:** PASS (2026-05-06)
> **Platform:** Python 3.11+, stdlib only, no external dependencies

**Goal:** Create a self-contained Python CSV processing pipeline (`adev-automation-eval`) with inbox watching, validation, transformation, reporting (with planted bug), and archiving — as an eval target and onboarding demo for the adev framework.

**Architecture:** The project is a standalone Python repo registered as a git submodule in adev-plugin. It follows a modular pipeline pattern: `run_processor.py` orchestrates four stages (`validator.py`, `transformer.py`, `reporter.py`, `archiver.py`) each in the `processor/` package. Seed CSV data lives in `inbox/`. The planted bug is in the reporter's totals computation (double-counting multi-category rows). The repo follows shared-conventions from the charter: three branches (`main`, `with-context`, `plain-claude`), README with fixed section order, and 5 TODO features.

---

## File Structure

**Create:**
- `tests/evals/adev-automation-eval/run_processor.py` — Entry point, scans inbox and orchestrates stages
- `tests/evals/adev-automation-eval/processor/__init__.py` — Package init
- `tests/evals/adev-automation-eval/processor/validator.py` — CSV structure and schema validation
- `tests/evals/adev-automation-eval/processor/transformer.py` — Date normalization, currency parsing, categorization
- `tests/evals/adev-automation-eval/processor/reporter.py` — Markdown report generation (contains planted bug)
- `tests/evals/adev-automation-eval/processor/archiver.py` — File move with timestamp prefix
- `tests/evals/adev-automation-eval/inbox/expenses_q1.csv` — 35-row expense report seed data
- `tests/evals/adev-automation-eval/inbox/timesheets_march.csv` — 28-row timesheet seed data
- `tests/evals/adev-automation-eval/inbox/expenses_q2.csv` — 42-row expense report seed data
- `tests/evals/adev-automation-eval/tests/__init__.py` — Tests package init
- `tests/evals/adev-automation-eval/tests/test_validator.py` — Validation unit tests
- `tests/evals/adev-automation-eval/tests/test_transformer.py` — Transformer unit tests
- `tests/evals/adev-automation-eval/tests/test_archiver.py` — Archiver unit tests
- `tests/evals/adev-automation-eval/README.md` — Project README (6 sections, 5 TODO features)
- `tests/evals/adev-automation-eval/LICENSE` — MIT license
- `tests/evals/adev-automation-eval/.gitignore` — Ignore reports/, archive/, errors/, __pycache__
- `tests/evals/process-automation/scenarios/.gitkeep` — Eval harness scaffold
- `tests/evals/process-automation/rubrics/.gitkeep` — Eval harness scaffold

**Reference (read, do not modify):**
- `.context-index/specs/features/eval-projects/shared-conventions.spec.md` — Structural conventions all eval projects must follow
- `.context-index/specs/features/eval-projects/charter.md` — Capability map and domain model
- `tests/evals/adev-data-eval/` — Existing eval project for reference patterns

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/eval-projects/automation-eval-project.spec.md` (Project Structure section)
- Charter: `.context-index/specs/features/eval-projects/charter.md` (capability: Automation Eval Project)
- Shared conventions: `.context-index/specs/features/eval-projects/shared-conventions.spec.md` (Behaviors 7-8 — README template, TODO features format)

### Task 2 Context
- Spec: `.context-index/specs/features/eval-projects/automation-eval-project.spec.md` (Behaviors 1-3 — inbox scanning, validation rules, file type schemas)
- Charter: `.context-index/specs/features/eval-projects/charter.md` (Domain Model — Eval Project entity)

### Task 3 Context
- Spec: `.context-index/specs/features/eval-projects/automation-eval-project.spec.md` (Behavior 2 — validation rules per file type)
- Shared conventions: `.context-index/specs/features/eval-projects/shared-conventions.spec.md` (Error Cases — BUG_TOO_VISIBLE invariant)

### Task 4 Context
- Spec: `.context-index/specs/features/eval-projects/automation-eval-project.spec.md` (Behavior 3 — transformation rules: date normalization, currency parsing, categorization)

### Task 5 Context
- Spec: `.context-index/specs/features/eval-projects/automation-eval-project.spec.md` (Behaviors 4-5 — report generation, planted bug double-counting)
- Spec: `.context-index/specs/features/eval-projects/automation-eval-project.spec.md` (Planted Bug section — root cause description)

### Task 6 Context
- Spec: `.context-index/specs/features/eval-projects/automation-eval-project.spec.md` (Behavior 6 — archive with timestamp prefix)

### Task 7 Context
- Spec: `.context-index/specs/features/eval-projects/automation-eval-project.spec.md` (Behaviors 1, 7 — orchestrator, empty inbox handling)
- Spec: `.context-index/specs/features/eval-projects/automation-eval-project.spec.md` (Error Cases — all error conditions)

### Task 8 Context
- Spec: `.context-index/specs/features/eval-projects/automation-eval-project.spec.md` (Behavior 8 — unit tests pass, tests do NOT test report totals with multi-category rows)
- Spec: `.context-index/specs/features/eval-projects/automation-eval-project.spec.md` (Planted Bug section — tests must not catch it)

### Task 9 Context
- Spec: `.context-index/specs/features/eval-projects/automation-eval-project.spec.md` (Acceptance Criteria — end-to-end verification, planted bug confirmation)

### Task 10 Context
- Spec: `.context-index/specs/features/eval-projects/automation-eval-project.spec.md` (Acceptance Criteria — with-context branch)
- Shared conventions: `.context-index/specs/features/eval-projects/shared-conventions.spec.md` (Behaviors 3-4 — with-context branch invariants)

### Task 11 Context
- Spec: `.context-index/specs/features/eval-projects/automation-eval-project.spec.md` (Acceptance Criteria — README, submodule registration, eval harness)
- Shared conventions: `.context-index/specs/features/eval-projects/shared-conventions.spec.md` (Behaviors 7-10 — README, submodule, eval harness)

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7 (repo init, seed data, then pipeline stages in order)
- Group B (sequential, after Group A): Task 8 (unit tests — depends on all pipeline code)
- Group C (sequential, after Group B): Task 9 (end-to-end verification)
- Group D (sequential, after Group C): Task 10 (with-context branch)
- Group E (sequential, after Group C): Task 11 (README, submodule, eval harness)

Groups D and E can run in parallel after Group C.

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Initialize repo and seed data | medium | unit | — | 5 create |
| 2 | Generate seed CSV files | medium | unit | Task 1 | 3 create |
| 3 | Implement validator | medium | unit | Task 1 | 1 create |
| 4 | Implement transformer | medium | unit | Task 1 | 1 create |
| 5 | Implement reporter with planted bug | medium | unit | Task 4 | 1 create |
| 6 | Implement archiver | small | unit | Task 1 | 1 create |
| 7 | Implement orchestrator (run_processor.py) | medium | unit | Task 3, 4, 5, 6 | 1 create |
| 8 | Write unit tests | medium | unit | Task 3, 4, 6 | 3 create |
| 9 | Verify end-to-end and planted bug | medium | unit | Task 7, 8 | 0 create |
| 10 | Create with-context branch | medium | unit | Task 9 | 4 create |
| 11 | README, submodule registration, eval harness | medium | unit | Task 9 | 4 create |

---

### Task 1: Initialize repo and project structure [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=3 blast=5 novelty=5
**Rationale:** Fully specified project skeleton with exact file list and contents; pure boilerplate creation with adev-data-eval as structural reference.

**Charter capability:** Automation Eval Project
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `tests/evals/adev-automation-eval/processor/__init__.py`
- Create: `tests/evals/adev-automation-eval/tests/__init__.py`
- Create: `tests/evals/adev-automation-eval/.gitignore`
- Create: `tests/evals/adev-automation-eval/LICENSE`

**Tests:** `tests/evals/adev-automation-eval/tests/test_validator.py` — test file created in Task 8; this task creates the project skeleton only.

**Context to load:**
- `.context-index/specs/features/eval-projects/automation-eval-project.spec.md` (Project Structure section)
- `.context-index/specs/features/eval-projects/shared-conventions.spec.md` (branch layout, README conventions)

- [x] **Initialize project directory**

Create the directory structure:
```
tests/evals/adev-automation-eval/
├── processor/
│   └── __init__.py
├── inbox/            (empty, seed data in Task 2)
├── tests/
│   └── __init__.py
├── .gitignore
└── LICENSE
```

`.gitignore` contents:
```
reports/
archive/
errors/
__pycache__/
*.pyc
.pytest_cache/
```

`LICENSE`: MIT license with year 2026.

`processor/__init__.py` and `tests/__init__.py`: empty files.

- [x] **Initialize git repo**

```bash
cd tests/evals/adev-automation-eval
git init
git add .
git commit -m "chore: initialize project structure"
```

- [x] **Commit**

```bash
git add tests/evals/adev-automation-eval/
git commit -m "feat(eval-projects): initialize adev-automation-eval project skeleton

Spec: .context-index/specs/features/eval-projects/automation-eval-project.spec.md
Plan-task: 1"
```

Note: The inner git repo commit and the adev-plugin commit are separate operations. The adev-plugin commit tracks the submodule reference.

---

### Task 2: Generate seed CSV files [specialist: none]

**Routing:** auto-agent (score: 16/20)
**Scores:** spec=4 pattern=3 blast=5 novelty=4
**Rationale:** Row counts, schemas, and format requirements clearly specified; data generation is mechanical with minor creative latitude for realistic values.

**Charter capability:** Automation Eval Project
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Create: `tests/evals/adev-automation-eval/inbox/expenses_q1.csv`
- Create: `tests/evals/adev-automation-eval/inbox/timesheets_march.csv`
- Create: `tests/evals/adev-automation-eval/inbox/expenses_q2.csv`

**Tests:** `tests/evals/adev-automation-eval/tests/test_validator.py` — seed data correctness is validated implicitly by validator tests in Task 8.

**Context to load:**
- `.context-index/specs/features/eval-projects/automation-eval-project.spec.md` (Behavior 2 — required columns per file type, Behavior 5 — planted bug needs multi-category rows)

- [x] **Create expenses_q1.csv (35 rows)**

Headers: `date,amount,category,employee,description,department`
Required columns per spec: `amount`, `date`, `category`, `employee`.
Include at least 8 rows where amount > $500 (high_value category) AND the row is also `valid`, to trigger the planted bug's double-counting.
Dates in various formats: `MM/DD/YYYY`, `YYYY-MM-DD`, `DD-Mon-YYYY`.
Amounts as currency strings: `$1,234.56` format.
Include 2-3 rows with missing optional fields (description or department blank) to trigger `flagged` category.

- [x] **Create timesheets_march.csv (28 rows)**

Headers: `date,hours,project,employee,notes`
Required columns per spec: `hours`, `date`, `project`, `employee`.
Hours as numeric values (no currency parsing needed).
Include various date formats.

- [x] **Create expenses_q2.csv (42 rows)**

Headers: `date,amount,category,employee,description,department`
Same schema as expenses_q1. More rows, more high_value entries.
Include 10+ rows with amount > $500 to make the planted bug clearly visible in reports.

- [x] **Commit**

```bash
cd tests/evals/adev-automation-eval
git add inbox/
git commit -m "feat: add seed CSV data for inbox processing"
```

In adev-plugin:
```bash
git add tests/evals/adev-automation-eval
git commit -m "feat(eval-projects): add seed CSV data for automation eval

Spec: .context-index/specs/features/eval-projects/automation-eval-project.spec.md
Plan-task: 2"
```

---

### Task 3: Implement validator [specialist: none]

**Routing:** auto-agent (score: 16/20)
**Scores:** spec=5 pattern=2 blast=5 novelty=4
**Rationale:** Validation rules per file type are explicitly specified with error cases; standard CSV validation pattern requires no novel design.

**Charter capability:** Automation Eval Project
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Create: `tests/evals/adev-automation-eval/processor/validator.py`

**Tests:** `tests/evals/adev-automation-eval/tests/test_validator.py`

**Context to load:**
- `.context-index/specs/features/eval-projects/automation-eval-project.spec.md` (Behavior 2 — validation rules)

- [x] **Write failing test**

```python
# tests/test_validator.py
import unittest
from processor.validator import validate_csv

class TestValidator(unittest.TestCase):
    def test_valid_expense_report(self):
        """Valid expense CSV with all required columns passes validation."""
        result = validate_csv("inbox/expenses_q1.csv")
        self.assertTrue(result["valid"])

    def test_empty_file_fails(self):
        """Empty CSV file fails validation."""
        # Create temp empty file, validate, expect invalid
        ...

    def test_missing_required_columns(self):
        """CSV missing required columns fails validation."""
        ...

    def test_mismatched_column_count(self):
        """CSV with rows having different column counts fails validation."""
        ...
```

- [x] **Verify test fails**

Run: `cd tests/evals/adev-automation-eval && python -m pytest tests/test_validator.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'processor.validator'` or `ImportError`

- [x] **Implement**

`processor/validator.py`:
- `validate_csv(filepath)` → returns `{"valid": bool, "errors": list, "file_type": str}`
- Detect file type from headers: expense_reports need `amount`, `date`, `category`, `employee`; timesheets need `hours`, `date`, `project`, `employee`
- Check: file is non-empty, has header row, all rows same column count as header, required columns present
- Uses only `csv` and `pathlib` from stdlib

- [x] **Verify test passes**

Run: `cd tests/evals/adev-automation-eval && python -m pytest tests/test_validator.py -v`
Expected: PASS

- [x] **Commit**

```bash
cd tests/evals/adev-automation-eval
git add processor/validator.py tests/test_validator.py
git commit -m "feat: implement CSV validator with schema detection"
```

---

### Task 4: Implement transformer [specialist: none]

**Routing:** auto-agent (score: 16/20)
**Scores:** spec=5 pattern=2 blast=5 novelty=4
**Rationale:** Exact transformation rules (date normalization, currency parsing, multi-category assignment) specified in Behavior 3; well-understood data pipeline pattern.

**Charter capability:** Automation Eval Project
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Create: `tests/evals/adev-automation-eval/processor/transformer.py`

**Tests:** `tests/evals/adev-automation-eval/tests/test_transformer.py`

**Context to load:**
- `.context-index/specs/features/eval-projects/automation-eval-project.spec.md` (Behavior 3 — transformation rules, multi-category assignment)

- [x] **Write failing test**

```python
# tests/test_transformer.py
import unittest
from processor.transformer import transform_rows, normalize_date, parse_currency

class TestTransformer(unittest.TestCase):
    def test_normalize_date_mm_dd_yyyy(self):
        self.assertEqual(normalize_date("03/15/2026"), "2026-03-15")

    def test_normalize_date_already_iso(self):
        self.assertEqual(normalize_date("2026-03-15"), "2026-03-15")

    def test_parse_currency(self):
        self.assertAlmostEqual(parse_currency("$1,234.56"), 1234.56)

    def test_categorize_high_value(self):
        """Row with amount > $500 gets both valid and high_value categories."""
        row = {"amount": "$750.00", "date": "03/15/2026", ...}
        result = transform_rows([row], "expense_reports")
        self.assertIn("valid", result[0]["categories"])
        self.assertIn("high_value", result[0]["categories"])

    def test_categorize_flagged_missing_optional(self):
        """Row with missing optional field gets flagged category."""
        ...
```

- [x] **Verify test fails**

Run: `cd tests/evals/adev-automation-eval && python -m pytest tests/test_transformer.py -v`
Expected: FAIL — `ImportError`

- [x] **Implement**

`processor/transformer.py`:
- `normalize_date(date_str)` → ISO 8601 string
- `parse_currency(currency_str)` → float
- `transform_rows(rows, file_type)` → list of transformed row dicts, each with `categories` list
- Categories: `valid` (all required fields present and parseable), `high_value` (amount > $500), `flagged` (missing optional fields)
- A single row can belong to multiple categories (this is critical for the planted bug)
- Strips whitespace from all string fields
- Uses only `datetime`, `re` from stdlib

- [x] **Verify test passes**

Run: `cd tests/evals/adev-automation-eval && python -m pytest tests/test_transformer.py -v`
Expected: PASS

- [x] **Commit**

```bash
cd tests/evals/adev-automation-eval
git add processor/transformer.py tests/test_transformer.py
git commit -m "feat: implement data transformer with multi-category assignment"
```

---

### Task 5: Implement reporter with planted bug [specialist: none]

**Routing:** assisted-agent (score: 15/20)
**Scores:** spec=5 pattern=2 blast=5 novelty=3
**Rationale:** Planted bug requires precise implementation at exact location; human checkpoint ensures the intentional defect is correctly placed without being too obvious or too hidden.

**Charter capability:** Automation Eval Project, Planted Bugs
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 4
**Files:**
- Create: `tests/evals/adev-automation-eval/processor/reporter.py`

**Tests:** `tests/evals/adev-automation-eval/tests/test_transformer.py` — reporter is intentionally NOT unit-tested for totals aggregation (the planted bug must not be caught by tests).

**Context to load:**
- `.context-index/specs/features/eval-projects/automation-eval-project.spec.md` (Behaviors 4-5, Planted Bug section)

- [x] **Implement (no TDD — intentional)**

The reporter intentionally has NO unit tests for the totals computation. This is by design per the spec: "Tests do NOT test the report totals aggregation with multi-category rows."

`processor/reporter.py`:
- `generate_report(filename, rows, categories)` → writes markdown report to `reports/<filename>_report.md`
- Report contains: file summary (rows, columns, categories), per-category row counts, totals section
- **PLANTED BUG (line ~40):** `total = sum(cat['count'] for cat in categories)` — sums category counts instead of counting distinct rows. A row in both `valid` and `high_value` is counted twice in the total.
- For the seed data: expenses_q1.csv with 35 rows should report an inflated total (e.g., "Total Rows Processed: 47")
- Uses only `pathlib`, `datetime` from stdlib

- [x] **Commit**

```bash
cd tests/evals/adev-automation-eval
git add processor/reporter.py
git commit -m "feat: implement markdown report generator"
```

---

### Task 6: Implement archiver [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=5 pattern=2 blast=5 novelty=5
**Rationale:** Trivial file-move with timestamp prefix; fully specified behavior with mechanical implementation using stdlib shutil/pathlib.

**Charter capability:** Automation Eval Project
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Create: `tests/evals/adev-automation-eval/processor/archiver.py`

**Tests:** `tests/evals/adev-automation-eval/tests/test_archiver.py`

**Context to load:**
- `.context-index/specs/features/eval-projects/automation-eval-project.spec.md` (Behavior 6 — timestamp-prefixed archive)

- [x] **Write failing test**

```python
# tests/test_archiver.py
import unittest
from processor.archiver import archive_file

class TestArchiver(unittest.TestCase):
    def test_archive_creates_timestamped_copy(self):
        """Archived file has timestamp prefix in archive/ directory."""
        ...

    def test_archive_removes_original(self):
        """Original file is moved (not copied) to archive/."""
        ...
```

- [x] **Verify test fails**

Run: `cd tests/evals/adev-automation-eval && python -m pytest tests/test_archiver.py -v`
Expected: FAIL — `ImportError`

- [x] **Implement**

`processor/archiver.py`:
- `archive_file(filepath, archive_dir="archive")` → moves file to `archive/<YYYYMMDD_HHMMSS>_<filename>`
- Creates `archive/` directory if it doesn't exist
- Uses only `shutil`, `pathlib`, `datetime` from stdlib

- [x] **Verify test passes**

Run: `cd tests/evals/adev-automation-eval && python -m pytest tests/test_archiver.py -v`
Expected: PASS

- [x] **Commit**

```bash
cd tests/evals/adev-automation-eval
git add processor/archiver.py tests/test_archiver.py
git commit -m "feat: implement file archiver with timestamp prefix"
```

---

### Task 7: Implement orchestrator (run_processor.py) [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=5 pattern=3 blast=5 novelty=4
**Rationale:** Full error case table and behavioral contracts specified; standard pipeline orchestration pattern with adev-data-eval as structural reference.

**Charter capability:** Automation Eval Project
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 3, Task 4, Task 5, Task 6
**Files:**
- Create: `tests/evals/adev-automation-eval/run_processor.py`

**Tests:** `tests/evals/adev-automation-eval/tests/test_validator.py` — end-to-end behavior verified in Task 9.

**Context to load:**
- `.context-index/specs/features/eval-projects/automation-eval-project.spec.md` (Behaviors 1, 7, Error Cases)

- [x] **Implement**

`run_processor.py`:
- Scans `inbox/` for `.csv` files
- For each file: validate → transform → report → archive
- On validation failure: move file to `errors/` with a reason log file
- Skips non-CSV files with warning to stdout
- Empty inbox: prints "No files to process" and exits 0
- Missing inbox dir: prints "Inbox directory not found" and exits 1
- Unwritable archive dir: prints permission error and exits 1
- Prints processing summary at end
- Uses only stdlib: `csv`, `pathlib`, `shutil`, `datetime`, `sys`

- [x] **Commit**

```bash
cd tests/evals/adev-automation-eval
git add run_processor.py
git commit -m "feat: implement main orchestrator for CSV processing pipeline"
```

---

### Task 8: Write unit tests [specialist: none]

**Routing:** assisted-agent (score: 15/20)
**Scores:** spec=4 pattern=3 blast=5 novelty=3
**Rationale:** Tests must carefully avoid exercising the reporter's totals aggregation with multi-category rows; human checkpoint ensures the planted bug remains undetectable by the test suite.

**Charter capability:** Automation Eval Project
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 3, Task 4, Task 6
**Files:**
- Create: `tests/evals/adev-automation-eval/tests/test_validator.py`
- Create: `tests/evals/adev-automation-eval/tests/test_transformer.py`
- Create: `tests/evals/adev-automation-eval/tests/test_archiver.py`

**Tests:** These ARE the test files.

**Context to load:**
- `.context-index/specs/features/eval-projects/automation-eval-project.spec.md` (Behavior 8 — tests pass, tests do NOT test report totals with multi-category rows)
- `.context-index/specs/features/eval-projects/automation-eval-project.spec.md` (Planted Bug — tests must not catch it)

Note: Tests were scaffolded inline with Tasks 3, 4, 6 during TDD. This task ensures full coverage and verifies the test suite as a whole. **Critical:** Do NOT add tests that exercise the reporter's totals aggregation with multi-category rows. The planted bug must remain undetectable by the test suite.

- [x] **Verify all tests pass together**

Run: `cd tests/evals/adev-automation-eval && python -m pytest tests/ -v`
Expected: PASS — all tests in test_validator.py, test_transformer.py, test_archiver.py pass

- [x] **Commit**

```bash
cd tests/evals/adev-automation-eval
git add tests/
git commit -m "test: complete unit test suite for validator, transformer, archiver"
```

---

### Task 9: Verify end-to-end and planted bug [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=5 pattern=3 blast=5 novelty=4
**Rationale:** Acceptance criteria provide exact verification commands and expected outputs; no files created or modified, purely observational.

**Charter capability:** Automation Eval Project, Planted Bugs
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 7, Task 8
**Files:**
- No files created or modified (verification only)

**Tests:** `tests/evals/adev-automation-eval/tests/test_validator.py` — this is a verification task, not a code-writing task.

**Context to load:**
- `.context-index/specs/features/eval-projects/automation-eval-project.spec.md` (Acceptance Criteria, Planted Bug)

- [x] **Run the processor end-to-end**

```bash
cd tests/evals/adev-automation-eval
python run_processor.py
```

Expected: All 3 CSV files processed, reports generated in `reports/`, files archived in `archive/`, processing summary printed.

- [x] **Verify planted bug is present**

```bash
cd tests/evals/adev-automation-eval
# Check report total vs actual row count
grep "Total Rows Processed" reports/expenses_q1_report.md
wc -l inbox/expenses_q1.csv  # (need to restore from archive or check before archiving)
```

Expected: Report total exceeds actual row count due to double-counting multi-category rows.

- [x] **Verify all unit tests still pass**

```bash
cd tests/evals/adev-automation-eval
python -m pytest tests/ -v
```

Expected: PASS — all tests pass despite the planted bug.

- [x] **Verify error handling**

Test empty inbox (after archiving): re-run `python run_processor.py` — should print "No files to process".

---

### Task 10: Create with-context branch [specialist: none]

**Routing:** assisted-agent (score: 15/20)
**Scores:** spec=4 pattern=3 blast=5 novelty=3
**Rationale:** Branch invariants specified but exact constitution/manifest content for the Python project requires inference from shared conventions; human checkpoint ensures context index correctness.

**Charter capability:** With-Context Branches
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 9
**Files:**
- Create: `tests/evals/adev-automation-eval/.context-index/constitution.md`
- Create: `tests/evals/adev-automation-eval/.context-index/manifest.yaml`
- Create: `tests/evals/adev-automation-eval/.context-index/platform-context.yaml`
- Create: `tests/evals/adev-automation-eval/.context-index/specs/features/automation/charter.md` (or one extracted spec)

**Tests:** Verify with `git diff main...with-context` that only `.context-index/` files differ.

**Context to load:**
- `.context-index/specs/features/eval-projects/shared-conventions.spec.md` (Behaviors 3-4 — with-context invariants)
- `.context-index/specs/features/eval-projects/automation-eval-project.spec.md` (AC: with-context branch)

- [x] **Create with-context branch**

```bash
cd tests/evals/adev-automation-eval
git checkout -b with-context main
```

- [x] **Populate .context-index/**

Create minimal adev context:
- `constitution.md`: Python-specific constitution (stdlib only, PEP 8, pytest, no external deps)
- `manifest.yaml`: Project metadata, modules (processor), quality gates (`python -m pytest tests/`)
- `platform-context.yaml`: Python 3.11+, stdlib, pytest
- At least one extracted spec under `specs/features/`

- [x] **Verify branch invariants**

```bash
git diff main...with-context --stat
# Should show ONLY .context-index/ additions
python -m pytest tests/ -v
# Should still pass
```

- [x] **Commit on with-context branch**

```bash
git add .context-index/
git commit -m "chore: add adev context index for eval runs"
git checkout main
```

---

### Task 11: README, submodule registration, eval harness scaffold [specialist: none]

**Routing:** auto-agent (score: 16/20)
**Scores:** spec=5 pattern=3 blast=4 novelty=4
**Rationale:** README template and TODO features fully specified in shared conventions and spec; eval harness scaffold is boilerplate .gitkeep files across two directories.

**Charter capability:** Automation Eval Project, Onboarding Guides, Submodule Registration, Eval Harness Scaffolds
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 9
**Files:**
- Create: `tests/evals/adev-automation-eval/README.md`
- Create: `tests/evals/process-automation/scenarios/.gitkeep`
- Create: `tests/evals/process-automation/rubrics/.gitkeep`

**Tests:** Verify README has 6 sections in order, 5 TODO features with required format.

**Context to load:**
- `.context-index/specs/features/eval-projects/shared-conventions.spec.md` (Behaviors 7-10)
- `.context-index/specs/features/eval-projects/automation-eval-project.spec.md` (TODO Features section, AC)

- [x] **Write README.md**

Follow shared conventions template with exactly 6 sections in order:
1. Project Title (`# adev-automation-eval`)
2. Overview (1 paragraph describing the CSV processing pipeline)
3. Quick Start (`python run_processor.py`, `python -m pytest tests/`)
4. Architecture (module diagram: run_processor → validator → transformer → reporter → archiver)
5. TODO Features (5 features from spec, each with title, description, complexity tag, lifecycle coverage tag):
   - Email notification on errors (simple) — specify, implement
   - Configurable validation rules (medium) — brainstorm, specify, implement, validate
   - Duplicate detection (medium) — specify, plan, implement, validate
   - Scheduled watching mode (complex) — brainstorm, specify, plan, implement, validate
   - Audit trail (medium) — specify, implement, validate
6. License (MIT)

- [x] **Create eval harness scaffold**

```bash
mkdir -p tests/evals/process-automation/scenarios
mkdir -p tests/evals/process-automation/rubrics
touch tests/evals/process-automation/scenarios/.gitkeep
touch tests/evals/process-automation/rubrics/.gitkeep
```

- [x] **Register submodule** (if project is an external repo)

Note: If the project lives directly under `tests/evals/adev-automation-eval/` as a directory (not a separate remote repo), submodule registration is deferred until the repo has its own remote. For now, ensure the directory is tracked in git.

- [x] **Commit**

In the eval project:
```bash
cd tests/evals/adev-automation-eval
git add README.md LICENSE
git commit -m "docs: add README with quick start and TODO features"
```

In adev-plugin:
```bash
git add tests/evals/adev-automation-eval tests/evals/process-automation
git commit -m "feat(eval-projects): add automation eval project with README and harness scaffold

Spec: .context-index/specs/features/eval-projects/automation-eval-project.spec.md
Plan-task: 11"
```

---

## Quality Gates

After all tasks are complete, run the full quality gate suite:

- Tests pass: `npm test` (adev-plugin quality gate)
- Python tests pass: `cd tests/evals/adev-automation-eval && python -m pytest tests/ -v`
- End-to-end processing: `cd tests/evals/adev-automation-eval && python run_processor.py`
- Planted bug verified: Report "Total Rows Processed" exceeds actual row count
- All acceptance criteria from spec satisfied
- Shared conventions compliance: README has 6 sections in order, 5 TODO features with format
- Branch invariants: `main` has no `.context-index/`, `with-context` differs only in `.context-index/`
