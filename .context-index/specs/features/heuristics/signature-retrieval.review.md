---
spec: .context-index/specs/features/heuristics/signature-retrieval.spec.md
charter: .context-index/specs/features/heuristics/charter.md
date: 2026-08-15
verdict: BLOCK
rigor-tier: full
last-reviewed-revision: 2
file-sha: 0ad8d582306d615bdd646c3cb764729cc8361286a7d462d7c375909e09e602fe
---

# Architecture Review: signature-retrieval

> **Date:** 2026-08-15
> **Spec:** .context-index/specs/features/heuristics/signature-retrieval.spec.md
> **Charter:** .context-index/specs/features/heuristics/charter.md (approved, revision 6, Phase 3)
> **Rigor tier:** full (explicit `--tier full`; `risk_level: medium` resolves identically)
> **Spec revision at review:** 2 (re-review; revision 1 was BLOCK with 13 blocker entries)
> **Verdict:** BLOCK

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

Domain resolution: `software` (source level: `default`). Registry warnings: none.
Registry: `.context-index/governance/review.yaml` declares `reviewers: []`; the three bundled
domain reviewers stand. All three resolved to read-only-compatible profiles; severity cap `blocker`
for each (no finding was clamped).
Module heuristics injected: 3 (`heuristics` module, tier `summary`).
Governance: `risk-policies.yaml` present; `medium` sets `review_mode: full` and does not skip review.
`gates.yaml` `transitions` is empty — no `spec-to-plan` approver role is declared.
Cross-repo `depends-on` refs: none. Workspace: not detected.

## Revision-1 blocker disposition

Revision 1 emitted 13 blocker entries collapsing to five distinct defects. Verified individually
against live code at review time:

| Rev-1 blocker_id | Status at revision 2 |
|---|---|
| `structural-architect:unspecified-signature-derivation:550fc24d` | **Resolved.** New Behavior 0 pins the read side to the exported `deriveSignature` and Behavior 0a to the live payload. |
| `structural-architect:false-code-citation:50e43d50` | **Partially resolved** — the destructive `:1176`/`:1204` confusion is fixed and now carries an explicit implementer warning, but the replacement citation is itself off by one (see CON-1). |
| `structural-architect:contradictory-ranking-contract:681976e9` | **Resolved.** Revision 2 decides signature-primary and justifies it from the permanence of `low` on failure entries. |
| `structural-architect:contradictory-fallback:776c5d09` | **Resolved.** Behavior 4 caps the fallback at the caller's own budget; Behavior 7 is corrected to match. |
| `structural-architect:unbudgeted-exemption:4e641159` | **NOT resolved.** Carried forward — see blocker list. |
| `security-reviewer:rate-limiting:06168089` | **Resolved to non-blocking.** See Security Reviewer section. |
| `security-reviewer:data-exposure:fb9cc805` | **Resolved.** See Security Reviewer section. |
| `consistency-analyzer:*` (5 contract/pattern entries) | **Resolved** as duplicates of the structural findings above, except the ranking-phrasing residue recorded as CON-5 (suggestion). |

## Structural Architect (structural-architect)

**Verdict:** BLOCK

Revision-2 claims verified against live code — the four cited fixes largely hold:
`hooks/post-validate-extract-heuristics.mjs:201` is exactly `deriveSignature('validate', uniqueFailed.join(' '))`;
`demoteHeuristic`'s `if (entry.confidence === "low")` is at `:1204` with body
`return archiveHeuristic(..., "demoted-below-low")`, so the implementer warning is accurate and useful;
`--format` defaults to `json` (`lib/cli/heuristics.mjs:146`), text-empty is `__NONE__`, json-empty is
`{count, rendered}`, and the verb exits 1 on missing `--module` or a bad `--tier`/`--format`/`--injection-limit`;
Behaviors 1, 4 and 7 are now internally coherent on ranking and the capped fallback.

