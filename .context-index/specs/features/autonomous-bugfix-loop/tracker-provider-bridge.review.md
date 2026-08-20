---
last-reviewed-revision: 10
file-sha: 92c7f6767970940e1ae1df29388589007ea94eb77fd618f85bee754697b513fa
---

# Architecture Review: tracker-provider-bridge (round 10)

> **Date:** 2026-08-20
> **Spec:** .context-index/specs/features/autonomous-bugfix-loop/tracker-provider-bridge.spec.md
> **Charter:** .context-index/specs/features/autonomous-bugfix-loop/charter.md
> **Verdict:** PASS_WITH_NOTES
> **Rigor tier:** full (risk_level: medium → policies.medium.review_mode: full)
> **Note:** Revision 10 closes round 9's sole blocker (`wiring-reviewer:write-only-state:17c01480`) by removing the `TrackerSyncLink.provider` field from the schema entirely — in both this spec (Participants, Interaction Contract inbound step 4, Actionable Task Map, Acceptance Criteria) and the parent charter (Domain Model, Relationships), rather than attempting a fourth reframing of a field that had failed the same wiring finding across rounds 7, 8, and 9. The Wiring Reviewer independently re-verified this round that the removal is clean — no dangling `provider` references anywhere in the spec, charter, or live repository — and the write-only-state finding does not recur. No blocker was found this round. Three warnings (CON-1, WR-2, BD-1) and two suggestions (WR-3, WR-4) were raised; WR-2 and BD-1 are pre-existing, unrelated findings carried forward in substance from prior rounds (not re-blocking), and CON-1 is new this round.

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |
| referent-integrity | Referent Integrity Reviewer | subagent | reviewer-reasoning | plugin:review-specs/referent-integrity-prompt.md |
| wiring-reviewer | Wiring Reviewer | subagent | reviewer-capable | plugin:review-specs/wiring-reviewer-prompt.md |
| boundary-reviewer | Boundary Reviewer | subagent | reviewer-capable | plugin:review-specs/boundary-reviewer-prompt.md |
| termination-reviewer | Termination Reviewer | subagent | reviewer-fast | plugin:review-specs/termination-reviewer-prompt.md (triggered: loop/retry keywords matched, score 3) |

## Disabled Reviewers

| ID | Reason |
|----|--------|
| structural-architect | Disabled as part of the reviewer-domain-fit initiative. OWASP/structural scope was retargeted to referent-integrity/wiring-reviewer/consistency-analyzer/boundary-reviewer for the default (Node CLI/plugin) project shape. Prompt retained on disk; still resolvable for any project whose materialized review.yaml already names it. |
| security-reviewer | Disabled as part of the reviewer-domain-fit initiative. OWASP-scoped review relocated to the web-service domain extension (opt-in via `adev extension install web-service`) where it fits the artifact class. Prompt retained on disk. |

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

**CON-1 (warning, pattern):** The Participants row for `TrackerProviderRegistry` explicitly investigated and rejected the claim that this registry mirrors `lib/issues/registry.mjs`'s `getIssueManager` (a hardcoded if/else chain), stating instead that it mirrors `lib/provider/registry.mjs`'s plain map-and-lookup pattern — verified accurate against source. However, the parent charter still asserts the opposite, unchanged, in three places: In Scope (line 57), the `TrackerProviderAdapter` Domain Model entity row (line 116), and the Quality Attributes Extensibility row (line 232), all still saying it mirrors `IssueManagerInterface`'s backend registry. This spec's own corrected finding was never propagated to the charter, unlike every other spec/charter divergence discovered during this spec's revision history (which did get back-ported, e.g. revision 10's `TrackerSyncLink` Relationships fix, revision 11's `provider` field removal). Recommendation: correct the charter's three references to name `lib/provider/registry.mjs`'s plain-map pattern instead.

Spot-checked all other load-bearing citations (fenceBlock/neutralizeFenceTokens, escapeField's opt-in/render-time-only scope, ADR-0015's Decision table correctly omitting `tracker-sync-links.jsonl`, the charter's revision-11 `TrackerSyncLink` schema with no `provider` field, `skills/debug/SKILL.md`'s absence of any `notes` read) — all confirmed accurate and internally consistent.

## Referent Integrity Reviewer (referent-integrity)

**Verdict:** PASS

All referents verified against live source, including revision 10/11's changes. Confirmed: `lib/provider/registry.mjs`'s plain-map pattern, `lib/issues/registry.mjs`'s hardcoded if/else `getIssueManager` (lines 61-109) and `DEFAULT_BACKEND = "json"` (line 24), `fenceBlock`/`neutralizeFenceTokens` signatures and the `randomBytes(12).toString('base64url')` generator, `lib/cli/coordination.mjs::scanPullRequests` as genuinely live prior art vs. `lib/milestones.mjs`'s injectable-only `execGh`, `escapeField`'s opt-in/render-time/json-only scope (`cli/index.mjs:1575-1586`), ADR-0015's Decision table correctly not yet listing `tracker-sync-links.jsonl`, the charter's `BugfixLoopRun`/`TrackerSyncLink` Domain Model fields (confirming the revision-11 schema has no `provider` field and no stale references survive in any sibling spec), the charter's Deferred Capabilities "Second Tracker Provider Adapter" row (no target milestone), `skills/debug/SKILL.md`'s confirmed absence of any `.notes` read, and sibling-spec behavior citations (`bug-selection-and-eligibility` BEH-10, `debug-completion-and-auto` BEH-7, `skills/specify/SKILL.md` Step 5.6-2).

