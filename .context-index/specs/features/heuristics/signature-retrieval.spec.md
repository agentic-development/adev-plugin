---
charter: heuristics
kind: behavioral
status: review-passed
risk_level: medium
milestone: 3
revision: 3
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
`low`-confidence entry in its budget cap — `if (entry.confidence === "low") continue;` at
**`lib/heuristics.mjs:1442`**, inside `retrieveHeuristics`'s budget loop — and failure heuristics enter
the store at `low`. Without an exemption, a signature-keyed lookup would return nothing on a first
recurrence, inert exactly when the loop is meant to close. The exemption is therefore part of the
contract, not an optimization.

> **Implementer warning — do not confuse this with the archival path.** An earlier revision cited
> `lib/heuristics.mjs:1176`, which is *not* the retrieval exclusion. The nearby
> `if (entry.confidence === "low")` at **`:1204`** lives in `demoteHeuristic` and its body is
> `return archiveHeuristic(projectRoot, id, "demoted-below-low")` — it **archives the entry**. A change
> made there while intending a read-side exemption would silently alter demotion and archive entries.
> The only line this spec touches is `:1442`.

### Failure heuristics stay at `low` permanently

`failure-capture.spec.md` Behavior 4a establishes that automatic promotion on the hook path is
structurally unreachable: `autoPromote` counts distinct evidence paths and the hook's `report_path` is
a deterministic function of `spec_path`, so the distinct-path count never exceeds 1. Failure entries
therefore do not merely *start* at `low` — they **stay** there indefinitely.

Two consequences bind this spec:

- The exemption is not a bootstrap concession that recurrence will later make unnecessary. It is the
  permanent and only way a failure heuristic is ever retrievable.
- Confidence cannot be the primary sort key for signature-matched results. Every signature-matched
  failure entry is `low`, so ranking by confidence first would place the exact match for the failure
  in hand below every unrelated `medium` module entry. This is why Behavior 1 puts `signature` above
  confidence rather than beneath it.

### Preconditions

- `failure-signature-key.spec.md` has shipped: entries can carry a `signature` and it survives a
  read-write round trip.
- `retrieveHeuristics` continues to accept `tier`, `keywords`, and `injectionLimit`.
- Lifecycle failure events are observable — either from the emitting skill's own failure path or from
  `.context-index/lifecycle-state/*.jsonl`.

### Behaviors

0. **The read side derives the lookup key exactly as the capture side derived the stored one.** This
   is the hinge of the entire spec: a lookup key computed differently from the stored key matches
   nothing, and the loop silently fails to close while every test of the ranking machinery still
   passes. The shipped capture side is exact and non-obvious —
   `deriveSignature('validate', uniqueFailed.join(' '))` at
   `hooks/post-validate-extract-heuristics.mjs:201`, where `uniqueFailed` is the **deduplicated,
   sorted** list of `checks[].id` values whose `outcome` is not PASS, joined by a single space.

   **When** error-triggered retrieval derives a lookup signature for a validate FAIL **then** it calls
   the same exported `deriveSignature` with the same origin and the same normalized input, computed
   from the same `checks[]` array. Neither side reimplements the composition; both call one exported
   helper, so the two cannot drift.

0a. **Retrieval fires from the live failure event, not from the lifecycle log.** The signature input
   requires `checks[]`. A `.context-index/lifecycle-state/*.jsonl` record carries `validator` and
   `verdict` but **no `checks[]`**, so the key is underivable there. Any implementation that sources
   the failure from the log instead of the in-flight verdict payload cannot compute a matching key.
   Where a failure surface has no `checks[]` but does have its own already-canonical identity, it uses
   that rather than synthesizing one: a review BLOCK uses its `blocker_id` via inherited mode
   (`failure-signature-key.spec.md` Behavior 3a). A surface with neither a `checks[]` array nor a
   canonical identity is out of scope for error-triggered retrieval and skips it (Behavior 6, Error
   Cases) — this spec defines inputs for exactly the two surfaces in Behavior 6's table and wires no
   others.

