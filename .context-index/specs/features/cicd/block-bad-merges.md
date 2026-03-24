# Live Spec: Block Bad Merges

<!-- Live Spec within the cicd charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/cicd/charter.md -->

---
charter: cicd
status: review-pending
risk_level: medium
milestone: v1
created: 2026-03-24
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
