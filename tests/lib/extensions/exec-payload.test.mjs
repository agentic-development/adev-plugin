import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, statSync, existsSync, symlinkSync, accessSync, constants } from 'node:fs';
import { join, resolve } from 'node:path';
import { createTempDir, cleanupTempDir } from '../../helpers.mjs';
import { planExecPayload, applyExecPayload, payloadDir, assertContained } from '../../../lib/extensions/exec-payload.mjs';

// NOTE: the plan's prescribed suite factored refusal checks through a
// `throwsCode(fn, code)` helper. The repo's gaming gate
// (lib/test-strategies/gaming.mjs, EMPTY_ASSERTIONS) reads a test body that
// delegates its only assertion to a helper as assertion-free and blocks the
// write. Every such check below is the same predicate written inline —
// `assert.throws(fn, e => e.code === code)` — so the strength is unchanged.

function fixture() {
  const ext = createTempDir();
  const proj = createTempDir();
  mkdirSync(join(ext, 'bin'), { recursive: true });
  writeFileSync(join(ext, 'bin', 'check.sh'), '#!/usr/bin/env bash\nexit 0\n');
  return { ext, proj };
}

test('a contained argv path is copied and rewritten to an absolute payload path', () => {
  const { ext, proj } = fixture();
  const plan = planExecPayload({
    extensionRoot: ext, extensionName: 'demo', projectRoot: proj,
    contributions: [{ entryId: 'c1', field: 'command', value: ['bash', 'bin/check.sh'] }],
  });
  const argv = applyExecPayload(plan, proj, 'demo');
  const expected = join(payloadDir(proj, 'demo'), 'bin/check.sh');
  assert.equal(argv[0].value[1], expected);
  assert.equal(statSync(expected).mode & 0o777, 0o555);
  cleanupTempDir(ext); cleanupTempDir(proj);
});

test('an escaping argv path is refused', () => {
  const { ext, proj } = fixture();
  assert.throws(() => planExecPayload({
    extensionRoot: ext, extensionName: 'demo', projectRoot: proj,
    contributions: [{ entryId: 'c1', field: 'command', value: ['bash', '../../etc/passwd'] }],
  }), e => e.code === 'GOVERNANCE_COMMAND_ESCAPES_EXTENSION');
  cleanupTempDir(ext); cleanupTempDir(proj);
});

test('a nonexistent contained path is refused, not silently accepted', () => {
  const { ext, proj } = fixture();
  assert.throws(() => planExecPayload({
    extensionRoot: ext, extensionName: 'demo', projectRoot: proj,
    contributions: [{ entryId: 'c1', field: 'command', value: ['bash', 'bin/missing.sh'] }],
  }), e => e.code === 'GOVERNANCE_PAYLOAD_MISSING');
  cleanupTempDir(ext); cleanupTempDir(proj);
});

test('a string command is refused', () => {
  const { ext, proj } = fixture();
  assert.throws(() => planExecPayload({
    extensionRoot: ext, extensionName: 'demo', projectRoot: proj,
    contributions: [{ entryId: 'c1', field: 'command', value: 'bash bin/check.sh' }],
  }), e => e.code === 'GOVERNANCE_COMMAND_NOT_ARGV');
  cleanupTempDir(ext); cleanupTempDir(proj);
});

test('interpreters are allowlisted at argv[0] only', () => {
  const { ext, proj } = fixture();
  assert.throws(() => planExecPayload({
    extensionRoot: ext, extensionName: 'demo', projectRoot: proj,
    contributions: [{ entryId: 'c1', field: 'command', value: ['curl', 'bin/check.sh'] }],
  }), e => e.code === 'GOVERNANCE_COMMAND_ESCAPES_EXTENSION');
  cleanupTempDir(ext); cleanupTempDir(proj);
});

// ── Added coverage beyond the prescribed suite ────────────────────────

