---
status: approved
kind: feature
revision: 11
updated: 2026-08-20
---

# Feature Charter: Autonomous Bugfix Loop

<!-- Feature Charter for the autonomous-bugfix-loop module.
     This defines WHAT the module does and its boundaries, not HOW it is built.
     Live Specs within this charter define specific behavioral contracts. -->

## Business Intent

Enables adev-plugin to drain P2/P3 bugs from the issue board unattended, composing
existing lifecycle primitives (`/adev:debug`, `adev issues claim/release`, the
convergence detector) into a self-re-invoking loop rather than building a new
orchestration engine. A triage-gated GitHub Issues bridge lets external contributors'
bug reports feed that loop without granting anonymous GitHub filers direct influence
over an autonomous agent with repo write access.

Note: this charter introduces a new skill (`/adev:bugfix-loop`) which requires human
approval per Architecture Boundaries — approved during brainstorm.

## Scope and Boundaries

### In Scope

- **Bug-selection verb** (`adev issues next --type bug --max-priority P2 --json`) —
  returns the next eligible bug: unclaimed or lease-expired, unblocked, under its
  attempt cap. `adev issues` today only exposes `migrate/claim/release/stale`.
- **`ADEV-DEBUG:` completion token** — `/adev:debug` emits `FIXED | PARKED |
  UNREPRODUCIBLE` as a terminal, transcript-provable line, following the grammar
  already pinned in `completion-tokens.spec.md`.
- **`--auto` mode on `/adev:debug`** — non-interactive flag suppressing the Phase 6
  interactive ADR-drafting prompt, which otherwise blocks headless runs outright.
- **Per-issue attempt cap** — reuses `lib/loop-convergence.mjs` verdict semantics
  (`PASS/CONTINUE/NO_PROGRESS/REGRESSED/BUDGET_EXHAUSTED`), keyed by issue id instead
  of review revision, persisted under `.context-index/lifecycle-state/`.
- **New `/adev:bugfix-loop` skill** — self-re-invoking, one-bug-per-turn loop that
  drains eligible bugs from the board, copying `/adev:build`'s proven continuation
  discipline (fresh context per turn, explicit re-invocation, no shortcut pressure).
  Includes a Load Skill Extensions block per constitution requirement for new skills.
- **Eligibility filter (the safety boundary)** — a fixed heuristic (P2/P3 priority,
  single-module blast radius) gating which bugs the loop may attempt; anything outside
  it is parked, not attempted. This is load-bearing, not advisory — it is what stops
  the loop from auto-closing governance bugs in machinery it depends on (review gate,
  convergence detector, retry loop).
- **GitHub Issues bridge** — triage-gated bidirectional sync using GitHub's default
  label set: an issue becomes a local WorkItem only once both `bug` and `help wanted`
  are applied (manifest-overridable pair). Outbound writeback posts comments on
  fix/park/unreproducible outcomes only — no trigger exists at claim time; it never
  changes GitHub issue state, labels, or assignees.
- **Modular tracker-provider adapter interface** — the bridge is built behind a
  `TrackerProviderAdapter` interface and registry, mirroring `task-management`'s own
  `IssueManagerInterface`/backend-registry pattern (new backends added by implementing
  the interface and registering, no core changes). GitHub is the only adapter
  *implemented and shipped* by this charter; the interface exists so a future GitLab
  Issues or Azure DevOps Boards adapter can be added without touching
  `/adev:bugfix-loop` or task-management core. Shipping such an adapter would still
  need its own task-management charter carve-out first — see Out of Scope.
- **Documentation for composing with Claude Code's `/goal`** — an optional,
  Claude-Code-specific outer wrapper for genuinely hands-off (close-the-laptop) runs.
  Not a dependency of the core loop, which is self-contained and portable without it.

### Out of Scope

- **Vendoring or reimplementing `/goal`.** It is a Claude Code v2.1.139 harness
  built-in, not an installable skill (`goal-command-adoption.md`). adev documents
  composition with it; it never becomes adev-owned code.
- **Auto-retry policy for parked bugs.** The loop parks once a bug hits its attempt
  cap or falls outside the eligibility filter; re-attempting later requires a human to
  clear the park. Automatic re-parking risk was flagged in research as a slow-motion
  version of the grinding failure the attempt cap exists to prevent.
