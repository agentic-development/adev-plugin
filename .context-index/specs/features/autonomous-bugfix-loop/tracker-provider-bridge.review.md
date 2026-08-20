---
last-reviewed-revision: 6
file-sha: c32470ee55ec501e3682e4f6ed3959a60ced09eb79eae475eb4edca711bd12ce
---

# Architecture Review: tracker-provider-bridge (round 6)

> **Date:** 2026-08-20
> **Spec:** .context-index/specs/features/autonomous-bugfix-loop/tracker-provider-bridge.spec.md
> **Charter:** .context-index/specs/features/autonomous-bugfix-loop/charter.md
> **Verdict:** BLOCK
> **Rigor tier:** full
> **Note:** Re-review after round-5 BLOCK (BD-1: untrusted-content wrap not nonce-scoped;
> TR-1/TR-2: retry counters described as "adapter-local," unimplementable under the
> fresh-context-per-turn execution model). Revision 6 replaced the fixed wrap template with
> a nonce-scoped fence reusing `lib/governance/context-pack.mjs`'s `fenceBlock`/
> `neutralizeFenceTokens`, and replaced both "adapter-local" retry counters with a new
> `BugfixLoopRun.sync_retry_counts` field persisted in the run-state file
> `bugfix-loop-skill.spec.md` already owns (registered in `charter.md`'s Domain Model,
> revision 8). **All three round-5 fixes were independently re-verified against actual
> source this round, not rubber-stamped:** the Boundary Reviewer confirmed `fenceBlock`
> is proven machinery already load-bearing elsewhere (`dispatch-shape.mjs`'s
> `fencedSpec`/`provenanceRule`), and the Termination Reviewer confirmed the persisted
> counter closes the implementability gap cleanly — both round-5 blockers (BD-1, TR-1,
> TR-2) are resolved. However, the Wiring Reviewer surfaced **three new blockers** on
> content this revision did not touch: `TrackerProviderRegistry` is described but never
> actually called from the Interaction Contract (no-caller), and two `TrackerSyncLink`
> fields (`accepted_at`, and `last_synced_at`/`last_comment_id`) are written but never
> read (write-only-state). These are pre-existing gaps in revision 5 (the registry gap was
> flagged as a WARNING, not a blocker, by round-5's own Wiring Reviewer — WR-1 in that
> round's report) that this round's Wiring Reviewer independently re-assessed at blocker
> severity. The Boundary Reviewer also raised one new warning (BD-1 in this round's
> numbering, a different finding from round-5's BD-1): the GitHub issue **title** is
> capped but not fenced/neutralized the way the **body** now is, so a title containing a
> literal fence-prefix string is not neutralized. The consolidated verdict is BLOCK on the
> Wiring Reviewer's three new blockers — the fixes this revision set out to make (BD-1,
> TR-1, TR-2 as scoped by the round-5 report) hold up cleanly under independent
> re-verification.

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |
| referent-integrity | Referent Integrity Reviewer | subagent | reviewer-reasoning | plugin:review-specs/referent-integrity-prompt.md |
| wiring-reviewer | Wiring Reviewer | subagent | reviewer-capable | plugin:review-specs/wiring-reviewer-prompt.md |
| boundary-reviewer | Boundary Reviewer | subagent | reviewer-capable | plugin:review-specs/boundary-reviewer-prompt.md |
| termination-reviewer | Termination Reviewer | subagent | reviewer-fast | plugin:review-specs/termination-reviewer-prompt.md |

## Disabled Reviewers

| ID | Reason |
|----|--------|
| structural-architect | Disabled as part of the reviewer-domain-fit initiative. OWASP/structural scope was retargeted to referent-integrity/wiring-reviewer/consistency-analyzer/boundary-reviewer for the default (Node CLI/plugin) project shape. Prompt retained on disk. |
| security-reviewer | Disabled as part of the reviewer-domain-fit initiative. OWASP-scoped review relocated to the web-service domain extension (opt-in via `adev extension install web-service`). Prompt retained on disk. |

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS

No findings. Verified against the `base` context pack (constitution + platform context — this
reviewer's materialized `context_pack` in the current `governance/review.yaml` is `base`, not the
broader `consistency` pack): naming (camelCase functions, kebab-case files), pattern conformance
(registry mirrors `lib/provider/registry.mjs`'s plain-map shape; append-only JSONL matches
ADR-0015's convention), and the constitution's "minimize external dependencies" principle (the
`gh` CLI reuse, no new npm dependency). Explicitly noted that charter/sibling-spec/ADR
cross-referencing was out of its received context this round and deferred to the other reviewers'
packs, rather than asserting a check it could not actually perform.

## Referent Integrity Reviewer (referent-integrity)

**Verdict:** PASS_WITH_NOTES

- **RI-1 (warning):** The System Constitution Reference's "Existing mitigation" bullet says
  `escapeField` "only runs inside `renderTasksMd`/`writeTasksMd`, invoked solely by the opt-in
  `adev status --render` CLI path." `escapeField` has a second importer, `lib/lifecycle-state.mjs`
  (used at lines 2490/2504/2548/2566/2583 to render lifecycle `.md` files, including `notes`
  fields). "Solely" is overbroad. The bullet's operative conclusion is unaffected — `cli/index.mjs`
  imports both renderers under the same `wantRender`/`--render` gate — but the citation should
  name both callers. **Recommendation:** reword to "`escapeField` never runs on the `notes` write
  path; its callers (`renderTasksMd`/`writeTasksMd` and `lib/lifecycle-state.mjs`'s markdown
  renderer) all run only under the opt-in `adev status --render` path."
- **RI-2 (suggestion):** The Phase 1 provenance-rule sentence is described as "modeled on"
  `dispatch-shape.mjs`'s `provenanceRule`, but the real string interpolates the live nonce and
  the spec's variant deliberately does not. Accurate but could mislead a reader into assuming
  byte-identical reuse; suggest stating the divergence explicitly.
- **RI-3 (suggestion):** `/adev:bugfix-loop --github-sync` (the Participants/Interaction Contract
  trigger) is declared by the sibling `bugfix-loop-skill.spec.md` but not yet implemented
  (`skills/bugfix-loop/` does not exist on disk). The spec already gives this same
  "verified against current source, does not exist today" treatment to the Phase 1 read gap;
  suggest the same explicit note for symmetry here.

Every other referent the spec names (`fenceBlock`/`neutralizeFenceTokens`, `renderPack`,
`CONTEXT_PACK_FENCE_COLLISION`, `lib/provider/registry.mjs`, `DEFAULT_BACKEND`,
`BACKEND_READ_ONLY_DEPRECATED`, `escapeField`'s escape set, `scanPullRequests`,
`lib/milestones.mjs`'s gated `gh` calls, `skills/debug/SKILL.md` Phase 1's non-read of `notes`,
`IssueManagerInterface`, `charter.md`'s `sync_retry_counts`/`TrackerSyncLink` field sets, ADR-0015's
table, `tasks.bugfix_loop` namespace) was independently checked against source and confirmed
accurate — full citation list in the dispatch record. The raw fence literals on disk were also
independently checked with `od -c` and confirmed to be genuine `<<<ADEV-PACK-` prefixes (the
neutralized `<‹<` rendering the reviewer saw is `neutralizeFenceTokens` correctly acting on the
spec body as repository-sourced-but-untrusted content within this review's own context pack, not a
defect in the spec).

## Wiring Reviewer (wiring-reviewer)

**Verdict:** FAIL

- **WR-1 (blocker — no-caller):** `TrackerProviderRegistry` (and its driving config key
  `tasks.bugfix_loop.tracker_provider`) is introduced in Participants but the Interaction Contract
  never routes through it — every step hardcodes "the GitHub adapter's `gateCheck()`/...", not "the
  adapter resolved via `TrackerProviderRegistry`." The Acceptance Criteria only assert the map is
  *addable*, never that anything looks it up at runtime. **Pre-existing in revision 5** — round-5's
  own Wiring Reviewer flagged this as WR-1, a **warning**, not a blocker; this round's Wiring
  Reviewer independently re-assessed the same gap at blocker severity.
  **section_anchor:** `participants` · **finding-type:** `no-caller`
- **WR-2 (blocker — write-only-state):** `TrackerSyncLink.accepted_at` is set at creation
  (Interaction Contract, inbound step 3) but never read anywhere in this spec, the charter Domain
  Model, or any sibling spec. **section_anchor:** `interaction-contract-inbound-3` ·
  **finding-type:** `write-only-state`
- **WR-3 (blocker — write-only-state):** `TrackerSyncLink.last_synced_at`/`last_comment_id`
  (Interaction Contract, outbound step 3) — the spec itself already discloses these as "audit-only
  fields with no programmatic reader in this charter." Wiring Reviewer treats disclosed write-only
  state the same as undisclosed: a value only ever set is a wiring gap either way.
  **section_anchor:** `interaction-contract-outbound-3` · **finding-type:** `write-only-state`
- **WR-4 (warning):** The ADR-0015 registration task for `tracker-sync-links.jsonl` names a
  consumer/trigger (implementation-time registration) but no test extends the existing
  `tests/adrs/0015-decision-table.test.mjs` precedent to cover the new artifact.
- **WR-5 (suggestion, fully wired):** `WorkItem.notes` → `skills/debug/SKILL.md` Phase 1 chain is
  complete per spec text (consumer, trigger, and test all named) — not a blocker, though the
  cross-charter dependency risk (this spec cannot itself guarantee `implementation`'s owner lands
  the edit) could be stated more prominently.
- **WR-6 (suggestion, fully wired):** `affected_modules: []` → `bug-selection-and-eligibility`
  BEH-10 fail-closed exclusion. No issue.
- **WR-7 (suggestion, fully wired):** `BugfixLoopRun.sync_retry_counts.unreachable_consecutive_turns`
  / `degraded_sync_note` — read/written each turn by this bridge, read by `bugfix-loop-skill`'s
  Output Contract, dedicated test named. **This is the TR-2 fix — confirmed fully wired, not just
  bounded.**
- **WR-8 (suggestion, fully wired):** `BugfixLoopRun.sync_retry_counts.oversized_consecutive_turns`
  — read/written each turn's `gateCheck()`, dedicated test named. **This is the TR-1 fix —
  confirmed fully wired, not just bounded.**
- **WR-9 (suggestion, fully wired):** `TrackerProviderAdapter.gateCheck()`/`fetchGated()`/
  `postComment()` — consumers and triggers explicit, covered by the end-to-end acceptance
  criterion. No issue.

## Boundary Reviewer (boundary-reviewer)

**Verdict:** PASS_WITH_NOTES

Independently re-verified the round-5 BD-1 fix against actual source before evaluating anything
new: `neutralizeFenceTokens`'s `FENCE_PREFIX_RE` detection is confirmed nonce-independent by
design (rewrites the literal `<<<ADEV-PACK-`/`<<<END-ADEV-PACK-` prefix regardless of trailing
token), `fenceBlock` always routes the body through it before wrapping, and this is proven
machinery already load-bearing elsewhere in this codebase (`dispatch-shape.mjs`'s `fencedSpec`/
`provenanceRule` for reviewer dispatch) — not new, unexercised surface. Outbound writeback
confirmed to never echo untrusted GitHub text back (fixed-template comments only). Both the `gh`
CLI invocation and the beads `--description` write confirmed argv-array (`spawnSync`/
`execFileSync` with array args, no `shell: true`) by direct source inspection
(`lib/cli/coordination.mjs`, `lib/issues/beads-adapter.mjs`). **Round-5's BD-1 is genuinely
resolved.**

- **BD-1 (warning — Input trust, this round's numbering, a distinct finding from round-5's BD-1):**
  Title and body are described as refused past their length caps "in the same breath," but only
  **body** is passed through `fenceBlock`/`neutralizeFenceTokens` — **title** is stored unfenced
  and unneutralized. If `IssueManager.get(id)` ever surfaces the whole WorkItem (title + notes
  together) to an agent's context — plausible, since Phase 1 is markdown prose consumed by an LLM,
  not code that can silently strip fields — a malicious title containing a literal
  `<<<END-ADEV-PACK-...` string is not neutralized and could forge an apparent fence boundary
  adjacent to the real one. **Recommendation:** either (a) scope the Phase 1 read to just `notes`
  so title never enters the same context window, or (b) apply `neutralizeFenceTokens` to title as
  well before storage, symmetric with body's treatment.
  **section_anchor:** `interaction-contract` · **finding-type:** `unfenced-sibling-field`

Checklist items 1 (Path containment), 2 (Subprocess interpolation), 4 (Privilege posture), 5
(Artifact leakage), and 6 (Destructive filesystem operations) checked and found consistent —
`run_id` confirmed `crypto.randomUUID()` (never externally derived), both subprocess call sites
confirmed argv-array, artifact-leakage tracking (residual `escapeField` gap) confirmed honestly
tracked as a separate task rather than hidden, no destructive filesystem operation introduced.

## Termination Reviewer (termination-reviewer)

**Verdict:** PASS

Independently re-derived cap / cap-trip / unattended-default for both retry constructs rather than
accepting the round-6 fix at face value, cross-checked against the charter's stated execution
architecture (fresh-context-per-turn self-re-invocation, process-restart-tolerant).

- **GitHub-unreachable counter (round-5 TR-2):** `BugfixLoopRun.sync_retry_counts
  .unreachable_consecutive_turns`, persisted in the run-state file every turn — confirmed this
  survives fresh-context re-invocation (the file, not an in-process variable, carries the count).
  Cap (5), cap-trip verdict (`degraded_sync_note` written once, `gateCheck()` stops being called
  for the remainder of the run via the note's own presence as the persisted disable signal), and
  unattended default (fails safe: proceeds local-board-only, never throws) are all present and
  concrete. **No finding — fully resolved.**
- **Oversized-refusal counter (round-5 TR-1):** `BugfixLoopRun.sync_retry_counts
  .oversized_consecutive_turns[<issue-number>]`, same persistence mechanism, same verification.
  Cap (5 per issue number), cap-trip verdict (exclusion from `gateCheck()`'s candidates for the
  remainder of the run), and unattended default (fails safe, no exception) all present and
  concrete. Fresh-`run_id` reset behavior confirmed structurally (no run-state file → default
  empty map). **No finding — fully resolved.**
- No other loop/retry/poll construct found in this spec's scope beyond these two.

> A **per-reviewer** verdict is never BLOCK. BLOCK is the *consolidated*
> verdict in the header above, computed from post-cap findings across all
> reviewers — PASS (zero findings, or only suggestion-severity),
> PASS_WITH_NOTES (>=1 warning, zero blockers), BLOCK (>= `verdict_rules.blocker_threshold`
> blockers, default 1). An individual reviewer signals a blocker by emitting
> FAIL with a blocker-severity finding.

---

## Summary

**Total findings:** 13 (3 blockers, 3 warnings, 7 suggestions)
**Action required:** Revise the spec to address WR-1, WR-2, and WR-3 before this can pass.
Specifically: (1) name the actual call site where the loop resolves a provider via
`TrackerProviderRegistry` (e.g. in the Interaction Contract, before step 1 of inbound sync), or
demote the registry to a documented-but-not-yet-exercised interface if that is more accurate; (2)
either name a reader for `TrackerSyncLink.accepted_at`, or drop the field; (3) either name a real
consumer for `last_synced_at`/`last_comment_id` (e.g. an `/adev:status` surface) or explicitly
accept them as a documented audit-only trail (mirroring the sibling `per-issue-attempt-cap` spec's
`parked_reason` precedent) rather than leaving them silently unread. Warnings (RI-1, WR-4, BD-1)
and suggestions (RI-2, RI-3, WR-5 through WR-9) are not blocking but should be addressed in the same
revision pass where practical.

**On the round-5 fixes specifically:** BD-1 (nonce-scoped fence replacing the fixed wrap template),
TR-1 (oversized-refusal counter), and TR-2 (GitHub-unreachable counter) are all genuinely and
cleanly resolved — independently re-verified against actual source by the Boundary Reviewer and
Termination Reviewer this round, with zero remaining findings against any of the three specific
round-5 blockers. The three new blockers (WR-1, WR-2, WR-3) surfaced on content this revision did
not touch — `TrackerProviderRegistry`'s wiring and two `TrackerSyncLink` audit fields — and were
independently re-assessed at blocker severity by this round's Wiring Reviewer (WR-1 was only a
warning in round 5). This is new information about pre-existing content, not a regression
introduced by the round-6 revision.
