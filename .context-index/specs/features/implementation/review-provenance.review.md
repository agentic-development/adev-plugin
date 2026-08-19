---
spec: .context-index/specs/features/implementation/review-provenance.spec.md
charter: .context-index/specs/features/implementation/charter.md
date: 2026-08-18
verdict: PASS_WITH_NOTES
rigor-tier: full
review-round: 4
last-reviewed-revision: 4
file-sha: c87b53415a3771e5d68d901db0ed1e0b67b4fea8e44d671342eb5c21ef979deb
---

# Architecture Review: review-provenance

> **Date:** 2026-08-18
> **Spec:** `.context-index/specs/features/implementation/review-provenance.spec.md`
> **Charter:** `.context-index/specs/features/implementation/charter.md`
> **Verdict:** PASS_WITH_NOTES
> **Rigor tier:** `full` (risk_level `medium` → `policies.medium.review_mode: full`; no `--tier` override)
> **Revision reviewed:** 4 (round 4)

## Registry Warnings

| Code | Message |
|---|---|
| `BROADEN_TOOL` | Profile `browser-review`: `allow_add` broadens posture by adding mcp_server `playwright`. |
| `BROADEN_TOOL` | Profile `browser-review`: `allow_add` broadens posture by adding category `web-fetch`. |
| `BROADEN_NETWORK` | Profile `browser-review`: network broadened `deny` → `read-only`. |

Registry `errors`: none. Registry `notes`: none. `verdict_rules.blocker_threshold: 1`.

## Transition Gate Note

`.context-index/governance/gates.yaml` declares no `spec-to-plan` transition (the entry is commented out), so no `approver_role` applies to this gate. Informational only.

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| `structural-architect` | Structural Architect | subagent | `reviewer-reasoning` | `plugin:review-specs/structural-architect-prompt.md` |
| `security-reviewer` | Security Reviewer | subagent | `reviewer-capable` | `plugin:review-specs/security-reviewer-prompt.md` |
| `consistency-analyzer` | Consistency Analyzer | subagent | `reviewer-fast` | `plugin:review-specs/consistency-analyzer-prompt.md` |

All three are `dispatch: always`, `severity_cap: blocker`, `context_pack: base`, sourced `domain:software` and materialized into the project registry. Delivery was `manifest` (path manifest + on-demand reads) under a nonce-scoped fence. No profile-disallowed tool call was surfaced by the harness for any reviewer.

Heuristics for module `implementation` were injected (3 blocks, tier `summary`) — all concern token-cost measurement and none bore on the findings.

No reviewers are disabled.

## Verification of the Five Revision-3 Blockers

Each rev-3 blocker was re-verified against the current spec text **and** against the code/specs the spec cites. None was accepted on the revision's assertion alone.

