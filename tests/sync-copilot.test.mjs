// End-to-end /adev:sync run with `format: copilot`.
//
// Exercises the full pipeline against a fixture project containing a manifest
// with `format: copilot`, a constitution, and several module charters.
// Asserts both artifacts are produced, the SHA-256 tamper-evidence pointer is
// present, `applyTo` is a double-quoted scalar, no absolute paths leak into
// emitted content, and the adapter-owned paths (`.github/skills/`,
// `.github/hooks/`, `.github/.adev-copilot-install.json`) are untouched.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { createTempDir, cleanupTempDir } from './helpers.mjs';
import { syncCopilot } from '../lib/sync/copilot.mjs';

const CONSTITUTION = [
  '# Constitution',
  '',
  '## Identity',
  '',
  'End-to-end fixture project for copilot sync tests.',
  '',
  '## Non-Negotiable Principles',
  '',
  '1. **Tests pass** — npm test must be green before merge.',
  '2. **Pure ESM** — all modules use ES module syntax.',
  '3. **Node built-ins** — prefer Node.js built-in modules.',
  '',
  '## Coding Standards',
  '',
  '(Coding standards body — should not appear in the projection.)',
].join('\n');

const CLI_CHARTER = [
  '## Business Intent',
  '',
  'CLI module provides the command-line entry point for the project.',
  '',
  '## Scope',
  '',
  '### In Scope',
  '',
  '- Argument parsing',
  '- Verb dispatch',
  '- Help output',
  '',
  '### Out of Scope',
  '',
  '- Hook execution',
].join('\n');

const HOOKS_CHARTER = [
  '## Business Intent',
  '',
  'Hooks module manages lifecycle hook execution.',
  '',
  '## Scope',
  '',
  '### In Scope',
  '',
  '- pre-commit',
  '- post-merge',
].join('\n');

function buildFixture(projectRoot) {
  // Pre-create adapter-owned paths that must remain untouched.
  mkdirSync(join(projectRoot, '.github', 'skills'), { recursive: true });
  mkdirSync(join(projectRoot, '.github', 'hooks'), { recursive: true });
  writeFileSync(
    join(projectRoot, '.github', 'skills', 'orient.md'),
    '# orient (adapter-owned)\n',
  );
  writeFileSync(
    join(projectRoot, '.github', 'hooks', 'pre-commit.sh'),
    '#!/usr/bin/env bash\necho hook\n',
  );
  writeFileSync(
    join(projectRoot, '.github', '.adev-copilot-install.json'),
    '{"installedAt":"2026-05-19T00:00:00Z"}\n',
  );
}

