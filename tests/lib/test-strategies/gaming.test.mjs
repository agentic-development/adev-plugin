/**
 * Tests for lib/test-strategies/gaming.mjs
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { detectSharedGamingPatterns, SHARED_PATTERNS, maskLiterals } from '../../../lib/test-strategies/gaming.mjs';

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

// ---------------------------------------------------------------------------
// issue-twtond — false positives from comment prose + string-literal braces
//
// These detectors gate a hard-blocking PreToolUse hook, so a false positive
// does not warn, it stops the edit. The cheapest escape available to an agent
// is then to reword the assertion until the gate goes quiet — which is
// indistinguishable from the gaming this module exists to prevent. Precision
// therefore outranks recall here, and these are the regression fixtures for it.
// ---------------------------------------------------------------------------

describe('literal masking — comment prose and string-literal braces', () => {
  /**
   * Reproduces the shape bisected out of
   * tests/cli/install-session-capture.test.mjs: a comment whose prose contains
   * "exclude it (", followed by an assertion whose message argument is a
   * string literal. Nothing here is a test-block opener and nothing here is
   * an unbalanced brace in *code*.
   */
  function buildFixture(assertionArg, extra) {
    return [
      "import assert from 'node:assert/strict';",
      "import { test } from 'node:test';",
      '',
      'test("issue-582 regression", () => {',
      '  const dir = createTempGitRepo({ branch: "feat/test" });',
      '  try {',
      '    // the hook resolves ./lib/session-summary.mjs relative to cwd, so',
      "    // symlink the plugin's lib/ in and exclude it (+ the post-commit-mode",
      '    // manifest) from `git add -A`.',
      '    assert.match(jsBody, /process\\.env/, ' + assertionArg + ');',
      '  } finally {',
      '    cleanup(dir);',
      '  }',
      ...(extra ? [extra] : []),
      '});',
    ].join('\n');
  }

  const UNBALANCED = '"(async()=>{ const fs = await import(\'node:fs\')"';
  const NO_BRACE = '"const fs = await import(\'node:fs\')"';
  const BALANCED = '"(async()=>{ const fs = await import(\'node:fs\') }"';

  // The two variants that scored 1 violation before the fix. Both were pure
  // false positives: the phantom opener is the word "it (" inside prose, and
  // the phantom block boundary comes from a `{` inside a string literal.
  test('unbalanced brace inside a string literal → no violation', () => {
    const result = detectSharedGamingPatterns(buildFixture(UNBALANCED));
    assert.deepStrictEqual(
      result.violations,
      [],
      'comment prose "exclude it (" must not be read as an it() opener',
    );
  });

  test('unbalanced brace in a string literal, with a later assertion → no violation', () => {
    const source = buildFixture(
      UNBALANCED,
      '  assert.ok(jsBody.length > 0, "body is non-empty");',
    );
    assert.deepStrictEqual(detectSharedGamingPatterns(source).violations, []);
  });

  // The two control variants, which scored 0 before the fix and must still
  // score 0 after it. They are the ones that catch an over-eager stripper:
  // if masking swallowed real code, these would start reporting.
  test('string literal with no brace → still no violation', () => {
    assert.deepStrictEqual(detectSharedGamingPatterns(buildFixture(NO_BRACE)).violations, []);
  });

  test('string literal with balanced braces → still no violation', () => {
    assert.deepStrictEqual(detectSharedGamingPatterns(buildFixture(BALANCED)).violations, []);
  });

  test('"it (" appearing only in prose is never a test opener', () => {
    const source = [
      '// We exclude it (+ the manifest) from the archive.',
      '/* Another mention: describe (the shape) before asserting. */',
      "const doc = 'run it (twice) if it fails';",
      'test("real", () => {',
      '  assert.ok(true);',
      '});',
    ].join('\n');
    assert.deepStrictEqual(detectSharedGamingPatterns(source).violations, []);
  });

  test('braces inside string literals do not shift block boundaries', () => {
    // Every `{` below lives in a string, so the test body must still be seen
    // to extend all the way to its real closing brace, where the assert lives.
    const source = [
      'test("shifted", () => {',
      '  const a = "{";',
      '  const b = "{{{";',
      '  const c = `${a}{`;',
      '  assert.equal(a + b, "{{{{");',
      '});',
    ].join('\n');
    assert.deepStrictEqual(detectSharedGamingPatterns(source).violations, []);
  });
});

// ---------------------------------------------------------------------------
// Block bodies must belong to the construct that triggered the scan
// ---------------------------------------------------------------------------

