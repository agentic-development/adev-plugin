<!-- DO NOT EDIT statuses inline — see lifecycle log output-markdown.jsonl -->
# Plan: Output Markdown

## Spec Reference
- Spec: `.context-index/specs/features/adev:assess/output-markdown.spec.md`
- Charter: `.context-index/specs/features/adev:assess/charter.md`
- Review: PASS

## Overview

Implement a `lib/assess/format-markdown.mjs` module that takes an `AssessmentReport` object and produces a markdown scorecard string. The module is pure string construction with no file I/O. The SKILL.md already describes the output format; this plan creates the companion code that can be called programmatically and tested deterministically.

The eval test at `tests/evals/assess/assess.test.mjs` already contains inline markdown formatting logic (lines 451-469). This plan extracts and formalizes that into a reusable, tested module.

## Tasks

### Task 1: Create `scoreBar` helper — ASCII visual bar from a numeric score
- **Files:** `lib/assess/format-markdown.mjs` (create)
- **Tests:** `tests/lib/assess/format-markdown.test.mjs` (create)
- **TDD:** RED — write tests for `scoreBar(score)` returning a 10-character string of filled/empty blocks, then implement
- **Description:**
  - Export a `scoreBar(score)` function that takes a number 0-100 and returns a string like `████████░░` (10 chars total, filled blocks proportional to score, rounded to nearest integer of `score / 10`).
  - Edge cases: score 0 returns all empty, score 100 returns all filled, score 5 rounds to 1 filled.

### Task 2: Create `scoreIndicator` helper — emoji color from a numeric score
- **Files:** `lib/assess/format-markdown.mjs`
- **Tests:** `tests/lib/assess/format-markdown.test.mjs`
- **TDD:** RED — write tests for three thresholds (>=80 green, 50-79 yellow, <50 red), then implement
- **Description:**
  - Export a `scoreIndicator(score)` function returning the appropriate emoji: `🟢` for score >= 80, `🟡` for score 50-79, `🔴` for score < 50.
  - Boundary tests: 80 returns green, 79 returns yellow, 50 returns yellow, 49 returns red, 0 returns red, 100 returns green.

### Task 3: Create `maturityLabel` helper — human-readable level description
- **Files:** `lib/assess/format-markdown.mjs`
- **Tests:** `tests/lib/assess/format-markdown.test.mjs`
- **TDD:** RED — write tests mapping L1-L5 to their descriptions, then implement
- **Description:**
  - Export a `maturityLabel(level)` function that maps level strings to descriptions: L1 = "Initial", L2 = "Developing", L3 = "Defined", L4 = "Managed", L5 = "Optimized".
  - Returns the level and description formatted as `L4 - Managed`.

### Task 4: Create `formatMarkdown` main function — full scorecard from AssessmentReport
- **Files:** `lib/assess/format-markdown.mjs`
- **Tests:** `tests/lib/assess/format-markdown.test.mjs`
- **TDD:** RED — write test with a known AssessmentReport fixture, assert output contains header, table, summary section, then implement
- **Description:**
  - Export a `formatMarkdown(report)` function that takes an object `{ totalScore, level, mode, timestamp, dimensions }` where `dimensions` is an array of `{ name, score, weight, evidence }`.
  - Produces a markdown string with:
    1. `# Codebase Readiness Assessment` header
    2. `**Total Score:** X/100 (L# - Description)` line
    3. `**Mode:** raw|adev` line
    4. `**Assessed:** <timestamp>` line
    5. `## Dimensions` section with a markdown table: `| Dimension | Score | Indicator |` where Indicator includes the emoji and ASCII bar
  - Uses `scoreBar`, `scoreIndicator`, and `maturityLabel` helpers internally.

### Task 5: Handle error case — no assessment results
- **Files:** `lib/assess/format-markdown.mjs`
- **Tests:** `tests/lib/assess/format-markdown.test.mjs`
- **TDD:** RED — write test that `formatMarkdown(null)` and `formatMarkdown(undefined)` throw an error with message "No assessment results to output", then implement
- **Description:**
  - When `report` is null, undefined, or missing `dimensions`, throw an `Error` with message `"No assessment results to output"`.
  - This satisfies the spec's error case (error code 1 is handled by the caller, not this module).

### Task 6: Handle edge case — dimension names with special markdown characters
- **Files:** `lib/assess/format-markdown.mjs`
- **Tests:** `tests/lib/assess/format-markdown.test.mjs`
- **TDD:** RED — write test with dimension name containing `|` or `**`, assert output is still valid markdown table, then implement
- **Description:**
  - Addresses CON-1 from the architecture review (non-blocking suggestion).
  - Pipe characters in dimension names would break the markdown table. Escape `|` to `\|` in dimension name cells.
  - This is defensive coding; current dimension names are safe but the module should be robust.

### Task 7: Wire `formatMarkdown` into the eval test as a validation
- **Files:** `tests/evals/assess/assess.test.mjs`
- **Tests:** (self — this is a test file)
- **TDD:** RED — update the existing "Markdown output" test to import and use `formatMarkdown` instead of inline logic, assert same properties
- **Description:**
  - Replace the inline markdown generation in the eval test (lines 451-469) with a call to `formatMarkdown`.
  - This validates that the module produces the same output the eval was already testing.
  - Import `formatMarkdown` from `../../../lib/assess/format-markdown.mjs`.

## Dependency Order

```
Task 1 ──┐
Task 2 ──┼── Task 4 ── Task 7
Task 3 ──┘     │
               Task 5
Task 6 (independent, can be done any time after Task 4)
```

Tasks 1-3 are independent helpers and can be implemented in parallel. Task 4 depends on all three. Task 5 and 6 extend Task 4. Task 7 integrates the module into the existing eval test.

## Files Summary

| File | Action |
|------|--------|
| `lib/assess/format-markdown.mjs` | Create |
| `tests/lib/assess/format-markdown.test.mjs` | Create |
| `tests/evals/assess/assess.test.mjs` | Modify (Task 7) |
