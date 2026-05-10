# Implementation Plan: Keyword Tags and Tiered Retrieval

> **Methodology:** adev
> **Charter:** .context-index/specs/features/heuristics/charter.md
> **Spec:** .context-index/specs/features/heuristics/keyword-tags-and-tiered-retrieval.spec.md
> **Review:** PASS_WITH_NOTES (2026-04-23)
> **Platform:** Node.js, JavaScript ESM, node:test

**Goal:** Add `tags` field to heuristic schema and tiered progressive disclosure (index/summary/full) with keyword matching to `retrieveHeuristics`.

**Architecture:** Extends `lib/heuristics.mjs` — the existing validated Phase 1 module. Changes touch `validateEntry`, `serializeHeuristic`, `parseYamlBlock`, `renderHeuristic`, and `retrieveHeuristics`. No new files or dependencies. The `FIELD_ORDER` array gains `tags` between `antiPattern` and `confidence`.

---

## File Structure

**Modify:**
- `lib/heuristics.mjs` — Add tags to schema, tiered rendering, keyword matching
- `.context-index/memory/heuristics/_format.md` — Document tags field and tiered retrieval

**Create:**
- `tests/lib/heuristics-tags-and-tiers.test.mjs` — Tests for tags, tiered rendering, keyword matching

**Reference (read, do not modify):**
- `tests/lib/heuristics.test.mjs` — Follow existing test patterns
- `.context-index/specs/features/heuristics/retrieval-filtering.spec.md` — Budget cap and sort order contract

## Context Packets

### Task 1 Context
- Spec: `keyword-tags-and-tiered-retrieval.md` (criteria 1-3)
- Charter: `charter.md` (capability: Keyword Tags)
- Reference: `lib/heuristics.mjs:16-36` (Heuristic typedef)
- Reference: `lib/heuristics.mjs:100-138` (validateEntry)

### Task 2 Context
- Spec: `keyword-tags-and-tiered-retrieval.md` (criteria 1-2)
- Reference: `lib/heuristics.mjs:265-350` (parseYamlBlock)
- Reference: `lib/heuristics.mjs:191-235` (serializeHeuristic)

### Task 3 Context
- Spec: `keyword-tags-and-tiered-retrieval.md` (criteria 4)
- Reference: `lib/heuristics.mjs:1114-1125` (renderHeuristic)

### Task 4 Context
- Spec: `keyword-tags-and-tiered-retrieval.md` (criteria 5-6)
- Reference: `lib/heuristics.mjs:1036-1106` (retrieveHeuristics)

### Task 5 Context
- Spec: `keyword-tags-and-tiered-retrieval.md` (criteria 8)
- Reference: `.context-index/memory/heuristics/_format.md`

## Parallelization

- Group A (sequential): Task 1 → Task 2 (schema changes first)
- Group B (sequential): Task 3 → Task 4 (tiered render before keyword matching)
- Group A and B can run in parallel after Task 1 completes
- Task 5: independent, can run in parallel with any group

---

### Task 1: Tags Schema — Typedef, Validation, Constants [specialist: none]

**Charter capability:** Keyword Tags
**Strategy:** unit (source: spec-declared, confidence: high)
**Files:**
- Modify: `lib/heuristics.mjs:16-36` (Heuristic typedef)
- Modify: `lib/heuristics.mjs:100-138` (validateEntry)
- Modify: `lib/heuristics.mjs:163-176` (FIELD_ORDER)
- Test: `tests/lib/heuristics-tags-and-tiers.test.mjs`

**Tests:** `tests/lib/heuristics-tags-and-tiers.test.mjs`

- [ ] **Write failing test**

```javascript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateEntry } from "../../lib/heuristics.mjs";

describe("tags validation", () => {
  const base = { id: "test", scope: "cli", title: "T", pattern: "P", confidence: "low", evidence: [], contradictedBy: [] };

  it("accepts valid tags array", () => {
    assert.doesNotThrow(() => validateEntry({ ...base, tags: ["auth", "db"] }));
  });
  it("rejects uppercase tags", () => {
    assert.throws(() => validateEntry({ ...base, tags: ["Auth"] }), { code: "INVALID_TAGS" });
  });
  it("rejects non-array tags", () => {
    assert.throws(() => validateEntry({ ...base, tags: "auth" }), { code: "INVALID_TAGS" });
  });
  it("rejects tags exceeding 64 chars", () => {
    assert.throws(() => validateEntry({ ...base, tags: ["a".repeat(65)] }), { code: "INVALID_TAGS" });
  });
  it("rejects more than 20 tags", () => {
    assert.throws(() => validateEntry({ ...base, tags: Array.from({length:21}, (_,i) => `t-${i}`) }), { code: "INVALID_TAGS" });
  });
  it("accepts empty tags array", () => {
    assert.doesNotThrow(() => validateEntry({ ...base, tags: [] }));
  });
  it("accepts entry without tags", () => {
    assert.doesNotThrow(() => validateEntry(base));
  });
});
```

