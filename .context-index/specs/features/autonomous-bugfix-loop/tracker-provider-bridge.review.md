---
last-reviewed-revision: 9
file-sha: c96fa5bf62d1765819c10929deae6c49c33aed65d745a29f0e626717fc69b959
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

**Verdict:** PASS

The revision-9 change (two new Actionable Task Map rows + forward-references from Participants and Acceptance Criteria for `TrackerSyncLink.provider`) reads as internally consistent with the rest of the spec corpus. Verified against source: `lib/provider/registry.mjs` genuinely is a plain map + lookup function; `lib/issues/registry.mjs`'s `getIssueManager` genuinely is a hardcoded if/else chain; `lib/governance/context-pack.mjs`'s `fenceBlock`/`neutralizeFenceTokens` signatures match the spec's described shapes exactly.

**CON-1 (suggestion, naming):** `TrackerProviderRegistry.get(...)` diverges from the method name (`getProvider(name)`) used by the module it explicitly models itself on, `lib/provider/registry.mjs`. Not load-bearing — `TrackerProviderRegistry` is a new module, not a literal reuse. Worth a one-line note in Participants, or align the name at implementation time.

**CON-2 (suggestion, naming):** `postComment(issueRef, text)`'s `issueRef` parameter is sourced from `TrackerSyncLink.external_ref` (charter Domain Model) — a naming seam between the adapter-interface parameter and the entity field it's populated from. Low priority; adapter-interface args reasonably use provider-agnostic naming.

**CON-3 (suggestion, pattern):** The Actionable Task Map has no row for adding the `tasks.bugfix_loop.tracker_provider` / `tracker_link_stale_days` manifest keys, unlike sibling specs' "Add manifest config for X" rows. Likely intentional — this integration spec's Task Map was deliberately scoped only to cross-charter/deferred gaps (confirmed against `templates/spec-template.integration.md`, which carries no Task Map section by default). No action needed.

No naming, ADR-compliance, or module-boundary violations found against any ADR (0001–0019) or the ~20 topically-relevant cross-cutting specs checked.

## Referent Integrity Reviewer (referent-integrity)

**Verdict:** PASS

All referents verified, including revision 9's new prose. No new concrete referents were introduced beyond `TrackerProviderRegistry`, `TrackerSyncLink`, `tasks.bugfix_loop.tracker_provider`, and the charter's already-existing Deferred Capabilities entry "Second Tracker Provider Adapter" — all independently re-verified against source (`lib/provider/registry.mjs`, `lib/issues/registry.mjs:24`, `lib/governance/context-pack.mjs`, `lib/governance/dispatch-shape.mjs`, `lib/issues/file-adapter.mjs`, `lib/issues/beads-adapter.mjs`, `cli/index.mjs:1575-1586`, `lib/issues/render-markdown.mjs`, `lib/cli/coordination.mjs`, `lib/milestones.mjs`, `skills/debug/SKILL.md`, ADR-0015, `bug-selection-and-eligibility.spec.md` BEH-10, `debug-completion-and-auto.spec.md` BEH-7, `skills/specify/SKILL.md` Step 5.6-2, and `charter.md` revision 10).

No findings.

## Wiring Reviewer (wiring-reviewer)

**Verdict:** FAIL

**WR-1 (blocker, write-only-state — carried forward, unresolved):** `TrackerSyncLink.provider`, set at Interaction Contract inbound step 4, still has no consumer today. Inbound step 1 and outbound step 2 still resolve the adapter from `tasks.bugfix_loop.tracker_provider` directly, exactly as in revision 8. Section anchor: `interaction-contract-inbound-4`. Finding-type: `write-only-state`.

Revision 9's fix (two new Actionable Task Map rows tracking `provider`'s future per-link dispatch use, mirrored on `WorkItem.notes`'s precedent) is judged **not equivalent in concreteness** to that precedent, and fails the carve-out on its own terms:

1. **The `notes` trigger is reachable today; the `provider` trigger is not.** `notes`'s companion task fires on an existing invocation pattern (`/adev:debug --auto --issue <id>` with no `--error`) against an existing consumer (`skills/debug/SKILL.md` Phase 1). `provider`'s companion task fires only "when a second `TrackerProviderAdapter` is registered" — a capability the charter's Deferred Capabilities table still lists with **Target Milestone: —**, unchanged by this revision, explicitly "deferred until there's demand." There is no trigger event to coordinate toward yet.
2. **The new Task Map row concedes its own speculative status:** *"Not implementable now: no second adapter exists to dispatch to today, and speculatively branching a single-provider deployment on a field nothing else varies would be dead code with no exercisable test surface."* This confirms, rather than refutes, the round-8 disqualification.
3. **The regression-test row is doubly deferred** ("once the above ships"), compounding rather than closing the gap.
4. **The Acceptance Criteria row's "dated" claim is inaccurate:** it reads *"tracked as an explicit, dated Actionable Task Map row"* — but the Task Map table has no date/milestone column, and the charter's Deferred Capabilities entry it points to still shows no target milestone.

