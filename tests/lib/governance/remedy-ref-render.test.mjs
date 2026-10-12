import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderRemedyRef } from '../../../lib/governance/remedy-ref-render.mjs';

test('renderRemedyRef strips ANSI escape sequences and control characters', () => {
  const raw = '\x1b[31mmalicious\x1b[0m\x07';
  assert.strictEqual(renderRemedyRef(raw), 'malicious');
});

test('renderRemedyRef enforces a length bound with a truncation marker', () => {
  const long = 'a'.repeat(1000);
  const rendered = renderRemedyRef(long);
  assert.ok(rendered.length < 1000, `expected truncation, got length ${rendered.length}`);
  assert.ok(
    rendered.endsWith('...'),
    `expected a truncation marker, got ${JSON.stringify(rendered.slice(-10))}`,
  );
});

test('renderRemedyRef passes safe input through unchanged', () => {
  const safe = 'https://github.com/org/repo/issues/123';
  assert.strictEqual(renderRemedyRef(safe), safe);
});

test('renderRemedyRef returns empty string for empty input', () => {
  assert.strictEqual(renderRemedyRef(''), '');
});

test('renderRemedyRef returns empty string for null/undefined input', () => {
  assert.strictEqual(renderRemedyRef(null), '');
  assert.strictEqual(renderRemedyRef(undefined), '');
});

test('renderRemedyRef returns empty string for non-string input', () => {
  assert.strictEqual(renderRemedyRef(42), '');
  assert.strictEqual(renderRemedyRef({}), '');
});

test('renderRemedyRef strips C0/C1 control characters and Unicode line separators', () => {
  const raw = ['before', '\x00', '\x1f', '\x7f', '\x9f', ' ', ' ', 'after'].join('');
  assert.strictEqual(renderRemedyRef(raw), 'beforeafter');
});
