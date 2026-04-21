---
strategy_id: fixture
red_exit_condition: "Transform output does not match the expected output fixture — rows differ, columns missing, or values incorrect"
green_exit_condition: "Transform produces output exactly matching the expected fixture — row count, column names, and all values match"
gaming_blockers:
  - "Trivially small fixtures with fewer than 3 rows of input data"
  - "Fixtures that only test the happy path — no NULLs, no edge cases, no duplicates"
  - "not_null/unique tests without corresponding data that would violate them"
  - "Fixtures with auto-generated or random data instead of hand-crafted representative data"
  - "Asserting row count only without checking actual content"
assertion_rules: "Exact output comparison required — not approximate or partial matching. Fixtures must cover at least one NULL case, one duplicate case, and one boundary case. Assert on both row count AND content."
seed_data_rule: "Hand-crafted fixture files with known, deterministic input data. Fixtures stored as CSV/JSON/SQL alongside the transform. Input fixtures must represent realistic data shapes including edge cases."
handoff_format: "Input fixture file paths + expected output fixture paths + transform file path + test command (e.g., dbt test) + data quality expectation definitions"
permitted_tools:
  - "dbt tests"
  - "dbt unit tests"
  - "Great Expectations"
  - "Soda Core"
  - "SQLMesh"
  - "elementary"
  - "pytest"
  - "pandas testing"
---

# Fixture Strategy Profile

Input/output fixture-based testing profile for data pipelines and transforms. Verifies transform logic produces exact expected output from known input.