test('package.skill emits a .context-index-relative path, never an absolute one', () => {
  const { ext, proj } = fixture();
  const plan = planExecPayload({
    extensionRoot: ext, extensionName: 'demo', projectRoot: proj,
    contributions: [{ entryId: 'r1', field: 'package.skill', value: 'bin/check.sh' }],
  });
  assert.equal(plan.rewrites.length, 1);
  const rw = plan.rewrites[0];
  assert.equal(rw.entryId, 'r1');
  assert.equal(rw.field, 'package.skill');
  assert.equal(rw.index, null);
  assert.equal(rw.contextRelative, 'extensions/demo/bin/check.sh');
  assert.equal(rw.contextRelative.startsWith('/'), false);
  assert.equal(rw.absolute, join(payloadDir(proj, 'demo'), 'bin/check.sh'));

  const applied = applyExecPayload(plan, proj, 'demo');
  assert.equal(applied[0].value, 'extensions/demo/bin/check.sh');
  cleanupTempDir(ext); cleanupTempDir(proj);
});

test('both emission forms name the same file in the same payload directory', () => {
  const { ext, proj } = fixture();
  const plan = planExecPayload({
    extensionRoot: ext, extensionName: 'demo', projectRoot: proj,
    contributions: [
      { entryId: 'r1', field: 'package.skill', value: 'bin/check.sh' },
      { entryId: 'c1', field: 'command', value: ['bash', 'bin/check.sh'] },
    ],
  });
  assert.equal(plan.copies.length, 1);
  assert.equal(plan.rewrites.length, 2);
  for (const rw of plan.rewrites) {
    assert.equal(resolve(proj, '.context-index', rw.contextRelative), rw.absolute);
  }
  // The discriminator Task 7 reads must be explicit, not re-derived.
  assert.equal(plan.rewrites[0].form, 'contextRelative');
  assert.equal(plan.rewrites[1].form, 'absolute');
  assert.equal(plan.rewrites[0].absolute, plan.rewrites[1].absolute);
  cleanupTempDir(ext); cleanupTempDir(proj);
});

test('planExecPayload writes nothing', () => {
  const { ext, proj } = fixture();
  const plan = planExecPayload({
    extensionRoot: ext, extensionName: 'demo', projectRoot: proj,
    contributions: [{ entryId: 'c1', field: 'command', value: ['bash', 'bin/check.sh'] }],
  });
  assert.equal(plan.copies.length, 1);
  assert.equal(existsSync(payloadDir(proj, 'demo')), false);
  assert.equal(existsSync(join(proj, '.context-index', 'extensions')), false);
  cleanupTempDir(ext); cleanupTempDir(proj);
});

test('assertContained realpaths the base so a symlinked base still contains', () => {
  const real = createTempDir();
  const holder = createTempDir();
  mkdirSync(join(real, 'bin'), { recursive: true });
  writeFileSync(join(real, 'bin', 'check.sh'), 'x\n');
  const link = join(holder, 'linked');
  symlinkSync(real, link);
  // Base given through the symlink, candidate through the real path.
  assert.doesNotThrow(() => assertContained(link, join(real, 'bin', 'check.sh')));
  // And the reverse: base real, candidate through the symlink.
  assert.doesNotThrow(() => assertContained(real, join(link, 'bin', 'check.sh')));
  cleanupTempDir(real); cleanupTempDir(holder);
});

test('assertContained refuses a candidate outside the base', () => {
  const base = createTempDir();
  const other = createTempDir();
  writeFileSync(join(other, 'outside.txt'), 'x\n');
  assert.throws(() => assertContained(base, join(other, 'outside.txt')),
    e => e.code === 'GOVERNANCE_COMMAND_ESCAPES_EXTENSION');
  cleanupTempDir(base); cleanupTempDir(other);
});

test('a broken symlink named by argv is refused, not silently passed', () => {
  const { ext, proj } = fixture();
  symlinkSync(join(ext, 'bin', 'does-not-exist.sh'), join(ext, 'bin', 'broken.sh'));
  assert.throws(() => planExecPayload({
    extensionRoot: ext, extensionName: 'demo', projectRoot: proj,
    contributions: [{ entryId: 'c1', field: 'command', value: ['bash', 'bin/broken.sh'] }],
  }), e => e.code === 'GOVERNANCE_PAYLOAD_MISSING');
  cleanupTempDir(ext); cleanupTempDir(proj);
});

test('an argv array of 33 elements is refused by the cap', () => {
  const { ext, proj } = fixture();
  const value = ['bash', ...Array.from({ length: 32 }, (_, i) => `flag${i}`)];
  assert.equal(value.length, 33);
  assert.throws(() => planExecPayload({
    extensionRoot: ext, extensionName: 'demo', projectRoot: proj,
    contributions: [{ entryId: 'c1', field: 'command', value }],
  }), e => e.code === 'GOVERNANCE_LIMIT_EXCEEDED');
  cleanupTempDir(ext); cleanupTempDir(proj);
});

