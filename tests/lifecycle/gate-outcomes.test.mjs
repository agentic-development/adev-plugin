// tests/lifecycle/gate-outcomes.test.mjs
//
// Task 4 of explicit-governance-registries.plan.md (closes review blocker SA-1,
// writer half).
//
// Covers the two OPTIONAL payload fields carried by `reportValidator` on the
// EXISTING `validator_report` canonical event:
//   - `gate_outcomes` — array of { id, verdict, tier, command_sha? }
//   - `manifest_sha`  — the spec's source-manifest sha at emission time
//
// Both are optional by design: records written before this landed carry
// neither. A missing `manifest_sha` falls back to the `ts >= computed-at`
// comparison alone; a missing per-outcome `command_sha` skips the command-hash
// comparison and relies on the gate-id membership check alone. Neither absence
// is an error (fail-soft on history, never on verdicts).
//
// No new CANONICAL_EVENTS variant is introduced — pinned below so the ADR-0009
// [BOUNDARY: human-approved] line stays uncrossed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

import { createTempDir, cleanupTempDir, PLUGIN_ROOT } from '../helpers.mjs';
import { CANONICAL_EVENTS } from '../../lib/lifecycle-events.mjs';
import { reportValidator, readEvents } from '../../lib/lifecycle-state.mjs';

// The two fields are validator-agnostic payload additions; this suite uses a
// check id the bundled software starter already declares so severity
// resolution stays quiet (see tests/lib/lifecycle-state.test.mjs for the same
// choice). Check 1 is the production emitter.
const VALIDATOR = 'validate.check-2-spec-compliance';

/**
 * Seed a minimal project root that `appendEvent` accepts, and return the
 * project-root-relative spec path its lifecycle log is keyed on.
 */
function seedSpec() {
  const dir = createTempDir();
  mkdirSync(join(dir, '.context-index'), { recursive: true });
  writeFileSync(
    join(dir, '.context-index', 'manifest.yaml'),
    'project:\n  name: test\nlifecycle:\n  event_diagnostics: off\n',
    'utf8',
  );
  return { dir, spec: '.context-index/specs/features/test/sample.spec.md' };
}

/** Last event appended to the spec's lifecycle log. */
function lastEvent(dir, spec) {
  const events = readEvents(dir, spec);
  return events[events.length - 1];
}

function isSchemaInvalid(err) {
  return err.code === 'EVENT_SCHEMA_INVALID';
}

test('reportValidator carries a per-gate outcome array into the payload', () => {
  const { dir, spec } = seedSpec();
  try {
    const outcome = { id: 'test', verdict: 'pass', tier: 'fast', command_sha: '9f2b1c' };
    reportValidator(dir, spec, {
      step: 'validate',
      validator: VALIDATOR,
      verdict: 'PASS',
      gate_outcomes: [outcome],
      manifest_sha: 'abc1234',
      pluginRoot: PLUGIN_ROOT,
    });
    const ev = lastEvent(dir, spec);
    assert.equal(ev.event, 'validator_report');
    // command_sha survives — it is NOT stripped (Task 7's attestation rule reads it).
    assert.deepEqual(ev.gate_outcomes, [outcome]);
    assert.equal(ev.manifest_sha, 'abc1234');
    assert.ok(Date.parse(ev.ts) > 0, 'event carries its own ordered timestamp');
  } finally {
    cleanupTempDir(dir);
  }
});

test('manifest_sha round-trips independently of gate_outcomes', () => {
  const { dir, spec } = seedSpec();
  try {
    reportValidator(dir, spec, {
      step: 'validate',
      validator: VALIDATOR,
      verdict: 'PASS',
      manifest_sha: 'deadbeef',
      pluginRoot: PLUGIN_ROOT,
    });
    const ev = lastEvent(dir, spec);
    assert.equal(ev.manifest_sha, 'deadbeef');
    assert.equal(ev.gate_outcomes, undefined);
  } finally {
    cleanupTempDir(dir);
  }
});

