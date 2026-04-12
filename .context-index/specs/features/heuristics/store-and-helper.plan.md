# Implementation Plan: Heuristic Store Structure and Helper API

> **Methodology:** adev
> **Charter:** .context-index/specs/features/heuristics/charter.md
> **Spec:** .context-index/specs/features/heuristics/store-and-helper.md
> **Review:** PASS_WITH_NOTES (2026-04-09, r2)
> **Platform:** JavaScript ESM, Node.js, node:test, npm

**Goal:** Implement `lib/heuristics.mjs` — a thin ESM helper for reading, writing, promoting, demoting, archiving, and contradicting heuristic entries stored as per-module markdown files with YAML frontmatter — plus the public schema documentation at `.context-index/memory/heuristics/_format.md`.

**Architecture:** The helper follows the established adev lib pattern: pure ESM with named exports only, Node.js built-ins with the `node:` prefix, async `fs/promises` API throughout, same-directory temp-file-then-rename for atomic writes, and `err.code = "..."` convention for schema errors (matching `lib/execution-state.mjs` and `lib/source-manifest.mjs`). YAML frontmatter serialization mirrors `lib/session-summary.mjs` with camelCase in-memory ↔ kebab-case on-disk key conversion. Per the charter, heuristics are inert markdown — the helper validates scope and id against a safe-slug pattern before they touch any file path, and all writes are atomic.

---

## File Structure

**Create:**
- `lib/heuristics.mjs` — The helper module with 6 named exports + internal parse/serialize/schema validation
- `tests/lib/heuristics.test.mjs` — Unit test suite covering every behavior and error case
- `.context-index/memory/heuristics/_format.md` — Public schema documentation (frontmatter fields, confidence lifecycle, id namespace convention, redaction advisory)

**Modify:**
- `.context-index/specs/features/heuristics/store-and-helper.md` — `/adev:implement` stamps a `source-manifest` block in the frontmatter after implementation
- `.context-index/specs/features/heuristics/charter.md` — Capability Map status transitions (Heuristic Store Structure, `lib/heuristics.mjs` Helper, Format Documentation → `implemented`)

**Reference (read, do not modify):**
- `lib/execution-state.mjs` — atomic write pattern, `err.code` convention, `node:` prefix imports
- `lib/session-summary.mjs` — `toKebab`/`toCamel`/`yamlValue`/`buildMarkdown` YAML serialization pattern
- `lib/source-manifest.mjs` — async `fs/promises` pattern, safe-path validation
- `tests/helpers.mjs` — `createTempDir()`, `cleanupTempDir()` helpers
- `.context-index/samples/general-library-module-graph.md` — reference for library module structure
- `.context-index/samples/general-test-helpers.md` — reference for test helper usage

## Context Packets

Each task's subagent packet includes the constitution excerpt, the spec excerpt covering the specific behaviors the task implements, and any sample or lib reference noted below.

### T1 Context
- Spec: store-and-helper.md (API Signatures section + Entities section of the charter)
- Charter: charter.md (Entities table)

### T2 Context
- Spec: store-and-helper.md (Behaviors 1-6, Error Cases row "malformed YAML")
- Reference: `lib/session-summary.mjs` `toCamel()` and YAML parsing helpers

### T3 Context
- Spec: store-and-helper.md (Postcondition 4: "Schema fields are preserved across round-trip")
- Reference: `lib/session-summary.mjs` `toKebab()`, `yamlValue()`, `buildMarkdown()`

### T4 Context
- Spec: store-and-helper.md (Error Cases rows 1-6: schema validation; Scope-Safe Slug Pattern section; field length caps)
- Reference: `lib/execution-state.mjs` `err.code` pattern

### T5 Context
- Spec: store-and-helper.md (Behaviors 23-25: atomic writes, import safety)
- Reference: `lib/execution-state.mjs` temp-file-then-rename pattern (adapted to async `fs/promises`)

