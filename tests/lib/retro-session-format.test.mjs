// tests/lib/retro-session-format.test.mjs
//
// Tests for lib/retro/session-format.mjs::classifyFormat()

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { classifyFormat } from '../../lib/retro/session-format.mjs';

test('classifyFormat: hook-mode kind: session-end → "hook"', () => {
  const fm = { kind: 'session-end', session_id: 'abc', date: '2026-05-20' };
  const format = classifyFormat(fm);
  assert.equal(format, 'hook');
  // CON-X1: "hook" is the classifier label; stored kind is unchanged.
  assert.notEqual(format, fm.kind);
});

test('classifyFormat: hook-mode kind: pre-compact → "hook"', () => {
  const fm = { kind: 'pre-compact', session_id: 'abc', date: '2026-05-20' };
  assert.equal(classifyFormat(fm), 'hook');
});

test('classifyFormat: hook-mode kind: placeholder → "hook"', () => {
  const fm = { kind: 'placeholder', session_id: 'abc', date: '2026-05-20' };
  assert.equal(classifyFormat(fm), 'hook');
});

test('classifyFormat: post-commit type+agent → "post-commit"', () => {
  const fm = { date: '2026-05-20', type: 'commit', agent: 'git-hook', sha: 'abc' };
  assert.equal(classifyFormat(fm), 'post-commit');
});

test('classifyFormat: post-commit missing agent → "unknown"', () => {
  const fm = { date: '2026-05-20', type: 'commit' };
  assert.equal(classifyFormat(fm), 'unknown');
});

test('classifyFormat: post-commit wrong agent → "unknown"', () => {
  const fm = { date: '2026-05-20', type: 'commit', agent: 'pre-commit' };
  assert.equal(classifyFormat(fm), 'unknown');
});

test('classifyFormat: empty frontmatter → "unknown"', () => {
  assert.equal(classifyFormat({}), 'unknown');
});

test('classifyFormat: null/undefined → "unknown"', () => {
  assert.equal(classifyFormat(null), 'unknown');
  assert.equal(classifyFormat(undefined), 'unknown');
});

test('classifyFormat: random keys → "unknown"', () => {
  assert.equal(classifyFormat({ random: 'noise', foo: 1 }), 'unknown');
});

test('classifyFormat: hook-mode kind: unknown-kind → "unknown"', () => {
  // A kind value that is not in the documented set falls through.
  assert.equal(classifyFormat({ kind: 'bogus', session_id: 'x', date: 'y' }), 'unknown');
});

test('classifyFormat: non-object input → "unknown"', () => {
  assert.equal(classifyFormat('string'), 'unknown');
  assert.equal(classifyFormat(123), 'unknown');
  assert.equal(classifyFormat([]), 'unknown');
});
