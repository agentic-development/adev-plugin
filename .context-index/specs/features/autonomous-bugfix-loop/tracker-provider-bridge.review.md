---
last-reviewed-revision: 8
file-sha: d1db6c6cc0275d0b7b2953ba7d2043c35a45388880016c0c72429c3d903d51aa
---

# Architecture Review: tracker-provider-bridge

> **Date:** 2026-08-20
> **Spec:** .context-index/specs/features/autonomous-bugfix-loop/tracker-provider-bridge.spec.md
> **Charter:** .context-index/specs/features/autonomous-bugfix-loop/charter.md
> **Verdict:** BLOCK
> **Rigor tier:** full (risk_level: medium → policies.medium.review_mode: full)

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |
| referent-integrity | Referent Integrity Reviewer | subagent | reviewer-reasoning | plugin:review-specs/referent-integrity-prompt.md |
| wiring-reviewer | Wiring Reviewer | subagent | reviewer-capable | plugin:review-specs/wiring-reviewer-prompt.md |
| boundary-reviewer | Boundary Reviewer | subagent | reviewer-capable | plugin:review-specs/boundary-reviewer-prompt.md |
| termination-reviewer | Termination Reviewer | subagent | reviewer-fast | plugin:review-specs/termination-reviewer-prompt.md (triggered: loop/retry keywords matched) |

## Disabled Reviewers

| ID | Reason |
|----|--------|
| structural-architect | Disabled as part of the reviewer-domain-fit initiative. OWASP/structural scope was retargeted to referent-integrity/wiring-reviewer/consistency-analyzer/boundary-reviewer for the default (Node CLI/plugin) project shape. Prompt retained on disk; still resolvable for any project whose materialized review.yaml already names it. |
| security-reviewer | Disabled as part of the reviewer-domain-fit initiative. OWASP-scoped review relocated to the web-service domain extension (opt-in via `adev extension install web-service`) where it fits the artifact class. Prompt retained on disk. |

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

