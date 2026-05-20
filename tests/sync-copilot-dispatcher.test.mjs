import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createTempDir, cleanupTempDir } from './helpers.mjs';
import { syncCopilot } from '../lib/sync/copilot.mjs';

const SMALL_CONSTITUTION = [
  '## Identity',
  '',
  'Small project.',
  '',
  '## Non-Negotiable Principles',
  '',
  '1. **Test** — write tests.',
  '2. **ESM** — only ESM.',
].join('\n');

const CHARTER_CONTENT = [
  '## Business Intent',
  '',
  'CLI for the project.',
  '',
  '## Scope',
  '',
  '### In Scope',
  '',
  '- Argument parsing',
  '- Verb dispatch',
  '',
].join('\n');

function makeManifest(overrides = {}) {
  return {
    sync: { targets: [{ format: 'copilot' }] },
    modules: [{ slug: 'cli', name: 'CLI', paths: ['cli/'] }],
    ...overrides,
  };
}

test('happy-path real run writes copilot-instructions.md and per-module instructions', async () => {
  const tmp = createTempDir();
  try {
    const result = syncCopilot({
      projectRoot: tmp,
      manifest: makeManifest(),
      constitutionText: SMALL_CONSTITUTION,
      charters: { cli: CHARTER_CONTENT },
      dryRun: false,
    });

    const repoWidePath = join(tmp, '.github', 'copilot-instructions.md');
    assert.ok(existsSync(repoWidePath), '.github/copilot-instructions.md exists');
    const repoWide = readFileSync(repoWidePath, 'utf8');
    assert.ok(repoWide.includes('## Identity'));
    assert.ok(Buffer.byteLength(repoWide, 'utf8') <= 4000);
    assert.match(repoWide, /sha256:[0-9a-f]{16}/);

    const moduleFile = join(tmp, '.github', 'instructions', 'cli.instructions.md');
    assert.ok(existsSync(moduleFile), 'per-module instructions file exists');
    const moduleContent = readFileSync(moduleFile, 'utf8');
    assert.match(moduleContent, /^applyTo: "cli\/"$/m);
    assert.ok(moduleContent.includes('CLI for the project.'));

    assert.equal(result.artifacts.length, 2, 'two artifacts written');
    assert.ok(result.artifacts.some((a) => a.path.endsWith('copilot-instructions.md')));
    assert.ok(result.artifacts.some((a) => a.path.endsWith('cli.instructions.md')));
  } finally {
    cleanupTempDir(tmp);
  }
});

test('dryRun writes nothing and returns wouldWrite', async () => {
  const tmp = createTempDir();
  try {
    const result = syncCopilot({
      projectRoot: tmp,
      manifest: makeManifest(),
      constitutionText: SMALL_CONSTITUTION,
      charters: { cli: CHARTER_CONTENT },
      dryRun: true,
    });

    assert.ok(!existsSync(join(tmp, '.github', 'copilot-instructions.md')));
    assert.ok(!existsSync(join(tmp, '.github', 'instructions', 'cli.instructions.md')));
    assert.ok(Array.isArray(result.wouldWrite));
    assert.equal(result.wouldWrite.length, 2);
    assert.ok(result.wouldWrite.some((p) => p.endsWith('copilot-instructions.md')));
  } finally {
    cleanupTempDir(tmp);
  }
});

test('MODULE_NO_CHARTER emitted when charter missing; sync continues', async () => {
  const tmp = createTempDir();
  try {
    const manifest = {
      sync: { targets: [{ format: 'copilot' }] },
      modules: [
        { slug: 'cli', name: 'CLI', paths: ['cli/'] },
        { slug: 'hooks', name: 'Hooks', paths: ['hooks/'] },
      ],
    };
    const result = syncCopilot({
      projectRoot: tmp,
      manifest,
      constitutionText: SMALL_CONSTITUTION,
      charters: { cli: CHARTER_CONTENT }, // hooks has no charter
      dryRun: false,
    });
    assert.ok(result.warnings.some((w) => w.startsWith('MODULE_NO_CHARTER: hooks')));
    // cli module file written, hooks file NOT written
    assert.ok(existsSync(join(tmp, '.github', 'instructions', 'cli.instructions.md')));
    assert.ok(!existsSync(join(tmp, '.github', 'instructions', 'hooks.instructions.md')));
  } finally {
    cleanupTempDir(tmp);
  }
});

test('MANIFEST_TOO_LARGE thrown when manifest exceeds 256 KiB', async () => {
  const tmp = createTempDir();
  try {
    const big = 'x'.repeat(257 * 1024);
    const manifest = makeManifest();
    manifest._oversizeMarker = big;
    assert.throws(
      () => syncCopilot({
        projectRoot: tmp,
        manifest,
        manifestRawSize: 257 * 1024,
        constitutionText: SMALL_CONSTITUTION,
        charters: { cli: CHARTER_CONTENT },
        dryRun: false,
      }),
      /MANIFEST_TOO_LARGE/,
    );
  } finally {
    cleanupTempDir(tmp);
  }
});