1. **When** `retrieveHeuristics` is called with a `signature` **then** entries whose `signature` matches
   exactly are returned first — **above confidence**, which remains the primary key for every other
   axis. Within the signature-matched set, ordering falls back to the existing comparator. Keyword
   matches rank next, then plain module-scope matches.

   Two reviewers proposed opposite placements for `signature` in the comparator; this spec decides for
   **signature-primary**, and the reason is the permanence established above. Because every
   signature-matched failure entry is `low` forever, a confidence-primary comparator would rank the
   exact match for the failure in hand beneath every unrelated `medium` entry, making the axis
   decorative. Signature-primary is also inert when no `signature` is passed — the term drops out of
   the comparison entirely — which is what preserves byte-identical results for the eight existing
   entry-time callers.

2. **When** an entry matches the requested `signature` exactly **then** it is returned even if its
   confidence is `low`, bypassing the exclusion at **`lib/heuristics.mjs:1442`**. Confidence still
   governs ordering within the signature-matched set, and still governs every non-signature retrieval
   path — the exemption is scoped to exact signature matches only, and is made at the retrieval budget
   loop, never in `demoteHeuristic`.

2a. **Signature-matched entries are allocated off the top of `limit`, before the high/medium split.**
   The budget loop is not a flat cap: `highMax = Math.ceil(limit * 5 / 8)` (`:1436`) and
   `mediumMax = limit - highMax` (`:1437`), with the buckets checked at `:1443` and `:1446`. A `low`
   entry fits **neither** bucket, so an exemption that does not say how it is budgeted leaves four
   defensible implementations — off the top, from the high bucket, from the medium bucket, or a
   separate allocation. This spec chooses **off the top**:

   1. Signature-matched entries are taken first, up to `limit`.
   2. `limit` is reduced by the number taken, and the existing formula splits **the remainder** into
      high and medium buckets.
   3. With zero signature matches the remainder equals `limit`, so the split is arithmetically
      identical to today — which is what keeps entry-time callers byte-identical.

   Off-the-top is the only option consistent with Behavior 1's signature-primary ordering: any variant
   that draws signature matches from a confidence bucket lets bucket exhaustion drop the exact match
   for the failure in hand while retaining unrelated entries.

   **Charter note.** The Context Budget attribute is phrased as "max five `high`-confidence plus three
   `medium`-confidence heuristics per task context packet" — a formulation with no slot for an
   exempted `low` entry. The total is unchanged (never more than `limit`), but the high/medium
   composition is not, so the charter's wording needs a Phase 3 amendment to describe the budget as a
   total with a signature-first allocation. That amendment is out of this spec's scope and is recorded
   as a follow-up.

3. **When** `retrieveHeuristics` is called with both `signature` and `keywords` **then** both axes
   apply, signature-matched entries outrank keyword-matched entries, and an entry matching both is
   returned once, not twice.

4. **When** `retrieveHeuristics` is called with a `signature` that matches nothing **then** it falls
   back to the existing module-scoped behavior rather than returning empty — **subject to the caller's
   own cap, not the entry-time one.**

   The fallback and the cap were previously in three-way contradiction with Behavior 7, and the modal
   case exposed it. A *first* occurrence of any failure matches no signature by definition, so the
   fallback is the common path, not the edge. Behavior 7 says error-triggered retrieval injects
   "signature-matched entries only, capped at 3"; an unqualified module-scope fallback would inject up
   to the entry-time `injection_limit` of 8 unrelated entries *in addition to* the entry-time
   injection that already happened — breaching the charter's Context Budget invariant on the most
   frequent case.

   The resolution: **the fallback is capped by whichever budget the caller is operating under.**
   Entry-time callers passing no `signature` are unaffected. Error-triggered retrieval falls back to at
   most its own limit (default 3), never the entry-time 8, and Behavior 7's "signature-matched only"
   is corrected to "signature-matched where any exist, otherwise module-scope within the same cap".

