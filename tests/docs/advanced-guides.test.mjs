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
