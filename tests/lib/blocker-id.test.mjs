/**
 * Tests for lib/blocker-id.mjs — canonical blocker_id emitter.
 *
 * Covers Behavior 3 + AC "Reviewer subagents emit canonical `blocker_id`"
 * from review-block-auto-retry.spec.md, plus SEC-2 (kebab-case allowlist).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  buildBlockerId,
  validateBlockerIdComponent,
  truncateForHash,
  BLOCKER_FINDING_TEXT_TRUNCATE,
} from '../../lib/blocker-id.mjs';

test('buildBlockerId returns "<reviewer>:<type>:<8-hex-sha-prefix>"', () => {
  const id = buildBlockerId({
    reviewer: 'structural-architect',
    type: 'missing-precondition',
    sectionAnchor: 'behaviors-1',
    findingText: 'The Precondition for atomic write is undocumented.',
  });
  const [reviewer, type, locationHash] = id.split(':');
  assert.equal(reviewer, 'structural-architect');
  assert.equal(type, 'missing-precondition');
  assert.match(locationHash, /^[0-9a-f]{8}$/);
});

test('buildBlockerId is deterministic — same inputs produce same id', () => {
  const inputs = {
    reviewer: 'security-reviewer',
    type: 'path-traversal',
    sectionAnchor: 'error-cases',
    findingText: 'No assertWithin guard on the spec-path argument.',
  };
  const id1 = buildBlockerId(inputs);
  const id2 = buildBlockerId(inputs);
  assert.equal(id1, id2);
});

test('buildBlockerId location-hash is sha256(sectionAnchor + ":" + truncated-text) first 8 hex', () => {
  const sectionAnchor = 'behaviors-3';
  const findingText = 'Reviewer prompts do not document the canonical blocker_id schema.';
  const expected = createHash('sha256')
    .update(`${sectionAnchor}:${findingText}`)
    .digest('hex')
    .slice(0, 8);
  const id = buildBlockerId({
    reviewer: 'consistency-analyzer',
    type: 'undocumented-schema',
    sectionAnchor,
    findingText,
  });
  const locationHash = id.split(':')[2];
  assert.equal(locationHash, expected);
});

test('buildBlockerId truncates long finding text before hashing', () => {
  const longText = 'a'.repeat(BLOCKER_FINDING_TEXT_TRUNCATE + 500);
  const truncated = longText.slice(0, BLOCKER_FINDING_TEXT_TRUNCATE);
  const sectionAnchor = 'behaviors-9';
  const expected = createHash('sha256')
    .update(`${sectionAnchor}:${truncated}`)
    .digest('hex')
    .slice(0, 8);
  const id = buildBlockerId({
    reviewer: 'structural-architect',
    type: 'ambiguous-behavior',
    sectionAnchor,
    findingText: longText,
  });
  assert.equal(id.split(':')[2], expected);
});

test('buildBlockerId rejects reviewer slug with non-allowed chars — INVALID_BLOCKER_ID', () => {
  assert.throws(
    () => buildBlockerId({
      reviewer: 'Structural Architect',
      type: 'x',
      sectionAnchor: 'a',
      findingText: 'b',
    }),
    (e) => e.code === 'INVALID_BLOCKER_ID',
  );
});

test('buildBlockerId rejects type with non-allowed chars — INVALID_BLOCKER_ID', () => {
  assert.throws(
    () => buildBlockerId({
      reviewer: 'security-reviewer',
      type: 'missing precondition',
      sectionAnchor: 'a',
      findingText: 'b',
    }),
    (e) => e.code === 'INVALID_BLOCKER_ID',
  );
});

test('buildBlockerId rejects empty reviewer or type', () => {
  assert.throws(
    () => buildBlockerId({ reviewer: '', type: 'x', sectionAnchor: 'a', findingText: 'b' }),
    (e) => e.code === 'INVALID_BLOCKER_ID',
  );
  assert.throws(
    () => buildBlockerId({ reviewer: 'x', type: '', sectionAnchor: 'a', findingText: 'b' }),
    (e) => e.code === 'INVALID_BLOCKER_ID',
  );
});

test('buildBlockerId rejects missing sectionAnchor or findingText', () => {
  assert.throws(
    () => buildBlockerId({ reviewer: 'x', type: 'y', sectionAnchor: '', findingText: 'b' }),
    (e) => e.code === 'INVALID_BLOCKER_ID',
  );
  assert.throws(
    () => buildBlockerId({ reviewer: 'x', type: 'y', sectionAnchor: 'a', findingText: '' }),
    (e) => e.code === 'INVALID_BLOCKER_ID',
  );
});

test('validateBlockerIdComponent accepts kebab-case strings', () => {
  assert.equal(validateBlockerIdComponent('foo-bar'), 'foo-bar');
  assert.equal(validateBlockerIdComponent('abc123'), 'abc123');
  assert.equal(validateBlockerIdComponent('a-b-c-1'), 'a-b-c-1');
});

test('validateBlockerIdComponent rejects whitespace, uppercase, colon, slash', () => {
  for (const bad of ['Foo', 'foo bar', 'foo:bar', 'foo/bar', 'foo_bar', '']) {
    assert.throws(
      () => validateBlockerIdComponent(bad),
      (e) => e.code === 'INVALID_BLOCKER_ID',
      `expected reject for: "${bad}"`,
    );
  }
});

test('truncateForHash returns string ≤ limit', () => {
  assert.equal(truncateForHash('abc', 10), 'abc');
  assert.equal(truncateForHash('abcdefghij', 5), 'abcde');
  assert.equal(truncateForHash('', 5), '');
});

test('truncateForHash handles undefined/null input', () => {
  assert.equal(truncateForHash(null, 10), '');
  assert.equal(truncateForHash(undefined, 10), '');
});

test('buildBlockerId — reviewer-slug allowlist matches lifecycle-state SLUG_ALLOWLIST shape (kebab-case)', () => {
  // SEC-2 review note: same kebab-case ([a-z0-9-]+) allowlist as elsewhere.
  // Note: blocker_id components are stricter than spec slugs (no dot, no underscore).
  const id = buildBlockerId({
    reviewer: 'sec-reviewer',
    type: 'unauth-input',
    sectionAnchor: 'errors',
    findingText: 'no guard',
  });
  assert.ok(id.startsWith('sec-reviewer:unauth-input:'));
});
