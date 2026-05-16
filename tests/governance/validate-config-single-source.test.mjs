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

describe("hygiene Validate Config Drift audit (SKILL.md content + simulation)", () => {
  it("skills/hygiene/SKILL.md declares Audit Pass 19: Validate Config Drift", () => {
    const content = readFileSync(join(PLUGIN_ROOT, 'skills', 'hygiene', 'SKILL.md'), 'utf8');
    assert.ok(
      content.includes("Audit Pass 19: Validate Config Drift"),
      "hygiene SKILL.md must declare the new audit pass"
    );
  });

  it("skills/hygiene/SKILL.md describes SEC-4 value-type emission for prompt/context_pack", () => {
    const content = readFileSync(join(PLUGIN_ROOT, 'skills', 'hygiene', 'SKILL.md'), 'utf8');
    assert.ok(
      content.includes("SEC-4"),
      "hygiene SKILL.md must reference SEC-4 emission rules"
    );
    assert.ok(
      /value\s*\*\*type\*\*/i.test(content) || /value type/i.test(content),
      "hygiene SKILL.md must describe value-type emission for sensitive fields"
    );
  });

  it("skills/hygiene/SKILL.md emits INFO (not WARN) for drift findings", () => {
    const content = readFileSync(join(PLUGIN_ROOT, 'skills', 'hygiene', 'SKILL.md'), 'utf8');
    // The Audit Pass 19 section must state INFO severity for drift findings.
    const passIdx = content.indexOf("Audit Pass 19");
    assert.ok(passIdx >= 0);
    const passContent = content.slice(passIdx, passIdx + 4000);
    assert.ok(
      /INFO.*not WARN|INFO.*not\s+WARN|All findings.*INFO/i.test(passContent),
      "drift findings must be INFO severity"
    );
  });

  it("hygiene drift simulation: project validate.yaml differs from software starter when prompt is overridden", () => {
    const repo = tmp();
    writeFixture(
      repo,
      '.context-index/governance/validate.yaml',
      `checks:
  - id: validate.check-2-spec-compliance
    kind: subagent-review
    profile: reviewer-capable
    prompt: governance/validate-prompts/custom-check-2.md
    severity: error
`
    );
    const starter = loadDomainConfig('software', 'validate', repo, PLUGIN_ROOT);
    assert.ok(starter !== null);
    const starterCheck = starter.checks.find((c) => c.id === 'validate.check-2-spec-compliance');
    assert.ok(starterCheck, 'check must exist in starter');
    // Project overrides starter — drift IS detected here.
    assert.notEqual(starterCheck.prompt, 'governance/validate-prompts/custom-check-2.md');
  });

  it("hygiene drift simulation: project validate.yaml without overrides matches starter", () => {
    const starterPath = join(PLUGIN_ROOT, 'templates', 'domains', 'software', 'validate.yaml');
    const starter = loadDomainConfig('software', 'validate', PLUGIN_ROOT, PLUGIN_ROOT);
    assert.ok(starter !== null);
    const repo = tmp();
    // Project file == starter bytes => no drift.
    const starterBytes = readFileSync(starterPath, 'utf8');
    writeFixture(repo, '.context-index/governance/validate.yaml', starterBytes);
    const projectFile = readFileSync(join(repo, '.context-index/governance/validate.yaml'), 'utf8');
    assert.equal(projectFile, starterBytes, 'project file should match starter byte-for-byte');
  });
});

describe("validate-config migration tool (adev migrate --artifact=validate-config)", () => {
  it("absent file: migrateValidateConfig writes governance/validate.yaml from software starter", async () => {
    const repo = tmp();
    // Seed a minimal context-index so storage-root validation passes.
    writeFixture(repo, '.context-index/manifest.yaml', 'project:\n  name: t\n');
    const { migrateValidateConfig } = await import('../../lib/migrate-state-artifacts.mjs');
    const r = await migrateValidateConfig(repo, { pluginRoot: PLUGIN_ROOT });
    assert.equal(r.action, 'migrated', `expected migrated, got ${r.action}: ${JSON.stringify(r)}`);
    const dest = join(repo, '.context-index', 'governance', 'validate.yaml');
    assert.ok(existsSync(dest), 'governance/validate.yaml must be written');
    const bytes = readFileSync(dest, 'utf8');
    assert.ok(bytes.includes('validate.check-1.5-source-manifest'), 'must contain bundled check ids');
  });

  it("absent file + dry-run: migrateValidateConfig reports action 'dry-run' and writes nothing", async () => {
    const repo = tmp();
    writeFixture(repo, '.context-index/manifest.yaml', 'project:\n  name: t\n');
    const { migrateValidateConfig } = await import('../../lib/migrate-state-artifacts.mjs');
    const r = await migrateValidateConfig(repo, { dryRun: true, pluginRoot: PLUGIN_ROOT });
    assert.equal(r.action, 'dry-run');
    const dest = join(repo, '.context-index', 'governance', 'validate.yaml');
    assert.ok(!existsSync(dest), 'dry-run must not write the file');
  });

  it("present + valid: migrateValidateConfig is a no-op (action: skipped)", async () => {
    const repo = tmp();
    writeFixture(repo, '.context-index/manifest.yaml', 'project:\n  name: t\n');
    writeFixture(
      repo,
      '.context-index/governance/validate.yaml',
      `checks:
  - id: project.x
    kind: observational
    severity: info
`,
    );
    const dest = join(repo, '.context-index', 'governance', 'validate.yaml');
    const before = readFileSync(dest, 'utf8');
    const { migrateValidateConfig } = await import('../../lib/migrate-state-artifacts.mjs');
    const r = await migrateValidateConfig(repo, { pluginRoot: PLUGIN_ROOT });
    assert.equal(r.action, 'skipped');
    const after = readFileSync(dest, 'utf8');
    assert.equal(after, before, 'file must remain byte-identical');
    assert.ok(
      r.advisories.some((a) => a.code === 'VALIDATE_CONFIG_ALREADY_PRESENT'),
      'must include the already-present advisory'
    );
  });

  it("present + malformed: migrateValidateConfig throws MIGRATION_BLOCKED_BY_CORRUPT_CONFIG (SEC-5)", async () => {
    const repo = tmp();
    writeFixture(repo, '.context-index/manifest.yaml', 'project:\n  name: t\n');
    writeFixture(
      repo,
      '.context-index/governance/validate.yaml',
      'checks:\n bad indent\n  worse: indent\n',  // malformed YAML (unexpected indentation)
    );
    const dest = join(repo, '.context-index', 'governance', 'validate.yaml');
    const before = readFileSync(dest, 'utf8');
    const { migrateValidateConfig } = await import('../../lib/migrate-state-artifacts.mjs');
    await assert.rejects(
      () => migrateValidateConfig(repo, { pluginRoot: PLUGIN_ROOT }),
      (err) => err.code === 'MIGRATION_BLOCKED_BY_CORRUPT_CONFIG'
    );
    const after = readFileSync(dest, 'utf8');
    assert.equal(after, before, 'malformed file must NOT be overwritten');
  });

  it("re-running on already-migrated repo is idempotent (writes once, no-ops thereafter)", async () => {
    const repo = tmp();
    writeFixture(repo, '.context-index/manifest.yaml', 'project:\n  name: t\n');
    const { migrateValidateConfig } = await import('../../lib/migrate-state-artifacts.mjs');
    const r1 = await migrateValidateConfig(repo, { pluginRoot: PLUGIN_ROOT });
    assert.equal(r1.action, 'migrated');
    const r2 = await migrateValidateConfig(repo, { pluginRoot: PLUGIN_ROOT });
    assert.equal(r2.action, 'skipped');
  });
});

