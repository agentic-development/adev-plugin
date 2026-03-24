# Live Spec: Run Quality Gates

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

- GitHub Actions workflow file exists at `.github/workflows/ci.yml`
- Project has valid `package.json` with test script
- Workflow is triggered on push to any branch or pull request

### Behaviors

1. **When** a push event occurs to any branch **then** GitHub Actions triggers the CI workflow
2. **When** the CI workflow runs **then** it executes `npm test` to run the test suite
3. **When** `npm test` completes with exit code 0 **then** the workflow job passes
4. **When** `npm test` completes with non-zero exit code **then** the workflow job fails
5. **When** a pull request is opened or updated **then** the CI workflow runs and reports status to GitHub

### Postconditions

- Workflow runs on every push and PR
- Test results are reported back to GitHub
- Failed tests block PR merging (via GitHub branch protection)

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| npm test fails | Workflow job fails with error output | N/A |
| Workflow file missing | GitHub Actions error | N/A |
| package.json missing | npm install fails, workflow fails | N/A |

## System Constitution Reference

- **Principle:** "Minimize external dependencies" — CI/CD is configuration, not runtime code. Uses official GitHub Actions (actions/checkout, actions/setup-node).
- **Principle:** "Pure ESM" — Project uses ESM, CI runs appropriate Node.js version.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Create GitHub Actions workflow | Create `.github/workflows/ci.yml` with test job | small |
| Configure Node.js setup | Add actions/setup-node with correct version | small |
| Add workflow triggers | Configure on push and pull_request | small |
| Test workflow | Verify workflow runs on push/PR | small |

## Acceptance Criteria

- [ ] GitHub Actions workflow exists at `.github/workflows/ci.yml`
- [ ] Workflow runs on push to any branch
- [ ] Workflow runs on pull request events
- [ ] Workflow executes `npm test`
- [ ] Workflow passes when tests pass
- [ ] Workflow fails when tests fail
- [ ] Test results visible in GitHub PR check
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
