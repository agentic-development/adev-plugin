---
spec: .context-index/specs/features/heuristics/signature-retrieval.spec.md
charter: .context-index/specs/features/heuristics/charter.md
date: 2026-08-15
verdict: PASS_WITH_NOTES
rigor-tier: quick
last-reviewed-revision: 3
file-sha: da050fcd1747f79b478d0994eb09b82a1aecba03f2c63b0127762b323175e652
---

# Architecture Review: signature-retrieval

> **Date:** 2026-08-15
> **Spec:** .context-index/specs/features/heuristics/signature-retrieval.spec.md
> **Charter:** .context-index/specs/features/heuristics/charter.md (approved, revision 6, Phase 3)
> **Rigor tier:** quick (explicit `--tier quick`; overrides `risk-policies.yaml` `medium → review_mode: full`)
> **Spec revision at review:** 3 (third review round; revisions 1 and 2 were BLOCK with 13 and 3 blockers)
> **Verdict:** PASS_WITH_NOTES

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| quick-synthesized-reviewer | Quick Synthesized Reviewer | subagent | reviewer-capable | plugin:review-specs/quick-synthesized-reviewer-prompt.md |

Rigor tier `quick` dispatches exactly one synthesized reviewer covering all three lenses
(structural, security, consistency) instead of the three specialist defaults. Per
`graduated-rigor-tiers.spec.md`, `quick` does not skip the gate — the `.review.md` and the full
lifecycle event chain are produced identically.

Domain resolution: `software` (source level: `default`). Registry warnings: none.
Registry: `.context-index/governance/review.yaml` declares `reviewers: []`; the three bundled domain
reviewers stand but are not dispatched under `quick`. Severity cap `blocker`; no finding was clamped.
Module heuristics injected: 3 (`heuristics` module, tier `summary`).
Governance: `risk-policies.yaml` present; `medium` sets `require_review: true` and `review_mode: full`
— the explicit `--tier quick` override takes precedence per the resolution order in
`lib/governance/rigor-mode.mjs`. Review was NOT skipped.
`gates.yaml` `transitions: {}` — no `spec-to-plan` approver role is declared.
Cross-repo `depends-on` refs: none. Workspace: not detected.
Advisory on event emission: `UNKNOWN_REVIEWER_DEFAULTED` — `quick-synthesized-reviewer` is not
declared in the `software` domain `reviewers.yaml`, so the `reviewer_report` event's severity
defaulted to `warning`. Non-blocking; the verdict recorded on the event is correct.

## Prior blocker disposition

Revision 2 closed with three blocker entries. Each was re-verified against live source at review
time (grep, not inference — two prior rounds were spent on citation errors alone):

| Rev-2 blocker_id | Status at revision 3 |
|---|---|
| `consistency-analyzer:code-citation:76923748` | **RESOLVED.** All cited lines confirmed against live source: `lib/heuristics.mjs:1441` is the loop header `for (const entry of deduped) {`, `:1442` is `if (entry.confidence === "low") continue;`, `:1436`/`:1437` are `highMax`/`mediumMax`, `:1443`/`:1446` are the high/medium bucket checks, `:1204` is `demoteHeuristic`'s archive branch with body `return archiveHeuristic(projectRoot, id, "demoted-below-low")`. `hooks/post-validate-extract-heuristics.mjs:201` is exactly `deriveSignature('validate', uniqueFailed.join(' '))` with `:188` being `const uniqueFailed = [...new Set(failed)].sort();` — the "deduplicated, sorted" claim in Behavior 0 is accurate. `lib/cli/heuristics.mjs:212` is the `__NONE__` text branch and `:214` the json branch. The implementer warning that itself misstated a line is now correct. |
| `structural-architect:contradictory-scope:0c91e320` | **RESOLVED.** Behavior 6 now carries exactly two table rows, each with a named origin, an exact signature input, and a read-source. Implement-task failure and recover dispatch are explicitly out of scope in Behavior 6, the Task Map's "Error-triggered retrieval" row, and a negative acceptance criterion. Behavior 0a's closing sentence was swept to match. |
| `structural-architect:unbudgeted-exemption:4e641159` | **RESOLVED** — the persistent blocker carried from revision 1 is closed. Behavior 2a specifies off-the-top allocation unambiguously: signature matches are taken first up to `limit`, `limit` is reduced by the count taken, and the existing formula splits the remainder. Verified arithmetically against live `:1436-:1437`: zero signature matches ⇒ remainder = `limit` ⇒ `highMax`/`mediumMax` identical to today, which is what preserves byte-identical results for the eight entry-time callers; `limit: 3` with two matches ⇒ remainder 1 ⇒ `highMax` 1, `mediumMax` 0, matching the stated acceptance criterion. The choice is justified rather than asserted — any variant drawing signature matches from a confidence bucket lets bucket exhaustion drop the exact match, contradicting Behavior 1. The Error Cases "Injection cap reached" row, which previously said "highest-confidence first retained", now retains signature matches first and therefore agrees with Behavior 1 instead of contradicting it. |

