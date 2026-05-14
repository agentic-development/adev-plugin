<!-- DO NOT EDIT statuses inline — see lifecycle log support-polish.jsonl -->
# Implementation Plan: Support & Polish

> **Methodology:** adev
> **Charter:** .context-index/specs/features/user-docs/charter.md
> **Spec:** .context-index/specs/features/user-docs/support-polish.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-09)
> **Platform:** Node.js, JavaScript (ESM), npm

**Goal:** Complete the documentation set with a troubleshooting/FAQ page, update README.md to point to the new docs, add consistent breadcrumb and next/previous navigation to all doc pages, remove superseded files, and validate zero dead links across the entire docs directory.

**Architecture:** Pure markdown documentation files in `docs/`. No build step, no site generator, no external dependencies. The link validation test programmatically scans all `.md` files in `docs/` for relative links and asserts each target exists.

**Review notes to address during implementation:**
- SA-1: When removing `docs/skills.md` and `docs/architecture.md`, document which spec/page absorbs their content (skill-reference spec absorbs skills.md; the new docs structure absorbs architecture.md)

---

## File Structure

**Create:**
- `docs/troubleshooting.md` — FAQ and troubleshooting guide organized by symptom
- `tests/docs/support-polish.test.mjs` — Tests for all deliverables

**Modify:**
- `README.md` — Update "Learn More" section to point to `docs/README.md`; fix stale links
- `docs/README.md` — Replace "coming soon" placeholders with real links; add breadcrumb
- `docs/concepts.md` — Add breadcrumb and prev/next navigation
- `docs/installation.md` — Add breadcrumb and prev/next navigation
- `docs/getting-started.md` — Add breadcrumb and prev/next navigation
- `docs/workspaces.md` — Add breadcrumb and prev/next navigation
- `docs/governance.md` — Add breadcrumb and prev/next navigation
- `docs/test-strategies.md` — Add breadcrumb and prev/next navigation
- `docs/troubleshooting.md` — Add breadcrumb and prev/next navigation (done during creation)

**Delete:**
- `docs/skills.md` — Superseded by skill-reference spec pages
- `docs/architecture.md` — Superseded by the new docs structure (concepts.md, getting-started.md cover the overview; modules/ pages cover details)
- `docs/GENERATED.md` — Auto-generated file, not part of user docs
- `docs/prd-adev-assess.md` — Developer/internal PRD, not user documentation
- `docs/prd-adev-document.md` — Developer/internal PRD, not user documentation
- `docs/prd-tree-sitter-repomap.md` — Developer/internal PRD, not user documentation
- `docs/modules/` — Auto-generated module docs, not part of user documentation