### T6 Context
- Spec: store-and-helper.md (Behaviors 1-6: read path; Postconditions; Error Cases "missing file" and "malformed YAML")

### T7 Context
- Spec: store-and-helper.md (Behaviors 7-14: write path, caller-supplied confidence, absolute-threshold auto-promotion, malformed-entry overwrite)

### T8 Context
- Spec: store-and-helper.md (Behaviors 15-19: promote, demote, archive; Error Cases for unknown id and archive conflict)

### T9 Context
- Spec: store-and-helper.md (Behaviors 20-22: addContradiction with auto-demotion; contradiction-trumps-underflow)

### T10 Context
- Spec: store-and-helper.md (Quality Attributes "Transparency"; entire schema section)
- Charter: charter.md (Business Intent, Domain Model, Quality Attributes)
- Research: `.context-index/research/self-learning-agents.md` (for context on why redaction matters)

### T11-T16 Context
- Spec: store-and-helper.md (corresponding behavior + error case it tests)
- Reference: `tests/helpers.mjs` `createTempDir()`

## Parallelization

- **Group A (strictly sequential):** T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9 — the helper module grows incrementally through these tasks; each task depends on the previous via shared file `lib/heuristics.mjs`.
- **Group B (independent of A after T9):** T10 (write `_format.md`) — no code dependency; can run any time after T9 completes.
- **Group C (depends on corresponding code task in Group A):** T11 depends on T2/T3, T12 depends on T6, T13 depends on T7, T14 depends on T9, T15 depends on T5+T7, T16 depends on T4. In practice each test task will be folded into its corresponding implementation task per TDD (test written first, then impl) — T11-T16 are listed separately for plan clarity but will execute as part of the per-task TDD cycle.

`/adev:implement` will run them strictly sequentially, one subagent per task, in T1 → T16 order.

---

### Task 1: JSDoc types and internal constants [specialist: none]

**Charter capability:** Heuristic Store Structure, `lib/heuristics.mjs` Helper
**Files:**
- Create: `lib/heuristics.mjs`
- Test: `tests/lib/heuristics.test.mjs` (created later in T11)

**Tests:** `tests/lib/heuristics.test.mjs` — a smoke import test is added in this task; full coverage grows through T11-T16.

- [ ] **Write failing test**: import `lib/heuristics.mjs` and assert the 6 named exports exist as functions
- [ ] **Verify fail**: module does not exist
- [ ] **Implement**: create `lib/heuristics.mjs` with stub `export async function` declarations for all 6 API functions plus JSDoc typedefs for `Heuristic`, `EvidenceRef`, `ArchivedHeuristic`, `ReadOptions`
- [ ] **Verify pass**: import test passes
- [ ] **Commit**: `feat(heuristics): lib/heuristics.mjs skeleton with JSDoc types`

### Task 2: parseHeuristicsFile (YAML parsing, skip malformed) [specialist: none]

**Charter capability:** Heuristic Store Structure
**Files:**
- Modify: `lib/heuristics.mjs`
- Test: `tests/lib/heuristics.test.mjs`

**Tests:** `tests/lib/heuristics.test.mjs`

- [ ] **Write failing test**: parse a fixture file containing 2 well-formed entries and 1 malformed YAML block; expect 2 entries returned + 1 stderr warning
- [ ] **Verify fail**
- [ ] **Implement**: `parseHeuristicsFile(path)` — split on `---` frontmatter delimiters, parse each YAML block, convert kebab-case keys to camelCase via `toCamel` (mirror `lib/session-summary.mjs`), skip and warn on malformed blocks
- [ ] **Verify pass**
- [ ] **Commit**: `feat(heuristics): parseHeuristicsFile with malformed-entry tolerance`

### Task 3: serializeHeuristic (camelCase → kebab-case, frontmatter blocks) [specialist: none]

**Charter capability:** Heuristic Store Structure
**Files:**
- Modify: `lib/heuristics.mjs`
- Test: `tests/lib/heuristics.test.mjs`

