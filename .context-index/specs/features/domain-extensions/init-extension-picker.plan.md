<!-- DO NOT EDIT statuses inline — see lifecycle log init-extension-picker.jsonl -->
# Implementation Plan: Init-Time Domain Extension Picker

> **Methodology:** adev
> **Charter:** .context-index/specs/features/domain-extensions/charter.md (revision 3)
> **Spec:** .context-index/specs/features/domain-extensions/init-extension-picker.spec.md (revision 2)
> **Review:** PASS (2026-05-20, rev 2 re-review — all 18 prior findings resolved, zero new findings)
> **Platform:** JavaScript (ESM), Node.js, node:test
> **Milestone:** v2

**Goal:** Surface installed first-party domain extensions at `adev install` / `adev upgrade` time via a catalog-driven picker that reuses the existing `installExtension()` pipeline and writes the chosen domain into `manifest.yaml`.

**Architecture:** A new helper module `lib/cli/domain-extension-picker.mjs` owns catalog loading + validation, the picker prompt, and dispatch to the existing `installExtension()` pipeline. Two new error-code constants live in `lib/cli/picker-errors.mjs`. The catalog is a single canonical static JSON file shipped at `templates/extensions-catalog.json`. The CLI verbs `cmdInstall()` (the `install` verb, which subsumes legacy `init`) and `cmdUpgrade()` call the picker after the providers step and before context-index scaffold. Workspace-mode behavior is governed by ADR-0005: writes pass `assertPathInWorkspace()`; at workspace root (no `currentRepoSlug`) the picker is skipped silently.

> **CLI verb naming note.** The spec refers to `cmdInit()` and `cmdUpgrade()` as a documentation shorthand. In the current CLI implementation, the `init` verb is deprecated and routes to `cmdInstall()` (see `cli/index.mjs:1307-1309`). All wiring in this plan targets the live function names: `cmdInstall()` for first-time setup and `cmdUpgrade()` for re-runs. The behavioral surface (single picker prompt at `install` and `upgrade` time) is unchanged.

---

## File Structure

**Create:**
- `templates/extensions-catalog.json` — First-party catalog (canonical source).
- `lib/cli/domain-extension-picker.mjs` — Picker helper (catalog load + validation + prompt + dispatch).
- `lib/cli/picker-errors.mjs` — `PICKER_*` error-code constants.
- `tests/cli/init-extension-picker.test.mjs` — Integration tests.
- `tests/lib/cli/domain-extension-picker.test.mjs` — Unit tests for the helper module.

**Modify:**
- `cli/index.mjs` — Wire picker into `cmdInstall()` and `cmdUpgrade()`; print the `Domain: <name>` completion banner.
- `templates/manifest-template.yaml` — Expose `domain:` key as a commented placeholder.
- `skills/init/SKILL.md` — Add picker-walkthrough section using canonical `Domain: <name>` wording.
- `.context-index/specs/features/domain-extensions/charter.md` — Bump to revision 4; add Domain Model note for the top-level `domain:` key; flip Capability Map row "Init-Time Domain Extension Picker" status to `planned` (then `implemented` on validation).

**Reference (read, do not modify):**
- `.context-index/specs/features/domain-extensions/init-extension-picker.spec.md` — Behavioral contract, Catalog Contract, Module Impact Map.
- `.context-index/adrs/0005-workspace-isolation-invariant.md` — Workspace write-containment invariant.
- `lib/extensions/install.mjs` — `installExtension()`, `writeManifestStamp()`, `readManifestStamps()`.
- `lib/extensions/resolve-source.mjs` — `stripCredentials()` (URI sanitization), path-traversal guard pattern.
- `lib/extensions/manifest-schema.mjs` — `parseExtensionManifest()` (canonical name regex source).
- `lib/workspace.mjs` — `detectWorkspace()`, `assertPathInWorkspace()`.
- `extensions/data-engineering/` and `extensions/process-automation/` — First-party catalog targets that already exist on disk.
- `tests/lib/extensions/install.test.mjs` — Pattern for install-pipeline integration tests.
- `tests/cli-extension.test.mjs` — Pattern for CLI-surface extension tests.

## Context Packets