- [ ] **Verify test fails** — Run: `node --test tests/lib/heuristics-tags-and-tiers.test.mjs`
- [ ] **Implement** — Add `tags` to JSDoc typedef. Add `"tags"` to FIELD_ORDER. Add tag validation to `validateEntry`: check array type, length cap 20, per-tag `/^[a-z0-9][a-z0-9-]{0,63}$/` and error code `INVALID_TAGS`.
- [ ] **Verify test passes**
- [ ] **Commit:** `feat(heuristics): add tags field schema and validation`

---

### Task 2: Tags Parse and Serialize [specialist: none]

**Charter capability:** Keyword Tags
**Strategy:** unit (source: spec-declared, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: `lib/heuristics.mjs` (parseYamlBlock, serializeHeuristic)
- Test: `tests/lib/heuristics-tags-and-tiers.test.mjs`

**Tests:** `tests/lib/heuristics-tags-and-tiers.test.mjs`

- [ ] **Write failing test** — Round-trip: write with tags `[auth, db]`, read back, verify array. Write without tags, verify default `[]`. Verify serialized output omits `tags:` when empty.
- [ ] **Verify test fails**
- [ ] **Implement** — In `serializeHeuristic`: emit `tags: [val1, val2]` flow sequence, skip if empty/absent. In `parseYamlBlock`: detect flow sequences via `parseFlowSequence` for top-level keys. Post-parse: default `tags` to `[]` if undefined.
- [ ] **Verify test passes**
- [ ] **Commit:** `feat(heuristics): parse and serialize tags as YAML flow sequence`

---

### Task 3: Tiered Rendering in renderHeuristic [specialist: none]

**Charter capability:** Tiered Retrieval
**Strategy:** unit (source: spec-declared, confidence: high)
**Files:**
- Modify: `lib/heuristics.mjs:1114-1125` (renderHeuristic)
- Test: `tests/lib/heuristics-tags-and-tiers.test.mjs`

**Tests:** `tests/lib/heuristics-tags-and-tiers.test.mjs`

- [ ] **Write failing test** — Index tier: single line `- Title (scope) — pattern...`. Summary tier: existing format (default). Full tier: includes tags, evidence details, contradictions.
- [ ] **Verify test fails**
- [ ] **Implement** — Add `tier = "summary"` parameter. Add private `truncate(str, 80)` helper. Index: one-line format. Summary: unchanged. Full: all fields expanded.
- [ ] **Verify test passes**
- [ ] **Commit:** `feat(heuristics): add tiered rendering to renderHeuristic`

---

### Task 4: Keyword Matching and Tier in retrieveHeuristics [specialist: none]

**Charter capability:** Tiered Retrieval
**Strategy:** unit (source: spec-declared, confidence: high)
**Depends on:** Task 3
**Files:**
- Modify: `lib/heuristics.mjs:1036-1106` (retrieveHeuristics)
- Test: `tests/lib/heuristics-tags-and-tiers.test.mjs`

**Tests:** `tests/lib/heuristics-tags-and-tiers.test.mjs`

- [ ] **Write failing test** — Keyword boost: matching entries sort before non-matching at same confidence. Non-matching entries preserved. No-match keywords: fallback to normal sort. Invalid tier: no throw, fallback. Keywords capped at 10.
- [ ] **Verify test fails**
- [ ] **Implement** — Add `tier` and `keywords` to destructured options. Validate/normalize both. Compute `_keywordMatch` per entry (case-insensitive substring against tags/title/pattern). Insert into sort comparator after confidence, before scope priority. Strip internal fields from result.
- [ ] **Verify test passes**
- [ ] **Commit:** `feat(heuristics): add keyword matching and tier to retrieveHeuristics`

---

### Task 5: Update _format.md Documentation [specialist: none]

**Charter capability:** Keyword Tags, Tiered Retrieval
**Strategy:** unit (source: spec-declared, confidence: high)
**Files:**
- Modify: `.context-index/memory/heuristics/_format.md`
- Test: `tests/lib/heuristics-format-doc.test.mjs`

**Tests:** `tests/lib/heuristics-format-doc.test.mjs`

- [ ] **Write failing test** — Assert _format.md mentions `tags`, `[a-z0-9-]`, tiered rendering.
- [ ] **Verify test fails**
- [ ] **Implement** — Document tags field, validation rules, tiered rendering formats, keywords parameter.
- [ ] **Verify test passes**
- [ ] **Commit:** `docs(heuristics): document tags and tiered retrieval in _format.md`

---

## Quality Gates

- Tests pass: `npm test`
- All acceptance criteria from spec satisfied
- Existing heuristic tests still pass (backward compatibility)