| rev-3 `blocker_id` | Status | Evidence |
|---|---|---|
| `structural-architect:incomplete-event-registration:77130709` | **RESOLVED** | Output Contract B now carries the four-step table naming all four sites. The step-2-without-step-3 consequence is factually correct: `lib/diagnostics/event-schemas.mjs` derives `KNOWN_EVENT_TYPES = Object.freeze([...CANONICAL_EVENTS])` from `lib/lifecycle-events.mjs`, and `lib/diagnostics/tier1/event-schema-valid.mjs` fires `adev/event-schema-valid` at `SEVERITY = 'error'` with *"unknown event type"* for an unregistered discriminator; `.context-index/governance/diagnostics.yaml` confirms `severity: error`, and `TIER1_WRITE_TIME_RUNNERS` in `lib/lifecycle-state.mjs` wires it into `appendEvent` before the write (strict → throw, tag → error-severity `diagnostic_warnings` on an append-only row). `lib/lifecycle-events.mjs` and `docs/cli-reference.md` are both in `source-manifest`. `docs/cli-reference.md:306` does pin the 6-value enum as quoted. AC 4 asserts both registration sites; AC 11 was reworded to testable terms and now acknowledges the change to what `adev/event-schema-valid` accepts. (Residual: the four-step text is misattributed — see SA-4.) |
| `structural-architect:incomplete-cross-spec-amendment:31717c35` | **RESOLVED** | Both halves are covered. `reviewRounds` is named in Contract B's property table and again in Contract C; the key/collision/must-not-land-in rows are stated; AC 7 asserts the projection surfaces it and that it does not reach `unknownEvents[]`. The underlying claim checks out: `currentState()` in `lib/lifecycle-state.mjs` gates on `CANONICAL_EVENTS.has(kind)` and its `default:` branch pushes to `projection.unknownEvents`, which the module documents as deprecated/back-compat-only. The cited precedent is real (`case 'test_depth_assigned'` folds to `projection.testDepthAssignments`, last-wins). (Residual: the key tuple is stated two ways — see SA-2/CON-2.) |
| `structural-architect:nonexistent-manifest-path:353776e7` | **RESOLVED** | `.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md` and `…/plan-task-events.spec.md` both exist on disk. Both amendment targets are given by full path in Contract B's table. `adev source-manifest verify` now reports only `Check 1.5: WARN — source manifest drifted (sha)`, with no missing-file error. (Residual: the named target *section* does not exist — see SA-9.) |
| `security-reviewer:input-validation:07c296eb` | **RESOLVED (adopted)** | The rev-2 SEC-1 recommendation is now in the spec: `buildReviewRoundTrailer(stage, cycles)` in `lib/lifecycle-state.mjs`, co-located with `reportReviewRound()`, is named as the *only* sanctioned producer, with four explicit refusal rules (CR/LF, control/ANSI, over-cap length, out-of-enum stage / `cycles < 1`); `skills/implement/SKILL.md` step 2h is required to name the helper; the Failure Modes rows now read "refuses to emit … raises" rather than "recorded verbatim", and "never coerced" is scoped explicitly to VALUE semantics. The stated CWE framing (CWE-93 / 113 / 150) is apt. (Residuals: the `escapeField` citation misdescribes that function — SA-3/SEC-2; and the `cycles` type contract is unpinned — SEC-1.) |
| `consistency-analyzer:contract:8f4c2e7a` | **RESOLVED** | `graduated-review-depth.spec.md` no longer contains the string `Review-stage:` anywhere. Its Output Contract G now reads `Review-round: synthesized=<cycles>` plus a `review_round` event whose `stage` is `synthesized` (lines 292-294), and its acceptance criterion (line 353) was updated to match both provenance channels. Trailer key and event shape now agree with this spec's Contract A/B exactly. (Residual: "every **fix** commit" wording — see SA-8/CON-1.) |

**All five are genuinely resolved.** Every residual noted above is a distinct, narrower defect introduced or exposed by the fix, not a re-raise of the original.

## Orchestrator Severity Adjudication

Three findings were emitted at `blocker` severity and are recorded here as `warning` after verification against the spec text. The threshold applied is the one the skill defines: `blocker` is reserved for a defect that makes the contract **unimplementable**, **internally contradictory in a way that yields divergent conformant implementations**, or **in breach of another spec's owned contract**. The reasoning is recorded so the adjudication is auditable rather than silent.

| Finding | Emitted | Recorded | Reason |
|---|---|---|---|
| SA-1 (emission on tasks that never reach 2h) | `blocker` | `warning` | The contract as written is determinate, not ambiguous: Contract B emits "at task completion", and a task terminating on `LOOP_NO_PROGRESS` / `LOOP_REGRESSED` / `LOOP_BUDGET_EXHAUSTED` never completes, so no event is emitted — which the spec's own "Absence means 'not recorded', never 'zero'" rule already renders honestly. The corpus-censoring concern is substantive and material to this spec's stated purpose, but it is a **design-coverage gap**, not an implementability or consistency defect. |
| SA-2 (key tuple stated two ways) | `blocker` | `warning` | Real precision defect, confirmed at spec lines 257, 309, 332, 339. However the spec's *normative* surfaces are unambiguous and agree: the Contract B fold table pins `${plan}::${task_id}::${stage}` and AC 7 pins `plan::task_id::stage`. The two-part `(task_id, stage)` mentions are abbreviated back-references to that same rule, in the duplicate-emission Failure Modes row and AC 14. An implementer building the fold follows the table; no divergent conformant implementation of the projection is available. The independent Consistency Analyzer reached `suggestion` on the same discrepancy. Recorded as the **highest-priority warning** — fix before planning. |
| SEC-1 (`cycles` type coercion → CR/LF forgery) | `blocker` | `warning` | The finding's premise is contradicted by the spec text it reviews. Contract A's first refusal bullet is unqualified — *"**rejects embedded CR/LF**, so a value cannot forge an additional trailer line on the commit"* — and applies to the trailer text, not to `stage` alone; AC 9 independently requires a test that the helper "rejects embedded CR/LF". A conformant implementation therefore already refuses `cycles = "1\nEvil-Trailer: x"`. The genuine residual is that the spec does not pin `cycles`'s **type**, so a naive `cycles < 1` guard alone would pass `NaN` — a worthwhile tightening of an already-specified control, i.e. a refinement. |

