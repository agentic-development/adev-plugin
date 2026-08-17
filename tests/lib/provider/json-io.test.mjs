/**
 * Tests for lib/provider/json-io.mjs — shared readJson for provider adapters.
 *
 * Extracted during the 2026-08-16 codehealth duplicate-logic consolidation
 * pass: `readJson` replaced identical local copies in
 * `providers/claude-code/adapter.mjs`, `providers/cursor/adapter.mjs`, and
 * `providers/opencode/adapter.mjs`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { readJson } from '../../../lib/provider/json-io.mjs';

test('readJson parses a valid JSON file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'json-io-test-'));
  try {
    const file = join(dir, 'data.json');
    writeFileSync(file, JSON.stringify({ a: 1 }));
    assert.deepEqual(readJson(file), { a: 1 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('readJson returns null for a missing file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'json-io-test-'));
  try {
    assert.equal(readJson(join(dir, 'missing.json')), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('readJson returns null for malformed JSON', () => {
  const dir = mkdtempSync(join(tmpdir(), 'json-io-test-'));
  try {
    const file = join(dir, 'bad.json');
    writeFileSync(file, '{not valid json');
    assert.equal(readJson(file), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
