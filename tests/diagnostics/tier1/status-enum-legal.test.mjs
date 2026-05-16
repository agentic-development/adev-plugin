/**
 * Producer-level tests for lib/diagnostics/tier1/status-enum-legal.mjs.
 *
 * Covers Behavior 8 of diagnostic-registry.spec.md rev 2.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { run } from '../../../lib/diagnostics/tier1/status-enum-legal.mjs';
import { SPEC_STATUSES } from '../../../lib/spec-status.mjs';

function makeSpec(content) {
  const dir = mkdtempSync(join(tmpdir(), 'adev-status-enum-test-'));
  const path = join(dir, 'fixture.spec.md');
  writeFileSync(path, content);
  return { dir, path };
}

function cleanup(dir) {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

test('accepts every legal status value', () => {
  for (const legal of SPEC_STATUSES) {
    const { dir, path } = makeSpec(`---\nstatus: ${legal}\n---\n# x\n`);
    try {
      const result = run({ spec: path });
      assert.equal(result.fired, false, `legal status "${legal}" should not fire`);
    } finally { cleanup(dir); }
  }
});

test('fires error on out-of-enum status', () => {
  const { dir, path } = makeSpec(`---\nstatus: bogus-status\n---\n# x\n`);
  try {
    const result = run({ spec: path });
    assert.equal(result.fired, true);
    assert.equal(result.severity, 'error');
    assert.equal(result.id, 'adev/status-enum-legal');
    assert.match(result.message, /bogus-status/);
  } finally { cleanup(dir); }
});

test('fires on quoted illegal status', () => {
  const { dir, path } = makeSpec(`---\nstatus: "not-real"\n---\n# x\n`);
  try {
    const result = run({ spec: path });
    assert.equal(result.fired, true);
  } finally { cleanup(dir); }
});

test('accepts double-quoted legal status', () => {
  const { dir, path } = makeSpec(`---\nstatus: "review-passed"\n---\n# x\n`);
  try {
    const result = run({ spec: path });
    assert.equal(result.fired, false);
  } finally { cleanup(dir); }
});

test('returns { fired: false } when status field is absent', () => {
  // frontmatter-present's domain (Behavior 8 + 9 split per spec).
  const { dir, path } = makeSpec(`---\ncharter: foo\n---\n# x\n`);
  try {
    const result = run({ spec: path });
    assert.equal(result.fired, false);
  } finally { cleanup(dir); }
});

test('returns { fired: false } when frontmatter is absent (defers to frontmatter-present)', () => {
  const { dir, path } = makeSpec(`# spec without frontmatter\n`);
  try {
    const result = run({ spec: path });
    assert.equal(result.fired, false);
  } finally { cleanup(dir); }
});

test('returns { fired: false } when ctx.spec is absent', () => {
  assert.deepEqual(run({}), { fired: false });
});

test('returns { fired: false } when spec file does not exist', () => {
  assert.deepEqual(run({ spec: '/nope/not/here.spec.md' }), { fired: false });
});

test('handles inline-comment-after-status correctly', () => {
  const { dir, path } = makeSpec(`---\nstatus: draft  # placeholder until review\n---\n# x\n`);
  try {
    const result = run({ spec: path });
    assert.equal(result.fired, false, 'must strip inline YAML comments before comparison');
  } finally { cleanup(dir); }
});
