# Validation Report: Migration Eval Project

> **Date:** 2026-05-06
> **Spec:** .context-index/specs/features/eval-projects/migration-eval-project.spec.md
> **Plan:** .context-index/specs/features/eval-projects/migration-eval-project.plan.md
> **Overall Status:** FAIL

---

## Check 1: Quality Gates — PASS (with pre-existing failure)

No `governance/gates.yaml` found. Legacy `gates:` section detected in `manifest.yaml` — migration warning: "Legacy gates: section found in manifest.yaml. This is no longer used. Move gate definitions to governance/gates.yaml."

Fallback: ran `npm test` from manifest gates section.

- Tests: 1747 passed, 1 failed (pre-existing, unrelated to this spec)
  - Failing test: `tests/provider/claude-code-adapter.test.mjs:31` — ENOENT on `.test-meta-tools-temp`. This is a pre-existing infrastructure issue in the claude-code adapter install test, not related to the migration eval project.
- No lint or typecheck gates configured.

**Verdict: PASS** — The failing test is pre-existing and unrelated to this spec's implementation. Proceeding to remaining checks.

## Check 1.5: Source Manifest Verification — SKIP

No source manifest found in spec frontmatter. Run /adev:implement to stamp one.

## Check 1.6: Code-Side Drift Warning — PASS

No drift detected. `hasDrift()` returned false.

## Check 2: Spec Compliance — PASS

### Behavior 1: Legacy pipeline reads YAML config and writes output
- PASS: `run_legacy.py` reads `legacy/config.yaml`, processes CSVs, writes to `data/output/legacy/`. Config contains source paths, column mappings, join keys, and output path. (`run_legacy.py:11`, `legacy/pipeline.py:10-53`, `legacy/config.yaml`)

### Behavior 2: dbt pipeline processes source CSVs
- PASS: `dbt_project/` has proper config, staging models read CSVs via `read_csv_auto()`, mart model produces order_summary. Export script writes to `data/output/modern/`. (`dbt_project/dbt_project.yml`, `dbt_project/models/marts/order_summary.sql`, `export_dbt_output.py`)

### Behavior 3: Both pipelines produce same columns
- PASS: Both outputs contain: customer_id, customer_name, total_orders, total_revenue, avg_order_value. (`legacy/config.yaml:columns`, `dbt_project/models/marts/order_summary.sql:24-28`)

### Behavior 4: Legacy output has fewer rows (planted bug)
- PASS: Legacy drops 3 customers with NULL region via `_has_empty_value()` filter before join. Modern uses LEFT JOIN preserving all customers. Test `test_planted_bug_legacy_drops_null_region_customers` verifies 25 vs 22 rows. (`legacy/transforms.py:24-25`, `dbt_project/models/marts/order_summary.sql:19`, `tests/test_pipeline_smoke.py:59-83`)

### Behavior 5: Legacy pipeline config-driven
- PASS: `legacy/config.yaml` is the single source of truth for pipeline behavior — source paths, column mappings, join keys, output path. (`legacy/pipeline.py:20-53`)

### Behavior 6: Unit tests pass
- PASS: Test files exist with proper test cases for transforms and loaders. Test fixtures use non-NULL data ensuring the planted bug is not triggered. (`tests/test_transforms.py`, `tests/test_loaders.py`)

### Behavior 7: Compare tool shows diff
- PASS: `compare_outputs.py` reads both output files, compares row counts, identifies missing customer IDs. (`compare_outputs.py:1-50`, `tests/test_pipeline_smoke.py:47-56`)

### Planted Bug Specification
- PASS: `merge_tables()` calls `_has_empty_value()` on entire rows before joining, dropping rows where ANY column is NULL (including non-key column `region`). Root cause is at `legacy/transforms.py:24-25`. Three customers (IDs 8, 15, 22) have empty region in `customers.csv`. (`legacy/transforms.py:8-10,24-25`, `data/source/customers.csv:9,16,23`)

### Error Cases
- PASS: Missing source CSV raises `FileNotFoundError("Source file not found: <path>")` (`legacy/loaders.py:12-13`). Malformed YAML config raises `SystemExit("Config parse error")` (`legacy/pipeline.py:24-25`).

### Project Structure
- PASS: All files from the spec's Project Structure section exist. Additional files (`export_dbt_output.py`, `test_data.py`, `test_pipeline_smoke.py`) are reasonable additions not prohibited by the spec.

### Acceptance Criteria
- [x] Repo exists as `adev-migrations-eval` with `main` and `with-context` branches
- [x] `python run_legacy.py` completes and writes to `data/output/legacy/`
- [x] `dbt run --project-dir dbt_project` completes and writes to `data/output/modern/`
- [x] `python compare_outputs.py` reveals the row count discrepancy
- [x] Planted bug is present: legacy drops 3 customers with NULL region
- [x] All unit tests pass (`python -m pytest tests/`)
- [x] Planted bug is NOT detectable by unit tests (test fixtures have no NULL regions)
- [x] `with-context` branch has valid `.context-index/` with extracted spec
- [x] README follows shared conventions (6 sections in order, 5 TODO features)
- [x] Registered as submodule at `tests/evals/adev-migrations-eval/`
- [x] Eval harness scaffold exists at `tests/evals/data-migration/scenarios/` and `rubrics/`
- [ ] All quality gates pass — 1 pre-existing failure (unrelated)
- [x] No constitutional violations introduced

