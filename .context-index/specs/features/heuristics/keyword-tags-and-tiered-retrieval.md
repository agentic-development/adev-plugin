# Live Spec: Keyword Tags and Tiered Retrieval

<!-- Live Spec within the heuristics charter.
     Adds the `tags` schema field, tiered rendering (index/summary/full), and keyword
     matching to `retrieveHeuristics`. Foundation for progressive disclosure.
     Parent Charter: .context-index/specs/features/heuristics/charter.md -->

---
charter: heuristics
status: review-pending
risk_level: medium
milestone: 2
revision: 1
charter-revision: 5
created: 2026-04-23
updated: 2026-04-23
---

## Behavioral Contract

### Preconditions

- `lib/heuristics.mjs` is importable (Phase 1 validated)
- `.context-index/memory/heuristics/` directory exists with at least one scope file
- Existing heuristic entries may or may not have `tags` — the field is optional and backward-compatible

### Behaviors

1. **When** a heuristic entry includes a `tags` field in its YAML frontmatter **then** `parseHeuristicsFile` parses it as a string array and includes it in the returned heuristic object.

2. **When** a heuristic entry has no `tags` field **then** `parseHeuristicsFile` returns `tags` as an empty array (not `undefined`), ensuring callers can always iterate without null checks.

3. **When** `tags` contains entries with uppercase letters, spaces, or characters outside `[a-z0-9-]` **then** `validateEntry` rejects with error code `INVALID_TAGS` and a message listing the offending tag values.

4. **When** `writeHeuristic` is called with a `tags` array **then** `serializeHeuristic` writes `tags:` as a YAML flow sequence (e.g., `tags: [auth, middleware, database]`) in the frontmatter block.

5. **When** `writeHeuristic` is called with an empty `tags` array or no `tags` field **then** `serializeHeuristic` omits the `tags:` line from the frontmatter (not written as `tags: []`).

6. **When** `retrieveHeuristics` is called with `tier: 'index'` **then** `renderHeuristic` returns a single line per entry: `- <title> (<scope>, <confidence>)` — approximately 5 tokens per heuristic.

7. **When** `retrieveHeuristics` is called with `tier: 'summary'` or no `tier` parameter **then** `renderHeuristic` returns the existing format: heading with title and confidence, pattern line, anti-pattern line (if present), and evidence count — approximately 40 tokens per heuristic. This is the default tier for backward compatibility.

8. **When** `retrieveHeuristics` is called with `tier: 'full'` **then** `renderHeuristic` returns all fields: title, confidence, scope, tags, pattern, anti-pattern, evidence list with paths and dates, and contradictions — approximately 100 tokens per heuristic.

9. **When** `retrieveHeuristics` is called with `keywords: ['auth', 'middleware']` **then** entries whose `tags`, `title`, or `pattern` fields contain any of the keywords (case-insensitive substring match) receive a relevance boost and sort before non-matching entries at the same confidence level.

10. **When** keywords are provided but no entries match any keyword **then** retrieval falls back to the existing confidence/scope/recency sort without excluding any entries. Keywords refine ranking, they never filter.

11. **When** `tier` is provided with an invalid value (not `index`, `summary`, or `full`) **then** `retrieveHeuristics` falls back to `summary` tier and logs a single-line warning. It does not throw.

### Postconditions

- All existing callers of `retrieveHeuristics` (plan, implement) continue to work without changes — `tier` defaults to `summary`, `keywords` defaults to empty
- Heuristic files with `tags` round-trip through parse → serialize without data loss
- Heuristic files without `tags` are unmodified by read/write cycles

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `tags` array contains invalid entry (uppercase, spaces, special chars) | `validateEntry` throws | `INVALID_TAGS` |
| `tags` is not an array (e.g., string, number) | `validateEntry` throws | `INVALID_TAGS` |
| Invalid `tier` value | Falls back to `summary`, logs warning | N/A (no throw) |
| `keywords` is not an array | Treated as empty array, no error | N/A (no throw) |

## System Constitution Reference

- **Principle 1:** "Minimize external dependencies" — Keyword matching uses simple substring matching on existing fields, no NLP library or embedding service needed.
- **Principle 3:** "Pure ESM" — All additions to `lib/heuristics.mjs` remain ESM exports.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Add `tags` to JSDoc typedef | Extend `Heuristic` typedef with `tags: string[]` | small |
| Update `parseHeuristicsFile` | Parse `tags` from YAML frontmatter, default to `[]` | small |
| Update `serializeHeuristic` | Write `tags` as YAML flow sequence, omit if empty | small |
| Update `validateEntry` | Add tag format validation (`[a-z0-9-]`) | small |
| Add `tier` parameter to `renderHeuristic` | Three rendering modes: index, summary, full | medium |
| Add `keywords` and `tier` to `retrieveHeuristics` | Keyword matching with relevance boost, pass tier through to render | medium |
| Update `_format.md` | Document `tags` field and tiered retrieval in public schema | small |
| Tests: tag parse/serialize round-trip | Edge cases: empty, single, many, invalid chars | small |
| Tests: tiered rendering output | Verify token-approximate output for each tier | small |
| Tests: keyword matching ranking | Verify boost, fallback, multi-keyword, no-match | medium |

## Acceptance Criteria

- [ ] `tags` field parses correctly from YAML frontmatter and round-trips through serialize
- [ ] Heuristic entries without `tags` default to empty array, no breakage
- [ ] `validateEntry` rejects tags with uppercase, spaces, or special characters
- [ ] `renderHeuristic` produces correct output for all three tiers (index, summary, full)
- [ ] `retrieveHeuristics` accepts `tier` and `keywords` parameters
- [ ] Keyword matching boosts relevant entries without filtering non-matches
- [ ] Existing callers (plan, implement injection) work without modification
- [ ] `_format.md` updated with `tags` field documentation
- [ ] All quality gates pass (tests, lint)
- [ ] No constitutional violations introduced
