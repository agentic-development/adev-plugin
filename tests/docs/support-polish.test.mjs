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
