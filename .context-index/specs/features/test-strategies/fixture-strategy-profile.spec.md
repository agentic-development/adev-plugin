---
charter: test-strategies
charter-extension: true
status: implemented
revision: 1
charter-revision: 2
created: 2026-04-20
updated: 2026-05-04
source-manifest:
  files:
    - lib/test-strategies/profiles/fixture.md
    - lib/test-strategies/profiles.mjs
  computed-at: "2026-05-10T23:51:01.456Z"
---

# Spec: Fixture Strategy Profile

## Capability

Define the complete rule set for the `fixture` test strategy, enabling TDD for data pipelines, ETL transforms, dbt models, and data quality validation.

## Behavioral Contract

### Preconditions

- The task involves data transformation files (detected via `models/**/*.sql`, `dbt_project.yml`, data pipeline scripts)
- A data testing framework is available (dbt tests, Great Expectations, Soda Core, or custom fixture comparison)
- The strategy profile contract (`getStrategyProfile`) can load this profile

### Behaviors

1. **When** write-test loads the fixture profile **then** it uses these RED/GREEN semantics: RED means the transform output does not match the expected output fixture; GREEN means the transform produces output exactly matching the expected fixture
2. **When** write-test authors tests for a fixture task **then** it writes input/output fixture pairs: a known input dataset and the expected output after transformation, covering normal cases, edge cases (NULLs, empty sets, duplicates), and boundary conditions
3. **When** write-test checks for gaming in fixture tests **then** it detects these strategy-specific patterns: trivially small fixtures (fewer than 3 rows), fixtures that only test the happy path (no NULLs, no edge cases), not_null/unique tests without corresponding data that would violate them, and fixtures with auto-generated data instead of hand-crafted representative data
4. **When** write-test applies assertion rules for fixture tests **then** it requires: exact output comparison (not approximate or partial), fixtures covering at least one NULL case, one duplicate case, and one boundary case, and assertions on row count AND content (not count alone)
5. **When** write-test applies seed data rules **then** it requires: hand-crafted fixture files with known, deterministic input data, fixtures stored as CSV/JSON/SQL alongside the transform, and input fixtures that represent realistic data shapes including edge cases
6. **When** write-test produces the handoff block **then** it includes: input fixture file paths, expected output fixture paths, transform file path, test command (e.g., `dbt test`), and data quality expectation definitions
7. **When** a fixture test's RED state is verified **then** the transform must produce output that does not match the expected fixture because the transform logic is not yet implemented — not because input data is missing or the test framework is misconfigured

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Input fixture file missing | Block with: "Input fixture not found at <path>" | FIXTURE_INPUT_MISSING |
| Expected output fixture missing | Block with: "Expected output fixture not found at <path>" | FIXTURE_OUTPUT_MISSING |
| Transform framework not detected | Advisory: list supported frameworks | FIXTURE_NO_FRAMEWORK |

## Constitution Reference

- "Skills are primarily markdown" — The fixture profile is a markdown document consumed by write-test as structured instructions
- "Minimize external dependencies" — Fixture comparison uses the project's existing test tools, not new dependencies

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Write fixture profile markdown | Create `lib/test-strategies/profiles/fixture.md` with all required fields | medium |
| Write fixture profile tests | Verify profile loads correctly and all fields are present | small |
| Document fixture testing patterns | Examples of good vs. gaming fixture assertions | small |

## Acceptance Criteria

- [ ] Profile file contains all 8 required fields
- [ ] gaming_blockers includes: trivially small fixtures, happy-path-only, count-only assertions, auto-generated data
- [ ] assertion_rules require exact output comparison with edge case coverage
- [ ] seed_data_rule requires hand-crafted deterministic fixtures
- [ ] handoff_format includes input/output fixtures, transform path, and test command
- [ ] `getStrategyProfile('fixture')` loads the profile without fallback
- [ ] All quality gates pass
- [ ] No constitutional violations introduced