test('an empty argv array is refused', () => {
  const { ext, proj } = fixture();
  assert.throws(() => planExecPayload({
    extensionRoot: ext, extensionName: 'demo', projectRoot: proj,
    contributions: [{ entryId: 'c1', field: 'command', value: [] }],
  }), e => e.code === 'GOVERNANCE_COMMAND_NOT_ARGV');
  cleanupTempDir(ext); cleanupTempDir(proj);
});

test('a literal argv token carrying a shell metacharacter is refused', () => {
  const { ext, proj } = fixture();
  assert.throws(() => planExecPayload({
    extensionRoot: ext, extensionName: 'demo', projectRoot: proj,
    contributions: [{ entryId: 'c1', field: 'command', value: ['bash', 'bin/check.sh', 'a;rm -rf b'] }],
  }), e => e.code === 'GOVERNANCE_SCALAR_UNSAFE');
  cleanupTempDir(ext); cleanupTempDir(proj);
});

test('applyExecPayload copies into nested directories, read+execute but not writable', () => {
  const { ext, proj } = fixture();
  mkdirSync(join(ext, 'bin', 'nested', 'deep'), { recursive: true });
  writeFileSync(join(ext, 'bin', 'nested', 'deep', 'tool.sh'), '#!/bin/sh\nexit 0\n');
  const plan = planExecPayload({
    extensionRoot: ext, extensionName: 'demo', projectRoot: proj,
    contributions: [{ entryId: 'c1', field: 'command', value: ['sh', 'bin/nested/deep/tool.sh'] }],
  });
  const argv = applyExecPayload(plan, proj, 'demo');
  const dest = join(payloadDir(proj, 'demo'), 'bin/nested/deep/tool.sh');
  assert.equal(argv[0].value[1], dest);
  assert.equal(argv[0].value[0], 'sh');
  assert.equal(statSync(dest).mode & 0o777, 0o555);
  assert.doesNotThrow(() => accessSync(dest, constants.R_OK));
  assert.doesNotThrow(() => accessSync(dest, constants.X_OK));
  assert.throws(() => accessSync(dest, constants.W_OK), e => e.code === 'EACCES');
  cleanupTempDir(ext); cleanupTempDir(proj);
});

test('an argv[0] that is a contained path is copied and rewritten absolute', () => {
  const { ext, proj } = fixture();
  const plan = planExecPayload({
    extensionRoot: ext, extensionName: 'demo', projectRoot: proj,
    contributions: [{ entryId: 'c1', field: 'command', value: ['bin/check.sh', '--quiet'] }],
  });
  const argv = applyExecPayload(plan, proj, 'demo');
  assert.equal(argv[0].value[0], join(payloadDir(proj, 'demo'), 'bin/check.sh'));
  assert.equal(argv[0].value[1], '--quiet');
  cleanupTempDir(ext); cleanupTempDir(proj);
});

test('payloadDir refuses a non-kebab extension name', () => {
  const proj = createTempDir();
  assert.throws(() => payloadDir(proj, '../escape'),
    e => e.code === 'GOVERNANCE_COMMAND_ESCAPES_EXTENSION');
  assert.throws(() => payloadDir(proj, 'Demo'),
    e => e.code === 'GOVERNANCE_COMMAND_ESCAPES_EXTENSION');
  assert.equal(payloadDir(proj, 'demo-two'), join(proj, '.context-index', 'extensions', 'demo-two'));
  cleanupTempDir(proj);
});

test('the payload-files cap refuses more than 32 distinct files', () => {
  const ext = createTempDir();
  const proj = createTempDir();
  mkdirSync(join(ext, 'bin'), { recursive: true });
  const contributions = [];
  for (let i = 0; i < 33; i += 1) {
    writeFileSync(join(ext, 'bin', `f${i}.sh`), 'x\n');
    contributions.push({ entryId: `c${i}`, field: 'command', value: ['bash', `bin/f${i}.sh`] });
  }
  assert.equal(contributions.length, 33);
  assert.throws(() => planExecPayload({
    extensionRoot: ext, extensionName: 'demo', projectRoot: proj, contributions,
  }), e => e.code === 'GOVERNANCE_LIMIT_EXCEEDED');
  cleanupTempDir(ext); cleanupTempDir(proj);
});

