/**
 * Tests for lib/test-strategies/gaming.mjs
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { detectSharedGamingPatterns, SHARED_PATTERNS } from '../../../lib/test-strategies/gaming.mjs';

// ---------------------------------------------------------------------------
// DISABLED_TESTS
// ---------------------------------------------------------------------------

describe('DISABLED_TESTS pattern', () => {
  const pattern = SHARED_PATTERNS.find((p) => p.id === 'DISABLED_TESTS');

  test('detects .skip(', () => {
    const content = `test('example', () => { assert.ok(true); });\ntest.skip('skipped', () => {});`;
    const violations = pattern.detect(content);
    assert.ok(violations.length > 0, 'expected a violation for .skip(');
    assert.ok(violations.some((v) => v.match.includes('.skip(')));
  });

  test('detects xit(', () => {
    const content = `xit('disabled', () => { assert.ok(true); });`;
    const violations = pattern.detect(content);
    assert.ok(violations.length > 0);
    assert.ok(violations.some((v) => v.match.includes('xit(')));
  });

  test('detects xdescribe(', () => {
    const content = `xdescribe('suite', () => { test('x', () => {}); });`;
    const violations = pattern.detect(content);
    assert.ok(violations.length > 0);
    assert.ok(violations.some((v) => v.match.includes('xdescribe(')));
  });

  test('detects .todo(', () => {
    const content = `test.todo('not yet implemented');`;
    const violations = pattern.detect(content);
    assert.ok(violations.length > 0);
    assert.ok(violations.some((v) => v.match.includes('.todo(')));
  });

  test('detects test.skip(', () => {
    const content = `test.skip('another skip', () => { assert.ok(true); });`;
    const violations = pattern.detect(content);
    assert.ok(violations.length > 0);
    assert.ok(violations.some((v) => v.match.includes('test.skip(')));
  });

  test('detects it.skip(', () => {
    const content = `it.skip('skip me', () => { assert.ok(true); });`;
    const violations = pattern.detect(content);
    assert.ok(violations.length > 0);
    assert.ok(violations.some((v) => v.match.includes('it.skip(')));
  });

  test('detects describe.skip(', () => {
    const content = `describe.skip('whole suite', () => { test('x', () => {}); });`;
    const violations = pattern.detect(content);
    assert.ok(violations.length > 0);
    assert.ok(violations.some((v) => v.match.includes('describe.skip(')));
  });

  test('no violation on clean file', () => {
    const content = `test('passes', () => { assert.strictEqual(1, 1); });`;
    const violations = pattern.detect(content);
    assert.strictEqual(violations.length, 0);
  });

  test('.skip in a comment is still detected (conservative)', () => {
    // The detection is intentionally conservative: it flags even commented-out skips.
    const content = `// test.skip('in comment', () => {});`;
    const violations = pattern.detect(content);
    assert.ok(violations.length > 0, 'conservative: should detect skip in comments');
  });
});

// ---------------------------------------------------------------------------
// EMPTY_ASSERTIONS
// ---------------------------------------------------------------------------

describe('EMPTY_ASSERTIONS pattern', () => {
  const pattern = SHARED_PATTERNS.find((p) => p.id === 'EMPTY_ASSERTIONS');

  test('test function with no assert/expect → violation', () => {
    const content = `test('empty', () => {\n  const x = 1;\n});`;
    const violations = pattern.detect(content);
    assert.ok(violations.length > 0, 'expected violation for empty assertion block');
  });

  test('test function with assert.strictEqual → no violation', () => {
    const content = `test('ok', () => {\n  assert.strictEqual(1, 1);\n});`;
    const violations = pattern.detect(content);
    assert.strictEqual(violations.length, 0);
  });

  test('test function with expect() → no violation', () => {
    const content = `test('ok', () => {\n  expect(value).toBe(true);\n});`;
    const violations = pattern.detect(content);
    assert.strictEqual(violations.length, 0);
  });

  test('it() with no assertion → violation', () => {
    const content = `it('does nothing', () => {\n  const y = 2;\n});`;
    const violations = pattern.detect(content);
    assert.ok(violations.length > 0);
  });
});

// ---------------------------------------------------------------------------
// SWALLOWED_ASSERTIONS
// ---------------------------------------------------------------------------

describe('SWALLOWED_ASSERTIONS pattern', () => {
  const pattern = SHARED_PATTERNS.find((p) => p.id === 'SWALLOWED_ASSERTIONS');

  test('try/catch with empty catch → violation', () => {
    const content = `test('swallow', () => {\n  try {\n    assert.ok(false);\n  } catch (e) {\n  }\n});`;
    const violations = pattern.detect(content);
    assert.ok(violations.length > 0, 'should flag empty catch after assert');
  });

  test('try/catch where catch rethrows → no violation', () => {
    const content = `test('rethrow', () => {\n  try {\n    assert.ok(true);\n  } catch (e) {\n    throw e;\n  }\n});`;
    const violations = pattern.detect(content);
    assert.strictEqual(violations.length, 0);
  });

  test('try/catch with expect in try and throw in catch → no violation', () => {
    const content = `test('ok', () => {\n  try {\n    expect(x).toBe(1);\n  } catch (err) {\n    throw new Error('wrapped: ' + err.message);\n  }\n});`;
    const violations = pattern.detect(content);
    assert.strictEqual(violations.length, 0);
  });
});

// ---------------------------------------------------------------------------
// CONDITIONAL_ASSERTIONS
// ---------------------------------------------------------------------------

describe('CONDITIONAL_ASSERTIONS pattern', () => {
  const pattern = SHARED_PATTERNS.find((p) => p.id === 'CONDITIONAL_ASSERTIONS');

  test('if block with expect but no else → violation', () => {
    const content = `test('cond', () => {\n  if (condition) {\n    expect(x).toBe(1);\n  }\n});`;
    const violations = pattern.detect(content);
    assert.ok(violations.length > 0, 'should flag if-with-assertion and no else');
  });

  test('if/else both with expect → no violation', () => {
    const content = `test('full', () => {\n  if (condition) {\n    expect(x).toBe(1);\n  } else {\n    expect(x).toBe(0);\n  }\n});`;
    const violations = pattern.detect(content);
    assert.strictEqual(violations.length, 0);
  });

  test('if block without expect → no violation (not relevant)', () => {
    const content = `test('irrelevant', () => {\n  if (condition) {\n    doSomething();\n  }\n  assert.ok(true);\n});`;
    const violations = pattern.detect(content);
    assert.strictEqual(violations.length, 0);
  });

  test('if block with assertion and else with throw → no violation', () => {
    const content = `test('throw-else', () => {\n  if (condition) {\n    assert.ok(x);\n  } else {\n    throw new Error('bad state');\n  }\n});`;
    const violations = pattern.detect(content);
    assert.strictEqual(violations.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Integration: detectSharedGamingPatterns
// ---------------------------------------------------------------------------

describe('detectSharedGamingPatterns integration', () => {
  test('clean code → clean: true, no violations', () => {
    const content = `
import assert from 'node:assert/strict';
import { test } from 'node:test';

test('adds numbers', () => {
  assert.strictEqual(1 + 1, 2);
});
    `.trim();

    const result = detectSharedGamingPatterns(content);
    assert.strictEqual(result.clean, true);
    assert.strictEqual(result.violations.length, 0);
  });

  test('code with multiple violations → all detected with SHARED prefix', () => {
    const content = `
test.skip('disabled', () => { assert.ok(true); });

test('empty', () => {
  const x = 1;
});

test('swallow', () => {
  try {
    assert.ok(false);
  } catch (e) {
  }
});

test('conditional', () => {
  if (condition) {
    expect(x).toBe(1);
  }
});
    `.trim();

    const result = detectSharedGamingPatterns(content);
    assert.strictEqual(result.clean, false);
    assert.ok(result.violations.length >= 3, `expected >=3 violations, got ${result.violations.length}`);

    for (const v of result.violations) {
      assert.strictEqual(v.prefix, 'SHARED', `violation ${v.patternId} missing SHARED prefix`);
      assert.ok(typeof v.line === 'number');
      assert.ok(typeof v.match === 'string');
      assert.ok(typeof v.message === 'string');
      assert.ok(typeof v.patternId === 'string');
    }

    const patternIds = new Set(result.violations.map((v) => v.patternId));
    assert.ok(patternIds.has('DISABLED_TESTS'), 'expected DISABLED_TESTS violation');
    assert.ok(patternIds.has('EMPTY_ASSERTIONS'), 'expected EMPTY_ASSERTIONS violation');
    assert.ok(patternIds.has('SWALLOWED_ASSERTIONS'), 'expected SWALLOWED_ASSERTIONS violation');
    assert.ok(patternIds.has('CONDITIONAL_ASSERTIONS'), 'expected CONDITIONAL_ASSERTIONS violation');
  });

  test('large file (>500KB) → skipped with empty violations', () => {
    // Generate content slightly over 500 KB
    const chunk = 'x'.repeat(1024); // 1 KB
    const largeContent = chunk.repeat(510); // ~510 KB
    const result = detectSharedGamingPatterns(largeContent);
    assert.strictEqual(result.violations.length, 0);
    assert.strictEqual(result.clean, true);
    assert.strictEqual(result.skipped, true);
    assert.ok(typeof result.skipReason === 'string');
  });
});
