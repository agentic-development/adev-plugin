// tests/lib/retro-body-scan.test.mjs
//
// Tests for lib/retro/body-scan.mjs — bounded, non-backtracking body scan
// helpers (SEC-B1 defense-in-depth for retro-session-consumption).

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  BODY_SIZE_LIMIT,
  isOversizeBody,
  scanLiteralTokens,
  scanWithinToolOutputFrame,
  containsLiteralToken,
} from '../../lib/retro/body-scan.mjs';

test("body-scan: BODY_SIZE_LIMIT is 5 MB (+2 more contract assertions)", () => {
  // body-scan: BODY_SIZE_LIMIT is 5 MB
  assert.equal(BODY_SIZE_LIMIT, 5 * 1024 * 1024);

  // body-scan: isOversizeBody handles non-string input
  assert.equal(isOversizeBody(null), false);
  assert.equal(isOversizeBody(undefined), false);
  assert.equal(isOversizeBody(123), false);

  // body-scan: containsLiteralToken returns boolean
  assert.equal(containsLiteralToken('foo bar baz', 'bar'), true);
  assert.equal(containsLiteralToken('foo bar baz', 'qux'), false);
  assert.equal(containsLiteralToken('', 'bar'), false);
});

test('body-scan: isOversizeBody flags > 5 MB', () => {
  const big = 'a'.repeat(BODY_SIZE_LIMIT + 1);
  assert.equal(isOversizeBody(big), true);
});

test('body-scan: isOversizeBody allows ≤ 5 MB', () => {
  const ok = 'a'.repeat(BODY_SIZE_LIMIT);
  assert.equal(isOversizeBody(ok), false);
  assert.equal(isOversizeBody(''), false);
  assert.equal(isOversizeBody('short'), false);
});


test('body-scan: literal scan is backtracking-free under adversarial input', () => {
  const adversarial = '/'.repeat(100_000);
  const start = Date.now();
  const hits = scanLiteralTokens(adversarial, ['.context-index/specs/']);
  const elapsed = Date.now() - start;
  assert.equal(hits.length, 0);
  assert.ok(elapsed < 50, `expected < 50ms, got ${elapsed}ms`);
});

test('body-scan: scanLiteralTokens returns each matching token with count', () => {
  const body = 'foo .context-index/specs/a.spec.md bar .context-index/specs/b.spec.md baz';
  const hits = scanLiteralTokens(body, [
    '.context-index/specs/a.spec.md',
    '.context-index/specs/b.spec.md',
    '.context-index/specs/missing.spec.md',
  ]);
  assert.deepEqual(hits.map((h) => h.token).sort(), [
    '.context-index/specs/a.spec.md',
    '.context-index/specs/b.spec.md',
  ]);
});

test('body-scan: scanLiteralTokens counts occurrences', () => {
  const body = 'foo foo foo bar';
  const hits = scanLiteralTokens(body, ['foo', 'bar']);
  const foo = hits.find((h) => h.token === 'foo');
  const bar = hits.find((h) => h.token === 'bar');
  assert.equal(foo.count, 3);
  assert.equal(bar.count, 1);
});


test('body-scan: frame-anchored scan rejects out-of-frame matches', () => {
  const body = [
    'prose mentioning no matches outside frame',
    '```output',
    'foo',
    '```',
  ].join('\n');
  const hits = scanWithinToolOutputFrame(body, 'no matches');
  assert.equal(hits.length, 0);
});

test('body-scan: frame-anchored scan counts in-frame matches', () => {
  const body = [
    'prose first',
    '```output',
    'no matches found here',
    'and no matches here too',
    '```',
    'more prose',
  ].join('\n');
  const hits = scanWithinToolOutputFrame(body, 'no matches');
  assert.equal(hits.length, 2);
});

test('body-scan: frame-anchored scan handles multiple frames', () => {
  const body = [
    '```output',
    'no matches',
    '```',
    'prose',
    '```output',
    'no matches',
    '```',
  ].join('\n');
  const hits = scanWithinToolOutputFrame(body, 'no matches');
  assert.equal(hits.length, 2);
});

test('body-scan: frame-anchored scan ignores unclosed frame (no false positives)', () => {
  const body = [
    '```output',
    'no matches',
    'no closing fence',
  ].join('\n');
  const hits = scanWithinToolOutputFrame(body, 'no matches');
  // Unclosed frame is not a valid tool-output frame — skip.
  assert.equal(hits.length, 0);
});

test('body-scan: oversize body returns no hits without scanning', () => {
  const big = 'a'.repeat(BODY_SIZE_LIMIT + 1);
  const hits = scanLiteralTokens(big, ['a']);
  assert.equal(hits.length, 0);
});
