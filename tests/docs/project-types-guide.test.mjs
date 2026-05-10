import { describe, it } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert';

const DOCS_DIR = join(import.meta.dirname, '..', '..', 'docs');
const EVALS_DIR = join(import.meta.dirname, '..', '..', 'tests', 'evals');
const ROOT = join(import.meta.dirname, '..', '..');

// Task 1: Fixture availability
describe('Eval fixture availability', () => {
  it('should have at least 3 eval fixture directories', () => {
    const fixtures = ['adev-api-eval', 'adev-data-eval', 'adev-migrations-eval', 'adev-pipeline-eval'];
    const existing = fixtures.filter(f => existsSync(join(EVALS_DIR, f)));
    assert.ok(existing.length >= 3, `Need at least 3 fixtures, found ${existing.length}: ${existing.join(', ')}`);
  });
});

// Task 2: Guide content
describe('docs/project-types.md — Project Types Guide', () => {
  it('should exist', () => {
    assert.ok(existsSync(join(DOCS_DIR, 'project-types.md')));
  });

  it('should contain at least 3 project type examples', () => {
    const content = readFileSync(join(DOCS_DIR, 'project-types.md'), 'utf-8');
    // Each example should have a heading with the project type
    const exampleHeadings = content.match(/^## .+/gm) || [];
    // Filter out non-example headings (intro, extrapolation, etc.)
    const projectExamples = exampleHeadings.filter(h =>
      !h.includes('Introduction') &&
      !h.includes('Extrapolat') &&
      !h.includes('Pattern') &&
      !h.includes('What You') &&
      !h.includes('Applying') &&
      !h.includes('Your Own')
    );
    assert.ok(projectExamples.length >= 3, `Need at least 3 project type examples, found ${projectExamples.length}`);
  });

  it('should reference eval fixture paths for each example', () => {
    const content = readFileSync(join(DOCS_DIR, 'project-types.md'), 'utf-8');
    assert.ok(content.includes('tests/evals/'), 'Should reference eval fixture paths');
    // At least 3 distinct fixture references
    const fixtureRefs = content.match(/tests\/evals\/adev-\w+-eval/g) || [];
    const uniqueFixtures = new Set(fixtureRefs);
    assert.ok(uniqueFixtures.size >= 3, `Need at least 3 distinct fixture references, found ${uniqueFixtures.size}`);
  });

  it('should show charter artifacts for each project type', () => {
    const content = readFileSync(join(DOCS_DIR, 'project-types.md'), 'utf-8');
    assert.ok(content.includes('charter') || content.includes('Charter'), 'Should show charter examples');
  });

  it('should show spec artifacts for each project type', () => {
    const content = readFileSync(join(DOCS_DIR, 'project-types.md'), 'utf-8');
    assert.ok(content.includes('spec') || content.includes('Spec'), 'Should show spec examples');
  });

  it('should show how adev:init detects project type', () => {
    const content = readFileSync(join(DOCS_DIR, 'project-types.md'), 'utf-8');
    assert.ok(
      content.includes('adev:init') || content.includes('/adev:init'),
      'Should explain how init detects project type'
    );
  });

  it('should show constitution examples for each project type', () => {
    const content = readFileSync(join(DOCS_DIR, 'project-types.md'), 'utf-8');
    assert.ok(content.includes('constitution') || content.includes('Constitution'), 'Should show constitution examples');
  });

  it('should show manifest examples for each project type', () => {
    const content = readFileSync(join(DOCS_DIR, 'project-types.md'), 'utf-8');
    assert.ok(content.includes('manifest') || content.includes('Manifest'), 'Should show manifest examples');
  });
});

// Task 3: Extrapolation guidance
describe('docs/project-types.md — Extrapolation guidance', () => {
  it('should have a section helping readers apply patterns to unlisted project types', () => {
    const content = readFileSync(join(DOCS_DIR, 'project-types.md'), 'utf-8');
    assert.ok(
      content.includes('other project') ||
      content.includes('your project') ||
      content.includes('Extrapolat') ||
      content.includes('Applying') ||
      content.includes('Your Own'),
      'Should have extrapolation guidance for unlisted project types'
    );
  });

  it('should mention common patterns that transfer across project types', () => {
    const content = readFileSync(join(DOCS_DIR, 'project-types.md'), 'utf-8');
    assert.ok(
      content.includes('pattern') || content.includes('Pattern'),
      'Should describe transferable patterns'
    );
  });
});

// Task 4: README link
describe('docs/README.md — Project Types link', () => {
  it('should link to project-types.md (not coming soon)', () => {
    const content = readFileSync(join(DOCS_DIR, 'README.md'), 'utf-8');
    assert.ok(content.includes('project-types.md'), 'README.md should link to project-types.md');
    // Verify it is a real link, not just text
    assert.ok(
      content.includes('[') && content.includes('](project-types.md'),
      'Should be a markdown link to project-types.md'
    );
  });
});

// Task 5: Link integrity and acceptance criteria verification
describe('docs/project-types.md — Link integrity', () => {
  it('should have all relative links resolve to existing files', () => {
    const content = readFileSync(join(DOCS_DIR, 'project-types.md'), 'utf-8');
    const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;
    while ((match = linkPattern.exec(content)) !== null) {
      const target = match[2];
      if (target.startsWith('http') || target.startsWith('#')) continue;
      const filePart = target.split('#')[0];
      if (filePart) {
        const targetPath = join(DOCS_DIR, filePart);
        assert.ok(
          existsSync(targetPath),
          `Broken link to ${target} (expected file at ${targetPath})`
        );
      }
    }
  });

  it('should reference only existing fixture directories', () => {
    const content = readFileSync(join(DOCS_DIR, 'project-types.md'), 'utf-8');
    const fixtureRefs = content.match(/tests\/evals\/adev-[\w-]+-eval/g) || [];
    for (const ref of fixtureRefs) {
      assert.ok(
        existsSync(join(ROOT, ref)),
        `Fixture reference ${ref} does not exist (STALE_FIXTURE)`
      );
    }
  });
});

describe('Acceptance criteria checklist', () => {
  it('project-types.md exists with at least 3 examples', () => {
    assert.ok(existsSync(join(DOCS_DIR, 'project-types.md')));
    const content = readFileSync(join(DOCS_DIR, 'project-types.md'), 'utf-8');
    const fixtureRefs = content.match(/tests\/evals\/adev-\w+-eval/g) || [];
    const uniqueFixtures = new Set(fixtureRefs);
    assert.ok(uniqueFixtures.size >= 3);
  });

  it('guide is reachable from docs/README.md', () => {
    const readme = readFileSync(join(DOCS_DIR, 'README.md'), 'utf-8');
    assert.ok(readme.includes('project-types.md'));
  });
});