**Tests:** `tests/lib/heuristics.test.mjs`

- [ ] **Write failing test**: round-trip — serialize an in-memory heuristic with all fields, then parse the output; assert deep equal to original
- [ ] **Verify fail**
- [ ] **Implement**: `serializeHeuristic(entry)` producing an on-disk block with `---` delimiters, `toKebab` key conversion, array handling for `evidence[]` and `contradicted-by[]`
- [ ] **Verify pass**
- [ ] **Commit**: `feat(heuristics): serializeHeuristic round-trip safe`

### Task 4: Schema validator (safe-slug, required fields, length caps, confidence enum) [specialist: none]

**Charter capability:** Heuristic Store Structure
**Files:**
- Modify: `lib/heuristics.mjs`
- Test: `tests/lib/heuristics.test.mjs`

**Tests:** `tests/lib/heuristics.test.mjs`

- [ ] **Write failing tests** for every error case: missing `id`/`scope`/`title`/`pattern`/`confidence`, invalid confidence value, scope containing `/` or `..`, id with traversal, title > 120 chars, pattern > 500 chars. Each must throw with `err.code = "HEURISTICS_SCHEMA_ERROR"`. Also test that `INVALID_PROJECT_ROOT` throws on relative projectRoot.
- [ ] **Verify fail**
- [ ] **Implement**: `validateEntry(entry)` internal function plus `validateProjectRoot(projectRoot)` helper. Safe-slug regex `/^[_a-z0-9][_a-z0-9-]{0,63}$/`. Attach `err.code` on thrown errors matching `lib/execution-state.mjs` convention.
- [ ] **Verify pass**
- [ ] **Commit**: `feat(heuristics): schema validator with safe-slug and length caps`

### Task 5: Atomic write helper (same-directory temp + rename) [specialist: none]

**Charter capability:** Heuristic Store Structure
**Files:**
- Modify: `lib/heuristics.mjs`
- Test: `tests/lib/heuristics.test.mjs`

**Tests:** `tests/lib/heuristics.test.mjs`

- [ ] **Write failing test**: call `atomicWrite(targetPath, content)` — assert the target file contains the content; assert no leftover `.tmp-*` file; assert target directory is created if missing
- [ ] **Verify fail**
- [ ] **Implement**: internal `atomicWrite(target, content)` using async `fs/promises`: `mkdir({ recursive: true })` the parent, build `<target>.tmp-<hex>` sibling with `crypto.randomBytes(6).toString('hex')` suffix, `writeFile` the temp, `rename` to target. On any error, attempt to `unlink` the temp.
- [ ] **Verify pass**
- [ ] **Commit**: `feat(heuristics): atomic write via adjacent temp + rename`

### Task 6: readHeuristics (module match, confidence filter, limit, sort) [specialist: none]

**Charter capability:** Heuristic Store Structure, `lib/heuristics.mjs` Helper
**Files:**
- Modify: `lib/heuristics.mjs`
- Test: `tests/lib/heuristics.test.mjs`

**Tests:** `tests/lib/heuristics.test.mjs`

- [ ] **Write failing tests**: (a) read from a non-existent file returns `[]`; (b) read with no options returns all entries sorted by confidence DESC then updated DESC; (c) `minConfidence: 'medium'` filters out `low`; (d) `limit: 2` returns at most 2 with high preferred; (e) unknown module returns `[]` without throwing
- [ ] **Verify fail**
- [ ] **Implement**: `readHeuristics(projectRoot, { module, minConfidence, limit } = {})` — validate projectRoot, resolve path to `.context-index/memory/heuristics/<module>.md`, call `parseHeuristicsFile`, filter by `minConfidence`, sort by `(confidence, updated)` descending, apply `limit`
- [ ] **Verify pass**
- [ ] **Commit**: `feat(heuristics): readHeuristics with filter, sort, and limit`

### Task 7: writeHeuristic (append-or-update, caller confidence, absolute-threshold auto-promotion, malformed overwrite) [specialist: none]