test('a non-string manifest_sha is refused, never coerced', () => {
  // Task 7's freshness rule equality-checks `manifest_sha` against the spec's
  // real source-manifest sha. A coerced value (`null` -> "null", 0 -> "0",
  // {} -> "[object Object]") can never match, so it would degrade to a
  // permanent, undiagnosable stale-gate-record SKIP. Refuse at write time.
  //
  // `null` is REJECTED rather than treated as absent: unlike reportReviewer's
  // `revision` (which tolerates `null` for legacy events written before the
  // field existed), `manifest_sha` has no legacy caller — a `null` here is
  // always a failed sha lookup at the call site, and silently recording
  // "pre-upgrade record" would reproduce the same silent fail-soft.
  const { dir, spec } = seedSpec();
  try {
    for (const bad of [null, 42, 0, false, {}, []]) {
      assert.throws(
        () => reportValidator(dir, spec, {
          step: 'validate', validator: VALIDATOR, verdict: 'PASS',
          manifest_sha: bad, pluginRoot: PLUGIN_ROOT,
        }),
        isSchemaInvalid,
        `manifest_sha=${String(bad)} must be refused`,
      );
    }
    assert.deepEqual(readEvents(dir, spec), [], 'no rejected event reached disk');
  } finally {
    cleanupTempDir(dir);
  }
});

test('an empty-string manifest_sha throws (it would be misread as absent)', () => {
  const { dir, spec } = seedSpec();
  try {
    assert.throws(
      () => reportValidator(dir, spec, {
        step: 'validate', validator: VALIDATOR, verdict: 'PASS',
        manifest_sha: '', pluginRoot: PLUGIN_ROOT,
      }),
      isSchemaInvalid,
    );
  } finally {
    cleanupTempDir(dir);
  }
});

test('an outcome without command_sha is accepted (pre-upgrade records)', () => {
  const { dir, spec } = seedSpec();
  try {
    assert.doesNotThrow(() => {
      reportValidator(dir, spec, {
        step: 'validate',
        validator: VALIDATOR,
        verdict: 'PASS',
        gate_outcomes: [{ id: 'test', verdict: 'skip', tier: 'fast' }],
        pluginRoot: PLUGIN_ROOT,
      });
    });
    const ev = lastEvent(dir, spec);
    assert.deepEqual(ev.gate_outcomes, [{ id: 'test', verdict: 'skip', tier: 'fast' }]);
    assert.equal(ev.manifest_sha, undefined, 'a missing manifest_sha is not an error');
  } finally {
    cleanupTempDir(dir);
  }
});

test('an empty gate_outcomes array round-trips as [] and is not dropped', () => {
  // Deliberate pin: `[]` means "the check ran and produced no outcomes",
  // which is distinguishable from `undefined` ("pre-upgrade record, no data").
  // Collapsing `[]` to `undefined` would erase that distinction.
  const { dir, spec } = seedSpec();
  try {
    reportValidator(dir, spec, {
      step: 'validate',
      validator: VALIDATOR,
      verdict: 'PASS',
      gate_outcomes: [],
      pluginRoot: PLUGIN_ROOT,
    });
    const ev = lastEvent(dir, spec);
    assert.deepEqual(ev.gate_outcomes, []);
    assert.ok('gate_outcomes' in ev, 'an empty array must survive as an explicit field');
  } finally {
    cleanupTempDir(dir);
  }
});

test('malformed gate_outcomes are refused, not silently dropped', () => {
  const { dir, spec } = seedSpec();
  try {
    assert.throws(
      () => reportValidator(dir, spec, {
        step: 'validate',
        validator: VALIDATOR,
        verdict: 'PASS',
        gate_outcomes: [{ id: 'test', verdict: 'maybe', tier: 'fast' }],
        pluginRoot: PLUGIN_ROOT,
      }),
      isSchemaInvalid,
    );
    assert.deepEqual(readEvents(dir, spec), [], 'the rejected event never reached disk');
  } finally {
    cleanupTempDir(dir);
  }
});

test('gate_outcomes that is not an array throws EVENT_SCHEMA_INVALID', () => {
  const { dir, spec } = seedSpec();
  try {
    for (const bad of [{ id: 'test' }, 'test', 42, null]) {
      assert.throws(
        () => reportValidator(dir, spec, {
          step: 'validate', validator: VALIDATOR, verdict: 'PASS',
          gate_outcomes: bad, pluginRoot: PLUGIN_ROOT,
        }),
        isSchemaInvalid,
        `gate_outcomes=${JSON.stringify(bad)} must be refused`,
      );
    }
  } finally {
    cleanupTempDir(dir);
  }
});