test('end-to-end: full sync run writes both Copilot artifacts', async () => {
  const tmp = createTempDir();
  try {
    buildFixture(tmp);
    const manifest = {
      sync: { targets: [{ format: 'copilot' }, { format: 'claude' }] },
      modules: [
        { slug: 'cli', name: 'CLI', paths: ['cli/', 'lib/cli/'] },
        { slug: 'hooks', name: 'Hooks', paths: ['hooks/'] },
      ],
    };
    const result = syncCopilot({
      projectRoot: tmp,
      manifest,
      constitutionText: CONSTITUTION,
      charters: { cli: CLI_CHARTER, hooks: HOOKS_CHARTER },
      dryRun: false,
    });

    // Repo-wide projection.
    const repoWidePath = join(tmp, '.github', 'copilot-instructions.md');
    assert.ok(existsSync(repoWidePath));
    const repoWide = readFileSync(repoWidePath, 'utf8');
    assert.ok(Buffer.byteLength(repoWide, 'utf8') <= 4000);
    assert.ok(repoWide.includes('## Identity'));
    assert.ok(repoWide.includes('## Non-Negotiable Principles'));
    // Coding Standards must NOT leak into the projection.
    assert.ok(!repoWide.includes('## Coding Standards'));

    // SHA-256 tamper-evidence pointer.
    const expectedSha = createHash('sha256').update(CONSTITUTION, 'utf8').digest('hex').slice(0, 16);
    assert.ok(
      repoWide.includes(
        `<!-- Source: .context-index/constitution.md @ sha256:${expectedSha}. Run /adev:sync to refresh. -->`,
      ),
    );

    // Per-module artifacts.
    const cliPath = join(tmp, '.github', 'instructions', 'cli.instructions.md');
    const hooksPath = join(tmp, '.github', 'instructions', 'hooks.instructions.md');
    assert.ok(existsSync(cliPath));
    assert.ok(existsSync(hooksPath));

    const cliContent = readFileSync(cliPath, 'utf8');
    assert.match(cliContent, /^applyTo: "cli\/,lib\/cli\/"$/m);
    assert.ok(cliContent.includes('CLI module provides the command-line entry point for the project.'));
    assert.ok(cliContent.includes('- Argument parsing'));
    // Out-of-scope body should NOT appear (only In Scope is projected).
    assert.ok(!cliContent.includes('Hook execution'));

    const hooksContent = readFileSync(hooksPath, 'utf8');
    assert.match(hooksContent, /^applyTo: "hooks\/"$/m);

    // Summary shape.
    assert.equal(result.artifacts.length, 3);
    assert.ok(result.artifacts.every((a) => typeof a.path === 'string' && typeof a.bytes === 'number'));

    // No absolute operator-machine paths in any emitted file.
    for (const text of [repoWide, cliContent, hooksContent]) {
      assert.ok(!text.includes('/Users/'), 'no /Users/ leak');
      assert.ok(!text.includes('/home/'), 'no /home/ leak');
      assert.ok(!text.includes('C:\\'), 'no Windows path leak');
      assert.ok(!text.includes('$HOME'), 'no $HOME leak');
      assert.ok(!text.includes(process.cwd()), 'no process.cwd() leak');
    }

    // Adapter-owned paths must be byte-identical (untouched).
    const orientStat = statSync(join(tmp, '.github', 'skills', 'orient.md'));
    assert.ok(orientStat.size > 0);
    assert.equal(
      readFileSync(join(tmp, '.github', 'skills', 'orient.md'), 'utf8'),
      '# orient (adapter-owned)\n',
    );
    assert.equal(
      readFileSync(join(tmp, '.github', 'hooks', 'pre-commit.sh'), 'utf8'),
      '#!/usr/bin/env bash\necho hook\n',
    );
    assert.equal(
      readFileSync(join(tmp, '.github', '.adev-copilot-install.json'), 'utf8'),
      '{"installedAt":"2026-05-19T00:00:00Z"}\n',
    );
  } finally {
    cleanupTempDir(tmp);
  }
});

test('end-to-end: dry-run reports artifacts without writing', async () => {
  const tmp = createTempDir();
  try {
    buildFixture(tmp);
    const manifest = {
      sync: { targets: [{ format: 'copilot' }] },
      modules: [{ slug: 'cli', name: 'CLI', paths: ['cli/'] }],
    };
    const result = syncCopilot({
      projectRoot: tmp,
      manifest,
      constitutionText: CONSTITUTION,
      charters: { cli: CLI_CHARTER },
      dryRun: true,
    });

    assert.ok(!existsSync(join(tmp, '.github', 'copilot-instructions.md')));
    assert.ok(!existsSync(join(tmp, '.github', 'instructions', 'cli.instructions.md')));
    assert.ok(Array.isArray(result.wouldWrite));
    assert.equal(result.wouldWrite.length, 2);
    assert.ok(result.wouldWrite.some((p) => p.endsWith('copilot-instructions.md')));
    assert.ok(result.wouldWrite.some((p) => p.endsWith('cli.instructions.md')));
  } finally {
    cleanupTempDir(tmp);
  }
});

test('end-to-end: warnings flow through summary for sync-summary renderer', async () => {
  const tmp = createTempDir();
  try {
    buildFixture(tmp);
    const manifest = {
      sync: { targets: [{ format: 'copilot' }] },
      modules: [
        { slug: 'cli', name: 'CLI', paths: ['cli/'] },
        // Missing charter — emits MODULE_NO_CHARTER.
        { slug: 'orphan', name: 'Orphan', paths: ['orphan/'] },
        // Empty paths — emits SYNC_PATHS_EMPTY.
        { slug: 'wide', name: 'Wide', paths: [] },
      ],
    };
    const result = syncCopilot({
      projectRoot: tmp,
      manifest,
      constitutionText: CONSTITUTION,
      charters: { cli: CLI_CHARTER, wide: CLI_CHARTER },
      dryRun: false,
    });
    assert.ok(result.warnings.some((w) => w.startsWith('MODULE_NO_CHARTER: orphan')));
    assert.ok(result.warnings.some((w) => w.startsWith('SYNC_PATHS_EMPTY: wide')));
    // Repo-wide + cli + wide → 3 artifacts; orphan skipped.
    assert.equal(result.artifacts.length, 3);
    assert.ok(!existsSync(join(tmp, '.github', 'instructions', 'orphan.instructions.md')));
  } finally {
    cleanupTempDir(tmp);
  }
});
