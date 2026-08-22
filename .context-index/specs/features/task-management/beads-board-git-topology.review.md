---
spec: .context-index/specs/features/task-management/beads-board-git-topology.spec.md
charter: .context-index/specs/features/task-management/charter.md
verdict: BLOCK
reviewers:
  - id: consistency-analyzer
    mode: subagent
    profile: reviewer-fast
    prompt: plugin:review-specs/consistency-analyzer-prompt.md
    verdict: PASS_WITH_NOTES
  - id: referent-integrity
    mode: subagent
    profile: reviewer-reasoning
    prompt: plugin:review-specs/referent-integrity-prompt.md
    verdict: FAIL
  - id: wiring-reviewer
    mode: subagent
    profile: reviewer-capable
    prompt: plugin:review-specs/wiring-reviewer-prompt.md
    verdict: PASS_WITH_NOTES
  - id: boundary-reviewer
    mode: subagent
    profile: reviewer-capable
    prompt: plugin:review-specs/boundary-reviewer-prompt.md
    verdict: FAIL
last-reviewed-revision: 1
file-sha: 6f4ac4abb234775592917b3e00654f77d4fc047c479fe271852c26c18193c6de
review-date: 2026-08-22
rigor-tier: full
---

# Architecture Review: beads-board-git-topology

> **Date:** 2026-08-22
> **Spec:** `.context-index/specs/features/task-management/beads-board-git-topology.spec.md`
> **Charter:** `.context-index/specs/features/task-management/charter.md`
> **Verdict:** BLOCK

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |
| referent-integrity | Referent Integrity Reviewer | subagent | reviewer-reasoning | plugin:review-specs/referent-integrity-prompt.md |
| wiring-reviewer | Wiring Reviewer | subagent | reviewer-capable | plugin:review-specs/wiring-reviewer-prompt.md |
| boundary-reviewer | Boundary Reviewer | subagent | reviewer-capable | plugin:review-specs/boundary-reviewer-prompt.md |

Rigor tier: **full** (resolved from `risk_level: medium` → `policies.medium.review_mode: full` in `.context-index/governance/risk-policies.yaml`; no `--tier` override, no routing signal). `termination-reviewer` was not dispatched — its trigger keywords (loop, retry, poll, iterate, recurring, convergence, auto-retry) do not appear in this spec.

**Note on consistency-analyzer's context pack:** this project's materialized `governance/review.yaml` wires `consistency-analyzer` to the minimal `base` context pack (constitution + platform-context only), which does not satisfy that reviewer's own stated Input contract (sibling specs, cross-cutting specs, ADRs, parent charter). This dispatch substituted the fuller `consistency` pack (review-base + ADRs + cross-cutting) so the review would not be hollow. See CON-3 below — likely worth a registry fix independent of this spec.

## Disabled Reviewers

| ID | Reason |
|----|--------|
| structural-architect | Disabled as part of the reviewer-domain-fit initiative. OWASP/structural scope was retargeted to referent-integrity/wiring-reviewer/consistency-analyzer/boundary-reviewer for the default (Node CLI/plugin) project shape. |
| security-reviewer | Disabled as part of the reviewer-domain-fit initiative. OWASP-scoped review relocated to the web-service domain extension. |

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

- **CON-1** (warning, pattern) — The Error Cases table describes every failure prose-only, with no named ADEV error code for any condition, unlike every other CLI-verb spec in this charter (`backend-migration.spec.md`'s `MIGRATE_NOOP`, `MIGRATE_PARTIAL_FAILURE`, etc.; `backend-adapters.spec.md`'s `BEADS_COMMAND_FAILED`, `NOT_FOUND`). Recommendation: add a code per row (e.g. `BOARD_ALREADY_EXISTS`, `BOARD_NO_BRANCH`, `BOARD_ALREADY_MIGRATED`, `BOARD_NOTHING_TO_MIGRATE`, `BOARD_MIGRATE_PARTIAL_FAILURE`) before `/adev:plan`.
- **CON-2** (suggestion, module-boundary) — BEH-6 and the task map's `cli/index.mjs` bootstrap integration don't name a `lib/cli/<verb>.mjs` helper module, unlike this charter's own established shape (`cli-driver-surface` charter's 1:1 rule; `backend-migration.spec.md` names `lib/cli/issues-migrate.mjs` explicitly). Non-blocking — route the plan step's git calls through `lib/issues/` rather than inlining into the CLI entrypoint.
- **CON-3** (suggestion, module-boundary / process) — Confirms the pack-assignment mismatch noted above: `consistency-analyzer`'s registry binding to the `base` pack cannot satisfy its own Input contract.

No blockers. Spec is otherwise well-aligned with the charter and sibling specs (BEH-1's `--no-db` dependency correctly cites `backend-adapters.spec.md` Behavior 15; BEH-4's `resolveStorageRoot()` claim matches the real algorithm; no ADR conflicts found).

## Referent Integrity Reviewer (referent-integrity)

**Verdict:** FAIL