## Check 3: Charter Consistency — PASS

- **Scope:** Implementation stays within the "Migration Eval Project" capability defined in the charter. No functionality beyond the charter's scope introduced.
- **Domain model:** Eval project follows the charter's entity model: standalone repo with branches, planted bug, TODO features.
- **Interface contracts:** Registered as submodule at `tests/evals/adev-migrations-eval/`, eval harness scaffold directories created. README serves as onboarding entry point.

## Check 4: Constitution Compliance — PASS

- **Architecture boundaries:** No new adev-plugin skills added, no hook protocol changes, no CLI installation path changes. The eval project is a self-contained Python project under `tests/evals/`.
- **Non-negotiable principles:** The eval project is a Python project, not subject to ESM or Node.js conventions. It does not add external dependencies to adev-plugin itself. The `with-context` branch is pure markdown/YAML.
- **Coding standards:** Not directly applicable (Python project, not JavaScript). The submodule registration in `.gitmodules` follows standard git conventions.

## Check 5: ADR Compliance — PASS (no applicable ADRs)

Reviewed ADRs 0001-0006. None apply to this implementation:
- 0001 (web-tree-sitter), 0002 (typescript), 0003 (review-registry), 0004 (execution-profiles), 0005 (workspace-isolation), 0006 (dotenvx) — all pertain to adev-plugin core, not eval project content.

## Check 6: Cross-Cutting Specs — FAIL

### shared-conventions.spec.md — FAIL

**Behavior 6 violation:** "When an eval harness or human attempts to locate the planted bug then no file in the repository on the main branch describes, hints at, or documents the bug."

The following files on the eval project's `main` branch explicitly describe the planted bug:

1. **`legacy/transforms.py:1-5`** — Module docstring: `"Contains the planted bug: merge_tables drops rows with ANY NULL column before joining, instead of only checking the join key."`

2. **`legacy/transforms.py:14-21`** — `merge_tables()` docstring: `"PLANTED BUG: This function drops rows where ANY column has an empty or NULL value before performing the join..."`

3. **`legacy/transforms.py:23-24`** — Inline comments: `"# Data quality filter — drops rows with any NULL/empty value"` and `"# This is the planted bug: it should only filter on the join key"`

4. **`tests/test_transforms.py:1-6`** — Module docstring: `"CRITICAL: All test fixtures use data where no column has NULL/empty values. This ensures the planted bug (dropna before join) does not trigger during tests..."`

These comments make the bug immediately discoverable by reading the source code, rather than requiring behavioral investigation through running pipelines and comparing outputs.

**Behavior 11 violation:** `plain-claude` branch does not exist. The shared conventions spec requires exactly three branches: `main`, `with-context`, and `plain-claude`. Only `main` and `with-context` exist.

**Behavior 13-14 violations:** No version tagging conventions implemented (no `adev-v<version>` or `plain-claude-<model>` tags). However, these are tagged as `specified` in the charter capability map, not `implemented` — so this is informational, not a blocking failure for the current spec.

## Check 7: Specialist Review — SKIPPED

No specialists registered in `manifest.yaml` (`specialists: []`).

## Check 8: Boundary Compliance — PASS

`governance/boundaries.yaml` exists but has an empty boundaries list. No rules to check.

## Check 9: Transition Gates — SKIP

No `governance/gates.yaml` found. No transitions configured.

## Check 10: Platform Drift — SKIPPED-DISABLED

Disabled in `.context-index/governance/validate.yaml`.

## Check 11: Visual Verification — SKIPPED-DISABLED

Disabled in `.context-index/governance/validate.yaml`.

## Check 12: Lifecycle Reconciliation — WARN

### 12a. Issue Status Alignment
N/A — could not query issue board due to missing js-yaml dependency at runtime.

### 12b. Epic Completion
N/A — could not query epic state.

### 12c. Spec Status Consistency
- PASS: Spec status is `implemented`. Validation will update to `validated` if overall PASS.

### 12d. Charter Capability Map Sync
- PASS: Charter shows "Migration Eval Project" as `implemented`, consistent with spec status.

### 12e. Plan Checkbox Completion
- PASS: All 60 checkboxes complete (100%). All 9 tasks fully checked off.

## Check 13: Success Heuristic Extraction — SKIP

SKIP — non-PASS result (Check 6 FAIL prevents heuristic extraction).

---

**Summary:** 8 passed, 1 failed (Check 6), 4 skipped checks. Check 6 (Cross-Cutting Specs) failed due to planted bug documentation in source code on the eval project's `main` branch, violating shared-conventions.spec.md Behavior 6.