describe('block boundaries stay inside their own construct', () => {
  test('braceless if does not adopt a later block as its body', () => {
    // `if (!x) return;` has no block of its own. Resolving its "body" with a
    // bare indexOf('{') walked past the end of the statement and reported the
    // *next* block's missing else branch.
    const source = [
      'function collect(items) {',
      '  const out = [];',
      '  for (const x of items) {',
      '    if (!x) continue;',
      '    out.push(x);',
      '  }',
      '  return out;',
      '}',
      '',
      'test("uses helper", () => {',
      '  if (ready) {',
      '    assert.ok(collect([1]).length === 1);',
      '  } else {',
      '    assert.ok(true);',
      '  }',
      '});',
    ].join('\n');
    assert.deepStrictEqual(detectSharedGamingPatterns(source).violations, []);
  });

  test('a test opener with no callback block does not adopt a later block', () => {
    // `it('pending')` declares a pending test with no body. It must not reach
    // forward and claim the following function's block.
    const source = [
      "it('pending');",
      '',
      'function helper() {',
      '  const cache = {};',
      '  return cache;',
      '}',
    ].join('\n');
    const ids = detectSharedGamingPatterns(source).violations.map((v) => v.patternId);
    assert.ok(!ids.includes('EMPTY_ASSERTIONS'), `unexpected violations: ${JSON.stringify(ids)}`);
  });

  test('expression-bodied test callback does not adopt a later block', () => {
    const source = [
      "test('concise', () => assert.ok(1));",
      '',
      'function helper() {',
      '  const cache = {};',
      '  return cache;',
      '}',
    ].join('\n');
    assert.deepStrictEqual(detectSharedGamingPatterns(source).violations, []);
  });
});

// ---------------------------------------------------------------------------
// The detector must still catch real gaming after masking
//
// A detector that stops false-positiving by stopping detecting is a
// regression. Each case below embeds comments and string literals — exactly
// the material that is masked — around genuinely gamed test code.
// (The multi-pattern integration case above, "code with multiple violations",
// additionally covers all four SHARED patterns at once.)
// ---------------------------------------------------------------------------

describe('real gaming is still caught after literal masking', () => {
  test('genuinely empty test block → EMPTY_ASSERTIONS', () => {
    const source = [
      '// This test does nothing; the assert below is only mentioned in prose.',
      "const label = 'assert.ok(true)';",
      "it('claims to verify the thing', () => {",
      '  const result = compute(label);',
      '});',
    ].join('\n');
    const ids = detectSharedGamingPatterns(source).violations.map((v) => v.patternId);
    assert.ok(
      ids.includes('EMPTY_ASSERTIONS'),
      `expected EMPTY_ASSERTIONS, got ${JSON.stringify(ids)}`,
    );
  });

  test('assertion in try with empty catch → SWALLOWED_ASSERTIONS', () => {
    const source = [
      "test('swallowed', () => {",
      '  // we deliberately ignore failures here',
      '  try {',
      '    assert.ok(compute() === 1);',
      "  } catch (e) {",
      "    log('failure suppressed');",
      '  }',
      '});',
    ].join('\n');
    const ids = detectSharedGamingPatterns(source).violations.map((v) => v.patternId);
    assert.ok(
      ids.includes('SWALLOWED_ASSERTIONS'),
      `expected SWALLOWED_ASSERTIONS, got ${JSON.stringify(ids)}`,
    );
  });

  test('a suppressing keyword quoted in a string is honoured — the deliberate trade', () => {
    // Checks that *suppress* a violation read the raw body, never the mask, so
    // that masking can never manufacture a violation the raw source would not
    // have produced. The cost is this false negative: a `throw` mentioned only
    // inside a string still counts as a rethrow. That is the intended
    // direction for a gate that hard-blocks edits — do not "fix" it by
    // switching this check to the mask.
    const source = [
      "test('quoted-throw', () => {",
      '  try {',
      '    assert.ok(compute() === 1);',
      '  } catch (e) {',
      "    log('throw was suppressed');",
      '  }',
      '});',
    ].join('\n');
    const ids = detectSharedGamingPatterns(source).violations.map((v) => v.patternId);
    assert.ok(
      !ids.includes('SWALLOWED_ASSERTIONS'),
      `expected the quoted throw to suppress, got ${JSON.stringify(ids)}`,
    );
  });

  test('assertion in if with no else → CONDITIONAL_ASSERTIONS', () => {
    const source = [
      "test('vacuous', () => {",
      "  const note = 'else { assert.ok(false); }';",
      '  if (maybe(note)) {',
      '    assert.equal(compute(), 1);',
      '  }',
      '});',
    ].join('\n');
    const ids = detectSharedGamingPatterns(source).violations.map((v) => v.patternId);
    assert.ok(
      ids.includes('CONDITIONAL_ASSERTIONS'),
      `expected CONDITIONAL_ASSERTIONS, got ${JSON.stringify(ids)}`,
    );
  });

  test('an assertion quoted in a string does not suppress EMPTY_ASSERTIONS', () => {
    // Suppression checks read the raw body on purpose, so a fixture string
    // that embeds test source is tolerated. But the *enclosing* block here
    // has no real assertion and no such fixture, so it must still be flagged.
    const source = [
      "it('gamed', () => {",
      '  const src = "nothing to see";',
      '  run(src);',
      '});',
    ].join('\n');
    const ids = detectSharedGamingPatterns(source).violations.map((v) => v.patternId);
    assert.ok(ids.includes('EMPTY_ASSERTIONS'), `expected EMPTY_ASSERTIONS, got ${JSON.stringify(ids)}`);
  });
});