- **Extending `/adev:route`'s blast-radius/novelty scoring to board issues.** The loop
  ships with a fixed priority/module heuristic; replacing it with `/adev:route`-style
  scoring is future work, tracked in Deferred Capabilities.
- **Jira, Linear, or any external tracker beyond GitHub Issues.** Still excluded per
  `task-management/charter.md`'s Out of Scope — only GitHub Issues was carved out
  (revision 7), and only for this module's use.
- **Implementing a GitLab, Azure DevOps, or other second tracker-provider adapter.**
  The adapter *interface* is in scope (see In Scope); a concrete second
  implementation is not. Shipping one later requires its own `task-management`
  charter carve-out first, same process this charter's GitHub carve-out went through
  — the interface existing does not pre-approve any specific additional provider.
- **Full GitHub issue state mirroring** — assignees, milestones, projects, and
  auto-close/reopen/relabel are not part of this charter. Outbound writeback is
  comment-only.
- **Multi-repo or workspace-wide loop coordination.** One loop instance operates
  against one repo's board.

### Dependencies

| Dependency | Type | Description |
|-----------|------|-------------|
| Task Management | internal module | Issue board CRUD via `IssueManagerInterface`; GitHub Issues bridge scope carved out in `charter.md` revision 7, whose Deferred Capabilities table names this charter as the implementer (cross-referenced both directions); `WorkItem.affected_modules` added in revision 8, driving `bug-selection-and-eligibility`'s safety-boundary mechanism |
| Implementation (owns `/adev:debug`, `skills/debug/SKILL.md`) | internal module | Per-bug worker; source of the `ADEV-DEBUG:` completion token and `--auto` mode, including the Phase 6 confidence gate this charter never overrides |
| Setup (`skills/using-adev/SKILL.md`, Persona Output Override) | internal module | The `debug-completion-and-auto` spec extends the persona-exempt carve-out to name `ADEV-DEBUG`, alongside the existing `ADEV-BUILD`/`ADEV-VALIDATE` entries — added revision 3 after review flagged this dependency was undeclared |
| Agent-Reliable State Artifacts | internal module | `lifecycle-state/` JSONL persistence conventions used for attempt-cap tracking |
| `lib/loop-convergence.mjs` (owned by `review-block-auto-retry.spec.md`) | internal module | Reused bounding logic, keyed per issue instead of per review-revision — high-risk validated spec, coordinate before touching |
| `lib/governance/context-pack.mjs`'s `fenceBlock`/`neutralizeFenceTokens` (owned by the review/governance domain, `configurable-reviewers`-family specs) | internal module | Reused nonce-scoped fence primitive (random per-invocation token, explicit closing delimiter, nonce-independent literal-prefix neutralization) for wrapping untrusted GitHub-origin issue bodies before they are stored as `WorkItem.notes` — same reuse posture as `lib/loop-convergence.mjs` above: coordinate before touching, added revision 8 to close round-5 review BD-1 |
| `/adev:build` (`skills/build/SKILL.md`) | internal module (reference) | Source of the self-re-invocation discipline this skill's loop copies |
| GitHub REST/GraphQL API (via `gh` CLI) | external service | Inbound issue label reads, outbound comment writeback |
| Claude Code `/goal` | external harness feature (optional) | Documented as an optional outer driver; not a dependency of the core loop |

## Domain Model

### Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| BugfixLoopRun | One invocation of `/adev:bugfix-loop` across N self-re-invoked turns | run_id, started_at, max_bugs, max_turns, bugs_attempted[], status (running/complete/budget_exhausted/blocked — `blocked` added in revision 7 to give the `ADEV-BUGFIXLOOP: BLOCKED` completion-token terminal state defined in `bugfix-loop-skill.spec.md`'s Failure Modes and Output Contract a corresponding persisted value; set once, only on the run's terminal turn, when a structural failure such as an unreachable issue board halts the run before any bug is attempted), degraded_sync_note (string or null — written only by the tracker-provider-bridge's degraded-GitHub-sync escalation, added in revision 7), sync_retry_counts (object, default `{ unreachable_consecutive_turns: 0, oversized_consecutive_turns: {} }` — added in revision 8 to close round-5 review TR-1/TR-2; written and read each turn by the tracker-provider-bridge's inbound sync so its two 5-consecutive-turn caps survive this skill's fresh-context-per-turn self-re-invocation and mid-run process restarts: `unreachable_consecutive_turns` is a single run-scoped counter for the GitHub-unreachable/rate-limited case, `oversized_consecutive_turns` is a map keyed by external GitHub issue number for the oversized-title/body-refusal case — both live in the same run-state file this entity already persists to, so a fresh `run_id` starts both counters at their defaults for free), turns_completed (integer, default 0 — added in revision 9 to close round-6 review RI-1; `bugfix-loop-skill.spec.md`'s own revision 6 introduced this field to fix that revision's WR-1 (`--max-turns` was previously unenforced) but never declared it here, an omission this revision corrects; incremented by exactly 1 at the end of every turn, whether or not that turn attempted a bug, and read back by the per-turn budget check to enforce `--max-turns` — distinct from `bugs_attempted.length`, which only grows on turns that reached an actual `/adev:debug` attempt), stale_link_notices_surfaced (array of external tracker refs, default `[]` — added in revision 10 to close round-7 review TR-4; written and read each turn by the tracker-provider-bridge's inbound sync, in the same run-state file `sync_retry_counts`/`degraded_sync_note` already live in, to bound its stale-tracker-link notice to at most one print per external ref per run: the stale-link condition itself, unlike the two `sync_retry_counts` cases, is re-evaluated true on every turn from data that does not change turn-to-turn, so it needs a "surfaced already this run" record rather than a numeric retry cap — see `tracker-provider-bridge.spec.md`'s Interaction Contract inbound step 5) |
| AttemptRecord | Per-issue attempt-cap state, independent of the board schema | issue_id, attempts, last_verdict (PASS/CONTINUE/NO_PROGRESS/REGRESSED/BUDGET_EXHAUSTED), curr_blockers (failing check-ID set or bounded hash, for next-attempt diffing), parked_reason, updated_at |
| TrackerSyncLink | Mapping between an external tracker issue and a local WorkItem, provider-agnostic | external_ref, local_issue_id, accepted_at (when gate condition first met), last_synced_at, last_comment_id |
| TrackerProviderAdapter | Interface contract implemented per tracker (GitHub is the only shipped implementation) | provider name, gate-check fn, inbound-fetch fn, outbound-writeback fn — mirrors `IssueManagerInterface`'s adapter shape |

### Relationships

- A BugfixLoopRun processes zero or more WorkItems (owned by task-management); each
  attempted WorkItem produces or updates one AttemptRecord.
- An AttemptRecord belongs to exactly one WorkItem by issue id and persists across
  multiple BugfixLoopRuns until the issue closes or a human resets it.
- A TrackerSyncLink connects exactly one external tracker issue to exactly one local
  WorkItem, created only when its provider adapter's gate condition is met (for the
  GitHub adapter: both `bug` and `help wanted` labels present).
- **(revision 11, round-9 review wiring-reviewer WR-1 — `provider` field removed)**
  `TrackerSyncLink` no longer carries a `provider` field. Three prior revisions tried
  to resolve the same underlying problem — a write-only field with no reachable-today
  consumer — by reframing what the field meant (revision 7: "selects the adapter";
  revision 8, round-7 WR-4: relabeled to "write-once provenance"; revision 9, round-8
  WR-1: added a deferred Actionable Task Map row modeled on `WorkItem.notes`'s own
  write-only-gap tracking). Round-9 review rejected the `notes` comparison as not
  equivalent: `notes`'s companion task (wiring `skills/debug/SKILL.md` Phase 1) is
  reachable today against an existing consumer, while `provider`'s companion task
  (per-link dispatch once a second `TrackerProviderAdapter` ships) depends on the
  Deferred Capabilities table's "Second Tracker Provider Adapter" row, which carries
  no target milestone — speculative, not deferred-and-tracked in the same sense. Both
  `tracker-provider-bridge.spec.md`'s own Interaction Contract (inbound step 1 /
  outbound step 2) and this charter's now-corrected Relationships bullet already
  resolve the active adapter by reading the project-wide
  `tasks.bugfix_loop.tracker_provider` manifest setting directly, never by reading a
  per-link field — v1 ships exactly one configured provider per project (Capability
  Map: Tracker Provider Adapter Interface, milestone 2), and there is no scenario in
  scope today where a single run could hold links to two different providers
  simultaneously. Rather than reframe the field a fourth time, it is deleted: there is
  no field left to have no consumer. If a second `TrackerProviderAdapter` ever ships,
  a future spec can add whatever dispatch field that work actually needs, informed by
  real requirements instead of speculative schema.