test('a gate_outcomes element that is not an object throws', () => {
  const { dir, spec } = seedSpec();
  try {
    for (const bad of ['test', 42, null, ['test']]) {
      assert.throws(
        () => reportValidator(dir, spec, {
          step: 'validate', validator: VALIDATOR, verdict: 'PASS',
          gate_outcomes: [bad], pluginRoot: PLUGIN_ROOT,
        }),
        isSchemaInvalid,
        `element ${JSON.stringify(bad)} must be refused`,
      );
    }
  } finally {
    cleanupTempDir(dir);
  }
});

test('empty-string id and empty-string tier each throw', () => {
  const { dir, spec } = seedSpec();
  try {
    assert.throws(
      () => reportValidator(dir, spec, {
        step: 'validate', validator: VALIDATOR, verdict: 'PASS',
        gate_outcomes: [{ id: '', verdict: 'pass', tier: 'fast' }],
        pluginRoot: PLUGIN_ROOT,
      }),
      isSchemaInvalid,
    );
    assert.throws(
      () => reportValidator(dir, spec, {
        step: 'validate', validator: VALIDATOR, verdict: 'PASS',
        gate_outcomes: [{ id: 'test', verdict: 'pass', tier: '' }],
        pluginRoot: PLUGIN_ROOT,
      }),
      isSchemaInvalid,
    );
  } finally {
    cleanupTempDir(dir);
  }
});

test('command_sha present-but-empty is invalid', () => {
  const { dir, spec } = seedSpec();
  try {
    assert.throws(
      () => reportValidator(dir, spec, {
        step: 'validate', validator: VALIDATOR, verdict: 'PASS',
        gate_outcomes: [{ id: 'test', verdict: 'pass', tier: 'fast', command_sha: '' }],
        pluginRoot: PLUGIN_ROOT,
      }),
      isSchemaInvalid,
    );
  } finally {
    cleanupTempDir(dir);
  }
});

test('an unknown key on an outcome throws and the message names the offending index', () => {
  const { dir, spec } = seedSpec();
  try {
    assert.throws(
      () => reportValidator(dir, spec, {
        step: 'validate', validator: VALIDATOR, verdict: 'PASS',
        gate_outcomes: [
          { id: 'a', verdict: 'pass', tier: 'fast' },
          { id: 'b', verdict: 'pass', tier: 'fast', sneaky: true },
        ],
        pluginRoot: PLUGIN_ROOT,
      }),
      (err) => {
        assert.ok(isSchemaInvalid(err), `expected EVENT_SCHEMA_INVALID, got ${err.code}`);
        assert.match(err.message, /\[1\]/, 'message must name the offending array index');
        assert.match(err.message, /sneaky/, 'message must name the offending key');
        return true;
      },
    );
  } finally {
    cleanupTempDir(dir);
  }
});

test('every verdict in the closed set pass|fail|skip is accepted', () => {
  const { dir, spec } = seedSpec();
  try {
    for (const verdict of ['pass', 'fail', 'skip']) {
      assert.doesNotThrow(() => reportValidator(dir, spec, {
        step: 'validate', validator: VALIDATOR, verdict: 'PASS',
        gate_outcomes: [{ id: 'test', verdict, tier: 'fast' }],
        pluginRoot: PLUGIN_ROOT,
      }));
    }
  } finally {
    cleanupTempDir(dir);
  }
});

// The variant list below is DELIBERATELY HARDCODED. `gate_outcomes`,
// `manifest_sha` and the per-outcome `command_sha` are payload fields on the
// existing `validator_report` variant — they introduce no new discriminator.
// Adding a canonical event variant touches the lifecycle event schema governed
// by ADR-0009 and requires human approval ([BOUNDARY: human-approved]); this
// test fails loudly if anyone adds one without updating the list here.
const EXPECTED_VARIANTS = [
  'lifecycle_step', 'step_completed', 'step_failed',
  'reviewer_report', 'validator_report',
  'plan_task', 'debug_intervention', 'recovery_record', 'manual_override',
  'code_drift_detected', 'code_drift_cleared',
  'partial_recovery',
  'spec_revised',
  'spec_amended',
  'human_approval_required',
  'test_depth_assigned',
  // review-provenance.spec.md Output Contract B registration step 2 — the
  // canonical set legitimately grew here, so the pin is updated in lockstep.
  'review_round',
  // Task 6 — review_depth_resolved registration; the canonical set
  // legitimately grew here, so the pin is updated in lockstep.
  'review_depth_resolved',
];

test('no new CANONICAL_EVENTS variant is introduced', () => {
  assert.deepEqual([...CANONICAL_EVENTS].sort(), [...EXPECTED_VARIANTS].sort());
});
