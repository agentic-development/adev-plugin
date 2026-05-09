import { describe, it } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert';

const DOCS_DIR = join(import.meta.dirname, '..', '..', 'docs');

describe('docs/design-phase.md — Design Phase Guide', () => {
  it('should exist', () => {
    assert.ok(existsSync(join(DOCS_DIR, 'design-phase.md')));
  });

  it('should cover brainstorm skill', () => {
    const content = readFileSync(join(DOCS_DIR, 'design-phase.md'), 'utf-8');
    assert.ok(content.includes('brainstorm') || content.includes('Brainstorm'), 'Missing brainstorm skill');
    assert.ok(content.includes('/adev:brainstorm'), 'Missing /adev:brainstorm invocation');
  });

  it('should cover specify skill', () => {
    const content = readFileSync(join(DOCS_DIR, 'design-phase.md'), 'utf-8');
    assert.ok(content.includes('specify') || content.includes('Specify'), 'Missing specify skill');
    assert.ok(content.includes('/adev:specify'), 'Missing /adev:specify invocation');
  });

  it('should cover review-specs skill', () => {
    const content = readFileSync(join(DOCS_DIR, 'design-phase.md'), 'utf-8');
    assert.ok(content.includes('review-specs') || content.includes('Review'), 'Missing review-specs skill');
    assert.ok(content.includes('/adev:review-specs'), 'Missing /adev:review-specs invocation');
  });

  it('should cover prototype skill', () => {
    const content = readFileSync(join(DOCS_DIR, 'design-phase.md'), 'utf-8');
    assert.ok(content.includes('prototype') || content.includes('Prototype'), 'Missing prototype skill');
    assert.ok(content.includes('/adev:prototype'), 'Missing /adev:prototype invocation');
  });

  it('should include skill descriptions with what, when, and prerequisites', () => {
    const content = readFileSync(join(DOCS_DIR, 'design-phase.md'), 'utf-8');
    assert.ok(content.includes('when') || content.includes('When'), 'Missing when-to-use guidance');
  });

  it('should document the design-to-build gate transition', () => {
    const content = readFileSync(join(DOCS_DIR, 'design-phase.md'), 'utf-8');
    assert.ok(
      content.includes('review') && (content.includes('gate') || content.includes('Gate') || content.includes('pass') || content.includes('PASS')),
      'Missing design-to-build gate transition'
    );
  });

  it('should link to skill reference entries', () => {
    const content = readFileSync(join(DOCS_DIR, 'design-phase.md'), 'utf-8');
    assert.ok(content.includes('skills.md'), 'Missing link to skill reference');
  });

  it('should link to build-phase.md as next phase', () => {
    const content = readFileSync(join(DOCS_DIR, 'design-phase.md'), 'utf-8');
    assert.ok(content.includes('build-phase.md'), 'Missing next-phase link to build-phase.md');
  });
});

describe('docs/build-phase.md — Build Phase Guide', () => {
  it('should exist', () => {
    assert.ok(existsSync(join(DOCS_DIR, 'build-phase.md')));
  });

  it('should cover plan skill', () => {
    const content = readFileSync(join(DOCS_DIR, 'build-phase.md'), 'utf-8');
    assert.ok(content.includes('/adev:plan'), 'Missing /adev:plan invocation');
  });

  it('should cover route skill', () => {
    const content = readFileSync(join(DOCS_DIR, 'build-phase.md'), 'utf-8');
    assert.ok(content.includes('/adev:route'), 'Missing /adev:route invocation');
  });

  it('should cover implement skill', () => {
    const content = readFileSync(join(DOCS_DIR, 'build-phase.md'), 'utf-8');
    assert.ok(content.includes('/adev:implement'), 'Missing /adev:implement invocation');
  });

  it('should cover write-test skill', () => {
    const content = readFileSync(join(DOCS_DIR, 'build-phase.md'), 'utf-8');
    assert.ok(content.includes('/adev:write-test'), 'Missing /adev:write-test invocation');
  });

  it('should cover build skill', () => {
    const content = readFileSync(join(DOCS_DIR, 'build-phase.md'), 'utf-8');
    assert.ok(content.includes('/adev:build'), 'Missing /adev:build invocation');
  });

  it('should describe TDD workflow', () => {
    const content = readFileSync(join(DOCS_DIR, 'build-phase.md'), 'utf-8');
    assert.ok(content.includes('TDD') || content.includes('test-driven'), 'Missing TDD description');
  });

  it('should link to skill reference entries', () => {
    const content = readFileSync(join(DOCS_DIR, 'build-phase.md'), 'utf-8');
    assert.ok(content.includes('skills.md'), 'Missing link to skill reference');
  });

  it('should link to validate-debug.md as next phase', () => {
    const content = readFileSync(join(DOCS_DIR, 'build-phase.md'), 'utf-8');
    assert.ok(content.includes('validate-debug.md'), 'Missing next-phase link to validate-debug.md');
  });

  it('should document the review-passed gate prerequisite', () => {
    const content = readFileSync(join(DOCS_DIR, 'build-phase.md'), 'utf-8');
    assert.ok(
      content.includes('review') && (content.includes('prerequisite') || content.includes('Prerequisite') || content.includes('gate') || content.includes('before')),
      'Missing review-passed prerequisite description'
    );
  });
});