No finding was suppressed. Two findings that a lenient reading might have dropped (SA-5, SA-9) are retained at the severity their reviewer emitted.

## Structural Architect (structural-architect)

**Verdict:** PASS_WITH_NOTES

Overall: structurally much stronger than rev 3. The registration chain, the fold rule, the two-channel rationale, and the `plan_task`-not-widened boundary all verify correct against the code and against `plan-task-events.spec.md`.

**SA-1 — `warning`** *(emitted `blocker`; adjudicated above)* — Location: Output Contract B ("One event per stage per task, emitted at task completion") + Failure Modes.
`review_round` emission is pinned to task completion and the blocked/escalated path is never addressed. `skills/implement/SKILL.md` 2f escalates after 3 Stage-1 cycles, and 2g's terminal non-PASS verdicts explicitly do not fall through to 2h — no commit, no `plan_task` `done`. So a blocked task records neither trailer nor event. Under the spec's own "Absence means 'not recorded', never 'zero'" rule, the maximum-cycle / maximum-findings tail of the distribution becomes indistinguishable from unmeasured tasks — the corpus is censored on precisely the variable the spec exists to measure. The Failure Modes table names only the crash-resume case, where the count is genuinely *unknown*; here the count is known and the task simply never completes. The gap is asymmetric across the pair: dependent `graduated-review-depth.spec.md` does carry a non-convergence failure row.
*Recommendation:* state the emission trigger for tasks that terminate without reaching 2h — either emit accumulated per-stage counts at escalation time (and say so in Contract B and Failure Modes), or state explicitly that blocked tasks are not recorded and accept the censoring as a declared limitation.

**SA-2 — `warning`** *(emitted `blocker`; adjudicated above; overlaps CON-2)* — Location: Failure Modes (duplicate-emission row) + Output Contract B (fold table) + AC 14.
The last-wins key is stated as two different tuples and the spec asserts they are the same. The fold table pins `Key = ${plan}::${task_id}::${stage}` and AC 7 repeats it; the Failure Modes row (line 309) and AC 14 (line 339) both state consumers treat *"the last event per `(task_id, stage)`"* as authoritative; and line 257 then claims *"The `(task_id, stage)` last-wins rule the Failure Modes table states is thereby implemented by the fold"* — it is not, the fold implements a three-part key. Not cosmetic: task ids are plan-scoped, and the repo has live precedent for both conventions (`testDepthAssignments` keyed `${plan}::${task_id}` with an explicit comment that assignments are plan-scoped; `projection.planTasks` keyed by `ev.task_id` alone).
*Recommendation:* pick one tuple and use it in all four places. The fold's three-part key is the one that matches the `testDepthAssignments` precedent it claims to mirror — correct the Failure Modes row, AC 14, and the "thereby implemented" sentence to `(plan, task_id, stage)`. **Fix this before `/adev:plan`.**

