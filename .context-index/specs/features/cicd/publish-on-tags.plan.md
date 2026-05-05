# Implementation Plan: Publish on Tags

> **Methodology:** adev
> **Charter:** .context-index/specs/features/cicd/charter.md
> **Spec:** .context-index/specs/features/cicd/publish-on-tags.spec.md
> **Review:** PASS (2026-03-24)
> **Platform:** GitHub Actions, npm

**Goal:** Add release automation to publish package to npm on version tags.

**Architecture:** Add a release job to the existing `.github/workflows/ci.yml` that triggers on version tags and publishes to npm.

---

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/cicd/publish-on-tags.spec.md` (all acceptance criteria)
- Charter: `.context-index/specs/features/cicd/charter.md` (capability: Publish on Tags)
- Constitution: `.context-index/constitution.md` (principle: Version parity)

---

### Task 1: Add Release Job to CI Workflow [specialist: none]

**Charter capability:** Publish on Tags
**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Add release job to workflow**
  Add to `.github/workflows/ci.yml`:
  ```yaml
  release:
    if: startsWith(github.ref, 'refs/tags/v')
    needs: test
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Run tests
        run: npm test
        
      - name: Publish to npm
        run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
  ```

- [ ] **Verify workflow is valid YAML**
  Run: `node -e "require('js-yaml').load(require('fs').readFileSync('.github/workflows/ci.yml'))"`

- [ ] **Commit**
  ```bash
  git add .github/workflows/ci.yml
  git commit -m "ci: add release job for npm publishing on tags"
  ```

---

### Task 2: Configure NPM_TOKEN Secret [specialist: none]

**Prerequisite:** NPM_TOKEN must be configured in GitHub repository secrets.

- [ ] **Generate npm token**
  1. Go to https://www.npmjs.com/settings/{username}/tokens
  2. Generate new token with "Automation" type
  
- [ ] **Add secret to GitHub**
  1. Go to repository Settings → Secrets and variables → Actions
  2. Add new secret: NPM_TOKEN
  3. Paste the token value

- [ ] **Document requirement**
  Add to README.md or CONTRIBUTING.md:
  ```markdown
  ## Publishing
  
  To release a new version:
  1. Update version in package.json: npm version patch|minor|major
  2. Push tag: git push --follow-tags
  3. GitHub Actions will publish to npm automatically
  
  Requires NPM_TOKEN secret to be configured in GitHub repository.
  ```

---

### Task 3: Test Release Workflow [specialist: none]

- [ ] **Create test release**
  ```bash
  # Create a test version (use a beta version to avoid conflicts)
  npm version prerelease --preid=beta
  git push --follow-tags
  ```

- [ ] **Verify workflow runs**
  - Check GitHub Actions tab for release job
  - Verify it runs after test job completes

- [ ] **Verify package published**
  - Check npm package page for new version
  - Verify: `npm view adev-cli@beta` works

- [ ] **Clean up test version**
  - Unpublish test version from npm if needed

---

## Quality Gates

After all tasks are complete:

- [ ] Release workflow triggers on version tags (v*.*.*)
- [ ] Release workflow runs tests before publishing
- [ ] Package published to npm on successful workflow
- [ ] Workflow fails if tests fail
- [ ] Workflow fails if npm publish fails
- [ ] Published package installable via npm
- [ ] Version in npm matches git tag
- [ ] All acceptance criteria from spec satisfied

---

## Notes

- Release job only runs on version tags (v1.0.0, v1.0.1, etc.)
- Tests must pass before publishing (release job depends on test job)
- NPM_TOKEN must be configured as a GitHub secret
- Version parity principle: git tag version must match package.json version
