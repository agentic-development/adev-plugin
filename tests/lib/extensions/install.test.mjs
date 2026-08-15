import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { installExtension, writeManifestStamp, readManifestStamps, listExtensions } from '../../../lib/extensions/install.mjs';
import { parseYaml } from '../../../lib/profiles/yaml.mjs';
import { createTempDir, cleanupTempDir, writeFixture } from '../../helpers.mjs';

describe('extensions/install', () => {
  let tmp;
  beforeEach(() => {
    tmp = createTempDir();
    writeFixture(tmp, '.context-index/manifest.yaml', 'project:\n  name: test\n');
  });
  afterEach(() => { cleanupTempDir(tmp); });

  describe('writeManifestStamp', () => {
    it('writes a new stamp to installed_extensions', () => {
      writeManifestStamp(tmp, { name: 'my-ext', version: '1.0.0', source_uri: 'https://example.com' });
      const stamps = readManifestStamps(tmp);
      assert.equal(stamps.length, 1);
      assert.equal(stamps[0].name, 'my-ext');
      assert.equal(stamps[0].version, '1.0.0');
      assert.ok(stamps[0].installed_date);
      assert.equal(stamps[0].source_uri, 'https://example.com');
    });

    it('updates existing stamp on re-install (idempotent)', () => {
      writeManifestStamp(tmp, { name: 'my-ext', version: '1.0.0', source_uri: 'local' });
      writeManifestStamp(tmp, { name: 'my-ext', version: '2.0.0', source_uri: 'local' });
      const stamps = readManifestStamps(tmp);
      assert.equal(stamps.length, 1);
      assert.equal(stamps[0].version, '2.0.0');
    });

    it('preserves other extensions on update', () => {
      writeManifestStamp(tmp, { name: 'ext-a', version: '1.0.0', source_uri: 'local' });
      writeManifestStamp(tmp, { name: 'ext-b', version: '1.0.0', source_uri: 'local' });
      const stamps = readManifestStamps(tmp);
      assert.equal(stamps.length, 2);
      const names = stamps.map(s => s.name).sort();
      assert.deepStrictEqual(names, ['ext-a', 'ext-b']);
    });

    it('strips credentials from source_uri', () => {
      writeManifestStamp(tmp, { name: 'my-ext', version: '1.0.0', source_uri: 'https://user:token@github.com/repo' });
      const stamps = readManifestStamps(tmp);
      assert.equal(stamps[0].source_uri, 'https://github.com/repo');
    });

    it('writes valid ISO 8601 installed_date', () => {
      writeManifestStamp(tmp, { name: 'my-ext', version: '1.0.0', source_uri: 'local' });
      const stamps = readManifestStamps(tmp);
      const date = new Date(stamps[0].installed_date);
      assert.ok(!isNaN(date.getTime()), 'installed_date should be valid ISO 8601');
    });
  });

  describe('readManifestStamps', () => {
    it('returns empty array when no installed_extensions', () => {
      const stamps = readManifestStamps(tmp);
      assert.deepStrictEqual(stamps, []);
    });

    it('returns empty array when manifest has no installed_extensions key', () => {
      writeFixture(tmp, '.context-index/manifest.yaml', 'project:\n  name: test\n');
      const stamps = readManifestStamps(tmp);
      assert.deepStrictEqual(stamps, []);
    });
  });

  describe('listExtensions', () => {
    it('returns stamps from manifest object', () => {
      const manifest = {
        installed_extensions: [
          { name: 'ext-a', version: '1.0.0', installed_date: '2026-01-01T00:00:00.000Z', source_uri: 'local' },
        ],
      };
      const result = listExtensions(manifest);
      assert.equal(result.length, 1);
      assert.equal(result[0].name, 'ext-a');
    });

    it('returns empty array when no installed_extensions', () => {
      const result = listExtensions({});
      assert.deepStrictEqual(result, []);
    });

    it('returns empty array for null manifest', () => {
      const result = listExtensions(null);
      assert.deepStrictEqual(result, []);
    });
  });

  describe('manifest.yaml content preservation', () => {
    it('preserves existing manifest content after stamp write', () => {
      writeFixture(tmp, '.context-index/manifest.yaml', 'project:\n  name: my-project\n  version: 1.0.0\n');
      writeManifestStamp(tmp, { name: 'my-ext', version: '1.0.0', source_uri: 'local' });
      const content = readFileSync(join(tmp, '.context-index/manifest.yaml'), 'utf8');
      assert.ok(content.includes('name: my-project'));
      assert.ok(content.includes('installed_extensions:'));
    });
  });
});