The charter's `Retrieval Reachability` attribute (`charter.md:216`) already sanctions the exemption
itself, so no charter invariant is violated by Behavior 2. The remaining charter divergence is the
Context Budget row's wording, recorded below as CON-1 and already flagged in the spec as a Phase 3
follow-up.

## Quick Synthesized Reviewer (quick-synthesized-reviewer)

**Verdict:** PASS_WITH_NOTES

### CON-1 — warning — Behaviors 4 and 7 / charter Context Budget row

The charter (`.context-index/specs/features/heuristics/charter.md:214`) constrains error-triggered
retrieval to "signature-matched entries only, `summary` tier, default 3". Behaviors 4 and 7
deliberately widen this to a module-scope fallback within the same cap, which is the correct
resolution — a first occurrence of any failure matches no signature by definition, so an
unqualified "signature-matched only" rule would make the modal case return nothing. The
total-token invariant is preserved (never more than the caller's cap, default 3), so no budget
invariant is broken. The gap is bookkeeping: the spec's Phase 3 charter-amendment follow-up (the
Charter note in Behavior 2a) is scoped only to the high/medium *composition* wording and does not
record this second divergence in the same row.

**Recommendation:** extend the recorded follow-up to also cover the "signature-matched entries
only" phrasing, so both known divergences from `charter.md:214` travel together into the Phase 3
amendment.

### SA-1 — warning — Error Cases, "Store missing or unreadable" row

The row states the json output is `{"count":0,"rendered":""}`. The live store-failure path — the
`catch` around `retrieveHeuristics` in `lib/cli/heuristics.mjs` — emits a third key:
`{ count: 0, rendered: "", error: <message> }`. Only the *success*-path empty shape at `:214` is
two-key. Because the spec's normative instruction in Behavior 5 is "preserving each format's
existing empty-result shape **exactly**", an implementer following the literal Error Cases row
would drop the `error` field and change existing behavior.

Independently confirmed by the aggregator against live source.

**Recommendation:** correct the Error Cases row to name the catch-path shape including `error`, and
keep the two-key `:214` shape scoped to Behavior 5's matched-nothing case.

### SA-2 — suggestion — Behavior 4, second paragraph

Behavior 4 attributes the phrase "signature-matched entries only, capped at 3" to Behavior 7, but
Behavior 7 as written in revision 3 already says "drawn from signature matches where any exist and
otherwise from module scope". The quoted phrase is the charter's, not this spec's — stale prose
carried from the prior revision. The resolved text is internally consistent; only the attribution
is wrong.

**Recommendation:** attribute the quote to the charter row.

### SA-3 — suggestion — Error Cases, "Injection cap reached" row

"drops are reported in the rendered output" introduces an output requirement the live budget loop
does not implement (it drops silently), and it has no corresponding Task Map entry or acceptance
criterion.

**Recommendation:** either drop the clause or give it a task and a criterion.

### Security lens

No findings. The spec introduces no auth, credential, or trust-boundary surface. `signature`
matching is exact string comparison over already-parsed frontmatter (no index, no search library,
consistent with the constitution's "Minimize external dependencies"). Malformed `--signature`
values degrade to no-match rather than to an argument error, which is the right call for a path
that only ever runs during a failure. Retrieved content is inert markdown per the charter's Safety
attribute. Both revision-1 security blockers remain resolved.

### Known defects reviewed and confirmed out of scope

Defects (a) charter Consumed/Exposed API rows and `FailureSignature.digest` lag, (b) charter
`EvidenceRef.source` enum vs the store's four spellings, (c) `failure-signature-key.spec.md`
lagging its implementation, (d) the latent 500-char `pattern` cap, and (e) the Context Budget
wording gap were all reviewed. Each is correctly out of this spec's scope or already recorded as a
follow-up. (e) is the same charter row as CON-1.

---

## Summary

**Total findings:** 4 (0 blockers, 2 warnings, 2 suggestions)
**Action required:** None blocking. The spec is implementable and internally consistent at revision
3; all three revision-2 blockers, including the persistent `unbudgeted-exemption:4e641159` carried
from revision 1, are resolved. Proceed to `/adev:plan --spec .context-index/specs/features/heuristics/signature-retrieval.spec.md`.
The two warnings (CON-1, SA-1) are editorial corrections that can be folded into planning or a
later revision without another review round; SA-1 in particular should reach the implementer, since
following the Error Cases row literally would change the CLI's existing store-failure output shape.

**Governance footer:** `gates.yaml` declares no `spec-to-plan` approver role, so no additional
human approval is gated on this transition. `risk-policies.yaml` sets `require_hitl_approval: false`
for `medium`.
