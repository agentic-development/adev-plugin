/**
 * Unit tests for lib/lifecycle-state.mjs
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { CANONICAL_EVENTS } from '../../lib/lifecycle-state.mjs';

// ── Task 1: canonical event schema ──────────────────────────────────────────

test('CANONICAL_EVENTS contains every documented variant', () => {
  for (const e of [
    'lifecycle_step', 'step_completed', 'step_failed',
    'reviewer_report', 'validator_report',
    'plan_task', 'debug_intervention', 'recovery_record', 'manual_override',
  ]) {
    assert.ok(CANONICAL_EVENTS.has(e), `missing variant: ${e}`);
  }
});
