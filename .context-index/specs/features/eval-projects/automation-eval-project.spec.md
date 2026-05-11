# Live Spec: Automation Eval Project

<!-- Live Spec within the eval-projects charter.
     Python file-processing pipeline with inbox watching, validation, transformation, and reporting.
     Parent Charter: .context-index/specs/features/eval-projects/charter.md -->

---
charter: eval-projects
status: validated
risk_level: low
milestone:
revision: 1
charter-revision: 1
created: 2026-05-06
updated: 2026-05-06
source-manifest:
  sha: "726340a"
  files:
    - tests/evals/adev-automation-eval/.gitignore
    - tests/evals/adev-automation-eval/LICENSE
    - tests/evals/adev-automation-eval/inbox/expenses_q1.csv
    - tests/evals/adev-automation-eval/inbox/expenses_q2.csv
    - tests/evals/adev-automation-eval/inbox/timesheets_march.csv
    - tests/evals/adev-automation-eval/processor/__init__.py
    - tests/evals/adev-automation-eval/processor/archiver.py
    - tests/evals/adev-automation-eval/processor/reporter.py
    - tests/evals/adev-automation-eval/processor/transformer.py
    - tests/evals/adev-automation-eval/processor/validator.py
    - tests/evals/adev-automation-eval/run_processor.py
    - tests/evals/adev-automation-eval/tests/__init__.py
    - tests/evals/adev-automation-eval/tests/test_archiver.py
    - tests/evals/adev-automation-eval/tests/test_transformer.py
    - tests/evals/adev-automation-eval/tests/test_validator.py
    - tests/evals/process-automation/rubrics/.gitkeep
    - tests/evals/process-automation/scenarios/.gitkeep
  computed-at: "2026-05-11T16:09:58.813Z"
---

## Behavioral Contract

A self-contained Python project (`adev-automation-eval`) that processes CSV files from an inbox directory: validates structure, transforms data, generates markdown summary reports, and archives processed files. Runs as a one-shot batch process with `python run_processor.py`. No Docker, no database — pure file-based processing with Python stdlib only.

### Preconditions

- Python 3.11+ is installed
- No `pip install` required — zero external dependencies, Python stdlib only
- Inbox directory exists at `inbox/` with sample CSV files
- Shared conventions from `shared-conventions.spec.md` are satisfied

### Behaviors

1. **When** `python run_processor.py` is executed **then** it scans `inbox/` for `.csv` files, processes each one through validate → transform → report → archive stages, and prints a processing summary.

2. **When** a CSV file is validated **then** the validator checks: file is non-empty, has a header row, all rows have the same column count as the header, required columns exist (varies by file type: `expense_reports` need amount/date/category/employee, `timesheets` need hours/date/project/employee).

3. **When** a valid CSV file is transformed **then** the transformer normalizes dates to ISO 8601, strips whitespace from string fields, converts currency strings ("$1,234.56") to floats, and categorizes each row into one or more validation categories: `valid`, `high_value` (amount > $500), `flagged` (missing optional fields).

4. **When** a transformed file is reported **then** a markdown report is written to `reports/<filename>_report.md` containing: file summary (rows, columns, categories), per-category row counts, and a totals section.

5. **When** reporting computes category totals **then** the planted bug double-counts rows that belong to multiple categories. A row that is both `valid` and `high_value` is counted in both, and the "Total Rows Processed" sums all category counts instead of counting distinct rows.

6. **When** a file is successfully processed **then** it is moved from `inbox/` to `archive/` with a timestamp prefix (e.g., `archive/20260506_120000_expenses_q1.csv`).

7. **When** `python run_processor.py` is executed with no files in `inbox/` **then** it prints "No files to process" and exits with code 0.

8. **When** `python -m pytest tests/` is run **then** all unit tests pass. Tests cover validation rules and individual transform functions. Tests do NOT test the report totals aggregation with multi-category rows.

### Planted Bug

The report generator sums category counts to produce "Total Rows Processed" in the totals section. A row categorized as both `valid` and `high_value` is counted once in each category (correct), but the total sums these counts (incorrect — should count distinct rows). For the seed data, the report shows "Total Rows Processed: 47" when the actual file has 35 rows.

**Symptom:** The "Total Rows Processed" number in the report exceeds the actual number of data rows in the source file. Comparing the report total with `wc -l inbox/<file>.csv` reveals the inflation.

**Root cause:** `processor/reporter.py`, line ~40, `total = sum(cat['count'] for cat in categories)` instead of counting unique row indices.

**Discovery path:** Open any generated report, note the "Total Rows Processed" number. Count rows in the source CSV. The report total is higher. Trace to the reporter's totals computation.

### Postconditions

- All CSV files moved from `inbox/` to `archive/`
- One markdown report per processed file in `reports/`
- Processing summary printed to stdout
- All unit tests pass on both branches

### Error Cases

