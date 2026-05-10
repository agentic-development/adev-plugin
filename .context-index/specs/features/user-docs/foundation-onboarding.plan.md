# Implementation Plan: Foundation & Onboarding

> **Methodology:** adev
> **Charter:** .context-index/specs/features/user-docs/charter.md
> **Spec:** .context-index/specs/features/user-docs/foundation-onboarding.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-09)
> **Platform:** Node.js, JavaScript (ESM), npm

**Goal:** Create the foundational documentation pages — table of contents, concepts overview, installation guide, and getting-started tutorial — establishing the entry point and onboarding path for new adev users.

**Architecture:** Pure markdown documentation files in `docs/`. No build step, no site generator, no external dependencies. Content is sourced from constitution, manifest, platform-context, and existing quickstart.md. The getting-started page absorbs and expands the current quickstart.md, which is then removed.

**Review notes to address during implementation:**
- SEC-1: Installation guide credential examples should use clearly synthetic placeholder values
- CON-1: TOC section names should be declared once canonically
- CON-2: File naming convention (kebab-case) is consistent

---

## File Structure

**Create:**
- `docs/README.md` — Table of contents and documentation entry point
- `docs/concepts.md` — Four pillars overview and lifecycle diagram
- `docs/installation.md` — Installation guide with greenfield/brownfield/provider paths
- `docs/getting-started.md` — End-to-end tutorial absorbing quickstart.md content

**Modify:**
- (none — all files are new creations)

**Delete:**
- `docs/quickstart.md` — replaced by getting-started.md after content absorption

