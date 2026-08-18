import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { renderCopilotInstructions, syncCopilot } from "../lib/sync/copilot.mjs";
import { join } from "node:path";
import { cleanupTempDir, createTempDir } from "./helpers.mjs";

const fix = (name) =>
  readFileSync(new URL(`./sync-copilot-fixtures/${name}`, import.meta.url), 'utf8');

test('happy-path constitution renders ≤ 4000 UTF-8 bytes', () => {
  const c = fix('constitution-small.md');
  const result = renderCopilotInstructions(c);
  assert.equal(typeof result, 'object');
  assert.equal(typeof result.body, 'string');
  assert.ok(Buffer.byteLength(result.body, 'utf8') <= 4000);
  assert.deepEqual(result.droppedPrinciples, []);
  assert.deepEqual(result.warnings, []);
});

test('happy-path body contains Identity and Principles sections', () => {
  const c = fix('constitution-small.md');
  const { body } = renderCopilotInstructions(c);
  assert.ok(body.includes('## Identity'));
  assert.ok(body.includes('## Non-Negotiable Principles'));
  assert.ok(body.includes('First principle'));
  assert.ok(body.includes('Second principle'));
  // Must NOT include Coding Standards section
  assert.ok(!body.includes('## Coding Standards'));
});

test('SHA-256 pointer appended with 16-hex prefix', () => {
  const c = fix('constitution-small.md');
  const expected = createHash('sha256').update(c).digest('hex').slice(0, 16);
  const { body } = renderCopilotInstructions(c);
  assert.match(
    body,
    new RegExp(`<!-- Source: \\.context-index/constitution\\.md @ sha256:${expected}\\. Run /adev:sync to refresh\\. -->`),
  );
});

test('body has no YAML frontmatter', () => {
  const c = fix('constitution-small.md');
  const { body } = renderCopilotInstructions(c);
  assert.ok(!body.startsWith('---'));
});

test('overflow drops principles tail-first with in-file marker', () => {
  const c = fix('constitution-just-over.md');
  const result = renderCopilotInstructions(c);
  assert.ok(
    Buffer.byteLength(result.body, 'utf8') <= 4000,
    `body bytes = ${Buffer.byteLength(result.body, 'utf8')}`,
  );
  assert.match(result.body, /SYNC_OVERFLOW: principles .* dropped to fit 4,000-byte cap/);
  assert.ok(result.droppedPrinciples.length > 0);
  // Highest-numbered principle is dropped first
  const dropped = result.droppedPrinciples;
  for (let i = 1; i < dropped.length; i += 1) {
    assert.ok(dropped[i - 1] > dropped[i], 'dropped principles should be in tail-first order');
  }
  // Highest dropped > lowest dropped
  assert.equal(dropped[0], Math.max(...dropped));
  // A SYNC_OVERFLOW warning is emitted
  assert.ok(result.warnings.some((w) => w.startsWith('SYNC_OVERFLOW:')));
});

test('overflow marker appears after Identity, before remaining principles', () => {
  const c = fix('constitution-just-over.md');
  const { body } = renderCopilotInstructions(c);
  const identityIdx = body.indexOf('## Identity');
  const markerIdx = body.indexOf('SYNC_OVERFLOW: principles');
  const principlesIdx = body.indexOf('## Non-Negotiable Principles');
  assert.ok(identityIdx >= 0 && markerIdx >= 0 && principlesIdx >= 0);
  assert.ok(identityIdx < markerIdx, 'marker must come after Identity heading');
  assert.ok(markerIdx < principlesIdx, 'marker must come before Principles heading');
});

test('untruncatable Identity throws CONSTITUTION_TOO_LARGE', () => {
  const c = fix('constitution-identity-too-large.md');
  assert.throws(
    () => renderCopilotInstructions(c),
    /CONSTITUTION_TOO_LARGE/,
  );
});

test('multi-byte character counted in bytes, not chars', () => {
  const c = fix('constitution-multi-byte.md');
  const result = renderCopilotInstructions(c);
  assert.ok(Buffer.byteLength(result.body, 'utf8') <= 4000);
});

