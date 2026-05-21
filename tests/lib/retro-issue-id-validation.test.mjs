// tests/lib/retro-issue-id-validation.test.mjs
//
// Tests for lib/retro/issue-id-validation.mjs — SEC-B2 defense-in-depth
// issue-id validation before any board lookup.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { validateIssueId } from '../../lib/retro/issue-id-validation.mjs';

test('validateIssueId: legacy issue id accepted', () => {
  const result = validateIssueId('issue-528');
  assert.equal(result.ok, true);
  assert.equal(result.normalized, 'issue-528');
  assert.equal(result.reason, null);
});

test('validateIssueId: tiered dotted id accepted', () => {
  const result = validateIssueId('e1.f2.t3');
  assert.equal(result.ok, true);
  assert.equal(result.normalized, 'e1.f2.t3');
});

test('validateIssueId: epic id accepted', () => {
  assert.equal(validateIssueId('epic-12').ok, true);
});

test('validateIssueId: bd id accepted', () => {
  assert.equal(validateIssueId('bd-abc123').ok, true);
});

test('validateIssueId: path traversal rejected on charset', () => {
  const result = validateIssueId('../../../etc/passwd');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'charset');
  assert.equal(result.normalized, null);
});

test('validateIssueId: HTML/script chars rejected on charset', () => {
  for (const bad of ['<img onerror=>', 'foo<script>', 'a&b', 'a b', 'Foo!']) {
    const r = validateIssueId(bad);
    assert.equal(r.ok, false, `expected reject: ${bad}`);
    assert.equal(r.reason, 'charset');
  }
});

test('validateIssueId: overlong id rejected', () => {
  const r = validateIssueId('a'.repeat(65));
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'charset');
});

test('validateIssueId: empty string rejected', () => {
  const r = validateIssueId('');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'charset');
});

test('validateIssueId: non-ASCII rejected', () => {
  const r = validateIssueId('issue-héllo');
  assert.equal(r.ok, false);
});

test('validateIssueId: leading hyphen rejected (must start alnum)', () => {
  const r = validateIssueId('-foo');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'charset');
});

test('validateIssueId: charset OK but parseId returns null → unrecognized', () => {
  const result = validateIssueId('zzz-not-an-id');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'unrecognized');
});

test('validateIssueId: non-string input', () => {
  for (const bad of [null, undefined, 123, {}, []]) {
    const r = validateIssueId(bad);
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'type');
    assert.equal(r.normalized, null);
  }
});

test('validateIssueId: max-length boundary 64 accepted (with valid format)', () => {
  // 'issue-' + 58 digits = 64 chars. Legacy issue-N format matches via LEGACY_RE.
  const id = 'issue-' + '1'.repeat(58);
  const r = validateIssueId(id);
  assert.equal(id.length, 64);
  assert.equal(r.ok, true);
});