// ---------------------------------------------------------------------------
// maskLiterals — the constructs that break a naive stripper
// ---------------------------------------------------------------------------

describe('maskLiterals', () => {
  test('preserves length and every newline position', () => {
    const src = [
      "const a = 'x';",
      '/* block',
      '   comment */',
      'const b = `tpl',
      'across lines`;',
      'test("t", () => { assert.ok(1); });',
    ].join('\n');
    const mask = maskLiterals(src);
    assert.notStrictEqual(mask, null);
    assert.strictEqual(mask.length, src.length, 'mask must be the same length as the source');
    for (let i = 0; i < src.length; i++) {
      assert.strictEqual(
        src[i] === '\n',
        mask[i] === '\n',
        `newline position ${i} must be preserved so line numbers stay correct`,
      );
    }
  });

  test('escaped quotes do not end a string early', () => {
    const src = 'const s = "a\\"b{";\nconst t = 1;';
    const mask = maskLiterals(src);
    assert.notStrictEqual(mask, null);
    assert.ok(!mask.includes('{'), 'the brace inside the string must be masked');
    assert.ok(mask.includes('const t = 1;'), 'code after the string must survive');
  });

  test('template literal with nested backtick inside interpolation', () => {
    const src = 'const a = `x${ inner(`y{`) }z`;\nconst t = 1;';
    const mask = maskLiterals(src);
    assert.notStrictEqual(mask, null);
    assert.ok(!mask.includes('{'), 'no brace may survive from template text or `${`');
    assert.ok(!mask.includes('}'), 'no brace may survive from template text or the `${` close');
    assert.ok(mask.includes('inner('), 'interpolated code is real code and must survive');
  });

  test('interpolated code keeps its own braces balanced', () => {
    const src = 'const a = `v=${ JSON.stringify({ k: 1 }) }`;\nconst t = 1;';
    const mask = maskLiterals(src);
    assert.notStrictEqual(mask, null);
    const opens = (mask.match(/\{/g) ?? []).length;
    const closes = (mask.match(/\}/g) ?? []).length;
    assert.strictEqual(opens, closes, 'braces inside `${}` code must stay balanced');
  });

  test('a quote inside a regex literal does not open a string', () => {
    const src = "const r = /don't/;\ntest('t', () => { assert.ok(r); });";
    const mask = maskLiterals(src);
    assert.notStrictEqual(mask, null, 'the apostrophe in /don\'t/ must not start a string');
    assert.deepStrictEqual(detectSharedGamingPatterns(src).violations, []);
  });

  test('an unbalanced brace inside a regex literal does not shift boundaries', () => {
    const src = [
      'const OPEN = /^\\{/;',
      'test("t", () => {',
      '  assert.match(line, OPEN);',
      '});',
    ].join('\n');
    const mask = maskLiterals(src);
    assert.notStrictEqual(mask, null);
    assert.deepStrictEqual(detectSharedGamingPatterns(src).violations, []);
  });

  test('division is not mistaken for a regex literal', () => {
    const src = [
      'test("ratio", () => {',
      '  const ratio = (a + b) / c / d;',
      '  assert.ok(ratio > 0);',
      '});',
    ].join('\n');
    const mask = maskLiterals(src);
    assert.notStrictEqual(mask, null);
    assert.ok(mask.includes('assert.ok(ratio > 0)'), 'division must not mask the following code');
    assert.deepStrictEqual(detectSharedGamingPatterns(src).violations, []);
  });

  test('unterminated constructs return null so detectors fail open', () => {
    assert.strictEqual(maskLiterals('const s = "oops;\nconst t = 1;'), null, 'unterminated string');
    assert.strictEqual(maskLiterals('/* never closed\nconst t = 1;'), null, 'unterminated block comment');
    assert.strictEqual(maskLiterals('const t = `open;\n'), null, 'unterminated template literal');
  });

  test('an untrustworthy mask yields no violations rather than a guess', () => {
    // Unterminated block comment → mask is null → block-based detectors must
    // report nothing. A false negative is the deliberate trade: this gate
    // hard-blocks edits, so it must never guess a violation into existence.
    const source = [
      '/* this comment is never closed',
      "it('empty', () => {",
      '  const x = 1;',
      '});',
    ].join('\n');
    const ids = detectSharedGamingPatterns(source).violations.map((v) => v.patternId);
    assert.ok(
      !ids.includes('EMPTY_ASSERTIONS'),
      `expected fail-open, got ${JSON.stringify(ids)}`,
    );
  });
});
