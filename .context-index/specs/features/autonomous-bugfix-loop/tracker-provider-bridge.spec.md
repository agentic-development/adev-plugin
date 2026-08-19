<!-- partial_schema: spec@1 -->

---
charter: autonomous-bugfix-loop
kind: integration
status: review-blocked
risk_level: medium
milestone: 2
revision: 1
charter-revision: 2
created: 2026-08-19
updated: 2026-08-19
---

# Integration Spec: Tracker Provider Bridge

<!-- Integration Spec within the autonomous-bugfix-loop charter.
     An integration spec wires two or more existing modules/skills together. It defines
     the participants and their roles, the interaction contract, the observable state
     machine, and how failures propagate across the boundary.
     Parent Charter: .context-index/specs/features/autonomous-bugfix-loop/charter.md -->

## Participants

| Module | Role |
|---|---|
| `TrackerProviderAdapter` interface | Defines the contract each provider implements: gate check, inbound fetch, outbound writeback. GitHub is the only implementation this spec ships. |
| GitHub adapter | Implements `TrackerProviderAdapter` for GitHub Issues, shelling out to the existing `gh` CLI. |
| `TrackerSyncLink` | Provider-agnostic entity mapping one external tracker issue to one local WorkItem. |
| Task Management (`IssueManagerInterface`) | Owns the local WorkItem the bridge creates and updates; the bridge never bypasses `IssueManager.create`/`update`. |
| `/adev:bugfix-loop` (`--github-sync`) | Consumer: triggers inbound pull before each turn's selection, and outbound writeback after each attempt. |
| GitHub REST/GraphQL API (via `gh` CLI) | External system: source of inbound issues and labels, target of outbound comments. |

## Interaction Contract

**On inbound sync** (triggered by `/adev:bugfix-loop --github-sync` at the start of each turn):
1. The GitHub adapter's gate-check fn queries open GitHub issues, filtering to those carrying both `bug` and `help wanted` labels (or the manifest-configured equivalent pair).
2. For each gated issue with no existing `TrackerSyncLink`, the adapter's inbound-fetch fn maps title/body/labels onto WorkItem fields (`title`, `type: "bug"`, a default priority, `notes` referencing the GitHub origin) and calls `IssueManager.create(...)`.
3. A `TrackerSyncLink` is created connecting the GitHub issue number to the new local WorkItem id, with `accepted_at` set to now.
4. For gated issues that already carry a `TrackerSyncLink`, no duplicate WorkItem is created — idempotent, matching the idempotency pattern already used by `/adev:specify`'s Feature work-item binding (Step 5.6-2).

**On outbound writeback** (triggered by `/adev:bugfix-loop --github-sync` after each bug attempt completes):
1. The loop reads the completed attempt's outcome: claimed, or the resulting `ADEV-DEBUG: FIXED | PARKED | UNREPRODUCIBLE` token.
2. If the attempted WorkItem has a `TrackerSyncLink`, the GitHub adapter's outbound-writeback fn posts a comment on the linked GitHub issue describing the outcome, via `gh issue comment`.
3. `TrackerSyncLink.last_synced_at` and `last_comment_id` are updated.
4. The adapter never changes GitHub issue state, labels, or assignees — comment-only, per the charter's invariant.

## State Machine

```
UNTRIAGED ──(maintainer applies bug+help wanted)──▶ GATED ──(inbound sync)──▶ LINKED
                                                                                  │
                                                                    (loop claims, attempts)
                                                                                  ▼
                                                                             ATTEMPTED
                                                          (outbound comment posted; GitHub
                                                           issue state/labels untouched)
                                                                                  │
                                   ┌──────────────────────────────────────────────┼──────────────────────────────────────────────┐
                                   ▼                                              ▼                                              ▼
                          comment: "Fixed"                              comment: "Parked"                          comment: "Unreproducible"
                    (local WorkItem closed by                     (local WorkItem stays open,               (local WorkItem stays open,
                     /adev:debug's own gate;                       ineligible per attempt cap)                ineligible per attempt cap)
                     GitHub issue stays open)
```

States:
- `UNTRIAGED`: GitHub issue exists, no `TrackerSyncLink`, gate condition not met.
- `GATED`: `bug`+`help wanted` present, no `TrackerSyncLink` yet — the next inbound sync will link it.
- `LINKED`: `TrackerSyncLink` exists, local WorkItem exists, not yet attempted by the loop.
- `ATTEMPTED`: at least one outbound comment posted; `last_synced_at`/`last_comment_id` updated. Terminal for this spec's scope — further re-attempts (if the WorkItem remains eligible) post additional comments without a new state.

## Error Propagation

| Origin | Propagates as | Consumer behavior |
|---|---|---|
| GitHub API unreachable or rate-limited during inbound sync | Adapter returns a degraded-empty candidate list, never an unhandled exception | Loop proceeds with local-board-only candidates this turn; no bugs are lost, sync catches up next turn |
| GitHub API unreachable during outbound writeback | Writeback is skipped for that attempt, logged as a warning | Local state (`AttemptRecord`, `WorkItem`) is already correct regardless; the comment is not retried automatically within this run |
| `gh` CLI not installed or not authenticated | Treated identically to API-unreachable — degrades to local-only, not a special case | Install/authenticate `gh`, or continue operating without `--github-sync` |
| A GitHub issue loses `bug` or `help wanted` after being linked | The existing `TrackerSyncLink`/WorkItem is NOT retroactively removed — un-labeling only prevents *new* links, it never un-syncs existing ones | A human closes or parks the local WorkItem manually if the un-labeling was meant to also halt the loop |
| Two sync runs race on creating a `TrackerSyncLink` for the same GitHub issue number | The second creation attempt detects the existing link and no-ops rather than duplicating the WorkItem | None needed — self-healing |

## System Constitution Reference

- **Principle:** "Minimize external dependencies — prefer Node.js built-ins." — Applies because the GitHub adapter shells out to the already-present `gh` CLI, established prior art per `lib/milestones.mjs` and `lib/cli/coordination.mjs`'s existing read-only PR-visibility usage — not a new npm package dependency.
- **Architecture Boundary:** "Adding external dependencies" (Requires Human Approval) — **Not triggered.** `gh` is an existing, already-relied-upon external CLI tool with an established degrade-gracefully pattern in this codebase; this spec extends that pattern to a load-bearing use rather than introducing a new dependency class.
- **Quality Attribute (charter):** Extensibility — "New tracker providers... are added by implementing `TrackerProviderAdapter` and registering it, with no changes to `/adev:bugfix-loop` or task-management core." This spec ships the GitHub implementation as the interface's proof, not its only possible member.

## Acceptance Criteria

- [ ] Inbound sync creates exactly one local WorkItem per gated GitHub issue, idempotent under re-runs and races
- [ ] Outbound writeback posts comments on claim/fix/park; never touches GitHub issue state, labels, or assignees
- [ ] GitHub API or `gh` CLI unavailability degrades to local-board-only operation without erroring the loop
- [ ] Label removal after linking does not retroactively un-sync an existing `TrackerSyncLink`
- [ ] The `TrackerProviderAdapter` interface has exactly one implementation (GitHub) shipped by this spec; a second provider is addable by implementing the interface alone
- [ ] Tests cover both interaction-contract flows (inbound sync, outbound writeback) end-to-end
- [ ] All quality gates pass (`npm test`)
- [ ] No constitutional violations introduced