**Charter capability:** Heuristic Store Structure, `lib/heuristics.mjs` Helper
**Files:**
- Modify: `lib/heuristics.mjs`
- Test: `tests/lib/heuristics.test.mjs`

**Tests:** `tests/lib/heuristics.test.mjs`

- [ ] **Write failing tests**: (a) new entry with `confidence: low` and 1 evidence → stored at `low`; (b) second write with distinct-path evidence → auto-promoted to `medium`; (c) third write with distinct-path → auto-promoted to `high`; (d) write with `confidence: medium` as initial → stored at `medium`, reaches `high` after 3rd distinct-path evidence; (e) evidence dedup by `(path, date)` — duplicate evidence does not double-count; (f) update ignores caller-supplied confidence; (g) malformed existing entry with same id is overwritten with a warning; (h) new entry calls validateEntry first
- [ ] **Verify fail**
- [ ] **Implement**: `writeHeuristic(projectRoot, entry)` — validate, read existing file, find existing entry by id, merge evidence (dedup on `(path, date)`), compute new confidence via absolute-threshold rules (2+ distinct paths → `medium`; 3+ → `high`; never decrease), handle malformed-existing-entry overwrite, atomic write.
- [ ] **Verify pass**
- [ ] **Commit**: `feat(heuristics): writeHeuristic with auto-promotion and malformed overwrite`

### Task 8: promoteHeuristic, demoteHeuristic, archiveHeuristic [specialist: none]

**Charter capability:** Heuristic Store Structure, `lib/heuristics.mjs` Helper
**Files:**
- Modify: `lib/heuristics.mjs`
- Test: `tests/lib/heuristics.test.mjs`

**Tests:** `tests/lib/heuristics.test.mjs`

- [ ] **Write failing tests**: (a) promote low → medium; (b) promote high is no-op; (c) demote medium → low; (d) demote low triggers `archiveHeuristic` with reason `"demoted-below-low"`; (e) archive moves entry to `archive/<scope>-<id>.md` with `archived` and `archivedReason` fields added; original scope file no longer contains entry; (f) archive conflict throws `HEURISTICS_ARCHIVE_CONFLICT`; (g) all four throw `HEURISTICS_NOT_FOUND` for unknown id
- [ ] **Verify fail**
- [ ] **Implement**: helper `findEntryById(projectRoot, id)` that scans all scope files to locate the entry. `promoteHeuristic(projectRoot, id)`, `demoteHeuristic(projectRoot, id)` (with low → archive recursion), `archiveHeuristic(projectRoot, id, reason)` (remove from source file, write to archive, both atomic)
- [ ] **Verify pass**
- [ ] **Commit**: `feat(heuristics): promote, demote, archive with edge cases`

### Task 9: addContradiction (auto-demote; contradicted beats underflow) [specialist: none]

**Charter capability:** Heuristic Store Structure, `lib/heuristics.mjs` Helper
**Files:**
- Modify: `lib/heuristics.mjs`
- Test: `tests/lib/heuristics.test.mjs`

**Tests:** `tests/lib/heuristics.test.mjs`

- [ ] **Write failing tests**: (a) first contradiction drops confidence by 1 level; (b) second contradiction auto-archives with reason `"contradicted"`; (c) contradiction on `low` entry archives with reason `"contradicted"` (NOT `"demoted-below-low"`); (d) `contradicted-by[]` array grows correctly; (e) throws `HEURISTICS_NOT_FOUND` for unknown id
- [ ] **Verify fail**
- [ ] **Implement**: `addContradiction(projectRoot, id, evidenceRef)` — look up entry, append to `contradicted-by[]`, if length reaches 2 call `archiveHeuristic(id, "contradicted")`, else drop confidence one level; if current is `low` and contradiction fires, archive with reason `"contradicted"` (special-case the low path to bypass the demote→archive "demoted-below-low" reason)
- [ ] **Verify pass**
- [ ] **Commit**: `feat(heuristics): addContradiction with contradicted-trumps-underflow`