| Condition | Expected Behavior | Exit Code |
|-----------|-------------------|-----------|
| `inbox/` directory does not exist | Exits with "Inbox directory not found" | 1 |
| CSV file with mismatched column counts | Validation fails, file moved to `errors/` with reason log | 0 |
| CSV file missing required columns | Validation fails, file moved to `errors/` with reason log | 0 |
| Empty CSV file (no headers) | Validation fails, file moved to `errors/` | 0 |
| `archive/` not writable | Exits with permission error | 1 |
| Non-CSV file in inbox | Skipped with warning to stdout | 0 |

## Project Structure

```
adev-automation-eval/
├── run_processor.py          # Entry point — scans inbox, orchestrates stages
├── processor/
│   ├── __init__.py
│   ├── validator.py          # CSV structure and schema validation
│   ├── transformer.py        # Date normalization, currency parsing, categorization
│   ├── reporter.py           # Markdown report generation (contains planted bug)
│   └── archiver.py           # File move with timestamp prefix
├── inbox/                    # Sample CSV files (3 files in seed data)
│   ├── expenses_q1.csv       # 35 rows, expense report format
│   ├── timesheets_march.csv  # 28 rows, timesheet format
│   └── expenses_q2.csv       # 42 rows, expense report format
├── reports/                  # Generated reports (gitignored)
├── archive/                  # Processed files (gitignored)
├── errors/                   # Invalid files (gitignored)
├── tests/
│   ├── test_validator.py
│   ├── test_transformer.py
│   └── test_archiver.py
├── README.md
└── LICENSE
```

## System Constitution Reference

- **"Minimize external dependencies"** — Zero dependencies. Entire project uses Python stdlib only (csv, datetime, pathlib, shutil, json).
- **"Skills are primarily markdown"** — `with-context` branch is pure markdown/YAML. Reports are also markdown — dog-fooding the format.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Create repo and seed data | Initialize repo, generate 3 sample CSVs with realistic data | small |
| Implement validator | CSV structure checks, schema validation per file type | medium |
| Implement transformer | Date normalization, currency parsing, multi-category assignment | medium |
| Implement reporter | Markdown report generation with planted bug in totals | small |
| Implement archiver | Timestamp-prefixed file move | small |
| Implement orchestrator | `run_processor.py` scanning inbox and calling stages | small |
| Write unit tests | Tests for validator, transformer, archiver (not reporter totals) | medium |
| Verify end-to-end | Inside `tests/evals/adev-automation-eval/`: run `python run_processor.py`, verify reports generated in `reports/`, files archived in `archive/` | medium |
| Verify planted bug | Open any generated report, compare "Total Rows Processed" with `wc -l` on the source CSV — confirm the report total is inflated | small |
| Verify unit tests | Run `python -m pytest tests/` inside the project — all tests must pass despite the planted bug | small |
| Create `with-context` branch | Branch off main, populate `.context-index/` | medium |
| Write README | Follow shared conventions template with 5 TODO features | small |
| Register submodule | Add to adev-plugin at `tests/evals/adev-automation-eval/` | small |

## TODO Features (for README)

1. **Email notification on errors** (simple) — Print a formatted email-like summary when files fail validation. Exercises: specify, implement.
2. **Configurable validation rules** (medium) — Move schema definitions to a `config.yaml` file instead of hardcoding in validator.py. Exercises: brainstorm, specify, implement, validate.
3. **Duplicate detection** (medium) — Detect and flag duplicate rows within and across files in the same batch. Exercises: specify, plan, implement, validate.
4. **Scheduled watching mode** (complex) — Add a `--watch` flag that polls inbox every N seconds and processes new files. Exercises: brainstorm, specify, plan, implement, validate.
5. **Audit trail** (medium) — Write a JSON log of all processing actions (file received, validated, transformed, archived) with timestamps. Exercises: specify, implement, validate.

## Acceptance Criteria

- [ ] Repo exists as `adev-automation-eval` with `main` and `with-context` branches
- [ ] `python run_processor.py` processes all inbox files successfully
- [ ] Reports generated in `reports/` directory as markdown
- [ ] Files archived with timestamp prefix in `archive/`
- [ ] Planted bug is present: report totals inflate row counts by double-counting multi-category rows
- [ ] All unit tests pass (`python -m pytest tests/`)
- [ ] Planted bug is NOT detectable by unit tests (tests don't exercise totals aggregation)
- [ ] `with-context` branch has valid `.context-index/` with extracted spec
- [ ] README follows shared conventions (6 sections in order, 5 TODO features)
- [ ] Registered as submodule at `tests/evals/adev-automation-eval/`
- [ ] Eval harness scaffold exists at `tests/evals/process-automation/scenarios/` and `rubrics/`
- [ ] Zero external dependencies — Python stdlib only
- [ ] All quality gates pass
- [ ] No constitutional violations introduced