test('a directory payload is refused at plan time, with a governance code', () => {
  const { ext, proj } = fixture();
  mkdirSync(join(ext, 'subdir'), { recursive: true });
  writeFileSync(join(ext, 'subdir', 'inner.sh'), 'x\n');
  // Refused while planning — not deferred to a raw EISDIR out of copyFileSync.
  assert.throws(() => planExecPayload({
    extensionRoot: ext, extensionName: 'demo', projectRoot: proj,
    contributions: [{ entryId: 'c1', field: 'command', value: ['bash', './subdir'] }],
  }), e => e.code === 'GOVERNANCE_PAYLOAD_MISSING');
  // And nothing was written by the refused plan.
  assert.equal(existsSync(payloadDir(proj, 'demo')), false);
  cleanupTempDir(ext); cleanupTempDir(proj);
});

test('a package field naming a directory is refused too', () => {
  const { ext, proj } = fixture();
  mkdirSync(join(ext, 'skills'), { recursive: true });
  assert.throws(() => planExecPayload({
    extensionRoot: ext, extensionName: 'demo', projectRoot: proj,
    contributions: [{ entryId: 'r1', field: 'package.skill', value: 'skills' }],
  }), e => e.code === 'GOVERNANCE_PAYLOAD_MISSING');
  cleanupTempDir(ext); cleanupTempDir(proj);
});

test('applying a plan under a different projectRoot is refused, not silently desynced', () => {
  const { ext, proj } = fixture();
  const other = createTempDir();
  const plan = planExecPayload({
    extensionRoot: ext, extensionName: 'demo', projectRoot: proj,
    contributions: [{ entryId: 'c1', field: 'command', value: ['bash', 'bin/check.sh'] }],
  });
  assert.throws(() => applyExecPayload(plan, other, 'demo'),
    e => e.code === 'GOVERNANCE_PAYLOAD_MISSING');
  // Neither root was populated by the refused apply.
  assert.equal(existsSync(payloadDir(other, 'demo')), false);
  assert.equal(existsSync(payloadDir(proj, 'demo')), false);
  cleanupTempDir(ext); cleanupTempDir(proj); cleanupTempDir(other);
});

test('applying a plan under a different extensionName is refused', () => {
  const { ext, proj } = fixture();
  const plan = planExecPayload({
    extensionRoot: ext, extensionName: 'demo', projectRoot: proj,
    contributions: [{ entryId: 'c1', field: 'command', value: ['bash', 'bin/check.sh'] }],
  });
  assert.throws(() => applyExecPayload(plan, proj, 'other-demo'),
    e => e.code === 'GOVERNANCE_PAYLOAD_MISSING');
  assert.equal(existsSync(payloadDir(proj, 'other-demo')), false);
  cleanupTempDir(ext); cleanupTempDir(proj);
});

test('an unsupported payload field is refused as not-allowed', () => {
  const { ext, proj } = fixture();
  assert.throws(() => planExecPayload({
    extensionRoot: ext, extensionName: 'demo', projectRoot: proj,
    contributions: [{ entryId: 'c1', field: 'package.binary', value: 'bin/check.sh' }],
  }), e => e.code === 'GOVERNANCE_FIELD_NOT_ALLOWED');
  cleanupTempDir(ext); cleanupTempDir(proj);
});

// These two pin the live wiring to lib/extensions/governance-values.mjs. They
// fail if the shared rules are ever swapped for a local reimplementation:
// only `isArgvPathElement` classifies `<flag>=<value-with-slash>` as a path,
// and only `assertSafeArgvToken` (not the stricter scalar rule) permits a
// leading `-`.

test('a flag-assigned escaping path is classified as a path by the shared rule and refused', () => {
  const { ext, proj } = fixture();
  assert.throws(() => planExecPayload({
    extensionRoot: ext, extensionName: 'demo', projectRoot: proj,
    contributions: [{
      entryId: 'c1', field: 'command',
      value: ['bash', 'bin/check.sh', '--config=../../etc/shadow'],
    }],
  }), e => e.code === 'GOVERNANCE_COMMAND_ESCAPES_EXTENSION');
  cleanupTempDir(ext); cleanupTempDir(proj);
});

