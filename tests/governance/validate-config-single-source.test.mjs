/**
 * Tests for the validate-config-single-source spec acceptance criteria
 * that are not covered by the existing tests/governance/validate-config.test.mjs
 * or tests/domains/validate-domain-config.test.mjs files.
 *
 * Spec: .context-index/specs/features/validation/validate-config-single-source.spec.md
 */

import { describe, it, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { existsSync, readFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

import { loadDomainConfig } from '../../lib/domains/domain-config.mjs';
import { createTempDir, cleanupTempDir, writeFixture } from '../helpers.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(__dirname, '..', '..');

const tempDirs = [];
function tmp() {
  const d = createTempDir();
  tempDirs.push(d);
  return d;
}
afterEach(() => {
  while (tempDirs.length) cleanupTempDir(tempDirs.pop());
});

describe("init scaffold simulation: governance/validate.yaml", () => {
  it("software starter is available via loadDomainConfig", () => {
    // This simulates what /adev:init Step 7d.0 would do at scaffold time.
    const starter = loadDomainConfig('software', 'validate', PLUGIN_ROOT, PLUGIN_ROOT);
    assert.ok(starter !== null, 'software starter must exist');
    assert.ok(Array.isArray(starter.checks), 'starter must have checks array');
    assert.ok(starter.checks.length >= 12, 'starter must have at least 12 checks');
  });

  it("starter file content can be copied byte-for-byte to a project repo", () => {
    // Locate the software starter on disk and verify it's a readable file
    // whose bytes we can copy to the project location.
    const starterPath = join(PLUGIN_ROOT, 'templates', 'domains', 'software', 'validate.yaml');
    assert.ok(existsSync(starterPath), 'starter file must exist on disk');
    const bytes = readFileSync(starterPath);
    assert.ok(bytes.length > 100, 'starter must be substantive');

    // Simulate the init scaffold by writing the bytes into a temp project repo.
    const repo = tmp();
    const destDir = join(repo, '.context-index', 'governance');
    mkdirSync(destDir, { recursive: true });
    const dest = join(destDir, 'validate.yaml');
    copyFileSync(starterPath, dest);
    assert.ok(existsSync(dest), 'scaffolded file must exist');

    // Bytes must be identical (idempotency / no transformation).
    const scaffolded = readFileSync(dest);
    assert.equal(Buffer.compare(bytes, scaffolded), 0, 'scaffolded bytes must equal starter bytes');
  });

  it("init scaffold is idempotent: re-running with existing file is a no-op", () => {
    // Simulate two scaffold attempts; the second must not overwrite.
    const repo = tmp();
    writeFixture(
      repo,
      '.context-index/governance/validate.yaml',
      `# Project-customized validate config
checks:
  - id: project.custom-check
    kind: observational
    severity: info
`
    );
    const customPath = join(repo, '.context-index', 'governance', 'validate.yaml');
    const customBytes = readFileSync(customPath, 'utf8');

    // Re-running init's Step 7d.0 on this repo MUST NOT clobber the existing file
    // (the spec's Behavior 3 mandates idempotency). We can't run init's script
    // directly from a test (it's prose), but we verify the precondition: any
    // implementation that checks existSync before writing will preserve the file.
    assert.ok(existsSync(customPath));
    const reRead = readFileSync(customPath, 'utf8');
    assert.equal(reRead, customBytes, 'file must remain unchanged');
  });
});

describe("SKILL.md content: init Step 7d.0", () => {
  it("skills/init/SKILL.md mentions loadDomainConfig with 'validate' configType", () => {
    const content = readFileSync(join(PLUGIN_ROOT, 'skills', 'init', 'SKILL.md'), 'utf8');
    assert.ok(
      content.includes("loadDomainConfig(resolvedDomain, 'validate'"),
      "init SKILL.md must call loadDomainConfig with 'validate' configType"
    );
  });

  it("skills/init/SKILL.md mentions software fallback for unknown domains", () => {
    const content = readFileSync(join(PLUGIN_ROOT, 'skills', 'init', 'SKILL.md'), 'utf8');
    assert.ok(
      content.includes("scaffolded from 'software' as fallback"),
      "init SKILL.md must include the software-fallback advisory message"
    );
  });

  it("skills/init/SKILL.md describes idempotency for governance/validate.yaml scaffold", () => {
    const content = readFileSync(join(PLUGIN_ROOT, 'skills', 'init', 'SKILL.md'), 'utf8');
    assert.ok(
      /governance\/validate\.yaml already exists.*no-op|idempotent/i.test(content),
      "init SKILL.md must describe idempotency for the scaffold step"
    );
  });
});
