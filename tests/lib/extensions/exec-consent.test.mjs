import { readdirSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanupTempDir, createTempDir } from '../../helpers.mjs';
import {
  collectExecutableContributions,
  renderConsentPrompt,
  resolveExecConsent,
} from '../../../lib/extensions/exec-consent.mjs';

const blocks = [
  { target: 'validate.yaml', entries: [{ id: 'c1', kind: 'quality-gate', command: ['bash', 'bin/a.sh'] }] },
  { target: 'gates.yaml', entries: [{ id: 'g1', command: ['node', 'bin/b.mjs'] }] },
  { target: 'boundaries.yaml', entries: [{ id: 'b1', pattern: 'src/**' }] },
];

test('the union spans every target, not one', () => {
  const c = collectExecutableContributions(blocks);
  assert.equal(c.length, 2);
  assert.deepEqual(c.map(x => x.entryId).sort(), ['c1', 'g1']);
});

test('non-interactive without the flag refuses and names each command', () => {
  assert.throws(
    () => resolveExecConsent({
      contributions: collectExecutableContributions(blocks),
      allowExec: false, interactive: false,
    }),
    e => e.code === 'GOVERNANCE_EXEC_NOT_CONSENTED' && /bash bin\/a\.sh/.test(e.message)
  );
});

test('--allow-exec grants and stamps a timestamp', () => {
  const r = resolveExecConsent({
    contributions: collectExecutableContributions(blocks), allowExec: true, interactive: false,
  });
  assert.equal(r.granted, true);
  assert.match(r.at, /^\d{4}-\d{2}-\d{2}T/);
});

test('an interactive refusal is a refusal', () => {
  assert.throws(() => resolveExecConsent({
    contributions: collectExecutableContributions(blocks),
    allowExec: false, interactive: true, promptFn: () => 'n',
  }), e => e.code === 'GOVERNANCE_EXEC_NOT_CONSENTED');
});

test('no executable contributions means no prompt and no timestamp', () => {
  let prompted = false;
  const r = resolveExecConsent({
    contributions: [], allowExec: false, interactive: true,
    promptFn: () => { prompted = true; return 'y'; },
  });
  assert.equal(prompted, false);
  assert.equal(r.granted, true);
  assert.equal(r.at, null);
});

test('an interactive acceptance grants, stamps, and prompts exactly once with every command verbatim', () => {
  const seen = [];
  const r = resolveExecConsent({
    contributions: collectExecutableContributions(blocks),
    extensionName: 'acme-pack',
    allowExec: false,
    interactive: true,
    promptFn: (text) => { seen.push(text); return 'y'; },
  });
  assert.equal(r.granted, true);
  assert.match(r.at, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(seen.length, 1);
  assert.equal(typeof seen[0], 'string');
  assert.ok(seen[0].includes('bash bin/a.sh'), `prompt missing 'bash bin/a.sh': ${seen[0]}`);
  assert.ok(seen[0].includes('node bin/b.mjs'), `prompt missing 'node bin/b.mjs': ${seen[0]}`);
});

test('every non-affirmative interactive answer refuses, and a throwing prompt refuses', () => {
  const contributions = collectExecutableContributions(blocks);
  for (const answer of ['', 'no', 'n', 'nope', 'yes please', 'maybe', undefined, null]) {
    assert.throws(
      () => resolveExecConsent({ contributions, allowExec: false, interactive: true, promptFn: () => answer }),
      e => e.code === 'GOVERNANCE_EXEC_NOT_CONSENTED',
      `answer ${JSON.stringify(answer)} must refuse`
    );
  }
  assert.throws(
    () => resolveExecConsent({
      contributions, allowExec: false, interactive: true,
      promptFn: () => { throw new Error('stdin closed'); },
    }),
    e => e.code === 'GOVERNANCE_EXEC_NOT_CONSENTED'
  );
  // Trim + case-insensitive affirmatives only.
  for (const answer of ['Y ', ' yes', 'YES', '\ty\n']) {
    const r = resolveExecConsent({ contributions, allowExec: false, interactive: true, promptFn: () => answer });
    assert.equal(r.granted, true, `answer ${JSON.stringify(answer)} must grant`);
  }
});

test('package.skill and package.adapter are collected as executable contributions', () => {
  const c = collectExecutableContributions([
    { target: 'review.yaml', entries: [{ id: 'r1', package: { skill: 'bin/r.md', adapter: 'bin/a.md' } }] },
  ]);
  assert.equal(c.length, 2);
  assert.deepEqual(
    c.map(x => ({ target: x.target, entryId: x.entryId, field: x.field, value: x.value })),
    [
      { target: 'review.yaml', entryId: 'r1', field: 'package.skill', value: 'bin/r.md' },
      { target: 'review.yaml', entryId: 'r1', field: 'package.adapter', value: 'bin/a.md' },
    ]
  );
});

test('a validate.yaml entry that is not a quality-gate is not collected', () => {
  const c = collectExecutableContributions([
    {
      target: 'validate.yaml',
      entries: [
        { id: 'obs', kind: 'observational', command: ['bash', 'bin/obs.sh'] },
        { id: 'qg', kind: 'quality-gate', command: ['bash', 'bin/qg.sh'] },
      ],
    },
  ]);
  assert.deepEqual(c.map(x => x.entryId), ['qg']);
});

test('consent is per-install and never persisted', () => {
  const dir = createTempDir();
  try {
    const before = readdirSync(dir);
    assert.deepEqual(before, []);
    const contributions = collectExecutableContributions(blocks);
    const first = resolveExecConsent({ contributions, allowExec: true, interactive: false, projectRoot: dir });
    const tick = Date.now();
    while (Date.now() === tick) { /* advance the clock so the stamps cannot collide */ }
    const second = resolveExecConsent({ contributions, allowExec: true, interactive: false, projectRoot: dir });
    assert.notEqual(first.at, second.at);
    assert.deepEqual(readdirSync(dir), []);
  } finally {
    cleanupTempDir(dir);
  }
});

test('renderConsentPrompt names the extension and every command verbatim', () => {
  const text = renderConsentPrompt({
    extensionName: 'acme-pack',
    contributions: collectExecutableContributions([
      ...blocks,
      { target: 'review.yaml', entries: [{ id: 'r1', package: { skill: 'bin/r.md' } }] },
    ]),
  });
  assert.ok(text.includes('acme-pack'), text);
  assert.ok(text.includes('bash bin/a.sh'), text);
  assert.ok(text.includes('node bin/b.mjs'), text);
  assert.ok(text.includes('bin/r.md'), text);
  assert.ok(text.includes('validate.yaml'), text);
  assert.ok(text.includes('gates.yaml'), text);
  assert.ok(text.includes('c1'), text);
  assert.ok(text.includes('g1'), text);
});