### Task 10: Write _format.md public schema doc [specialist: none]

**Charter capability:** Format Documentation
**Files:**
- Create: `.context-index/memory/heuristics/_format.md`

**Tests:** This task produces documentation. Verification is a test that asserts the file exists and contains the required sections (frontmatter schema, confidence lifecycle, id namespace convention, redaction advisory).

- [ ] **Write failing test**: add `tests/lib/heuristics-format-doc.test.mjs` that reads `_format.md` and asserts it contains: (a) "Frontmatter Schema" section, (b) "Confidence Lifecycle" section with `low`/`medium`/`high` and promotion thresholds, (c) "ID Namespace Convention" section mentioning `<category-slug>-<hash>` for recover and `<spec-slug>-<hash>` for validate, (d) "Redaction Advisory" section mentioning "distill generalizations, not copy literal values"
- [ ] **Verify fail**: file does not exist
- [ ] **Implement**: Write `_format.md` with all four sections plus: safe-slug pattern, field-length caps, file layout, atomic write guarantee, import safety, examples of well-formed entries
- [ ] **Verify pass**
- [ ] **Commit**: `docs(heuristics): public schema at .context-index/memory/heuristics/_format.md`

### Task 11: Parse/serialize round-trip edge cases [specialist: none]

**Charter capability:** Heuristic Store Structure
**Files:**
- Modify: `tests/lib/heuristics.test.mjs`

**Tests:** `tests/lib/heuristics.test.mjs`

- [ ] **Write failing tests** beyond T2/T3: (a) empty `contradicted-by[]`; (b) `antiPattern: ""` (empty string); (c) special characters in `title` that must be YAML-escaped; (d) multiple entries in one file parse independently
- [ ] **Verify fail** (if any new path is hit)
- [ ] **Implement**: adjust `serializeHeuristic`/`parseHeuristicsFile` as needed to cover edge cases
- [ ] **Verify pass**
- [ ] **Commit**: `test(heuristics): parse/serialize edge cases`

### Task 12: Read filtering, sorting, limit coverage [specialist: none]

**Charter capability:** Heuristic Store Structure, `lib/heuristics.mjs` Helper
**Files:**
- Modify: `tests/lib/heuristics.test.mjs`

**Tests:** `tests/lib/heuristics.test.mjs`

- [ ] **Write failing tests**: deterministic sort when two entries have same confidence (tie-break on `updated`); limit: 0 returns empty array; minConfidence: 'high' excludes both low and medium
- [ ] **Verify fail**
- [ ] **Implement** any needed fixes
- [ ] **Verify pass**
- [ ] **Commit**: `test(heuristics): readHeuristics filter and sort coverage`

### Task 13: Write + auto-promotion at every threshold [specialist: none]

**Charter capability:** Heuristic Store Structure, `lib/heuristics.mjs` Helper
**Files:**
- Modify: `tests/lib/heuristics.test.mjs`

**Tests:** `tests/lib/heuristics.test.mjs`

- [ ] **Write failing tests**: (a) same path evidence twice does NOT auto-promote (distinct-path rule); (b) 2 distinct-path + low initial → medium after write 2; (c) 3 distinct-path + low initial → high after write 3; (d) caller passes `medium` initial → still at medium after 2nd distinct-path evidence (no change, already at medium), → high after 3rd; (e) caller passes `high` initial → never changes
- [ ] **Verify fail**
- [ ] **Implement** any fixes
- [ ] **Verify pass**
- [ ] **Commit**: `test(heuristics): auto-promotion thresholds across all confidence starts`

### Task 14: Contradiction + auto-demote + archive reasons [specialist: none]

**Charter capability:** Heuristic Store Structure, `lib/heuristics.mjs` Helper
**Files:**
- Modify: `tests/lib/heuristics.test.mjs`

**Tests:** `tests/lib/heuristics.test.mjs`

