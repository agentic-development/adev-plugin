// tests/lifecycle/spec-amended-event.test.mjs
//
// Task 2 of spec-amendment-artifacts.plan.md [BOUNDARY: human-approved].
//
// Covers the `spec_amended` canonical event:
//   - discriminator membership in CANONICAL_EVENTS / KNOWN_EVENT_TYPES
//   - SA-1 pinned required-field schema in REQUIRED_FIELDS_BY_EVENT
//   - reportSpecAmended() emitter: appends a well-formed event to the BASE
//     spec's log and throws EVENT_SCHEMA_INVALID on a missing/mistyped field.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync, existsSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';

import { createTempDir, cleanupTempDir } from '../helpers.mjs';

// appendEvent requires a valid project root (.context-index/manifest.yaml).
function seedProjectRoot(root) {
  mkdirSync(join(root, '.context-index'), { recursive: true });
  writeFileSync(join(root, '.context-index', 'manifest.yaml'), 'lifecycle:\n  gate_mode: advisory\n', 'utf8');
  return root;
}
import { CANONICAL_EVENTS } from '../../lib/lifecycle-events.mjs';
import {
  KNOWN_EVENT_TYPES,
  isKnownEventType,
  getRequiredFields,
} from '../../lib/diagnostics/event-schemas.mjs';
import { reportSpecAmended } from '../../lib/lifecycle-state.mjs';

const BASE_SPEC = '.context-index/specs/cross-cutting/base.spec.md';

test('CANONICAL_EVENTS includes spec_amended', () => {
  assert.ok(CANONICAL_EVENTS.has('spec_amended'),
    'spec_amended must be registered as a canonical event discriminator');
});

test('isKnownEventType("spec_amended") returns true', () => {
  assert.equal(isKnownEventType('spec_amended'), true);
  assert.ok(KNOWN_EVENT_TYPES.includes('spec_amended'));
});

test('getRequiredFields("spec_amended") lists the SA-1 pinned fields', () => {
  const fields = getRequiredFields('spec_amended');
  assert.ok(Array.isArray(fields));
  for (const f of ['event', 'ts', 'amendment_slug', 'amendment_path', 'target_revision']) {
    assert.ok(fields.includes(f), `spec_amended schema must require ${f}`);
  }
});

function readBaseLog(root) {
  const logDir = join(root, '.context-index', 'lifecycle-state');
  if (!existsSync(logDir)) return [];
  const out = [];
  for (const f of readdirSync(logDir)) {
    if (!f.endsWith('.jsonl')) continue;
    for (const line of readFileSync(join(logDir, f), 'utf8').split('\n')) {
      if (line.trim()) out.push(JSON.parse(line));
    }
  }
  return out;
}

test('reportSpecAmended appends a well-formed spec_amended event to the base log', () => {
  const root = seedProjectRoot(createTempDir());
  try {
    reportSpecAmended(root, BASE_SPEC, {
      amendment_slug: 'base-rev-2-fix',
      amendment_path: '.context-index/specs/cross-cutting/base-rev-2-fix.spec.md',
      target_revision: 2,
    });
    const events = readBaseLog(root).filter(e => e.event === 'spec_amended');
    assert.equal(events.length, 1, 'exactly one spec_amended event on the base log');
    const ev = events[0];
    assert.equal(ev.amendment_slug, 'base-rev-2-fix');
    assert.equal(ev.amendment_path, '.context-index/specs/cross-cutting/base-rev-2-fix.spec.md');
    assert.equal(ev.target_revision, 2);
    assert.ok(typeof ev.ts === 'string' && ev.ts.length > 0);
  } finally {
    cleanupTempDir(root);
  }
});

test('reportSpecAmended throws EVENT_SCHEMA_INVALID on missing amendment_slug', () => {
  const root = createTempDir();
  try {
    assert.throws(
      () => reportSpecAmended(root, BASE_SPEC, {
        amendment_path: '.context-index/specs/cross-cutting/x.spec.md',
        target_revision: 2,
      }),
      (err) => err.code === 'EVENT_SCHEMA_INVALID',
    );
  } finally {
    cleanupTempDir(root);
  }
});

test('reportSpecAmended throws EVENT_SCHEMA_INVALID on non-string amendment_path', () => {
  const root = createTempDir();
  try {
    assert.throws(
      () => reportSpecAmended(root, BASE_SPEC, {
        amendment_slug: 'x',
        amendment_path: 42,
        target_revision: 2,
      }),
      (err) => err.code === 'EVENT_SCHEMA_INVALID',
    );
  } finally {
    cleanupTempDir(root);
  }
});

test('reportSpecAmended throws EVENT_SCHEMA_INVALID on target_revision < 2', () => {
  const root = createTempDir();
  try {
    assert.throws(
      () => reportSpecAmended(root, BASE_SPEC, {
        amendment_slug: 'x',
        amendment_path: '.context-index/specs/cross-cutting/x.spec.md',
        target_revision: 1,
      }),
      (err) => err.code === 'EVENT_SCHEMA_INVALID',
    );
  } finally {
    cleanupTempDir(root);
  }
});