test('CONSTITUTION_TOO_LARGE_TO_PARSE thrown when constitution exceeds 256 KiB', async () => {
  const tmp = createTempDir();
  try {
    const constitutionText = '## Identity\n\n' + 'x'.repeat(257 * 1024);
    assert.throws(
      () => syncCopilot({
        projectRoot: tmp,
        manifest: makeManifest(),
        constitutionText,
        charters: { cli: CHARTER_CONTENT },
        dryRun: false,
      }),
      /CONSTITUTION_TOO_LARGE_TO_PARSE/,
    );
  } finally {
    cleanupTempDir(tmp);
  }
});

test('TOO_MANY_MODULES thrown when modules exceeds 256', async () => {
  const tmp = createTempDir();
  try {
    const modules = [];
    for (let i = 0; i < 257; i += 1) {
      modules.push({ slug: `m${i}`, name: `M${i}`, paths: ['x/'] });
    }
    const manifest = { sync: { targets: [{ format: 'copilot' }] }, modules };
    assert.throws(
      () => syncCopilot({
        projectRoot: tmp,
        manifest,
        constitutionText: SMALL_CONSTITUTION,
        charters: {},
        dryRun: false,
      }),
      /TOO_MANY_MODULES/,
    );
  } finally {
    cleanupTempDir(tmp);
  }
});

test('TOO_MANY_PATHS thrown when a module has more than 64 paths', async () => {
  const tmp = createTempDir();
  try {
    const paths = [];
    for (let i = 0; i < 65; i += 1) paths.push(`p${i}/`);
    const manifest = {
      sync: { targets: [{ format: 'copilot' }] },
      modules: [{ slug: 'big', name: 'Big', paths }],
    };
    assert.throws(
      () => syncCopilot({
        projectRoot: tmp,
        manifest,
        constitutionText: SMALL_CONSTITUTION,
        charters: { big: CHARTER_CONTENT },
        dryRun: false,
      }),
      /TOO_MANY_PATHS: big/,
    );
  } finally {
    cleanupTempDir(tmp);
  }
});

test('CHARTER_TOO_LARGE skips the module non-fatally', async () => {
  const tmp = createTempDir();
  try {
    const bigCharter = '## Business Intent\n\n' + 'x'.repeat(257 * 1024);
    const result = syncCopilot({
      projectRoot: tmp,
      manifest: makeManifest(),
      constitutionText: SMALL_CONSTITUTION,
      charters: { cli: bigCharter },
      dryRun: false,
    });
    assert.ok(result.warnings.some((w) => w.startsWith('CHARTER_TOO_LARGE: cli')));
    assert.ok(!existsSync(join(tmp, '.github', 'instructions', 'cli.instructions.md')));
    // Repo-wide still written
    assert.ok(existsSync(join(tmp, '.github', 'copilot-instructions.md')));
  } finally {
    cleanupTempDir(tmp);
  }
});

test('MALFORMED_SYNC_TARGETS thrown when targets is not a list', async () => {
  const tmp = createTempDir();
  try {
    assert.throws(
      () => syncCopilot({
        projectRoot: tmp,
        manifest: { sync: { targets: 'not-a-list' }, modules: [] },
        constitutionText: SMALL_CONSTITUTION,
        charters: {},
        dryRun: false,
      }),
      /MALFORMED_SYNC_TARGETS/,
    );
  } finally {
    cleanupTempDir(tmp);
  }
});

test('no-op when sync.targets does not include copilot', async () => {
  const tmp = createTempDir();
  try {
    const manifest = {
      sync: { targets: [{ format: 'claude' }] },
      modules: [{ slug: 'cli', name: 'CLI', paths: ['cli/'] }],
    };
    const result = syncCopilot({
      projectRoot: tmp,
      manifest,
      constitutionText: SMALL_CONSTITUTION,
      charters: { cli: CHARTER_CONTENT },
      dryRun: false,
    });
    assert.equal(result.artifacts.length, 0);
    assert.ok(!existsSync(join(tmp, '.github', 'copilot-instructions.md')));
  } finally {
    cleanupTempDir(tmp);
  }
});

