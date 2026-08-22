---
spec: .context-index/specs/features/task-management/beads-board-git-topology.spec.md
charter: .context-index/specs/features/task-management/charter.md
verdict: BLOCK
reviewers:
  - id: consistency-analyzer
    mode: subagent
    profile: reviewer-fast
    prompt: plugin:review-specs/consistency-analyzer-prompt.md
    verdict: PASS
  - id: referent-integrity
    mode: subagent
    profile: reviewer-reasoning
    prompt: plugin:review-specs/referent-integrity-prompt.md
    verdict: PASS
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
last-reviewed-revision: 3
file-sha: 0b46e789361b119b587122816d10c0842082e75196340cdee090cf8419db75b1
review-date: 2026-08-22
rigor-tier: full
---

# Architecture Review: beads-board-git-topology (revision 3)

> **Date:** 2026-08-22
> **Spec:** `.context-index/specs/features/task-management/beads-board-git-topology.spec.md`
> **Charter:** `.context-index/specs/features/task-management/charter.md`
> **Verdict:** BLOCK

Real progress: revision 2's fixes were verified against source this time before writing, and it shows — 6 blocker findings down to 1. Both Consistency Analyzer and Referent Integrity independently confirmed every prior finding resolved with zero new issues. Boundary Reviewer confirmed its two prior blockers (BD-1 mismatch, BD-3 location) fixed, but caught one new gap: the corrupt-leftover `.beads/` cleanup step never states its deletion mechanism, and a plain filesystem delete would leave stale `.git/worktrees/.beads` metadata that blocks the very `git worktree add` retry this step exists to enable — grounded in this repo's own `lib/worktree.mjs::remove()` precedent (`git worktree remove`, not `rm -rf`).

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |
| referent-integrity | Referent Integrity Reviewer | subagent | reviewer-reasoning | plugin:review-specs/referent-integrity-prompt.md |
| wiring-reviewer | Wiring Reviewer | subagent | reviewer-capable | plugin:review-specs/wiring-reviewer-prompt.md |
| boundary-reviewer | Boundary Reviewer | subagent | reviewer-capable | plugin:review-specs/boundary-reviewer-prompt.md |

Rigor tier: **full** (unchanged — `risk_level: medium`). `termination-reviewer` not dispatched (no trigger keywords).

## Disabled Reviewers

| ID | Reason |
|----|--------|
| structural-architect | Disabled as part of the reviewer-domain-fit initiative. |
| security-reviewer | Disabled as part of the reviewer-domain-fit initiative. |

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS

Both revision-2 blockers confirmed resolved by direct source read: `ensureManagedBlock()`'s whole-block-splice/`"noop"` behavior matches `lib/gitignore-installer.mjs:234-241` exactly; the checkpoint's `.context-index/tasks/.board-migrate-state.json` location and lifecycle match the real `.migrate-state.json` precedent (`lib/gitignore-paths.mjs:62-65`, `lib/cli/issues-migrate.mjs:32`). Also independently verified: the 8-subcommand dispatcher list, the `setup/managed-gitignore-block.spec.md` owning-spec attribution, the `.adev/` precedent entry, and naming-convention consistency (`issues-board.mjs`, `BOARD_*` error codes). No findings.

## Referent Integrity Reviewer (referent-integrity)

**Verdict:** PASS

Six referents checked, all verified accurate: `ensureManagedBlock()`'s real behavior, the 8-subcommand dispatcher (noting the spec correctly cites the `run()` body rather than the file's stale header comment), the `MANAGED_GITIGNORE_PATHS` precedent entries, `backend-migration.spec.md` Behaviors 17-18, the `setup/managed-gitignore-block.spec.md` owning-spec citation, and the subprocess-safety convention. No findings.

## Wiring Reviewer (wiring-reviewer)

**Verdict:** PASS_WITH_NOTES

All four revision-2 findings (WR-1 through WR-4) confirmed resolved by source. `lib/cli/issues-board.mjs` and its dispatcher branch correctly do not exist yet — the spec scopes this as Task Map work, not a false claim.

- **WR-5** (suggestion) — The "Orphan-branch bootstrap helper" Task Map row doesn't explicitly name its two callers (`cli/index.mjs` bootstrap, `lib/cli/issues-board.mjs`), unlike every other row.

## Boundary Reviewer (boundary-reviewer)

**Verdict:** FAIL

Confirmed against `lib/worktree.mjs`, `lib/gitignore-installer.mjs`, `lib/gitignore-paths.mjs`, `lib/cli/issues-migrate.mjs`, and `backend-migration.spec.md`. Revision-2's BD-1 (`ensureManagedBlock` mismatch) and BD-3 (checkpoint location) are both genuinely fixed, field-for-field.

- **BD-1 (new blocker, unstated-recovery-mechanism, section: error-cases)** — The partial-failure error case says a corrupt leftover `.beads/` "is deleted first, then `git worktree add` runs," but never states the deletion mechanism. This repo's only existing worktree-teardown code, `lib/worktree.mjs::remove()`, uses `git worktree remove [--force]` specifically because a plain filesystem delete leaves stale admin state in `.git/worktrees/.beads` that then makes a later `git worktree add` at that path fail — exactly the scenario this recovery step exists to handle. Neither the spec nor its Task Map mentions `git worktree prune` anywhere.
  `blocker_id: boundary-reviewer:unstated-recovery-mechanism:ff4eb37d`

Items 1–4 (path containment, subprocess interpolation, input trust, privilege posture) and item 5 (artifact leakage, fixed from revision 2) all pass cleanly.

## Heuristics — related prior lessons (signature-ranked)

The following heuristics are lessons learned from past work in this module, ranked with any exact matches for this blocker first. They are not necessarily prior occurrences of this blocker. Use them as guidance, not as hard rules.

### Heuristic: A universal coverage claim must ship with the predicate that checks it (confidence: medium)
- **Pattern:** When closing a coverage gap in a spec or acceptance criterion, state the executable check alongside the claim.
- **Anti-pattern:** Answer a repeatedly-missed surface by widening the assertion.
- **Evidence:** 1 observation

*(Generic `_global`-scope entry, no signature-specific match. Not evidence this has occurred before.)*

## Summary

**Total findings:** 2 (1 blocker, 1 suggestion)
**Action required:** One blocker remains. Fix: specify the exact recovery sequence for a corrupt leftover `.beads/` — raw filesystem removal followed by `git worktree prune` to clear stale `.git/worktrees/.beads` registration, before `git worktree add .beads beads-board` retries. Add a test fixture simulating the interrupted-removal state to prove the retry path actually succeeds. This is the last remaining gap; everything else has now been independently verified against source by all four reviewers.
