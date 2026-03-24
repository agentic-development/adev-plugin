# Live Spec: Publish on Tags

<!-- Live Spec within the cicd charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/cicd/charter.md -->

---
charter: cicd
status: review-passed
risk_level: medium
milestone: v1
created: 2026-03-24
---

## Behavioral Contract

### Preconditions

- Package is published to npm registry
- NPM_TOKEN secret is configured in GitHub repository secrets
- Version in package.json follows semver (e.g., 1.0.0)

### Behaviors

1. **When** a git tag matching pattern `v*.*.*` is pushed **then** GitHub Actions triggers the release workflow
2. **When** the release workflow runs **then** it checks out the code and sets up Node.js
3. **When** the release workflow runs **then** it installs dependencies and runs tests
4. **When** tests pass **then** it runs `npm publish` to publish to npm
5. **When** npm publish succeeds **then** the package is available on npm registry
6. **When** npm publish fails **then** workflow fails with error message

### Postconditions

- Package published to npm on every version tag
- Version tag matches package.json version
- Published package is accessible via `npm install <package-name>`

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| NPM_TOKEN missing | Workflow fails at publish step | N/A |
| Version already exists on npm | npm publish fails with 403 | E403 |
| Tests fail on release branch | Workflow fails, no publish | N/A |
| Invalid semver tag format | Workflow triggers but fails | N/A |

## System Constitution Reference

- **Principle:** "Minimize external dependencies" — Uses official GitHub Actions and npm CLI.
- **Principle:** "Version parity" — Release process ensures version consistency.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Add release job to workflow | Create release job in ci.yml | small |
| Configure npm token | Add NPM_TOKEN to GitHub secrets | medium |
| Add tag trigger | Configure on push tags | small |
| Test release workflow | Create test tag and verify publish | medium |

## Acceptance Criteria

- [ ] Release workflow triggers on version tags (v*.*.*)
- [ ] Release workflow runs tests before publishing
- [ ] Package published to npm on successful workflow
- [ ] Workflow fails if tests fail
- [ ] Workflow fails if npm publish fails
- [ ] Published package installable via npm
- [ ] Version in npm matches git tag
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