**SA-3 — `warning`** *(overlaps SEC-2)* — Location: Output Contract A (trailer helper).
`escapeField`'s actual semantics are incompatible with what the spec asks of it. Its six-rule pipeline (`lib/issues/render-markdown.mjs`, `escapeField`) *normalizes* `\r\n`/`\r` → `\n` then (inline slot) → space, HTML-escapes, markdown-escapes, and *truncates* at a cap with a `…[truncated]` marker, returning an em-dash placeholder for empty input. It cannot reject anything and has no control/ANSI handling at all. The spec asks the helper to **reject** CR/LF, **reject** control/ANSI, and **enforce** a cap — the opposite disposition — while the Failure Modes rows insist *"Nothing is coerced — the value is rejected, not rewritten."* Separately, on the only legal value shape (`<enum-stage>=<integer>`) `escapeField` is a strict no-op, so the reuse buys nothing even where harmless. The reject requirements are stated four times and AC 9 asserts only rejection, so the contract's intent is recoverable — hence `warning` — but the citation as written points an implementer at a coercing helper.
*Recommendation:* drop the `escapeField` reuse claim and the "already imported by `lib/lifecycle-state.mjs`" aside (that import is real — line 33 — but irrelevant), and keep the validate-and-refuse obligations as the contract. If `escapeField` is retained for defense in depth, say explicitly that it is not the primary control.

**SA-4 — `warning`** — Location: Output Contract B (four-step registration).
The four-step process is misattributed. The spec says *"`lib/lifecycle-events.mjs` states it in its header."* It does not — that file's 79-line header documents only the module-cycle extraction. The four-step text lives in `lib/diagnostics/event-schemas.mjs`'s header (*"Adding a new event type is a four-step process: amend the lifecycle-event-log spec, extend `CANONICAL_EVENTS` in `lib/lifecycle-state.mjs`, extend the maps here, and add producer-test fixtures"*), sourced to `diagnostic-registry.spec.md` rev 2 amendment 12. The spec's own step table is correct on the *current* site (`lib/lifecycle-events.mjs`, since the constant moved and `lifecycle-state.mjs` only re-exports).
*Recommendation:* cite `lib/diagnostics/event-schemas.mjs`'s header, and note that the process text there still names the pre-extraction location for step 2.

**SA-5 — `warning`** — Location: System Constitution Reference ("requires no human-approval gate").
Both precedents the reviewer checked — `spec_amended` and `test_depth_assigned` — carry `[BOUNDARY: human-approved] Adding a canonical event touches the lifecycle event schema governed by ADR-0009; confirmed intentional by review (PASS_WITH_NOTES)` in `lib/lifecycle-events.mjs`, and ADR-0009 §8 names *"the ADR-0009-governed lifecycle event schema"* while conditioning its exception class on the decision being recorded there. This spec adds a third canonical event, records it in no ADR, and affirmatively denies any gate without mentioning the convention. Not a blocker because ADR-0009's *Decision* body gates `kind:` additions rather than event additions, CLAUDE.md's "Requires Human Approval" list genuinely does not cover the event schema, and the marker's own wording (*"confirmed intentional by review"*) makes this review round the place the confirmation is discharged — **consider it discharged here**. The Consistency Analyzer independently established that the precedent is split: `partial_recovery`, `spec_revised`, `human_approval_required`, and `code_drift_detected`/`_cleared` were all added by validated specs with no ADR-0009 citation and no boundary tag, so the spec's "Autonomous" classification is within established norms.
*Recommendation:* replace the "requires no human-approval gate" clause with an acknowledgement of the `[BOUNDARY: human-approved]` convention, and add an AC that the new `CANONICAL_EVENTS` / `REQUIRED_FIELDS_BY_EVENT` entries carry the same marker citing this review round.

**SA-6 — `warning`** — Location: System Constitution Reference (ADR-0018 bullet).
The ADR-0018 treatment addresses the carrier but not the thesis. The spec's rebuttal — `reviewer_report` has no `task_id` and `reportReviewer()` accepts none — is factually correct (verified against `reportReviewer`'s destructured args: `step, reviewer, verdict, notes, domain, pluginRoot, revision`). But ADR-0018's decision is not merely "use `reviewer_report`"; its central argument is that rotation *"proposed to build a second per-attempt store alongside the one that already exists"*, and this spec builds one (`review_round` + `reviewRounds`). A mechanical objection to reusing one payload is not a rebuttal of that argument. Two mitigating facts the spec does not use: ADR-0018's status is **Proposed**, not Accepted; and `/adev:implement` emits no `reviewer_report` events at all for its per-task stage reviews, so ADR-0018's premise that a per-attempt store "already exists" is true for `/adev:review-specs` and `/adev:validate` but false for the surface this spec instruments.
*Recommendation:* strengthen the bullet with the "no `reviewer_report` on the implement per-task path" observation, and amend ADR-0018 (or file a successor) so the divergence is recorded where ADR readers will find it.

