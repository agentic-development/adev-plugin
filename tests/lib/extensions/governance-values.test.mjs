import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertSafeScalar, assertSafeArgvToken, isArgvPathElement, assertValidValue, assertStringId }
  from '../../../lib/extensions/governance-values.mjs';
import { assertWithinCaps, CAPS } from '../../../lib/extensions/governance-values.mjs';

const throwsCode = (fn, code) => assert.throws(fn, e => e.code === code);

test('flow indicators are refused — the reparse path', () => {
  // Direct form as well as the helper form, so the field path is asserted verbatim.
  assert.throws(
    () => assertSafeScalar('{command: rm -rf /}', 'description'),
    e => e.code === 'GOVERNANCE_SCALAR_UNSAFE' && /description/.test(e.message),
  );
  throwsCode(() => assertSafeScalar('{command: rm -rf /}', 'description'), 'GOVERNANCE_SCALAR_UNSAFE');
  for (const bad of ['a\nb', 'a\rb', 'a"b', "a'b", 'a#b', '[x]', 'a,b'])
    throwsCode(() => assertSafeScalar(bad, 'f'), 'GOVERNANCE_SCALAR_UNSAFE');
  for (const bad of ['-x', '?x', ':x', '&x', '*x', '!x', '|x', '>x', '%x', '@x', '`x'])
    throwsCode(() => assertSafeScalar(bad, 'f'), 'GOVERNANCE_SCALAR_UNSAFE');
  assert.doesNotThrow(() => assertSafeScalar('a plain description', 'f'));
});

test('argv tokens keep CLI flags but refuse metacharacters', () => {
  for (const ok of ['npm', 'test', '--', '--silent', '-q', 'bin/check.sh', './x.sh', '--config=a/b'])
    assert.doesNotThrow(() => assertSafeArgvToken(ok));
  for (const bad of ['x$(id)', 'a;b', 'a b', 'a`b`', 'a|b', 'a>b', 'a\\b'])
    throwsCode(() => assertSafeArgvToken(bad), 'GOVERNANCE_SCALAR_UNSAFE');
});

test('path elements are identified positively', () => {
  assert.equal(isArgvPathElement('bin/check.sh'), true);
  assert.equal(isArgvPathElement('./check.sh'), true);
  assert.equal(isArgvPathElement('--config=../../etc/shadow'), true);
  assert.equal(isArgvPathElement('--silent'), false);
  assert.equal(isArgvPathElement('npm'), false);
});

test('nesting is capped at one level and every leaf is checked', () => {
  assert.doesNotThrow(() => assertValidValue({ skill: 'a/b.md' }, 'package'));
  throwsCode(() => assertValidValue({ triggered: { patterns: ['x'] } }, 'dispatch'), 'GOVERNANCE_FIELD_VALUE_INVALID');
  throwsCode(() => assertValidValue(['ok', 'bad#value'], 'after'), 'GOVERNANCE_SCALAR_UNSAFE');
  throwsCode(() => assertValidValue({ k: 'bad\nvalue' }, 'package'), 'GOVERNANCE_SCALAR_UNSAFE');
});

test('a non-string id is refused', () => {
  assert.throws(() => assertStringId({ id: 42 }), e => e.code === 'GOVERNANCE_FIELD_VALUE_INVALID');
  throwsCode(() => assertStringId({ id: 42 }), 'GOVERNANCE_FIELD_VALUE_INVALID');
  throwsCode(() => assertStringId({ id: true }), 'GOVERNANCE_FIELD_VALUE_INVALID');
});

// ── Coverage beyond the plan's prescribed suite ────────────────────────

test('a scalar longer than the 512-char cap is refused', () => {
  assert.doesNotThrow(() => assertSafeScalar('a'.repeat(CAPS.scalarChars), 'f'));
  throwsCode(() => assertSafeScalar('a'.repeat(CAPS.scalarChars + 1), 'f'), 'GOVERNANCE_LIMIT_EXCEEDED');
});

test('assertWithinCaps enforces each cap at the boundary', () => {
  assert.equal(CAPS.scalarChars, 512);
  assert.equal(CAPS.argvElements, 32);
  assert.equal(CAPS.entriesPerTarget, 32);
  assert.equal(CAPS.payloadFiles, 32);

  assert.doesNotThrow(() => assertWithinCaps({
    scalarChars: 512, argvElements: 32, entriesPerTarget: 32, payloadFiles: 32,
  }));

  for (const key of ['scalarChars', 'argvElements', 'entriesPerTarget', 'payloadFiles']) {
    throwsCode(() => assertWithinCaps({ [key]: CAPS[key] + 1 }), 'GOVERNANCE_LIMIT_EXCEEDED');
  }

  // The message names the cap that was exceeded.
  assert.throws(
    () => assertWithinCaps({ argvElements: 33 }),
    e => e.code === 'GOVERNANCE_LIMIT_EXCEEDED' && /argvElements/.test(e.message),
  );

  // Absent counts are simply not checked.
  assert.doesNotThrow(() => assertWithinCaps({}));
});

test('a missing or empty id is refused', () => {
  throwsCode(() => assertStringId({}), 'GOVERNANCE_FIELD_VALUE_INVALID');
  throwsCode(() => assertStringId({ id: '' }), 'GOVERNANCE_FIELD_VALUE_INVALID');
  throwsCode(() => assertStringId({ id: null }), 'GOVERNANCE_FIELD_VALUE_INVALID');
  assert.doesNotThrow(() => assertStringId({ id: 'no-inline-node' }));
});

test('assertValidValue accepts bare scalars of each allowed type', () => {
  assert.doesNotThrow(() => assertValidValue('plain', 'f'));
  assert.doesNotThrow(() => assertValidValue(42, 'f'));
  assert.doesNotThrow(() => assertValidValue(true, 'f'));
  assert.doesNotThrow(() => assertValidValue(['a', 'b/c.md'], 'f'));
  assert.doesNotThrow(() => assertValidValue({ k: 'v', n: 3, b: false }, 'f'));
});

test('one level means scalar leaves only', () => {
  assert.throws(() => assertValidValue({ k: ['a'] }, 'package'), e => e.code === 'GOVERNANCE_FIELD_VALUE_INVALID');
  throwsCode(() => assertValidValue([['a']], 'after'), 'GOVERNANCE_FIELD_VALUE_INVALID');
  throwsCode(() => assertValidValue([1], 'after'), 'GOVERNANCE_FIELD_VALUE_INVALID');
  throwsCode(() => assertValidValue({ k: null }, 'package'), 'GOVERNANCE_FIELD_VALUE_INVALID');
  throwsCode(() => assertValidValue(null, 'f'), 'GOVERNANCE_FIELD_VALUE_INVALID');
});