Re-verified the two round-7 blockers this revision targets:
- **WR-4** (`TrackerSyncLink.provider` write-only, contradicting charter's "selects the adapter" claim): now consistent between spec and charter — both describe `provider` as write-once provenance, and both agree adapter resolution reads `tasks.bugfix_loop.tracker_provider` directly.
- **TR-4** (stale-link notice had no iteration bound): now consistent — `BugfixLoopRun.stale_link_notices_surfaced` is declared identically in the charter Domain Model (revision 10) and consumed identically in the spec's Interaction Contract inbound step 5.

**CON-1 (warning, pattern):** The Actionable Task Map's "Wire `skills/debug/SKILL.md` Phase 1…" row still directs the implementer to resolve the investigation target "by calling `IssueManager.get(id).notes`" — a direct library-call description, not a named `adev <verb>` CLI route, conflicting with CLAUDE.md's Anti-Patterns clause (enforced by `.githooks/pre-commit-no-inline-node`). Pre-existing from round 7 (round-7 Consistency Analyzer's own CON-1); revision 8's changes were scoped to WR-4/TR-4 only and did not touch this row, so it remains open. Recommendation: name the implementation route explicitly (e.g. `adev debug notes <id>`) before this task is implemented.

**CON-2 (suggestion, domain-model):** The charter's Domain Model Entities table still annotates `TrackerSyncLink.provider` only as `(e.g. "github")`, with no forward-reference to the corrected Relationships bullet below it. Not blocking — a one-clause pointer would remove ambiguity for a fast skim.

No naming, ADR-compliance, or module-boundary violations found. Persisted-field naming is uniformly snake_case; ADR-0015/ADR-0016 compliance confirmed; `tracker-sync-links.jsonl`'s still-pending ADR-0015 registration remains honestly tracked, not a silent gap.

## Referent Integrity Reviewer (referent-integrity)

**Verdict:** PASS

All referents verified, including both new revision-8 referents:
- **RI-2:** `BugfixLoopRun.stale_link_notices_surfaced` — verified at `charter.md:113` (array, default `[]`, added revision 10 to close round-7 TR-4), described identically to how the spec's inbound step 5 uses it.
- **RI-3:** the corrected `TrackerSyncLink.provider` Relationships bullet — verified at `charter.md:127-146`; the spec's Participants row and inbound step 4 say the same thing without contradiction.

Also re-verified (unchanged from round 7, still holding): `lib/governance/context-pack.mjs`'s `fenceBlock`/`neutralizeFenceTokens` (RI-1), `lib/provider/registry.mjs` vs. `lib/issues/registry.mjs` pattern claim (RI-4), `escapeField`/render-markdown/beads-adapter claims (RI-5), `skills/debug/SKILL.md` Phase 1 non-read of `notes` (RI-6), ADR-0015 Decision table non-registration of `tracker-sync-links.jsonl` (RI-7), `lib/cli/coordination.mjs`/`lib/milestones.mjs` prior-art claims (RI-8).

No findings.

## Wiring Reviewer (wiring-reviewer)

**Verdict:** FAIL

**WR-1 (blocker, write-only-state):** `TrackerSyncLink.provider`, set at Interaction Contract inbound step 4 (revision 8's WR-4 fix) to the adapter name resolved by step 1's `TrackerProviderRegistry.get(...)` call, still has **no consumer anywhere**. Inbound step 1 and outbound step 2 both resolve the adapter from `tasks.bugfix_loop.tracker_provider` directly, never from the link's own field — the charter's own corrected Relationships bullet concedes "no code path in the Interaction Contract ever reads it back." The only place the written value is inspected is the Acceptance Criteria test asserting `provider` equals the value just written — a correctness check on the write, not a functional reader. Revision 8's fix is judged a pure relabeling: it changed the charter's claim from "provider selects the adapter" (false) to "provider is provenance, not a dispatch key" (true about current code, but adds no reader). The cited justification — "populated now for a future multi-provider bridge" — points at "Second Tracker Provider Adapter" in the charter's Deferred Capabilities table, which carries **Target Milestone: —** (no date, deferred until there's demand). That fails the reviewer's own "planned companion change" carve-out: contrast with `WorkItem.notes`'s write-only gap, which has a concrete, dated Actionable Task Map row and a dedicated acceptance-test row tracking its future consumer — `provider` has neither. Section anchor: `interaction-contract-inbound-4`. Finding-type: `write-only-state`.

Recommendation: either give `provider` a real consumer (e.g., outbound writeback or already-linked handling reads it back to warn on a `tracker_provider`/link mismatch) or add an explicit Actionable Task Map row tracking its future use, the way `notes`/Phase-1 got one, so the gap is honestly deferred rather than declared closed by a definition change.

All other producers re-checked and found fully wired: `TrackerProviderRegistry.get(...)` resolution, `TrackerSyncLink.accepted_at`, `TrackerSyncLink.last_synced_at`/`last_comment_id`, the new `BugfixLoopRun.stale_link_notices_surfaced` (self-consuming across turns, same pattern already validated for `sync_retry_counts`/`degraded_sync_note`), `WorkItem.notes` (planned companion change, carve-out applies), `WorkItem.affected_modules`, `degraded_sync_note`/`sync_retry_counts.*` (pre-existing, unchanged this revision).

## Boundary Reviewer (boundary-reviewer)

**Verdict:** PASS_WITH_NOTES

Re-checked all six checklist items against both revision-8 changes (WR-4, TR-4) and the unchanged surface. Items 1 (path containment), 2 (subprocess interpolation), 4 (privilege posture), 5 (artifact leakage), 6 (destructive filesystem operations) are clean passes — the new `provider` field and `stale_link_notices_surfaced` array are both internally-resolved, non-free-text values written via existing append-only/read-modify-write patterns.

**BD-1 (warning, input trust — carried forward unchanged from round 7):** `title` is length-capped but never routed through `fenceBlock`/`neutralizeFenceTokens` the way `body` is (Interaction Contract inbound step 3). Not escalated to blocker because `title` currently has no documented reader that treats it as an investigation/instruction target the way the Task Map's Phase 1 wiring task does for `notes`. Revision 8 touched neither `title` handling nor introduced a new consumer of it, so this is not re-blocking — reported for continuity.

## Termination Reviewer (termination-reviewer)

**Verdict:** PASS_WITH_NOTES

**TR-4 re-verification (round-7 blocker, this revision's claimed fix): CLOSED, downgraded to warning.** The "fires at most once per run per link" dedup via `BugfixLoopRun.stale_link_notices_surfaced` (Interaction Contract inbound step 5) has a real, concrete, non-vacuous iteration cap (verified against `bugfix-loop-skill.spec.md`'s `--resume`/terminal-turn semantics) and an explicitly stated cap-trip verdict (suppress, no run-state write). The spec's own reasoning — that this is correctly a dedup-set shape rather than a numeric-turn-cap-with-escalation shape, because the underlying condition is turn-invariant and no degrade-and-continue action is needed — was independently verified to hold up, not merely accepted at face value.

**TR-1 (warning, unattended default — new this round):** The notice is only printed as a per-turn console line, with no terminal-token-adjacent rollup analogous to `degraded_sync_note`'s purpose-built terminal surface. In a genuinely unattended run, the one permitted occurrence may never be seen by anyone. Not a blocker — the notice is purely advisory (gates no action; the link/WorkItem stay untouched regardless), so non-visibility doesn't create unsafe *loop* behavior, only a weaker-than-sibling audit trail, and the identical gap already exists un-flagged for the oversized-refusal cap-trip elsewhere in this same spec.

All other loop/retry/poll constructs re-checked and found clean: GitHub-unreachable/`UNKNOWN_TRACKER_PROVIDER` degradation (5-turn cap, terminal-token rollup), oversized-title/body refusal (5-turn cap, per-issue-number), outbound writeback duplicate-post guard (state-based one-shot bound, durably persisted), GitHub-unreachable-during-outbound-writeback (zero-retry, trivially bounded).

---

## Summary

**Total findings:** 6 (1 blocker, 4 warnings, 1 suggestion)
**Action required:** This revision (8) genuinely closed TR-4 (termination-reviewer confirms the fires-once-per-run dedup shape is correct and well-bounded) but did **not** close WR-4 — wiring-reviewer independently re-flagged `TrackerSyncLink.provider` as still write-only-state, judging the revision-8 fix a relabeling (charter claim corrected from false to true) rather than a wiring fix (no reader added, and the cited future use has no target milestone, unlike the `notes`/Phase-1 precedent this same spec already uses for an honestly-deferred gap). Run `/adev:specify --revise` to address this new blocker (`wiring-reviewer:write-only-state:87990d14`), choosing either: (a) give `provider` a real reader, or (b) add an explicit Actionable Task Map row tracking its future multi-provider use the same way `notes`/Phase-1 already got one. Then re-run `/adev:review-specs`.
