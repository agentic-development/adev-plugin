# Implementation Plan: Run Quality Gates

> **Methodology:** adev
> **Charter:** .context-index/specs/features/cicd/charter.md
> **Spec:** .context-index/specs/features/cicd/run-quality-gates.spec.md
> **Review:** PASS (2026-03-24)
> **Platform:** GitHub Actions, Node.js, npm

**Goal:** Create a GitHub Actions workflow that runs tests on every push and PR.

**Architecture:** Single workflow file `.github/workflows/ci.yml` with one job that checks out code, sets up Node.js, installs dependencies, and runs tests.

---

## File Structure

**Create:**
- `.github/workflows/ci.yml` — Main CI workflow configuration

---

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/cicd/run-quality-gates.spec.md` (all acceptance criteria)
- Charter: `.context-index/specs/features/cicd/charter.md` (capability: Run Quality Gates)
- Constitution: `.context-index/constitution.md` (principle: minimize external dependencies - CI config is exempt)

---

### Task 1: Create GitHub Actions CI Workflow [specialist: none]

**Charter capability:** Run Quality Gates
**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Write workflow configuration**
  ```yaml
  name: CI

  on:
    push:
      branches: [main, master]
    pull_request:
      branches: [main, master]

  jobs:
    test:
      runs-on: ubuntu-latest

      steps:
        - name: Checkout code
          uses: actions/checkout@v4

        - name: Setup Node.js
          uses: actions/setup-node@v4
          with:
            node-version: '20'
            cache: 'npm'

        - name: Install dependencies
          run: npm ci

        - name: Run tests
          run: npm test
  ```

- [ ] **Verify workflow is valid YAML**
  Run: `node -e "require('js-yaml').load(require('fs').readFileSync('.github/workflows/ci.yml'))"` (or use an online validator)

- [ ] **Commit**
  ```bash
  git add .github/workflows/ci.yml
  git commit -m "ci: add GitHub Actions workflow for quality gates"
  ```

---

## Quality Gates

After all tasks are complete, run the full quality gate suite:

- [ ] GitHub Actions workflow exists at `.github/workflows/ci.yml`
- [ ] Workflow runs on push to any branch
- [ ] Workflow runs on pull request events
- [ ] Workflow executes `npm test`
- [ ] Workflow passes when tests pass
- [ ] Workflow fails when tests fail
- [ ] Test results visible in GitHub PR check
- [ ] All acceptance criteria from spec satisfied

---

## Notes

- This is a configuration-only change (no runtime code)
- CI/CD configuration files are exempt from the "minimize external dependencies" principle as they run externally
- The workflow uses official GitHub Actions (actions/checkout, actions/setup-node)
- Node.js version 20 is specified to match the current LTS