**SA-7 — `warning`** — Location: Arguments table + AC 12.
The declared CLI signature omits `--spec`, without which the event cannot be routed to a log. `appendEvent(projectRoot, specPath, payload)` writes per-spec, `currentState(projectRoot, specPath)` folds per-spec, and every existing `--type` in `lib/cli/report.mjs` validates `--spec` as required (`--type step requires --spec`, `--type reviewer requires --spec`, …). The spec's row enumerates `--plan`, `--task-id`, `--stage`, `--cycles`, `--findings` exhaustively but not `--spec`, and AC 12 repeats the flag list without it. Resolvable unambiguously from the sibling verbs, hence `warning` — but the spec never states which spec's log receives these events.
*Recommendation:* add `--spec <path>` to the Arguments row and AC 12, and state that events land on the log of the spec the plan belongs to (matching `test_depth_assigned`).

**SA-8 — `warning`** *(same issue as CON-1)* — Location: Output Contract A (commit granularity), cross-spec.
Contract A's load-bearing claim is that provenance is a **per-stage aggregate on one task commit** and that *"no commit is exclusively a Stage 1 or Stage 2 fix."* `graduated-review-depth.spec.md` Output Contract G states *"Every fix commit produced by a synthesized reviewer carries a `Review-round: synthesized=<cycles>` trailer"* — "fix commit" reads as per-fix-pass, which the one-commit-per-task invariant (reinforced by `incremental-artifact-writes.spec.md` Integration Point 2 and `batched-task-dispatch.spec.md`) forbids. review-provenance owns the trailer contract, so the dependent spec has mis-read it.
*Recommendation:* the sibling should change, not this spec — reword Contract G to "the task's single commit". Optionally add an explicit invariant here that a stage's trailer is emitted exactly once per task commit and never per fix pass. Land both in the same change.

**SA-9 — `warning`** — Location: Output Contract B (amendment table, row (i)).
The amendment target names a section that does not exist. `lifecycle-event-log.spec.md` has no "Canonical Event Variants" heading (verified: its headings are Behavioral Contract, Naming Conventions (CON-1), Path Safety, System Constitution Reference, Actionable Task Map, Visual Expectations, Acceptance Criteria, Preconditions, Behaviors, Postconditions, Error Cases — and the string "Canonical Event Variants" appears nowhere in the file). The phantom name is pre-existing corpus drift, cited the same way by `lib/lifecycle-events.mjs` and by `explicit-governance-registries`' artifacts, so this spec propagates rather than originates it. The `reviewRounds` half additionally needs the Behaviors and Acceptance-Criteria projection enumerations, which the current wording does not name.
*Recommendation:* name the concrete sites — the `Naming Conventions (CON-1)` discriminator list for `review_round`, and the Behaviors / Acceptance Criteria projection enumerations for `reviewRounds` — rather than a heading that isn't there.

**SA-10 — `suggestion`** — Location: Output Contract B / AC 8.
The `--type` enum is duplicated in four places inside `lib/cli/report.mjs` (top-of-file usage constant, missing-`--type` error, unknown-`--type` error, `--help` output), and three of them already disagree with `docs/cli-reference.md` about `cost-checkpoint` (the in-code usage string omits it). AC 8 pins only the docs file, leaving three sites free to drift.

**SA-11 — `suggestion`** — Location: Output Contract B (`cycles` field).
`cycles` is bounded only below (`>= 1`). `skills/implement/SKILL.md` caps both stages at 3 cycles, and `graduated-review-depth.spec.md` makes that cap configurable via `implement.max_review_cycles`. Either add an upper-bound sanity check or state explicitly that none is imposed so a future cap change needs no schema edit.

## Security Reviewer (security-reviewer)

**Verdict:** PASS_WITH_NOTES