describe('docs/validate-debug.md — Validate & Debug Guide', () => {
  it('should exist', () => {
    assert.ok(existsSync(join(DOCS_DIR, 'validate-debug.md')));
  });

  it('should cover validate skill', () => {
    const content = readFileSync(join(DOCS_DIR, 'validate-debug.md'), 'utf-8');
    assert.ok(content.includes('/adev:validate'), 'Missing /adev:validate invocation');
  });

  it('should cover debug skill', () => {
    const content = readFileSync(join(DOCS_DIR, 'validate-debug.md'), 'utf-8');
    assert.ok(content.includes('/adev:debug'), 'Missing /adev:debug invocation');
  });

  it('should cover eval skill', () => {
    const content = readFileSync(join(DOCS_DIR, 'validate-debug.md'), 'utf-8');
    assert.ok(content.includes('/adev:eval'), 'Missing /adev:eval invocation');
  });

  it('should cover recover skill', () => {
    const content = readFileSync(join(DOCS_DIR, 'validate-debug.md'), 'utf-8');
    assert.ok(content.includes('/adev:recover'), 'Missing /adev:recover invocation');
  });

  it('should link to skill reference entries', () => {
    const content = readFileSync(join(DOCS_DIR, 'validate-debug.md'), 'utf-8');
    assert.ok(content.includes('skills.md'), 'Missing link to skill reference');
  });

  it('should link to maintain.md as next phase', () => {
    const content = readFileSync(join(DOCS_DIR, 'validate-debug.md'), 'utf-8');
    assert.ok(content.includes('maintain.md'), 'Missing next-phase link to maintain.md');
  });
});

describe('docs/maintain.md — Maintain Phase Guide', () => {
  it('should exist', () => {
    assert.ok(existsSync(join(DOCS_DIR, 'maintain.md')));
  });

  it('should cover issues skill', () => {
    const content = readFileSync(join(DOCS_DIR, 'maintain.md'), 'utf-8');
    assert.ok(content.includes('/adev:issues'), 'Missing /adev:issues invocation');
  });

  it('should cover status skill', () => {
    const content = readFileSync(join(DOCS_DIR, 'maintain.md'), 'utf-8');
    assert.ok(content.includes('/adev:status'), 'Missing /adev:status invocation');
  });

  it('should cover hygiene skill', () => {
    const content = readFileSync(join(DOCS_DIR, 'maintain.md'), 'utf-8');
    assert.ok(content.includes('/adev:hygiene'), 'Missing /adev:hygiene invocation');
  });

  it('should cover retro skill', () => {
    const content = readFileSync(join(DOCS_DIR, 'maintain.md'), 'utf-8');
    assert.ok(content.includes('/adev:retro'), 'Missing /adev:retro invocation');
  });

  it('should cover codehealth skill', () => {
    const content = readFileSync(join(DOCS_DIR, 'maintain.md'), 'utf-8');
    assert.ok(content.includes('/adev:codehealth'), 'Missing /adev:codehealth invocation');
  });

  it('should cover repomap skill', () => {
    const content = readFileSync(join(DOCS_DIR, 'maintain.md'), 'utf-8');
    assert.ok(content.includes('/adev:repomap'), 'Missing /adev:repomap invocation');
  });

  it('should cover reconcile skill', () => {
    const content = readFileSync(join(DOCS_DIR, 'maintain.md'), 'utf-8');
    assert.ok(content.includes('/adev:reconcile'), 'Missing /adev:reconcile invocation');
  });

  it('should cover sample skill', () => {
    const content = readFileSync(join(DOCS_DIR, 'maintain.md'), 'utf-8');
    assert.ok(content.includes('/adev:sample'), 'Missing /adev:sample invocation');
  });

  it('should link to skill reference entries', () => {
    const content = readFileSync(join(DOCS_DIR, 'maintain.md'), 'utf-8');
    assert.ok(content.includes('skills.md'), 'Missing link to skill reference');
  });
});

describe('Workflow Guides — TOC and cross-page links', () => {
  it('should have all four workflow guides linked from README.md', () => {
    const content = readFileSync(join(DOCS_DIR, 'README.md'), 'utf-8');
    assert.ok(content.includes('design-phase.md'), 'Missing link to design-phase.md');
    assert.ok(content.includes('build-phase.md'), 'Missing link to build-phase.md');
    assert.ok(content.includes('validate-debug.md'), 'Missing link to validate-debug.md');
    assert.ok(content.includes('maintain.md'), 'Missing link to maintain.md');
  });

  it('should not have "coming soon" for workflow guide entries in README.md', () => {
    const content = readFileSync(join(DOCS_DIR, 'README.md'), 'utf-8');
    const workflowSection = content.split('## Workflow')[1]?.split('##')[0] || '';
    assert.ok(!workflowSection.includes('coming soon'), 'Workflow Guides section still has "coming soon" entries');
  });

  it('should have all relative links in workflow guides resolve to existing files', () => {
    const pages = ['design-phase.md', 'build-phase.md', 'validate-debug.md', 'maintain.md'];
    for (const page of pages) {
      const content = readFileSync(join(DOCS_DIR, page), 'utf-8');
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
            `${page}: broken link to ${target} (expected file at ${targetPath})`
          );
        }
      }
    }
  });

  it('should have sequential next-phase links', () => {
    const design = readFileSync(join(DOCS_DIR, 'design-phase.md'), 'utf-8');
    assert.ok(design.includes('build-phase.md'), 'design-phase.md should link to build-phase.md');

    const build = readFileSync(join(DOCS_DIR, 'build-phase.md'), 'utf-8');
    assert.ok(build.includes('validate-debug.md'), 'build-phase.md should link to validate-debug.md');

    const validate = readFileSync(join(DOCS_DIR, 'validate-debug.md'), 'utf-8');
    assert.ok(validate.includes('maintain.md'), 'validate-debug.md should link to maintain.md');
  });
});