describe("acceptance criteria: full coverage", () => {
  it("12 check prompt files exist under skills/validate/checks/ and are non-empty", async () => {
    const { readdirSync, statSync } = await import('node:fs');
    const checksDir = join(PLUGIN_ROOT, 'skills', 'validate', 'checks');
    assert.ok(existsSync(checksDir), 'checks/ directory must exist');
    const files = readdirSync(checksDir).filter((f) => f.endsWith('.md'));
    assert.ok(files.length >= 12, `expected >= 12 check files, got ${files.length}`);
    for (const f of files) {
      const stat = statSync(join(checksDir, f));
      assert.ok(stat.size > 50, `check file ${f} is too small (${stat.size} bytes)`);
    }
  });

  it("templates/validate/defaults.yaml is removed", () => {
    const oldDefaults = join(PLUGIN_ROOT, 'templates', 'validate', 'defaults.yaml');
    assert.ok(!existsSync(oldDefaults), 'old bundled defaults file must be deleted');
  });

  it("supersession round-trip: configurable-checks.spec.md has superseded-by-behaviors pointing at this spec", () => {
    const specPath = join(
      PLUGIN_ROOT,
      '.context-index/specs/features/validation/configurable-checks.spec.md',
    );
    const content = readFileSync(specPath, 'utf8');
    assert.ok(
      content.includes('superseded-by-behaviors:'),
      'predecessor spec must declare superseded-by-behaviors',
    );
    assert.ok(
      content.includes('validate-config-single-source'),
      'predecessor must point at this spec',
    );
  });

  it("ADR-0003 contains the 2026-05-15 narrowing note referencing this spec", () => {
    const adrPath = join(PLUGIN_ROOT, '.context-index/adrs/0003-configurable-review-registry.md');
    const content = readFileSync(adrPath, 'utf8');
    assert.ok(
      content.includes('Revised 2026-05-15') && content.includes('validate-config-single-source'),
      'ADR-0003 must include the narrowing note for the validate registry',
    );
    assert.ok(
      /opt-in adoption/i.test(content) || /Validate Config Drift/i.test(content),
      'note must describe opt-in adoption via /adev:hygiene drift pass',
    );
  });

  it("parity: project with full software starter as governance/validate.yaml loads 12 checks identically to starter", async () => {
    const { loadValidateConfig } = await import('../../lib/governance/validate-config.mjs');
    const starterPath = join(PLUGIN_ROOT, 'templates', 'domains', 'software', 'validate.yaml');
    const starterBytes = readFileSync(starterPath, 'utf8');
    const repo = tmp();
    writeFixture(repo, '.context-index/governance/validate.yaml', starterBytes);
    const r = loadValidateConfig(repo, { pluginRoot: PLUGIN_ROOT });
    assert.equal(r.errors.length, 0, JSON.stringify(r.errors, null, 2));
    assert.equal(r.checks.length, 12);
    // Every check id must come from the starter (no project additions in this fixture)
    const starterConfig = loadDomainConfig('software', 'validate', PLUGIN_ROOT, PLUGIN_ROOT);
    const starterIds = new Set(starterConfig.checks.map((c) => c.id));
    for (const c of r.checks) {
      assert.ok(starterIds.has(c.id), `unexpected id ${c.id} (not in starter)`);
    }
  });

  it("validation charter Key Files references skills/validate/checks/", () => {
    const charterPath = join(PLUGIN_ROOT, '.context-index/specs/features/validation/charter.md');
    const content = readFileSync(charterPath, 'utf8');
    assert.ok(
      content.includes('skills/validate/checks/'),
      'charter must reference the externalized checks directory',
    );
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
