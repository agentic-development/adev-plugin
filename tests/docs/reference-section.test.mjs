import { describe, it } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert';

const DOCS_DIR = join(import.meta.dirname, '..', '..', 'docs');

describe('docs/skill-reference.md — Skill Reference', () => {
  it('should exist', () => {
    assert.ok(existsSync(join(DOCS_DIR, 'skill-reference.md')));
  });

  it('should be organized by lifecycle phase', () => {
    const content = readFileSync(join(DOCS_DIR, 'skill-reference.md'), 'utf-8');
    const phases = ['Setup', 'Triage', 'Design', 'Build', 'Validation', 'Maintenance'];
    for (const phase of phases) {
      assert.ok(
        content.includes(phase),
        `Missing lifecycle phase grouping: ${phase}`
      );
    }
  });

  it('should contain a summary table listing skills', () => {
    const content = readFileSync(join(DOCS_DIR, 'skill-reference.md'), 'utf-8');
    assert.ok(content.includes('| Skill'), 'Missing skill summary table');
    assert.ok(content.includes('Purpose') || content.includes('Description'), 'Missing purpose column');
  });

  it('should have an entry for every skill in the plugin', () => {
    const content = readFileSync(join(DOCS_DIR, 'skill-reference.md'), 'utf-8');
    const expectedSkills = [
      'init', 'sync', 'using-adev', 'work',
      'brainstorm', 'specify', 'review-specs', 'prototype',
      'plan', 'route', 'implement', 'write-test', 'build',
      'validate', 'debug', 'eval', 'recover',
      'issues', 'status', 'hygiene', 'retro', 'codehealth',
      'repomap', 'reconcile', 'sample', 'document',
      'research', 'learn', 'assess'
    ];
    for (const skill of expectedSkills) {
      assert.ok(
        content.includes(`adev:${skill}`) || content.includes(`/adev:${skill}`),
        `Missing skill entry: ${skill}`
      );
    }
  });

  it('should include purpose, prerequisites, and arguments for each entry', () => {
    const content = readFileSync(join(DOCS_DIR, 'skill-reference.md'), 'utf-8');
    assert.ok(content.includes('Purpose') || content.includes('purpose'), 'Missing purpose in entries');
    assert.ok(content.includes('Prerequisite') || content.includes('prerequisite'), 'Missing prerequisites in entries');
    assert.ok(content.includes('Argument') || content.includes('argument') || content.includes('Usage'), 'Missing arguments in entries');
  });

  it('should include example invocations', () => {
    const content = readFileSync(join(DOCS_DIR, 'skill-reference.md'), 'utf-8');
    assert.ok(content.includes('Example') || content.includes('example'), 'Missing example invocations');
  });

  it('should link back to workflow guides rather than re-explaining concepts (Behavior 8)', () => {
    const content = readFileSync(join(DOCS_DIR, 'skill-reference.md'), 'utf-8');
    assert.ok(
      content.includes('concepts.md') || content.includes('getting-started.md'),
      'Should cross-reference other guide pages'
    );
  });
});

describe('docs/configuration.md — Configuration Reference', () => {
  it('should exist', () => {
    assert.ok(existsSync(join(DOCS_DIR, 'configuration.md')));
  });

  it('should document all manifest.yaml sections', () => {
    const content = readFileSync(join(DOCS_DIR, 'configuration.md'), 'utf-8');
    const sections = [
      'project', 'sync', 'modules', 'specialists', 'gates',
      'completion', 'tasks', 'provenance', 'repomap', 'hygiene', 'integrations'
    ];
    for (const section of sections) {
      assert.ok(
        content.includes(section),
        `Missing manifest.yaml section: ${section}`
      );
    }
  });

  it('should document all constitution.md sections', () => {
    const content = readFileSync(join(DOCS_DIR, 'configuration.md'), 'utf-8');
    const sections = [
      'Identity', 'Principles', 'Coding Standards',
      'Architecture Boundaries', 'Context Routing', 'Quality Gates'
    ];
    for (const section of sections) {
      assert.ok(
        content.includes(section),
        `Missing constitution.md section: ${section}`
      );
    }
  });

  it('should document platform-context.yaml', () => {
    const content = readFileSync(join(DOCS_DIR, 'configuration.md'), 'utf-8');
    assert.ok(
      content.includes('platform-context') || content.includes('Platform Context'),
      'Missing platform-context.yaml documentation'
    );
  });

  it('should document default values for fields that have them', () => {
    const content = readFileSync(join(DOCS_DIR, 'configuration.md'), 'utf-8');
    assert.ok(
      content.includes('Default') || content.includes('default'),
      'Missing default value documentation'
    );
  });

  it('should note that credentials belong in env vars (SEC-3)', () => {
    const content = readFileSync(join(DOCS_DIR, 'configuration.md'), 'utf-8');
    assert.ok(
      content.includes('environment variable') || content.includes('env var'),
      'Missing note about credentials in env vars (SEC-3)'
    );
  });
});

