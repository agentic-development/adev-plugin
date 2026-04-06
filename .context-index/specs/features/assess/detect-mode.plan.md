# Plan: Detect Mode

## Spec Reference
- Spec: `.context-index/specs/features/adev:assess/detect-mode.md`
- Charter: `.context-index/specs/features/adev:assess/charter.md`
- Review: PASS

## Overview

Implement the detect-mode companion module for the adev:assess skill. This module auto-detects whether a target directory is an adev-configured project (has `.context-index/`) or a raw codebase, and resolves the assessment mode accordingly. It also supports explicit `--mode raw|adev` overrides.

The module lives in `lib/assess/` as companion code to the `skills/assess/SKILL.md` skill, following the project convention that skills are markdown with optional companion code in `lib/`.

## Tasks

### Task 1: Create `detectMode` function
- **Files:** `lib/assess/detect-mode.mjs` (create)
- **Tests:** `tests/lib/assess-detect-mode.test.mjs` (create)
- **TDD:** RED — write test first, then implement
- **Description:**
  Create a `detectMode(targetDir, explicitMode)` function that:
  1. If `explicitMode` is `"raw"`, returns `{ mode: "raw", warning: null }`.
  2. If `explicitMode` is `"adev"`, checks for `.context-index/` in `targetDir`. Returns `{ mode: "adev", warning: null }` if present, or `{ mode: "adev", warning: "..." }` if missing.
  3. If `explicitMode` is `undefined`/`null`, auto-detects: returns `"adev"` if `.context-index/` exists, `"raw"` otherwise.

  Uses only `fs.existsSync` and `path.join` (Node.js built-ins). Pure function with no side effects beyond the filesystem check.

  **Test cases:**
  - Auto-detect returns `"adev"` when `.context-index/` exists in temp dir
  - Auto-detect returns `"raw"` when `.context-index/` does not exist
  - Explicit `--mode raw` returns `"raw"` even when `.context-index/` exists
  - Explicit `--mode adev` returns `"adev"` with no warning when `.context-index/` exists
  - Explicit `--mode adev` returns `"adev"` with warning string when `.context-index/` missing
  - Uses `createTempDir`/`cleanupTempDir`/`writeFixture` from test helpers

### Task 2: Create `getDimensions` function
- **Files:** `lib/assess/detect-mode.mjs` (modify — add export)
- **Tests:** `tests/lib/assess-detect-mode.test.mjs` (modify — add test cases)
- **TDD:** RED — write test first, then implement
- **Description:**
  Add a `getDimensions(mode)` function that returns the list of dimension names applicable to the resolved mode:
  1. Mode `"raw"` returns the 8 structural dimension names.
  2. Mode `"adev"` returns all 11 dimension names (8 structural + 3 adev-specific).

  This codifies the dimension sets defined in the SKILL.md and charter, making them available programmatically for downstream assessment tasks.

  **Test cases:**
  - `getDimensions("raw")` returns exactly 8 dimension names matching the spec
  - `getDimensions("adev")` returns exactly 11 dimension names
  - `getDimensions("adev")` includes all 8 structural dimensions plus 3 adev-specific ones
  - Returned arrays contain the exact names from the SKILL.md (e.g., "Test Infrastructure", "Adev Context Index")

### Task 3: Wire detect-mode into SKILL.md process section
- **Files:** `skills/assess/SKILL.md` (modify)
- **Tests:** `tests/skills/assess.test.mjs` (modify — add test case)
- **TDD:** RED — write test first, then implement
- **Description:**
  Update the SKILL.md Process section (step 1) to reference the companion module `lib/assess/detect-mode.mjs` so that Claude knows to use `detectMode()` when executing the skill. Add a note in the skill's Notes section that the companion module provides `detectMode` and `getDimensions` for programmatic use.

  Update the existing skill test to verify the SKILL.md references the companion module path.

  **Test cases:**
  - SKILL.md contains reference to `lib/assess/detect-mode.mjs`
  - SKILL.md mentions `detectMode` function
