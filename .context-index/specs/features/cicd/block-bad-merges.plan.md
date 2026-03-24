# Implementation Plan: Block Bad Merges

> **Methodology:** adev
> **Charter:** .context-index/specs/features/cicd/charter.md
> **Spec:** .context-index/specs/features/cicd/block-bad-merges.md
> **Review:** PASS (2026-03-24)
> **Platform:** GitHub

**Goal:** Configure branch protection on main to require CI to pass before merging.

**Architecture:** GitHub branch protection rules (configured via GitHub UI or API, not code).

---

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/cicd/block-bad-merges.md` (all acceptance criteria)
- Charter: `.context-index/specs/features/cicd/charter.md` (capability: Block Bad Merges)
- Constitution: `.context-index/constitution.md`

---

### Task 1: Configure Branch Protection [specialist: none]

**Charter capability:** Block Bad Merges
**Files:**
- N/A (GitHub UI configuration)

**Note:** This task requires manual configuration via GitHub UI or API. It cannot be done via code in the repository.

- [ ] **Configure branch protection rules via GitHub UI**
  1. Go to repository Settings → Branches → Branch protection rules
  2. Create rule for "main" (and "master" if exists)
  3. Enable "Require status checks to pass before merging"
  4. Select "CI" status check (from the workflow)
  5. Enable "Require branches to be up to date"

  Alternatively, using GitHub CLI:
  ```bash
  gh api repos/{owner}/{repo}/protection -X PUT \
    --json required_status_checks,require_up_to_date_branches,restrictions
  ```

- [ ] **Verify configuration**
  - Create a test PR with failing tests
  - Confirm merge button is blocked
  - Fix the tests
  - Confirm merge button is enabled

- [ ] **Document configuration**
  Add to README.md or CONTRIBUTING.md:
  ```markdown
  ## Branch Protection
  
  The main branch is protected. CI must pass before merging.
  ```

---

## Quality Gates

After all tasks are complete:

- [ ] Branch protection enabled on main branch
- [ ] CI workflow required to pass before merge
- [ ] Merge blocked when tests fail
- [ ] Merge allowed when tests pass

---

## Notes

- Branch protection is a GitHub UI/API configuration, not code
- This requires repository admin access
- The CI workflow (run-quality-gates) must be working before this can be tested
- Admin can still override branch protection rules if needed
