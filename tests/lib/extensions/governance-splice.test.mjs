import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLUGIN_ROOT } from '../../helpers.mjs';
import { parseYaml } from '../../../lib/profiles/yaml.mjs';
import { spliceRegistryEntries, emitEntry } from '../../../lib/extensions/governance-splice.mjs';

const throwsCode = (fn, code) => assert.throws(fn, e => e.code === code);

const governanceFixture = (name) =>
  readFileSync(join(PLUGIN_ROOT, '.context-index', 'governance', name), 'utf8');

const commentLines = (text) => text.split('\n').filter((l) => /^\s*#/.test(l));

test('form 1 — appends to a block sequence and preserves comments and siblings', () => {
  const src = [
    '# leading comment', 'checks:', '  - id: a', '    severity: error',
    '', '# a sibling comment', 'other_key: value', '',
  ].join('\n');
  const { text } = spliceRegistryEntries(src, 'checks', [{ id: 'b', severity: 'warning' }]);
  assert.ok(text.includes('# leading comment'));
  assert.ok(text.includes('# a sibling comment'));
  assert.ok(text.includes('other_key: value'));
  assert.ok(text.indexOf('- id: b') > text.indexOf('- id: a'));
  assert.ok(text.indexOf('- id: b') < text.indexOf('other_key: value'));
});

test('form 2 — rewrites an inline empty list', () => {
  const { text } = spliceRegistryEntries('reviewers: []\n', 'reviewers', [{ id: 'r' }]);
  assert.equal(text.includes('reviewers: []'), false);
  assert.match(text, /^reviewers:\n  - id: r\n/);
});

test('form 2 — a trailing comment on the key line is carried over verbatim', () => {
  const { text } = spliceRegistryEntries('reviewers: []   # none yet\n', 'reviewers', [{ id: 'r' }]);
  assert.equal(text, 'reviewers:   # none yet\n  - id: r\n');
});

test('form 3 — inserts above an indented comment block, byte-identical', () => {
  const src = 'boundaries:\n  # - id: example\n  #   pattern: "src/**"\n';
  const { text } = spliceRegistryEntries(src, 'boundaries', [{ id: 'b', pattern: 'lib/**' }]);
  assert.ok(text.includes('  # - id: example'));
  assert.ok(text.includes('  #   pattern: "src/**"'));
  assert.ok(text.indexOf('- id: b') < text.indexOf('# - id: example'));
});

test('form 6 — a duplicated root key refuses', () => {
  throwsCode(() => spliceRegistryEntries('gates:\n  - id: a\ngates:\n  - id: b\n', 'gates', [{ id: 'c' }]),
    'GOVERNANCE_PARSE_REFUSED');
  assert.throws(
    () => spliceRegistryEntries('gates:\n  - id: a\ngates:\n  - id: b\n', 'gates', [{ id: 'c' }]),
    /appears 2 times/,
    'the refusal must name the ambiguity, not fail for an unrelated reason'
  );
});

test('form 7 — a non-array root key refuses instead of degrading', () => {
  throwsCode(() => spliceRegistryEntries('gates: {}\n', 'gates', [{ id: 'c' }]), 'GOVERNANCE_PARSE_REFUSED');
  throwsCode(() => spliceRegistryEntries('gates: scalar\n', 'gates', [{ id: 'c' }]), 'GOVERNANCE_PARSE_REFUSED');
  assert.throws(
    () => spliceRegistryEntries('gates:\n  a: 1\n  b: 2\n', 'gates', [{ id: 'c' }]),
    (e) => e.code === 'GOVERNANCE_PARSE_REFUSED' && /not a sequence/.test(e.message),
    'a block map under the key is the same degradation class and must also refuse'
  );
});

test('a one-level object emits as an indented block map', () => {
  const { text } = spliceRegistryEntries('reviewers: []\n', 'reviewers',
    [{ id: 'r', package: { skill: 'a.md', adapter: 'b.md' } }]);
  assert.match(text, /  - id: r\n    package:\n      skill: a\.md\n      adapter: b\.md\n/);
});

test('an unrelated sibling block is byte-identical', () => {
  const src = 'gates:\n  - id: a\n    command: ["npm", "test"]\ntransitions: {}\n';
  const { text } = spliceRegistryEntries(src, 'gates', [{ id: 'b', command: ['node', 'x.mjs'] }]);
  assert.ok(text.endsWith('transitions: {}\n'));
});

// ── Form 4: key absent from an otherwise valid file ──────────────────────

test('form 4 — appends key and items at end of file, leaving prior bytes untouched', () => {
  const src = '# header comment\nother_key: value\nsecond_key: 2\n';
  const { text } = spliceRegistryEntries(src, 'checks', [{ id: 'n', severity: 'error' }]);
  assert.ok(text.startsWith(src), 'pre-existing content must be byte-identical and come first');
  assert.equal(text.slice(src.length), 'checks:\n  - id: n\n    severity: error\n');
  assert.ok(text.endsWith('\n'));
  assert.equal(text.endsWith('\n\n'), false, 'exactly one trailing newline');
});

test('form 4 — a file with no trailing newline keeps its convention', () => {
  const { text } = spliceRegistryEntries('other_key: value', 'checks', [{ id: 'n' }]);
  assert.equal(text, 'other_key: value\nchecks:\n  - id: n');
});

// ── Form 5: file absent (rawText === null) ───────────────────────────────
//
// `null` means "no file on disk" and is the ONLY input that fabricates a header.
// `''` and whitespace-only text mean "the file exists and is blank": appending a
// created-by-adev provenance claim to a file the project already owns would be a
// false claim, so those take the plain form-4 path instead.

test('form 5 — a null rawText creates the file with a generated header comment', () => {
  const { text } = spliceRegistryEntries(null, 'checks', [{ id: 'n', severity: 'error' }], {
    extensionName: 'acme-domain',
  });
  assert.ok(text.startsWith('# checks — governance registry created by adev extension install\n'));
  assert.ok(text.includes('# Extension: acme-domain\n'));
  assert.deepEqual(parseYaml(text), { checks: [{ id: 'n', severity: 'error' }] });
  assert.ok(text.endsWith('\n'));
});

test('form 5 — an absent file with no named extension omits the Extension line', () => {
  const { text } = spliceRegistryEntries(null, 'reviewers', [{ id: 'r' }]);
  assert.ok(text.startsWith('# reviewers — governance registry created by adev extension install\n'));
  assert.equal(text.includes('# Extension:'), false);
  assert.deepEqual(parseYaml(text), { reviewers: [{ id: 'r' }] });
});

test('undefined is NOT accepted as "file absent" — it fails loudly instead', () => {
  // An accidental undefined must not quietly fabricate a "created by adev" claim.
  throwsCode(() => spliceRegistryEntries(undefined, 'checks', [{ id: 'n' }]),
    'GOVERNANCE_FIELD_VALUE_INVALID');
  assert.throws(() => spliceRegistryEntries(undefined, 'checks', [{ id: 'n' }]), /null/);
});

test('an existing but empty file is appended to WITHOUT a fabricated provenance header', () => {
  const { text } = spliceRegistryEntries('', 'checks', [{ id: 'n' }], { extensionName: 'acme' });
  assert.equal(text, 'checks:\n  - id: n\n');
  assert.equal(text.includes('#'), false, 'no header may be fabricated for an existing file');
  assert.deepEqual(parseYaml(text), { checks: [{ id: 'n' }] });
});

test('an existing whitespace-only file keeps its bytes and gains no header', () => {
  const { text } = spliceRegistryEntries('\n  \n', 'reviewers', [{ id: 'r' }]);
  assert.equal(text.includes('#'), false, 'no header may be fabricated for an existing file');
  assert.ok(text.includes('\n  \n'), 'the existing whitespace bytes survive');
  assert.deepEqual(parseYaml(text), { reviewers: [{ id: 'r' }] });
});

// ── CRLF line endings ────────────────────────────────────────────────────
//
// A `\r` that is not recognised as part of the line terminator makes `checks:\r`
// invisible to the key scan: the key reads as absent, form 4 appends a SECOND
// `checks:` block, and the pre-existing entries vanish from the effective
// registry — silently, and permanently poisoning the file with a duplicate key.

test('CRLF form 1 — existing entries survive and the file stays CRLF', () => {
  const src = 'checks:\r\n  - id: a\r\n    severity: error\r\nother: v\r\n';
  const { text } = spliceRegistryEntries(src, 'checks', [{ id: 'b' }]);
  assert.equal(text.includes('\n\n'), false, 'no bare LF may be introduced into a CRLF file');
  assert.equal((text.match(/\r\n/g) || []).length, text.split('\n').length - 1);
  assert.equal(text.match(/^checks:/gm).length, 1, 'exactly one checks: block');
  assert.deepEqual(parseYaml(text), {
    checks: [{ id: 'a', severity: 'error' }, { id: 'b' }],
    other: 'v',
  });
});

test('CRLF form 2 — an inline empty list is rewritten in place', () => {
  const { text } = spliceRegistryEntries('reviewers: []\r\n', 'reviewers', [{ id: 'r' }]);
  assert.equal(text, 'reviewers:\r\n  - id: r\r\n');
  assert.deepEqual(parseYaml(text), { reviewers: [{ id: 'r' }] });
});

test('CRLF form 4 — an absent key is appended with CRLF endings', () => {
  const { text } = spliceRegistryEntries('other: v\r\n', 'gates', [{ id: 'g' }]);
  assert.equal(text, 'other: v\r\ngates:\r\n  - id: g\r\n');
  assert.deepEqual(parseYaml(text), { other: 'v', gates: [{ id: 'g' }] });
});

test('a mixed-ending file refuses rather than being silently normalised', () => {
  throwsCode(
    () => spliceRegistryEntries('checks:\r\n  - id: a\nother: v\n', 'checks', [{ id: 'b' }]),
    'GOVERNANCE_PARSE_REFUSED'
  );
  assert.throws(
    () => spliceRegistryEntries('checks:\r  - id: a\n', 'checks', [{ id: 'b' }]),
    (e) => e.code === 'GOVERNANCE_PARSE_REFUSED',
    'a lone carriage return is not a line terminator this splice can preserve'
  );
});

// ── Sibling keys the strict key pattern does not recognise ───────────────
//
// `lib/profiles/yaml.mjs:98` accepts far more key shapes than a conservative
// identifier pattern. A sibling the splice fails to recognise as a block
// boundary makes new items land AFTER it at indent 2, producing a file the
// repo's own parser rejects with "unexpected indentation".

test('a dotted sibling key ends the block, so the result still parses', () => {
  const src = 'checks:\n  - id: a\nsome.key: v\n';
  const { text } = spliceRegistryEntries(src, 'checks', [{ id: 'b' }]);
  assert.deepEqual(parseYaml(text), {
    checks: [{ id: 'a' }, { id: 'b' }],
    'some.key': 'v',
  });
  assert.ok(text.indexOf('- id: b') < text.indexOf('some.key: v'));
});

test('unusual top-level sibling shapes all act as block boundaries', () => {
  for (const sibling of ['some.key: v', 'a$b: v', 'UPPER_CASE: v', '"quoted key": v']) {
    const { text } = spliceRegistryEntries(`checks:\n  - id: a\n${sibling}\n`, 'checks', [{ id: 'b' }]);
    assert.ok(
      text.indexOf('- id: b') < text.indexOf(sibling),
      `new entries must land before the sibling ${JSON.stringify(sibling)}`
    );
    assert.deepEqual(parseYaml(text).checks, [{ id: 'a' }, { id: 'b' }]);
  }
});

// ── Refusals that were implemented but previously untested ───────────────

test('a non-empty inline flow sequence at the root key refuses', () => {
  throwsCode(
    () => spliceRegistryEntries('gates: [a, b]\n', 'gates', [{ id: 'c' }]),
    'GOVERNANCE_PARSE_REFUSED'
  );
  assert.throws(
    () => spliceRegistryEntries('gates: ["a"]\n', 'gates', [{ id: 'c' }]),
    (e) => /not an empty sequence/.test(e.message),
    'appending would require reserialising the existing items — the defect this module removes'
  );
});

test('an inline empty list with real content indented beneath it refuses', () => {
  throwsCode(
    () => spliceRegistryEntries('boundaries: []\n  - id: a\n', 'boundaries', [{ id: 'b' }]),
    'GOVERNANCE_PARSE_REFUSED'
  );
  assert.throws(
    () => spliceRegistryEntries('boundaries: []\n  key: v\n', 'boundaries', [{ id: 'b' }]),
    (e) => e.code === 'GOVERNANCE_PARSE_REFUSED' && /ambiguous/.test(e.message)
  );
});

// ── Zero-indent block sequences under the key ────────────────────────────
//
// `- id: a` at column 0 is legal YAML and common in hand-written files, but it is
// also a block boundary. Splicing at indent 2 next to it yields mixed indentation
// that `parseYaml` reads as a single-entry list — the zero-indent items AND every
// following sibling key silently vanish. That is form-7 class: the root key does
// not read as an array this splice can extend, so it belongs on the refusal path.

test('a zero-indent block sequence under the key refuses and leaves the file untouched', () => {
  const src = 'checks:\n- id: a\n- id: b\nother: v\n';
  throwsCode(() => spliceRegistryEntries(src, 'checks', [{ id: 'c' }]), 'GOVERNANCE_PARSE_REFUSED');
  assert.throws(
    () => spliceRegistryEntries(src, 'checks', [{ id: 'c' }]),
    (e) => /zero-indent|column 0/.test(e.message),
    'the refusal must name the zero-indent sequence, not fail for an unrelated reason'
  );
  assert.equal(src, 'checks:\n- id: a\n- id: b\nother: v\n', 'the input text is never mutated');
});

test('a zero-indent item following an indented one also refuses', () => {
  const src = 'checks:\n  - id: a\n- id: b\n';
  throwsCode(() => spliceRegistryEntries(src, 'checks', [{ id: 'c' }]), 'GOVERNANCE_PARSE_REFUSED');
  assert.equal(src, 'checks:\n  - id: a\n- id: b\n', 'the input text is never mutated');
});

test('a zero-indent sequence beneath an inline empty list refuses', () => {
  const src = 'boundaries: []\n- id: a\n';
  throwsCode(() => spliceRegistryEntries(src, 'boundaries', [{ id: 'b' }]), 'GOVERNANCE_PARSE_REFUSED');
  assert.equal(src, 'boundaries: []\n- id: a\n', 'the input text is never mutated');
});

test('a bare dash is a sequence marker, but a dash-led word is an ordinary boundary', () => {
  throwsCode(() => spliceRegistryEntries('checks:\n-\n  id: a\n', 'checks', [{ id: 'c' }]),
    'GOVERNANCE_PARSE_REFUSED');
  const { text } = spliceRegistryEntries('checks:\n-dash-led: v\n', 'checks', [{ id: 'c' }]);
  assert.equal(text, 'checks:\n  - id: c\n-dash-led: v\n');
});

test('a zero-indent MAPPING continuation is a genuine sibling and is spliced, not refused', () => {
  // parseYaml reads the input as {checks:{}, id:'a', other:'v'} — those keys were
  // never members of `checks`, so nothing is lost and refusing would be wrong.
  const src = 'checks:\nid: a\nother: v\n';
  const { text } = spliceRegistryEntries(src, 'checks', [{ id: 'c' }]);
  assert.deepEqual(parseYaml(text), { checks: [{ id: 'c' }], id: 'a', other: 'v' });
  assert.ok(text.endsWith('id: a\nother: v\n'), 'the sibling keys survive byte-identical');
});

// ── Real repo fixtures ───────────────────────────────────────────────────

test('real boundaries.yaml — form 2 and form 3 at once, comment block byte-identical', () => {
  const src = governanceFixture('boundaries.yaml');
  assert.ok(src.includes('boundaries: []'), 'fixture precondition: inline empty list');
  const before = commentLines(src);
  assert.equal(before.length, 18, 'fixture precondition: 18 comment lines');

  const { text } = spliceRegistryEntries(src, 'boundaries', [
    { id: 'no-cross-layer', severity: 'error', pattern: 'lib/.*' },
  ]);

  assert.equal(text.includes('boundaries: []'), false, 'the inline empty list is rewritten');
  assert.deepEqual(commentLines(text), before, 'every comment line stays byte-identical');
  assert.ok(text.indexOf('- id: no-cross-layer') < text.indexOf('# - id: no-direct-db-outside-db-layer'));
  assert.deepEqual(parseYaml(text).boundaries, [
    { id: 'no-cross-layer', severity: 'error', pattern: 'lib/.*' },
  ]);
});

test('real validate.yaml — all 20 comment lines survive and one entry is added', () => {
  const src = governanceFixture('validate.yaml');
  const before = commentLines(src);
  assert.equal(before.length, 20, 'fixture precondition: 20 comment lines');
  const originalCount = parseYaml(src).checks.length;

  const { text } = spliceRegistryEntries(src, 'checks', [
    { id: 'validate.check-99-extension', name: 'Extension Check', severity: 'warning' },
  ]);

  assert.deepEqual(commentLines(text), before);
  assert.equal(parseYaml(text).checks.length, originalCount + 1);
  assert.deepEqual(parseYaml(text).checks.at(-1), {
    id: 'validate.check-99-extension',
    name: 'Extension Check',
    severity: 'warning',
  });
});

test('real review.yaml — inline empty list under a long comment header', () => {
  const src = governanceFixture('review.yaml');
  const before = commentLines(src);
  const { text } = spliceRegistryEntries(src, 'reviewers', [{ id: 'domain-reviewer' }]);
  assert.deepEqual(commentLines(text), before);
  assert.deepEqual(parseYaml(text).reviewers, [{ id: 'domain-reviewer' }]);
});

test('real gates.yaml — the transitions sibling key survives untouched', () => {
  const src = governanceFixture('gates.yaml');
  const before = commentLines(src);
  const { text } = spliceRegistryEntries(src, 'gates', [
    { id: 'ext-lint', name: 'Ext Lint', command: ['npm', 'run', 'lint'] },
  ]);
  assert.deepEqual(commentLines(text), before);
  const parsed = parseYaml(text);
  assert.deepEqual(parsed.transitions, {});
  assert.equal(parsed.gates.length, 2);
  assert.deepEqual(parsed.gates.at(-1), {
    id: 'ext-lint', name: 'Ext Lint', command: ['npm', 'run', 'lint'],
  });
});

// ── Round-trip through the repo's own parser ─────────────────────────────

test('round-trip — forms 1, 2, 3 and 4 all reparse to the expected entries', () => {
  const form1 = spliceRegistryEntries(
    '# c\nchecks:\n  - id: a\n\nother_key: value\n', 'checks', [{ id: 'b', severity: 'warning' }]);
  assert.deepEqual(parseYaml(form1.text), {
    checks: [{ id: 'a' }, { id: 'b', severity: 'warning' }],
    other_key: 'value',
  });

  const form2 = spliceRegistryEntries('reviewers: []\n', 'reviewers', [{ id: 'r', min_score: 2 }]);
  assert.deepEqual(parseYaml(form2.text), { reviewers: [{ id: 'r', min_score: 2 }] });

  const form3 = spliceRegistryEntries(
    'boundaries:\n  # - id: example\n', 'boundaries', [{ id: 'b', pattern: 'lib/**' }]);
  assert.deepEqual(parseYaml(form3.text), { boundaries: [{ id: 'b', pattern: 'lib/**' }] });

  const form4 = spliceRegistryEntries('other_key: value\n', 'gates', [{ id: 'g', required: true }]);
  assert.deepEqual(parseYaml(form4.text), {
    other_key: 'value',
    gates: [{ id: 'g', required: true }],
  });
});

// ── Emission-time safety re-check ────────────────────────────────────────

test('emitEntry re-checks a top-level string leaf', () => {
  assert.throws(() => emitEntry({ id: 'x', description: 'a\nb' }, '  '), (e) =>
    e.code === 'GOVERNANCE_SCALAR_UNSAFE');
});

test('emitEntry re-checks nested-map and array leaves', () => {
  assert.throws(() => emitEntry({ id: 'x', package: { skill: 'a#b' } }, '  '), (e) =>
    e.code === 'GOVERNANCE_SCALAR_UNSAFE');
  assert.throws(() => emitEntry({ id: 'x', command: ['ok', 'a"b'] }, '  '), (e) =>
    e.code === 'GOVERNANCE_SCALAR_UNSAFE');
});

test('an unsafe leaf reaching the splice throws rather than becoming YAML structure', () => {
  throwsCode(
    () => spliceRegistryEntries('checks:\n  - id: a\n', 'checks', [{ id: 'x', description: 'a\nb' }]),
    'GOVERNANCE_SCALAR_UNSAFE'
  );
  assert.throws(
    () => spliceRegistryEntries('checks:\n  - id: a\n', 'checks', [{ id: 'x', name: '{k: v}' }]),
    (e) => e.code === 'GOVERNANCE_SCALAR_UNSAFE'
  );
});

test('emitEntry emits scalars bare, numbers and booleans raw, and arrays as flow sequences', () => {
  assert.deepEqual(emitEntry({ id: 'a', n: 3, b: false, c: ['x', 'y'] }, '  '), [
    '  - id: a',
    '    n: 3',
    '    b: false',
    '    c: ["x", "y"]',
  ]);
});

// ── insertedAt ───────────────────────────────────────────────────────────

test('insertedAt points at the line index where the first new entry landed', () => {
  const src = [
    '# leading comment', 'checks:', '  - id: a', '    severity: error',
    '', '# a sibling comment', 'other_key: value', '',
  ].join('\n');
  const { text, insertedAt } = spliceRegistryEntries(src, 'checks', [{ id: 'b' }]);
  assert.equal(insertedAt, 4);
  assert.equal(text.split('\n')[insertedAt], '  - id: b');
});

test('insertedAt is reported for form 2 and form 4 as well', () => {
  const form2 = spliceRegistryEntries('reviewers: []\n', 'reviewers', [{ id: 'r' }]);
  assert.equal(form2.insertedAt, 1);
  assert.equal(form2.text.split('\n')[form2.insertedAt], '  - id: r');

  const form4 = spliceRegistryEntries('a: 1\nb: 2\n', 'gates', [{ id: 'g' }]);
  assert.equal(form4.text.split('\n')[form4.insertedAt], '  - id: g');
});