test('dangerous pattern rm -rf throws CONSTITUTION_DANGEROUS_PATTERN', () => {
  const c = fix('constitution-dangerous-rm-rf.md');
  assert.throws(
    () => renderCopilotInstructions(c),
    /CONSTITUTION_DANGEROUS_PATTERN/,
  );
});

test('dangerous pattern with allow-projection: true marker suppresses throw', () => {
  const c = fix('constitution-dangerous-rm-rf-allowed.md');
  assert.doesNotThrow(() => renderCopilotInstructions(c));
});

test('dangerous pattern --no-verify is detected', () => {
  const body = [
    '## Identity',
    '',
    'X',
    '',
    '## Non-Negotiable Principles',
    '',
    '1. **Avoid** — do not use --no-verify on commits.',
  ].join('\n');
  assert.throws(
    () => renderCopilotInstructions(body),
    /CONSTITUTION_DANGEROUS_PATTERN/,
  );
});

test('dangerous pattern --force push is detected', () => {
  const body = [
    '## Identity',
    '',
    'X',
    '',
    '## Non-Negotiable Principles',
    '',
    '1. **Avoid** — do not --force push to main.',
  ].join('\n');
  assert.throws(
    () => renderCopilotInstructions(body),
    /CONSTITUTION_DANGEROUS_PATTERN/,
  );
});

test('dangerous pattern chmod 777 is detected', () => {
  const body = [
    '## Identity',
    '',
    'X',
    '',
    '## Non-Negotiable Principles',
    '',
    '1. **Avoid** — never chmod 777 anything.',
  ].join('\n');
  assert.throws(
    () => renderCopilotInstructions(body),
    /CONSTITUTION_DANGEROUS_PATTERN/,
  );
});

test('dangerous pattern disable confirmation is detected', () => {
  const body = [
    '## Identity',
    '',
    'X',
    '',
    '## Non-Negotiable Principles',
    '',
    '1. **Avoid** — never disable confirmation prompts.',
  ].join('\n');
  assert.throws(
    () => renderCopilotInstructions(body),
    /CONSTITUTION_DANGEROUS_PATTERN/,
  );
});

test('missing Identity section throws CONSTITUTION_STRUCTURE_INVALID', () => {
  const body = [
    '# Constitution',
    '',
    '## Non-Negotiable Principles',
    '',
    '1. **X** — y.',
  ].join('\n');
  assert.throws(
    () => renderCopilotInstructions(body),
    /CONSTITUTION_STRUCTURE_INVALID.*Identity/,
  );
});

test('missing Non-Negotiable Principles section throws CONSTITUTION_STRUCTURE_INVALID', () => {
  const body = [
    '# Constitution',
    '',
    '## Identity',
    '',
    'X',
  ].join('\n');
  assert.throws(
    () => renderCopilotInstructions(body),
    /CONSTITUTION_STRUCTURE_INVALID.*Non-Negotiable Principles/,
  );
});

test('opt-out marker on preceding line also suppresses throw', () => {
  const body = [
    '## Identity',
    '',
    'X',
    '',
    '## Non-Negotiable Principles',
    '',
    '<!-- allow-projection: true -->',
    '1. **Note** — never run rm -rf in CI.',
  ].join('\n');
  assert.doesNotThrow(() => renderCopilotInstructions(body));
});

test('opt-out marker on same line also suppresses throw', () => {
  const body = [
    '## Identity',
    '',
    'X',
    '',
    '## Non-Negotiable Principles',
    '',
    '1. **Note** — never run rm -rf in CI. <!-- allow-projection: true -->',
  ].join('\n');
  assert.doesNotThrow(() => renderCopilotInstructions(body));
});

// ─── merged from tests/sync-copilot.test.mjs ──────────────────────────────────────────────
{
  // End-to-end /adev:sync run with `format: copilot`.
  //
  // Exercises the full pipeline against a fixture project containing a manifest
  // with `format: copilot`, a constitution, and several module charters.
  // Asserts both artifacts are produced, the SHA-256 tamper-evidence pointer is
  // present, `applyTo` is a double-quoted scalar, no absolute paths leak into
  // emitted content, and the adapter-owned paths (`.github/skills/`,
  // `.github/hooks/`, `.github/.adev-copilot-install.json`) are untouched.









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
}
