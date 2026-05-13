<!-- DO NOT EDIT statuses inline — see lifecycle log data-engineering-extension.jsonl -->
# Implementation Plan: Data Engineering Extension

> **Methodology:** adev
> **Charter:** .context-index/specs/features/domain-extensions/charter.md
> **Spec:** .context-index/specs/features/domain-extensions/data-engineering-extension.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-11)
> **Platform:** JavaScript (ESM), Node.js, node:test

**Goal:** Package the data-engineering domain profile as an installable extension in `extensions/data-engineering/`.

**Architecture:** Create an `extensions/data-engineering/` directory with `adev-extension.yaml` manifest and a `domain/` subdirectory containing the 7 profile files copied from `templates/domains/data-engineering/`. The manifest declares `provides.domain-profile` with `extends: software`. Integration tests verify install and domain resolution.

---

## File Structure

**Create:**
- `extensions/data-engineering/adev-extension.yaml` — Extension manifest
- `extensions/data-engineering/domain/charter-template.md` — Charter template for data engineering
- `extensions/data-engineering/domain/spec-template.md` — Spec template for data engineering
- `extensions/data-engineering/domain/reviewers.yaml` — Domain-specific reviewers
- `extensions/data-engineering/domain/gates.yaml` — Domain-specific quality gates
- `extensions/data-engineering/domain/verification.yaml` — Verification config
- `extensions/data-engineering/domain/gate-config.yaml` — Gate config (exclusions, allowed commands)
- `extensions/data-engineering/domain/test-config.yaml` — Test config (permitted tools, skip patterns)
- `extensions/data-engineering/README.md` — Extension description and install instructions
- `tests/extensions/data-engineering.test.mjs` — Integration tests

**Reference (read, do not modify):**
- `templates/domains/data-engineering/` — Source content (copy from here)
- `lib/extensions/manifest-schema.mjs` — Manifest validation API
- `lib/extensions/install.mjs` — Install pipeline
- `lib/domains/domain-config.mjs` — Domain resolution

## Context Packets

### Task 1 Context
- Spec: `data-engineering-extension.spec.md` (behaviors 1-2, 7)
- Source: `templates/domains/data-engineering/*` (content to copy)
- Reference: existing extension manifests or test fixtures in `tests/lib/extensions/`

### Task 2 Context
- Spec: `data-engineering-extension.spec.md` (behaviors 3-6)
- Source: `lib/extensions/install.mjs` (install API)
- Source: `lib/domains/domain-config.mjs` (loadDomainConfig API)
- Tests: `tests/lib/extensions/install.test.mjs` (test patterns)

## Parallelization

- Group A (sequential): Task 1 → Task 2 (Task 2 tests Task 1's output)

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Create extension package | small | unit | — | 10 create |
| 2 | Install and resolution integration test | medium | unit | Task 1 | 1 create |

---

### Task 1: Create extension package [specialist: none]

**Charter capability:** Data Engineering Extension
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `extensions/data-engineering/adev-extension.yaml`
- Create: `extensions/data-engineering/domain/` (7 files)
- Create: `extensions/data-engineering/README.md`

**Tests:** `tests/extensions/data-engineering.test.mjs`

- [x] **Write failing test**

Test that `extensions/data-engineering/adev-extension.yaml` exists and passes `parseExtensionManifest()` validation. Test that `domain/` contains exactly 7 expected files.

- [x] **Verify test fails**

Run: `node --test tests/extensions/data-engineering.test.mjs`
Expected: FAIL — directory does not exist

- [x] **Implement**

1. Create `extensions/data-engineering/` directory
2. Write `adev-extension.yaml`:
   ```yaml
   name: data-engineering
   version: 0.1.0
   description: Domain profile for data pipelines, ETL, dbt, and data quality workflows
   author: adev-org
   requires:
     adev: ">=0.22.0"
   provides:
     domain-profile:
       path: domain
       extends: software
   ```
3. Copy all 7 files from `templates/domains/data-engineering/` to `extensions/data-engineering/domain/`
4. Write `README.md` with extension name, description, and install command

- [x] **Verify test passes**

Run: `node --test tests/extensions/data-engineering.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add extensions/data-engineering/ tests/extensions/data-engineering.test.mjs
git commit -m "feat(domain-extensions): create data-engineering extension package"
```

### Task 2: Install and resolution integration test [specialist: none]

**Charter capability:** Data Engineering Extension
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create/Modify: `tests/extensions/data-engineering.test.mjs`

**Tests:** `tests/extensions/data-engineering.test.mjs`

**Depends on:** Task 1, bundled-templates-cleanup (BUNDLED_DOMAIN_NAMES must not contain "data-engineering")

- [x] **Write failing tests**

Add tests:
1. `installExtension("./extensions/data-engineering", tempProjectRoot)` succeeds
2. After install, `domain.yaml` exists at `.context-index/domains/data-engineering/` with `extends: software`
3. `loadDomainConfig("data-engineering", "reviewers", ...)` returns config with `data-contract-reviewer`
4. Re-install is idempotent — no duplicate manifest stamps
5. Domain profile files in extension are content-identical to `templates/domains/data-engineering/`

- [x] **Verify tests fail**

Run: `node --test tests/extensions/data-engineering.test.mjs`
Expected: FAIL — BUNDLED_COLLISION (if cleanup not yet applied) or resolution failures

- [x] **Implement**

No code changes needed — tests exercise existing pipeline against the extension package. If tests fail due to BUNDLED_COLLISION, this task is blocked until bundled-templates-cleanup is complete.

- [x] **Verify tests pass**

Run: `node --test tests/extensions/data-engineering.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add tests/extensions/data-engineering.test.mjs
git commit -m "test(domain-extensions): add install and resolution tests for data-engineering extension"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite.

- Tests pass: `npm test`
- All acceptance criteria from spec satisfied
