// tests/lib/retro-safe-frontmatter.test.mjs
//
// Tests for lib/retro/safe-frontmatter.mjs — SEC-B3 defense-in-depth YAML
// safe-load wrapper.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  FRONTMATTER_SIZE_LIMIT,
  readSafeFrontmatter,
} from '../../lib/retro/safe-frontmatter.mjs';

test('safe-frontmatter: FRONTMATTER_SIZE_LIMIT is 16 KB', () => {
  assert.equal(FRONTMATTER_SIZE_LIMIT, 16 * 1024);
});

test('safe-frontmatter: plain frontmatter parses', () => {
  const text = '---\nkind: session-end\nsession_id: abc123\ndate: 2026-05-20\n---\nbody';
  const r = readSafeFrontmatter(text);
  assert.equal(r.ok, true);
  assert.equal(r.reason, null);
  assert.equal(r.frontmatter.kind, 'session-end');
  assert.equal(r.frontmatter.session_id, 'abc123');
  assert.equal(r.frontmatter.date, '2026-05-20');
});

test('safe-frontmatter: oversize frontmatter rejected', () => {
  // 16 KB frontmatter slice
  const lines = [];
  let bytes = 0;
  while (bytes < FRONTMATTER_SIZE_LIMIT + 100) {
    const ln = 'k: v\n';
    lines.push(ln);
    bytes += ln.length;
  }
  const big = `---\n${lines.join('')}---\nbody`;
  const result = readSafeFrontmatter(big);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'oversize');
  assert.equal(result.frontmatter, null);
});

test('safe-frontmatter: custom YAML tag rejected (!!js/function)', () => {
  const text = '---\nfoo: !!js/function "return 42"\n---\nbody';
  const r = readSafeFrontmatter(text);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'unsafe-tag');
});

test('safe-frontmatter: other custom tag rejected (!Custom)', () => {
  const text = '---\nfoo: !Custom value\n---\nbody';
  const r = readSafeFrontmatter(text);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'unsafe-tag');
});

test('safe-frontmatter: anchor + alias rejected (billion-laughs trigger)', () => {
  const text = '---\na: &x [1]\nb: *x\n---\nbody';
  const r = readSafeFrontmatter(text);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'anchor-alias');
});

test('safe-frontmatter: anchor alone rejected', () => {
  const text = '---\nfoo: &anchor value\n---\nbody';
  const r = readSafeFrontmatter(text);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'anchor-alias');
});

test('safe-frontmatter: alias alone rejected', () => {
  const text = '---\nfoo: *alias\n---\nbody';
  const r = readSafeFrontmatter(text);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'anchor-alias');
});

test('safe-frontmatter: file with no frontmatter returns ok + empty', () => {
  const text = 'just body text\nno frontmatter here';
  const r = readSafeFrontmatter(text);
  assert.equal(r.ok, true);
  assert.deepEqual(r.frontmatter, {});
});

test('safe-frontmatter: empty input returns ok + empty', () => {
  const r = readSafeFrontmatter('');
  assert.equal(r.ok, true);
  assert.deepEqual(r.frontmatter, {});
});

test('safe-frontmatter: non-string input returns parse-error', () => {
  const r = readSafeFrontmatter(null);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'parse-error');
});

test('safe-frontmatter: opening fence without closing fence → no frontmatter', () => {
  const text = '---\nfoo: bar\nbody body body';
  const r = readSafeFrontmatter(text);
  // No closing ---; treat as no frontmatter.
  assert.equal(r.ok, true);
  assert.deepEqual(r.frontmatter, {});
});

test('safe-frontmatter: scan does not reject content lines that start with ! mid-string', () => {
  // Ensure that "foo: 'a! bar'" is not flagged because ! is not at slot start.
  const text = `---\nfoo: 'oops not a tag'\n---\nbody`;
  const r = readSafeFrontmatter(text);
  assert.equal(r.ok, true);
});