- **SA-1** — `blocker` — `blocker_id: structural-architect:contradictory-scope:0c91e320` — section `behaviors-6`

  Behavior 6 names four failure surfaces that "ha[ve] a signature" — a validate FAIL, a review-specs
  BLOCK, an implement task failure, and a recover dispatch — and mandates a re-query "by that
  signature". Behavior 0a defines a derivation input for only two of them (`checks[]` → validate;
  `blocker_id` → BLOCK) and orders any surface with neither to skip. The Task Map row
  ("Error-triggered retrieval") and the Acceptance Criteria likewise cover only validate and review
  BLOCK. This is not resolvable by reading: `deriveSignature`'s live origin set includes `implement`
  and `recover`, and recover-origin entries already carry signatures, so "those two have no identity"
  is not self-evident — yet the spec never states what text feeds them. The implementer must choose
  between wiring two surfaces or four with no rule for the extra two.

  **Recommendation:** either narrow Behavior 6 to the two surfaces with a defined input and move
  implement/recover to an explicit out-of-scope note, or state their signature input with the same
  precision Behavior 0 gives the validate path.

- **SA-2** — `warning` — section `behaviors-0` / Task Map row 1

  The spec describes the shared composition as the "deduplicated, sorted list of `checks[].id` …
  joined by a single space", but the live capture also sanitizes each id
  (`c.id.replace(/[^A-Za-z0-9._-]/g, '')`) and drops empties before dedup and sort
  (`hooks/post-validate-extract-heuristics.mjs:178-183`). A helper written from the spec prose rather
  than lifted from the live block produces a different key for any id containing a stripped
  character — the exact silent failure Behavior 0 exists to prevent.
  **Recommendation:** state sanitization as part of the composition, or say explicitly that the task
  is a lift-and-export of the existing block with no reformulation.

- **SA-3** — `warning` (folded into blocker `structural-architect:unbudgeted-exemption:4e641159`) — section `behaviors-2` / `error-cases`

  The live budget loop is not a flat cap: it splits `limit` into `highMax = ceil(limit * 5 / 8)` and
  `mediumMax = limit - highMax`, and `low` entries fall through both buckets. The spec exempts `low`
  signature matches from the exclusion but never says how they are budgeted. Two implementers will
  differ on what `injectionLimit: 3` returns for two signature matches plus module scope.

- **SA-4** — `warning` — section `error-cases` ("Injection cap reached")

  "the drop is reported in the rendered output" introduces an output-contract change with no channel
  named, no Task Map row, and no acceptance criterion, on a surface eight call sites parse.
  **Recommendation:** drop the clause or specify the field/line and cover it in the Task Map.

- **SA-5** — `warning` — section `behaviors-2` vs. shipped sibling

  `retrieval-filtering.spec.md` (shipped, validated) states as Behavior 3, Postcondition, and
  Acceptance Criterion that "`low`-confidence heuristics are never injected", and
  `tests/lib/heuristics.test.mjs:1839` asserts it. Behavior 2 implicitly supersedes that contract.
  The exemption is scoped so the test still passes, but the sibling spec becomes false as written,
  and the constitution requires updating specs whose assumptions a change invalidates.
  **Recommendation:** add an explicit amendment note pointing at `retrieval-filtering.spec.md`.

- **SA-6** — `warning` — section `behaviors-0` vs. charter Out of Scope, and ADR-0019

  The charter's Out of Scope list rules out "signatures keyed on validator check IDs" (deferring to
  content-addressed failure text), yet the shipped key — which this spec pins as the read-side
  input — is exactly the failing check IDs. Separately, ADR-0019 (Proposed) canonicalizes check IDs
  to namespace-qualified form with an alias table for historical spellings; if it lands, the same
  failure yields a different signature before and after, breaking the charter's Signature Stability
  invariant that recurrence counting and the downstream breaker depend on.
  **Recommendation:** cite ADR-0019 and state whether the key input is canonicalized or deliberately
  pinned to raw emitted IDs; reconcile the charter's Out of Scope row.

