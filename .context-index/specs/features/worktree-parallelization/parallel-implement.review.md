---
last-reviewed-revision: 2
file-sha: 83954f4628ec5d7495afc206cec7f1b30aa5427aa529301d9d477e972e765df2
---

# Architecture Review: parallel-implement

> **Date:** 2026-07-07
> **Spec:** .context-index/specs/features/worktree-parallelization/parallel-implement.spec.md
> **Charter:** .context-index/specs/features/worktree-parallelization/charter.md
> **Verdict:** PASS_WITH_NOTES

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reasoning | plugin:review-specs (bundled) |
| security-reviewer | Security Reviewer | subagent | capable | plugin:review-specs (bundled) |
| consistency-analyzer | Consistency Analyzer | subagent | fast | plugin:review-specs (bundled) |

## Structural Architect (structural-architect)

**Verdict:** PASS_WITH_NOTES

- [SA-1] warning: Commit-landing verification is "branch head advanced past base" — proves non-emptiness, not completeness. A group of N tasks that commits task 1 and drops tasks 2..N passes verification and merges as success, breaking "equivalent to serial." Specify a completeness check (all group tasks report done / expected commits present), so `COMMITS_NOT_VERIFIED` fires on partial commits.
- [SA-2] warning: The "subagent edits the MAIN tree by mistake" hole is half-closed. If a prompt-directed subagent commits to the orchestrator branch instead of its worktree, that group's branch verification fails (good), but the stray commit/dirty state on the **orchestrator branch** is never detected or reverted — post-join checks inspect only group branches. Add a mandatory post-join assertion that orchestrator HEAD == pre-dispatch baseline (and working tree clean) before any merge-back, else abort.
- [SA-3] suggestion: Concurrent bare subagents sharing one cwd only work if every git/file op is absolute (`git -C <worktree>` / absolute paths); relative ops would race on `index.lock`. Make the absolute-path/`-C` requirement explicit in the dispatch-prompt contract.
- [SA-4] suggestion: `skills/plan/SKILL.md` emits `## Parallelization` as free-form prose labeled *informational*/*(future)*, not machine-structured. Pin the exact grammar this spec parses and fall back to serial when the section is malformed (currently only "no section" triggers fallback).

## Security Reviewer (security-reviewer)

**Verdict:** PASS_WITH_NOTES

- [SEC-1] warning: `COMMITS_NOT_VERIFIED` (head advanced) is necessary but not sufficient for isolation — a stray main-tree/orchestrator-branch write is invisible to it. The equivalence-eval, not the commit-landing check, is the real correctness gate. State that verification is a sanity check (not a corruption barrier) and that the eval is load-bearing.
- [SEC-2] warning: Deterministic slug + idempotent `add` (returns existing worktree) + retained failed worktrees interact badly: re-running `--parallel` after a partial failure re-dispatches into the retained worktree carrying the failed run's partial commits → double-apply or stale-state merge → wrong result. Address re-run collision with retained worktrees (e.g., require clean/removed worktree before re-dispatch, or a distinct retry slug).
- [SEC-3] suggestion: Retained-on-failure worktrees have no GC/prune path (primitive coverage gaps: no recovery verb, no auto-removal); repeated failures leak `.adev/worktrees/` dirs + dangling `adev/*` branches, contradicting the Reliability attribute.
- [SEC-4] suggestion: "board never left half-updated" holds at cross-group granularity but not intra-group (merge-then-mark-done is two steps; a crash between leaves tasks open while code is merged). Reword to the granularity actually provided.
- [SEC-5] suggestion: `implement.max_parallel` is read but not validated; specify a floor (≥1) and clamp (mirror the `cas_lock_stale_seconds` floor pattern).

Concurrent board writes are adequately handled — `JsonAdapter` has orphan-lock recovery (`cas_lock_stale_seconds`, floor 5) on `O_EXCL` EEXIST; no deadlock/orphan-lock risk.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

- [CON-1] suggestion: Spec merges "into the orchestrator branch," but the primitive merges into the caller's current branch (implicit HEAD). Make the precondition explicit (orchestrator invokes merge from a context whose HEAD is the orchestrator branch).
- [CON-2] suggestion: The primitive defers the `.adev/worktrees/` git-ignore guarantee to "this spec or setup"; this spec never claims it (no task/AC). The handoff is currently unclaimed.
- [CON-3] suggestion: Error table mixes primitive-owned codes ("from primitive") with new codes (`GROUP_FAILED`, `COMMITS_NOT_VERIFIED`); add a one-line provenance legend.

Charter invariants honored (bare directed subagents, per-worktree commits on `adev/<slug>`, join-before-merge, result-equivalence); prompt-directed cwd fork correctly resolved; primitive API usage faithful; Out of Scope respected (group detection consumed not computed; per-task TDD left to `implementation`). Frontmatter well-formed (`charter-revision: 2`).

---

## Summary

**Total findings:** 12 (0 blockers, 4 warnings, 8 suggestions)
**Action required:** None blocking — spec is ready for planning. But the 4 warnings are correctness-critical for "parallel ≡ serial" and are strongly recommended before implementation: SA-1 (verify completeness, not just head-advance), SA-2 (assert orchestrator branch unpolluted post-join), SEC-1 (name the eval as the real gate; verification is a sanity check), SEC-2 (handle re-run collision with retained worktrees).


## Re-Review (rev 2)

rev 2 re-review: SA-1 (completeness), SA-2 (orchestrator-pollution), SEC-1 (eval-is-the-gate), SEC-2 (re-run collision) ALL RESOLVED; removal-timing reconciled. Verdict: PASS_WITH_NOTES (substantive warnings resolved; status review-passed at rev 2).
