---
spec: .context-index/specs/features/task-management/github-board-backend.spec.md
charter: .context-index/specs/features/task-management/charter.md
verdict: PASS_WITH_NOTES
tier: full
date: 2026-11-26
last-reviewed-revision: 2
prior-round: revision 1, BLOCK (3 blockers) — see git history of this file
file-sha: d7b346982184541f7f912dd451dde26c2b078cd5051e08d0825f584f4193ec08
---

# Architecture Review: github-board-backend

> **Date:** 2026-11-26
> **Spec:** .context-index/specs/features/task-management/github-board-backend.spec.md (revision 2)
> **Charter:** .context-index/specs/features/task-management/charter.md (revision 10)
> **Verdict:** PASS_WITH_NOTES
> **Rigor tier:** full (risk_level: high → `review_mode: full`)
> **Diff scope:** not scoped (`no-content-changed`, failed open to full context); prior-round review supplied to every reviewer
> **Registry warnings:** `BROADEN_TOOL` ×2 and `BROADEN_NETWORK` for profile `browser-review` (not used by any dispatched reviewer)
> **Dispatch note:** each reviewer received its prompt verbatim from `adev governance dispatch` (`buildDispatchPlan` → `buildReviewerDispatches`), delivered as a file the reviewer read in full, because the five prompts total ~1.06 MB.
> **Governance:** risk policy `high` sets `require_hitl_approval: true` — a human must approve before `/adev:plan`.

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-capable | registry prompt (via `adev governance dispatch`) |
| referent-integrity | Referent Integrity Reviewer | subagent | reviewer-reasoning | registry prompt (via `adev governance dispatch`) |
| wiring-reviewer | Wiring Reviewer | subagent | reviewer-capable | registry prompt (via `adev governance dispatch`) |
| boundary-reviewer | Boundary Reviewer | subagent | reviewer-capable | registry prompt (via `adev governance dispatch`) |
| termination-reviewer | Termination Reviewer | subagent | reviewer-fast | registry prompt (via `adev governance dispatch`); triggered, score 2 ≥ 1 |

## Disabled Reviewers

| ID | Reason |
|----|--------|
| structural-architect | disabled in `.context-index/governance/review.yaml` (no reason surfaced by the registry envelope) |
| security-reviewer | disabled in `.context-index/governance/review.yaml` (no reason surfaced by the registry envelope) |

## Prior-Round Resolution

All 3 revision-1 blockers are resolved — BD-1 by BEH-40 (fixed `gh api graphql --input -` argv, values only as GraphQL variables), CON-1 by BEH-16 (shared `validateStatusTransition()` rules), RI-1 by BEH-32 (never writes `manifest.yaml`) — and every reviewer confirmed its own revision-1 warnings and suggestions resolved.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

- **CON-1** (warning, contract) — State whether a github-path migration abort also emits `backend-migration.spec.md`'s `MIGRATE_PARTIAL_FAILURE` (with the `GITHUB_*` code in `errors[]`) or replaces it, and how ADR 0014's verbatim stderr passthrough squares with the "token redacted" promise. Belongs in the task-14 amendment.
- **CON-2** (warning, adr-compliance; external) — ADR 0016 (Proposed) Decision 1/2 makes `.context-index/` the single system of record for the issue board. The github backend keeps board fields only on GitHub. Cite it and amend ADR 0016 with an opt-in external-board carve-out (`remedy_ref: .context-index/adrs/0016-portable-state-ownership.md`).
- **CON-3** (warning, module-boundary) — `.beads/adev-read-only.json` sits in the `beads-board` linked worktree; unless committed and pushed it guards only the local clone. State which.
- **CON-4** (warning, terminology) — Say that "rollback-by-abstention" is the charter's "rollback", and whether the loser's `claimed_at` overwriting the winner's is accepted or restored; name `legacy_id` as the MigrationIdMap realization.
- **CON-5** (suggestion) — Add `walkTree(<legacy id>)` resolving via `legacy_id` to BEH-37's github-only differences (vs. tiered-hierarchy Behavior 7's `[]`).

## Referent Integrity Reviewer (referent-integrity)

**Verdict:** PASS_WITH_NOTES