- **SA-7** — `suggestion` — line citations. The retrieval `continue` is at `lib/heuristics.mjs:1442`,
  not `:1441` (five citations). `lib/cli/heuristics.mjs:212` is the `__NONE__` text branch; the json
  empty shape is the following branch. The store-unreadable *throw* path emits
  `{count:0,rendered:"",error:…}` (`:203`), so "each format's existing empty shape" is not byte-exact
  there — a test asserting strict equality would fail. (Escalated to blocker via CON-1 below.)

- **SA-8** — `suggestion` — Task Map, "Independent injection cap". The "separate config key" is never
  named, while the charter names its counterpart (`heuristics.injection_limit`) as a consumed
  contract. Name it so the manifest surface is a decided contract rather than an implementer's choice.

Known-accepted defects (a)–(d) were observed and are not counted.

## Security Reviewer (security-reviewer)

**Verdict:** PASS_WITH_NOTES

Both revision-1 security blockers were given an explicit disposition, as mandated.

- **`security-reviewer:rate-limiting:06168089` — RESOLVED to non-blocking.** Revision 2 binds the
  concern concretely: Behavior 7 caps error-triggered retrieval independently and more tightly than
  entry-time injection (`summary` tier, default 3), never escalating to the entry-time 8 even on
  fallback (Behavior 4); Behaviors 8 and 9 guarantee retrieval never blocks, never retries, and
  degrades to nothing on any store failure, so a failure storm cannot cascade into a retrieval storm.
  The charter's Performance attribute bounds each lookup to one or two file reads under 50 ms.

- **SEC-1** — `suggestion` — category `rate-limiting` — section `behaviors-7`

  Residual from the above: multiple distinct failure surfaces in one task (validate FAIL → recover
  dispatch → validate FAIL) each independently re-fire at up to 3 entries. The compounding cache-read
  cost the charter worries about is bounded *per event*, not *per task*; nothing in Behaviors 6–7 caps
  the total across repeated failures within one task. Within this threat model (no adversary; worst
  case is a flaky task retried by the developer who already controls the loop) this is a cost/UX
  tuning question, not a security finding. **Recommendation:** consider a per-task ceiling on the
  number of error-triggered injections, or state explicitly that the cap is per-event by design.

- **`security-reviewer:data-exposure:fb9cc805` — RESOLVED, not live in revision 2.** The read side
  derives its lookup key from exactly the identifier-only input the write side already captured
  (Behavior 0). The live hook (`hooks/post-validate-extract-heuristics.mjs:174-206`) reads only
  `checks[].id`/`outcome`, sanitizes ids to `[A-Za-z0-9._-]`, and never touches prose, tool-result
  channels, or file contents — scoping enforced by `failure-capture.spec.md` Behavior 1a and unchanged
  here. Retrieval surfaces only entries produced under that scoping, and the signature value itself is
  an opaque SHA-256 prefix, never raw failure prose. No new exposure surface is introduced by the
  `signature` axis or by the second injection.

- **SEC-2** — `suggestion` — category `data-exposure` — section `behaviors-5` / `error-cases`

  Behavior 5 and the "Store missing or unreadable" Error Cases row mandate the json empty shape be
  exactly `{"count":0,"rendered":""}`. The shipped `runRetrieve` catch branch
  (`lib/cli/heuristics.mjs:196-206`) instead emits `{"count":0,"rendered":"","error":<err.message>}`.
  If `retrieveHeuristics` throws past its internal per-read try/catch, that message can carry an
  absolute local path to stdout and into injected context. Low severity in a single-local-user threat
  model, but it is a genuine spec/implementation gap on the very row the spec added to correct the
  rev-1 CLI claim. **Recommendation:** state explicitly that the empty-shape response never includes
  an `error` field, with diagnostic detail relegated to the stderr warning channel Behavior 9 already
  requires — or correct the row to describe the shape the code actually emits.

- **Input validation — no finding.** Matching is exact string comparison, never regex over
  user-supplied values. `SIGNATURE_PATTERN` (`^[a-z0-9][a-z0-9-]{0,63}$`) has no catastrophic
  backtracking; a malformed stored signature is inert per the Error Cases table. Derivation input is
  restricted to sanitized `checks[].id` values or an already-canonical `blocker_id`, never free text.
  No YAML or markdown injection surface — serialization is unchanged machinery.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** BLOCK

