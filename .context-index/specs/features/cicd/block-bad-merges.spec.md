# Live Spec: Block Bad Merges

<!-- Live Spec within the cicd charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/cicd/charter.md -->

---
charter: cicd
status: validated
risk_level: medium
milestone:
revision: 2
charter-revision: 1
created: 2026-03-24
updated: 2026-08-13
source-manifest:
  sha: "926422e"
  files:
    - .github/workflows/ci.yml
    - hooks/merge-guard.sh
    - tests/hooks/merge-guard.test.mjs
  computed-at: "2025-04-25T00:00:00.000Z"
drift_detected: true
---

## Behavioral Contract

### Preconditions

- GitHub repository exists with admin access to configure branch protection
- CI workflow (run-quality-gates) is set up and working
- Branch protection rules can be configured

### Behaviors

1. **When** branch protection is enabled on main branch **then** required status checks must pass before merging
2. **When** a PR targets main branch **then** CI status checks must be successful
3. **When** CI checks fail **then** GitHub blocks the merge UI
4. **When** all CI checks pass **then** merge button becomes available

**Local guard — `hooks/merge-guard.sh` (rev 2):**

> Added 2026-08-13. Two defects, both found by the guard firing on commands it was never meant to catch.

5. **When** the command is `git merge-base`, `git merge-tree`, or `git merge-file` **then** it is ALLOWED even on a protected branch. These write nothing. The prior pattern `git\s+merge\b` matched them because `-` is a word boundary, so read-only queries were refused; a guard that blocks queries teaches operators that it cries wolf.
6. **When** the command is `gh pr merge` **then** it is blocked by default and allowed when `completion.allow_agent_pr_merge: true`. Only the exact literal `true` opts in.
7. **When** a `gh pr merge` is refused **then** the message names the base the command actually targets (from `--base`, else the first protected branch) and points at `allow_agent_pr_merge`. Previously the clause sat inside a loop over protected branches and ignored the loop variable, so EVERY `gh pr merge` was refused — including one targeting a non-protected base, e.g. a stacked PR onto another feature branch — and the error named a branch the PR never targeted, while advising "open a pull request instead", which cannot be acted on when the command *is* a PR merge.

### Known limitation — string matching, not command parsing

The guard greps the raw command string, so it fires on any text containing a
matched pattern, including a heredoc or a commit message that merely *mentions*
one. This is not hypothetical: the commit implementing behaviors 5-7 was itself
refused, because its message quotes the very command it fixes.

Not addressed here — distinguishing a real invocation from a quoted mention
needs shell parsing, which is a larger change than this contract should carry,
and the false-positive class is narrow (prose about git commands). Workaround:
pass long messages with `git commit -F <file>` so the text never enters the
command string. Recorded so the next person hitting it does not re-diagnose it.

### Postconditions

- Main branch has branch protection enabled
- CI must pass before merge is allowed
- Administrators can override (if configured)

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| No branch protection configured | Merge allowed without CI passing | N/A |
| Required check missing | GitHub allows merge anyway | N/A |
| CI never runs on PR | No status check to require | N/A |

## System Constitution Reference

- **Principle:** "Minimize external dependencies" — Uses GitHub's native branch protection, no extra tools needed.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Configure branch protection | Add branch protection rule for main | small |
| Require status checks | Set CI check as required | small |
| Test protection | Verify merge blocked when CI fails | small |

## Acceptance Criteria

- [ ] Branch protection enabled on main branch
- [ ] CI workflow required to pass before merge
- [ ] Merge blocked when tests fail
- [ ] Merge allowed when tests pass
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