### Task 1 Context (Catalog file)
- Spec: `init-extension-picker.spec.md` (§ Catalog Contract, Behavior #1, Acceptance Criteria for catalog validation)
- Reference: `extensions/data-engineering/adev-extension.yaml`, `extensions/process-automation/adev-extension.yaml` (live targets the catalog must resolve to)
- Reference: `templates/adev-extension.example.yaml` (canonical shape)

### Task 2 Context (Picker error codes)
- Spec: `init-extension-picker.spec.md` (§ Error Cases — code-naming convention + four new `PICKER_*` codes)
- Reference: `lib/extensions/install.mjs` (existing error-code surface: `BUNDLED_COLLISION`, `INVALID_SCHEMA`, `MISSING_MANIFEST`, `INCOMPATIBLE_VERSION`)
- Reference: `lib/extensions/resolve-source.mjs` (existing `SOURCE_RESOLUTION` code, `stripCredentials()` export)

### Task 3 Context (Picker helper — catalog load + validation)
- Spec: `init-extension-picker.spec.md` (§ Catalog Contract — schema + validation rules; Behavior #1; SEC-1 resolution)
- Reference: `lib/extensions/manifest-schema.mjs::parseExtensionManifest` (source of the canonical name regex `^[a-z][a-z0-9-]*$`)
- Reference: `lib/extensions/resolve-source.mjs::resolveGit` (path-traversal guard pattern to mirror)
- Reference: `templates/extensions-catalog.json` (created in Task 1)

### Task 4 Context (Picker helper — prompt + dispatch)
- Spec: `init-extension-picker.spec.md` (Behaviors #1, #2, #3, #5, #6, #7; Acceptance Criteria for each picker choice)
- Reference: `cli/index.mjs::ask()` (existing prompt helper used elsewhere)
- Reference: `lib/extensions/install.mjs::installExtension` (callee — exact signature `(resolvedPath, projectRoot, opts)`)
- Reference: `lib/extensions/install.mjs::readManifestStamps` (used to detect existing `domain-profile` install)
- Reference: `lib/extensions/resolve-source.mjs::stripCredentials` (URI sanitization on error paths — SEC-2)

### Task 5 Context (Workspace-mode guard)
- Spec: `init-extension-picker.spec.md` (Preconditions — Workspace-mode constraint; Behaviors §SA-2 resolution)
- ADR: `0005-workspace-isolation-invariant.md` (Decision rules 1, 2, 4 — `detectWorkspace`, write containment, `assertPathInWorkspace`)
- Reference: `lib/workspace.mjs::detectWorkspace`, `lib/workspace.mjs::assertPathInWorkspace`

### Task 6 Context (Manifest `domain:` writer)
- Spec: `init-extension-picker.spec.md` (Behaviors #2, #3, #5 — write/preserve semantics; Postconditions)
- Reference: `lib/extensions/install.mjs::writeManifestStamp` (manifest-write precedent — idempotent upsert pattern)
- Reference: `lib/manifest.mjs::loadManifest` (read side — already supports a top-level `domain:` key)

### Task 7 Context (Wire into `cmdInstall()` and `cmdUpgrade()`)
- Spec: `init-extension-picker.spec.md` (Behaviors #1, #4, #5, #6; Integration Points #1, #3)
- Reference: `cli/index.mjs::cmdInstall` (insertion point — after providers step, before context-index scaffold)
- Reference: `cli/index.mjs::cmdUpgrade` (insertion point — same position relative to providers + scaffold)

### Task 8 Context (Completion banner)
- Spec: `init-extension-picker.spec.md` (Behavior #6; CON-1 resolution — single canonical `Domain: <name>` wording)
- Reference: `cli/index.mjs` install-summary / banner section

### Task 9 Context (`manifest-template.yaml` placeholder)
- Spec: `init-extension-picker.spec.md` (Module Impact Map row for `templates/manifest-template.yaml`)
- Reference: `templates/manifest-template.yaml` (current shape)

### Task 10 Context (Update `skills/init/SKILL.md`)
- Spec: `init-extension-picker.spec.md` (Behavior #8; Integration Point #4 — SKILL.md ↔ CLI must stay in lockstep)
- Reference: `skills/init/SKILL.md` (current structure)

### Task 11 Context (Integration test file)
- Spec: `init-extension-picker.spec.md` (Acceptance Criteria — full list, especially the new-integration-test bullet enumerating required coverage)
- Reference: `tests/lib/extensions/install.test.mjs` (test patterns — temp project root, install + assert)
- Reference: `tests/cli-extension.test.mjs` (CLI-surface test patterns — spawn CLI subprocess, capture stdout)
- Reference: `tests/helpers.mjs` (`createTempDir()`, `cleanupTempDir()`, `writeFixture()`, `runHook()` — established test scaffolding)

### Task 12 Context (Charter Domain Model note + Capability Map status flip)
- Spec: `init-extension-picker.spec.md` (Acceptance Criteria — charter revision 3 / out-of-scope line removal; Module Impact Map row for `manifest.yaml` cross-references the pending charter update)
- Reference: `.context-index/specs/features/domain-extensions/charter.md` (current revision 3)

## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `/adev:implement` reads from the live heuristic store.

### Heuristic: First-run PASS: Data Engineering Extension (confidence: medium)
- **Pattern:** When restructuring bundled content into installable extensions, preserve domain config files by copying into extensions/<name>/domain/ before removing the templates/domains/<name>/ source; integration tests must exercise installExtension end-to-end and call loadDomainConfig to confirm resolution returns the domain-specific reviewer (not the software default).
- **Evidence:** 1 observation
- **Relevance to this plan:** The integration test in Task 11 exercises `installExtension()` end-to-end against the picker-resolved source path and confirms `loadDomainConfig()` returns the extension's domain-specific reviewer.

### Heuristic: First-run PASS: Process Automation Extension (confidence: medium)
- **Pattern:** A second domain-extension package (process-automation) validated cleanly using the same structural pattern as data-engineering: extensions/<name>/{adev-extension.yaml, domain/, README.md}, install via local path, verify loadDomainConfig returns the domain-specific reviewer.
- **Evidence:** 1 observation
- **Relevance to this plan:** Validates the picker's catalog choice for `process-automation` parallels `data-engineering` — Task 11 reuses the same test scaffolding for both entries.

## Parallelization

- **Group A (sequential):** Task 1 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7 → Task 8 (shared concern: catalog → helper → picker dispatch → CLI wiring; each step depends on the prior file landing).
- **Group B (independent):** Task 2 (Picker error codes — standalone constants module, no overlap with Group A files).
- **Group C (independent):** Task 9 (`templates/manifest-template.yaml` placeholder — single-file, no overlap).
- **Group D (sequential after Group A):** Task 10 (`skills/init/SKILL.md`) → Task 11 (integration tests) → Task 12 (charter update). Task 10 needs the final banner wording locked in by Task 8; Task 11 exercises the wired-in CLI; Task 12 is a charter bookkeeping update timed for after the plan body lands.

Groups B and C can run in parallel with Group A. Group D is sequential after Group A. The natural execution order is: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12.

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Define first-party catalog (`templates/extensions-catalog.json`) | small | unit | — | 1 create |
| 2 | Declare `PICKER_*` error codes (`lib/cli/picker-errors.mjs`) | small | unit | — | 1 create |
| 3 | Picker helper: catalog load + validation (`lib/cli/domain-extension-picker.mjs` part 1) | medium | unit | Task 1, Task 2 | 1 create, 1 create (test) |
| 4 | Picker helper: prompt + dispatch (`lib/cli/domain-extension-picker.mjs` part 2) | medium | unit | Task 3 | 0 create, 1 modify, 1 modify (test) |
| 5 | Workspace-mode guard in picker helper | small | unit | Task 4 | 0 create, 1 modify, 1 modify (test) |
| 6 | Manifest `domain:` writer in picker helper | small | unit | Task 4 | 0 create, 1 modify, 1 modify (test) |
| 7 | Wire picker into `cmdInstall()` and `cmdUpgrade()` | medium | unit | Task 4, Task 5, Task 6 | 0 create, 1 modify |
| 8 | `Domain: <name>` completion banner | small | unit | Task 7 | 0 create, 1 modify |
| 9 | Expose `domain:` placeholder in `templates/manifest-template.yaml` | small | unit | — | 0 create, 1 modify |
| 10 | Update `skills/init/SKILL.md` picker walkthrough | small | unit | Task 8 | 0 create, 1 modify |
| 11 | Integration test (`tests/cli/init-extension-picker.test.mjs`) | medium | unit | Task 7, Task 8 | 1 create |
| 12 | Charter revision 4: Domain Model note + Capability Map status flip | small | unit | Task 7 | 0 create, 1 modify |

---

### Task 1: Define first-party catalog (`templates/extensions-catalog.json`) [specialist: none]

**Routing:** auto-agent (score: 19/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=5
**Rationale:** Single-file static JSON catalog with literal schema spelled out in the spec and inline plan body; pure pattern application with minimal blast radius.

**Charter capability:** Init-Time Domain Extension Picker
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `templates/extensions-catalog.json`

**Tests:** covered by Task 3 (catalog loader test asserts file is present, parses as JSON, and conforms to the v1 schema).

**Context to load:**
- Spec: § Catalog Contract, Module Impact Map row for `templates/extensions-catalog.json`
- Reference: `extensions/data-engineering/adev-extension.yaml`, `extensions/process-automation/adev-extension.yaml`

- [ ] **Write failing test**

Add (in Task 3's helper test) a `describe('catalog file shape')` block asserting `templates/extensions-catalog.json` exists and parses to `{ version: 1, entries: [...] }` with entries for `data-engineering` and `process-automation` whose `path` values resolve to existing directories under the plugin root.

- [ ] **Verify test fails**

Run: `node --test tests/lib/cli/domain-extension-picker.test.mjs`
Expected: FAIL — file does not exist.

- [ ] **Implement**

Create `templates/extensions-catalog.json`:
```json
{
  "version": 1,
  "entries": [
    {
      "name": "data-engineering",
      "label": "Data Engineering",
      "description": "Pipelines, ETL, dbt, data quality workflows",
      "path": "extensions/data-engineering"
    },
    {
      "name": "process-automation",
      "label": "Process Automation",
      "description": "Workflow automation, RPA, and event-driven processes",
      "path": "extensions/process-automation"
    }
  ]
}
```

Note: `software` is the default/bundled domain and is presented by the picker as a synthetic first entry — it does NOT appear in the catalog file (no `extensions/software/` directory exists; `software` is the bundled-template fallback).

- [ ] **Verify test passes**

Run: `node --test tests/lib/cli/domain-extension-picker.test.mjs`
Expected: PASS for the catalog-file-shape block.

- [ ] **Commit**

Branch: `feat/domain-extensions/init-extension-picker`

```bash
git add templates/extensions-catalog.json
git commit -m "feat(domain-extensions): add first-party extensions catalog

Spec: .context-index/specs/features/domain-extensions/init-extension-picker.spec.md
Plan-task: 1"
```

---

### Task 2: Declare `PICKER_*` error codes (`lib/cli/picker-errors.mjs`) [specialist: none]

**Routing:** auto-agent (score: 20/20)
**Scores:** spec=5 pattern=5 blast=5 novelty=5
**Rationale:** Trivial constants module with exact string values enumerated in the spec and plan; existing `lib/extensions/install.mjs` error-code style is a direct precedent.

**Charter capability:** Init-Time Domain Extension Picker
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/cli/picker-errors.mjs`

**Tests:** covered by Task 3 (helper test imports the codes and asserts their exact string values).

**Context to load:**
- Spec: § Error Cases — code-naming convention preamble + four new `PICKER_*` rows
- Reference: `lib/extensions/install.mjs` (existing error-code style — `err.code = 'INVALID_SCHEMA'`)

- [ ] **Write failing test**

Add (in Task 3's helper test) a `describe('picker error codes')` block:
```javascript
import { PICKER_CATALOG_ENTRY_MISSING, PICKER_USER_ABORTED, PICKER_MANIFEST_WRITE_FAILED, PICKER_CATALOG_PARSE_FAILED } from '<root>/lib/cli/picker-errors.mjs';

it('exports the four PICKER_* codes with stable string values', () => {
  assert.strictEqual(PICKER_CATALOG_ENTRY_MISSING, 'PICKER_CATALOG_ENTRY_MISSING');
  assert.strictEqual(PICKER_USER_ABORTED, 'PICKER_USER_ABORTED');
  assert.strictEqual(PICKER_MANIFEST_WRITE_FAILED, 'PICKER_MANIFEST_WRITE_FAILED');
  assert.strictEqual(PICKER_CATALOG_PARSE_FAILED, 'PICKER_CATALOG_PARSE_FAILED');
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/cli/domain-extension-picker.test.mjs`
Expected: FAIL — module not found / exports missing.

- [ ] **Implement**

Create `lib/cli/picker-errors.mjs`:
```javascript
/**
 * Error codes for the init-time domain-extension picker.
 * New codes (PICKER_* prefix) declared here; reused pipeline codes
 * (SOURCE_RESOLUTION, INVALID_SCHEMA, BUNDLED_COLLISION) come from
 * lib/extensions/install.mjs and lib/extensions/resolve-source.mjs.
 *
 * @module lib/cli/picker-errors
 */

export const PICKER_CATALOG_ENTRY_MISSING = 'PICKER_CATALOG_ENTRY_MISSING';
export const PICKER_USER_ABORTED = 'PICKER_USER_ABORTED';
export const PICKER_MANIFEST_WRITE_FAILED = 'PICKER_MANIFEST_WRITE_FAILED';
export const PICKER_CATALOG_PARSE_FAILED = 'PICKER_CATALOG_PARSE_FAILED';
```

- [ ] **Verify test passes**

Run: `node --test tests/lib/cli/domain-extension-picker.test.mjs`
Expected: PASS for the picker-error-codes block.

- [ ] **Commit**

```bash
git add lib/cli/picker-errors.mjs
git commit -m "feat(domain-extensions): declare PICKER_* error codes for init picker

Spec: .context-index/specs/features/domain-extensions/init-extension-picker.spec.md
Plan-task: 2"
```

---

### Task 3: Picker helper — catalog load + validation [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=4
**Rationale:** Catalog Contract section gives explicit validation rules (name regex, path-traversal guard, existsSync), with `resolveGit` and `parseExtensionManifest` cited as exact precedent; small two-file blast radius.

**Charter capability:** Init-Time Domain Extension Picker
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/cli/domain-extension-picker.mjs` (initial scaffold + `loadCatalog()` + `validateEntries()`)
- Create: `tests/lib/cli/domain-extension-picker.test.mjs`

**Tests:** `tests/lib/cli/domain-extension-picker.test.mjs`

**Depends on:** Task 1, Task 2

**Context to load:**
- Spec: § Catalog Contract — schema + validation rules; SEC-1 resolution
- Reference: `lib/extensions/manifest-schema.mjs::parseExtensionManifest` (canonical name regex source)
- Reference: `lib/extensions/resolve-source.mjs::resolveGit` (path-traversal guard pattern)

- [ ] **Write failing test**

Add to `tests/lib/cli/domain-extension-picker.test.mjs`:
```javascript
describe('loadCatalog', () => {
  it('reads and parses templates/extensions-catalog.json', async () => {
    const { loadCatalog } = await import('../../../lib/cli/domain-extension-picker.mjs');
    const catalog = loadCatalog(pluginRoot);
    assert.strictEqual(catalog.version, 1);
    assert.ok(Array.isArray(catalog.entries));
    assert.ok(catalog.entries.some(e => e.name === 'data-engineering'));
  });

  it('throws PICKER_CATALOG_PARSE_FAILED when file is malformed', async () => {
    // ...write a fake malformed catalog in a temp pluginRoot and assert err.code
  });
});

describe('validateEntries', () => {
  it('drops entries whose name fails the [a-z][a-z0-9-]* regex', () => { /* ... */ });
  it('drops entries whose resolved path escapes the plugin root (path-traversal)', () => { /* ... */ });
  it('drops entries whose resolved path does not exist on disk', () => { /* ... */ });
  it('returns each drop reason as PICKER_CATALOG_ENTRY_MISSING in an advisory log array', () => { /* ... */ });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/cli/domain-extension-picker.test.mjs`
Expected: FAIL — `loadCatalog`/`validateEntries` exports missing.

- [ ] **Implement**

Create `lib/cli/domain-extension-picker.mjs` with:
- `loadCatalog(pluginRoot)` — reads `templates/extensions-catalog.json`, parses JSON, throws `Error` with `code = PICKER_CATALOG_PARSE_FAILED` on file-missing or JSON-syntax error.
- `validateEntries(catalog, pluginRoot)` — returns `{ valid: Entry[], advisories: { code, name, reason }[] }`. Drops entries failing the name regex (`^[a-z][a-z0-9-]*$`), path-traversal (`path.resolve(pluginRoot, entry.path)` must start with `pluginRoot + sep`), or missing-on-disk (`existsSync(resolvedPath) === false`). Each drop produces a `{ code: 'PICKER_CATALOG_ENTRY_MISSING', name, reason }` advisory.
- Internal constant `NAME_REGEX` lifted from `parseExtensionManifest` for byte-identical match (or re-exported if `manifest-schema.mjs` already exports it; otherwise define locally and add an inline comment referencing the canonical source).

- [ ] **Verify test passes**

Run: `node --test tests/lib/cli/domain-extension-picker.test.mjs`
Expected: PASS.

- [ ] **Commit**

```bash
git add lib/cli/domain-extension-picker.mjs tests/lib/cli/domain-extension-picker.test.mjs
git commit -m "feat(domain-extensions): add picker catalog loader and entry validation

Spec: .context-index/specs/features/domain-extensions/init-extension-picker.spec.md
Plan-task: 3"
```

---

### Task 4: Picker helper — prompt + dispatch [specialist: none]

**Routing:** auto-agent (score: 16/20)
**Scores:** spec=5 pattern=3 blast=4 novelty=4
**Rationale:** Behaviors #1-#7 spell out each prompt outcome and dispatch contract; DI-style test seam is novel but the `ask`/`installExtension` helpers exist; touches two files in one module.

**Charter capability:** Init-Time Domain Extension Picker
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/cli/domain-extension-picker.mjs` (add `runPicker()` + dispatch to `installExtension()`)
- Modify: `tests/lib/cli/domain-extension-picker.test.mjs`

**Tests:** `tests/lib/cli/domain-extension-picker.test.mjs`

**Depends on:** Task 3

**Context to load:**
- Spec: Behaviors #1, #2, #3, #5, #6, #7; Acceptance Criteria for picker choices
- Reference: `cli/index.mjs::ask()` (prompt helper pattern)
- Reference: `lib/extensions/install.mjs::installExtension` (callee signature)
- Reference: `lib/extensions/install.mjs::readManifestStamps` (existing-install detection)
- Reference: `lib/extensions/resolve-source.mjs::stripCredentials` (SEC-2 sanitization on error paths)

- [ ] **Write failing test**

Add to `tests/lib/cli/domain-extension-picker.test.mjs`:
```javascript
describe('runPicker', () => {
  it('returns { choice: "software", sourcePath: null } when user selects software', async () => { /* ... */ });
  it('returns { choice: "software", sourcePath: null } when user selects skip', async () => { /* ... */ });
  it('returns { choice: "data-engineering", sourcePath: <resolved> } when user selects data-engineering', async () => { /* ... */ });
  it('throws PICKER_USER_ABORTED on Ctrl+C / EOF at prompt', async () => { /* ... */ });
  it('skips silently when readManifestStamps reports an existing domain-profile install', async () => { /* ... */ });
});

describe('dispatchInstall', () => {
  it('calls installExtension with the resolved source path on non-software choice', async () => { /* ... */ });
  it('passes source URIs through stripCredentials() in error messages on installExtension failure', async () => { /* ... */ });
  it('does not write domain: when installExtension throws', async () => { /* ... */ });
});
```

Inject a fake `prompt` function and a fake `installExtension` via dependency-injection on the picker helper (the public API takes `{ ask, installFn }` as optional injected dependencies — defaults to the real `cli/index.mjs::ask` and `lib/extensions/install.mjs::installExtension`).

- [ ] **Verify test fails**

Run: `node --test tests/lib/cli/domain-extension-picker.test.mjs`
Expected: FAIL — `runPicker`/`dispatchInstall` exports missing.

- [ ] **Implement**

Extend `lib/cli/domain-extension-picker.mjs`:
- `runPicker({ projectRoot, pluginRoot, ask, installFn, readStamps })` — orchestrates: load + validate catalog, check existing install via `readStamps`, build prompt options (software synthetic + valid catalog entries + skip), read user input, return `{ choice, sourcePath, action }` where `action` is one of `install` / `software` / `skip` / `already-installed`.
- `dispatchInstall(entry, projectRoot, { installFn, stripCreds })` — calls `installFn(entry.resolvedPath, projectRoot, { sourceUri: entry.resolvedPath })`. On throw, rebuilds the error message with `stripCreds(uri)` applied to any URI substring and re-throws with the same `code`. Does not write `domain:` on failure (caller's responsibility, but `dispatchInstall` returns `{ installed: false, err }` instead of bubbling — chooses caller-decides over throw to keep CLI control-flow clean).

Re-export `runPicker`, `dispatchInstall` from the helper.

- [ ] **Verify test passes**

Run: `node --test tests/lib/cli/domain-extension-picker.test.mjs`
Expected: PASS.

- [ ] **Commit**

```bash
git add lib/cli/domain-extension-picker.mjs tests/lib/cli/domain-extension-picker.test.mjs
git commit -m "feat(domain-extensions): add picker prompt and install dispatch

Spec: .context-index/specs/features/domain-extensions/init-extension-picker.spec.md
Plan-task: 4"
```

---

### Task 5: Workspace-mode guard in picker helper [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=4
**Rationale:** ADR-0005 prescribes exact `detectWorkspace`/`assertPathInWorkspace` usage; precondition wording is verbatim; small additive change to one helper.

**Charter capability:** Init-Time Domain Extension Picker
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/cli/domain-extension-picker.mjs` (workspace-mode check + `assertPathInWorkspace()` calls)
- Modify: `tests/lib/cli/domain-extension-picker.test.mjs`

**Tests:** `tests/lib/cli/domain-extension-picker.test.mjs`

**Depends on:** Task 4

**Context to load:**
- Spec: Preconditions — Workspace-mode constraint
- ADR: `0005-workspace-isolation-invariant.md` Decision rules 1, 2, 4
- Reference: `lib/workspace.mjs::detectWorkspace`, `lib/workspace.mjs::assertPathInWorkspace`

- [ ] **Write failing test**

Add to `tests/lib/cli/domain-extension-picker.test.mjs`:
```javascript
describe('workspace mode', () => {
  it('skips picker silently when invoked at workspace root (no currentRepoSlug)', async () => {
    // fake detectWorkspace returns { root, config, currentRepoSlug: null }
    // assert runPicker returns { action: 'skipped-workspace-root' } and writes nothing
  });

  it('proceeds when invoked inside a registered repo (currentRepoSlug set)', async () => {
    // fake detectWorkspace returns { root, config, currentRepoSlug: 'repo-a' }
    // assert runPicker proceeds normally
  });

  it('passes write paths through assertPathInWorkspace before write', async () => {
    // spy on assertPathInWorkspace, assert it is called with the manifest write path
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/cli/domain-extension-picker.test.mjs`
Expected: FAIL — workspace guard not yet wired.

- [ ] **Implement**

In `runPicker()`:
- At the top, call `detectWorkspace(projectRoot)`. If non-null AND `currentRepoSlug === null`, return `{ action: 'skipped-workspace-root' }` immediately. Print a one-line advisory: `Domain picker skipped (workspace root). Run inside a registered repo to pick a domain extension.`
- Before any `manifest.yaml` write, call `assertPathInWorkspace(manifestPath, workspaceRoot, currentRepoSlug)`. On throw, surface as `PICKER_MANIFEST_WRITE_FAILED`.

- [ ] **Verify test passes**

Run: `node --test tests/lib/cli/domain-extension-picker.test.mjs`
Expected: PASS.

- [ ] **Commit**

```bash
git add lib/cli/domain-extension-picker.mjs tests/lib/cli/domain-extension-picker.test.mjs
git commit -m "feat(domain-extensions): enforce workspace isolation in picker

Spec: .context-index/specs/features/domain-extensions/init-extension-picker.spec.md
Plan-task: 5"
```

---

### Task 6: Manifest `domain:` writer in picker helper [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=5 pattern=4 blast=4 novelty=4
**Rationale:** Behaviors #2/#3/#5 spell out write/preserve semantics per action, and `writeManifestStamp` is cited as the idempotent-upsert precedent; minor novelty in atomic YAML splice for the new top-level key.

**Charter capability:** Init-Time Domain Extension Picker
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/cli/domain-extension-picker.mjs` (add `writeDomainKey()` + integrate into `runPicker()`)
- Modify: `tests/lib/cli/domain-extension-picker.test.mjs`

**Tests:** `tests/lib/cli/domain-extension-picker.test.mjs`

**Depends on:** Task 4

**Context to load:**
- Spec: Behaviors #2, #3, #5; Postconditions
- Reference: `lib/extensions/install.mjs::writeManifestStamp` (idempotent upsert pattern)
- Reference: `lib/manifest.mjs::loadManifest` (read side)

- [ ] **Write failing test**

Add to `tests/lib/cli/domain-extension-picker.test.mjs`:
```javascript
describe('writeDomainKey', () => {
  it('writes domain: <name> as a top-level key in manifest.yaml', async () => { /* ... */ });
  it('is idempotent — re-write with the same value produces no diff', async () => { /* ... */ });
  it('preserves the existing domain: value when picker is skipped due to existing install', async () => { /* ... */ });
  it('throws PICKER_MANIFEST_WRITE_FAILED on write failure (read-only fs)', async () => { /* ... */ });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/cli/domain-extension-picker.test.mjs`
Expected: FAIL — `writeDomainKey` not implemented.

- [ ] **Implement**

Add `writeDomainKey(projectRoot, domainName)` to the picker helper. Read `.context-index/manifest.yaml` if present, splice a top-level `domain: <name>` key (replace if present, insert at end of "Project Metadata" block if absent), write atomically (temp + rename). Throw `Error` with `code = PICKER_MANIFEST_WRITE_FAILED` on any I/O failure.

Wire into `runPicker()` outcomes:
- `action: 'software' | 'skip'` → `writeDomainKey(projectRoot, 'software')`.
- `action: 'install'` → after `dispatchInstall` succeeds, `writeDomainKey(projectRoot, entry.name)`. On `dispatchInstall` failure, skip the write (preserves the no-half-state postcondition).
- `action: 'already-installed'` → no write (preserves existing key).
- `action: 'skipped-workspace-root'` → no write.

- [ ] **Verify test passes**

Run: `node --test tests/lib/cli/domain-extension-picker.test.mjs`
Expected: PASS.

- [ ] **Commit**

```bash
git add lib/cli/domain-extension-picker.mjs tests/lib/cli/domain-extension-picker.test.mjs
git commit -m "feat(domain-extensions): write chosen domain: into manifest.yaml

Spec: .context-index/specs/features/domain-extensions/init-extension-picker.spec.md
Plan-task: 6"
```

---

### Task 7: Wire picker into `cmdInstall()` and `cmdUpgrade()` [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=5 pattern=4 blast=4 novelty=4
**Rationale:** Integration Points #1/#3 + Behaviors #1/#4/#5/#6 prescribe insertion point and shared-call pattern; only `cli/index.mjs` is touched and the picker helper does the heavy lifting.

**Charter capability:** Init-Time Domain Extension Picker
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `cli/index.mjs`

**Tests:** covered by Task 11 (integration test exercises both verbs end-to-end).

**Depends on:** Task 4, Task 5, Task 6

**Context to load:**
- Spec: Behaviors #1, #4, #5, #6; Integration Points #1, #3
- Reference: `cli/index.mjs::cmdInstall` (insertion point — after providers step)
- Reference: `cli/index.mjs::cmdUpgrade` (insertion point — same position)

- [ ] **Write failing test**

The CLI-surface assertion lives in Task 11. For this task, the gating assertion is the unit-test stub: import `cmdInstall` indirectly is not feasible (top-level), so this task relies on the integration test added in Task 11. Add a stub in Task 11's file referenced by name: `it('cmdInstall invokes picker after providers step')` — written failing in Task 11, made passing here.

Alternatively, scope this task's verification to: `grep -q "runPicker" cli/index.mjs` returns 0. (Lightweight CI guard that the wiring is present.)

- [ ] **Verify test fails**

Run: `grep -q "runPicker" cli/index.mjs` → Expected: exit 1 (not present).

- [ ] **Implement**

In `cli/index.mjs`:
1. Import the picker helper: `import { runPicker } from '../lib/cli/domain-extension-picker.mjs';` (alongside the existing `lib/extensions/install.mjs` import).
2. In `cmdInstall()`, after the providers step and before context-index scaffold:
   ```javascript
   heading('Domain Extension');
   const pickerResult = await runPicker({
     projectRoot: process.cwd(),
     pluginRoot: PLUGIN_ROOT,
     ask,
     installFn: installExtension,
     readStamps: readManifestStamps,
   });
   ```
3. In `cmdUpgrade()`, same insertion (after providers re-install step, before scaffold fill-in). The picker's skip-on-existing-install behaviour makes this safe for re-runs.
4. Forward `pickerResult` to the banner step (Task 8).

- [ ] **Verify test passes**

Run: `grep -q "runPicker" cli/index.mjs` → Expected: exit 0.
Also: `node --test tests/lib/cli/domain-extension-picker.test.mjs` continues to pass.

- [ ] **Commit**

```bash
git add cli/index.mjs
git commit -m "feat(domain-extensions): wire picker into install and upgrade flows

Spec: .context-index/specs/features/domain-extensions/init-extension-picker.spec.md
Plan-task: 7"
```

---

### Task 8: `Domain: <name>` completion banner [specialist: none]

**Routing:** auto-agent (score: 19/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=5
**Rationale:** Behavior #6 mandates the canonical literal `Domain: <name>` wording (no variant); single-line edit to one file.

**Charter capability:** Init-Time Domain Extension Picker
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `cli/index.mjs`

**Tests:** covered by Task 11 (asserts banner output).

**Depends on:** Task 7

**Context to load:**
- Spec: Behavior #6; CON-1 resolution — single canonical `Domain: <name>` wording

- [ ] **Write failing test**

Task 11 adds: `it('prints "Domain: <name>" exactly once in the install summary')`. This task makes it pass.

- [ ] **Verify test fails**

Run: `grep -q "Domain: " cli/index.mjs` → Expected: exit 1 (not present).

- [ ] **Implement**

In the install-completion summary block of both `cmdInstall()` and `cmdUpgrade()`, emit:
```javascript
log(`Domain: ${pickerResult.domainName}`);
```
where `pickerResult.domainName` is `'software'` for software / skip / skipped-workspace-root, or the catalog entry's `name` for install / already-installed.

Single canonical format. No `Domain extension:`, no `Selected domain:`. Exact string `Domain: <name>`.

- [ ] **Verify test passes**

Run: `grep -c "Domain: " cli/index.mjs` → Expected: ≥1.
Task 11's banner-assertion test passes after the wiring lands.

- [ ] **Commit**

```bash
git add cli/index.mjs
git commit -m "feat(domain-extensions): print Domain: <name> completion banner

Spec: .context-index/specs/features/domain-extensions/init-extension-picker.spec.md
Plan-task: 8"
```

---

### Task 9: Expose `domain:` placeholder in `templates/manifest-template.yaml` [specialist: none]

**Routing:** auto-agent (score: 20/20)
**Scores:** spec=5 pattern=5 blast=5 novelty=5
**Rationale:** Single commented YAML line addition with the exact text shown in the plan body; pure mechanical template edit.

**Charter capability:** Init-Time Domain Extension Picker
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `templates/manifest-template.yaml`

**Tests:** covered by Task 11 (integration test for a fresh-install verifies the rendered template either contains the commented placeholder or the picker-written `domain:` value).

**Context to load:**
- Spec: Module Impact Map row for `templates/manifest-template.yaml`

- [ ] **Write failing test**

Task 11 adds: `it('manifest template exposes a commented domain: placeholder')`. This task makes it pass.

- [ ] **Verify test fails**

Run: `grep -q "^# domain:" templates/manifest-template.yaml` → Expected: exit 1.

- [ ] **Implement**

Add a commented `# domain:` placeholder line to `templates/manifest-template.yaml` near the project-metadata block, with a comment explaining that the picker populates this key. Example:
```yaml
# domain:                # Set by `adev install` / `adev upgrade` picker.
                          # Identifies the active domain profile (software,
                          # data-engineering, process-automation, …).
```

- [ ] **Verify test passes**

Run: `grep -q "^# domain:" templates/manifest-template.yaml` → Expected: exit 0.

- [ ] **Commit**

```bash
git add templates/manifest-template.yaml
git commit -m "feat(domain-extensions): expose domain: placeholder in manifest template

Spec: .context-index/specs/features/domain-extensions/init-extension-picker.spec.md
Plan-task: 9"
```

---

### Task 10: Update `skills/init/SKILL.md` picker walkthrough [specialist: none]

**Routing:** auto-agent (score: 19/20)
**Scores:** spec=5 pattern=5 blast=5 novelty=4
**Rationale:** Behavior #8 + Integration Point #4 enumerate exactly what to document (canonical wording, four sub-points); pure markdown edit with the anti-pattern guard rails called out inline.

**Charter capability:** Init-Time Domain Extension Picker
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/init/SKILL.md`

**Tests:** Add `tests/skills/init-picker-doc.test.mjs` (or assert in Task 11) that the SKILL.md contains the canonical `Domain: <name>` wording and a section describing the picker prompt.

**Depends on:** Task 8

**Context to load:**
- Spec: Behavior #8; Integration Point #4

- [ ] **Write failing test**

```javascript
import { readFileSync } from 'node:fs';
it('skills/init/SKILL.md documents the picker prompt with canonical wording', () => {
  const md = readFileSync('skills/init/SKILL.md', 'utf8');
  assert.match(md, /Domain: <name>/);
  assert.match(md, /domain extension picker/i);
  assert.match(md, /adev extension install/);  // re-run instruction
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/init-picker-doc.test.mjs`
Expected: FAIL — SKILL.md lacks the section.

- [ ] **Implement**

Add a `## Domain Extension Picker` section to `skills/init/SKILL.md` (or in-place in the existing flow walkthrough) covering:
1. What the picker presents (`software` default + catalog entries + `skip`).
2. Each option's consequence (`software`/`skip` write `domain: software`, no install; non-software writes `domain: <name>` and installs the extension).
3. The banner: "After install, the CLI prints `Domain: <name>` to confirm."
4. Re-run path: "If you skipped, you can install later with `adev extension install <source>`."

Use the canonical `Domain: <name>` wording verbatim. No `Domain extension:` variant.

This step MUST NOT introduce a `Run inline Node.js:` block, a `node -e` heredoc, or a fenced JavaScript block that drives runtime behavior — the CLI verb wraps all runtime logic. (Per CLAUDE.md Anti-Patterns.)

- [ ] **Verify test passes**

Run: `node --test tests/skills/init-picker-doc.test.mjs`
Expected: PASS.

- [ ] **Commit**

```bash
git add skills/init/SKILL.md tests/skills/init-picker-doc.test.mjs
git commit -m "docs(domain-extensions): document init picker in SKILL.md

Spec: .context-index/specs/features/domain-extensions/init-extension-picker.spec.md
Plan-task: 10"
```

---

### Task 11: Integration test (`tests/cli/init-extension-picker.test.mjs`) [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=3
**Rationale:** Ten scenarios enumerated in plan body map 1:1 to acceptance criteria; precedent files (`tests/cli-extension.test.mjs`, `tests/helpers.mjs`) are cited; stdin-piped CLI subprocess test composition is the only novelty.

**Charter capability:** Init-Time Domain Extension Picker
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `tests/cli/init-extension-picker.test.mjs`

**Tests:** `tests/cli/init-extension-picker.test.mjs`

**Depends on:** Task 7, Task 8

**Context to load:**
- Spec: Acceptance Criteria — full list (especially the integration-test bullet)
- Reference: `tests/lib/extensions/install.test.mjs`, `tests/cli-extension.test.mjs`, `tests/helpers.mjs`

- [ ] **Write failing tests**

Create `tests/cli/init-extension-picker.test.mjs` exercising every required scenario in one `describe('init-extension-picker integration')` suite:

1. **`software` choice** — fake-prompt selects `software`; assert `manifest.yaml` contains `domain: software`, no `.context-index/domains/software/` extension was installed (`software` is bundled), banner reads `Domain: software`.
2. **`skip` choice** — same outcome as software (`domain: software` written), banner reads `Domain: software`.
3. **`data-engineering` choice** — installs the extension, `.context-index/domains/data-engineering/` exists, `manifest.yaml` contains `domain: data-engineering` and an `installed_extensions[]` entry of kind `domain-profile`, banner reads `Domain: data-engineering`.
4. **`process-automation` choice** — symmetric assertion for process-automation.
5. **Idempotency** — run install twice with the same choice; second run is a silent no-op for the picker (banner still prints `Domain: <name>` confirming existing state), no duplicate `installed_extensions[]` stamp.
6. **`upgrade` parity** — run `cmdUpgrade()` on a project without a `domain-profile` install; picker presents the same options, choices produce the same outcomes as `cmdInstall()`.
7. **Catalog-validation drop** — write a temp catalog with a malformed entry (name regex violation, path-traversal escape, or missing-on-disk); assert the entry is hidden from the picker and an advisory log is emitted; init does not abort.
8. **Error path: `SOURCE_RESOLUTION` (or `INVALID_SCHEMA`)** — fake `installExtension` to throw `SOURCE_RESOLUTION`; assert no `domain:` key was written, no `.context-index/domains/<name>/` directory remains, error message contains the error code, error message does NOT contain any raw credential substring (use a fixture URI `https://user:secret@example.com/repo` and assert `secret` is absent from stderr/stdout).
9. **Workspace-root skip** — create a fake `adev-workspace.yaml` at the project root with no current repo; assert picker is skipped silently, no writes occur, banner is suppressed (or prints a workspace-mode advisory — match the precondition wording in spec).
10. **Banner canonical wording** — assert exactly one line matches `^Domain: <name>$` in stdout across every passing path (asserts CON-1's "no variant" invariant).

Use `tests/helpers.mjs` (`createTempDir`, `cleanupTempDir`, `writeFixture`) and spawn the CLI via `child_process.spawn` against the real `cli/index.mjs`. For prompt-driven scenarios, pipe canned input on stdin (`'1\n'`, `'2\n'`, etc.) — same pattern used in `tests/cli-extension.test.mjs`.

- [ ] **Verify tests fail**

Run: `node --test tests/cli/init-extension-picker.test.mjs`
Expected: FAIL until Tasks 7 + 8 + 5 + 6 are all wired.

- [ ] **Implement**

No new implementation — Tasks 1-8 already wired the surface. This task only adds the test file.

- [ ] **Verify tests pass**

Run: `node --test tests/cli/init-extension-picker.test.mjs`
Expected: PASS (all 10+ assertions).
Run: `npm test` — all existing extension-install tests continue to pass.

- [ ] **Commit**

```bash
git add tests/cli/init-extension-picker.test.mjs
git commit -m "test(domain-extensions): add integration tests for init picker

Spec: .context-index/specs/features/domain-extensions/init-extension-picker.spec.md
Plan-task: 11"
```

---

### Task 12: Charter revision 4: Domain Model note + Capability Map status flip [specialist: none]

**Routing:** auto-agent (score: 20/20)
**Scores:** spec=5 pattern=5 blast=5 novelty=5
**Rationale:** Three mechanical charter edits (revision bump, one-line note, status-column flip) with verbatim wording in the plan body.

**Charter capability:** Init-Time Domain Extension Picker (charter housekeeping)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `.context-index/specs/features/domain-extensions/charter.md`

**Tests:** none (charter is a documentation artifact; lifecycle event log records the planning transition).

**Depends on:** Task 7

**Context to load:**
- Spec: Acceptance Criteria — charter revision bullet
- Reference: current charter (revision 3) — Domain Model section + Capability Map

- [ ] **Write failing test**

N/A — charter file edit, no test artifact.

- [ ] **Verify test fails**

`grep -q "top-level \`domain:\`" .context-index/specs/features/domain-extensions/charter.md` → Expected: exit 1 (note not yet added).
`grep -q "Init-Time Domain Extension Picker.*planned" .context-index/specs/features/domain-extensions/charter.md` → Expected: exit 1 (still `review-passed` in rev 3).

- [ ] **Implement**

In `.context-index/specs/features/domain-extensions/charter.md`:
1. Bump `revision: 3` → `revision: 4`; update `updated:` to today's date.
2. Add a one-line note to the Domain Model section documenting the new top-level `domain:` key in project `manifest.yaml`:
   > Each project manifest carries a top-level `domain: <name>` key set by the init-time picker. The value is one of `software` (bundled default) or the name of an installed `domain-profile` extension.
3. Flip the Capability Map row "Init-Time Domain Extension Picker" `Status` column from `review-passed` to `planned`. (After `/adev:implement` succeeds, it flips to `implemented`; after `/adev:validate` PASS, it flips to `validated` — those transitions are out of scope for this plan.)

- [ ] **Verify test passes**

`grep -q "top-level \`domain:\`" .context-index/specs/features/domain-extensions/charter.md` → Expected: exit 0.
`grep -q "Init-Time Domain Extension Picker.*planned" .context-index/specs/features/domain-extensions/charter.md` → Expected: exit 0.

- [ ] **Commit**

```bash
git add .context-index/specs/features/domain-extensions/charter.md
git commit -m "docs(domain-extensions): bump charter to rev 4 for init picker

Spec: .context-index/specs/features/domain-extensions/init-extension-picker.spec.md
Plan-task: 12"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test`
- All acceptance criteria from spec satisfied (17 criteria — see spec § Acceptance Criteria)
- Constitution compliance:
  - Principle 1 — no new runtime dependencies introduced
  - Principle 3 — all new files are `.mjs`, `"type": "module"`
  - Coding standard "CLI logic in `cli/index.mjs`, helpers in `lib/cli/`" honored
  - ADR-0005 (workspace isolation) — `assertPathInWorkspace()` called on all manifest writes
  - CLAUDE.md anti-patterns — no `Run inline Node.js:` blocks or `node -e` heredocs introduced in `skills/init/SKILL.md`
- No SKILL.md contains both inline-Node and `adev <verb>` invocations in the same H3 section (per-H3 boundary check from cli-driver-surface charter)
- `templates/extensions-catalog.json` validates against the v1 schema (Catalog Contract)
- `Domain: <name>` banner wording is unique (CON-1 — no `Domain extension:` variants reintroduced)
- All `PICKER_*` error codes are exported from `lib/cli/picker-errors.mjs` (single source of truth, no parallel definitions)
