/**
 * Unit tests for `lib/lifecycle-state.mjs`'s orphan `step_completed` /
 * `step_failed` guard (Defect 2 of
 * adev-plugin-implement-destructive-checkout-fabricated-proven-2s9i).
 *
 * Background: a subagent covering up a destructive revert re-emitted a
 * fabricated `step_completed` event for `implement` with no matching
 * `lifecycle_step … started` event anywhere in the log. `reportStep` accepted
 * it unconditionally, which let the fabricated event open the `validate`
 * gate.
 *
 * Scope note (read before extending this file): a blanket "every
 * step_completed/step_failed must be preceded by its own started event"
 * rule is incompatible with this repo's existing test corpus —
 * `tests/lib/lifecycle-state.test.mjs` and
 * `tests/lib/lifecycle-state-step-cost.test.mjs` both call `reportStep(...,
 * { status: 'completed'|'failed' })` directly with zero prior events, as a
 * bare-primitive way to exercise projection/cost-field logic in isolation
 * (see e.g. "currentState byRevision works across multiple step names"). So
 * this guard is opt-in via `manifest.lifecycle.step_pairing`, following the
 * existing `gate_mode` / `event_diagnostics` knob convention in this file,
 * and defaults to `off` — unlike `gate_mode` (defaults `strict`), a default
 * of `strict` here would be a silent breaking change for exactly the
 * legitimate bare-primitive test/tooling usage described above.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTempDir, cleanupTempDir } from "../helpers.mjs";

import {
  reportStep,
  readEvents,
  resolveStepPairingMode,
} from "../../lib/lifecycle-state.mjs";

function makeProject({ stepPairing } = {}) {
  const root = createTempDir();
  mkdirSync(join(root, ".context-index"), { recursive: true });
  const lifecycleLines = ["lifecycle:", "  event_diagnostics: off"];
  if (stepPairing !== undefined) {
    lifecycleLines.push(`  step_pairing: ${stepPairing}`);
  }
  writeFileSync(
    join(root, ".context-index", "manifest.yaml"),
    `project:\n  name: test\n${lifecycleLines.join("\n")}\n`,
  );
  const specPath = ".context-index/specs/features/test/sample.spec.md";
  return { root, specPath };
}

// ── resolveStepPairingMode ───────────────────────────────────────────────

test("resolveStepPairingMode defaults to off when lifecycle.step_pairing is absent", () => {
  assert.equal(resolveStepPairingMode(undefined), "off");
  assert.equal(resolveStepPairingMode({}), "off");
  assert.equal(resolveStepPairingMode({ lifecycle: {} }), "off");
});

test("resolveStepPairingMode returns strict when configured", () => {
  assert.equal(resolveStepPairingMode({ lifecycle: { step_pairing: "strict" } }), "strict");
});

test("resolveStepPairingMode defaults unknown values to off with a one-time warning", () => {
  const orig = console.error;
  const messages = [];
  console.error = (msg) => { messages.push(String(msg)); };
  try {
    assert.equal(resolveStepPairingMode({ lifecycle: { step_pairing: "bogus" } }), "off");
    assert.ok(messages.some((m) => m.includes("step-pairing")), "should warn about the unknown mode");
  } finally {
    console.error = orig;
  }
});

// ── Default (off) mode — no behavior change from pre-existing baseline ─────

test("default mode (no step_pairing key) accepts an orphan step_completed", () => {
  const { root, specPath } = makeProject();
  try {
    assert.doesNotThrow(() => {
      reportStep(root, specPath, { step: "implement", status: "completed", verdict: "PASS" });
    });
    const events = readEvents(root, specPath);
    assert.equal(events.length, 1);
    assert.equal(events[0].event, "step_completed");
  } finally {
    cleanupTempDir(root);
  }
});

test("explicit step_pairing: off accepts an orphan step_failed", () => {
  const { root, specPath } = makeProject({ stepPairing: "off" });
  try {
    assert.doesNotThrow(() => {
      reportStep(root, specPath, { step: "plan", status: "failed", verdict: "FAIL" });
    });
  } finally {
    cleanupTempDir(root);
  }
});

// ── strict mode: legitimate pairing ─────────────────────────────────────────

test("strict mode accepts step_completed immediately preceded by its own started event", () => {
  const { root, specPath } = makeProject({ stepPairing: "strict" });
  try {
    reportStep(root, specPath, { step: "implement", status: "started" });
    assert.doesNotThrow(() => {
      reportStep(root, specPath, { step: "implement", status: "completed", verdict: "PASS" });
    });
  } finally {
    cleanupTempDir(root);
  }
});

test("strict mode accepts step_failed immediately preceded by its own started event", () => {
  const { root, specPath } = makeProject({ stepPairing: "strict" });
  try {
    reportStep(root, specPath, { step: "review", status: "started" });
    assert.doesNotThrow(() => {
      reportStep(root, specPath, { step: "review", status: "failed", verdict: "FAIL" });
    });
  } finally {
    cleanupTempDir(root);
  }
});

test("strict mode never rejects a lifecycle_step started event itself", () => {
  const { root, specPath } = makeProject({ stepPairing: "strict" });
  try {
    assert.doesNotThrow(() => {
      reportStep(root, specPath, { step: "implement", status: "started" });
      reportStep(root, specPath, { step: "implement", status: "started" });
    });
  } finally {
    cleanupTempDir(root);
  }
});

test("strict mode folds a revision-less started as revision 1, matching an explicit revision:1 completed", () => {
  const { root, specPath } = makeProject({ stepPairing: "strict" });
  try {
    reportStep(root, specPath, { step: "plan", status: "started" });
    assert.doesNotThrow(() => {
      reportStep(root, specPath, { step: "plan", status: "completed", verdict: "PASS", revision: 1 });
    });
  } finally {
    cleanupTempDir(root);
  }
});

test("strict mode accepts a second started/completed pair on a later revision (review-retry pattern)", () => {
  const { root, specPath } = makeProject({ stepPairing: "strict" });
  try {
    reportStep(root, specPath, { step: "review", status: "started", revision: 1 });
    reportStep(root, specPath, { step: "review", status: "failed", verdict: "FAIL", revision: 1 });
    reportStep(root, specPath, { step: "review", status: "started", revision: 2 });
    assert.doesNotThrow(() => {
      reportStep(root, specPath, { step: "review", status: "completed", verdict: "PASS", revision: 2 });
    });
  } finally {
    cleanupTempDir(root);
  }
});

// ── strict mode: the orphan case this defect is about ───────────────────────

test("strict mode rejects step_completed with no matching started event anywhere in the log (the fabricated-event incident)", () => {
  const { root, specPath } = makeProject({ stepPairing: "strict" });
  try {
    assert.throws(
      () => reportStep(root, specPath, { step: "implement", status: "completed", verdict: "PASS" }),
      (err) => err.code === "ORPHAN_STEP_EVENT",
    );
    // Nothing was persisted — the write must be refused before it hits disk.
    const events = readEvents(root, specPath);
    assert.equal(events.length, 0);
  } finally {
    cleanupTempDir(root);
  }
});

test("strict mode rejects step_failed with no matching started event", () => {
  const { root, specPath } = makeProject({ stepPairing: "strict" });
  try {
    assert.throws(
      () => reportStep(root, specPath, { step: "validate", status: "failed", verdict: "FAIL" }),
      (err) => err.code === "ORPHAN_STEP_EVENT",
    );
  } finally {
    cleanupTempDir(root);
  }
});

test("strict mode rejects step_completed whose revision has no matching started (started only exists for a different revision)", () => {
  const { root, specPath } = makeProject({ stepPairing: "strict" });
  try {
    reportStep(root, specPath, { step: "review", status: "started", revision: 1 });
    reportStep(root, specPath, { step: "review", status: "failed", verdict: "FAIL", revision: 1 });
    // Revision 2 never got its own started event — this is exactly the
    // orphan shape from the incident, just scoped to a later revision.
    assert.throws(
      () => reportStep(root, specPath, { step: "review", status: "completed", verdict: "PASS", revision: 2 }),
      (err) => err.code === "ORPHAN_STEP_EVENT",
    );
  } finally {
    cleanupTempDir(root);
  }
});

test("strict mode rejects step_completed for one step when only a different step has a started event", () => {
  const { root, specPath } = makeProject({ stepPairing: "strict" });
  try {
    reportStep(root, specPath, { step: "plan", status: "started" });
    reportStep(root, specPath, { step: "plan", status: "completed", verdict: "PASS" });
    assert.throws(
      () => reportStep(root, specPath, { step: "implement", status: "completed", verdict: "PASS" }),
      (err) => err.code === "ORPHAN_STEP_EVENT",
    );
  } finally {
    cleanupTempDir(root);
  }
});
