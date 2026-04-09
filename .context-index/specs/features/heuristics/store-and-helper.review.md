# Architecture Review: store-and-helper

> **Date:** 2026-04-09
> **Spec:** .context-index/specs/features/heuristics/store-and-helper.md
> **Charter:** .context-index/specs/features/heuristics/charter.md
> **Verdict:** BLOCK
> **last-reviewed-revision:** 1
> **file-sha:** 6f6cff31d4bbebd54e5d3de0cb88b825cf86eb91

## Structural Architect

**Verdict:** PASS_WITH_NOTES

- **SA-1** [warning] [Behaviors 8-9] — Auto-promotion thresholds: Behavior 8 does not require distinctness for the `low → medium` transition (two evidence entries from the same source would promote). Charter invariant says "distinct tasks"; spec says "distinct source paths" for the `medium → high` transition but is silent for `low → medium`. Recommendation: Require distinctness for both transitions and align language with the charter.
- **SA-2** [warning] [Behaviors 10-13] — The interaction between `addContradiction` and a `low`-confidence entry is ambiguous. Behavior 10 drops confidence "by exactly one level" which on a `low` entry would trigger the `demoteHeuristic` underflow path (Behavior 13) producing archive reason `"demoted-below-low"` instead of `"contradicted"`. Recommendation: add a behavior clarifying that contradictions on `low`-confidence entries archive with reason `"contradicted"` regardless.
- **SA-3** [suggestion] [Interface Contracts] — No consolidated API signature table. Consumers would benefit from a JSDoc-shaped signature block.
- **SA-4** [suggestion] [Behavior 15] — Concurrent-write behavior is unspecified. Recommendation: declare single-writer assumption or explicit last-write-wins via rename semantics.
- **SA-5** [suggestion] [Domain Model] — `title` appears in postconditions and required-field list but never in a behavior. Recommendation: add an explicit behavior referencing `title` as a required field on write.

## Security Reviewer

**Verdict:** BLOCK (reviewer marked warning, but SEC-1 and SEC-2 are unmitigated path-traversal vectors and raised to blocker per review consolidation)

- **SEC-1** [blocker] [file-path-safety] — Error Cases row 3 allows `writeHeuristic` to proceed when `scope` is not `_global` and not a known module slug. Because `scope` is used directly in the file path (`<scope>.md`) and the archive path (`archive/<scope>-<id>.md`), an unvalidated value like `"../../../etc/passwd"` would write outside `.context-index/memory/heuristics/`. Recommendation: Reject any `scope` value whose `path.basename(scope)` differs from the original, or that contains `/`, `..`, or null bytes. Throw `HEURISTICS_SCHEMA_ERROR`. Unknown-but-well-formed slugs may still pass through with a warning (the "allow future modules" intent is preserved).
- **SEC-2** [blocker] [file-path-safety] — The `id` field is used directly in archive filenames (`archive/<scope>-<id>.md`) without validation. Same path-traversal risk as SEC-1. Recommendation: Add a format check — `id` must match `/^[a-z0-9][a-z0-9\-]{0,63}$/` — and reject with `HEURISTICS_SCHEMA_ERROR` on violation.
- **SEC-3** [warning] [atomicity] — Temp file placement is not specified. Cross-device renames fail on Linux. Recommendation: Specify that the temp file must be created in the same directory as the target (e.g., `<scope>.md.tmp` adjacent to `<scope>.md`).
- **SEC-4** [suggestion] [dos] — No bounds on entries per scope file or on field sizes. Recommendation: Note that `/adev:retro` consolidation is the intended size-management mechanism; optionally add a configurable `max_active` manifest key.
- **SEC-5** [warning] [data-exposure] — No redaction guidance. Heuristics are git-tracked; a captured credential becomes durable. Recommendation: Add a guidance note that extractors must distill generalizations, not copy literal values from source documents.

## Consistency Analyzer

**Verdict:** BLOCK (CON-17 is a blocker cross-spec finding affecting this spec)

- **CON-1** [suggestion] [naming] — Import list uses bare specifiers (`fs/promises`, `path`, `crypto`); existing helpers use `node:` prefix. Recommendation: use `node:fs/promises`, `node:path`, `node:crypto`.
- **CON-2** [suggestion] [pattern] — Sync vs async ambiguity. `lib/execution-state.mjs` uses sync `writeFileSync` + `renameSync`. Recommendation: standardize on sync API for atomic writes in T4.
- **CON-3** [warning] [pattern] — Spec does not state whether in-memory heuristic objects use camelCase keys (like `execution-state.mjs`) or kebab-case (YAML wire format). Recommendation: "In-memory heuristic objects use camelCase keys; serializer converts to kebab-case on write" — matches `session-summary.mjs` pattern.
- **CON-4** [warning] [charter-alignment] — `_format.md` is listed as a required deliverable in Acceptance Criteria but the charter marks it as `nice-to-have / Phase 2`. Recommendation: Bump the charter capability to `must-have / Phase 1` — the format doc is part of the public contract.
- **CON-5** [suggestion] [terminology] — Charter says "distinct tasks"; spec says "distinct source paths" (CON-5 and SA-1 are the same finding from different reviewers).
- **CON-17** [blocker] [contract] — Update path does not address the case where an existing entry with the same id has malformed YAML. Would silently create a duplicate id, violating the uniqueness invariant. Recommendation: Add explicit behavior — "on update, if the existing entry's YAML is malformed, overwrite the malformed block with the new entry and log a warning."

## Cross-Spec Findings affecting this spec

- **SA-14** [blocker] [store-and-helper + validate-extraction] — API contract gap: the spec does not clarify whether `writeHeuristic` accepts a caller-supplied initial confidence (e.g., `medium`) and whether auto-promotion thresholds are absolute (based on evidence count) regardless of starting confidence. `validate-extraction` starts at `medium` and expects auto-promotion to `high` at the 3rd distinct-path recurrence — not currently guaranteed by this spec. Recommendation: Add a behavior — "Auto-promotion thresholds are absolute: an entry at `medium` with 3 distinct-path evidence entries is promoted to `high`; an entry already at `high` is a no-op; auto-promotion never decreases confidence."
- **SA-19** [warning] — No acceptance criterion stating `lib/heuristics.mjs` is safely importable when `.context-index/memory/heuristics/` does not yet exist. Recommendation: Add AC — "importing the module never throws; directory creation is lazy on first write."
- **SEC-12** [warning] [data-exposure] — Heuristics are git-tracked; committed secrets are durable. Recommendation: Add a one-line advisory to `_format.md`.
- **SEC-14** [suggestion] [dos] — No field-length caps. Recommendation: Add schema caps (title ≤ 120, pattern/anti-pattern ≤ 500) with `HEURISTICS_SCHEMA_ERROR` on violation.

---

## Summary

**Total findings:** 17 (3 blockers, 7 warnings, 7 suggestions)

**Blockers (must address before planning):**
- **SA-14** — Document absolute-threshold auto-promotion semantics for callers supplying non-`low` initial confidence
- **SEC-1** — Validate `scope` to prevent path traversal; reject values containing `/`, `..`, or null bytes
- **SEC-2** — Validate `id` with a strict slug pattern (`/^[a-z0-9][a-z0-9\-]{0,63}$/`)
- **CON-17** — Define behavior for updating an entry with a pre-existing malformed YAML block in the scope file

**Action required:** Revise store-and-helper.md to address the blockers and warnings. Re-run `/adev:review-specs --spec .context-index/specs/features/heuristics/store-and-helper.md` once revised.