No findings.

## Wiring Reviewer (wiring-reviewer)

**Verdict:** PASS_WITH_NOTES

**WR-1 (verified clean, no severity — resolves round-9 blocker):** `TrackerSyncLink.provider` field removal. Grepped the target spec, the parent charter (Domain Model, Relationships, Deferred Capabilities), and the live repository (`lib/`, `tests/`) for `TrackerSyncLink.provider` / a `provider` schema key. No dangling references found anywhere. The Domain Model row now lists only `external_ref, local_issue_id, accepted_at, last_synced_at, last_comment_id`. Adapter resolution is consistently described as reading `tasks.bugfix_loop.tracker_provider` via `TrackerProviderRegistry.get(...)`, never a per-link field. The two speculative Task Map rows revision 9 added for `provider`'s future consumer are removed along with it. **This closes the round-7/8/9-recurring finding cleanly — it does not recur.**

**WR-2 (warning, carried forward, not new):** `WorkItem.notes` (the GitHub-origin fenced body) is still write-only in the codebase today — `skills/debug/SKILL.md` Phase 1 does not yet read it. This is the same gap round 3's WR-5 identified, already closed at the spec level since revision 4 via a concrete, reachable-today Task Map row (editing an existing file, unlike `provider`'s now-removed speculative row) — the carve-out for "a planned companion change the spec itself references" applies legitimately. Not a fresh blocker; flagged for continued tracking until the Phase 1 wiring task and its regression test land.

**WR-3 (suggestion):** The Participants `TrackerSyncLink` row's "all fields now have a named reader" claim doesn't explicitly name where `external_ref`/`local_issue_id` are read (they are — outbound step 2's lookup, inbound step 5's dedup check — just not called out in that sentence). Extend the sentence to name them.

**WR-4 (suggestion):** The `affected_modules: []` Acceptance Criteria bullet lacks an explicit "verified by a `node:test`..." clause naming that `bug-selection-and-eligibility`'s existing BEH-10 test suite covers it, unlike its neighboring bullets.

All other producers introduced by this integration (`TrackerProviderRegistry`, GitHub adapter, `TrackerSyncLink`'s remaining fields, the two `sync_retry_counts` counters, `degraded_sync_note`, `stale_link_notices_surfaced`, `UNKNOWN_TRACKER_PROVIDER` handling) trace to named consumers, named triggers, and named tests. No new blocker-level gaps introduced this round.

## Boundary Reviewer (boundary-reviewer)

**Verdict:** PASS_WITH_NOTES

**BD-1 (warning, input trust — carried forward in substance, unchanged from round 7/8/9):** `body` is capped-and-fenced via `fenceBlock`/`neutralizeFenceTokens` before reaching `notes`, but `title` receives only the length cap, never the fence — despite flowing verbatim into `adev issues next --json`, the same tool output the LLM-driven `/adev:bugfix-loop` skill reads every turn, i.e. the same class of "untrusted GitHub content reaching agent-readable context" that motivated fencing `body`. Recommendation: either wrap `title` with the same nonce-scoped `fenceBlock` treatment, or explicitly document why its exposure surface differs from body's.

All other items clean: path containment not applicable (no untrusted path segments), subprocess interpolation correctly uses argv-array `gh` invocation with `--body-file -` for the comment, privilege posture not applicable (existing `gh` precedent, no new extension-contributed code), artifact leakage correctly disclosed (`tracker-sync-links.jsonl` git-committed by design, the `tasks.md`/beads render-safety gap honestly tracked as a Task Map item), destructive filesystem operations not applicable (append-only JSONL / machine-owned run-state rewrite only).

## Termination Reviewer (termination-reviewer)

**Verdict:** PASS

Every loop/retry/poll construct this spec introduces (GitHub-unreachable/`UNKNOWN_TRACKER_PROVIDER` 5-turn degrade cap, oversized title/body 5-turn per-issue cap, stale-link fires-once-per-run dedup) states a concrete iteration cap, an explicit cap-trip verdict, and a safe unattended default. Outbound writeback's single-attempt duplicate-post guard is a non-repeating operation, correctly out of scope for this review. No findings.

---

## Summary

**Total findings:** 5 (0 blockers, 3 warnings, 2 suggestions)
**Action required:** None blocking. This revision (10) successfully closes the round-7/8/9-recurring blocker (`wiring-reviewer:write-only-state:17c01480`) by removing `TrackerSyncLink.provider` entirely rather than reframing it a fourth time — the Wiring Reviewer independently confirmed the removal is clean with zero dangling references. The spec is ready to proceed to `/adev:plan`. Three non-blocking warnings remain open for future attention: CON-1 (new — charter's `TrackerProviderRegistry` characterization needs correcting in 3 places to match this spec's own investigated finding), WR-2 (pre-existing — `WorkItem.notes` Phase 1 wiring task not yet shipped), and BD-1 (pre-existing — `title` field not fenced like `body`). Two suggestions (WR-3, WR-4) are optional legibility improvements.
