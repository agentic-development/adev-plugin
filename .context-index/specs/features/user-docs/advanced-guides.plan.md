<!-- DO NOT EDIT statuses inline — see lifecycle log advanced-guides.jsonl -->
# Implementation Plan: Advanced Guides

> **Methodology:** adev
> **Charter:** .context-index/specs/features/user-docs/charter.md
> **Spec:** .context-index/specs/features/user-docs/advanced-guides.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-09)
> **Platform:** Node.js, JavaScript (ESM), npm

**Goal:** Absorb and reorganize the existing advanced guide pages — workspaces, governance, and test strategies — into the new documentation structure. Each existing file is rewritten in place (same filename), improved with prerequisites, cross-links to reference pages, and structural consistency. No content is silently dropped.

**Architecture:** Pure markdown documentation files in `docs/`. No build step, no site generator, no external dependencies. The three files already exist and are rewritten in place — filenames do not change. Content is sourced from the existing docs, actual governance YAML files, workspace configuration, and test strategy profiles.

**Review notes to address during implementation:**
- SA-1 / CON-7: Rewrites are in-place (same filenames retained) — not remove-and-recreate
- SEC-5: Migration recipe examples should use anonymized/synthetic configurations

---

## File Structure

**Modify (rewrite in place):**
- `docs/workspaces.md` — Reorganized workspace guide with prerequisites and cross-links
- `docs/governance.md` — Reorganized governance guide with prerequisites and cross-links
- `docs/test-strategies.md` — Reorganized test strategies guide with prerequisites and cross-links
- `docs/README.md` — Ensure all three guides are linked under Advanced section

**Create:**
- `tests/docs/advanced-guides.test.mjs` — Tests for all three guides

**Reference (read, do not modify):**
- `.context-index/constitution.md` — Principles referenced by governance guide
- `.context-index/manifest.yaml` — Configuration examples for test strategies
- `skills/*/SKILL.md` — Skill names for cross-linking
- `docs/README.md` — TOC structure to verify links

## Content Absorption Strategy

Each guide is rewritten in place. The implementer must:
1. Read the existing file completely before rewriting
2. Create a content checklist of every concept, section, code example, and FAQ entry
3. Verify every item on the checklist appears in the new version (or is explicitly superseded with a note in the commit message)
4. Stale content that contradicts current behavior is corrected, not silently dropped (STALE_CONTENT error case)

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/user-docs/advanced-guides.spec.md` (criteria 1, 4, 7)
- Existing content: `docs/workspaces.md` (full file — absorb everything)
- Charter: `.context-index/specs/features/user-docs/charter.md` (capability: Workspaces Guide)

### Task 2 Context
- Spec: `.context-index/specs/features/user-docs/advanced-guides.spec.md` (criteria 2, 4, 7)
- Existing content: `docs/governance.md` (full file — absorb everything, including 5 migration recipes)
- Charter: `.context-index/specs/features/user-docs/charter.md` (capability: Governance Guide)
- Review note: SEC-5 — use anonymized/synthetic configurations in migration recipe examples

### Task 3 Context
- Spec: `.context-index/specs/features/user-docs/advanced-guides.spec.md` (criteria 3, 4, 7)
- Existing content: `docs/test-strategies.md` (full file — absorb everything, including all 9 strategies)
- Charter: `.context-index/specs/features/user-docs/charter.md` (capability: Test Strategies Guide)

### Task 4 Context
- Spec: `.context-index/specs/features/user-docs/advanced-guides.spec.md` (criteria 5)
- Reference: all three rewritten guide files and `docs/README.md`
- Existing reference pages: `docs/skills.md` (for skill cross-links)

### Task 5 Context
- Spec: `.context-index/specs/features/user-docs/advanced-guides.spec.md` (criteria 6)
- Reference: all three rewritten guide files and `docs/README.md`

## Parallelization

- Group A (independent): Task 1 (workspaces guide)
- Group B (independent): Task 2 (governance guide)
- Group C (independent): Task 3 (test strategies guide)
- Group D (sequential, after A+B+C): Task 4 (cross-links verification)
- Group E (sequential, after D): Task 5 (TOC link verification)

Tasks 1, 2, and 3 can run in parallel. Task 4 depends on all three. Task 5 runs last.

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Absorb and rewrite docs/workspaces.md | medium | unit | — | 1 modify, 1 create (test) |
| 2 | Absorb and rewrite docs/governance.md | large | unit | — | 1 modify |
| 3 | Absorb and rewrite docs/test-strategies.md | large | unit | — | 1 modify |
| 4 | Add cross-links to reference pages | small | unit | Task 1, 2, 3 | 3 modify |
| 5 | Verify TOC links and prerequisites | small | unit | Task 4 | 1 modify (README.md if needed) |

---

### Task 1: Absorb and rewrite docs/workspaces.md [specialist: none]

**Charter capability:** Workspaces Guide
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `docs/workspaces.md`
- Create: `tests/docs/advanced-guides.test.mjs`

**Tests:** `tests/docs/advanced-guides.test.mjs`

- [x] **Write failing test**

```javascript
import { describe, it } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert';

