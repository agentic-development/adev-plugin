/**
 * Invariant 6 dependency pins.
 *
 * `extension-governance-merge-hardening.spec.md` Invariant 6 does not implement
 * its own containment or its own shell quoting — it DEPENDS on two guards that
 * live elsewhere:
 *
 *   1. `resolveRunnerContained` (lib/diagnostics/index.mjs) — the only way a
 *      `runner` string becomes a filesystem path.
 *   2. `normaliseCommand` / `NEEDS_QUOTING` (lib/gates/doctor.mjs) — the only
 *      place an argv gate becomes a string handed to `sh -c`.
 *
 * A declared dependency that no test owned by this spec asserts can regress
 * silently in an unrelated PR. These tests pin both. Some of them start green;
 * a pin that starts green is still a pin — that is the point, not a defect.
 *
 * The third test pins the SUBSTITUTION relationship: bound 1 (the value-safety
 * allowlist) is unsatisfiable for `runner` by construction, so `runner` is
 * bounded by the diagnostics guard INSTEAD, and the contribution allowlist
 * separately narrows what an extension may contribute to `plugin:` only.
 */

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveRunnerContained } from '../../../lib/diagnostics/index.mjs';
import { normaliseCommand } from '../../../lib/gates/doctor.mjs';
import { validateEntryFields } from '../../../lib/extensions/governance-registry.mjs';
import { createTempDir, cleanupTempDir } from '../../helpers.mjs';

/** Temp dirs created by the fixture builders, torn down once at the end. */
const tempDirs = [];

after(() => {
  for (const dir of tempDirs) cleanupTempDir(dir);
});

function tempRoot() {
  const dir = createTempDir();
  tempDirs.push(dir);
  // realpath matters: on macOS `/var` is a symlink to `/private/var`, and the
  // guard compares against the REALPATH of the candidate.
  return realpathSync(dir);
}

/**
 * Build the two realpath'd allowlist roots the guard expects, seeded with real
 * files so the positive assertions genuinely resolve (the guard realpaths the
 * candidate, so the target MUST exist on disk).
 *
 * @returns {{ realPluginDiagRoot: string, realProjectDiagRoot: string }}
 */
function diagnosticsRoots() {
  const realPluginDiagRoot = tempRoot();
  const realProjectDiagRoot = tempRoot();

  mkdirSync(join(realPluginDiagRoot, 'tier1'), { recursive: true });
  writeFileSync(join(realPluginDiagRoot, 'tier1', 'known-runner.mjs'), 'export default () => [];\n');
  writeFileSync(join(realProjectDiagRoot, 'project-runner.mjs'), 'export default () => [];\n');

  return { realPluginDiagRoot, realProjectDiagRoot };
}

test('Invariant 6 dependency — the diagnostics guard still contains runners', () => {
  const roots = diagnosticsRoots();
  for (const bad of ['../escape.mjs', 'plugin:../escape.mjs', '/abs/path.mjs', 'bare/path.mjs', ''])
    assert.throws(() => resolveRunnerContained(bad, roots));
  assert.ok(resolveRunnerContained('plugin:tier1/known-runner.mjs', roots));
});

test('Invariant 6 dependency — gate command quoting still neutralises metacharacters', () => {
  const out = normaliseCommand(['node', 'x$(id -u > /tmp/PWNED_ADEV)']);
  assert.match(out, /'x\$\(id -u > \/tmp\/PWNED_ADEV\)'/);
  assert.equal(normaliseCommand(['node', 42]), '');
});

test('runner is bounded by substitution — only plugin: is contributable', () => {
  assert.doesNotThrow(() => validateEntryFields('diagnostics.yaml', { id: 'd', runner: 'plugin:tier1/x.mjs' }));
  for (const bad of ['project:x.mjs', 'bin/x.mjs', '/abs/x.mjs'])
    assert.throws(() => validateEntryFields('diagnostics.yaml', { id: 'd', runner: bad }),
      e => e.code === 'GOVERNANCE_FIELD_VALUE_INVALID');
});

test('the guard rejects a runner that realpaths under BOTH roots (confused deputy)', () => {
  // Construct the cross-root case: the project diag root is a real subdirectory
  // of the plugin diag root, so one candidate satisfies both containment
  // predicates. lib/diagnostics/index.mjs Step D forbids exactly this.
  const realPluginDiagRoot = tempRoot();
  const realProjectDiagRoot = join(realPluginDiagRoot, 'nested');
  mkdirSync(realProjectDiagRoot, { recursive: true });
  writeFileSync(join(realProjectDiagRoot, 'shared.mjs'), 'export default () => [];\n');
  const roots = { realPluginDiagRoot, realProjectDiagRoot };

  // Same file, reachable through either prefix — both spellings are refused.
  assert.throws(() => resolveRunnerContained('plugin:nested/shared.mjs', roots),
    e => e.code === 'SCHEMA_INVALID' && /failed containment/.test(e.message));
  assert.throws(() => resolveRunnerContained('project:shared.mjs', roots),
    e => e.code === 'SCHEMA_INVALID' && /failed containment/.test(e.message));
});