- **RI-1** (warning, `behaviors-14`) — `/adev:plan` never calls `create()` (only `adev issues epic` → `createEpic`) and has no non-blocking adapter-error path; drop it from BEH-14's consumer list or add plan-side handling.
- **RI-2** (warning, `behaviors-33`) — The file adapter already throws `BACKEND_READ_ONLY_DEPRECATED` on every write (`file-adapter.mjs:32-36`); state which code wins when the sentinel is present.
- **RI-3** (warning, `behaviors-26`) — Charter interface row says `setup --check` exits non-zero on drift and lists no `--yes`; BEH-26 exits 0 on drift. Reconcile.
- **RI-4** (warning, `behaviors-20`) — The five verbs don't render bodies as text (bodies appear only in `--json`, which `/adev:debug` consumes via `show --json`), and `fenceBlock` needs a nonce source. Say whether `--json` `notes` is fenced or raw, or limit BEH-20 to human-form titles.
- **RI-5** (suggestion) — `--yes` is a new `issues-migrate.mjs` flag (`parseArgs` rejects unknown flags); add it to task 9 and the task-14 amendment.

## Wiring Reviewer (wiring-reviewer)

**Verdict:** PASS_WITH_NOTES

- **WR-1** (warning) — Other `tasks.backend` readers (`issues-next.mjs:73`, `cli/index.mjs:1199`, `cost-summary.mjs`, `/adev:sync`'s Task Management block) are unaccounted for; `constitution-sync.spec.md` would emit file-backend (`tasks.md`) guidance for an unknown backend. Add a sync task/test and a statement that every reader was checked.
- **WR-2** (warning) — No acceptance criterion asserts each BEH-26 drift category appears in the `setup --check` report; add a fixture test per category.
- **WR-3** (warning) — State the producer→consumer contract the bridge amendment must test (e.g. a home-repo `gh-<n>` item with a reserved `module:` label classified fail-closed).
- **WR-4** (suggestion) — Name the reader of `.migrate-state.json` "progress reporting".
- **WR-5** (suggestion) — State whether the fixture recorder's containment boundary is tested or manual-only.

## Boundary Reviewer (boundary-reviewer)

**Verdict:** PASS_WITH_NOTES

- **BD-1** (warning) — BEH-40's single fixed argv contradicts BEH-3's preflight (`gh auth status`, scope check). Enumerate the closed set of fixed argv arrays preflight may run, or derive scopes through the GraphQL channel, and reword the assertion to "one of this closed set".
- **BD-2** (suggestion) — Sentinel write and existence check should both go through `resolveContained()` against a realpath'd storage root; refuse a symlinked sentinel.
- **BD-3** (warning) — BEH-39 omits predicates for `type`, Epic `milestone`, and `priority`, and `next_action` does not refuse YAML-significant sequences; add refuse-don't-sanitize predicates and state the list is exhaustive over BEH-8's table.
- **BD-4** (warning) — Labels and issue types are triage-writable and Project text fields need only project write — "maintainer-only" overstates it. State the real trust assumption, how reserved safety tags behave when a triager adds/removes them, and document it.
- **BD-5** (warning) — State the commit/gitignore status of both sentinel paths (the beads one can be pushed to the public board branch) and that the project URL is its only content; add a fixture-lint check that titles/bodies come only from recorder-authored strings.
- **BD-6** (suggestion) — Document a sanctioned unlock procedure for `BOARD_READ_ONLY_MIGRATED`, and that a malformed sentinel still blocks writes.
- **BD-7** (suggestion) — Parse issue URLs with WHATWG `URL`; refuse userinfo, port, query, and fragment rather than stripping them.

## Termination Reviewer (termination-reviewer)

**Verdict:** PASS_WITH_NOTES

- **TR-1** (warning) — BEH-10's page bound is written for the item read; state that each sub-issue / blocked-by continuation has its own `totalCount` bound and the repeated-cursor rule.
- **TR-2** (warning) — BEH-11's transitive walk states no visited-set or cycle outcome; track visited IDs and throw a named code on a cycle.
- **TR-3** (suggestion) — Keep BEH-35's numbers as the single source and reference them from Acceptance Criteria and Error Cases.

## Heuristics

The following heuristics are lessons learned from past work in this module. Use them as guidance, not as hard rules.

- *A universal coverage claim must ship with the predicate that checks it* (medium) — relevant to WR-1's "every `tasks.backend` reader was checked" and BD-3's "exhaustive over BEH-8".

---

## Summary

**Total findings:** 25 (0 blockers, 17 warnings, 8 suggestions)
**Action required:** None blocks planning. Because the risk policy requires human approval before `/adev:plan`, a short revision-3 cleanup is recommended first — chiefly BD-1 (preflight argv set), BD-3/BD-4 (field predicates and the real trust model), CON-3/BD-5 (beads sentinel commit status), RI-4 (what BEH-20 actually fences), WR-1 (`/adev:sync` and other `tasks.backend` readers), and TR-2 (cycle-safe `walkTree`). CON-2 needs an ADR 0016 amendment outside this spec. CON-1, RI-5, and WR-3 belong in the task-14 companion amendments.