5. **When** `adev heuristics retrieve --signature <sig>` is invoked **then** it renders matches in
   whichever output format is selected, preserving each format's existing empty-result shape exactly:
   `--format text` prints the sentinel `__NONE__`; `--format json` — **the default** — emits
   `{"count":0,"rendered":""}` (`lib/cli/heuristics.mjs:214`). An earlier revision claimed `__NONE__`
   in both formats and that the verb "exits 0 regardless"; both are false. The verb already exits **1**
   on argument errors — missing `--module`, malformed `--tier`, `--format`, or `--injection-limit` —
   and `--signature` does not change that. What this spec preserves is narrower and accurate: **a
   well-formed invocation that matches nothing exits 0**, so the non-blocking contract the eight
   existing call sites rely on is untouched. A malformed `--signature` is treated as no match rather
   than as an argument error (Error Cases), because a failure path must never be turned into an
   argument failure.

6. **When** a lifecycle failure occurs at one of the **two** surfaces with a defined signature input
   **then** the store is re-queried by that signature and the result is injected into the agent's
   context, in addition to whatever was injected at skill entry:

   | Surface | Origin | Signature input | Read from |
   |---|---|---|---|
   | validate FAIL | `validate` | deduped, sorted `checks[].id` where `outcome !== 'PASS'`, joined by a space | the live `verdict_metadata` payload |
   | review-specs BLOCK | `review-specs` | the finding's `blocker_id`, via inherited mode (`failure-signature-key.spec.md` Behavior 3a) | the reviewer's finding |

   **Implement task failure and recover dispatch are explicitly OUT OF SCOPE for this spec.** An
   earlier revision listed all four surfaces here while defining a derivation input for only two,
   leaving an implementer to choose between wiring two and wiring four with no rule for the extra two.
   The exclusion is not because those surfaces lack an identity — `deriveSignature`'s origin set does
   include `implement` and `recover`, and recover-origin entries already carry signatures — but
   because this spec has not defined *what text feeds them*, and inventing one here would repeat the
   unspecified-derivation defect that blocked revision 1. Wiring them is a follow-up that must state
   their inputs with the precision this table gives the first two.

7. **When** error-triggered retrieval fires **then** it is capped independently of and more tightly
   than entry-time injection: `summary` tier, default **3** entries, drawn from signature matches where
   any exist and otherwise from module scope within that same cap (Behavior 4). The cap is configurable
   but its default is not the entry-time `injection_limit` of 8, and the fallback never escalates to
   it. This second injection lands inside an already-running task, where every injected token persists
   as a cache read on all subsequent turns — so the total injected across entry time plus failure time
   stays within the charter's Context Budget invariant on every path, including the modal
   first-occurrence case.

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
| Store missing or unreadable | Each format's empty shape — `__NONE__` for text, `{"count":0,"rendered":""}` for the json default; warning logged; exits 0 | 0 |
| Failure surface has no derivable identity (no `checks[]`, no `blocker_id`) | Error-triggered retrieval is skipped; the entry-time context stands; no synthesized key is invented | 0 |
| An entry carries a malformed `signature` | That entry is skipped for signature matching but remains available to keyword and module-scope retrieval | 0 |
| Failure event carries no derivable signature | Error-triggered retrieval is skipped entirely; entry-time context stands | 0 |
| Injection cap reached | Signature-matched entries are retained first (Behavior 2a), then the remainder fills the high/medium buckets by the existing split; drops are reported in the rendered output. **Not** "highest-confidence first retained" — that ordering would drop a `low` signature match before an unrelated `medium` module entry, the exact outcome Behavior 1 exists to prevent | 0 |

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
| Shared lookup-key derivation | Export the composition the capture side already uses — `deriveSignature(origin, <deduped, sorted failing check ids joined by " ">)` per `hooks/post-validate-extract-heuristics.mjs:201` — so read and write call ONE helper and cannot drift. This is the task the whole spec hinges on | medium |
| Add `signature` param to `retrieveHeuristics` | Exact match, ranked **above confidence**, inert when absent so no-signature callers are byte-identical | small |
| Exempt exact matches from the `low` floor | Scoped change at **`lib/heuristics.mjs:1442`** — the `if (entry.confidence === "low") continue;` inside `retrieveHeuristics`'s budget loop (`:1441` is the loop header). **NOT `:1204`**, which is `demoteHeuristic`'s archive branch; editing there would alter demotion and archive entries | medium |
| Signature-first budget allocation | Take signature matches off the top of `limit`, then split the remainder into `highMax`/`mediumMax` by the existing formula (`:1436-:1437`). With zero matches the split must be arithmetically identical to today | medium |
| Dedup across axes | An entry matching both signature and keyword returns once | small |
| Capped fallback to module scope | Empty signature match falls back within the CALLER's cap, never escalating to the entry-time 8 | small |
| `--signature` flag on the retrieve verb | Wire through `lib/cli/heuristics.mjs`; preserve each format's existing empty shape — `__NONE__` for text, `{"count":0,"rendered":""}` for the json default (`:214`) — and leave existing exit-1 argument-error paths intact | small |
| Error-triggered retrieval | Wire **exactly the two surfaces** in Behavior 6's table — validate FAIL (derived signature) and review-specs BLOCK (`blocker_id`, inherited mode). Fire from the LIVE failure payload, never the lifecycle log, which has no `checks[]`. Implement-task failure and recover dispatch are out of scope; do not wire them | medium |
| Independent injection cap | Separate config key; default 3; governs signature matches AND the fallback | small |
| Tests | Read/write key agreement on a real captured entry, ranking order, exemption scoping, dedup, capped fallback, both CLI empty shapes, non-blocking degradation | medium |