Recommendation (unchanged from round 8): either give `provider` a real consumer reachable with today's code, or accept that no honest concrete deferral is available yet and downgrade the field's framing to state plainly that it is unused pending an out-of-scope, unscheduled dependency — without asserting the Task Map row satisfies the same-shape carve-out `notes` earned.

All other producers re-checked and found fully wired: `TrackerProviderRegistry.get(...)` resolution, GitHub adapter `gateCheck`/`fetchGated`/`postComment`, `TrackerSyncLink.accepted_at`, `TrackerSyncLink.last_synced_at`/`last_comment_id`, `BugfixLoopRun.sync_retry_counts.*`/`degraded_sync_note`/`stale_link_notices_surfaced`, `tracker-sync-links.jsonl` ADR-0015 registration (tracked via its own AC row, not a runtime wiring concern).

## Boundary Reviewer (boundary-reviewer)

**Verdict:** PASS_WITH_NOTES

**BD-1 (warning, input trust / artifact leakage — carried forward unchanged from round 7/8):** `title` is length-capped but never routed through `fenceBlock`/`neutralizeFenceTokens` the way `body` is. Not escalated to blocker because `title` currently has no documented reader that treats it as an investigation/instruction target the way the Task Map's Phase 1 wiring task does for `notes` — but `title` already has non-instruction consumers (`adev issues next --json`, `tasks.md` render) that surface it unmodified. Revision 9 touched neither `title` handling nor introduced a new consumer of it, so this is not re-blocking — reported for continuity.

**Suggestion (input trust):** The GitHub issue number is used directly as a JS object key in `sync_retry_counts.oversized_consecutive_turns[<issue-number>]`. Not exploitable today (GitHub issue numbers are integers), but the spec doesn't state the key is coerced to a safe numeric form before indexing. Optional hardening.

Items 1 (path containment — not applicable), 2 (subprocess interpolation — argv-array, correctly addressed), 4 (privilege posture — not applicable, no third-party-contributed code), 6 (destructive filesystem operations — not applicable, JSONL append + read-modify-write only) are clean. Item 5 (artifact leakage) is correctly addressed for `tracker-sync-links.jsonl` and `notes`; `title`'s leakage exposure is the residual half of BD-1.

## Termination Reviewer (termination-reviewer)

**Verdict:** PASS_WITH_NOTES

All four loop/retry/poll constructs reviewed (GitHub-unreachable/`UNKNOWN_TRACKER_PROVIDER` 5-turn degrade cap, oversized title/body 5-turn per-issue cap, stale-link fires-once-per-run dedup, outbound writeback duplicate-post guard).

**TR-3 (warning, carried forward unchanged from round 8's TR-1):** The stale-link notice's unattended default is stated but weak — the one permitted occurrence is only a per-turn console line, with no rollup adjacent to the terminal `ADEV-BUGFIXLOOP:` token the way `degraded_sync_note` gets. Not a termination-safety gap (nothing depends on the notice being seen; the link/WorkItem stay untouched regardless) — reported for continuity.

Three suggestions (TR-1, TR-2, TR-4): all three other constructs have complete iteration-cap / cap-trip-verdict / unattended-default triples, but the details are split across the Error Propagation table, charter Domain Model, and (for TR-4) phrased as idempotent-by-construction rather than an explicit numeric cap — no content gap in any case, purely a legibility suggestion.

Revision 9's only content change (the `provider` Task Map rows) does not introduce or modify any loop/retry/poll construct and was confirmed out of scope for this review.

---

## Summary

**Total findings:** 9 (1 blocker, 2 warnings, 6 suggestions)
**Action required:** This revision (9) did **not** close WR-1 — the wiring reviewer independently re-evaluated revision 8's original standard ("a real consumer, or an explicit, concrete, dated Task Map row of the same shape as `notes`/Phase-1") against the new Task Map rows and found them speculative rather than concrete: the fix's own text concedes the companion change is "not implementable now" because the trigger event (a second `TrackerProviderAdapter`) is unscheduled, unlike `notes`'s Phase 1 companion task, which fires on an already-existing invocation pattern. Run `/adev:specify --revise` to address this blocker (`wiring-reviewer:write-only-state:17c01480`), choosing either: (a) give `provider` a real consumer reachable with today's code, or (b) explicitly reframe `provider`'s Participants/Domain-Model description as "currently unused, pending an out-of-scope, unscheduled dependency" rather than presenting the Task Map rows as satisfying the same-shape carve-out `notes` earned. Then re-run `/adev:review-specs`.

Two warnings carried forward unchanged (BD-1: `title` not fenced like `body`; TR-3: stale-link notice lacks a terminal-token-adjacent rollup) — neither is blocking, both pre-date this revision.