// ── installExtension: plan-everything-then-write ─────────────────────────

/**
 * Deterministic recursive snapshot of every path AND its bytes under `root`.
 *
 * Directories are recorded too (as `'<dir>'`), so a merge that creates an empty
 * directory and writes nothing into it is still a difference. Nothing is excluded.
 *
 * @param {string} root - Directory to snapshot.
 * @returns {Record<string, string>} Relative path → file contents (or `'<dir>'`).
 */
function snapshotDir(root) {
  const out = {};
  const walk = (dir, prefix) => {
    const dirents = readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const dirent of dirents) {
      const rel = prefix === '' ? dirent.name : `${prefix}/${dirent.name}`;
      const full = join(dir, dirent.name);
      if (dirent.isDirectory()) {
        out[rel] = '<dir>';
        walk(full, rel);
      } else {
        out[rel] = readFileSync(full, 'utf8');
      }
    }
  };
  walk(root, '');
  return out;
}

describe('installExtension — two-phase install', () => {
  /** @type {string[]} Temp dirs created by the fixtures, cleaned after every test. */
  let trash;
  beforeEach(() => { trash = []; });
  afterEach(() => { for (const dir of trash) cleanupTempDir(dir); });

  /** Extension dir + a project with a manifest and an empty governance directory. */
  function tempPair() {
    const extDir = createTempDir();
    const projectRoot = createTempDir();
    trash.push(extDir, projectRoot);
    writeFixture(projectRoot, '.context-index/manifest.yaml', 'project:\n  name: test\n');
    mkdirSync(join(projectRoot, '.context-index', 'governance'), { recursive: true });
    return { extDir, projectRoot };
  }

  /**
   * An extension contributing one `validate.yaml` quality-gate whose `command`
   * argv names a real `bin/check.sh` shipped inside the extension.
   */
  function fixtureWithExecutableGovernance() {
    const { extDir, projectRoot } = tempPair();
    writeFixture(extDir, 'adev-extension.yaml', [
      'name: exec-ext',
      'version: 1.0.0',
      'provides:',
      '  governance:',
      '    - target: validate.yaml',
      '      entries:',
      '        - id: exec-gate',
      '          kind: quality-gate',
      '          severity: error',
      '          command: [bash, bin/check.sh]',
      '',
    ].join('\n'));
    writeFixture(extDir, 'bin/check.sh', '#!/usr/bin/env bash\nexit 0\n');
    return { extDir, projectRoot };
  }

  /**
   * A VALID `gates.yaml` block followed by a `review.yaml` block carrying a field
   * outside that registry's allowlist, plus a `domain-profile` so the test proves
   * the profile is not written either.
   */
  function fixtureWithTwoTargetsSecondInvalid() {
    const { extDir, projectRoot } = tempPair();
    writeFixture(extDir, 'adev-extension.yaml', [
      'name: two-target-ext',
      'version: 1.0.0',
      'provides:',
      '  domain-profile:',
      '    name: two-target-domain',
      '    extends: software',
      '  governance:',
      '    - target: gates.yaml',
      '      entries:',
      '        - id: first-gate',
      '          severity: error',
      '          command: [bash, bin/first.sh]',
      '    - target: review.yaml',
      '      entries:',
      '        - id: second-reviewer',
      '          name: Second',
      '          args: nope',
      '',
    ].join('\n'));
    writeFixture(extDir, 'bin/first.sh', '#!/usr/bin/env bash\nexit 0\n');
    return { extDir, projectRoot };
  }

  /** An extension whose single governance block targets `target`. */
  function fixtureTargeting(target) {
    const { extDir, projectRoot } = tempPair();
    writeFixture(extDir, 'adev-extension.yaml', [
      'name: targeting-ext',
      'version: 1.0.0',
      'provides:',
      '  governance:',
      `    - target: ${target}`,
      '      entries:',
      '        - id: policy-one',
      '          severity: error',
      '',
    ].join('\n'));
    return { extDir, projectRoot };
  }

  it('an executable contribution without consent refuses and writes nothing', async () => {
    const { extDir, projectRoot } = fixtureWithExecutableGovernance();
    const before = snapshotDir(projectRoot);
    await assert.rejects(
      installExtension(extDir, projectRoot, { allowExec: false, interactive: false }),
      e => e.code === 'GOVERNANCE_EXEC_NOT_CONSENTED'
    );
    assert.deepEqual(snapshotDir(projectRoot), before);
  });

  it('--allow-exec installs and stamps exec_consented_at', async () => {
    const { extDir, projectRoot } = fixtureWithExecutableGovernance();
    await installExtension(extDir, projectRoot, { allowExec: true, interactive: false });
    const out = readFileSync(join(projectRoot, '.context-index/governance/validate.yaml'), 'utf8');
    assert.match(out, /exec_consented_at: \d{4}-\d{2}-\d{2}T/);
    assert.match(out, /source: extension:/);
  });

  it('per-install atomicity — a refused second target leaves the first untouched', async () => {
    const { extDir, projectRoot } = fixtureWithTwoTargetsSecondInvalid();
    const before = snapshotDir(projectRoot);
    await assert.rejects(installExtension(extDir, projectRoot, { allowExec: true }));
    assert.deepEqual(snapshotDir(projectRoot), before,
      'no registry, and no domain profile, may be written when any block refuses');
  });

  it('an unknown target refuses before any write', async () => {
    const { extDir, projectRoot } = fixtureTargeting('risk-policies.yaml');
    await assert.rejects(installExtension(extDir, projectRoot, { allowExec: true }),
      e => e.code === 'UNKNOWN_GOVERNANCE_TARGET');
  });

  it('relocates the payload to .context-index/extensions/<name>/ at mode 0o555 and rewrites argv to it', async () => {
    const { extDir, projectRoot } = fixtureWithExecutableGovernance();
    await installExtension(extDir, projectRoot, { allowExec: true, interactive: false });

    const payloadPath = join(projectRoot, '.context-index/extensions/exec-ext/bin/check.sh');
    assert.equal(readFileSync(payloadPath, 'utf8'), '#!/usr/bin/env bash\nexit 0\n');
    assert.equal(statSync(payloadPath).mode & 0o777, 0o555);

    const parsed = parseYaml(readFileSync(join(projectRoot, '.context-index/governance/validate.yaml'), 'utf8'));
    assert.equal(parsed.checks.length, 1);
    assert.equal(parsed.checks[0].id, 'exec-gate');
    assert.deepEqual(parsed.checks[0].command, ['bash', payloadPath]);
  });

  it('reports the payload directory in filesWritten', async () => {
    const { extDir, projectRoot } = fixtureWithExecutableGovernance();
    const report = await installExtension(extDir, projectRoot, { allowExec: true, interactive: false });
    assert.ok(
      report.filesWritten.includes(join(projectRoot, '.context-index/extensions/exec-ext')),
      `filesWritten should name the payload dir, got ${JSON.stringify(report.filesWritten)}`
    );
  });

  it('an interactive install answered "n" refuses and writes nothing', async () => {
    const { extDir, projectRoot } = fixtureWithExecutableGovernance();
    const before = snapshotDir(projectRoot);
    await assert.rejects(
      installExtension(extDir, projectRoot, { interactive: true, promptFn: () => 'n' }),
      e => e.code === 'GOVERNANCE_EXEC_NOT_CONSENTED'
    );
    assert.deepEqual(snapshotDir(projectRoot), before);
  });

  it('an interactive install answered "y" installs and stamps exec_consented_at', async () => {
    const { extDir, projectRoot } = fixtureWithExecutableGovernance();
    const prompts = [];
    await installExtension(extDir, projectRoot, {
      interactive: true,
      promptFn: (text) => { prompts.push(text); return 'y'; },
    });
    assert.equal(prompts.length, 1);
    assert.match(prompts[0], /validate\.yaml \[exec-gate\] command: bash bin\/check\.sh/);
    const out = readFileSync(join(projectRoot, '.context-index/governance/validate.yaml'), 'utf8');
    assert.match(out, /exec_consented_at: \d{4}-\d{2}-\d{2}T/);
  });

  it('a manifest with no executable contribution installs without prompting', async () => {
    const { extDir, projectRoot } = tempPair();
    writeFixture(extDir, 'adev-extension.yaml', [
      'name: benign-ext',
      'version: 1.0.0',
      'provides:',
      '  governance:',
      '    - target: boundaries.yaml',
      '      entries:',
      '        - id: no-secrets',
      '          severity: error',
      '          pattern: secrets/',
      '',
    ].join('\n'));

    let promptCalls = 0;
    const report = await installExtension(extDir, projectRoot, {
      interactive: true,
      promptFn: () => { promptCalls += 1; return 'n'; },
    });
    assert.equal(promptCalls, 0);
    assert.deepEqual(report.mergesApplied, ['appended: no-secrets']);
    const out = readFileSync(join(projectRoot, '.context-index/governance/boundaries.yaml'), 'utf8');
    assert.match(out, /id: no-secrets/);
    assert.equal(/exec_consented_at/.test(out), false);
  });

  it('a plugin: package.skill passes through unrewritten — it is not a payload', async () => {
    const { extDir, projectRoot } = tempPair();
    writeFixture(extDir, 'adev-extension.yaml', [
      'name: plugin-ref-ext',
      'version: 1.0.0',
      'provides:',
      '  governance:',
      '    - target: review.yaml',
      '      entries:',
      '        - id: plugin-reviewer',
      '          name: Plugin Reviewer',
      '          dispatch: always',
      '          package:',
      '            skill: plugin:review-specs/SKILL.md',
      '',
    ].join('\n'));

    await installExtension(extDir, projectRoot, { allowExec: true, interactive: false });
    const parsed = parseYaml(readFileSync(join(projectRoot, '.context-index/governance/review.yaml'), 'utf8'));
    assert.equal(parsed.reviewers.length, 1);
    assert.equal(parsed.reviewers[0].package.skill, 'plugin:review-specs/SKILL.md');
    assert.equal(readdirSync(join(projectRoot, '.context-index')).includes('extensions'), false);
  });

  it('payload rewrites are scoped per target — a same-named id in another registry is untouched', async () => {
    const { extDir, projectRoot } = tempPair();
    writeFixture(extDir, 'adev-extension.yaml', [
      'name: shared-id-ext',
      'version: 1.0.0',
      'provides:',
      '  governance:',
      '    - target: gates.yaml',
      '      entries:',
      '        - id: shared',
      '          severity: error',
      '          command: [bash, bin/gate.sh]',
      '    - target: review.yaml',
      '      entries:',
      '        - id: shared',
      '          name: Shared Reviewer',
      '          dispatch: always',
      '',
    ].join('\n'));
    writeFixture(extDir, 'bin/gate.sh', '#!/usr/bin/env bash\nexit 0\n');

    await installExtension(extDir, projectRoot, { allowExec: true, interactive: false });

    const gates = parseYaml(readFileSync(join(projectRoot, '.context-index/governance/gates.yaml'), 'utf8'));
    assert.deepEqual(gates.gates[0].command, [
      'bash',
      join(projectRoot, '.context-index/extensions/shared-id-ext/bin/gate.sh'),
    ]);

    const reviewers = parseYaml(readFileSync(join(projectRoot, '.context-index/governance/review.yaml'), 'utf8'));
    assert.equal(reviewers.reviewers[0].id, 'shared');
    assert.equal(reviewers.reviewers[0].command, undefined);
    assert.equal(reviewers.reviewers[0].name, 'Shared Reviewer');
  });

  it('a malformed entry reports its schema verdict, not a payload verdict, and never prompts', async () => {
    const { extDir, projectRoot } = tempPair();
    writeFixture(extDir, 'adev-extension.yaml', [
      'name: no-id-ext',
      'version: 1.0.0',
      'provides:',
      '  governance:',
      '    - target: validate.yaml',
      '      entries:',
      '        - kind: quality-gate',
      '          severity: error',
      '          command: [bash, /etc/passwd]',
      '',
    ].join('\n'));

    let promptCalls = 0;
    await assert.rejects(
      installExtension(extDir, projectRoot, {
        interactive: true,
        promptFn: () => { promptCalls += 1; return 'y'; },
      }),
      e => e.code === 'GOVERNANCE_FIELD_VALUE_INVALID' && /'id' must be a non-empty string/.test(e.message)
    );
    assert.equal(promptCalls, 0, 'consent must not be asked for an entry that can never be installed');
  });

  it('a re-install skips the already-present ids and leaves the registry byte-identical', async () => {
    const { extDir, projectRoot } = fixtureWithExecutableGovernance();
    const first = await installExtension(extDir, projectRoot, { allowExec: true, interactive: false });
    assert.deepEqual(first.mergesApplied, ['appended: exec-gate']);

    const registryPath = join(projectRoot, '.context-index/governance/validate.yaml');
    const afterFirst = readFileSync(registryPath, 'utf8');

    const second = await installExtension(extDir, projectRoot, { allowExec: true, interactive: false });
    assert.deepEqual(second.mergesApplied, ['skipped: exec-gate']);
    assert.equal(readFileSync(registryPath, 'utf8'), afterFirst);
  });
});