- A WorkItem created via a tracker bridge carries an origin marker referencing its
  TrackerSyncLink, so outbound writeback knows where to comment.

### Invariants

- A WorkItem is claimable by the loop only if unclaimed (or lease-expired), unblocked,
  under its attempt cap, and within the eligibility filter (P2/P3 priority,
  single-module blast radius).
- The loop never marks an issue closed except through `/adev:debug`'s own Phase 6
  confidence gate — it cannot self-report success.
- An AttemptRecord's attempt counter increments only on a completed
  `/adev:debug --issue --auto` invocation, never on claim alone.
- A GitHub issue is never mirrored into the local board unless both `bug` and
  `help wanted` (or the manifest-configured equivalent pair) are present at sync time.
- Outbound writeback to GitHub is comment-only; the loop never changes GitHub issue
  state, labels, or assignees.
- No tracker-provider-specific logic (label names, API shape, comment format) lives
  outside its own `TrackerProviderAdapter` implementation; `/adev:bugfix-loop` and
  task-management interact only with the adapter interface and `TrackerSyncLink`.
- The loop never attempts an issue whose blast radius touches its own dependency
  machinery (review gate, convergence detector, retry loop, or the loop skill itself),
  regardless of priority or filter match.

## Capability Map

| Capability | Description | Priority | Milestone | Status |
|-----------|-------------|----------|-------|--------|
| Bug Selection Verb | `adev issues next --type bug --max-priority <p> --json` returns the next eligible bug | must-have | 1 | validated |
| ADEV-DEBUG Completion Token | `/adev:debug` emits `ADEV-DEBUG: FIXED \| PARKED \| UNREPRODUCIBLE` per `completion-tokens.spec.md` grammar | must-have | 1 | validated |
| `--auto` Mode on `/adev:debug` | Non-interactive mode skipping the Phase 6 ADR-drafting prompt | must-have | 1 | validated |
| Per-Issue Attempt Cap | Reused `loop-convergence.mjs` bounding, keyed per issue, persisted in `lifecycle-state/` | must-have | 1 | validated |
| `/adev:bugfix-loop` Skill | Self-re-invoking, one-bug-per-turn loop draining eligible bugs; Load Skill Extensions block included | must-have | 1 | implemented |
| Eligibility Filter | Fixed priority/blast-radius heuristic (P2/P3, single-module) gating loop attempts — the safety boundary | must-have | 1 | validated |
| Tracker Provider Adapter Interface | `TrackerProviderAdapter` contract + registry; GitHub is the only shipped implementation | must-have | 2 | review-passed |
| GitHub Triage-Gated Inbound Sync | Issues labeled `bug`+`help wanted` become local WorkItems, via the GitHub adapter | must-have | 2 | review-passed |
| GitHub Outbound Comment Writeback | Claim/fix/park state posted as GitHub comments, via the GitHub adapter | must-have | 2 | review-passed |
| `/goal` Composition Docs | Documentation showing how to wrap `/adev:bugfix-loop` in `/goal` for hands-off Claude Code runs | nice-to-have | 1 | — |

## Deferred Capabilities