## Acceptance Criteria

- [ ] An exact `signature` match returns a `low`-confidence entry that module-scope retrieval would
      have dropped
- [ ] A `low`-confidence entry that does *not* match the signature is still excluded — the exemption
      does not leak to other retrieval paths
- [ ] **End-to-end key agreement:** a FAIL is captured by the live hook, then error-triggered retrieval
      derives a lookup signature from the same verdict and retrieves *that entry*. This is the criterion
      that proves the loop closes; ranking tests all pass even when the two keys disagree
- [ ] Read and write derive the key through the same exported helper — asserted by grep that no second
      composition of `deriveSignature` inputs exists
- [ ] Signature-matched entries rank above confidence, then keyword-matched, then module-scope
- [ ] A `low` signature match outranks an unrelated `medium` module entry — the ordering that makes the
      axis useful given failure entries never leave `low`
- [ ] A `low` signature match is **retained** and an unrelated `medium` module entry **dropped** when
      the cap binds — the drop order agrees with the ranking rather than contradicting it
- [ ] With `injectionLimit: 3` and two signature matches, exactly one slot remains and it is split by
      the existing high/medium formula over the reduced limit
- [ ] With zero signature matches, `highMax`/`mediumMax` are arithmetically identical to today —
      asserted numerically, not by inspection
- [ ] An entry matching both signature and keyword appears exactly once
- [ ] A signature matching nothing falls back to module-scope results **within the caller's cap** — an
      error-triggered fallback returns at most 3, never the entry-time 8
- [ ] `adev heuristics retrieve --signature <sig>` matching nothing exits 0 and emits each format's
      existing empty shape: `__NONE__` for `--format text`, `{"count":0,"rendered":""}` for the json
      default. Existing exit-1 argument-error paths are unchanged
- [ ] A malformed `--signature` is treated as no match, not as an argument error
- [ ] A validate FAIL triggers a signature-keyed re-query sourced from the live verdict payload; a test
      asserts the lifecycle-log path is not used, since it carries no `checks[]`
- [ ] A review BLOCK derives its signature from `blocker_id` via inherited mode rather than synthesizing
      one
- [ ] Error-triggered retrieval is wired at exactly two surfaces; a test asserts implement-task failure
      and recover dispatch do **not** trigger it, since this spec defines no signature input for them
- [ ] Error-triggered injection is capped at 3 by default, independently of `injection_limit`, and the
      cap governs the fallback too
- [ ] Every failure path completes unchanged when the store is missing or unreadable
- [ ] Entry-time retrieval for callers passing no `signature` is byte-identical to current behavior
- [ ] `npm test` passes
- [ ] No constitutional violations
