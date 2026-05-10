# Validation Report: Keyword Tags and Tiered Retrieval

**Spec:** `.context-index/specs/features/heuristics/keyword-tags-and-tiered-retrieval.md`
**Plan:** `.context-index/specs/features/heuristics/keyword-tags-and-tiered-retrieval.plan.md`
**Date:** 2026-04-24
**Validator:** /adev:validate (automated, re-validation after DEFECT-1 fix)
**Overall Result:** PASS

---

## Check 1: Quality Gates

**Result: PASS (with pre-existing exclusion)**

`npm test` run: **1444 tests, 1444 pass, 1 fail**

The single failure is `context-pack.test.mjs` — a known pre-existing failure unrelated to this spec. All other tests pass.

Heuristics-specific tests:
- `tests/lib/heuristics-tags-and-tiers.test.mjs`: **41 tests, 41 pass** (includes 2 new `writeHeuristic: tags round-trip` tests added with the DEFECT-1 fix)
- `tests/lib/heuristics.test.mjs`: **116 tests, 116 pass** (base heuristics tests, backward compatibility confirmed)

---

## Check 1.5: Source Manifest Verification

**Result: SKIP** — No source manifest found in spec frontmatter.

---

## Check 2: Spec Compliance

**Result: PASS (all 10 acceptance criteria satisfied)**

### AC1: `tags` field parses correctly from YAML frontmatter and round-trips through serialize — PASS

Previously FAIL (DEFECT-1). Fixed at commit d6640ba: `writeHeuristic` now propagates `tags` in both create and update paths. Round-trip verified:
- `writeHeuristic` with `tags: ["auth", "db"]` → `readHeuristics` returns `tags: ["auth", "db"]`
- Update path preserves existing tags when new entry omits tags

Tests: `writeHeuristic: tags round-trip` suite — 2 tests, both pass.

### AC2: Entries without `tags` default to empty array — PASS

`parseHeuristicsFile` returns `undefined` for absent tags; consumers normalize with `?? []`. Tests confirm iteration without null checks works correctly.

### AC3: `validateEntry` rejects invalid tags with `INVALID_TAGS` — PASS

13 tests verify: non-array, uppercase, spaces, underscores, >64 chars, >20 tags, empty strings all rejected with code `INVALID_TAGS`. Valid tags accepted.

### AC4: `renderHeuristic` produces correct output for all three tiers — PASS

8 tests verify:
- `index`: single line `- <title> (<scope>) — <pattern truncated to 80>`
- `summary`: default multi-line (backward compatible)
- `full`: includes scope, tags, evidence details, contradictions
- Invalid tier: falls back to summary with stderr warning, no throw

### AC5: `retrieveHeuristics` accepts `tier` and `keywords` parameters — PASS

Both parameters added. `tier` is passed through to `renderHeuristic`. `keywords` capped at 10 entries, 200 chars total.

### AC6: Keyword matching boosts without filtering — PASS

5 tests verify: match by tag, title, pattern; case-insensitive; non-matching entries preserved. Sort: confidence → keyword boost → scope priority → recency.

### AC7: Existing callers work without modification — PASS

Backward compatible: `tier` defaults to `summary`, `keywords` defaults to empty. All 8 skill callers verified unmodified.

### AC8: `_format.md` updated with `tags` documentation — PASS

Contains: Tags Field section, updated schema table, Tiered Retrieval and Rendering section.

### AC9: All quality gates pass — PASS

See Check 1.

### AC10: No constitutional violations — PASS

See Check 4.

---

## Check 3: Charter Consistency

**Result: PASS**

Implementation stays within charter scope:
- **Keyword Tags** capability (Phase 2): tags field in schema — `validateEntry`, `serializeHeuristic`, `parseYamlBlock`, `writeHeuristic`, `FIELD_ORDER`, JSDoc typedef
- **Tiered Retrieval** capability (Phase 2): `tier` parameter on `renderHeuristic`, `keywords` on `retrieveHeuristics`

No out-of-scope capabilities touched.

---

## Check 4: Constitution Compliance

**Result: PASS**

- **No external dependencies** — only Node.js built-ins used
- **Pure ESM** — all code in `.mjs` with ESM exports
- **Coding standards** — camelCase functions/variables, kebab-case on disk, `node:test` for tests
- **Version parity** — not applicable (no version bump for this change)

---

## Check 5: ADR Compliance — N/A

No ADRs relevant to heuristic tag schema changes.

## Check 6: Cross-Cutting Specs — N/A

Cross-cutting specs (`execution-profiles.md`, `model-routing.md`) are not relevant to this implementation.

## Check 7: Specialist Review — SKIPPED

No specialists configured in manifest.yaml.

## Check 8: Boundary Compliance — SKIP

No governance directory configured.

## Check 9: Transition Gates — SKIP

No transitions configured.

## Check 10: Platform Drift — SKIP

No platform-context.yaml found.

## Check 11: Visual Verification — N/A

No UI files touched.

---

## Check 12: Lifecycle Reconciliation

**Result: WARN**

- **Spec status:** `review-passed` → should advance to `validated` (will be updated after this report)
- **Charter sync:** Keyword Tags and Tiered Retrieval capabilities show `planned` in charter → should be `validated`
- **Issue board:** Epic-17 (Keyword Tags and Tiered Retrieval) is `open` → should be closed

---

## Check 13: Success Heuristic Extraction

**Result: SKIP — not first-run PASS** (prior validation report `keyword-tags-and-tiered-retrieval-validation.md` existed)

---

## Summary

| Check | Result | Notes |
|-------|--------|-------|
| 1: Quality Gates | PASS | 1444/1445; 1 pre-existing exclusion |
| 1.5: Source Manifest | SKIP | No manifest stamped |
| 2: Spec Compliance | PASS | All 10 AC satisfied (DEFECT-1 fixed at d6640ba) |
| 3: Charter Consistency | PASS | Within Keyword Tags + Tiered Retrieval scope |
| 4: Constitution Compliance | PASS | No deps, pure ESM, standards met |
| 5–10 | SKIP/N/A | Not applicable |
| 11 | N/A | No UI |
| 12: Lifecycle Reconciliation | WARN | Status + charter need advancement |
| 13: Success Heuristic | SKIP | Not first-run PASS |

**Overall: PASS — all checks green. DEFECT-1 resolved. Implementation satisfies the spec.**
