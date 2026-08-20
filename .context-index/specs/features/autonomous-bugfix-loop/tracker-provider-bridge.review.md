---
last-reviewed-revision: 7
file-sha: 76ac2545725a2cb16200448d42a63f54181a7a773a186233a62a760ac6cd139b
---

# Architecture Review: tracker-provider-bridge (round 7)

> **Date:** 2026-08-20
> **Spec:** .context-index/specs/features/autonomous-bugfix-loop/tracker-provider-bridge.spec.md
> **Charter:** .context-index/specs/features/autonomous-bugfix-loop/charter.md
> **Verdict:** BLOCK
> **Rigor tier:** full
> **Note:** Re-review after round-6 BLOCK (WR-1: TrackerProviderRegistry never called; WR-2/WR-3:
> TrackerSyncLink.accepted_at/last_synced_at/last_comment_id write-only). Revision 7 added an
> explicit registry-resolution call site (Interaction Contract inbound step 1, outbound step 2)
> and gave accepted_at (stale-link notice, inbound step 5) and last_synced_at/last_comment_id
> (duplicate-post guard, outbound steps 2-3) real readers. **All three round-6 fixes were
> independently re-verified against the revision-7 text this round, not rubber-stamped:** the
> Wiring Reviewer confirmed WR-1 and WR-3 are fully closed with concrete producer/consumer/
> trigger/test chains, and confirmed the accepted_at write-only gap (WR-2) is closed at the
> minimum bar (a real read drives a real logged action). However, this round's Wiring Reviewer
> and Termination Reviewer each independently surfaced **one new blocker on content the
> revision-7 fix itself introduced**: `TrackerSyncLink.provider` — a fourth `TrackerSyncLink`
> field, distinct from the three round-6 fixed — is written at link creation but never read
> anywhere, contradicting the charter's own Relationships claim that it selects the adapter
> (WR-4); and the new stale-link notice (added to close WR-2) has no iteration cap, cap-trip
> verdict, or safe unattended default, unlike every other retry-shaped construct in this spec
> (TR-4). The consolidated verdict is BLOCK on these two new findings.

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

**Verdict:** PASS_WITH_NOTES

Reviewer noted its context pack this round contained only the constitution and platform context
(no charter/sibling-spec text) and scoped findings accordingly.

- **CON-1 (warning — pattern):** The Actionable Task Map's "Wire `skills/debug/SKILL.md` Phase 1…"
  task describes Phase 1 resolving the investigation target by "calling `IssueManager.get(id).notes`"
  without specifying that the implementation must route through an `adev <verb>` CLI subcommand or
  helper script, per CLAUDE.md's inline-Node anti-pattern (enforced by
  `.githooks/pre-commit-no-inline-node`). Recommendation: name the implementation route explicitly
  (e.g. `adev debug notes <id>`) so a future implementer doesn't write inline-Node prose into
  `skills/debug/SKILL.md` and trip the pre-commit hook.
- **CON-2 (suggestion — domain-model):** The Participants `TrackerSyncLink` row names only the three
  round-6 fields (`accepted_at`, `last_synced_at`, `last_comment_id`) plus scattered mentions of
  `local_issue_id` and the GitHub issue number elsewhere — the entity's full field set is not
  enumerated in one place.
- **CON-3 (suggestion — naming):** New/extended persisted fields (`accepted_at`, `last_synced_at`,
  `last_comment_id`, `degraded_sync_note`, `sync_retry_counts.*`, `tracker_link_stale_days`) use
  snake_case; flagged only because the reviewer could not verify the sibling-spec precedent
  (`affected_modules`) for persisted-field snake_case from within its context pack this round.

## Referent Integrity Reviewer (referent-integrity)

**Verdict:** PASS_WITH_NOTES

- **RI-1 (warning):** The System Constitution Reference "Existing mitigation, corrected" bullet's
  "Verified against current source" citation list (`lib/issues/file-adapter.mjs`,
  `lib/issues/json-adapter.mjs`, `lib/issues/beads-adapter.mjs`, `lib/issues/registry.mjs:24`,
  `cli/index.mjs:1575-1586`) omits `lib/issues/render-markdown.mjs` — the file where `escapeField`,
  `renderTasksMd`, and `writeTasksMd` (the three symbols the bullet is centrally about) are actually
  defined. The Actionable Task Map's parallel row about the identical fact correctly cites that file;
  this bullet does not. All underlying factual claims independently re-verified accurate (line
  numbers, `DEFAULT_BACKEND`, `BACKEND_READ_ONLY_DEPRECATED`, unescaped `notes` persistence on both
  `json` and `beads`). Recommendation: add `lib/issues/render-markdown.mjs` to this bullet's citation
  parenthetical.