- **CON-1** — `blocker` — `blocker_id: consistency-analyzer:code-citation:76923748` — section `behavioral-contract`

  Category `contract`. **This spec:** the Behavioral Contract, Behavior 2, and the Task Map row
  "Exempt exact matches from the `low` floor" all cite `lib/heuristics.mjs:1441` as "the `continue`
  inside `retrieveHeuristics`'s budget loop" (five citations in total). **Conflicts with:** live code —
  `:1441` is the loop header `for (const entry of deduped) {`; the conditional
  `if (entry.confidence === "low") continue;` is at **`:1442`**. Separately,
  `lib/cli/heuristics.mjs:212` is cited as the source of the json empty shape but is the `__NONE__`
  text branch; the json branch is `:214`. Revision 1 was blocked for a false citation on this exact
  line; revision 2 corrected the *function* but not the *number*, and its own implementer warning
  ("The only line this spec touches is `:1441`") is therefore still wrong.
  **Recommendation:** replace all `:1441` citations with `:1442` and the `lib/cli/heuristics.mjs:212`
  citation with `:214`, and verify the numbers at write time rather than by inference.

  *Aggregator note:* the reviewer emitted three section anchors on this finding; the sidecar records
  the first (`behavioral-contract`) per the writer's single-anchor contract. The other implicated
  sections are `behaviors-2` and `actionable-task-map`.

- **CON-2** — ~~`blocker`~~ **demoted to `suggestion` by the aggregator** — section `behaviors-1`

  The reviewer flagged as a blocker that `retrieveHeuristics` has no `signature` option
  (`lib/heuristics.mjs:1350`) and `lib/cli/heuristics.mjs` has no `--signature` flag, then wrote in its
  own Recommendation: *"this is not a conflict with shipped code but an implementation gap tracked by
  the Task Map."* The finding self-refutes: this spec is `review-pending` and pre-implementation, and
  absent-by-design future work is not a contract mismatch. Propagating it into `.blockers.md` would
  direct `/adev:specify --revise` to "fix" the spec by deleting its own reason for existing.
  Demoted and excluded from the sidecar; recorded here for audit.

- **CON-3** — `warning` (folded into blocker `structural-architect:contradictory-scope:0c91e320`) — section `behaviors-6`

  Category `contract`. Behavior 6 names four failure points but specifies a derivation input for only
  one (validate) in full and one (BLOCK) by reference; independent confirmation of SA-1.
  **Recommendation:** add a table to Behavior 6 with one row per failure point — origin, exact
  signature input source, and where in the payload it is read.

- **CON-4** — `warning` (folded into blocker `structural-architect:unbudgeted-exemption:4e641159`) — section `behaviors-2`

  Category `domain-model`. Behavior 2 exempts signature-matched `low` entries from the floor but never
  specifies whether they are budgeted separately or consume the high/medium allocations, against the
  charter's Context Budget attribute ("max five `high` plus three `medium` per task context packet").
  Independent confirmation of SA-3.

- **CON-5** — `suggestion` — section `behaviors-1`

  Category `terminology`. `retrieval-filtering.spec.md` and `keyword-tags-and-tiered-retrieval.spec.md`
  both establish confidence as the primary sort key; Behavior 1's "above confidence" is compatible only
  under the signature-primary reading revision 2 in fact adopts. The aggregator judges the rev-1
  ambiguity (`consistency-analyzer:contract:6987d58f`) resolved — revision 2 states the decision and
  its justification explicitly — but the two sibling specs still read as if confidence were primary.
  **Recommendation:** amend the sibling specs' sort-key language, or add a pointer from them to this
  spec's decision.