test('flag tokens with a leading dash survive the argv rule', () => {
  const { ext, proj } = fixture();
  const plan = planExecPayload({
    extensionRoot: ext, extensionName: 'demo', projectRoot: proj,
    contributions: [{
      entryId: 'c1', field: 'command',
      value: ['node', 'bin/check.sh', '--', '--silent', '-e'],
    }],
  });
  const argv = applyExecPayload(plan, proj, 'demo');
  assert.deepEqual(argv[0].value, [
    'node',
    join(payloadDir(proj, 'demo'), 'bin/check.sh'),
    '--', '--silent', '-e',
  ]);
  cleanupTempDir(ext); cleanupTempDir(proj);
});

// Emission safety is NOT containment. Each of these files sits legitimately
// inside the extension; the attack is the FILENAME itself being a YAML
// injection once it is re-serialized into a governance config.
test('a contained file whose NAME is a YAML injection is refused at plan time', () => {
  const names = ['a#b.sh', 'a: b.sh', 'a"b.sh', 'a,b.sh'];
  assert.equal(names.length, 4);
  for (const filename of names) {
    const { ext, proj } = fixture();
    writeFileSync(join(ext, 'bin', filename), '#!/bin/sh\nexit 0\n');
    // The file is genuinely inside the extension — containment passes; it is
    // the emitted scalar that is refused.
    assert.throws(() => planExecPayload({
      extensionRoot: ext, extensionName: 'demo', projectRoot: proj,
      contributions: [{ entryId: 'c1', field: 'command', value: ['bash', `bin/${filename}`] }],
    }), e => e.code === 'GOVERNANCE_SCALAR_UNSAFE', `expected refusal for ${filename}`);
    // Refused during planning, so nothing reached disk.
    assert.equal(existsSync(payloadDir(proj, 'demo')), false);
    cleanupTempDir(ext); cleanupTempDir(proj);
  }
});

test('an unsafe filename is refused for package fields too', () => {
  const { ext, proj } = fixture();
  writeFileSync(join(ext, 'bin', 'a#b.md'), 'x\n');
  assert.throws(() => planExecPayload({
    extensionRoot: ext, extensionName: 'demo', projectRoot: proj,
    contributions: [{ entryId: 'r1', field: 'package.skill', value: 'bin/a#b.md' }],
  }), e => e.code === 'GOVERNANCE_SCALAR_UNSAFE');
  assert.equal(existsSync(payloadDir(proj, 'demo')), false);
  cleanupTempDir(ext); cleanupTempDir(proj);
});

test('ordinary paths still pass emission safety, including the absolute form', () => {
  const { ext, proj } = fixture();
  const plan = planExecPayload({
    extensionRoot: ext, extensionName: 'demo', projectRoot: proj,
    contributions: [{ entryId: 'c1', field: 'command', value: ['bash', 'bin/check.sh'] }],
  });
  // '/' is neither an unsafe character nor a leading indicator, so a normal
  // absolute temp-dir path survives the scalar rule unchanged.
  assert.equal(plan.rewrites[0].absolute, join(payloadDir(proj, 'demo'), 'bin/check.sh'));
  assert.equal(plan.rewrites[0].contextRelative, 'extensions/demo/bin/check.sh');
  cleanupTempDir(ext); cleanupTempDir(proj);
});

test('the same file contributed twice is copied once', () => {
  const { ext, proj } = fixture();
  const plan = planExecPayload({
    extensionRoot: ext, extensionName: 'demo', projectRoot: proj,
    contributions: [
      { entryId: 'c1', field: 'command', value: ['bash', 'bin/check.sh'] },
      { entryId: 'c2', field: 'command', value: ['bash', './bin/check.sh'] },
    ],
  });
  assert.equal(plan.copies.length, 1);
  assert.equal(plan.rewrites.length, 2);
  const argv = applyExecPayload(plan, proj, 'demo');
  const expected = join(payloadDir(proj, 'demo'), 'bin/check.sh');
  assert.equal(argv[0].value[1], expected);
  assert.equal(argv[1].value[1], expected);
  cleanupTempDir(ext); cleanupTempDir(proj);
});
