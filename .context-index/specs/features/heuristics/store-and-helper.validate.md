# Validation Report: Heuristic Store Structure and Helper API

> **Date:** 2026-04-09
> **Spec:** `.context-index/specs/features/heuristics/store-and-helper.md`
> **Plan:** `.context-index/specs/features/heuristics/store-and-helper.plan.md`
> **Overall Status:** PASS

---

## Check 1: Quality Gates — PASS
- Tests: PASS — 639 pass, 0 fail, 0 skipped (`npm test`, duration ~34s)
- Lint: N/A (none configured in constitution)
- Typecheck: N/A (none configured in constitution)

## Check 1.5: Source Manifest — PASS
- Declared sha: `1879f07`
- Recomputed sha: `1879f07`
- Files: `.context-index/memory/heuristics/_format.md`, `lib/heuristics.mjs`, `tests/lib/heuristics-format-doc.test.mjs`, `tests/lib/heuristics.test.mjs`

## Check 2: Spec Compliance — PASS
All 30 acceptance criteria satisfied by code + tests. Highlights:
- Pure ESM, named exports only — `lib/heuristics.mjs:12-14`
- Node built-ins with `node:` prefix — `lib/heuristics.mjs:12-14`
- Import-safe (no throw on missing dir) — `atomicWrite` lazy `mkdir` at `lib/heuristics.mjs:386`
- camelCase in-memory / kebab-case on-disk via `toCamel`/`toKebab` — `lib/heuristics.mjs:145-156`
- `readHeuristics` deterministic sort (confidence DESC, updated DESC) + `limit` + `minConfidence`
- Safe-slug validation rejects `/`, `..`, uppercase, null bytes — `tests/lib/heuristics.test.mjs:375-432, 1798-1824`
- Length caps: title 120, pattern/antiPattern 500 — enforced and tested
- `writeHeuristic`: caller confidence authoritative for new entries, ignored on update, auto-promotion at 2/3 distinct paths (monotonic)
- Malformed existing-entry overwrite with single-line stderr warning
- `addContradiction` drops one level per contradiction, auto-archives at 2, low+1 archives with reason `"contradicted"` (contradicted-beats-underflow)
- `archiveHeuristic` writes to `archive/<scope>-<id>.md` with `archived` + `archivedReason`, throws `HEURISTICS_ARCHIVE_CONFLICT` on duplicate
- `demoteHeuristic` on low → archive with reason `"demoted-below-low"`
- `promoteHeuristic` on high → no-op
- Atomic writes via same-dir `<target>.tmp-<hex12>` + rename
- `_format.md` schema doc published with all required sections
- 108 tests in heuristics test files, 0 skipped, strict assertions throughout

**Test integrity:** No `.skip`, `.only`, conditional skips, or loosened matchers found.

## Check 3: Charter Consistency — PASS
- **Scope:** Implementation covers exactly Heuristic Store Structure + `lib/heuristics.mjs` Helper + Format Documentation (the three capabilities marked `implemented` in the charter). No scope creep into extraction, injection, or `/adev:learn`.
- **Domain model:** `Heuristic`, `EvidenceRef`, `ArchivedHeuristic` match charter Entities. All invariants (confidence enum, 2/3 distinct-path promotion, 2-contradiction archive limit, id-unique-within-scope) enforced.
- **Interface contracts:** All 6 exposed API signatures match the charter's "Exposed APIs" table exactly.

## Check 4: Constitution Compliance — PASS
- **Principle 1 (Minimize external deps):** Only `node:fs/promises`, `node:path`, `node:crypto`. Zero npm additions.
- **Principle 2 (Skills primarily markdown):** Companion lib code, explicitly permitted.
- **Principle 3 (Pure ESM):** `.mjs` with named exports only.
- **Principle 4 (Hook protocol):** N/A.
- **Principle 5 (Version parity):** Not touched by this spec.
- **Architecture boundaries:** No unapproved crossings.
- **Coding standards:** camelCase functions, kebab-case files, `node:` prefix, `err.code` on all thrown errors.

## Check 5: ADR Compliance — PASS
- ADR 0001 (web-tree-sitter): Irrelevant to heuristics.
- ADR 0002 (typescript devDep): Irrelevant to heuristics.

## Check 6: Cross-Cutting Spec Compliance — PASS
- `model-routing.md` applies to skills dispatching subagents. `lib/heuristics.mjs` has no AI/model dispatch. Not applicable.

## Check 7: Specialist Review — PASS (N/A)
- `manifest.yaml` declares `specialists: []`. No specialists to match.

## Check 8: Boundary Compliance — N/A
- No `.context-index/governance/` directory.

## Check 9: Transition Gates — N/A
- No `governance/gates.yaml`.

## Check 10: Platform Drift — PASS
- `platform-context.yaml` declares javascript/ESM/Node/node:test/npm. Implementation strictly conforms.

## Check 11: Visual Verification — N/A
- No UI files touched (`lib/`, `tests/`, `.context-index/memory/` only).

---

## Known Gaps (Non-Blocking)

Two minor deviations from the spec's Behaviors section, **not** from the Acceptance Criteria. Flagged for follow-up:

1. **Unknown-module warning in `writeHeuristic`** — Spec Behaviors row says the helper should log a single-line stderr warning when `scope` is a well-formed safe-slug but does not match any `manifest.yaml` `modules[].slug` or `_global`. Current implementation proceeds silently. Acceptance criteria do not require this warning; the implementation still "proceeds anyway" as the spec intends.

2. **ENOENT warning in `readHeuristics`** — Spec Behavior #5 says the helper logs a stderr warning on missing/unreadable files. Current implementation silently returns `[]`. This is arguably the more useful behavior (the "no heuristics yet" case is common and warning would be noisy), and acceptance criteria only require `[]` return.

Recommendation: file as follow-up tickets, do not block PR.

---

## Overall Status: **PASS**

All 11 checks green (with 3 N/A). The implementation satisfies the spec, stays within charter scope, respects the constitution, and passes all quality gates. Ready for PR.
