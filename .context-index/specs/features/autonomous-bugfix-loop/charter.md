---
status: approved
kind: feature
revision: 2
updated: 2026-08-19
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
  claim/fix/park; it never changes GitHub issue state, labels, or assignees.
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
| Task Management | internal module | Issue board CRUD via `IssueManagerInterface`; GitHub Issues bridge scope carved out in `charter.md` revision 7, whose Deferred Capabilities table names this charter as the implementer (cross-referenced both directions) |
| Implementation (owns `/adev:debug`, `skills/debug/SKILL.md`) | internal module | Per-bug worker; source of the `ADEV-DEBUG:` completion token and `--auto` mode, including the Phase 6 confidence gate this charter never overrides |
| Agent-Reliable State Artifacts | internal module | `lifecycle-state/` JSONL persistence conventions used for attempt-cap tracking |
| `lib/loop-convergence.mjs` (owned by `review-block-auto-retry.spec.md`) | internal module | Reused bounding logic, keyed per issue instead of per review-revision — high-risk validated spec, coordinate before touching |
| `/adev:build` (`skills/build/SKILL.md`) | internal module (reference) | Source of the self-re-invocation discipline this skill's loop copies |
| GitHub REST/GraphQL API (via `gh` CLI) | external service | Inbound issue label reads, outbound comment writeback |
| Claude Code `/goal` | external harness feature (optional) | Documented as an optional outer driver; not a dependency of the core loop |

## Domain Model

### Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| BugfixLoopRun | One invocation of `/adev:bugfix-loop` across N self-re-invoked turns | run_id, started_at, max_bugs, max_turns, bugs_attempted[], status (running/complete/budget_exhausted) |
| AttemptRecord | Per-issue attempt-cap state, independent of the board schema | issue_id, attempts, last_verdict (PASS/CONTINUE/NO_PROGRESS/REGRESSED/BUDGET_EXHAUSTED), parked_reason, updated_at |
| TrackerSyncLink | Mapping between an external tracker issue and a local WorkItem, provider-agnostic | provider (e.g. `"github"`), external_ref, local_issue_id, accepted_at (when gate condition first met), last_synced_at, last_comment_id |
| TrackerProviderAdapter | Interface contract implemented per tracker (GitHub is the only shipped implementation) | provider name, gate-check fn, inbound-fetch fn, outbound-writeback fn — mirrors `IssueManagerInterface`'s adapter shape |

### Relationships

- A BugfixLoopRun processes zero or more WorkItems (owned by task-management); each
  attempted WorkItem produces or updates one AttemptRecord.
- An AttemptRecord belongs to exactly one WorkItem by issue id and persists across
  multiple BugfixLoopRuns until the issue closes or a human resets it.
- A TrackerSyncLink connects exactly one external tracker issue to exactly one local
  WorkItem, created only when its provider adapter's gate condition is met (for the
  GitHub adapter: both `bug` and `help wanted` labels present).
- A TrackerSyncLink's `provider` field selects which TrackerProviderAdapter handles its
  inbound sync and outbound writeback; the loop and task-management never branch on
  provider directly.
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
| Bug Selection Verb | `adev issues next --type bug --max-priority <p> --json` returns the next eligible bug | must-have | 1 | specified |
| ADEV-DEBUG Completion Token | `/adev:debug` emits `ADEV-DEBUG: FIXED \| PARKED \| UNREPRODUCIBLE` per `completion-tokens.spec.md` grammar | must-have | 1 | — |
| `--auto` Mode on `/adev:debug` | Non-interactive mode skipping the Phase 6 ADR-drafting prompt | must-have | 1 | — |
| Per-Issue Attempt Cap | Reused `loop-convergence.mjs` bounding, keyed per issue, persisted in `lifecycle-state/` | must-have | 1 | — |
| `/adev:bugfix-loop` Skill | Self-re-invoking, one-bug-per-turn loop draining eligible bugs; Load Skill Extensions block included | must-have | 1 | — |
| Eligibility Filter | Fixed priority/blast-radius heuristic (P2/P3, single-module) gating loop attempts — the safety boundary | must-have | 1 | specified |
| Tracker Provider Adapter Interface | `TrackerProviderAdapter` contract + registry; GitHub is the only shipped implementation | must-have | 2 | — |
| GitHub Triage-Gated Inbound Sync | Issues labeled `bug`+`help wanted` become local WorkItems, via the GitHub adapter | must-have | 2 | — |
| GitHub Outbound Comment Writeback | Claim/fix/park state posted as GitHub comments, via the GitHub adapter | must-have | 2 | — |
| `/goal` Composition Docs | Documentation showing how to wrap `/adev:bugfix-loop` in `/goal` for hands-off Claude Code runs | nice-to-have | 1 | — |

## Deferred Capabilities

| Capability | Reason | Target Milestone | Depends On |
|-----------|--------|-------------|------------|
| Route-Based Eligibility Scoring | Extends `/adev:route`'s blast-radius/novelty scoring to board issues, replacing the fixed P2/P3 heuristic filter | 3 | Eligibility Filter |
| Auto-Retry Policy for Parked Bugs | Whether/when parked bugs re-enter the loop automatically vs. staying parked until a human clears them — deferred to avoid a slow-motion grinding failure | — | — |
| GitHub Issue State Mirroring | Auto-close/reopen/relabel GitHub issues based on loop state, beyond comment writeback | — | GitHub Outbound Comment Writeback |
| Cross-Harness Outer Drivers | Equivalents to Claude Code's `/goal` for opencode/codex/cursor/copilot hands-off runs | — | — |
| Second Tracker Provider Adapter (GitLab, Azure DevOps, etc.) | Interface exists and is proven by the GitHub adapter; a second implementation is deferred until there's demand, and needs its own task-management charter carve-out first | — | Tracker Provider Adapter Interface |

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
| Auditability | Every claim/fix/park decision is traceable via `lifecycle-state/` JSONL records and, for GitHub-origin issues, outbound comments |
| Boundedness | Both per-run (`max-bugs`/`max-turns`) and per-issue (attempt cap) budgets are enforced; the loop must terminate on a transcript-provable condition |
| Extensibility | New tracker providers (GitLab, Azure DevOps, etc.) are added by implementing `TrackerProviderAdapter` and registering it, with no changes to `/adev:bugfix-loop` or task-management core — same pattern as `IssueManagerInterface`'s backend registry |
