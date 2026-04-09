# Live Spec: Heuristic Store Structure and Helper API

<!-- Live Spec within the heuristics charter.
     Phase 1a foundation: on-disk layout, YAML schema, confidence lifecycle,
     the lib/heuristics.mjs API, and the public schema documentation at
     .context-index/memory/heuristics/_format.md.
     Does NOT cover extraction or injection points — those are separate specs.
     Parent Charter: .context-index/specs/features/heuristics/charter.md -->

---
charter: heuristics
status: review-passed
risk_level: medium
milestone: 1a
revision: 2
charter-revision: 3
created: 2026-04-09
updated: 2026-04-09
---

## Behavioral Contract

### Scope-Safe Slug Pattern

Throughout this spec, a "safe slug" is a string matching the regex `/^[_a-z0-9][_a-z0-9-]{0,63}$/`. The leading `_` permits the reserved `_global` scope. This pattern is used to validate `scope` and `id` fields before they influence any file path.

### API Signatures

```
readHeuristics(projectRoot, { module?, minConfidence?, limit? })
  → Promise<Heuristic[]>

writeHeuristic(projectRoot, entry) → Promise<Heuristic>
promoteHeuristic(projectRoot, id) → Promise<Heuristic>
demoteHeuristic(projectRoot, id)  → Promise<Heuristic | ArchivedHeuristic>
archiveHeuristic(projectRoot, id, reason) → Promise<ArchivedHeuristic>
addContradiction(projectRoot, id, evidenceRef) → Promise<Heuristic | ArchivedHeuristic>
```

In-memory objects use `camelCase` keys (matching `lib/execution-state.mjs` and `lib/session-summary.mjs`); the serializer converts to kebab-case on write (matching the on-disk YAML convention used by `session-summary.mjs`).

### Preconditions

- `.context-index/` exists with a valid `manifest.yaml` defining at least one module
- Node.js runtime with ESM support is available
- `projectRoot` is an absolute path (helper throws `INVALID_PROJECT_ROOT` otherwise, matching `lib/execution-state.mjs` convention)
- The invoking skill has read/write access to `.context-index/memory/`

### Behaviors

**Read path:**

1. **When** `readHeuristics(projectRoot, { module: 'hooks' })` is called **and** `.context-index/memory/heuristics/hooks.md` exists **then** the helper parses each entry's YAML frontmatter and returns an array of heuristic objects sorted by confidence (`high` → `medium` → `low`) then by `updated` descending.
2. **When** `readHeuristics(projectRoot, { module: 'hooks', minConfidence: 'medium' })` is called **then** entries with `confidence: low` are filtered out of the result.
3. **When** `readHeuristics(projectRoot, { module: 'hooks', limit: 5 })` is called **then** no more than 5 entries are returned, with `high` preferred over `medium`, `medium` preferred over `low`.
4. **When** `readHeuristics` is called with a `module` value that matches neither an existing file nor `_global` **then** the helper returns an empty array and does not throw.
5. **When** `readHeuristics` is called against a missing or unreadable file **then** the helper logs a single-line warning to stderr and returns an empty array.
6. **When** `readHeuristics` encounters malformed YAML frontmatter within a scope file **then** the malformed entry is skipped, a single-line warning is logged, and the remaining entries in the file are parsed normally.

**Write path — base cases:**

7. **When** `writeHeuristic(projectRoot, entry)` is called with a new `id` for its scope **then** the helper appends a new frontmatter-delimited block to `<scope>.md`, creating the directory and file if needed, with `created` and `updated` set to today's date.
8. **When** `writeHeuristic` is called with an `id` that already exists in the scope file **then** the helper updates the existing entry in place, preserves the original `created` timestamp, refreshes `updated`, and merges `evidence[]` in append-only order, deduplicated by the combination of `path` and `date` (source field is not part of the dedup key).

**Write path — caller-supplied confidence and absolute-threshold auto-promotion:**

9. **When** `writeHeuristic` is called with an initial `entry.confidence` of `low`, `medium`, or `high` **then** that value becomes the stored confidence for a new entry. The caller-supplied confidence is authoritative for creation.
10. **When** `writeHeuristic` updates an existing entry **then** the caller-supplied `confidence` field is ignored; the stored confidence (as possibly adjusted by auto-promotion in this same call) is authoritative.
11. **When** a `writeHeuristic` call results in the entry having 2 or more distinct-path evidence entries **and** the current confidence is `low` **then** confidence is auto-promoted to `medium` before the write is committed.
12. **When** a `writeHeuristic` call results in the entry having 3 or more distinct-path evidence entries **and** the current confidence is `low` or `medium` **then** confidence is auto-promoted to `high` before the write is committed.
13. **When** a `writeHeuristic` call does not cross an auto-promotion threshold **then** confidence is left unchanged. Auto-promotion never decreases confidence.
14. **When** the scope file contains a pre-existing entry whose on-disk YAML is malformed **and** `writeHeuristic` is called with the same `id` **then** the helper overwrites the malformed block with the new entry, logs a single-line warning (`heuristics: overwrote malformed entry '<id>' in '<scope>.md'`), and treats the call as an update.