test('the guard rejects a runner whose realpath escapes to NEITHER root', () => {
  const roots = diagnosticsRoots();
  const outside = tempRoot();
  writeFileSync(join(outside, 'evil.mjs'), 'export default () => [];\n');
  // The link itself sits under a valid root; its realpath does not.
  symlinkSync(join(outside, 'evil.mjs'), join(roots.realPluginDiagRoot, 'tier1', 'escape.mjs'));

  assert.throws(() => resolveRunnerContained('plugin:tier1/escape.mjs', roots),
    e => e.code === 'SCHEMA_INVALID' && /failed containment/.test(e.message));
});

test('the guard rejects an empty or absolute remainder after either prefix', () => {
  const roots = diagnosticsRoots();
  for (const bad of ['plugin:', 'plugin:/abs', 'project:', 'project:/abs'])
    assert.throws(() => resolveRunnerContained(bad, roots),
      e => e.code === 'SCHEMA_INVALID' && /requires a relative path/.test(e.message));
});

test('the guard rejects a broken symlink sitting under a valid root', () => {
  const roots = diagnosticsRoots();
  symlinkSync(join(roots.realPluginDiagRoot, 'tier1', 'no-such-target.mjs'),
    join(roots.realPluginDiagRoot, 'tier1', 'dangling.mjs'));

  // realpathSync throws on a dangling link; Step C converts that to a refusal
  // rather than letting the ENOENT escape.
  assert.throws(() => resolveRunnerContained('plugin:tier1/dangling.mjs', roots),
    e => e.code === 'SCHEMA_INVALID' && /failed containment/.test(e.message));
});

test('the guard itself permits project: — the contribution allowlist is what refuses it', () => {
  const roots = diagnosticsRoots();
  const { realRunner } = resolveRunnerContained('project:project-runner.mjs', roots);
  assert.equal(realRunner, join(roots.realProjectDiagRoot, 'project-runner.mjs'));

  // Same spelling, refused one layer up: the guard bounds the path, the
  // extension-contribution rule narrows the vocabulary to plugin:.
  assert.throws(() => validateEntryFields('diagnostics.yaml', { id: 'd', runner: 'project:project-runner.mjs' }),
    e => e.code === 'GOVERNANCE_FIELD_VALUE_INVALID');
});

test('normaliseCommand emits the POSIX close-escape-reopen construction', () => {
  assert.equal(normaliseCommand(['touch', "a'b"]), `touch 'a'\\''b'`);
});

test('normaliseCommand quotes selectively — a clean token passes through bare', () => {
  assert.equal(normaliseCommand(['npm', 'test']), 'npm test');
  // Mixed command: only the metacharacter-bearing token is wrapped.
  assert.equal(normaliseCommand(['grep', 'a*b', 'file.mjs']), `grep 'a*b' file.mjs`);
});

test('normaliseCommand returns a string command unchanged', () => {
  assert.equal(normaliseCommand('already a string'), 'already a string');
  assert.equal(normaliseCommand('npm test && echo $(id)'), 'npm test && echo $(id)');
});

test('an ABSENT allowlist root contains nothing — it does not contain everything', () => {
  // `loadRegistry` passes '' for a root whose directory does not exist (a
  // project with no `.context-index/diagnostics/`). An empty root string must
  // not read as "/" — that made `isUnder` true for every absolute path, so the
  // cross-root "contained in BOTH roots" refusal fired on every bundled
  // `plugin:` runner and the whole registry loaded as zero entries.
  const roots = diagnosticsRoots();
  const noProjectRoot = { realPluginDiagRoot: roots.realPluginDiagRoot, realProjectDiagRoot: '' };
  assert.ok(resolveRunnerContained('plugin:tier1/known-runner.mjs', noProjectRoot));
  // Containment is still enforced against the root that IS present.
  assert.throws(() => resolveRunnerContained('plugin:../escape.mjs', noProjectRoot));
  // And a `project:` runner has no root to resolve against, so it is refused.
  assert.throws(() => resolveRunnerContained('project:x.mjs', noProjectRoot));
});
