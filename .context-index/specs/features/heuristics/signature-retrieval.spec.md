---
charter: heuristics
kind: behavioral
status: review-pending
risk_level: medium
milestone: 3
revision: 1
charter-revision: 6
created: 2026-08-15
updated: 2026-08-15
---

# Live Spec: Signature Retrieval — consult the store at the moment something fails

<!-- Live Spec within the heuristics charter.
     Parent Charter: .context-index/specs/features/heuristics/charter.md (revision 6, Phase 3)
     Covers capabilities: Signature-Keyed Retrieval, Error-Triggered Retrieval.
     Depends on: failure-signature-key.spec.md (the signature primitive and schema field).
     Independent of: failure-capture.spec.md — the two may proceed in parallel.
     Frontmatter precedes the H1 deliberately: `adev specify revise` cannot parse a spec
     whose frontmatter is not the first non-blank content. -->

## Behavioral Contract

All eight retrieval call sites fire once, at skill entry, keyed on module slug. Only
`skills/debug/SKILL.md:70` passes `--keyword`, and none re-queries when something actually fails. A
test fails inside `/adev:implement`, a gate trips, a review returns BLOCK — and the injected context
is whatever the module-scoped query returned minutes earlier.

This spec adds an exact-match `signature` axis to retrieval and re-queries the store at lifecycle
failure points using it. One constraint dominates the design: `retrieveHeuristics` drops every
`low`-confidence entry in its budget cap (`lib/heuristics.mjs:1176`), and failure heuristics enter the
store at `low`. Without an exemption, a signature-keyed lookup would return nothing on a first
recurrence — inert exactly when the loop is meant to close. The exemption is therefore part of the
contract, not an optimization.

### Preconditions

- `failure-signature-key.spec.md` has shipped: entries can carry a `signature` and it survives a
  read-write round trip.
- `retrieveHeuristics` continues to accept `tier`, `keywords`, and `injectionLimit`.
- Lifecycle failure events are observable — either from the emitting skill's own failure path or from
  `.context-index/lifecycle-state/*.jsonl`.

### Behaviors

1. **When** `retrieveHeuristics` is called with a `signature` **then** entries whose `signature` matches
   exactly are returned first, ranked above any keyword matches, which in turn rank above plain
   module-scope matches.

2. **When** an entry matches the requested `signature` exactly **then** it is returned even if its
   confidence is `low`, bypassing the exclusion at `lib/heuristics.mjs:1176`. Confidence still governs
   ordering within the signature-matched set, and still governs every non-signature retrieval path —
   the exemption is scoped to exact signature matches only.

3. **When** `retrieveHeuristics` is called with both `signature` and `keywords` **then** both axes
   apply, signature-matched entries outrank keyword-matched entries, and an entry matching both is
   returned once, not twice.

4. **When** `retrieveHeuristics` is called with a `signature` that matches nothing **then** it falls
   back to the existing module-scoped behavior rather than returning empty. A failure with no recorded
   history should still surface general module lessons.

5. **When** `adev heuristics retrieve --signature <sig>` is invoked **then** it renders the matched
   entries in the existing text and JSON formats, and prints the sentinel `__NONE__` when nothing
   matches at all. The verb exits 0 regardless, preserving the non-blocking contract every existing
   call site relies on.

6. **When** a lifecycle failure occurs at a point that has a signature — a validate FAIL, a
   review-specs BLOCK, an implement task failure, or a recover dispatch — **then** the store is
   re-queried by that signature and the result is injected into the agent's context, in addition to
   whatever was injected at skill entry.

7. **When** error-triggered retrieval fires **then** it is capped independently of and more tightly
   than entry-time injection: signature-matched entries only, `summary` tier, default 3 entries. The
   cap is configurable but its default is not the entry-time `injection_limit` of 8. This second
   injection lands inside an already-running task, where every injected token persists as a cache read
   on all subsequent turns.

8. **When** error-triggered retrieval returns nothing **then** the failure path proceeds unchanged and
   nothing is injected. Retrieval never blocks, never retries, and never alters the failure verdict.

9. **When** the store is missing, malformed, or unreadable at a failure point **then** retrieval
   degrades to injecting nothing, logs a warning, and the lifecycle continues.

### Postconditions

- A recurring failure surfaces its own prior lesson at the moment it recurs.
- No retrieval path can block or slow a failure path.
- Entry-time retrieval behavior is unchanged for callers that pass no `signature`.

### Error Cases

| Condition | Expected behavior | Exit code |
|---|---|---|
| `--signature` value is malformed | Treated as no match; falls back to module scope; exits 0 | 0 |
| Store missing or unreadable | `__NONE__`; warning logged; exits 0 | 0 |
| An entry carries a malformed `signature` | That entry is skipped for signature matching but remains available to keyword and module-scope retrieval | 0 |
| Failure event carries no derivable signature | Error-triggered retrieval is skipped entirely; entry-time context stands | 0 |
| Injection cap reached | Extra matches are dropped, highest-confidence first retained; the drop is reported in the rendered output | 0 |

## System Constitution Reference

- **Principle:** "Minimize external dependencies" — Applies; matching is exact string comparison over
  already-parsed frontmatter. No index, no search library.
- **Principle:** "Skills are primarily markdown — companion code must not be required for the skill to
  function." — Applies to Behaviors 8 and 9: every failure path must work with retrieval absent.
- **Principle:** "Hook protocol compliance" — Applies if error-triggered retrieval is delivered via a
  hook: it must exit 0 and emit its context through the established stdout channel, never block.
- **Anti-pattern:** "Fenced JavaScript in SKILL.md must be descriptive-reference only" — Applies to
  how the eight call sites are updated: they name `adev heuristics retrieve --signature`, and the
  ranking logic lives in the verb.

## Actionable Task Map

| Task | Description | Complexity |
|---|---|---|
| Add `signature` param to `retrieveHeuristics` | Exact match, ranked above keywords | small |
| Exempt exact matches from the `low` floor | Scoped change at `lib/heuristics.mjs:1176`; must not leak to other paths | medium |
| Dedup across axes | An entry matching both signature and keyword returns once | small |
| Fallback to module scope | Empty signature match must not produce an empty result | small |
| `--signature` flag on the retrieve verb | Wire through `lib/cli/heuristics.mjs`, preserve `__NONE__` and exit-0 semantics | small |
| Error-triggered retrieval | Fire at validate FAIL, review BLOCK, implement task failure, recover dispatch | medium |
| Independent injection cap | Separate config key; default 3; not the entry-time limit of 8 | small |
| Tests | Ranking order, low-confidence exemption scoping, dedup, fallback, non-blocking degradation | medium |

## Acceptance Criteria

- [ ] An exact `signature` match returns a `low`-confidence entry that module-scope retrieval would
      have dropped
- [ ] A `low`-confidence entry that does *not* match the signature is still excluded — the exemption
      does not leak to other retrieval paths
- [ ] Signature-matched entries rank above keyword-matched, which rank above module-scope
- [ ] An entry matching both signature and keyword appears exactly once
- [ ] A signature matching nothing falls back to module-scope results rather than returning empty
- [ ] `adev heuristics retrieve --signature <sig>` prints `__NONE__` and exits 0 when nothing matches
- [ ] A validate FAIL triggers a signature-keyed re-query and injects the result
- [ ] Error-triggered injection is capped at 3 by default, independently of `injection_limit`
- [ ] Every failure path completes unchanged when the store is missing or unreadable
- [ ] Entry-time retrieval for callers passing no `signature` is byte-identical to current behavior
- [ ] `npm test` passes
- [ ] No constitutional violations
