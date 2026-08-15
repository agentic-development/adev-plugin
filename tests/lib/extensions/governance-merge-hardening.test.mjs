/**
 * Two-phase governance merge — containment, additivity and refusal.
 *
 * Owns spec Behaviors 1, 3, 4, 6, 12, 13 and 14 of
 * `.context-index/specs/cross-cutting/extension-governance-merge-hardening.spec.md`.
 *
 * Assertions are written INLINE rather than behind a local helper: the repo's
 * PreToolUse gaming gate (`gaming-gate.sh`, EMPTY_ASSERTIONS) treats a block
 * whose only assertion is a helper call as unasserted.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createTempDir, cleanupTempDir, PLUGIN_ROOT } from '../../helpers.mjs';
import {
  mergeGovernanceEntries,
  planGovernanceMerge,
  applyGovernanceMerge,
} from '../../../lib/extensions/content-install.mjs';

const govPath = (root, f) => join(root, '.context-index', 'governance', f);

function project(files = {}) {
  const root = createTempDir();
  mkdirSync(join(root, '.context-index', 'governance'), { recursive: true });
  for (const [name, body] of Object.entries(files)) writeFileSync(govPath(root, name), body);
  return root;
}

const opts = { extensionName: 'demo', execConsent: { granted: true, at: null } };

// ── Behavior 1 — containment ───────────────────────────────────────────

test('Behavior 1 — a traversing target writes nothing', (t) => {
  const root = project();
  t.after(() => cleanupTempDir(root));

  assert.throws(
    () => mergeGovernanceEntries(root, '../../ESCAPED.yaml', [{ id: 'x' }], opts),
    (e) => e.code === 'PATH_TRAVERSAL'
  );
  assert.equal(existsSync(resolve(root, '..', '..', 'ESCAPED.yaml')), false);
  assert.equal(existsSync(resolve(root, '.context-index', 'ESCAPED.yaml')), false);
});

test('an absolute target escapes the governance directory and writes nothing', (t) => {
  const root = project();
  const outside = join(createTempDir(), 'ABSOLUTE.yaml');
  t.after(() => cleanupTempDir(root));

  assert.throws(
    () => mergeGovernanceEntries(root, outside, [{ id: 'x' }], opts),
    (e) => e.code === 'PATH_TRAVERSAL'
  );
  assert.equal(existsSync(outside), false);
});

// ── Behavior 3 — real root key, provenance, comment preservation ───────

test('Behavior 3 — entries land under the real root key, stamped, comments intact', (t) => {
  const src = '# c1\n# c2\nchecks:\n  - id: existing\n    kind: observational\n# tail\n';
  const root = project({ 'validate.yaml': src });
  t.after(() => cleanupTempDir(root));

  mergeGovernanceEntries(root, 'validate.yaml', [{ id: 'new', kind: 'observational' }], opts);

  const out = readFileSync(govPath(root, 'validate.yaml'), 'utf8');
  assert.ok(out.includes('checks:'));
  assert.equal(out.includes('validators:'), false);
  assert.ok(out.includes('# c1'));
  assert.ok(out.includes('# c2'));
  assert.ok(out.includes('# tail'));
  assert.ok(out.includes('source: extension:demo'));
  assert.ok(out.includes('- id: new'));
  assert.ok(out.includes('- id: existing'));
});

test('a real validate.yaml keeps every comment line and every pre-existing check', (t) => {
  const src = readFileSync(join(PLUGIN_ROOT, '.context-index', 'governance', 'validate.yaml'), 'utf8');
  const root = project({ 'validate.yaml': src });
  t.after(() => cleanupTempDir(root));

  const commentsBefore = src.split('\n').filter((l) => l.trim().startsWith('#'));
  const idsBefore = src.split('\n').filter((l) => /^\s*-\s+id:/.test(l));
  assert.ok(commentsBefore.length >= 20, `fixture must carry the comment block, got ${commentsBefore.length}`);

  mergeGovernanceEntries(root, 'validate.yaml', [{ id: 'ext-check', kind: 'observational' }], opts);

  const out = readFileSync(govPath(root, 'validate.yaml'), 'utf8');
  const commentsAfter = out.split('\n').filter((l) => l.trim().startsWith('#'));
  const idsAfter = out.split('\n').filter((l) => /^\s*-\s+id:/.test(l));
  assert.deepEqual(commentsAfter, commentsBefore);
  assert.deepEqual(idsAfter, [...idsBefore, '  - id: ext-check']);
});

// ── Behavior 4 — collisions are skipped, never merged into ─────────────

test('Behavior 4 — a collision is skipped and the existing entry is byte-identical', (t) => {
  const src = 'gates:\n  - id: g1\n    tier: 1\n';
  const root = project({ 'gates.yaml': src });
  t.after(() => cleanupTempDir(root));

  const r = mergeGovernanceEntries(
    root,
    'gates.yaml',
    [{ id: 'g1', command: ['node', 'x.mjs'], severity: 'error' }],
    opts
  );

  assert.equal(readFileSync(govPath(root, 'gates.yaml'), 'utf8'), src);
  assert.ok(r.mergesApplied.some((m) => /skipped: g1/.test(m)));
});

test('the arbitrary-execution path — no command reaches an existing gate entry', (t) => {
  const src = 'gates:\n  - id: lint\n    tier: 1\n';
  const root = project({ 'gates.yaml': src });
  t.after(() => cleanupTempDir(root));

  mergeGovernanceEntries(root, 'gates.yaml', [{ id: 'lint', command: ['sh', 'evil.sh'] }], opts);

  assert.equal(readFileSync(govPath(root, 'gates.yaml'), 'utf8'), src);
});

test('a colliding entry is skipped while a fresh sibling in the same block is appended', (t) => {
  const src = 'gates:\n  - id: g1\n    tier: 1\n';
  const root = project({ 'gates.yaml': src });
  t.after(() => cleanupTempDir(root));

  const r = mergeGovernanceEntries(
    root,
    'gates.yaml',
    [
      { id: 'g1', command: ['node', 'a.mjs'] },
      { id: 'g2', command: ['node', 'b.mjs'] },
    ],
    opts
  );

  const out = readFileSync(govPath(root, 'gates.yaml'), 'utf8');
  assert.ok(out.startsWith(src));
  assert.equal(out.includes('a.mjs'), false);
  assert.ok(out.includes('- id: g2'));
  assert.deepEqual(r.mergesApplied, ['skipped: g1', 'appended: g2']);
});

// ── Behavior 12 — refuse rather than destroy ───────────────────────────

test('Behavior 12 — an unparseable registry refuses and is left byte-identical', (t) => {
  const src = 'checks:\n      - id: a\n  - id: b\n';
  const root = project({ 'validate.yaml': src });
  t.after(() => cleanupTempDir(root));

  assert.throws(
    () => mergeGovernanceEntries(root, 'validate.yaml', [{ id: 'n' }], opts),
    (e) => e.code === 'GOVERNANCE_PARSE_REFUSED'
  );
  assert.equal(readFileSync(govPath(root, 'validate.yaml'), 'utf8'), src);
});

test('a duplicated root key refuses and is left byte-identical', (t) => {
  const src = 'checks:\n  - id: a\nchecks:\n  - id: b\n';
  const root = project({ 'validate.yaml': src });
  t.after(() => cleanupTempDir(root));

  assert.throws(
    () => mergeGovernanceEntries(root, 'validate.yaml', [{ id: 'n' }], opts),
    (e) => e.code === 'GOVERNANCE_PARSE_REFUSED'
  );
  assert.equal(readFileSync(govPath(root, 'validate.yaml'), 'utf8'), src);
});

test('a root key that is not a sequence refuses and is left byte-identical', (t) => {
  const src = 'checks:\n  a: 1\n';
  const root = project({ 'validate.yaml': src });
  t.after(() => cleanupTempDir(root));

  assert.throws(
    () => mergeGovernanceEntries(root, 'validate.yaml', [{ id: 'n' }], opts),
    (e) => e.code === 'GOVERNANCE_PARSE_REFUSED'
  );
  assert.equal(readFileSync(govPath(root, 'validate.yaml'), 'utf8'), src);
});

test('a registry mixing CRLF and LF refuses and is left byte-identical', (t) => {
  const src = 'checks:\r\n  - id: a\r\n    kind: observational\n';
  const root = project({ 'validate.yaml': src });
  t.after(() => cleanupTempDir(root));

  assert.throws(
    () => mergeGovernanceEntries(root, 'validate.yaml', [{ id: 'n', kind: 'observational' }], opts),
    (e) => e.code === 'GOVERNANCE_PARSE_REFUSED'
  );
  assert.equal(readFileSync(govPath(root, 'validate.yaml'), 'utf8'), src);
});

// ── Behavior 13 — plan writes nothing ──────────────────────────────────

test('Behavior 13 — plan writes nothing even when it succeeds', (t) => {
  const src = 'boundaries: []\n';
  const root = project({ 'boundaries.yaml': src });
  t.after(() => cleanupTempDir(root));

  const plan = planGovernanceMerge(root, 'boundaries.yaml', [{ id: 'b', pattern: 'lib/**' }], opts);

  assert.equal(readFileSync(govPath(root, 'boundaries.yaml'), 'utf8'), src);
  assert.deepEqual(plan.mergesApplied, ['appended: b']);

  applyGovernanceMerge(plan);
  const out = readFileSync(govPath(root, 'boundaries.yaml'), 'utf8');
  assert.ok(out.includes('- id: b'));
  assert.ok(out.includes('pattern: lib/**'));
});

test('plan creates no governance file when the target does not exist yet', (t) => {
  const root = createTempDir();
  mkdirSync(join(root, '.context-index'), { recursive: true });
  t.after(() => cleanupTempDir(root));

  planGovernanceMerge(root, 'review.yaml', [{ id: 'r', dispatch: 'always' }], opts);

  assert.equal(existsSync(govPath(root, 'review.yaml')), false);
  assert.equal(existsSync(join(root, '.context-index', 'governance')), false);
});

// ── Behavior 14 — caps ─────────────────────────────────────────────────

test('Behavior 14 — caps are enforced', (t) => {
  const root = project({ 'boundaries.yaml': 'boundaries: []\n' });
  t.after(() => cleanupTempDir(root));

  const many = Array.from({ length: 33 }, (_, i) => ({ id: `b${i}`, pattern: 'lib/**' }));
  assert.throws(
    () => mergeGovernanceEntries(root, 'boundaries.yaml', many, opts),
    (e) => e.code === 'GOVERNANCE_LIMIT_EXCEEDED'
  );
  assert.equal(readFileSync(govPath(root, 'boundaries.yaml'), 'utf8'), 'boundaries: []\n');
});

test('exactly 32 entries are accepted', (t) => {
  const root = project({ 'boundaries.yaml': 'boundaries: []\n' });
  t.after(() => cleanupTempDir(root));

  const many = Array.from({ length: 32 }, (_, i) => ({ id: `b${i}`, pattern: 'lib/**' }));
  const r = mergeGovernanceEntries(root, 'boundaries.yaml', many, opts);
  assert.equal(r.mergesApplied.length, 32);
  assert.ok(readFileSync(govPath(root, 'boundaries.yaml'), 'utf8').includes('- id: b31'));
});

// ── Forged provenance precedence ───────────────────────────────────────

test('a supplied source reports GOVERNANCE_SOURCE_FORGED, never GOVERNANCE_FIELD_NOT_ALLOWED', (t) => {
  const src = 'gates:\n  - id: g1\n    tier: 1\n';
  const root = project({ 'gates.yaml': src });
  t.after(() => cleanupTempDir(root));

  assert.throws(
    () => mergeGovernanceEntries(
      root,
      'gates.yaml',
      [{ id: 'g2', command: ['node', 'a.mjs'], source: 'extension:trusted' }],
      opts
    ),
    (e) => e.code === 'GOVERNANCE_SOURCE_FORGED'
  );
  assert.throws(
    () => mergeGovernanceEntries(
      root,
      'gates.yaml',
      [{ id: 'g3', command: ['node', 'a.mjs'], exec_consented_at: '2020-01-01T00:00:00.000Z' }],
      opts
    ),
    (e) => e.code === 'GOVERNANCE_SOURCE_FORGED'
  );
  assert.equal(readFileSync(govPath(root, 'gates.yaml'), 'utf8'), src);
});

// ── Non-writable registries ────────────────────────────────────────────

test('risk-policies.yaml is not extension-writable and nothing is written', (t) => {
  const src = '# project-owned\npolicies: []\n';
  const root = project({ 'risk-policies.yaml': src });
  t.after(() => cleanupTempDir(root));

  assert.throws(
    () => mergeGovernanceEntries(root, 'risk-policies.yaml', [{ id: 'x' }], opts),
    (e) => e.code === 'UNKNOWN_GOVERNANCE_TARGET'
  );
  assert.equal(readFileSync(govPath(root, 'risk-policies.yaml'), 'utf8'), src);
});

test('sensitive-paths.yaml is not extension-writable and nothing is written', (t) => {
  const src = '# project-owned\npaths: []\n';
  const root = project({ 'sensitive-paths.yaml': src });
  t.after(() => cleanupTempDir(root));

  assert.throws(
    () => mergeGovernanceEntries(root, 'sensitive-paths.yaml', [{ id: 'x' }], opts),
    (e) => e.code === 'UNKNOWN_GOVERNANCE_TARGET'
  );
  assert.equal(readFileSync(govPath(root, 'sensitive-paths.yaml'), 'utf8'), src);
});

// ── Sibling keys survive ───────────────────────────────────────────────

test('transitions: in a real gates.yaml is byte-identical after a successful gates merge', (t) => {
  const src = readFileSync(join(PLUGIN_ROOT, '.context-index', 'governance', 'gates.yaml'), 'utf8');
  const root = project({ 'gates.yaml': src });
  t.after(() => cleanupTempDir(root));

  const transitionsBefore = src.slice(src.indexOf('transitions:'));
  assert.ok(src.includes('transitions:'), 'fixture must carry a transitions sibling key');

  mergeGovernanceEntries(root, 'gates.yaml', [{ id: 'ext-gate', command: ['node', 'g.mjs'] }], opts);

  const out = readFileSync(govPath(root, 'gates.yaml'), 'utf8');
  assert.equal(out.slice(out.indexOf('transitions:')), transitionsBefore);
  assert.ok(out.includes('- id: ext-gate'));
});

// ── Plan-phase atomicity ───────────────────────────────────────────────

test('an unsafe scalar anywhere in the batch refuses and writes nothing', (t) => {
  const src = 'boundaries:\n  - id: b0\n    pattern: lib/**\n';
  const root = project({ 'boundaries.yaml': src });
  t.after(() => cleanupTempDir(root));

  assert.throws(
    () => mergeGovernanceEntries(
      root,
      'boundaries.yaml',
      [
        { id: 'ok-1', pattern: 'lib/**' },
        { id: 'bad', description: 'x: y' },
        { id: 'ok-2', pattern: 'cli/**' },
      ],
      opts
    ),
    (e) => e.code === 'GOVERNANCE_SCALAR_UNSAFE'
  );
  assert.equal(readFileSync(govPath(root, 'boundaries.yaml'), 'utf8'), src);
});

// ── Open-namespace closure (constraint C) ──────────────────────────────

test('an unknown profile is refused with GOVERNANCE_FIELD_VALUE_INVALID', (t) => {
  const src = 'reviewers: []\n';
  const root = project({ 'review.yaml': src });
  t.after(() => cleanupTempDir(root));

  assert.throws(
    () => mergeGovernanceEntries(
      root,
      'review.yaml',
      [{ id: 'r1', dispatch: 'always', profile: 'no-such-profile' }],
      opts
    ),
    (e) => e.code === 'GOVERNANCE_FIELD_VALUE_INVALID' && /profile/.test(e.message) &&
      /no-such-profile/.test(e.message)
  );
  assert.equal(readFileSync(govPath(root, 'review.yaml'), 'utf8'), src);
});

test('an unknown context_pack is refused with GOVERNANCE_FIELD_VALUE_INVALID', (t) => {
  const src = 'reviewers: []\n';
  const root = project({ 'review.yaml': src });
  t.after(() => cleanupTempDir(root));

  assert.throws(
    () => mergeGovernanceEntries(
      root,
      'review.yaml',
      [{ id: 'r1', dispatch: 'always', context_pack: 'no-such-pack' }],
      opts
    ),
    (e) => e.code === 'GOVERNANCE_FIELD_VALUE_INVALID' && /context_pack/.test(e.message) &&
      /no-such-pack/.test(e.message)
  );
  assert.equal(readFileSync(govPath(root, 'review.yaml'), 'utf8'), src);
});

test('an unresolvable plugin: prompt is refused with GOVERNANCE_FIELD_VALUE_INVALID', (t) => {
  const src = 'reviewers: []\n';
  const root = project({ 'review.yaml': src });
  t.after(() => cleanupTempDir(root));

  assert.throws(
    () => mergeGovernanceEntries(
      root,
      'review.yaml',
      [{ id: 'r1', dispatch: 'always', prompt: 'plugin:no-such-skill/PROMPT.md' }],
      opts
    ),
    (e) => e.code === 'GOVERNANCE_FIELD_VALUE_INVALID' && /prompt/.test(e.message)
  );
  assert.equal(readFileSync(govPath(root, 'review.yaml'), 'utf8'), src);
});

test('a prompt escaping the plugin skills tree is refused', (t) => {
  const src = 'reviewers: []\n';
  const root = project({ 'review.yaml': src });
  t.after(() => cleanupTempDir(root));

  assert.throws(
    () => mergeGovernanceEntries(
      root,
      'review.yaml',
      [{ id: 'r1', dispatch: 'always', prompt: 'plugin:../../etc/passwd' }],
      opts
    ),
    (e) => e.code === 'GOVERNANCE_FIELD_VALUE_INVALID'
  );
  assert.equal(readFileSync(govPath(root, 'review.yaml'), 'utf8'), src);
});

test('known profile, context_pack and prompt values are accepted', (t) => {
  const root = project({ 'review.yaml': 'reviewers: []\n' });
  t.after(() => cleanupTempDir(root));

  const r = mergeGovernanceEntries(
    root,
    'review.yaml',
    [{
      id: 'r1',
      dispatch: 'always',
      profile: 'read-only',
      context_pack: 'base',
      prompt: 'plugin:review-specs/SKILL.md',
    }],
    { ...opts, pluginRoot: PLUGIN_ROOT }
  );

  assert.deepEqual(r.mergesApplied, ['appended: r1']);
  const out = readFileSync(govPath(root, 'review.yaml'), 'utf8');
  assert.ok(out.includes('profile: read-only'));
  assert.ok(out.includes('context_pack: base'));
  assert.ok(out.includes('prompt: plugin:review-specs/SKILL.md'));
});

// ── Provenance stamping ────────────────────────────────────────────────

test('exec_consented_at is absent when consent carries no timestamp', (t) => {
  const root = project({ 'gates.yaml': 'gates: []\n' });
  t.after(() => cleanupTempDir(root));

  mergeGovernanceEntries(root, 'gates.yaml', [{ id: 'g1', command: ['node', 'a.mjs'] }], opts);

  const out = readFileSync(govPath(root, 'gates.yaml'), 'utf8');
  assert.ok(out.includes('source: extension:demo'));
  assert.equal(out.includes('exec_consented_at'), false);
});

test('exec_consented_at stamps only the entries that carry an executable contribution', (t) => {
  const root = project({ 'validate.yaml': 'checks: []\n' });
  t.after(() => cleanupTempDir(root));

  const at = '2026-08-15T10:20:30.000Z';
  mergeGovernanceEntries(
    root,
    'validate.yaml',
    [
      { id: 'runs', kind: 'quality-gate', profile: 'read-only', command: ['npm', 'test'] },
      { id: 'inert', kind: 'observational' },
    ],
    { extensionName: 'demo', execConsent: { granted: true, at } }
  );

  const out = readFileSync(govPath(root, 'validate.yaml'), 'utf8');
  const runsBlock = out.slice(out.indexOf('- id: runs'), out.indexOf('- id: inert'));
  const inertBlock = out.slice(out.indexOf('- id: inert'));
  assert.ok(runsBlock.includes(`exec_consented_at: ${at}`));
  assert.equal(inertBlock.includes('exec_consented_at'), false);
  assert.ok(inertBlock.includes('source: extension:demo'));
});

// ── Argv rewrites, per emission form (constraint B) ────────────────────

test('a command rewrite emits the ABSOLUTE payload path', (t) => {
  const root = project({ 'gates.yaml': 'gates: []\n' });
  t.after(() => cleanupTempDir(root));

  const absolute = join(root, '.context-index', 'extensions', 'demo', 'tools', 'x.mjs');
  mergeGovernanceEntries(
    root,
    'gates.yaml',
    [{ id: 'g1', command: ['node', 'tools/x.mjs'] }],
    {
      ...opts,
      payloadRewrites: [{
        entryId: 'g1',
        field: 'command',
        index: 1,
        form: 'absolute',
        prefix: '',
        absolute,
        contextRelative: 'extensions/demo/tools/x.mjs',
      }],
    }
  );

  const out = readFileSync(govPath(root, 'gates.yaml'), 'utf8');
  assert.ok(out.includes(`command: ["node", "${absolute}"]`), out);
  assert.equal(out.includes('"tools/x.mjs"'), false);
});

test('a package.skill rewrite emits the .context-index-relative path', (t) => {
  const root = project({ 'review.yaml': 'reviewers: []\n' });
  t.after(() => cleanupTempDir(root));

  const absolute = join(root, '.context-index', 'extensions', 'demo', 'prompts', 'r.md');
  mergeGovernanceEntries(
    root,
    'review.yaml',
    [{ id: 'r1', dispatch: 'always', package: { skill: 'prompts/r.md' } }],
    {
      ...opts,
      payloadRewrites: [{
        entryId: 'r1',
        field: 'package.skill',
        index: null,
        form: 'contextRelative',
        prefix: '',
        absolute,
        contextRelative: 'extensions/demo/prompts/r.md',
      }],
    }
  );

  const out = readFileSync(govPath(root, 'review.yaml'), 'utf8');
  assert.ok(out.includes('skill: extensions/demo/prompts/r.md'), out);
  assert.equal(out.includes(absolute), false);
});

test('a command rewrite targeting an entry with no command refuses and writes nothing', (t) => {
  const src = 'gates: []\n';
  const root = project({ 'gates.yaml': src });
  t.after(() => cleanupTempDir(root));

  assert.throws(
    () => mergeGovernanceEntries(
      root,
      'gates.yaml',
      [{ id: 'g1', description: 'no command here' }],
      {
        ...opts,
        payloadRewrites: [{
          entryId: 'g1',
          field: 'command',
          index: 1,
          form: 'absolute',
          prefix: '',
          absolute: join(root, '.context-index', 'extensions', 'demo', 'tools', 'x.mjs'),
          contextRelative: 'extensions/demo/tools/x.mjs',
        }],
      }
    ),
    (e) => e.code === 'GOVERNANCE_FIELD_VALUE_INVALID' && /command/.test(e.message)
  );
  assert.equal(readFileSync(govPath(root, 'gates.yaml'), 'utf8'), src);
});

test('a package rewrite targeting an entry with no package refuses and writes nothing', (t) => {
  const src = 'reviewers: []\n';
  const root = project({ 'review.yaml': src });
  t.after(() => cleanupTempDir(root));

  // Creating the `package` here would emit an entry that is executable —
  // resolveReviewerPath resolves package.skill and the reviewer then runs it —
  // yet carries no exec_consented_at, because the entry was not executable when
  // the consent set was collected. Refuse rather than manufacture that shape.
  assert.throws(
    () => mergeGovernanceEntries(
      root,
      'review.yaml',
      [{ id: 'r1', dispatch: 'always' }],
      {
        ...opts,
        execConsent: { granted: true, at: '2026-08-15T10:20:30.000Z' },
        payloadRewrites: [{
          entryId: 'r1',
          field: 'package.skill',
          index: null,
          form: 'contextRelative',
          prefix: '',
          absolute: join(root, '.context-index', 'extensions', 'demo', 'prompts', 'r.md'),
          contextRelative: 'extensions/demo/prompts/r.md',
        }],
      }
    ),
    (e) => e.code === 'GOVERNANCE_FIELD_VALUE_INVALID' && /package\.skill/.test(e.message)
  );
  assert.equal(readFileSync(govPath(root, 'review.yaml'), 'utf8'), src);
});

// ── Splice form 5: absent vs. existing-but-empty ───────────────────────

test('an absent governance file is created with a provenance header', (t) => {
  const root = createTempDir();
  mkdirSync(join(root, '.context-index'), { recursive: true });
  t.after(() => cleanupTempDir(root));

  mergeGovernanceEntries(root, 'review.yaml', [{ id: 'first', dispatch: 'always' }], opts);

  const out = readFileSync(govPath(root, 'review.yaml'), 'utf8');
  assert.ok(out.startsWith('# reviewers — governance registry created by adev extension install\n'), out);
  assert.ok(out.includes('# Extension: demo'));
  assert.ok(out.includes('- id: first'));
});

test('an existing but empty governance file is appended to without a fabricated header', (t) => {
  const root = project({ 'review.yaml': '' });
  t.after(() => cleanupTempDir(root));

  mergeGovernanceEntries(root, 'review.yaml', [{ id: 'first', dispatch: 'always' }], opts);

  const out = readFileSync(govPath(root, 'review.yaml'), 'utf8');
  assert.equal(out.includes('#'), false, out);
  assert.ok(out.includes('reviewers:'));
  assert.ok(out.includes('- id: first'));
});