const DOCS_DIR = join(import.meta.dirname, '..', '..', 'docs');

describe('docs/workspaces.md — Workspaces Guide', () => {
  it('should exist', () => {
    assert.ok(existsSync(join(DOCS_DIR, 'workspaces.md')));
  });

  it('should have a prerequisites section', () => {
    const content = readFileSync(join(DOCS_DIR, 'workspaces.md'), 'utf-8');
    assert.ok(
      content.includes('Prerequisites') || content.includes('prerequisites') || content.includes('Before you begin'),
      'Missing prerequisites section'
    );
  });

  it('should explain when to use workspaces', () => {
    const content = readFileSync(join(DOCS_DIR, 'workspaces.md'), 'utf-8');
    assert.ok(content.includes('When to use'), 'Missing when-to-use section');
  });

  it('should explain how to set up a workspace', () => {
    const content = readFileSync(join(DOCS_DIR, 'workspaces.md'), 'utf-8');
    assert.ok(
      content.includes('adev-workspace.yaml'),
      'Missing workspace YAML reference'
    );
  });

  it('should cover cross-repo features', () => {
    const content = readFileSync(join(DOCS_DIR, 'workspaces.md'), 'utf-8');
    assert.ok(content.includes('cross-repo') || content.includes('Cross-repo'), 'Missing cross-repo content');
  });

  it('should cover dependency-aware planning', () => {
    const content = readFileSync(join(DOCS_DIR, 'workspaces.md'), 'utf-8');
    assert.ok(
      content.includes('dependency') || content.includes('Dependency'),
      'Missing dependency-aware planning'
    );
  });

  it('should document common patterns', () => {
    const content = readFileSync(join(DOCS_DIR, 'workspaces.md'), 'utf-8');
    assert.ok(content.includes('Pattern'), 'Missing common patterns');
  });

  it('should state limitations explicitly', () => {
    const content = readFileSync(join(DOCS_DIR, 'workspaces.md'), 'utf-8');
    assert.ok(
      content.includes('NOT do') || content.includes('Limitations') || content.includes('limitations'),
      'Missing limitations section'
    );
  });

  it('should preserve FAQ entries from original', () => {
    const content = readFileSync(join(DOCS_DIR, 'workspaces.md'), 'utf-8');
    assert.ok(content.includes('FAQ') || content.includes('Frequently'), 'Missing FAQ section');
  });

  it('should preserve brownfield adoption guidance from original', () => {
    const content = readFileSync(join(DOCS_DIR, 'workspaces.md'), 'utf-8');
    assert.ok(
      content.includes('brownfield') || content.includes('Brownfield') || content.includes('existing repos'),
      'Missing brownfield adoption guidance'
    );
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/docs/advanced-guides.test.mjs`
Expected: Some tests may pass since the file exists; the prerequisites test should fail.

- [x] **Implement**

Rewrite `docs/workspaces.md` in place. Read the existing file first and verify every section is preserved:

**Content absorption checklist (from existing file):**
- [ ] Title and intro paragraph
- [ ] "When to use a workspace" section (use cases and skip cases)
- [ ] "How it works" section with directory structure diagram
- [ ] "Setting up a workspace" section with brownfield adoption guidance
- [ ] adev-workspace.yaml full example with repos and dependencies
- [ ] "Using a workspace" section (cross-repo features, brainstorm, specify)
- [ ] Cross-repo reference validation (`@repo-slug/spec-slug` syntax)
- [ ] Dependency-aware planning with phase example
- [ ] Workspace-level product bootstrap
- [ ] Release and milestone planning
- [ ] Running inside a registered repo (repo-scoped advisory)
- [ ] Workspace status output example
- [ ] Common patterns (3 patterns)
- [ ] "What workspaces do NOT do" (5 limitations)
- [ ] FAQ (5 questions)
- [ ] Reference link to workspace charter

**New structure:**
1. Title: "Multi-Repo Workspaces"
2. **Prerequisites** section — state that the reader should be familiar with adev concepts and have completed the Getting Started tutorial; link to `concepts.md` and `getting-started.md`
3. All existing content reorganized under clear headings
4. Cross-links to skill reference entries where skills are mentioned (e.g., `/adev:brainstorm` links to skill reference)

- [x] **Verify test passes**

Run: `node --test tests/docs/advanced-guides.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add docs/workspaces.md tests/docs/advanced-guides.test.mjs
git commit -m "feat(user-docs): absorb and rewrite docs/workspaces.md with prerequisites

Spec: .context-index/specs/features/user-docs/advanced-guides.spec.md
Plan-task: 1"
```

---

### Task 2: Absorb and rewrite docs/governance.md [specialist: none]

**Charter capability:** Governance Guide
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `docs/governance.md`
- Modify: `tests/docs/advanced-guides.test.mjs`

**Tests:** `tests/docs/advanced-guides.test.mjs`

- [x] **Write failing test**

Add to `tests/docs/advanced-guides.test.mjs`:

```javascript
describe('docs/governance.md — Governance Guide', () => {
  it('should exist', () => {
    assert.ok(existsSync(join(DOCS_DIR, 'governance.md')));
  });

  it('should have a prerequisites section', () => {
    const content = readFileSync(join(DOCS_DIR, 'governance.md'), 'utf-8');
    assert.ok(
      content.includes('Prerequisites') || content.includes('prerequisites') || content.includes('Before you begin'),
      'Missing prerequisites section'
    );
  });

  it('should document the four governance files', () => {
    const content = readFileSync(join(DOCS_DIR, 'governance.md'), 'utf-8');
    assert.ok(content.includes('gates.yaml'), 'Missing gates.yaml');
    assert.ok(content.includes('review.yaml'), 'Missing review.yaml');
    assert.ok(content.includes('validate.yaml'), 'Missing validate.yaml');
    assert.ok(content.includes('profiles.yaml'), 'Missing profiles.yaml');
  });

  it('should document execution profiles', () => {
    const content = readFileSync(join(DOCS_DIR, 'governance.md'), 'utf-8');
    assert.ok(content.includes('profile') || content.includes('Profile'), 'Missing profiles documentation');
  });

  it('should document the reviewer registry', () => {
    const content = readFileSync(join(DOCS_DIR, 'governance.md'), 'utf-8');
    assert.ok(content.includes('reviewer') || content.includes('Reviewer'), 'Missing reviewer registry docs');
  });

  it('should document the validation check registry', () => {
    const content = readFileSync(join(DOCS_DIR, 'governance.md'), 'utf-8');
    assert.ok(content.includes('validate') || content.includes('Validate'), 'Missing validation check docs');
  });

  it('should include migration recipes', () => {
    const content = readFileSync(join(DOCS_DIR, 'governance.md'), 'utf-8');
    assert.ok(content.includes('Recipe 1'), 'Missing migration Recipe 1');
    assert.ok(content.includes('Recipe 2'), 'Missing migration Recipe 2');
    assert.ok(content.includes('Recipe 3'), 'Missing migration Recipe 3');
    assert.ok(content.includes('Recipe 4'), 'Missing migration Recipe 4');
    assert.ok(content.includes('Recipe 5'), 'Missing migration Recipe 5');
  });

  it('should include verification steps for migration', () => {
    const content = readFileSync(join(DOCS_DIR, 'governance.md'), 'utf-8');
    assert.ok(
      content.includes('Verifying') || content.includes('verifying') || content.includes('verification'),
      'Missing verification steps'
    );
  });

  it('should preserve bundled profiles table from original', () => {
    const content = readFileSync(join(DOCS_DIR, 'governance.md'), 'utf-8');
    assert.ok(content.includes('read-only'), 'Missing read-only profile');
    assert.ok(content.includes('reviewer-fast'), 'Missing reviewer-fast profile');
    assert.ok(content.includes('reviewer-capable'), 'Missing reviewer-capable profile');
    assert.ok(content.includes('reviewer-reasoning'), 'Missing reviewer-reasoning profile');
  });

  it('should preserve context packs documentation from original', () => {
    const content = readFileSync(join(DOCS_DIR, 'governance.md'), 'utf-8');
    assert.ok(content.includes('context_packs') || content.includes('Context packs') || content.includes('Context Packs'), 'Missing context packs docs');
  });

  it('should use anonymized configuration in examples (SEC-5)', () => {
    const content = readFileSync(join(DOCS_DIR, 'governance.md'), 'utf-8');
    // Should not contain real-looking secrets or API keys
    assert.ok(!content.match(/sk-[a-zA-Z0-9]{32,}/), 'Contains real-looking API key');
    assert.ok(!content.match(/AKIA[A-Z0-9]{16}/), 'Contains real-looking AWS access key');
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/docs/advanced-guides.test.mjs`
Expected: Prerequisites test should fail (existing file lacks this section).

- [x] **Implement**

Rewrite `docs/governance.md` in place. Read the existing file first and verify every section is preserved:

**Content absorption checklist (from existing file):**
- [ ] Title and intro with /adev:init Step 7 note
- [ ] Brownfield upgrade note
- [ ] Zero-config is fine note
- [ ] Four governance files table (gates.yaml, review.yaml, validate.yaml, profiles.yaml)
- [ ] Profiles section — description, bundled profiles table (6 profiles)
- [ ] Project profile overlay with full YAML example
- [ ] Key rules (env.files, $workspace sigil, tool restrictions, allow_add, redaction)
- [ ] Reviewer registry section — loader behavior
- [ ] Common overrides (disable reviewer, cap severity, add triggered reviewer, package mode)
- [ ] Context packs section with YAML example and hard denylist
- [ ] Guardrails applied at load (3 rules)
- [ ] Validate check registry section
- [ ] Check kinds table (4 kinds)
- [ ] Common overrides (disable check, add quality-gate, add subagent-review, add observational)
- [ ] Quality-gate hardening (5 enforcement rules)
- [ ] Ordering (topological by after: field)
- [ ] Migration recipes 1-5 (all with before/after code examples)
- [ ] Verifying your migration (5 steps)
- [ ] Further reading links

**New structure:**
1. Title: "Governance Reference"
2. **Prerequisites** section — state that the reader should understand the lifecycle, review, and validate skills; link to relevant workflow guide pages
3. All existing content reorganized — the current structure is already well-organized, so primarily add prerequisites and cross-links
4. Ensure migration recipe examples use anonymized/synthetic configurations (SEC-5)

- [x] **Verify test passes**

Run: `node --test tests/docs/advanced-guides.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add docs/governance.md tests/docs/advanced-guides.test.mjs
git commit -m "feat(user-docs): absorb and rewrite docs/governance.md with prerequisites

Spec: .context-index/specs/features/user-docs/advanced-guides.spec.md
Plan-task: 2"
```

---

### Task 3: Absorb and rewrite docs/test-strategies.md [specialist: none]

**Charter capability:** Test Strategies Guide
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `docs/test-strategies.md`
- Modify: `tests/docs/advanced-guides.test.mjs`

**Tests:** `tests/docs/advanced-guides.test.mjs`

- [x] **Write failing test**

Add to `tests/docs/advanced-guides.test.mjs`:

```javascript
describe('docs/test-strategies.md — Test Strategies Guide', () => {
  it('should exist', () => {
    assert.ok(existsSync(join(DOCS_DIR, 'test-strategies.md')));
  });

  it('should have a prerequisites section', () => {
    const content = readFileSync(join(DOCS_DIR, 'test-strategies.md'), 'utf-8');
    assert.ok(
      content.includes('Prerequisites') || content.includes('prerequisites') || content.includes('Before you begin'),
      'Missing prerequisites section'
    );
  });

  it('should document all 9 strategies', () => {
    const content = readFileSync(join(DOCS_DIR, 'test-strategies.md'), 'utf-8');
    const strategies = ['unit', 'schema', 'fixture', 'policy', 'contract', 'integration', 'threshold', 'visual', 'smoke'];
    for (const strategy of strategies) {
      assert.ok(
        content.includes(`\`${strategy}\``),
        `Missing strategy: ${strategy}`
      );
    }
  });

  it('should explain auto-detection', () => {
    const content = readFileSync(join(DOCS_DIR, 'test-strategies.md'), 'utf-8');
    assert.ok(
      content.includes('auto-detect') || content.includes('Auto-detect') || content.includes('auto-discovery'),
      'Missing auto-detection explanation'
    );
  });

  it('should explain manual configuration via manifest', () => {
    const content = readFileSync(join(DOCS_DIR, 'test-strategies.md'), 'utf-8');
    assert.ok(content.includes('manifest.yaml') || content.includes('test_strategies'), 'Missing manifest configuration');
  });

  it('should include the integration strategy deep dive', () => {
    const content = readFileSync(join(DOCS_DIR, 'test-strategies.md'), 'utf-8');
    assert.ok(content.includes('integration strategy') || content.includes('Integration strategy') || content.includes('Adopting the integration strategy'), 'Missing integration strategy deep dive');
  });

  it('should preserve the priority chain from original', () => {
    const content = readFileSync(join(DOCS_DIR, 'test-strategies.md'), 'utf-8');
    assert.ok(content.includes('priority') || content.includes('Priority'), 'Missing priority chain');
  });

  it('should preserve credential guard pattern from integration deep dive', () => {
    const content = readFileSync(join(DOCS_DIR, 'test-strategies.md'), 'utf-8');
    assert.ok(
      content.includes('INTEGRATION_NO_CREDENTIALS') || content.includes('credential guard'),
      'Missing credential guard pattern'
    );
  });

  it('should preserve gaming violation patterns from original', () => {
    const content = readFileSync(join(DOCS_DIR, 'test-strategies.md'), 'utf-8');
    assert.ok(content.includes('BOUNDARY_MOCKING'), 'Missing BOUNDARY_MOCKING gaming violation');
  });

  it('should preserve troubleshooting section from original', () => {
    const content = readFileSync(join(DOCS_DIR, 'test-strategies.md'), 'utf-8');
    assert.ok(content.includes('Troubleshooting') || content.includes('troubleshooting'), 'Missing troubleshooting section');
  });

  it('should preserve custom profiles extension documentation from original', () => {
    const content = readFileSync(join(DOCS_DIR, 'test-strategies.md'), 'utf-8');
    assert.ok(
      content.includes('custom profile') || content.includes('Extending') || content.includes('extending'),
      'Missing custom profiles/extending section'
    );
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/docs/advanced-guides.test.mjs`
Expected: Prerequisites test should fail.

- [x] **Implement**

Rewrite `docs/test-strategies.md` in place. Read the existing file first and verify every section is preserved:

**Content absorption checklist (from existing file):**
- [ ] Title and intro with zero-config note
- [ ] "How it works" section with domain comparison table
- [ ] "The 9 strategies" table (unit, schema, fixture, policy, contract, integration, threshold, visual, smoke)
- [ ] "For existing projects" section:
  - Option 1: Auto-detection with detection heuristics list
  - Option 2: Manifest declaration with YAML example
  - Option 3: Spec-level override with frontmatter example
- [ ] Priority chain (4 levels: spec-declared, manifest, auto-detected, fallback)
- [ ] "For new projects" section
- [ ] "What changes in practice" section:
  - /adev:plan output examples with strategy annotations
  - Strategy Summary table example
  - /adev:write-test behavior per strategy
  - "What stays the same" subsection
- [ ] "Adopting the integration strategy" deep dive:
  - Core rule with mocking boundary table
  - Step 1: Declare infrastructure requirements (infra_requirements YAML)
  - Step 2: Credential guard pattern (full code example)
  - Step 3: UUID suffixes and cleanup (full code example)
  - Step 4: Activate integration gate (gates.yaml YAML)
  - Step 5: Set CI secrets (GitHub Actions YAML)
  - Gaming violations table (BOUNDARY_MOCKING, CI_BYPASS, CREDENTIAL_ABSENT_PASS)
  - "When NOT to use" table
- [ ] "Extending with custom profiles" section with 8 fields table
- [ ] Troubleshooting section (4 entries)

**New structure:**
1. Title: "Test Strategies"
2. **Prerequisites** section — state that the reader should understand the plan and write-test skills; link to build phase workflow guide
3. All existing content reorganized — the current structure is already well-organized, so primarily add prerequisites and cross-links
4. Cross-link `/adev:plan` and `/adev:write-test` mentions to skill reference entries

- [x] **Verify test passes**

Run: `node --test tests/docs/advanced-guides.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add docs/test-strategies.md tests/docs/advanced-guides.test.mjs
git commit -m "feat(user-docs): absorb and rewrite docs/test-strategies.md with prerequisites

Spec: .context-index/specs/features/user-docs/advanced-guides.spec.md
Plan-task: 3"
```

---

### Task 4: Add cross-links to reference pages [specialist: none]

**Charter capability:** Cross-linking
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1, Task 2, Task 3
**Files:**
- Modify: `docs/workspaces.md`
- Modify: `docs/governance.md`
- Modify: `docs/test-strategies.md`
- Modify: `tests/docs/advanced-guides.test.mjs`

**Tests:** `tests/docs/advanced-guides.test.mjs`

- [x] **Write failing test**

Add to `tests/docs/advanced-guides.test.mjs`:

```javascript
describe('Cross-links to reference pages', () => {
  it('workspaces.md should link to skill reference for mentioned skills', () => {
    const content = readFileSync(join(DOCS_DIR, 'workspaces.md'), 'utf-8');
    // Skills mentioned: brainstorm, specify, review-specs, plan, status
    assert.ok(content.includes('skills.md'), 'workspaces.md should link to skill reference');
  });

  it('governance.md should link to skill reference for mentioned skills', () => {
    const content = readFileSync(join(DOCS_DIR, 'governance.md'), 'utf-8');
    assert.ok(content.includes('skills.md'), 'governance.md should link to skill reference');
  });

  it('test-strategies.md should link to skill reference for mentioned skills', () => {
    const content = readFileSync(join(DOCS_DIR, 'test-strategies.md'), 'utf-8');
    assert.ok(content.includes('skills.md'), 'test-strategies.md should link to skill reference');
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/docs/advanced-guides.test.mjs`
Expected: FAIL if cross-links were not added during Tasks 1-3.

- [x] **Implement**

Review each guide and add links where skills or configuration files are mentioned:
1. In `docs/workspaces.md`: Link skill mentions (`/adev:brainstorm`, `/adev:specify`, `/adev:review-specs`, `/adev:plan`, `/adev:status`, `/adev:init`) to `skills.md`
2. In `docs/governance.md`: Link skill mentions (`/adev:review-specs`, `/adev:validate`, `/adev:init`) to `skills.md`
3. In `docs/test-strategies.md`: Link skill mentions (`/adev:plan`, `/adev:write-test`, `/adev:implement`, `/adev:validate`, `/adev:specify`) to `skills.md`

Use relative markdown links. Link to the skill reference page rather than re-documenting the skill.

- [x] **Verify test passes**

Run: `node --test tests/docs/advanced-guides.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add docs/workspaces.md docs/governance.md docs/test-strategies.md tests/docs/advanced-guides.test.mjs
git commit -m "feat(user-docs): add cross-links to skill reference in advanced guides

Spec: .context-index/specs/features/user-docs/advanced-guides.spec.md
Plan-task: 4"
```

---

### Task 5: Verify TOC links and prerequisites [specialist: none]

**Charter capability:** Table of Contents (link integrity)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 4
**Files:**
- Modify: `docs/README.md` (if links need updating)
- Modify: `tests/docs/advanced-guides.test.mjs`

**Tests:** `tests/docs/advanced-guides.test.mjs`

- [x] **Write failing test**

Add to `tests/docs/advanced-guides.test.mjs`:

```javascript
describe('TOC links and navigation', () => {
  it('docs/README.md should link to all three advanced guides under Advanced', () => {
    const content = readFileSync(join(DOCS_DIR, 'README.md'), 'utf-8');
    assert.ok(content.includes('workspaces.md'), 'README.md missing link to workspaces.md');
    assert.ok(content.includes('governance.md'), 'README.md missing link to governance.md');
    assert.ok(content.includes('test-strategies.md'), 'README.md missing link to test-strategies.md');
  });

  it('advanced guide relative links should resolve to existing files', () => {
    const guides = ['workspaces.md', 'governance.md', 'test-strategies.md'];
    for (const guide of guides) {
      const content = readFileSync(join(DOCS_DIR, guide), 'utf-8');
      const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
      let match;
      while ((match = linkPattern.exec(content)) !== null) {
        const target = match[2];
        if (target.startsWith('http') || target.startsWith('#') || target.startsWith('..')) continue;
        const filePart = target.split('#')[0];
        if (filePart) {
          const targetPath = join(DOCS_DIR, filePart);
          assert.ok(
            existsSync(targetPath),
            `${guide}: broken link to ${target} (expected file at ${targetPath})`
          );
        }
      }
    }
  });

  it('each advanced guide should state prerequisites', () => {
    const guides = ['workspaces.md', 'governance.md', 'test-strategies.md'];
    for (const guide of guides) {
      const content = readFileSync(join(DOCS_DIR, guide), 'utf-8');
      assert.ok(
        content.includes('Prerequisites') || content.includes('prerequisites') || content.includes('Before you begin'),
        `${guide}: missing prerequisites section`
      );
    }
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/docs/advanced-guides.test.mjs`
Expected: May pass if TOC links already exist (they do from foundation spec). Broken links test may fail.

- [x] **Implement**

1. Verify `docs/README.md` links to all three guides under the "Advanced" section — the existing README.md already has these links, so confirm they are correct
2. Scan all three guides for broken relative links and fix any
3. Ensure no links point to files that don't exist (use the DEAD_REFERENCE error case guidance)
4. Fix any links to pages from other specs that don't exist yet — either remove or mark "(coming soon)"

- [x] **Verify test passes**

Run: `node --test tests/docs/advanced-guides.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add docs/README.md docs/workspaces.md docs/governance.md docs/test-strategies.md tests/docs/advanced-guides.test.mjs
git commit -m "feat(user-docs): verify TOC links and fix broken references in advanced guides

Spec: .context-index/specs/features/user-docs/advanced-guides.spec.md
Plan-task: 5"
```

---

## Quality Gates

After all tasks are complete, run the full quality gate suite:

- [ ] Tests pass: `npm test`
- [ ] All acceptance criteria from spec satisfied:
  - [ ] `docs/workspaces.md` contains all content from the existing workspaces guide
  - [ ] `docs/governance.md` contains all content from the existing governance guide, including migration recipes
  - [ ] `docs/test-strategies.md` contains all content from the existing test strategies guide, including all 9 strategies
  - [ ] Each guide states prerequisites at the top
  - [ ] Skill and config references link to their respective reference pages
  - [ ] All three pages are reachable from docs/README.md
  - [ ] No information loss from existing documentation
  - [ ] No constitutional violations introduced