**Promote / demote / archive:**

15. **When** `promoteHeuristic(projectRoot, id)` is called on a `high`-confidence entry **then** the call is a no-op and returns the unchanged entry.
16. **When** `promoteHeuristic` is called on a `low` or `medium` entry **then** confidence is raised one level and the entry is written atomically.
17. **When** `demoteHeuristic(projectRoot, id)` is called on a `low`-confidence entry **then** the helper calls `archiveHeuristic` with reason `"demoted-below-low"` and returns the archived entry.
18. **When** `demoteHeuristic` is called on a `medium` or `high` entry **then** confidence is lowered one level and the entry is written atomically.
19. **When** `archiveHeuristic(projectRoot, id, reason)` is called **then** the helper removes the entry from its scope file, writes a new file at `.context-index/memory/heuristics/archive/<scope>-<id>.md` with `archived` (today's date) and `archivedReason` fields added to its frontmatter, and returns the archived entry.
20. **When** `addContradiction(projectRoot, id, evidenceRef)` is called **and** the entry's prior `contradicted-by[]` length is 0 or 1 **then** the helper appends `evidenceRef` to `contradicted-by[]` and drops confidence by exactly one level.
21. **When** `addContradiction` is called on a `low`-confidence entry **then** the helper archives with reason `"contradicted"` (NOT `"demoted-below-low"`); contradictions always trump demotion-underflow semantics.
22. **When** `addContradiction` is called on an entry whose `contradicted-by[]` length reaches 2 **then** the helper immediately archives with reason `"contradicted"` regardless of prior confidence.

**Atomicity and safety:**

23. **When** any write operation runs **then** the implementation uses temp-file-then-rename, with the temp file created in the same directory as the target (e.g., `<scope>.md.tmp-<randomsuffix>` adjacent to `<scope>.md`) to guarantee atomicity on cross-filesystem safe rename.
24. **When** a write is interrupted **then** the on-disk file is either the pre-write state or the post-write state; no partial writes are ever observable.

**Import safety:**

25. **When** `lib/heuristics.mjs` is imported **and** `.context-index/memory/heuristics/` does not yet exist **then** the import does not throw; directory creation is lazy, deferred until the first write call.

### Postconditions

- After any successful `writeHeuristic`, `promoteHeuristic`, `demoteHeuristic`, or `addContradiction` call, a subsequent `readHeuristics` call returns the updated state.
- After any successful `archiveHeuristic` call, the entry is absent from its scope file and present as `archive/<scope>-<id>.md`.
- Charter invariants (confidence enum, promotion thresholds, contradicted-by limits, id uniqueness within scope, no orphan entries) always hold after any helper call.
- Schema fields (`id`, `scope`, `title`, `pattern`, `antiPattern`, `confidence`, `evidence[]`, `contradictedBy[]`, `created`, `updated`) are preserved across round-trip parse → serialize → parse.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `projectRoot` is not an absolute path | Throws `Error("projectRoot must be an absolute path")` with `err.code = "INVALID_PROJECT_ROOT"` | `INVALID_PROJECT_ROOT` |
| `writeHeuristic` called with missing required field (`id`, `scope`, `title`, `pattern`, `confidence`) | Throws `Error("heuristics: missing required field '<field>'")` | `HEURISTICS_SCHEMA_ERROR` |
| `writeHeuristic` called with `confidence` not in `low`/`medium`/`high` | Throws `Error("heuristics: invalid confidence '<value>'")` | `HEURISTICS_SCHEMA_ERROR` |
| `writeHeuristic` called with `scope` that does not match the safe-slug pattern (contains `/`, `..`, null bytes, or other characters outside `/^[_a-z0-9][_a-z0-9-]{0,63}$/`) | Throws `Error("heuristics: invalid scope '<value>'")` | `HEURISTICS_SCHEMA_ERROR` |
| `writeHeuristic` called with `id` that does not match the safe-slug pattern | Throws `Error("heuristics: invalid id '<value>'")` | `HEURISTICS_SCHEMA_ERROR` |
| `writeHeuristic` called with `title` exceeding 120 characters or `pattern`/`antiPattern` exceeding 500 characters | Throws `Error("heuristics: field '<name>' exceeds length cap")` | `HEURISTICS_SCHEMA_ERROR` |
| `writeHeuristic` called with a well-formed safe-slug `scope` that is neither `_global` nor a known `manifest.yaml` `modules[].slug` | Logs single-line warning to stderr; proceeds anyway (allows future modules) | — |
| `promoteHeuristic` / `demoteHeuristic` / `archiveHeuristic` / `addContradiction` called with unknown `id` | Throws `Error("heuristics: id '<id>' not found in any scope")` | `HEURISTICS_NOT_FOUND` |
| `archiveHeuristic` called on an entry whose archive file already exists | Throws `Error("heuristics: archive conflict for '<id>'")` | `HEURISTICS_ARCHIVE_CONFLICT` |
| Read encounters malformed YAML frontmatter within a scope file | Skips the malformed entry, logs warning to stderr, continues parsing | — |
| Write to a scope file whose existing entry for the same id is malformed | Overwrites the malformed block, logs warning to stderr, completes normally | — |
| Write fails due to filesystem error (EACCES, ENOSPC, etc.) | Bubbles the original `fs` error unchanged to the caller | (passthrough) |

## System Constitution Reference

- **Principle 1: Minimize external dependencies** — `lib/heuristics.mjs` imports only Node.js built-ins using the `node:` prefix: `node:fs/promises`, `node:path`, `node:crypto` (matching `lib/execution-state.mjs` and `lib/source-manifest.mjs`). No new npm packages are required or added. All write operations, including the atomic rename, use the async promise-based API from `node:fs/promises` (e.g., `writeFile`, `rename`, `mkdir`); there is no mixing of sync and async APIs within the helper.
- **Principle 2: Skills are primarily markdown** — The helper is companion code, explicitly permitted by the constitution. Skills that read heuristics must degrade gracefully when the helper or its files are absent.
- **Principle 3: Pure ESM** — The helper is `.mjs` with named exports only. No CommonJS.
- **Coding Standards: camelCase functions, kebab-case files** — API function names and in-memory keys follow camelCase (`readHeuristics`, `writeHeuristic`, `antiPattern`, `contradictedBy`); on-disk file and directory names follow kebab-case (`heuristics/`, `_global.md`, `archive/`); YAML frontmatter keys are kebab-case on disk (`anti-pattern`, `contradicted-by`, `archived-reason`) — the helper's serializer converts between camelCase in-memory and kebab-case on-disk representations using the same `toKebab`/`toCamel` approach as `lib/session-summary.mjs`.
- **Logging convention** — The helper writes warnings to stderr as single-line messages prefixed with `heuristics: ` (matching the stderr-warning pattern used across the adev lib helpers).
- **Graceful degradation** — Importing the module never throws; file and directory access failures never propagate above the helper except for genuinely unrecoverable filesystem errors (EACCES, ENOSPC).

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| T1 | Define JSDoc types for `Heuristic`, `EvidenceRef`, `ReadOptions`, `ArchivedHeuristic`, and helper return shapes | small |
| T2 | Implement `parseHeuristicsFile(path)` — split file on frontmatter blocks, parse YAML with `session-summary.mjs` kebab-to-camel conversion, return entry array, skip malformed entries with warning | medium |
| T3 | Implement `serializeHeuristic(entry)` — produce the on-disk markdown block (frontmatter + body) using camel-to-kebab conversion | small |
| T4 | Implement schema validator — checks required fields, confidence enum, safe-slug pattern for `scope` and `id`, and field length caps | small |
| T5 | Implement atomic write helper: write to adjacent temp file (`<target>.tmp-<cryptoRandomSuffix>`) via `writeFile`, then `rename` to target — all async from `node:fs/promises`. Suffix generated via `node:crypto.randomBytes(6).toString('hex')` to prevent temp-file prediction | small |
| T6 | Implement `readHeuristics(projectRoot, opts)` with module match, `minConfidence` filter, `limit` cap, and deterministic sort | medium |
| T7 | Implement `writeHeuristic` with append-or-update semantics, caller-supplied confidence acceptance, absolute-threshold auto-promotion, and malformed-existing-entry overwrite | medium |
| T8 | Implement `promoteHeuristic`, `demoteHeuristic`, `archiveHeuristic` with edge cases (high no-op, low underflow, archive conflict) | small |
| T9 | Implement `addContradiction` with auto-demotion and contradiction-trumps-underflow archive reason | small |
| T10 | Write `.context-index/memory/heuristics/_format.md` — public schema documentation covering: frontmatter fields, safe-slug validation, confidence lifecycle, promotion/demotion rules, id namespace convention (category prefix for recover, spec-slug prefix for validate), on-disk file layout, and a one-line redaction advisory ("heuristic fields must not contain raw credentials, tokens, or PII; extractors must distill generalizations, not copy literal values from source documents") | medium |
| T11 | Unit tests for parse/serialize round-trip including camelCase ↔ kebab-case conversion | small |
| T12 | Unit tests for read filtering, sorting, limit cap | small |
| T13 | Unit tests for write + auto-promotion at each threshold, including caller-supplied non-`low` initial confidence | medium |
| T14 | Unit tests for contradiction + auto-demotion + auto-archive + low-confidence contradiction reason | medium |
| T15 | Unit tests for atomic write (interruption simulation) and import-safety (missing directory) | small |
| T16 | Unit tests for every error case in the table above, including path-traversal scope/id rejection | medium |

## Acceptance Criteria

- [ ] `lib/heuristics.mjs` exists as pure ESM with named exports only; no CommonJS
- [ ] Only Node.js built-ins are imported, using `node:` prefix (`node:fs/promises`, `node:path`, `node:crypto`)
- [ ] Importing `lib/heuristics.mjs` never throws even when `.context-index/memory/heuristics/` does not yet exist; directory creation is lazy on first write
- [ ] `.context-index/memory/heuristics/_format.md` exists and documents the frontmatter schema, safe-slug validation, confidence lifecycle, promotion/demotion rules, id namespace convention, file layout, and redaction advisory as a public contract
- [ ] In-memory heuristic objects use camelCase keys; on-disk YAML uses kebab-case keys (matches `lib/session-summary.mjs` convention)
- [ ] `readHeuristics` returns an empty array (never throws) for missing module files or unknown scopes
- [ ] `readHeuristics` honors `module`, `minConfidence`, and `limit` options; sort order is deterministic (confidence DESC, then `updated` DESC)
- [ ] Schema validation rejects `scope` values that do not match `/^[_a-z0-9][_a-z0-9-]{0,63}$/` with `HEURISTICS_SCHEMA_ERROR` (path-traversal safe)
- [ ] Schema validation rejects `id` values that do not match the same safe-slug pattern
- [ ] Schema validation rejects `title` > 120 chars and `pattern`/`antiPattern` > 500 chars with `HEURISTICS_SCHEMA_ERROR`
- [ ] `writeHeuristic` accepts caller-supplied initial `confidence` of `low`, `medium`, or `high` for new entries
- [ ] `writeHeuristic` ignores caller-supplied `confidence` on update; stored confidence is authoritative
- [ ] `writeHeuristic` auto-promotes at absolute thresholds based on distinct-path evidence count: `low|medium → medium` at 2 entries, `low|medium → high` at 3 entries
- [ ] Auto-promotion never decreases confidence
- [ ] `writeHeuristic` preserves `created` and refreshes `updated` on update; merges `evidence[]` deduplicated by `(path, date)` (not `source`)
- [ ] `writeHeuristic` overwrites a malformed existing entry with the same id, logs a warning, and completes as an update (no duplicate id)
- [ ] `addContradiction` auto-demotes one level per contradiction and auto-archives at 2 contradictions with reason `"contradicted"`
- [ ] `addContradiction` on a `low`-confidence entry archives with reason `"contradicted"` (not `"demoted-below-low"`)
- [ ] `archiveHeuristic` moves entries to `archive/<scope>-<id>.md` with `archived` and `archivedReason` fields; the original scope file no longer contains the entry
- [ ] `demoteHeuristic` on a `low`-confidence entry auto-archives with reason `"demoted-below-low"`
- [ ] `promoteHeuristic` on a `high`-confidence entry is a no-op
- [ ] All writes are atomic via same-directory temp-file-then-rename (verified by interruption test)
- [ ] Malformed YAML in one entry does not prevent parsing of other entries in the same file
- [ ] All helper functions have JSDoc type annotations
- [ ] Test file at `tests/lib/heuristics.test.mjs` uses `node:test` and the existing `createTempDir()` helper from `tests/helpers.mjs`
- [ ] Test coverage includes every behavior statement, every auto-promotion threshold, the malformed-existing-entry overwrite path, the path-traversal rejection path, and every row in the error case table
- [ ] All quality gates pass (`npm test`)
- [ ] No constitutional violations introduced
