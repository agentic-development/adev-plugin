/**
 * Tests for provides.skill_extensions — skill extension install.
 * Spec: .context-index/specs/features/extensions/skill-extension-install.spec.md
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTempDir, cleanupTempDir, writeFixture } from '../helpers.mjs';
import { installSkillExtensions } from '../../lib/extensions/content-install.mjs';
import { installExtension } from '../../lib/extensions/install.mjs';

describe('installSkillExtensions()', () => {
  let tmp, extDir;
  beforeEach(() => {
    tmp = createTempDir();
    extDir = createTempDir();
  });
  afterEach(() => {
    cleanupTempDir(tmp);
    cleanupTempDir(extDir);
  });

  // Behavior 1: single extension copied to _<ext-name>/
  it('copies a single skill extension to _<ext-name>/<skill>.md', () => {
    writeFixture(extDir, 'skills/implement.md', '# Implement extension\n');
    const result = installSkillExtensions(tmp, extDir, 'my-ext', { implement: 'skills/implement.md' });
    const dest = join(tmp, '.context-index', 'skill-extensions', '_my-ext', 'implement.md');
    assert.ok(existsSync(dest), 'dest file should exist');
    assert.equal(readFileSync(dest, 'utf8'), '# Implement extension\n');
    assert.ok(result.filesWritten.includes(dest));
  });

  // Behavior 2: multiple skill names
  it('copies multiple skill extensions each to their own file', () => {
    writeFixture(extDir, 'skills/implement.md', '# impl\n');
    writeFixture(extDir, 'skills/plan.md', '# plan\n');
    installSkillExtensions(tmp, extDir, 'my-ext', {
      implement: 'skills/implement.md',
      plan: 'skills/plan.md',
    });
    assert.ok(existsSync(join(tmp, '.context-index', 'skill-extensions', '_my-ext', 'implement.md')));
    assert.ok(existsSync(join(tmp, '.context-index', 'skill-extensions', '_my-ext', 'plan.md')));
  });

  // Behavior 3: re-install overwrites
  it('overwrites _<ext-name>/ files on re-install (idempotent)', () => {
    writeFixture(extDir, 'skills/implement.md', 'v1\n');
    installSkillExtensions(tmp, extDir, 'my-ext', { implement: 'skills/implement.md' });
    writeFixture(extDir, 'skills/implement.md', 'v2\n');
    installSkillExtensions(tmp, extDir, 'my-ext', { implement: 'skills/implement.md' });
    const dest = join(tmp, '.context-index', 'skill-extensions', '_my-ext', 'implement.md');
    assert.equal(readFileSync(dest, 'utf8'), 'v2\n');
  });

  // Behavior 4: invalid skill name
  it('throws INVALID_SKILL_NAME for skill name with / before any writes', () => {
    writeFixture(extDir, 'skills/implement.md', '# impl\n');
    let err;
    try {
      installSkillExtensions(tmp, extDir, 'my-ext', { 'path/hack': 'skills/implement.md' });
    } catch (e) {
      err = e;
    }
    assert.ok(err, 'should throw');
    assert.equal(err.code, 'INVALID_SKILL_NAME');
    assert.ok(!existsSync(join(tmp, '.context-index', 'skill-extensions', '_my-ext')), 'no dir created');
  });

  // Behavior 5: path traversal in source
  it('throws PATH_TRAVERSAL for source path escaping extension root before any writes', () => {
    let err;
    try {
      installSkillExtensions(tmp, extDir, 'my-ext', { implement: '../../etc/passwd' });
    } catch (e) {
      err = e;
    }
    assert.ok(err, 'should throw');
    assert.equal(err.code, 'PATH_TRAVERSAL');
    assert.ok(!existsSync(join(tmp, '.context-index', 'skill-extensions', '_my-ext')), 'no dir created');
  });

  // Behavior 6: missing source file
  it('throws MISSING_SKILL_EXT_FILE when declared file does not exist', () => {
    let err;
    try {
      installSkillExtensions(tmp, extDir, 'my-ext', { implement: 'skills/nonexistent.md' });
    } catch (e) {
      err = e;
    }
    assert.ok(err, 'should throw');
    assert.equal(err.code, 'MISSING_SKILL_EXT_FILE');
  });

  // INVALID_FILE_TYPE (review note SA-1)
  it('throws INVALID_FILE_TYPE for non-markdown source file', () => {
    writeFixture(extDir, 'skills/implement.sh', '#!/bin/sh\n');
    let err;
    try {
      installSkillExtensions(tmp, extDir, 'my-ext', { implement: 'skills/implement.sh' });
    } catch (e) {
      err = e;
    }
    assert.ok(err, 'should throw');
    assert.equal(err.code, 'INVALID_FILE_TYPE');
  });

  // Behavior 7: absent or empty provides.skill_extensions → no directory created
  it('is a no-op when called with empty map', () => {
    installSkillExtensions(tmp, extDir, 'my-ext', {});
    assert.ok(
      !existsSync(join(tmp, '.context-index', 'skill-extensions', '_my-ext')),
      'no dir should be created'
    );
  });

  // Behavior 8: project-level file untouched
  it('never touches project-level skill-extensions/<skill>.md', () => {
    writeFixture(extDir, 'skills/implement.md', '# ext\n');
    writeFixture(tmp, '.context-index/skill-extensions/implement.md', '# project\n');
    installSkillExtensions(tmp, extDir, 'my-ext', { implement: 'skills/implement.md' });
    const projectFile = join(tmp, '.context-index', 'skill-extensions', 'implement.md');
    assert.equal(readFileSync(projectFile, 'utf8'), '# project\n', 'project file must be untouched');
  });
});

describe('installExtension() with provides.skill_extensions', () => {
  let tmp, extDir;
  beforeEach(() => {
    tmp = createTempDir();
    extDir = createTempDir();
    writeFixture(tmp, '.context-index/manifest.yaml', 'project:\n  name: test\n');
  });
  afterEach(() => {
    cleanupTempDir(tmp);
    cleanupTempDir(extDir);
  });

  it('includes skill extension files in install report filesWritten', async () => {
    writeFixture(
      extDir,
      'adev-extension.yaml',
      'name: skill-ext\nversion: 1.0.0\nprovides:\n  skill_extensions:\n    implement: skills/implement.md\n'
    );
    writeFixture(extDir, 'skills/implement.md', '# impl\n');
    const report = await installExtension(extDir, tmp);
    assert.ok(report.filesWritten.some(f => f.includes('_skill-ext') && f.includes('implement.md')));
  });

  it('skips skill extension step when provides.skill_extensions is absent', async () => {
    writeFixture(extDir, 'adev-extension.yaml', 'name: no-ext\nversion: 1.0.0\nprovides: {}\n');
    await assert.doesNotReject(() => installExtension(extDir, tmp));
    assert.ok(!existsSync(join(tmp, '.context-index', 'skill-extensions', '_no-ext')));
  });
});
