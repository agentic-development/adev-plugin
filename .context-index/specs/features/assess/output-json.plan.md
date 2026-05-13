<!-- DO NOT EDIT statuses inline — see lifecycle log output-json.jsonl -->
# Plan: Output JSON

## Spec Reference
- Spec: `.context-index/specs/features/adev:assess/output-json.spec.md`
- Charter: `.context-index/specs/features/adev:assess/charter.md`
- Review: PASS

## Overview

Implement the JSON output formatter for the adev:assess skill. This module takes a completed `AssessmentReport` object and serializes it to a JSON string for machine consumption. It lives in `lib/assess/` as companion code, following the same pattern established by `detect-mode.mjs`.

The module uses only `JSON.stringify` (Node.js built-in) and produces output matching the schema defined in the spec: version, timestamp, mode, totalScore, level, and an array of dimension results each containing name, score, weight, and evidence.

## Tasks

### Task 1: Define AssessmentReport schema and `formatJson` function
- **Files:** `lib/assess/output-json.mjs` (create)
- **Tests:** `tests/lib/assess-output-json.test.mjs` (create)
- **TDD:** RED — write test first, then implement
- **Description:**
  Create a `formatJson(report)` function that takes an `AssessmentReport` object and returns a JSON string. The function should:
  1. Accept a report object with properties: `version`, `timestamp`, `mode`, `totalScore`, `level`, `dimensions` (array of `{ name, score, weight, evidence }`)
  2. Return `JSON.stringify(report, null, 2)` — valid, pretty-printed JSON
  3. Include JSDoc `@typedef` for `AssessmentReport` and `DimensionResult` to document the schema

  **Test cases:**
  - Returns valid JSON (parseable by `JSON.parse`)
  - Output contains all required top-level fields: version, timestamp, mode, totalScore, level, dimensions
  - Each dimension in the output contains: name, score, weight, evidence
  - Evidence is an array of strings
  - Round-trips correctly: `JSON.parse(formatJson(report))` deep-equals original report
  - Scores are numbers (not strings)
  - Level is a string matching `L[1-5]` pattern

### Task 2: Validate report before serialization
- **Files:** `lib/assess/output-json.mjs` (modify)
- **Tests:** `tests/lib/assess-output-json.test.mjs` (modify)
- **TDD:** RED — write test first, then implement
- **Description:**
  Add input validation to `formatJson` to handle the error case from the spec. The function should:
  1. Throw an error with message `"No assessment results to output"` and code `"NO_RESULTS"` when `report` is null, undefined, or missing required fields
  2. Validate that `dimensions` is a non-empty array
  3. Validate that `totalScore` is a number between 0 and 100
  4. Validate that `level` is one of L1-L5

  **Test cases:**
  - Throws `"No assessment results to output"` when report is `null`
  - Throws `"No assessment results to output"` when report is `undefined`
  - Throws `"No assessment results to output"` when report is `{}`  (missing required fields)
  - Throws when `dimensions` is empty array
  - Throws when `totalScore` is not a number
  - Accepts a valid report with all fields present

### Task 3: Wire output-json into SKILL.md
- **Files:** `skills/assess/SKILL.md` (modify)
- **Tests:** `tests/lib/assess-output-json.test.mjs` (modify — add SKILL.md reference check)
- **TDD:** RED — write test first, then implement
- **Description:**
  Update the SKILL.md to reference the companion module `lib/assess/output-json.mjs` so that Claude knows to use `formatJson()` when `--output json` is specified. Add a note in the Process section (step 7) and Notes section that the companion module provides `formatJson` for JSON output.

  **Test cases:**
  - SKILL.md contains reference to `lib/assess/output-json.mjs`
  - SKILL.md mentions `formatJson` function

## File Structure

**Create:**
- `lib/assess/output-json.mjs` — JSON formatting function with JSDoc types
- `tests/lib/assess-output-json.test.mjs` — Unit tests

**Modify:**
- `skills/assess/SKILL.md` — Add companion module reference for JSON output

**Reference (read, do not modify):**
- `lib/assess/detect-mode.mjs` — Pattern reference for assess companion modules (if it exists)
- `lib/provider/interface.mjs` — Pattern reference for JSDoc typedef conventions

## Context Packets

### Task 1 Context
- Spec: `output-json.md` (Behaviors 1-4, JSON schema, Acceptance Criteria)
- Charter: `charter.md` (Domain Model — AssessmentReport, AssessmentResult entities)
- SKILL.md: JSON Output section (example JSON structure)

### Task 2 Context
- Spec: `output-json.md` (Error Cases — "No assessment results to output")
- Charter: `charter.md` (Invariants — score ranges, level derivation)

### Task 3 Context
- Spec: `output-json.md` (Behavior 4 — printed to stdout)
- SKILL.md: Process section, Notes section
- `detect-mode.plan.md` Task 3 — pattern for wiring companion modules into SKILL.md

## Parallelization

- Group A (sequential): Task 1 → Task 2 (both modify `lib/assess/output-json.mjs`)
- Group B (after Group A): Task 3 (depends on module existing)

---

## Quality Gates

- Tests pass: `npm test`
- All acceptance criteria from spec satisfied:
  - JSON output is valid and parseable
  - Contains all required fields (version, timestamp, mode, totalScore, level, dimensions)
  - Each dimension includes name, score, weight, evidence
  - No files are modified