The rev-3 non-response is genuinely adopted. The `stage` channel is now closed by strict 3-member enum equality, which carries the CR/LF-forgery property independently of `escapeField`. No authentication, authorization, secrets, or rate-limiting exposure: the spec adds no endpoint, no credential, and no externally-triggerable expensive operation; both channels carry a closed-enum stage name, a small integer, and an optional non-negative integer.

**SEC-1 — `warning`** *(emitted `blocker`; adjudicated above)* — Category: input-validation. Location: Output Contract A.
The construction guard specifies `cycles < 1` as the only numeric rejection rule for `buildReviewRoundTrailer(stage, cycles)`, with no type check. In JavaScript `NaN < 1` is `false`, so a naive implementation of *only* that rule would pass a non-numeric `cycles` untouched. The spec's separate, unqualified CR/LF refusal bullet and AC 9's CR/LF test already close the forgery path for a conformant implementation, which is why this is a warning rather than a blocker — but the type contract is worth pinning, because AC 9 phrases the numeric case identically to the loose rule and an implementer testing only `0` and `-1` would leave the coercion path uncovered.
*Recommendation:* state in Output Contract A / Failure Modes that `buildReviewRoundTrailer` rejects `cycles` unless `Number.isInteger(cycles) && cycles >= 1` (or, if it may arrive as a CLI string, unless it matches `^\d+$` before conversion) — not merely `cycles < 1` on whatever type arrives. Add an explicit AC case for a `cycles` value containing embedded CR/LF, distinct from the `cycles: 0` / negative cases. Tightening `reportReviewRound()`'s equivalent `cycles < 1` / `findings < 0` guards the same way is reasonable hardening; the consequence there is a malformed JSON field in an append-only log rather than permanent-history trailer forgery, so it is not required.

**SEC-2 — `suggestion`** *(same issue as SA-3)* — Category: input-validation (documentation precision).
Output Contract A's *"It reuses `escapeField` … and: rejects embedded CR/LF … rejects control and ANSI escape sequences"* attributes rejection behavior to a function that only coerces, and that is a no-op once a value has passed the enum/integer whitelist. As written it could lead an implementer to believe `escapeField` alone discharges the CRLF/ANSI mitigation, when the actual mitigation is the closed-enum-plus-integer value shape.
*Recommendation:* drop the `escapeField` citation, or keep it explicitly as non-primary defense in depth.

**Risk-level check:** declared `medium`; still appropriate. The residual risk is data-integrity/history-forgery via git trailers, not auth, secrets, or an externally reachable surface.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

Cross-references verified against current text and code: the `plan_task` non-widening claim against `plan-task-events.spec.md`'s closed-payload clause; the four-step registration process against `lib/diagnostics/event-schemas.mjs`'s header; the `measurement-integrity.spec.md` dissolution date; ADR-0018's `reviewer_report` field surface; the `cq-<n>` / no-id-convention split between `skills/implement/SKILL.md` 2f and 2g; the one-commit-per-task mandate in step 2h; and the snake_case-discriminator / camelCase-projection-key split from `lifecycle-event-log.spec.md`'s CON-1. All held.