Every other referent checked — `lib/provider/registry.mjs`, `lib/issues/registry.mjs::getIssueManager`,
`lib/governance/context-pack.mjs`'s `fenceBlock`/`neutralizeFenceTokens`/`CONTEXT_PACK_FENCE_COLLISION`,
`dispatch-shape.mjs`'s `provenanceRule`, ADR-0015's Decision table (confirms `tracker-sync-links.jsonl`
still unregistered, matching the spec's own framing), `skills/specify/SKILL.md` Step 5.6-2,
`lib/cli/coordination.mjs::scanPullRequests`, `lib/milestones.mjs`'s unreachable `execGh`,
`debug-completion-and-auto.spec.md` BEH-7, `bug-selection-and-eligibility.spec.md` BEH-10,
`charter.md`'s `revision: 9` / Domain Model / Deferred Capabilities / Dependencies,
`bugfix-loop-skill.spec.md`'s Output Contract, `skills/debug/SKILL.md` Phase 1's confirmed non-read
of `notes`, and `IssueManagerInterface` — independently verified accurate against live source.

## Wiring Reviewer (wiring-reviewer)

**Verdict:** FAIL

- **WR-1 (no finding — round-6 blocker closed):** `TrackerProviderRegistry.get(...)` is now an
  explicit named call site (Interaction Contract inbound step 1, outbound step 2); every subsequent
  step operates on the returned `provider`. Producer → consumer → trigger → test chain confirmed
  complete, including the stub-adapter and `UNKNOWN_TRACKER_PROVIDER` acceptance-criteria tests.
- **WR-2 (warning — overclaimed cross-spec surfacing):** `accepted_at`'s write-only gap is closed at
  the minimum bar (inbound step 5 reads it and produces a real logged notice, with a named test).
  However, the spec's claim that the notice is "surfaced the same way `degraded_sync_note` is…
  printed immediately above the turn's terminal token" has no actual consumer:
  `bugfix-loop-skill.spec.md`'s Output Contract documents a `degraded_sync_note` consumer bullet but
  no equivalent for a stale-link notice, and the charter Domain Model has no field to carry this
  notice across turns to whichever turn is terminal (unlike `degraded_sync_note`). As specified the
  notice is effectively turn-local. **section_anchor:** `interaction-contract-inbound-5` ·
  **finding-type:** `overclaimed-consumer`
- **WR-3 (no finding — round-6 blocker closed):** `last_synced_at`/`last_comment_id` are fully closed
  within this spec's own outbound writeback (step 2 reads, step 3 writes back); no cross-spec
  dependency, dedicated double-invocation test named.
- **WR-4 (blocker — write-only-state):** `TrackerSyncLink.provider` is written at link creation
  (Interaction Contract inbound step 4, implicit) but never read anywhere in the Interaction
  Contract — both inbound step 1 and outbound step 2 resolve the adapter via manifest config
  (`tasks.bugfix_loop.tracker_provider`), never via the link's own `provider` field. This
  contradicts the charter's Relationships section: "A `TrackerSyncLink`'s `provider` field selects
  which `TrackerProviderAdapter` handles its inbound sync and outbound writeback." If
  `tasks.bugfix_loop.tracker_provider` changes after a link's creation, outbound writeback for an
  existing link resolves whatever adapter is *currently* configured, not the one recorded on the
  link. The Participants row's revision-7 claim that "all three" write-only `TrackerSyncLink`
  fields now have a reader omits this fourth field. **section_anchor:**
  `interaction-contract-inbound-4` · **finding-type:** `write-only-state`
- **WR-5 (no finding — pre-existing, honestly tracked):** `WorkItem.notes` → `skills/debug/SKILL.md`
  Phase 1 chain remains an explicitly-tracked future task (Actionable Task Map), not a fresh gap.

## Boundary Reviewer (boundary-reviewer)

**Verdict:** PASS_WITH_NOTES

- **BD-1 (warning — Input trust, carried forward unchanged from round 6):** Re-verified against
  revision 7's actual text (Interaction Contract inbound step 3): body is still the only field
  passed through `fenceBlock`/`neutralizeFenceTokens`; title remains only length-capped, never
  fenced. This revision made no change here — confirmed still accurate, not new information.
  Recommendation unchanged: scope the eventual Phase 1 read to `notes` only, or fence title
  symmetrically with body.
- **New surface (suggestion — Input trust):** The two new revision-7 log lines (stale-link notice,
  duplicate-post skip) interpolate only internally-generated structured values (issue number,
  integer day-count, numeric `last_comment_id`) — never untrusted GitHub title/body text — so BD-1's
  title-fencing gap does not extend to them as specified. Recommendation: keep these log templates
  to structured fields only if extended later.

Checklist items 1 (Path containment), 2 (Subprocess interpolation), 4 (Privilege posture), 5
(Artifact leakage), and 6 (Destructive filesystem operations) re-checked against all three revision-7
wiring fixes and found consistent — no new path, no new subprocess construction, static manifest-keyed
provider selection with fail-closed `UNKNOWN_TRACKER_PROVIDER` handling, no new persisted artifact, no
destructive operation.

## Termination Reviewer (termination-reviewer)

**Verdict:** FAIL

Independently re-derived cap / cap-trip / unattended-default for all four loop/retry-shaped
constructs in the spec (not just the two carried over from round 6).

- **TR-1 (no finding — fully bounded):** GitHub-unreachable / unregistered-provider degraded-sync
  retry (Error Propagation rows 1-2) — persisted counter, `degraded_sync_note` cap-trip, safe
  automatic unattended default. No finding.
- **TR-2 (no finding — fully bounded):** Oversized title/body per-issue refusal retry (Error
  Propagation row 4) — persisted per-issue counter, exclusion cap-trip, safe automatic default. No
  finding.
- **TR-3 (no finding — trivially bounded):** Outbound-writeback GitHub-unreachable skip (Error
  Propagation row 3) — zero-retry by design, immediate safe skip. No finding.
- **TR-4 (blocker — missing-iteration-cap):** The new stale tracker-link notice (Interaction
  Contract, inbound sync step 5, added to close round-6 WR-2) has no iteration cap. The
  `accepted_at` vs. `tracker_link_stale_days` comparison re-fires every inbound sync turn for as
  long as the link stays linked, stale, and un-attempted — no bound is stated, no cap-trip verdict
  exists, and the only described remedy ("a human closes or parks the WorkItem manually") is unsafe
  as an unattended default: in the charter's own stated scheduled/unattended execution mode, this
  notice prints indefinitely if no operator reads it. Unlike TR-1/TR-2/TR-3, none of the other
  retry-shaped constructs in this spec share this gap. **section_anchor:**
  `interaction-contract-inbound-5` · **finding-type:** `missing-iteration-cap`

> A **per-reviewer** verdict is never BLOCK. BLOCK is the *consolidated*
> verdict in the header above, computed from post-cap findings across all
> reviewers — PASS (zero findings, or only suggestion-severity),
> PASS_WITH_NOTES (>=1 warning, zero blockers), BLOCK (>= `verdict_rules.blocker_threshold`
> blockers, default 1). An individual reviewer signals a blocker by emitting
> FAIL with a blocker-severity finding.

---

## Summary

**Total findings:** 9 (2 blockers, 4 warnings, 3 suggestions)
**Action required:** Revise the spec to address WR-4 and TR-4 before this can pass. Specifically:
(1) name a real consumer for `TrackerSyncLink.provider` (e.g. have outbound writeback and inbound's
already-linked handling resolve the adapter via the link's own stored `provider` value rather than
solely via current manifest config) or explicitly correct the charter's Relationships claim and state
the field is intentionally unused pending a second shipped provider; (2) give the stale-link notice
(inbound step 5) an iteration cap, a cap-trip verdict, and a safe automatic unattended default — the
same shape already used successfully by every other retry construct in this spec (a persisted
per-link or per-run counter feeding a bounded escalation), rather than relying solely on a human
reading a per-turn log line. Warnings (CON-1, RI-1, WR-2, BD-1) and suggestions (CON-2, CON-3,
Boundary's new-surface note) are not blocking but should be addressed in the same revision pass where
practical — WR-2 in particular is related to the same root cause as TR-4 (the stale-link notice's
surfacing/escalation story is underspecified) and a single fix may close both.

**On the round-6 fixes specifically:** WR-1 (registry call site) and WR-3
(`last_synced_at`/`last_comment_id` duplicate-post guard) are genuinely and cleanly resolved —
independently re-verified against actual revision-7 text by the Wiring Reviewer, with concrete
producer/consumer/trigger/test chains for both. WR-2 (`accepted_at`) is closed at the minimum bar (a
real read drives a real logged action) but the specific cross-spec surfacing claim made for it is
overstated (see WR-2 above). The two new blockers (WR-4, TR-4) were both introduced by the shape of
this revision's own fix for WR-2/WR-3 — `TrackerSyncLink.provider` is a fourth, previously-unnoticed
write-only field on the same entity, and the new stale-link notice is the one retry-shaped construct
in this spec that did not receive the persisted-counter treatment already proven out for the other
three. This is new information surfaced by independent re-verification, not a regression in the
round-6 fixes themselves.
