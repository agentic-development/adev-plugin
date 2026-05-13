<!-- DO NOT EDIT statuses inline — see lifecycle log bundled-templates-cleanup.jsonl -->
# Implementation Plan: Bundled Templates Cleanup

> **Methodology:** adev
> **Charter:** .context-index/specs/features/domain-extensions/charter.md
> **Spec:** .context-index/specs/features/domain-extensions/bundled-templates-cleanup.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-11)
> **Platform:** JavaScript (ESM), Node.js, node:test

**Goal:** Remove data-engineering and process-automation from bundled templates and update `BUNDLED_DOMAIN_NAMES` to contain only `software`.

**Architecture:** Update `lib/domains/constants.mjs` to remove the two domain names from the constant. Delete `templates/domains/data-engineering/` and `templates/domains/process-automation/`. Update all tests that reference removed paths or the old constant values. This must run after extension packages are created (so the content exists in `extensions/`) but before extension install tests (so `BUNDLED_COLLISION` is no longer triggered).

---

## File Structure

**Modify:**
- `lib/domains/constants.mjs` — Remove data-engineering and process-automation from `BUNDLED_DOMAIN_NAMES`
- `tests/lib/domains/constants.test.mjs` — Update expectations
- `tests/lib/domains/domain-config.test.mjs` — Update or remove tests referencing removed bundled domains
- `tests/lib/domains/integration.test.mjs` — Update or remove tests referencing removed bundled domains

**Delete:**
- `templates/domains/data-engineering/` — 7 files
- `templates/domains/process-automation/` — 7 files

**Reference (read, do not modify):**
- `extensions/data-engineering/domain/` — Content now lives here
- `extensions/process-automation/domain/` — Content now lives here
- `lib/domains/domain-config.mjs` — Verify resolution behavior (not modified)

## Context Packets

### Task 1 Context
- Spec: `bundled-templates-cleanup.spec.md` (behavior 4)
- Source: `lib/domains/constants.mjs` (full read)
- Tests: `tests/lib/domains/constants.test.mjs` (full read)

### Task 2 Context
- Spec: `bundled-templates-cleanup.spec.md` (behaviors 1-3)

### Task 3 Context
- Spec: `bundled-templates-cleanup.spec.md` (behaviors 5-8)
- Tests: `tests/lib/domains/domain-config.test.mjs`, `tests/lib/domains/integration.test.mjs`
- Source: `lib/domains/domain-config.mjs` (loadDomainConfig behavior)

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3 (each builds on previous)

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Update BUNDLED_DOMAIN_NAMES constant | small | unit | data-engineering-extension Task 1, process-automation-extension Task 1 | 0 create, 2 modify |
| 2 | Delete bundled domain directories | small | unit | Task 1 | 0 create, 0 modify, 14 delete |
| 3 | Update domain tests | medium | unit | Task 1, Task 2 | 0 create, 3+ modify |

---

### Task 1: Update BUNDLED_DOMAIN_NAMES constant [specialist: none]

**Charter capability:** Bundled Templates Cleanup
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/domains/constants.mjs`
- Test: `tests/lib/domains/constants.test.mjs`

**Tests:** `tests/lib/domains/constants.test.mjs`

**Depends on:** data-engineering-extension Task 1, process-automation-extension Task 1 (extension packages must exist before removing bundled copies)

- [x] **Write failing test**

Update the test for `BUNDLED_DOMAIN_NAMES` to assert it contains only `["software"]`.

- [x] **Verify test fails**

Run: `node --test tests/lib/domains/constants.test.mjs`
Expected: FAIL — constant still has 3 values

- [x] **Implement**

In `lib/domains/constants.mjs`, update `BUNDLED_DOMAIN_NAMES` to contain only `"software"`. Remove `"data-engineering"` and `"process-automation"`.

- [x] **Verify test passes**

Run: `node --test tests/lib/domains/constants.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add lib/domains/constants.mjs tests/lib/domains/constants.test.mjs
git commit -m "refactor(domains): remove data-engineering and process-automation from BUNDLED_DOMAIN_NAMES"
```

### Task 2: Delete bundled domain directories [specialist: none]

**Charter capability:** Bundled Templates Cleanup
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Delete: `templates/domains/data-engineering/` (7 files)
- Delete: `templates/domains/process-automation/` (7 files)

**Tests:** `tests/lib/domains/constants.test.mjs` (verify only `software/` remains)

**Depends on:** Task 1

- [x] **Write failing test**

Add test asserting `templates/domains/` contains only the `software` subdirectory.

- [x] **Verify test fails**

Run: `node --test tests/lib/domains/constants.test.mjs`
Expected: FAIL — data-engineering and process-automation dirs still exist

- [x] **Implement**

```bash
rm -rf templates/domains/data-engineering templates/domains/process-automation
```

- [x] **Verify test passes**

Run: `node --test tests/lib/domains/constants.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add -A templates/domains/
git commit -m "refactor(domains): remove bundled data-engineering and process-automation templates"
```

### Task 3: Update domain tests [specialist: none]

**Charter capability:** Bundled Templates Cleanup
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `tests/lib/domains/domain-config.test.mjs`
- Modify: `tests/lib/domains/integration.test.mjs`
- Modify: any other test files referencing removed paths

**Tests:** All files in `tests/lib/domains/`

**Depends on:** Task 1, Task 2

- [x] **Run full test suite to identify failures**

Run: `npm test`
Identify all tests that fail due to referencing removed bundled domains or template paths.

- [x] **Fix each failing test**

For each failure:
- Tests whose sole subject is a removed bundled path → delete the test
- Tests covering general resolution behavior → update to use `extensions/<name>/domain/` or test with `software` only
- Tests asserting `BUNDLED_DOMAIN_NAMES` contains 3 entries → update to expect 1

- [x] **Verify all tests pass**

Run: `npm test`
Expected: PASS (all tests)

- [x] **Commit**

```bash
git add tests/
git commit -m "test(domains): update tests for bundled templates cleanup"
```

---

## Quality Gates

- Tests pass: `npm test`
- All acceptance criteria from spec satisfied
