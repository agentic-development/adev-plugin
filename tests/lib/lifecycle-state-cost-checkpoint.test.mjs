// tests/lib/lifecycle-state-cost-checkpoint.test.mjs
//
// Tests for the cost_checkpoint event variant:
//   - Task 1: CANONICAL_EVENTS.has('cost_checkpoint')
//   - Task 2: REQUIRED_FIELDS_BY_EVENT.cost_checkpoint
//   - Task 3: reportCostCheckpoint emitter (producer unit test)
//   - Task 5: build skill prose presence
//   - Task 6: lifecycle-event-log.spec.md cross-spec consistency
//
// Spec: .context-index/specs/features/session-awareness/cost-checkpoint-events.spec.md

import { test } from 'node:test';
import assert from 'node:assert';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
} from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '..', '..');

// ── Task 1: CANONICAL_EVENTS ──────────────────────────────────────────────────

import { CANONICAL_EVENTS } from '../../lib/lifecycle-events.mjs';

test('CANONICAL_EVENTS includes cost_checkpoint', () => {
  assert.ok(CANONICAL_EVENTS.has('cost_checkpoint'), 'CANONICAL_EVENTS must contain cost_checkpoint');
});