describe('docs/hooks.md — Hooks Reference', () => {
  it('should exist', () => {
    assert.ok(existsSync(join(DOCS_DIR, 'hooks.md')));
  });

  it('should be organized by trigger point', () => {
    const content = readFileSync(join(DOCS_DIR, 'hooks.md'), 'utf-8');
    const triggers = ['SessionStart', 'PreToolUse', 'PostToolUse'];
    for (const trigger of triggers) {
      assert.ok(
        content.includes(trigger),
        `Missing trigger point: ${trigger}`
      );
    }
  });

  it('should contain a summary table', () => {
    const content = readFileSync(join(DOCS_DIR, 'hooks.md'), 'utf-8');
    assert.ok(content.includes('| Hook') || content.includes('| Name'), 'Missing hooks summary table');
  });

  it('should have entries for all 11 hooks', () => {
    const content = readFileSync(join(DOCS_DIR, 'hooks.md'), 'utf-8');
    const hooks = [
      'session-start', 'context-preflight', 'constitution-linter',
      'lifecycle-gate-edit', 'merge-guard', 'lifecycle-gate-bash',
      'context-read-tracker', 'sync-trigger', 'session-capture',
      'issue-reminder', 'lifecycle-gate-advisory'
    ];
    for (const hook of hooks) {
      assert.ok(
        content.includes(hook),
        `Missing hook entry: ${hook}`
      );
    }
  });

  it('should document blocking vs advisory behavior', () => {
    const content = readFileSync(join(DOCS_DIR, 'hooks.md'), 'utf-8');
    assert.ok(
      content.includes('block') || content.includes('Block'),
      'Missing blocking behavior documentation'
    );
    assert.ok(
      content.includes('advisory') || content.includes('Advisory') || content.includes('advise'),
      'Missing advisory behavior documentation'
    );
  });

  it('should explain resolution steps for blocking hooks (Behavior 7)', () => {
    const content = readFileSync(join(DOCS_DIR, 'hooks.md'), 'utf-8');
    assert.ok(
      content.includes('resolve') || content.includes('Resolution') || content.includes('resolution'),
      'Missing resolution steps for blocking hooks'
    );
  });

  it('should note that hook scripts should sanitize stdin (SEC-4)', () => {
    const content = readFileSync(join(DOCS_DIR, 'hooks.md'), 'utf-8');
    assert.ok(
      content.includes('sanitiz') || content.includes('validat'),
      'Missing note about stdin sanitization (SEC-4)'
    );
  });

  it('should document the hook protocol (exit codes and JSON)', () => {
    const content = readFileSync(join(DOCS_DIR, 'hooks.md'), 'utf-8');
    assert.ok(content.includes('exit 0') || content.includes('exit code 0'), 'Missing exit 0 documentation');
    assert.ok(content.includes('exit 2') || content.includes('exit code 2'), 'Missing exit 2 documentation');
    assert.ok(content.includes('JSON') || content.includes('json'), 'Missing JSON protocol documentation');
  });
});

describe('docs/README.md — Reference section links', () => {
  it('should link to skill-reference.md', () => {
    const content = readFileSync(join(DOCS_DIR, 'README.md'), 'utf-8');
    assert.ok(content.includes('[Skill Reference](skill-reference.md)'), 'Missing active link to skill-reference.md');
  });

  it('should link to configuration.md', () => {
    const content = readFileSync(join(DOCS_DIR, 'README.md'), 'utf-8');
    assert.ok(content.includes('[Configuration Reference](configuration.md)'), 'Missing active link to configuration.md');
  });

  it('should link to hooks.md', () => {
    const content = readFileSync(join(DOCS_DIR, 'README.md'), 'utf-8');
    assert.ok(content.includes('[Hooks Reference](hooks.md)'), 'Missing active link to hooks.md');
  });

  it('should not have "coming soon" for reference pages', () => {
    const content = readFileSync(join(DOCS_DIR, 'README.md'), 'utf-8');
    const refStart = content.indexOf('## Reference');
    const refEnd = content.indexOf('##', refStart + 1);
    const refSection = content.slice(refStart, refEnd > -1 ? refEnd : undefined);
    assert.ok(
      !refSection.includes('coming soon'),
      'Reference section should not have "coming soon" markers'
    );
  });
});

describe('Cross-page links in reference pages', () => {
  const refPages = ['skill-reference.md', 'configuration.md', 'hooks.md'];

  it('should have all relative links resolve to existing files', () => {
    for (const page of refPages) {
      const filePath = join(DOCS_DIR, page);
      if (!existsSync(filePath)) continue;
      const content = readFileSync(filePath, 'utf-8');
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
            `${page}: broken link to ${target}`
          );
        }
      }
    }
  });
});