**Reference (read, do not modify):**
- `.context-index/constitution.md` — Source for concepts content (four pillars, principles)
- `.context-index/manifest.yaml` — Source for configuration examples in installation
- `.context-index/platform-context.yaml` — Source for platform details
- `docs/quickstart.md` — Content to absorb into getting-started.md
- `skills/*/SKILL.md` — Reference for skill names and descriptions in tutorial

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/user-docs/foundation-onboarding.spec.md` (criteria 1, 7)
- Charter: `.context-index/specs/features/user-docs/charter.md` (capability: Table of Contents)
- Reference: existing `docs/` directory listing for understanding current structure

### Task 2 Context
- Spec: `.context-index/specs/features/user-docs/foundation-onboarding.spec.md` (criteria 2, 8)
- Charter: `.context-index/specs/features/user-docs/charter.md` (capability: Concepts Overview)
- Source: `.context-index/constitution.md` (four pillars and principles)

### Task 3 Context
- Spec: `.context-index/specs/features/user-docs/foundation-onboarding.spec.md` (criteria 3, 8)
- Charter: `.context-index/specs/features/user-docs/charter.md` (capability: Installation Guide)
- Source: `.context-index/platform-context.yaml` (deployment target, plugin_target)
- Review note: SEC-1 — use synthetic placeholder values for any credential examples

### Task 4 Context
- Spec: `.context-index/specs/features/user-docs/foundation-onboarding.spec.md` (criteria 4, 5, 8)
- Charter: `.context-index/specs/features/user-docs/charter.md` (capability: Getting Started Tutorial)
- Source: `docs/quickstart.md` (content to absorb — must preserve all information)
- Reference: `skills/*/SKILL.md` (skill names for lifecycle walkthrough)

### Task 5 Context
- Spec: `.context-index/specs/features/user-docs/foundation-onboarding.spec.md` (criteria 6)
- Source: `docs/quickstart.md` (verify all content absorbed before deletion)

### Task 6 Context
- Spec: `.context-index/specs/features/user-docs/foundation-onboarding.spec.md` (criteria 7)
- Reference: all files created in Tasks 1-4

## Parallelization

- Group A (sequential): Task 1 (TOC references pages from Tasks 2-4, but can be written with placeholder links)
- Group B (independent): Task 2 (concepts — no file dependencies on other tasks)
- Group C (independent): Task 3 (installation — no file dependencies on other tasks)
- Group D (sequential): Task 4 → Task 5 (getting-started absorbs quickstart, then quickstart is deleted)
- Group E (sequential, after all): Task 6 (link verification depends on all pages existing)

Groups B and C can run in parallel with Group A. Task 5 must follow Task 4. Task 6 runs last.

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Write docs/README.md — Table of Contents | small | unit | — | 1 create |
| 2 | Write docs/concepts.md — Four Pillars Overview | medium | unit | — | 1 create |
| 3 | Write docs/installation.md — Setup Guide | medium | unit | — | 1 create |
| 4 | Write docs/getting-started.md — Lifecycle Tutorial | large | unit | — | 1 create |
| 5 | Remove docs/quickstart.md | small | unit | Task 4 | 1 delete |
| 6 | Verify cross-page links and add next-page navigation | small | unit | Task 1, 2, 3, 4 | 4 modify |

---

### Task 1: Write docs/README.md — Table of Contents [specialist: none]

**Charter capability:** Table of Contents
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `docs/README.md`
- Test: `tests/docs/foundation-onboarding.test.mjs`

**Tests:** `tests/docs/foundation-onboarding.test.mjs`

- [x] **Write failing test**

```javascript
import { describe, it } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert';

const DOCS_DIR = join(import.meta.dirname, '..', '..', 'docs');

describe('docs/README.md — Table of Contents', () => {
  it('should exist', () => {
    assert.ok(existsSync(join(DOCS_DIR, 'README.md')));
  });

  it('should contain Getting Started section with link to concepts, installation, and getting-started', () => {
    const content = readFileSync(join(DOCS_DIR, 'README.md'), 'utf-8');
    assert.ok(content.includes('concepts.md'), 'Missing link to concepts.md');
    assert.ok(content.includes('installation.md'), 'Missing link to installation.md');
    assert.ok(content.includes('getting-started.md'), 'Missing link to getting-started.md');
  });

  it('should contain Workflow Guides section', () => {
    const content = readFileSync(join(DOCS_DIR, 'README.md'), 'utf-8');
    assert.ok(content.includes('Workflow'), 'Missing Workflow Guides section');
  });

  it('should contain Reference section', () => {
    const content = readFileSync(join(DOCS_DIR, 'README.md'), 'utf-8');
    assert.ok(content.includes('Reference'), 'Missing Reference section');
  });

  it('should contain Advanced section', () => {
    const content = readFileSync(join(DOCS_DIR, 'README.md'), 'utf-8');
    assert.ok(content.includes('Advanced'), 'Missing Advanced section');
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/docs/foundation-onboarding.test.mjs`
Expected: FAIL — docs/README.md does not exist yet

- [x] **Implement**

Create `docs/README.md` with:
- Title: "adev Documentation"
- Brief intro paragraph explaining the documentation purpose
- **Getting Started** section linking to: concepts.md, installation.md, getting-started.md
- **Workflow Guides** section linking to: design-phase.md, build-phase.md, validate-debug.md, maintain.md (with "coming soon" notes since these are created by another spec)
- **Reference** section linking to: skill-reference.md, configuration.md, hooks-reference.md (coming soon)
- **Advanced** section linking to: workspaces.md, governance.md, test-strategies.md, project-types.md (coming soon)
- Use relative markdown links throughout

Address CON-1: Define section names exactly once in this TOC — other pages reference these canonical names.

- [x] **Verify test passes**

Run: `node --test tests/docs/foundation-onboarding.test.mjs`
Expected: PASS

- [x] **Commit**

Branch: `feat/user-docs/foundation-onboarding`

```bash
git add docs/README.md tests/docs/foundation-onboarding.test.mjs
git commit -m "feat(user-docs): add docs/README.md table of contents

Spec: .context-index/specs/features/user-docs/foundation-onboarding.spec.md
Plan-task: 1"
```

---

### Task 2: Write docs/concepts.md — Four Pillars Overview [specialist: none]

**Charter capability:** Concepts Overview
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `docs/concepts.md`
- Modify: `tests/docs/foundation-onboarding.test.mjs`

**Tests:** `tests/docs/foundation-onboarding.test.mjs`

- [x] **Write failing test**

Add to `tests/docs/foundation-onboarding.test.mjs`:

```javascript
describe('docs/concepts.md — Concepts Overview', () => {
  it('should exist', () => {
    assert.ok(existsSync(join(DOCS_DIR, 'concepts.md')));
  });

  it('should explain the four pillars', () => {
    const content = readFileSync(join(DOCS_DIR, 'concepts.md'), 'utf-8');
    assert.ok(content.includes('Context-First'), 'Missing Context-First Architecture');
    assert.ok(content.includes('Ephemeral Infrastructure'), 'Missing Ephemeral Infrastructure');
    assert.ok(content.includes('Gate-Based Governance'), 'Missing Gate-Based Governance');
    assert.ok(content.includes('Hybrid Engineering'), 'Missing Hybrid Engineering');
  });

  it('should describe the context index', () => {
    const content = readFileSync(join(DOCS_DIR, 'concepts.md'), 'utf-8');
    assert.ok(content.includes('context index') || content.includes('Context Index'), 'Missing context index description');
  });

  it('should include a lifecycle overview', () => {
    const content = readFileSync(join(DOCS_DIR, 'concepts.md'), 'utf-8');
    assert.ok(content.includes('lifecycle') || content.includes('Lifecycle'), 'Missing lifecycle overview');
  });

  it('should not reference internal implementation details', () => {
    const content = readFileSync(join(DOCS_DIR, 'concepts.md'), 'utf-8');
    assert.ok(!content.includes('SKILL.md'), 'Should not reference SKILL.md files');
    assert.ok(!content.includes('hooks.json'), 'Should not reference hooks.json');
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/docs/foundation-onboarding.test.mjs`
Expected: FAIL — docs/concepts.md does not exist yet

- [x] **Implement**

Create `docs/concepts.md` sourcing content from `.context-index/constitution.md`. Include:
- Title: "Core Concepts"
- **The Four Pillars** section with brief explanations:
  1. Context-First Architecture — all project knowledge in `.context-index/`
  2. Ephemeral Infrastructure — agents are disposable, context persists
  3. Gate-Based Governance — quality gates and reviews at every lifecycle stage
  4. Hybrid Engineering — agents and humans collaborate, each playing to strengths
- **The Context Index** section describing what `.context-index/` contains (constitution, manifest, specs, charters, ADRs) without implementation details
- **Lifecycle Overview** with a text-based diagram showing: brainstorm → specify → review → plan → implement → validate
- Define all terms on first use (charter, spec, constitution, etc.)
- No references to SKILL.md, hooks.json, or other internal files

- [x] **Verify test passes**

Run: `node --test tests/docs/foundation-onboarding.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add docs/concepts.md tests/docs/foundation-onboarding.test.mjs
git commit -m "feat(user-docs): add docs/concepts.md with four pillars overview

Spec: .context-index/specs/features/user-docs/foundation-onboarding.spec.md
Plan-task: 2"
```

---

### Task 3: Write docs/installation.md — Setup Guide [specialist: none]

**Charter capability:** Installation Guide
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `docs/installation.md`
- Modify: `tests/docs/foundation-onboarding.test.mjs`

**Tests:** `tests/docs/foundation-onboarding.test.mjs`

- [x] **Write failing test**

Add to `tests/docs/foundation-onboarding.test.mjs`:

```javascript
describe('docs/installation.md — Installation Guide', () => {
  it('should exist', () => {
    assert.ok(existsSync(join(DOCS_DIR, 'installation.md')));
  });

  it('should cover greenfield setup', () => {
    const content = readFileSync(join(DOCS_DIR, 'installation.md'), 'utf-8');
    assert.ok(content.includes('greenfield') || content.includes('Greenfield') || content.includes('new project'), 'Missing greenfield path');
  });

  it('should cover brownfield setup', () => {
    const content = readFileSync(join(DOCS_DIR, 'installation.md'), 'utf-8');
    assert.ok(content.includes('brownfield') || content.includes('Brownfield') || content.includes('existing'), 'Missing brownfield path');
  });

  it('should cover provider selection', () => {
    const content = readFileSync(join(DOCS_DIR, 'installation.md'), 'utf-8');
    assert.ok(content.includes('Claude Code'), 'Missing Claude Code provider');
  });

  it('should include verification steps', () => {
    const content = readFileSync(join(DOCS_DIR, 'installation.md'), 'utf-8');
    assert.ok(content.includes('verify') || content.includes('Verify') || content.includes('verification'), 'Missing verification steps');
  });

  it('should use synthetic placeholder values for any credentials (SEC-1)', () => {
    const content = readFileSync(join(DOCS_DIR, 'installation.md'), 'utf-8');
    // Should not contain real-looking API keys or tokens
    assert.ok(!content.match(/sk-[a-zA-Z0-9]{32,}/), 'Contains real-looking API key');
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/docs/foundation-onboarding.test.mjs`
Expected: FAIL — docs/installation.md does not exist yet

- [x] **Implement**

Create `docs/installation.md` with:
- Title: "Installation & Setup"
- **Prerequisites** section (Node.js, npm, Git, Claude Code or supported AI assistant)
- **Install the Plugin** section with `npx @adev-org/adev-cli install` command
- **Provider Selection** explaining Claude Code (default), OpenCode, Codex options
- **Greenfield Setup** path: new project, `/adev:init`, what gets created
- **Brownfield Setup** path: existing codebase, `/adev:init --brownfield`, auto-detection
- **Verification** section with steps to confirm successful installation
- Use synthetic placeholder values for any credential examples (SEC-1)

- [x] **Verify test passes**

Run: `node --test tests/docs/foundation-onboarding.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add docs/installation.md tests/docs/foundation-onboarding.test.mjs
git commit -m "feat(user-docs): add docs/installation.md with setup guide

Spec: .context-index/specs/features/user-docs/foundation-onboarding.spec.md
Plan-task: 3"
```

---

### Task 4: Write docs/getting-started.md — Lifecycle Tutorial [specialist: none]

**Charter capability:** Getting Started Tutorial
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `docs/getting-started.md`
- Modify: `tests/docs/foundation-onboarding.test.mjs`

**Tests:** `tests/docs/foundation-onboarding.test.mjs`

- [x] **Write failing test**

Add to `tests/docs/foundation-onboarding.test.mjs`:

```javascript
describe('docs/getting-started.md — Getting Started Tutorial', () => {
  it('should exist', () => {
    assert.ok(existsSync(join(DOCS_DIR, 'getting-started.md')));
  });

  it('should cover all lifecycle phases', () => {
    const content = readFileSync(join(DOCS_DIR, 'getting-started.md'), 'utf-8');
    const phases = ['init', 'brainstorm', 'specify', 'review', 'plan', 'implement', 'validate'];
    for (const phase of phases) {
      assert.ok(
        content.toLowerCase().includes(phase),
        `Missing lifecycle phase: ${phase}`
      );
    }
  });

  it('should define terms on first use', () => {
    const content = readFileSync(join(DOCS_DIR, 'getting-started.md'), 'utf-8');
    // Check that key terms are explained, not just used
    assert.ok(content.includes('charter') || content.includes('Charter'), 'Missing charter explanation');
    assert.ok(content.includes('spec') || content.includes('Spec') || content.includes('specification'), 'Missing spec explanation');
  });

  it('should preserve quickstart content — install command', () => {
    const content = readFileSync(join(DOCS_DIR, 'getting-started.md'), 'utf-8');
    assert.ok(content.includes('npx @adev-org/adev-cli install') || content.includes('installation'), 'Missing install reference');
  });

  it('should preserve quickstart content — adev:work mention', () => {
    const content = readFileSync(join(DOCS_DIR, 'getting-started.md'), 'utf-8');
    assert.ok(content.includes('adev:work') || content.includes('/adev:work'), 'Missing adev:work reference from quickstart');
  });

  it('should preserve quickstart content — adev:issues mention', () => {
    const content = readFileSync(join(DOCS_DIR, 'getting-started.md'), 'utf-8');
    assert.ok(content.includes('adev:issues') || content.includes('/adev:issues'), 'Missing adev:issues reference from quickstart');
  });

  it('should not assume prior knowledge of adev', () => {
    const content = readFileSync(join(DOCS_DIR, 'getting-started.md'), 'utf-8');
    // The tutorial should be self-contained — check it has an introductory paragraph
    const lines = content.split('\n');
    const firstParagraph = lines.slice(2, 10).join('\n');
    assert.ok(firstParagraph.length > 50, 'Should have an introductory paragraph explaining what the tutorial covers');
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/docs/foundation-onboarding.test.mjs`
Expected: FAIL — docs/getting-started.md does not exist yet

- [x] **Implement**

Create `docs/getting-started.md` absorbing all content from `docs/quickstart.md` and expanding it. Read `docs/quickstart.md` first to ensure every piece of information is preserved. Include:

- Title: "Getting Started"
- Brief intro explaining what the tutorial covers and what you'll build
- **Step 1: Install the Plugin** (from quickstart step 1, plus link to installation.md for details)
- **Step 2: Initialize Your Project** (from quickstart step 2, expanded with what each layer does)
- **Step 3: Brainstorm a Feature** (from quickstart step 3, expanded with example output)
- **Step 4: Write a Spec** (from quickstart step 4, expanded with behavioral contract examples)
- **Step 5: Review the Spec** (from quickstart step 5, expanded with what each reviewer checks)
- **Step 6: Plan the Work** (from quickstart step 6, expanded with task structure examples)
- **Step 7: Implement** (from quickstart step 7, expanded with TDD cycle details)
- **Step 8: Validate** (from quickstart step 8, expanded with check descriptions)
- **What's Next** section (from quickstart, preserving all references to /adev:work, /adev:issues, /adev:status)
- Define all terms on first use (charter, spec, constitution, context index, etc.)

**Content absorption checklist** (every item from quickstart.md):
- `npx @adev-org/adev-cli install` command
- Provider selection mention
- `/adev:init` with 10 layers description (Constitution, Manifest, Platform context, Task management)
- `--brownfield` flag mention
- `/adev:brainstorm` description and charter output
- `/adev:specify` and Live Spec definition
- `/adev:review-specs` with three specialist descriptions
- `/adev:plan` with task decomposition details
- `/adev:implement` with TDD steps and two-stage review
- `/adev:validate` with 13 checks list
- What's next section: `/adev:work`, `/adev:issues`, `/adev:status`, skills.md reference

- [x] **Verify test passes**

Run: `node --test tests/docs/foundation-onboarding.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add docs/getting-started.md tests/docs/foundation-onboarding.test.mjs
git commit -m "feat(user-docs): add docs/getting-started.md absorbing quickstart content

Spec: .context-index/specs/features/user-docs/foundation-onboarding.spec.md
Plan-task: 4"
```

---

### Task 5: Remove docs/quickstart.md [specialist: none]

**Charter capability:** Getting Started Tutorial (cleanup)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 4
**Files:**
- Delete: `docs/quickstart.md`
- Modify: `tests/docs/foundation-onboarding.test.mjs`

**Tests:** `tests/docs/foundation-onboarding.test.mjs`

- [x] **Write failing test**

Add to `tests/docs/foundation-onboarding.test.mjs`:

```javascript
describe('docs/quickstart.md — Removal', () => {
  it('should not exist (replaced by getting-started.md)', () => {
    assert.ok(!existsSync(join(DOCS_DIR, 'quickstart.md')), 'quickstart.md should be removed');
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/docs/foundation-onboarding.test.mjs`
Expected: FAIL — quickstart.md still exists

- [x] **Implement**

```bash
git rm docs/quickstart.md
```

- [x] **Verify test passes**

Run: `node --test tests/docs/foundation-onboarding.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add docs/quickstart.md tests/docs/foundation-onboarding.test.mjs
git commit -m "feat(user-docs): remove quickstart.md (absorbed into getting-started.md)

Spec: .context-index/specs/features/user-docs/foundation-onboarding.spec.md
Plan-task: 5"
```

---

### Task 6: Verify cross-page links and add next-page navigation [specialist: none]

**Charter capability:** Table of Contents (link integrity)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1, Task 2, Task 3, Task 4
**Files:**
- Modify: `docs/README.md`
- Modify: `docs/concepts.md`
- Modify: `docs/installation.md`
- Modify: `docs/getting-started.md`
- Modify: `tests/docs/foundation-onboarding.test.mjs`

**Tests:** `tests/docs/foundation-onboarding.test.mjs`

- [x] **Write failing test**

Add to `tests/docs/foundation-onboarding.test.mjs`:

```javascript
describe('Cross-page links and navigation', () => {
  const pages = ['README.md', 'concepts.md', 'installation.md', 'getting-started.md'];

  it('should have all relative links resolve to existing files', () => {
    for (const page of pages) {
      const content = readFileSync(join(DOCS_DIR, page), 'utf-8');
      const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
      let match;
      while ((match = linkPattern.exec(content)) !== null) {
        const target = match[2];
        // Skip external links and anchor links
        if (target.startsWith('http') || target.startsWith('#')) continue;
        // Strip anchor from relative links
        const filePart = target.split('#')[0];
        if (filePart) {
          const targetPath = join(DOCS_DIR, filePart);
          assert.ok(
            existsSync(targetPath),
            `${page}: broken link to ${target} (expected file at ${targetPath})`
          );
        }
      }
    }
  });

  it('should have next-page links at the bottom of sequential pages', () => {
    // concepts -> installation -> getting-started
    const concepts = readFileSync(join(DOCS_DIR, 'concepts.md'), 'utf-8');
    assert.ok(concepts.includes('installation.md'), 'concepts.md should link to installation.md as next page');

    const installation = readFileSync(join(DOCS_DIR, 'installation.md'), 'utf-8');
    assert.ok(installation.includes('getting-started.md'), 'installation.md should link to getting-started.md as next page');
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/docs/foundation-onboarding.test.mjs`
Expected: FAIL — next-page links may not exist yet, or some links may be broken

- [x] **Implement**

1. Review all links in README.md, concepts.md, installation.md, getting-started.md
2. For links to pages from other specs (workflow guides, reference, advanced), either:
   - Remove the link if the page doesn't exist yet, or
   - Keep the link text but note "(coming soon)" since other specs will create those pages
3. Add "Next:" navigation links at the bottom of each page in reading order:
   - concepts.md → "Next: [Installation](installation.md)"
   - installation.md → "Next: [Getting Started](getting-started.md)"
   - getting-started.md → "Next: [Design Phase Guide](design-phase.md)" (coming soon note)
4. Verify no dead links remain within this spec's pages

- [x] **Verify test passes**

Run: `node --test tests/docs/foundation-onboarding.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add docs/README.md docs/concepts.md docs/installation.md docs/getting-started.md tests/docs/foundation-onboarding.test.mjs
git commit -m "feat(user-docs): add next-page navigation and verify cross-page links

Spec: .context-index/specs/features/user-docs/foundation-onboarding.spec.md
Plan-task: 6"
```

---

## Quality Gates

After all tasks are complete, run the full quality gate suite:

- [x] Tests pass: `npm test`
- [x] All acceptance criteria from spec satisfied:
  - [x] `docs/README.md` exists with a table of contents linking all documentation pages
  - [x] `docs/concepts.md` explains all four pillars and the context index without internal jargon
  - [x] `docs/installation.md` covers greenfield, brownfield, and provider selection
  - [x] `docs/getting-started.md` is a complete end-to-end tutorial covering all lifecycle phases
  - [x] All content from `docs/quickstart.md` is preserved in the new structure
  - [x] `docs/quickstart.md` is removed
  - [x] Every link between pages resolves correctly
  - [x] No page assumes prior knowledge of adev — terms defined on first use
  - [x] No constitutional violations introduced