- **CON-6** — `suggestion` — section `postconditions`

  Category `pattern`. Postcondition 1 ("A recurring failure surfaces its own prior lesson at the moment
  it recurs") reads as an unconditional guarantee, while the Error Cases unmatched-signature row and
  Behaviors 4, 8, and 9 all provide paths where nothing is returned.
  **Recommendation:** reword to "when a signature match exists it is returned; failures with no
  recorded history fall back per Behavior 4."

Known-accepted lags (a)–(d) were observed and are not counted.

## Aggregator adjudication

Three blocker entries reach the sidecar. Partitioned against the revision-1 set as instructed:

| blocker_id | Reviewer | Section | Class |
|---|---|---|---|
| `structural-architect:contradictory-scope:0c91e320` | structural-architect | `behaviors-6` | **NEW** — not present in revision 1 |
| `structural-architect:unbudgeted-exemption:4e641159` | structural-architect | `behaviors-2` | **PERSISTENT** — carried forward verbatim from revision 1 |
| `consistency-analyzer:code-citation:76923748` | consistency-analyzer | `behavioral-contract` | **NEW id, same defect class** as revision 1's `structural-architect:false-code-citation:50e43d50` |

`structural-architect:unbudgeted-exemption:4e641159` is carried forward under its original revision-1
id rather than re-issued: no reviewer this round asserts it resolved, both independently re-raised it
(SA-3, CON-4), and the aggregator confirmed against live code that the budget loop splits `limit` into
`highMax`/`mediumMax` buckets that a `low` entry fits neither of. Compounding it, the Error Cases row
"Injection cap reached | Extra matches are dropped, highest-confidence first retained" directly
contradicts Behavior 1's signature-primary ordering: under "highest-confidence first retained" a `low`
signature match is dropped before an unrelated `medium` entry, which is precisely the outcome
Behavior 1 exists to prevent. Reviewers rated it `warning` this round; the aggregator does not promote
severities, so it enters the sidecar under its standing revision-1 blocker classification.

`consistency-analyzer:contract:5c9d7e41` was emitted as a blocker and is **excluded** — see CON-2.
No `LEGACY_REVIEWER_OUTPUT`, `INVALID_BLOCKER_ID`, or `MISSING_SECTION_ANCHOR` advisories: all three
sidecar entries carry well-formed ids and anchors. No `BLOCKER_ID_COLLISION`.

## Independent aggregator verification

Checked at review time, outside any reviewer:

- The Behavioral Contract's opening claim is exact. There are exactly eight `adev heuristics retrieve`
  call sites across `skills/*/SKILL.md`, and only `skills/debug/SKILL.md:70` passes `--keyword`.
- `deriveSignature` is exported once, at `lib/heuristics.mjs:210`. The only composition sites are the
  hook at `:201` and the CLI at `lib/cli/heuristics.mjs:402`. Behavior 0's "one exported helper" claim
  is achievable as written.
- `grep -n 'entry.confidence === "low"' lib/heuristics.mjs` → `1157`, `1204`, `1442`. The spec's `:1204`
  attribution to `demoteHeuristic`'s archive branch is correct; its `:1441` is not (CON-1).
- `--format` default is `json` (`lib/cli/heuristics.mjs:146`) and the four argument-error paths do exit
  1. Behavior 5's corrected CLI contract holds except for the `error` field noted in SEC-2.

## Summary

**Total findings:** 16 (3 blockers, 6 warnings, 7 suggestions)
**Action required:** Revise the spec to revision 3 addressing the three sidecar blockers, then
re-run `/adev:review-specs`. Revision 2 made real progress — four of the five revision-1 structural
defects and both security blockers are genuinely resolved, and the spec's factual claims about
`deriveSignature`, `demoteHeuristic`, the CLI defaults, and the eight call sites now hold against
shipped code. What remains is one unresolved carry-forward (the exemption's budget arithmetic), one
newly-exposed scope contradiction (Behavior 6's four surfaces versus Behavior 0a's two), and a
line-number correction. None require re-deciding anything revision 2 decided.

> **Governance footer:** `.context-index/governance/gates.yaml` declares `transitions: {}` — no
> `spec-to-plan` approver role is defined, so no human approval gate applies to this transition.
> `risk-policies.yaml` sets `require_hitl_approval: false` for `medium`.
