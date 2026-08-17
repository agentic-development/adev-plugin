---
charter: heuristics
status: validated
risk_level: low
milestone:
revision: 1
charter-revision: 5
created: 2026-04-12
updated: 2026-04-12
source-manifest:
  sha: "888c762"
  files:
    - lib/heuristics.mjs
    - tests/lib/heuristics.test.mjs
    - .context-index/specs/features/heuristics/store-and-helper.spec.md
    - .context-index/memory/heuristics/_format.md
  computed-at: "2026-04-25T21:55:13.324Z"
drift_detected: true
---

# Live Spec: Retrieval Filtering

<!-- Live Spec within the heuristics charter.
     Defines the policy layer that callers use to select and budget heuristics
     for injection into context packets. Consumes the readHeuristics API from
     store-and-helper but does NOT modify it — this spec defines the retrieval
     conventions and budget rules that injection specs follow.
     Parent Charter: .context-index/specs/features/heuristics/charter.md -->

## Behavioral Contract

### Scope

This spec defines the retrieval policy that `/adev:implement` and `/adev:plan` follow when loading heuristics into context packets. It does not add new APIs — it specifies *how* callers should invoke the existing `readHeuristics` API and format the results.

### Preconditions

- `lib/heuristics.mjs` is importable (Phase 1a validated)
- `.context-index/manifest.yaml` exists with a `modules[]` list
- The calling skill knows its target module slug (from the plan or spec being processed)

### Behaviors

1. **When** a skill needs heuristics for a task targeting module `M` **then** it issues two `readHeuristics` calls: one with `{ module: M }` and one with `{ module: '_global' }`, merges the results, and deduplicates by `id`.

2. **When** both module-scoped and `_global` heuristics are returned **then** module-scoped entries sort before `_global` entries at the same confidence level (module relevance trumps global).

3. **When** the merged result set exceeds the injection limit **then** the caller applies the budget cap: max 5 `high`-confidence entries plus max 3 `medium`-confidence entries (total default 8). `low`-confidence entries are never injected.

4. **When** `manifest.yaml` contains a `heuristics.injection_limit` key **then** the caller uses that value as the total budget instead of the default 8. The split is: `highMax = ceil(limit * 5/8)`, `mediumMax = limit - highMax`. Reference values:

| injection_limit | highMax | mediumMax |
|-----------------|---------|-----------|
| 1 | 1 | 0 |
| 3 | 2 | 1 |
| 5 | 4 | 1 |
| 8 (default) | 5 | 3 |
| 12 | 8 | 4 |
| 16 | 10 | 6 |

5. **When** the injection limit is set to `0` **then** heuristic injection is disabled entirely. The skill logs a single-line advisory and proceeds without heuristics.

6. **When** `readHeuristics` returns an empty array for both module and `_global` **then** the skill proceeds normally without heuristics — no warning, no error.

7. **When** `readHeuristics` throws (e.g., `INVALID_PROJECT_ROOT`) **then** the calling skill catches the error, logs a single-line warning to `additionalContext`, and proceeds without heuristics. Heuristic retrieval failures never block parent workflows.

8. **When** heuristics are selected for injection **then** each heuristic is formatted as a markdown block in the context packet:

```markdown
### Heuristic: <title> (confidence: <level>)
- **Pattern:** <pattern>
- **Anti-pattern:** <antiPattern>   <!-- omit line if absent -->
- **Evidence:** <evidence count> observations
```

### Postconditions

- The caller's context packet contains 0 to `injection_limit` heuristic blocks, sorted by confidence then module-scope-first then recency.
- No `low`-confidence heuristics appear in the context packet.
- The original heuristic files are not modified by retrieval.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `readHeuristics` throws any error | Catch, log warning via `additionalContext`, proceed without heuristics | — |
| `manifest.yaml` missing `heuristics.injection_limit` | Use default budget of 8 | — |
| `heuristics.injection_limit` is not a non-negative integer | Log warning, use default 8 | — |
| Module slug not found in `manifest.yaml` modules | Proceed — `readHeuristics` already handles unknown modules gracefully | — |

## System Constitution Reference

- **Principle 2: Skills are primarily markdown** — Retrieval filtering is a policy documented in skill markdown. No new companion code is required; callers use `readHeuristics` inline.
- **Quality: Degradation** — Missing or malformed heuristic files never block an agent. This spec enforces that contract at the caller level.
- **Quality: Context Budget** — The 5-high + 3-medium cap directly implements the charter's Quality Attributes section.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| T1 | Document the retrieval protocol (dual-read, merge, dedup, sort, budget) as a reusable instruction block in implement and plan SKILL.md files | small |
| T2 | Document the markdown rendering format for injected heuristics | small |
| T3 | Document `heuristics.injection_limit` manifest key and scaling rules | small |
| T4 | Test: retrieval with module + _global merge, budget cap, limit=0 disable | small |

## Acceptance Criteria

- [ ] Retrieval protocol is documented in a form consumable by `/adev:implement` and `/adev:plan`
- [ ] Budget cap defaults to 8 (5 high + 3 medium), configurable via `heuristics.injection_limit`
- [ ] `low`-confidence heuristics are never injected
- [ ] Module-scoped heuristics sort before `_global` at the same confidence level
- [ ] Injection limit of `0` disables injection with a logged advisory
- [ ] Retrieval failures are caught and logged, never blocking the parent skill
- [ ] Heuristic rendering format is defined and consistent across all injection points
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
