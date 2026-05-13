<!-- DO NOT EDIT statuses inline — see lifecycle log process-automation-extension.jsonl -->
# Implementation Plan: Process Automation Extension

> **Methodology:** adev
> **Charter:** .context-index/specs/features/domain-extensions/charter.md
> **Spec:** .context-index/specs/features/domain-extensions/process-automation-extension.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-11)
> **Platform:** JavaScript (ESM), Node.js, node:test

**Goal:** Package the process-automation domain profile as an installable extension in `extensions/process-automation/`.

**Architecture:** Same structure as the data-engineering extension. Create `extensions/process-automation/` with `adev-extension.yaml` and `domain/` containing 7 profile files from `templates/domains/process-automation/`. Declares `extends: software`.

---

## File Structure

**Create:**
- `extensions/process-automation/adev-extension.yaml` — Extension manifest
- `extensions/process-automation/domain/` — 7 domain profile files
- `extensions/process-automation/README.md` — Extension description and install instructions
- `tests/extensions/process-automation.test.mjs` — Integration tests

**Reference (read, do not modify):**
- `templates/domains/process-automation/` — Source content
- `extensions/data-engineering/` — Sibling extension (follow same structure)

## Context Packets

### Task 1 Context
- Spec: `process-automation-extension.spec.md` (behaviors 1-2, 7)
- Source: `templates/domains/process-automation/*` (content to copy)
- Sibling: `extensions/data-engineering/adev-extension.yaml` (follow same manifest pattern)

### Task 2 Context
- Spec: `process-automation-extension.spec.md` (behaviors 3-6)
- Source: `lib/extensions/install.mjs`, `lib/domains/domain-config.mjs`

## Parallelization

- Group A (sequential): Task 1 → Task 2

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Create extension package | small | unit | — | 10 create |
| 2 | Install and resolution integration test | medium | unit | Task 1 | 1 create |

---

### Task 1: Create extension package [specialist: none]

**Charter capability:** Process Automation Extension
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `extensions/process-automation/adev-extension.yaml`
- Create: `extensions/process-automation/domain/` (7 files)
- Create: `extensions/process-automation/README.md`

**Tests:** `tests/extensions/process-automation.test.mjs`

- [x] **Write failing test**

Test that `extensions/process-automation/adev-extension.yaml` exists and passes `parseExtensionManifest()`. Test `domain/` contains 7 files.

- [x] **Verify test fails**

Run: `node --test tests/extensions/process-automation.test.mjs`
Expected: FAIL

- [x] **Implement**

1. Create `extensions/process-automation/` directory
2. Write `adev-extension.yaml`:
   ```yaml
   name: process-automation
   version: 0.1.0
   description: Domain profile for workflow automation, RPA, and event-driven processes
   author: adev-org
   requires:
     adev: ">=0.22.0"
   provides:
     domain-profile:
       path: domain
       extends: software
   ```
3. Copy 7 files from `templates/domains/process-automation/` to `extensions/process-automation/domain/`
4. Write `README.md`

- [x] **Verify test passes**

Run: `node --test tests/extensions/process-automation.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add extensions/process-automation/ tests/extensions/process-automation.test.mjs
git commit -m "feat(domain-extensions): create process-automation extension package"
```

### Task 2: Install and resolution integration test [specialist: none]

**Charter capability:** Process Automation Extension
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create/Modify: `tests/extensions/process-automation.test.mjs`

**Tests:** `tests/extensions/process-automation.test.mjs`

**Depends on:** Task 1, bundled-templates-cleanup

- [x] **Write failing tests**

1. `installExtension("./extensions/process-automation", tempProjectRoot)` succeeds
2. `domain.yaml` exists with `extends: software`
3. `loadDomainConfig("process-automation", "reviewers", ...)` returns `integration-reviewer`
4. Re-install is idempotent

- [x] **Verify tests fail** → **Implement** (no code, tests exercise pipeline) → **Verify pass** → **Commit**

```bash
git add tests/extensions/process-automation.test.mjs
git commit -m "test(domain-extensions): add install tests for process-automation extension"
```

---

## Quality Gates

- Tests pass: `npm test`
- All acceptance criteria from spec satisfied
