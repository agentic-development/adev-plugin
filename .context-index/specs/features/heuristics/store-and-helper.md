# Live Spec: Heuristic Store Structure and Helper API

<!-- Live Spec within the heuristics charter.
     Phase 1a foundation: on-disk layout, YAML schema, confidence lifecycle,
     and the lib/heuristics.mjs API. Does NOT cover extraction or injection
     points — those are separate specs.
     Parent Charter: .context-index/specs/features/heuristics/charter.md -->

---
charter: heuristics
status: review-blocked
risk_level: medium
milestone: 1a
revision: 1
charter-revision: 2
created: 2026-04-09
updated: 2026-04-09
---

## Behavioral Contract

### Preconditions

- `.context-index/` exists with a valid `manifest.yaml` defining at least one module
- Node.js runtime with ESM support is available
- The invoking skill has read/write access to `.context-index/memory/`

### Behaviors

1. **When** `readHeuristics(projectRoot, { module: 'hooks' })` is called **and** `.context-index/memory/heuristics/hooks.md` exists **then** the helper parses each entry's YAML frontmatter and returns an array of heuristic objects sorted by confidence (`high` → `medium` → `low`) then by `updated` (newest first).
2. **When** `readHeuristics(projectRoot, { module: 'hooks', minConfidence: 'medium' })` is called **then** entries with `confidence: low` are filtered out of the result.
3. **When** `readHeuristics(projectRoot, { module: 'hooks', limit: 5 })` is called **then** no more than 5 entries are returned, with `high` confidence entries preferred over `medium` entries, which are preferred over `low`.
4. **When** `readHeuristics` is called with a `module` value that matches neither an existing file nor `_global` **then** the helper returns an empty array and does not throw.
5. **When** `readHeuristics` is called against a missing or unreadable file **then** the helper logs a single-line warning to stderr and returns an empty array.
6. **When** `writeHeuristic(projectRoot, entry)` is called with a new `id` for its scope **then** the helper appends a new frontmatter-delimited block to `<scope>.md`, creating the file if it does not exist, with `created` and `updated` set to today's date.
7. **When** `writeHeuristic` is called with an `id` that already exists in the scope file **then** the helper updates the existing entry in place, preserves the original `created` timestamp, refreshes `updated`, and merges `evidence[]` in append-only order, deduplicated by the combination of `path` and `date`.
8. **When** a heuristic reaches its 2nd distinct evidence entry as a result of a `writeHeuristic` call **then** the helper auto-promotes its confidence from `low` to `medium`.
9. **When** a heuristic reaches its 3rd evidence entry **and** those 3 entries reference distinct source paths **then** the helper auto-promotes its confidence from `medium` to `high`.
10. **When** `addContradiction(projectRoot, id, evidenceRef)` is called **then** the helper appends `evidenceRef` to the entry's `contradicted-by[]` array and drops its confidence by exactly one level.
11. **When** `addContradiction` is called on an entry whose `contradicted-by[]` length reaches 2 **then** the helper immediately calls `archiveHeuristic` with reason `"contradicted"`.
12. **When** `promoteHeuristic(projectRoot, id)` is called on a `high`-confidence entry **then** the call is a no-op and returns the unchanged entry.
13. **When** `demoteHeuristic(projectRoot, id)` is called on a `low`-confidence entry **then** the helper calls `archiveHeuristic` with reason `"demoted-below-low"`.
14. **When** `archiveHeuristic(projectRoot, id, reason)` is called **then** the helper removes the entry from its scope file, writes a new file at `.context-index/memory/heuristics/archive/<scope>-<id>.md` with `archived` (today's date) and `archived-reason` fields added to its frontmatter, and returns the archived entry.
15. **When** `writeHeuristic` is called **and** the target file write is interrupted **then** the on-disk file is either the pre-write state or the post-write state; no partial writes are ever observable (atomic via temp-file-then-rename).

### Postconditions

- After any successful `writeHeuristic`, `promoteHeuristic`, `demoteHeuristic`, or `addContradiction` call, a subsequent `readHeuristics` call returns the updated state.
- After any successful `archiveHeuristic` call, the entry is absent from its scope file and present as `archive/<scope>-<id>.md`.
- The charter invariants (confidence enum, promotion thresholds, contradicted-by limits, id uniqueness within scope, no orphan entries) always hold after any helper call.
- Schema fields (`id`, `scope`, `title`, `pattern`, `anti-pattern`, `confidence`, `evidence[]`, `contradicted-by[]`, `created`, `updated`) are preserved across round-trip parse → serialize → parse.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `writeHeuristic` called with missing required field (`id`, `scope`, `title`, `pattern`, `confidence`) | Throws `Error("heuristics: missing required field '<field>'")` | `HEURISTICS_SCHEMA_ERROR` |
| `writeHeuristic` called with `confidence` not in `low`/`medium`/`high` | Throws `Error("heuristics: invalid confidence '<value>'")` | `HEURISTICS_SCHEMA_ERROR` |
| `writeHeuristic` called with `scope` that is neither `_global` nor a known module slug | Logs warning to stderr; proceeds anyway (allows future modules) | — |
| `promoteHeuristic` / `demoteHeuristic` / `archiveHeuristic` / `addContradiction` called with unknown `id` | Throws `Error("heuristics: id '<id>' not found in any scope")` | `HEURISTICS_NOT_FOUND` |
| `archiveHeuristic` called on an entry whose archive file already exists | Throws `Error("heuristics: archive conflict for '<id>'")` | `HEURISTICS_ARCHIVE_CONFLICT` |
| Read encounters malformed YAML frontmatter within a scope file | Skips the malformed entry, logs warning to stderr, continues parsing remaining entries | — |
| Write fails due to filesystem error (EACCES, ENOSPC, etc.) | Bubbles the original `fs` error unchanged to the caller | (passthrough) |

## System Constitution Reference

- **Principle 1: Minimize external dependencies** — `lib/heuristics.mjs` uses only `fs/promises`, `path`, and `crypto` from Node.js built-ins. No new npm packages are required or added.
- **Principle 2: Skills are primarily markdown** — The helper is companion code, explicitly permitted by the constitution ("Companion code (helpers, validators) is allowed but must not be required for the skill to function"). Skills that read heuristics must degrade gracefully when the helper or its files are absent.
- **Principle 3: Pure ESM** — The helper is `.mjs` with named exports only. No CommonJS.
- **Coding Standards: camelCase functions, kebab-case files** — API function names follow camelCase (`readHeuristics`, `writeHeuristic`); on-disk file and directory names follow kebab-case (`heuristics/`, `_global.md`, `archive/`).
- **Logging convention** — The helper writes warnings to stderr as single-line messages (matches the pattern in `lib/session-summary.mjs`).

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| T1 | Define JSDoc types for `Heuristic`, `EvidenceRef`, `ReadOptions`, and helper return shapes | small |
| T2 | Implement `parseHeuristicsFile(path)` — split file on frontmatter blocks, parse YAML, return entry array, skip malformed entries with warning | medium |
| T3 | Implement `serializeHeuristic(entry)` — produce the on-disk markdown block (frontmatter + body) | small |
| T4 | Implement atomic write helper (temp-file-then-rename) shared across all write operations | small |
| T5 | Implement `readHeuristics(projectRoot, opts)` with module match, `minConfidence` filter, `limit` cap, and deterministic sort | medium |
| T6 | Implement `writeHeuristic` with append-or-update semantics and auto-promotion logic (behaviors 6-9) | medium |
| T7 | Implement `promoteHeuristic`, `demoteHeuristic`, `archiveHeuristic` with edge cases (behaviors 12-14) | small |
| T8 | Implement `addContradiction` with auto-demotion and auto-archive-at-2 logic (behaviors 10-11) | small |
| T9 | Write `.context-index/memory/heuristics/_format.md` — public schema documentation covering frontmatter fields, confidence lifecycle, promotion/demotion rules, and file layout | small |
| T10 | Unit tests for parse/serialize round-trip (covers Behavior 1 and Postcondition 4) | small |
| T11 | Unit tests for read filtering and sorting (Behaviors 1-5) | small |
| T12 | Unit tests for write + auto-promotion (Behaviors 6-9) | medium |
| T13 | Unit tests for contradiction + auto-demotion + auto-archive (Behaviors 10-11) | medium |
| T14 | Unit tests for atomic write interruption and promote/demote/archive edge cases (Behaviors 12-15) | small |
| T15 | Unit tests for every error case in the table above | small |

## Acceptance Criteria

- [ ] `lib/heuristics.mjs` exists as pure ESM with named exports only; no CommonJS
- [ ] Only Node.js built-ins are imported (`fs/promises`, `path`, `crypto`)
- [ ] `.context-index/memory/heuristics/_format.md` exists and documents the frontmatter schema, confidence lifecycle, promotion/demotion rules, and on-disk file layout as a public contract
- [ ] `readHeuristics` returns an empty array (never throws) for missing module files or unknown scopes
- [ ] `readHeuristics` honors `module`, `minConfidence`, and `limit` options; sort order is deterministic (confidence DESC, then `updated` DESC)
- [ ] `writeHeuristic` auto-promotes `low → medium` at 2 evidence entries and `medium → high` at 3 distinct-path evidence entries
- [ ] `writeHeuristic` preserves `created` and refreshes `updated` on update; merges `evidence[]` deduplicated by `(path, date)`
- [ ] `addContradiction` auto-demotes one level per contradiction and auto-archives at 2 contradictions with reason `"contradicted"`
- [ ] `archiveHeuristic` moves entries to `archive/<scope>-<id>.md` with `archived` and `archived-reason` fields; the original scope file no longer contains the entry
- [ ] `demoteHeuristic` on a `low`-confidence entry auto-archives with reason `"demoted-below-low"`
- [ ] `promoteHeuristic` on a `high`-confidence entry is a no-op
- [ ] All writes are atomic via temp-file-then-rename (verified by interruption test)
- [ ] Schema validation rejects missing required fields and invalid confidence values with `HEURISTICS_SCHEMA_ERROR`
- [ ] `promoteHeuristic` / `demoteHeuristic` / `archiveHeuristic` / `addContradiction` throw `HEURISTICS_NOT_FOUND` for unknown ids
- [ ] Malformed YAML in one entry does not prevent parsing of other entries in the same file
- [ ] All helper functions have JSDoc type annotations
- [ ] Test file at `tests/lib/heuristics.test.mjs` uses `node:test` and the existing `createTempDir()` helper from `tests/helpers.mjs`
- [ ] Test coverage includes every behavior statement and every row in the error case table
- [ ] All quality gates pass (`npm test`)
- [ ] No constitutional violations introduced