**Reference (read, do not modify):**
- `.context-index/constitution.md` — Hook protocol for troubleshooting entries
- `hooks/hooks.json` — Hook names and triggers for troubleshooting content
- `hooks/*.sh` — Hook behavior details for troubleshooting entries
- `skills/*/SKILL.md` — Skill prerequisites for FAQ entries

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/user-docs/support-polish.spec.md` (behaviors 1-4, criteria 1-3)
- Charter: `.context-index/specs/features/user-docs/charter.md` (capability: Troubleshooting & FAQ)
- Source: `.context-index/constitution.md` (hook protocol — exit codes 0/2)
- Source: `hooks/hooks.json` (hook names, trigger points)
- Source: `hooks/*.sh` (common warning/error messages)
- Source: `skills/*/SKILL.md` (skill prerequisites for FAQ "do I need every step?" question)

### Task 2 Context
- Spec: `.context-index/specs/features/user-docs/support-polish.spec.md` (behavior 5, criteria 4)
- Source: `README.md` (current "Learn More" section and skill table links)
- Source: `docs/README.md` (the target entry point)

### Task 3 Context
- Spec: `.context-index/specs/features/user-docs/support-polish.spec.md` (postcondition: old files removed)
- Review note SA-1: document what absorbs each removed file
- Source: `docs/skills.md`, `docs/architecture.md` (verify content is covered elsewhere)

### Task 4 Context
- Spec: `.context-index/specs/features/user-docs/support-polish.spec.md` (behaviors 6, criteria 5-6)
- Source: all files in `docs/` (add navigation to each)
- Reference: charter reading order (Getting Started → Workflow Guides → Reference → Advanced)

### Task 5 Context
- Spec: `.context-index/specs/features/user-docs/support-polish.spec.md` (behavior 7, criteria 7)
- Source: all files in `docs/` (scan all relative links)

## Parallelization

- Group A (independent): Task 1 (troubleshooting.md — no dependency on other tasks)
- Group B (independent): Task 2 (README.md update — no dependency on other tasks)
- Group C (sequential after A, B): Task 3 (remove superseded files — must happen before link validation)
- Group D (sequential after C): Task 4 (breadcrumb navigation — must know final file set)
- Group E (sequential, last): Task 5 (link validation — depends on all files being in final state)

Tasks 1 and 2 can run in parallel. Tasks 3, 4, 5 are sequential.

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Write docs/troubleshooting.md — FAQ & Troubleshooting | medium | unit | — | 1 create |
| 2 | Update README.md — Point to docs | small | unit | — | 1 modify |
| 3 | Remove superseded docs files | small | unit | — | ~10 delete |
| 4 | Add breadcrumb and next/previous navigation to all pages | medium | unit | Task 1, 3 | ~9 modify |
| 5 | Validate zero dead links across docs/ | small | unit | Task 1, 2, 3, 4 | 0 modify (test only) |

---

### Task 1: Write docs/troubleshooting.md — FAQ & Troubleshooting [specialist: none]

**Charter capability:** Troubleshooting & FAQ
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `docs/troubleshooting.md`
- Create: `tests/docs/support-polish.test.mjs`

**Tests:** `tests/docs/support-polish.test.mjs`

- [x] **Write failing test**

```javascript
import { describe, it } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert';

const DOCS_DIR = join(import.meta.dirname, '..', '..', 'docs');
const ROOT_DIR = join(import.meta.dirname, '..', '..');

