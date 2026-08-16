import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertSafeScalar, assertSafeArgvToken, assertSafeFlowElement, isArgvPathElement, assertValidValue, assertStringId }
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

test('colon-space and trailing colon are refused — the block-sequence reparse path', () => {
  // Verified against lib/profiles/yaml.mjs: `after:\n  - foo: bar` parses to
  // { after: [ { foo: 'bar' } ] } — the string became a map. Quoting does not help.
  assert.throws(
    () => assertSafeScalar('run: rm -rf /', 'after'),
    e => e.code === 'GOVERNANCE_SCALAR_UNSAFE' && /after/.test(e.message),
  );
  for (const bad of ['foo: bar', 'foo:', 'a\tb: c', 'trailing colon:', 'x: y: z'])
    throwsCode(() => assertSafeScalar(bad, 'f'), 'GOVERNANCE_SCALAR_UNSAFE');
  // The list-element form is the actual attack surface.
  throwsCode(() => assertValidValue(['run: rm -rf /'], 'after'), 'GOVERNANCE_SCALAR_UNSAFE');
});

test('a colon with no following whitespace is still allowed', () => {
  // These round-trip as strings through the parser and the design depends on them.
  assert.doesNotThrow(() => assertSafeScalar('plugin:tier1/x.mjs', 'runner'));
  assert.doesNotThrow(() => assertSafeScalar('plugin:validate/checks/foo.md', 'prompt'));
  assert.doesNotThrow(() => assertSafeScalar('a:b', 'f'));
  assert.doesNotThrow(() => assertValidValue({ runner: 'plugin:tier1/x.mjs' }, 'package'));
});

test('scalars that change type on reparse are refused', () => {
  // yaml.mjs:173-183 coerces each of these on the way back in.
  assert.throws(
    () => assertSafeScalar('42', 'f'),
    e => e.code === 'GOVERNANCE_SCALAR_UNSAFE',
  );
  for (const bad of ['', '0', '-7', 'true', 'false', 'null', '~'])
    throwsCode(() => assertSafeScalar(bad, 'f'), 'GOVERNANCE_SCALAR_UNSAFE');
  throwsCode(() => assertValidValue(['42'], 'after'), 'GOVERNANCE_SCALAR_UNSAFE');
  throwsCode(() => assertValidValue({ k: 'true' }, 'package'), 'GOVERNANCE_SCALAR_UNSAFE');
  // Lookalikes that are NOT coerced stay allowed.
  assert.doesNotThrow(() => assertSafeScalar('42x', 'f'));
  assert.doesNotThrow(() => assertSafeScalar('4.2', 'f'));
  assert.doesNotThrow(() => assertSafeScalar('True', 'f'));
});

test('real numbers and booleans are still accepted as typed values', () => {
  // Only the STRING forms flip type. A real 42 / true reparses correctly.
  assert.doesNotThrow(() => assertValidValue(42, 'f'));
  assert.doesNotThrow(() => assertValidValue(0, 'f'));
  assert.doesNotThrow(() => assertValidValue(true, 'f'));
  assert.doesNotThrow(() => assertValidValue(false, 'f'));
  assert.doesNotThrow(() => assertValidValue({ n: 42, b: true }, 'package'));
});

test('a non-string input is a type error, not a content refusal', () => {
  // Tasks 4 and 7 depend on this distinction — pin it.
  assert.throws(() => assertSafeScalar(42, 'f'), e => e.code === 'GOVERNANCE_FIELD_VALUE_INVALID');
  for (const bad of [null, undefined, true, {}, []])
    throwsCode(() => assertSafeScalar(bad, 'f'), 'GOVERNANCE_FIELD_VALUE_INVALID');
  for (const bad of [42, null, undefined, true, {}, []])
    throwsCode(() => assertSafeArgvToken(bad), 'GOVERNANCE_FIELD_VALUE_INVALID');
});

test('one level means scalar leaves only', () => {
  assert.throws(() => assertValidValue({ k: ['a'] }, 'package'), e => e.code === 'GOVERNANCE_FIELD_VALUE_INVALID');
  throwsCode(() => assertValidValue([['a']], 'after'), 'GOVERNANCE_FIELD_VALUE_INVALID');
  throwsCode(() => assertValidValue([1], 'after'), 'GOVERNANCE_FIELD_VALUE_INVALID');
  throwsCode(() => assertValidValue({ k: null }, 'package'), 'GOVERNANCE_FIELD_VALUE_INVALID');
  throwsCode(() => assertValidValue(null, 'f'), 'GOVERNANCE_FIELD_VALUE_INVALID');
});

// ── assertSafeFlowElement — the flow-sequence admission rule ──────────────
//
// Moved here from `governance-splice.mjs` (Review Stage 1, Minor: the validator
// belongs in the sanctioned module beside the threat model it encodes). The
// admitted set below is the one an exhaustive U+0000–U+20FF sweep proved: the
// scalar rule, plus argv tokens that begin with `-` or that would type-flip.

test('assertSafeFlowElement admits the argv tokens the scalar rule alone refuses', () => {
  // Leading `-` — the whole reason a gate `command` could not be written back.
  for (const ok of ['--', '--silent', '-q', '-rf', '-', '--config=a/b'])
    assert.doesNotThrow(() => assertSafeFlowElement(ok, 'command[0]'));
  // Type-flip strings: legal argv, refused by the scalar rule.
  for (const ok of ['42', '-42', 'true', 'false', 'null'])
    assert.doesNotThrow(() => assertSafeFlowElement(ok, 'command[0]'));
  // And the tokens the argv rule alone refuses, which the scalar rule admits.
  for (const ok of ['test:integration', 'plugin:tier1/x.mjs', 'npm', 'a b'])
    assert.doesNotThrow(() => assertSafeFlowElement(ok, 'command[0]'));
});

test('assertSafeFlowElement still refuses everything that changes flow structure', () => {
  for (const bad of ['"', 'a"b', 'a,b', '[', ']', '#', 'a#b', '\n', '\r', 'a\nb', "a'b", '{', '}'])
    throwsCode(() => assertSafeFlowElement(bad, 'command[0]'), 'GOVERNANCE_SCALAR_UNSAFE');
  // The empty string type-flips to {} on reparse and is not a legal argv token.
  throwsCode(() => assertSafeFlowElement('', 'command[0]'), 'GOVERNANCE_SCALAR_UNSAFE');
  // Both caps still apply — the argv branch calls assertWithinCaps itself.
  assert.doesNotThrow(() => assertSafeFlowElement('a'.repeat(CAPS.scalarChars), 'c[0]'));
  throwsCode(
    () => assertSafeFlowElement('a'.repeat(CAPS.scalarChars + 1), 'c[0]'),
    'GOVERNANCE_LIMIT_EXCEEDED',
  );
  // A non-string is a type error, not a content refusal.
  for (const bad of [42, null, undefined, true, {}, []])
    throwsCode(() => assertSafeFlowElement(bad, 'c[0]'), 'GOVERNANCE_FIELD_VALUE_INVALID');
});

test('assertSafeFlowElement reports the SCALAR rule verdict, naming the field', () => {
  assert.throws(
    () => assertSafeFlowElement('a#b', 'command[2]'),
    e => e.code === 'GOVERNANCE_SCALAR_UNSAFE' && /command\[2\]/.test(e.message),
  );
});