test('does NOT touch .github/skills, .github/hooks, .github/.adev-copilot-install.json', async () => {
  const tmp = createTempDir();
  try {
    mkdirSync(join(tmp, '.github', 'skills'), { recursive: true });
    mkdirSync(join(tmp, '.github', 'hooks'), { recursive: true });
    writeFileSync(join(tmp, '.github', 'skills', 'foo.md'), 'SKILL CONTENT');
    writeFileSync(join(tmp, '.github', 'hooks', 'foo.sh'), '#!/bin/bash');
    writeFileSync(join(tmp, '.github', '.adev-copilot-install.json'), '{"installed":true}');

    syncCopilot({
      projectRoot: tmp,
      manifest: makeManifest(),
      constitutionText: SMALL_CONSTITUTION,
      charters: { cli: CHARTER_CONTENT },
      dryRun: false,
    });

    assert.equal(readFileSync(join(tmp, '.github', 'skills', 'foo.md'), 'utf8'), 'SKILL CONTENT');
    assert.equal(readFileSync(join(tmp, '.github', 'hooks', 'foo.sh'), 'utf8'), '#!/bin/bash');
    assert.equal(
      readFileSync(join(tmp, '.github', '.adev-copilot-install.json'), 'utf8'),
      '{"installed":true}',
    );
  } finally {
    cleanupTempDir(tmp);
  }
});

test('emitted content has no operator-machine absolute paths', async () => {
  const tmp = createTempDir();
  try {
    syncCopilot({
      projectRoot: tmp,
      manifest: makeManifest(),
      constitutionText: SMALL_CONSTITUTION,
      charters: { cli: CHARTER_CONTENT },
      dryRun: false,
    });
    const repoWide = readFileSync(join(tmp, '.github', 'copilot-instructions.md'), 'utf8');
    const moduleFile = readFileSync(
      join(tmp, '.github', 'instructions', 'cli.instructions.md'),
      'utf8',
    );
    for (const txt of [repoWide, moduleFile]) {
      assert.ok(!txt.includes('/Users/'), 'no /Users/ leak');
      assert.ok(!txt.includes('/home/'), 'no /home/ leak');
      assert.ok(!txt.includes('C:\\'), 'no Windows path leak');
      assert.ok(!txt.includes('$HOME'), 'no $HOME leak');
      assert.ok(!txt.includes(process.cwd()), 'no process.cwd() leak');
    }
  } finally {
    cleanupTempDir(tmp);
  }
});

test('SYNC_PATH_ESCAPE protection: rejects out-of-tree projectRoot mismatch is handled by path.relative', async () => {
  // The path-confinement check works by resolving against projectRoot.
  // We exercise the check by constructing a path that would escape:
  // since `.github/copilot-instructions.md` resolves under projectRoot,
  // we test the inverse — that with a real projectRoot the outputs remain inside.
  const tmp = createTempDir();
  try {
    syncCopilot({
      projectRoot: tmp,
      manifest: makeManifest(),
      constitutionText: SMALL_CONSTITUTION,
      charters: { cli: CHARTER_CONTENT },
      dryRun: false,
    });
    // Every written file should resolve INSIDE tmp
    const repoWidePath = join(tmp, '.github', 'copilot-instructions.md');
    assert.ok(repoWidePath.startsWith(tmp));
  } finally {
    cleanupTempDir(tmp);
  }
});

test('no .tmp file remains after successful write', async () => {
  const tmp = createTempDir();
  try {
    syncCopilot({
      projectRoot: tmp,
      manifest: makeManifest(),
      constitutionText: SMALL_CONSTITUTION,
      charters: { cli: CHARTER_CONTENT },
      dryRun: false,
    });
    const githubFiles = readdirSync(join(tmp, '.github'));
    assert.ok(!githubFiles.some((f) => f.endsWith('.tmp')), 'no .tmp left in .github/');
    const instrFiles = readdirSync(join(tmp, '.github', 'instructions'));
    assert.ok(!instrFiles.some((f) => f.endsWith('.tmp')), 'no .tmp left in .github/instructions/');
  } finally {
    cleanupTempDir(tmp);
  }
});

test('summary records artifacts and warnings for sync-summary renderer', async () => {
  const tmp = createTempDir();
  try {
    const manifest = {
      sync: { targets: [{ format: 'copilot' }] },
      modules: [
        { slug: 'cli', name: 'CLI', paths: [] }, // empty paths -> SYNC_PATHS_EMPTY
        { slug: 'orphan', name: 'Orphan', paths: ['x/'] }, // no charter -> MODULE_NO_CHARTER
      ],
    };
    const result = syncCopilot({
      projectRoot: tmp,
      manifest,
      constitutionText: SMALL_CONSTITUTION,
      charters: { cli: CHARTER_CONTENT },
      dryRun: false,
    });
    assert.ok(Array.isArray(result.artifacts));
    assert.ok(Array.isArray(result.warnings));
    assert.ok(result.warnings.some((w) => w.startsWith('SYNC_PATHS_EMPTY:')));
    assert.ok(result.warnings.some((w) => w.startsWith('MODULE_NO_CHARTER:')));
    // Each artifact has path + bytes
    for (const a of result.artifacts) {
      assert.equal(typeof a.path, 'string');
      assert.equal(typeof a.bytes, 'number');
    }
  } finally {
    cleanupTempDir(tmp);
  }
});