| Capability | Reason | Target Milestone | Depends On |
|-----------|--------|-------------|------------|
| Route-Based Eligibility Scoring | Extends `/adev:route`'s blast-radius/novelty scoring to board issues, replacing the fixed P2/P3 heuristic filter | 3 | Eligibility Filter |
| Auto-Retry Policy for Parked Bugs | Whether/when parked bugs re-enter the loop automatically vs. staying parked until a human clears them — deferred to avoid a slow-motion grinding failure | — | — |
| GitHub Issue State Mirroring | Auto-close/reopen/relabel GitHub issues based on loop state, beyond comment writeback | — | GitHub Outbound Comment Writeback |
| Cross-Harness Outer Drivers | Equivalents to Claude Code's `/goal` for opencode/codex/cursor/copilot hands-off runs | — | — |
| Second Tracker Provider Adapter (GitLab, Azure DevOps, etc.) | Interface exists and is proven by the GitHub adapter; a second implementation is deferred until there's demand, and needs its own task-management charter carve-out first | — | Tracker Provider Adapter Interface |
| `affected_modules` CLI Producer | `/adev:issues create/update --affected-modules <slug>` flag; v1 ships only a direct `IssueManager.update()` call as the producer (reviewed and found unwired as a polished UX in revision-2 review) | — | Bug Selection Verb |
| `affected_modules` GitHub Label Producer | Maintainer-applied `module:<slug>` label populating `affected_modules` on inbound sync; asserted in an earlier tracker-provider-bridge revision but never implemented — deferred honestly here | — | Tracker Provider Adapter Interface |

## Interface Contracts

### Exposed APIs

| Interface | Type | Description |
|-----------|------|-------------|
| `adev issues next --type bug --max-priority <p> --json` | CLI verb | Returns the next eligible bug: unclaimed/lease-expired, unblocked, under attempt cap |
| `ADEV-DEBUG: FIXED \| PARKED \| UNREPRODUCIBLE` | terminal token | Emitted by `/adev:debug`, transcript-provable per `completion-tokens.spec.md` |
| `/adev:debug --auto` | skill flag | Suppresses the interactive ADR-drafting prompt in Phase 6 |
| `/adev:bugfix-loop [--max-bugs N] [--max-turns N] [--github-sync]` | skill | User-facing entry point for the unattended loop; self-re-invokes until board drained or budget hit |
| GitHub Issues sync bridge | CLI verb (signature defined in Live Spec) | Pulls `bug`+`help wanted` labeled issues into the local board; posts outbound status comments |
| `TrackerProviderAdapter` | internal interface (module contract, not a network endpoint) | Per-provider adapter contract (gate check, inbound fetch, outbound writeback); GitHub is the only implementation shipped by this charter |

### Consumed APIs

| Interface | Source Module | Description |
|-----------|-------------|-------------|
| `IssueManager.list/get/update/claim/release` | Task Management | Board reads/writes for selection, claim linkage, concurrency |
| `lib/loop-convergence.mjs` verdicts | review-block-auto-retry (cross-cutting) | Reused bounding logic for per-issue attempt caps |
| `gh` CLI / GitHub REST API | external | Read issue labels, post comments |
| Claude Code `/goal` (optional) | external harness | Documented composition target, not a called API |

## Quality Attributes

| Attribute | Requirement |
|-----------|-------------|
| Safety | The eligibility filter (priority + blast radius) is the primary safety boundary; must default to parking anything outside P2/P3 single-module scope, and must never attempt issues touching its own dependency machinery |
| Determinism | The loop never marks a bug fixed except via `/adev:debug`'s own deterministic quality-gate pass; no self-reported success |
| Portability | The core loop mechanism (self-re-invocation) works in every harness adev supports; `/goal` is an optional Claude-Code-only enhancement, never a dependency |
| Resilience | GitHub API failures (rate limit, outage) degrade to local-board-only operation; the loop must never block on bridge availability |
| Auditability | Every claim/fix/park decision is traceable via `lifecycle-state/` JSONL records; for GitHub-origin issues, fix/park/unreproducible outcomes additionally get an outbound comment (not claim — no trigger exists at that point) |
| Boundedness | Both per-run (`max-bugs`/`max-turns`) and per-issue (attempt cap) budgets are enforced; the loop must terminate on a transcript-provable condition |
| Extensibility | New tracker providers (GitLab, Azure DevOps, etc.) are added by implementing `TrackerProviderAdapter` and registering it, with no changes to `/adev:bugfix-loop` or task-management core — same pattern as `IssueManagerInterface`'s backend registry |