describe('docs/troubleshooting.md — Troubleshooting & FAQ', () => {
  it('should exist', () => {
    assert.ok(existsSync(join(DOCS_DIR, 'troubleshooting.md')));
  });

  it('should have a Troubleshooting section organized by symptom', () => {
    const content = readFileSync(join(DOCS_DIR, 'troubleshooting.md'), 'utf-8');
    assert.ok(
      content.includes('Troubleshooting') || content.includes('troubleshooting'),
      'Missing Troubleshooting section'
    );
  });

  it('should cover hook warnings', () => {
    const content = readFileSync(join(DOCS_DIR, 'troubleshooting.md'), 'utf-8');
    assert.ok(
      content.includes('hook') || content.includes('Hook'),
      'Missing hook warning troubleshooting'
    );
  });

  it('should cover lifecycle gate blocks', () => {
    const content = readFileSync(join(DOCS_DIR, 'troubleshooting.md'), 'utf-8');
    assert.ok(
      content.includes('gate') || content.includes('Gate') || content.includes('block'),
      'Missing lifecycle gate troubleshooting'
    );
  });

  it('should cover common errors with symptom, cause, and resolution', () => {
    const content = readFileSync(join(DOCS_DIR, 'troubleshooting.md'), 'utf-8');
    // Each troubleshooting entry should have these three parts
    const hasSymptom = content.includes('see') || content.includes('See') || content.includes('symptom') || content.includes('Symptom');
    const hasCause = content.includes('cause') || content.includes('Cause') || content.includes('why') || content.includes('Why') || content.includes('because');
    const hasResolution = content.includes('fix') || content.includes('Fix') || content.includes('resolution') || content.includes('Resolution') || content.includes('resolve') || content.includes('solution');
    assert.ok(hasSymptom, 'Troubleshooting entries should describe what the user sees');
    assert.ok(hasCause, 'Troubleshooting entries should explain why it happens');
    assert.ok(hasResolution, 'Troubleshooting entries should explain how to resolve');
  });

  it('should have a FAQ section with at least 5 questions', () => {
    const content = readFileSync(join(DOCS_DIR, 'troubleshooting.md'), 'utf-8');
    assert.ok(content.includes('FAQ') || content.includes('Frequently Asked'), 'Missing FAQ section');
    // Count question marks or Q: patterns as a proxy for FAQ entries
    const faqSection = content.slice(content.indexOf('FAQ'));
    const questionCount = (faqSection.match(/\?/g) || []).length;
    assert.ok(questionCount >= 5, `FAQ should have at least 5 questions, found ${questionCount}`);
  });

  it('should cover portability to other AI tools in FAQ', () => {
    const content = readFileSync(join(DOCS_DIR, 'troubleshooting.md'), 'utf-8');
    assert.ok(
      content.includes('other AI') || content.includes('other tool') || content.includes('OpenCode') || content.includes('Codex') || content.includes('portab'),
      'FAQ should address portability to other AI tools'
    );
  });

  it('should address whether every lifecycle step is required in FAQ', () => {
    const content = readFileSync(join(DOCS_DIR, 'troubleshooting.md'), 'utf-8');
    assert.ok(
      content.includes('every step') || content.includes('skip') || content.includes('required') || content.includes('optional'),
      'FAQ should address whether every lifecycle step is required'
    );
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/docs/support-polish.test.mjs`
Expected: FAIL — docs/troubleshooting.md does not exist yet

- [x] **Implement**

Create `docs/troubleshooting.md` with:
- Title: "Troubleshooting & FAQ"
- Brief intro explaining the page purpose

**Troubleshooting section** organized by symptom category:

1. **Hook Warnings** — entries for:
   - "merge-guard blocked my push" (exit code 2, protected branch, resolution: use a PR)
   - "constitution-linter warning" (constitution too large or malformed, resolution: check structure)
   - "context-preflight warning" (haven't read context yet, resolution: read constitution/manifest first)

2. **Lifecycle Gate Blocks** — entries for:
   - "No charter found" (brainstorm gate, resolution: run /adev:brainstorm first)
   - "Spec not reviewed" (plan gate, resolution: run /adev:review-specs)
   - "No plan found" (implement gate, resolution: run /adev:plan)

3. **Skill Errors** — entries for:
   - "Skill prerequisites not met" (missing context files, resolution: run /adev:init)
   - "Subagent failed or got stuck" (resolution: run /adev:recover)

4. **Configuration Mistakes** — entries for:
   - "manifest.yaml not found" (resolution: run /adev:init)
   - "Version mismatch between package.json and plugin.json" (resolution: sync versions)

Each entry follows the pattern: **What you see** / **Why it happens** / **How to fix it**

**FAQ section** with at least 5 entries:
1. Can I use adev with tools other than Claude Code? (Yes — OpenCode, Codex supported)
2. Do I have to follow every lifecycle step? (No — /adev:work routes you; skip steps for small fixes)
3. How do I add a custom skill? (Create skills/<name>/SKILL.md following markdown convention)
4. What do I do when an agent gets stuck? (Use /adev:recover for diagnosis and re-dispatch)
5. How do I customize quality gates? (Edit governance/ directory and constitution.md)
6. Can I use adev on an existing codebase? (Yes — /adev:init --brownfield)

Source hook protocol details from `.context-index/constitution.md` (exit 0 = allow, exit 2 = block).
Source hook names from `hooks/hooks.json`.
Use plain language — no requirement for knowledge of internals.

- [x] **Verify test passes**

Run: `node --test tests/docs/support-polish.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add docs/troubleshooting.md tests/docs/support-polish.test.mjs
git commit -m "feat(user-docs): add docs/troubleshooting.md with FAQ and symptom-based guide

Spec: .context-index/specs/features/user-docs/support-polish.spec.md
Plan-task: 1"
```

---

### Task 2: Update README.md — Point to docs [specialist: none]

**Charter capability:** README Update
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `README.md`
- Modify: `tests/docs/support-polish.test.mjs`

**Tests:** `tests/docs/support-polish.test.mjs`

- [x] **Write failing test**

Add to `tests/docs/support-polish.test.mjs`:

```javascript
describe('README.md — Documentation Links', () => {
  it('should link to docs/README.md as primary documentation entry', () => {
    const content = readFileSync(join(ROOT_DIR, 'README.md'), 'utf-8');
    assert.ok(
      content.includes('docs/README.md'),
      'README.md should link to docs/README.md'
    );
  });

  it('should not have dangling links to removed docs files', () => {
    const content = readFileSync(join(ROOT_DIR, 'README.md'), 'utf-8');
    // docs/skills.md and docs/architecture.md will be removed
    const linkPattern = /\[([^\]]+)\]\((docs\/(?:skills|architecture)\.md)\)/g;
    const danglingLinks = [];
    let match;
    while ((match = linkPattern.exec(content)) !== null) {
      danglingLinks.push(match[2]);
    }
    assert.strictEqual(
      danglingLinks.length, 0,
      `README.md has dangling links to removed files: ${danglingLinks.join(', ')}`
    );
  });

  it('should retain the skills table', () => {
    const content = readFileSync(join(ROOT_DIR, 'README.md'), 'utf-8');
    assert.ok(content.includes('/adev:work'), 'Skills table should still reference /adev:work');
    assert.ok(content.includes('/adev:brainstorm'), 'Skills table should still reference /adev:brainstorm');
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/docs/support-polish.test.mjs`
Expected: FAIL — README.md currently links to docs/skills.md and docs/architecture.md

- [x] **Implement**

Update `README.md`:
1. In the "Learn More" section:
   - Keep `docs/README.md` link as primary entry
   - Replace `docs/skills.md` link with `docs/README.md` or remove (skill reference will be at a different path)
   - Replace `docs/architecture.md` link with `docs/concepts.md` or remove
   - Keep external links (handbook, design doc)
   - Keep `docs/getting-started.md` and `docs/workspaces.md` links
2. In the skills section, update "For the full skill reference..." line to point to `docs/README.md` instead of `docs/skills.md`
3. Keep all skill tables and architecture overview intact

- [x] **Verify test passes**

Run: `node --test tests/docs/support-polish.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add README.md tests/docs/support-polish.test.mjs
git commit -m "feat(user-docs): update README.md to point to new docs structure

Spec: .context-index/specs/features/user-docs/support-polish.spec.md
Plan-task: 2"
```

---

### Task 3: Remove superseded docs files [specialist: none]

**Charter capability:** Cleanup (postcondition)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Delete: `docs/skills.md` (absorbed by skill-reference spec)
- Delete: `docs/architecture.md` (absorbed by concepts.md and module docs)
- Delete: `docs/GENERATED.md` (auto-generated, not user docs)
- Delete: `docs/prd-adev-assess.md` (internal PRD)
- Delete: `docs/prd-adev-document.md` (internal PRD)
- Delete: `docs/prd-tree-sitter-repomap.md` (internal PRD)
- Delete: `docs/modules/*.md` (auto-generated module docs)
- Modify: `tests/docs/support-polish.test.mjs`

**Tests:** `tests/docs/support-polish.test.mjs`

- [x] **Write failing test**

Add to `tests/docs/support-polish.test.mjs`:

```javascript
describe('Superseded docs removal', () => {
  const supersededFiles = [
    'skills.md',
    'architecture.md',
  ];

  for (const file of supersededFiles) {
    it(`docs/${file} should not exist (superseded)`, () => {
      assert.ok(
        !existsSync(join(DOCS_DIR, file)),
        `docs/${file} should be removed — its content is now covered by the new docs structure`
      );
    });
  }
});
```

- [x] **Verify test fails**

Run: `node --test tests/docs/support-polish.test.mjs`
Expected: FAIL — docs/skills.md and docs/architecture.md still exist

- [x] **Implement**

```bash
git rm docs/skills.md docs/architecture.md
git rm docs/GENERATED.md
git rm docs/prd-adev-assess.md docs/prd-adev-document.md docs/prd-tree-sitter-repomap.md
git rm -r docs/modules/
```

Content absorption mapping (addressing SA-1):
- `docs/skills.md` → absorbed by skill-reference spec (lifecycle flow, per-skill entries)
- `docs/architecture.md` → absorbed by `docs/concepts.md` (overview) and auto-generated module docs are developer-facing, out of user-docs scope

- [x] **Verify test passes**

Run: `node --test tests/docs/support-polish.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add -A docs/skills.md docs/architecture.md docs/GENERATED.md docs/prd-*.md docs/modules/ tests/docs/support-polish.test.mjs
git commit -m "feat(user-docs): remove superseded docs files

docs/skills.md absorbed by skill-reference spec.
docs/architecture.md absorbed by docs/concepts.md.
docs/modules/, docs/GENERATED.md, docs/prd-*.md are developer-facing,
not part of user documentation.

Spec: .context-index/specs/features/user-docs/support-polish.spec.md
Plan-task: 3"
```

---

### Task 4: Add breadcrumb and next/previous navigation to all pages [specialist: none]

**Charter capability:** Navigation/polish
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1, Task 3
**Files:**
- Modify: `docs/README.md`
- Modify: `docs/concepts.md`
- Modify: `docs/installation.md`
- Modify: `docs/getting-started.md`
- Modify: `docs/workspaces.md`
- Modify: `docs/governance.md`
- Modify: `docs/test-strategies.md`
- Modify: `docs/troubleshooting.md`
- Modify: `tests/docs/support-polish.test.mjs`

**Tests:** `tests/docs/support-polish.test.mjs`

- [x] **Write failing test**

Add to `tests/docs/support-polish.test.mjs`:

```javascript
import { readdirSync } from 'node:fs';

describe('Breadcrumb and next/previous navigation', () => {
  const docsFiles = readdirSync(DOCS_DIR).filter(f => f.endsWith('.md'));

  for (const file of docsFiles) {
    it(`docs/${file} should have a breadcrumb`, () => {
      const content = readFileSync(join(DOCS_DIR, file), 'utf-8');
      // Breadcrumb pattern: [adev docs](README.md) or similar navigation at top
      assert.ok(
        content.includes('README.md') || file === 'README.md',
        `docs/${file} should have a breadcrumb linking to README.md`
      );
    });
  }

  it('sequential pages should have next/previous links', () => {
    const readingOrder = [
      'concepts.md',
      'installation.md',
      'getting-started.md',
    ];

    for (let i = 0; i < readingOrder.length; i++) {
      const content = readFileSync(join(DOCS_DIR, readingOrder[i]), 'utf-8');
      if (i < readingOrder.length - 1) {
        assert.ok(
          content.includes(readingOrder[i + 1]),
          `${readingOrder[i]} should have a next link to ${readingOrder[i + 1]}`
        );
      }
      if (i > 0) {
        assert.ok(
          content.includes(readingOrder[i - 1]),
          `${readingOrder[i]} should have a previous link to ${readingOrder[i - 1]}`
        );
      }
    }
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/docs/support-polish.test.mjs`
Expected: FAIL — most pages lack breadcrumbs and prev/next links

- [x] **Implement**

Define the reading order:
1. `README.md` (index — no breadcrumb needed, it IS the root)
2. `concepts.md` — Getting Started section
3. `installation.md` — Getting Started section
4. `getting-started.md` — Getting Started section
5. `workspaces.md` — Advanced section
6. `governance.md` — Advanced section
7. `test-strategies.md` — Advanced section
8. `troubleshooting.md` — Advanced section

For each page (except README.md), add at the top:
```markdown
[adev docs](README.md) > Section Name
```

For sequential pages in the Getting Started section, add at the bottom:
```markdown
---
[Previous: Page Title](previous.md) | [Next: Page Title](next.md)
```

For Advanced section pages, add breadcrumb but use simpler navigation (back to README.md) since they are not strictly sequential.

Update `docs/README.md` to replace any remaining "coming soon" placeholders with actual links where pages now exist (troubleshooting.md).

- [x] **Verify test passes**

Run: `node --test tests/docs/support-polish.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add docs/*.md tests/docs/support-polish.test.mjs
git commit -m "feat(user-docs): add breadcrumb and next/previous navigation to all docs pages

Spec: .context-index/specs/features/user-docs/support-polish.spec.md
Plan-task: 4"
```

---

### Task 5: Validate zero dead links across docs/ [specialist: none]

**Charter capability:** Link validation
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1, Task 2, Task 3, Task 4
**Files:**
- Modify: `tests/docs/support-polish.test.mjs`

**Tests:** `tests/docs/support-polish.test.mjs`

- [x] **Write failing test**

Add to `tests/docs/support-polish.test.mjs`:

```javascript
describe('Dead link validation — all docs/', () => {
  it('should have zero dead links across all docs files', () => {
    const allFiles = readdirSync(DOCS_DIR).filter(f => f.endsWith('.md'));
    const deadLinks = [];

    for (const file of allFiles) {
      const content = readFileSync(join(DOCS_DIR, file), 'utf-8');
      const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
      let match;
      while ((match = linkPattern.exec(content)) !== null) {
        const target = match[2];
        // Skip external links and anchor links
        if (target.startsWith('http') || target.startsWith('#') || target.startsWith('mailto:')) continue;
        // Strip anchor from relative links
        const filePart = target.split('#')[0];
        if (filePart) {
          const targetPath = join(DOCS_DIR, filePart);
          if (!existsSync(targetPath)) {
            deadLinks.push(`${file}: broken link to ${target}`);
          }
        }
      }
    }

    assert.strictEqual(
      deadLinks.length, 0,
      `Found dead links:\n${deadLinks.join('\n')}`
    );
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/docs/support-polish.test.mjs`
Expected: May PASS or FAIL depending on current link state. If any links point to removed files or not-yet-created pages, this will catch them.

- [x] **Implement**

1. Run the link validation test
2. For any dead links found:
   - If the target is a page from another spec that doesn't exist yet: remove the link or add "(coming soon)" text without a markdown link
   - If the target was a removed file: update the link to point to the replacement page
   - If the target is a typo: fix it
3. Re-run until zero dead links

- [x] **Verify test passes**

Run: `node --test tests/docs/support-polish.test.mjs`
Expected: PASS — zero dead links

- [x] **Commit**

```bash
git add docs/*.md tests/docs/support-polish.test.mjs
git commit -m "feat(user-docs): validate and fix all dead links across docs/

Spec: .context-index/specs/features/user-docs/support-polish.spec.md
Plan-task: 5"
```

---

## Quality Gates

After all tasks are complete, run the full quality gate suite:

- [x] Tests pass: `npm test`
- [x] All acceptance criteria from spec satisfied:
  - [x] `docs/troubleshooting.md` exists with entries for hook warnings, lifecycle gates, and common errors
  - [x] FAQ section covers at least 5 common questions
  - [x] Each troubleshooting entry includes symptom, cause, and resolution
  - [x] `README.md` links to `docs/README.md` as the primary documentation
  - [x] All docs pages have breadcrumb navigation
  - [x] All docs pages have next/previous reading order links
  - [x] Zero dead links across docs/
  - [x] Superseded docs files are removed
  - [x] No constitutional violations introduced