- [ ] **Write failing tests**: (a) high → medium → low → archive("contradicted") over 3 contradictions; (b) low → archive("contradicted") on first contradiction; (c) archive file frontmatter contains `archived: <date>` and `archivedReason: contradicted`
- [ ] **Verify fail**
- [ ] **Implement** any fixes
- [ ] **Verify pass**
- [ ] **Commit**: `test(heuristics): contradiction archive reasons`

### Task 15: Atomic write + import safety [specialist: none]

**Charter capability:** Heuristic Store Structure
**Files:**
- Modify: `tests/lib/heuristics.test.mjs`

**Tests:** `tests/lib/heuristics.test.mjs`

- [ ] **Write failing tests**: (a) importing `lib/heuristics.mjs` in a fresh project without `.context-index/memory/heuristics/` does not throw; (b) `writeHeuristic` creates the missing directory on first write; (c) atomic write leaves no `.tmp-*` file after success; (d) simulated `writeFile` failure cleans up the temp file
- [ ] **Verify fail**
- [ ] **Implement** any fixes (temp-file cleanup on error)
- [ ] **Verify pass**
- [ ] **Commit**: `test(heuristics): atomic write cleanup + import safety`

### Task 16: Error case full coverage [specialist: none]

**Charter capability:** Heuristic Store Structure
**Files:**
- Modify: `tests/lib/heuristics.test.mjs`

**Tests:** `tests/lib/heuristics.test.mjs`

- [ ] **Write failing tests**: every row in the error case table — missing required fields, invalid confidence, scope traversal `../../../etc/passwd`, id traversal, unknown scope with warning (not throw), unknown id on promote/demote/archive/addContradiction, archive conflict, malformed YAML skip with warning, relative projectRoot
- [ ] **Verify fail**
- [ ] **Implement** any gaps
- [ ] **Verify pass**
- [ ] **Commit**: `test(heuristics): error case full coverage`

---

## Quality Gates

After all 16 tasks complete, run the full quality gate suite:

- [ ] Tests pass: `npm test`
- [ ] All 22 acceptance criteria from spec satisfied
- [ ] `lib/heuristics.mjs` is importable without throwing when `.context-index/memory/heuristics/` does not exist
- [ ] No constitutional violations introduced (zero new external deps, pure ESM with `node:` prefix imports, markdown-primary skill unaffected)
- [ ] Source manifest stamped in spec frontmatter by `/adev:implement` Step 5

## Addresses Review Notes (PASS_WITH_NOTES from r2 re-review)

The following r2 notes are addressed by this plan:

- **CON-NEW-1** (async/sync rename clarity): T5 explicitly uses async `fs/promises` `writeFile` + `rename`.
- **CON-NEW-2** (session-summary.mjs citation): already fixed in commit 3e7d6e9; plan references `execution-state.mjs` and `source-manifest.mjs` for `node:` prefix pattern and `session-summary.mjs` for the `toKebab`/`toCamel` converter (which is accurate).
- **CON-NEW-8** (archivedReason vs archived-reason): T8 and T10 document that the helper stores `archivedReason` in-memory and serializes to `archived-reason` on disk via `toKebab`, consistent with the camelCase/kebab-case split.
- **SEC-NEW-2** (crypto random temp suffix): T5 explicitly specifies `node:crypto.randomBytes(6).toString('hex')`.
- **SA-NEW-1** (distinct-path semantics): T7 and T13 explicitly test that same-path evidence does not count toward distinct-path promotion thresholds.
- **SA-NEW-3** (malformed block + auto-promotion precedence): T7 tests that overwriting a malformed entry starts the new evidence count fresh.
- **SA-NEW-2** (helper warns on unknown scope; consumer specs fall back to `_global`): consumer behavior is not covered by this plan (that's the extraction specs); the helper's side is tested in T16.

Advisory-only findings (SA-NEW-4, SEC-NEW-3, SEC-NEW-8) are not addressed by this plan and will be tracked as technical notes.
