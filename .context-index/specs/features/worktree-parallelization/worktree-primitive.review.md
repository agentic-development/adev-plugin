---
last-reviewed-revision: 2
file-sha: 5082d2e17c26c1221aeae57d473de8899fee2aa85cd9689b92190d6e59531356
---

# Architecture Review: worktree-primitive

> **Date:** 2026-07-07
> **Spec:** .context-index/specs/features/worktree-parallelization/worktree-primitive.spec.md
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

- [SA-1] warning: Behavioral contract says `merge` integrates "into the caller's current branch," but the code runs `git merge` in `mainRoot`, so the target is the main root's checked-out HEAD. Coverage Gap #3 acknowledges this — the spec contradicts itself. Tighten the WHEN clause to "main root's current branch." (merge target is load-bearing for orchestrator correctness)
- [SA-2] suggestion: A non-git-repo cwd (or `resolveMainRoot` git failure) surfaces a raw `execFileSync` error, not a `WorktreeError`; the un-wrapped failure mode is undocumented.
- [SA-3] suggestion: Exported surface `worktreePathFor`, `WORKTREE_SUBDIR`, `BRANCH_PREFIX` not enumerated in the spec/charter API list. Otherwise behaviors, error codes, idempotency, branch-reuse, nesting-anchor, list-filtering all match the code; 20-test count accurate.

## Security Reviewer (security-reviewer)

**Verdict:** PASS_WITH_NOTES

- [SEC-1] warning: `baseRef` is passed to `git worktree add … <base>` without validation or a `--` separator. A `baseRef` starting with `-` could be parsed as a git option (argument injection). Harden by rejecting leading-dash baseRef or inserting `--` before positionals. Low real-world risk — operator-controlled, local dev CLI, not network-reachable.
- [SEC-2] suggestion: Coverage Gap "no `.gitignore` guarantee" means retained worktrees under `.adev/worktrees/` may not be ignored; guarantee the managed ignore block so they can't leak into commits.
- [SEC-3] suggestion: Slug guard relies on the single `worktreePathFor` chokepoint; keep all slug-taking ops routed through it (assertion-coverage test) so a future direct-path helper can't regress it.

Verified sound: slug validation blocks traversal/option/shell injection; `execFileSync` array args are safe; path containment enforced; branch deletion not destructive-by-default.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

- [CON-1] suggestion: `SLUG_RE` rendered as `` `^[a-z0-9][a-z0-9._-]{0,99}$/i` `` (trailing `/i`, no leading `/`) is a malformed regex-literal representation; clarify.
- [CON-2] suggestion: Charter lists `resolveMainRoot` as an exposed function; the spec describes the mechanism inline without naming it in a behavior/API line.
- [CON-3] suggestion: Sibling spec uses `STALE_BOARD_WRITE_RETRY` while the charter Invariant says `STALE_BOARD_WRITE`; reconcile (out of scope for this primitive spec — `lib/issues` domain).

Matches charter Domain Model, Invariants, Interface Contracts; consumes cleanly into parallel-implement; frontmatter well-formed.

---

## Summary

**Total findings:** 9 (0 blockers, 2 warnings, 7 suggestions)
**Action required:** None blocking. Spec is ready for planning. The two warnings (SA-1 merge-target wording; SEC-1 baseRef hardening) are worth folding in — SA-1 is a spec edit, SEC-1 is a small code hardening for `/adev:implement` to pick up.


## Re-Review (rev 2)

rev 2 re-review: SA-1 (merge-target wording) + SEC-1 (baseRef gap) RESOLVED. Only cosmetic suggestions remain. Verdict: PASS_WITH_NOTES (substantive warnings resolved; status review-passed at rev 2).