A lead chased and rejected: whether adding `review_round` to `CANONICAL_EVENTS` without invoking ADR-0009 / `[BOUNDARY: human-approved]` is a real gap. The precedent is split — `partial_recovery`, `spec_revised`, `human_approval_required`, and `code_drift_detected`/`_cleared` were all added by validated specs with no ADR-0009 citation and no boundary tag (confirmed in `incremental-artifact-writes.spec.md`'s Constitution Reference, which added `partial_recovery` the same way). This spec's "Autonomous" classification is within established norms. Not flagged as a conflict; SA-5 retains the narrower documentation point.

**CON-1 — `warning`** *(same issue as SA-8)* — Category: terminology.
- **This Spec:** commit granularity is one commit per task; *"no commit is exclusively a Stage 1 or Stage 2 fix"* (Output Contract A).
- **Conflicts With:** `graduated-review-depth.spec.md` Output Contract G: *"Every fix commit produced by a synthesized reviewer carries a `Review-round: synthesized=<cycles>` trailer…"* — plural-implying "fix commit" reads as if a synthesized review could produce more than one commit per task, which the one-commit-per-task invariant (`incremental-artifact-writes.spec.md` Integration Point 2; `batched-task-dispatch.spec.md` AC) forbids.
- **Recommendation:** the sibling spec should change to "the task's single commit" / "every task commit produced under the synthesized reviewer". Its own Acceptance Criteria already use task-scoped language, so this is an isolated wording slip in Contract G's prose, not a design defect.

**CON-2 — `suggestion`** *(same issue as SA-2)* — Category: domain-model.
- **This Spec:** the fold table gives the `reviewRounds` key as `` `${plan}::${task_id}::${stage}` ``, matching AC 7 (`plan::task_id::stage`).
- **Conflicts With:** its own prose two paragraphs later (*"The `(task_id, stage)` last-wins rule…"*) and the Failure Modes row (*"the last event per `(task_id, stage)`"*), both of which drop `plan`. Self-inconsistency within this spec, not a cross-spec conflict; the cited precedent `testDepthAssignments` is itself a two-part key (`${plan}::${task_id}`), so the shorthand may be an unintentional echo of that precedent's arity.
- **Recommendation:** align the Failure Modes row and the self-referential prose to `(plan, task_id, stage)` so a future implementer building the dedup key from prose does not drop `plan` and conflate same-named tasks across plans.

---

> A **per-reviewer** verdict is never BLOCK. BLOCK is the *consolidated* verdict in the header, computed from post-cap findings across all reviewers — PASS (zero warnings/blockers), PASS_WITH_NOTES (>=1 warning, zero blockers), BLOCK (>= `verdict_rules.blocker_threshold` blockers, default 1). No severity cap was applied: all three reviewers carry `severity_cap: blocker`, so no finding was clamped. The three `blocker` → `warning` changes recorded above are orchestrator adjudications against the stated blocker threshold, documented individually in the Orchestrator Severity Adjudication table, not cap demotions.

---

## Summary

**Total findings:** 15 (0 blockers, 11 warnings, 4 suggestions)

Three distinct issues are double-reported across reviewers: SA-2 = CON-2 (key tuple), SA-3 = SEC-2 (`escapeField` citation), SA-8 = CON-1 (sibling "fix commit" wording). The distinct-issue count is therefore 12.

**All five revision-3 blockers verified genuinely resolved**, each against the code or sibling spec it cites rather than against the revision's own assertion. Round 4 is the first round of this spec to clear the blocker threshold.

**Action required:** none blocking. The spec is ready for `/adev:plan`. Five warnings are mechanical text fixes that cost minutes and are worth landing before or during planning rather than after:

1. **SA-2 / CON-2** — align the last-wins key to `(plan, task_id, stage)` in the Failure Modes row, AC 14, and the "thereby implemented" sentence (the fold table and AC 7 are already correct). Highest priority.
2. **SA-3 / SEC-2 + SEC-1** — drop or demote the `escapeField` citation; pin `cycles` to `Number.isInteger(cycles) && cycles >= 1`; add a CR/LF-in-`cycles` acceptance case.
3. **SA-7** — add `--spec <path>` to the Arguments table and AC 12.
4. **SA-4 / SA-9** — fix the two citations: attribute the four-step process to `lib/diagnostics/event-schemas.mjs`, and name real sections in `lifecycle-event-log.spec.md` instead of the phantom "Canonical Event Variants table".
5. **SA-8 / CON-1** — reword `graduated-review-depth.spec.md` Contract G from "every fix commit" to "the task's single commit", landing with this spec.

SA-1 (no provenance for tasks that never reach 2h) is the one warning that is a design decision rather than a text fix. It does not block planning, but it should be decided explicitly — emit at escalation, or declare the censoring — because it bounds what the corpus this spec exists to build can answer.

**Stale artifact note:** `review-provenance.blockers.md` on disk is the revision-3 sidecar. No new sidecar was written (PASS_WITH_NOTES emits none). The rev-3 file is now superseded and can be removed.

**Source-manifest note:** `adev source-manifest verify` reports `Check 1.5: WARN — source manifest drifted (expected sha "", actual f79a82f)`. The sha is unstamped rather than stale — expected for a spec that has not yet been implemented — and no file is missing. Not a review finding.