- **RI-1 through RI-6, RI-8, RI-9** (suggestion/warning) — 8 referents checked and verified clean by direct source read: `resolveStorageRoot()`, the `--no-db` fallback, `cli/index.mjs`'s existing install flow, `tasks.backend`, `MIN_BR_VERSION`, the pre-migration tracked state of `.beads/issues.jsonl`, `git worktree add --orphan` (external git behavior, not repo-verifiable but consistent with known git 2.42+ semantics), and both charter capability names.
- **RI-7 (blocker, stale-file-path, section: scope-note)** — The spec's opening scope note says the excluded concurrent-write scope is "covered by the sibling `beads-board-direct-sync` spec, not this one" — phrased as present-tense coverage by an existing spec. No such spec file exists anywhere in the repo (confirmed by search); the charter lists that capability's Status as `—`, not `specified`. Recommendation: rephrase to future tense or remove the specific filename claim until that spec is authored.
  `blocker_id: referent-integrity:stale-file-path:013f73f1`

## Wiring Reviewer (wiring-reviewer)

**Verdict:** PASS_WITH_NOTES

- **WR-1, WR-2, WR-5, WR-6** (suggestion) — Fully wired: orphan branch → `BeadsAdapter`/`resolveStorageRoot()` consumers with named triggers and committed tests; `cli/index.mjs`'s existing install flow is a real, identifiable integration point.
- **WR-3** (warning) — The `main` `.gitignore` `.beads/` entry (BEH-5/BEH-7) has a vague trigger — "fresh-install scaffolding and the migration tool" names no concrete call site. `lib/gitignore-installer.mjs` (referenced from `cli/index.mjs`) looks like the natural integration point but isn't named.
- **WR-4** (warning) — `adev issues board migrate` (BEH-7/8/9) has no stated trigger for CLI reachability: `lib/cli/issues.mjs`'s existing dispatcher (`migrate`, `claim`, `release`, `stale`, `next`, `show`) has no `board` branch, and the spec never mentions adding one.

No blockers. Both warnings concern under-specified registration into existing dispatch mechanisms the spec doesn't cite by name.

## Boundary Reviewer (boundary-reviewer)

**Verdict:** FAIL

- **BD-1 (blocker, destructive-operation, section: behaviors)** — BEH-7's `.gitignore` edit never specifies write mechanics (append-if-absent vs. open-truncate-rewrite) against a shared, hand-editable file with no existing content-merge-safety contract in this repo (`assertContained` in `exec-payload.mjs` only governs path safety, not this). No blast radius or idempotency guard against a duplicate/negated entry is stated.
  `blocker_id: boundary-reviewer:destructive-operation:0d255ebd`
- **BD-2 (blocker, destructive-operation, section: error-cases)** — Migrate's failure-ordering guarantee ("push before main removal") doesn't cover the gap between physically removing `.beads/` and the subsequent `git worktree add` re-provisioning step: if that step fails, `.beads/` is gone from disk with no recovery path stated. The sibling `backend-migration.spec.md` already solved this exact class of problem with `.migrate-state.json` (atomic temp-rename, resumable checkpoint); this spec adopts none of that pattern.
  `blocker_id: boundary-reviewer:destructive-operation:223303cf`
- **BD-3** (warning) — The spec never states that the git/br subprocess calls must use argv arrays (matching the existing `execFileSync(...)` convention in `resolve-root.mjs`/`beads-adapter.mjs`). Not a live escape today (no adversarial input), but should be stated explicitly.
- **BD-4** (suggestion) — Consider requiring a dry-run report + explicit confirmation before the first live, irreversible push, mirroring `backend-migration`'s prompt-before-flipping-`tasks.backend` behavior.

Checklist items 1 (path containment) and 3 (input trust) pass cleanly — no untrusted/extension-supplied input drives any path in this spec.

## Heuristics — related prior lessons (signature-ranked)

The following heuristics are lessons learned from past work in this module, ranked with any exact matches for this blocker first. They are not necessarily prior occurrences of this blocker. Use them as guidance, not as hard rules.

### Heuristic: A universal coverage claim must ship with the predicate that checks it (confidence: medium)
- **Pattern:** When closing a coverage gap in a spec or acceptance criterion, state the executable check alongside the claim — the exact command or match, and the paths it runs over.
- **Anti-pattern:** Answer a repeatedly-missed surface by widening the assertion — "no occurrence anywhere in the repository."
- **Evidence:** 1 observation

*(Same `_global`-scope entry returned for all three blockers — the module's heuristics store carries no signature-specific matches for any of them; this is not evidence any of the three has occurred before.)*

## Summary

**Total findings:** 16 (3 blockers, 5 warnings, 8 suggestions)
**Action required:** This spec is BLOCKED. Run `/adev:specify --revise` against this spec to address the 3 blockers (RI-7, BD-1, BD-2) — the `.blockers.md` sidecar carries the canonical `blocker_id` for each. The 5 warnings and 8 suggestions are advisory; addressing them is not required to unblock, but several (CON-1's missing error codes, WR-3/WR-4's unnamed call sites) would strengthen the spec for `/adev:plan`.
