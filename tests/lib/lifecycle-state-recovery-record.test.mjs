/**
 * Unit tests for lib/lifecycle-state.mjs `reportRecoveryRecord` helper.
 *
 * Regression coverage for issue-513: `recovery_record` was declared in
 * CANONICAL_EVENTS and consumed by the projection (folded into
 * `interventions[]`), but no producer existed anywhere in the tree —
 * `reportIntervention` hardcodes `event: 'debug_intervention'`, and
 * `skills/recover/SKILL.md` emitted no lifecycle event at all. The
 * documented producer/consumer pair was broken end to end.
 *
 * Payload shape follows the charter's own example
 * (.context-index/specs/features/agent-reliable-state-artifacts/charter.md):
 *   {"ts":"...","event":"recovery_record","ref":"<recovery-record-path>"}
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTempDir, cleanupTempDir } from "../helpers.mjs";

import {
  CANONICAL_EVENTS,
  currentState,
  reportRecoveryRecord,
  readEvents,
} from "../../lib/lifecycle-state.mjs";

function makeProject() {
  const root = createTempDir();
  mkdirSync(join(root, ".context-index"), { recursive: true });
  writeFileSync(
    join(root, ".context-index", "manifest.yaml"),
    "project:\n  name: test\nlifecycle:\n  event_diagnostics: off\n"
  );
  const specPath = ".context-index/specs/features/test/sample.spec.md";
  return { root, specPath };
}

const REF = ".context-index/hygiene/recoveries/2026-08-20-task-3.md";

test("CANONICAL_EVENTS includes recovery_record", () => {
  assert.ok(
    CANONICAL_EVENTS.has("recovery_record"),
    "recovery_record must be in CANONICAL_EVENTS"
  );
});

test("reportRecoveryRecord writes a recovery_record event carrying its ref", () => {
  const { root, specPath } = makeProject();
  try {
    reportRecoveryRecord(root, specPath, {
      ref: REF,
      category: "MISSING_CONTEXT",
      note: "Subagent lacked the adapter contract; injected and re-dispatched.",
    });
    const events = readEvents(root, specPath);
    assert.equal(events.length, 1);
    const ev = events[0];
    assert.equal(ev.event, "recovery_record");
    assert.equal(ev.ref, REF);
    assert.equal(ev.category, "MISSING_CONTEXT");
    assert.match(ev.note, /adapter contract/);
    assert.ok(typeof ev.ts === "string" && ev.ts.length > 0, "ts is stamped");
  } finally {
    cleanupTempDir(root);
  }
});

test("reportRecoveryRecord events land in the interventions projection", () => {
  const { root, specPath } = makeProject();
  try {
    reportRecoveryRecord(root, specPath, { ref: REF });
    const state = currentState(root, specPath);
    assert.equal(state.interventions.length, 1);
    assert.equal(state.interventions[0].event, "recovery_record");
    assert.equal(state.interventions[0].ref, REF);
    assert.equal(
      state.unknownEvents.length,
      0,
      "recovery_record is canonical, never an unknown event"
    );
  } finally {
    cleanupTempDir(root);
  }
});

test("reportRecoveryRecord requires a non-empty ref", () => {
  const { root, specPath } = makeProject();
  try {
    for (const bad of [undefined, "", 42, null]) {
      assert.throws(
        () => reportRecoveryRecord(root, specPath, { ref: bad }),
        (err) => err && err.code === "EVENT_SCHEMA_INVALID",
        `ref=${JSON.stringify(bad)} must be rejected`
      );
    }
    assert.throws(
      () => reportRecoveryRecord(root, specPath, null),
      (err) => err && err.code === "EVENT_SCHEMA_INVALID"
    );
  } finally {
    cleanupTempDir(root);
  }
});

test("reportRecoveryRecord rejects an absolute ref (SEC-3 data-exposure boundary)", () => {
  const { root, specPath } = makeProject();
  try {
    assert.throws(
      () => reportRecoveryRecord(root, specPath, { ref: "/etc/passwd" }),
      (err) => err && err.code === "EVENT_SCHEMA_INVALID"
    );
  } finally {
    cleanupTempDir(root);
  }
});

test("optional category and note are omitted when not supplied", () => {
  const { root, specPath } = makeProject();
  try {
    reportRecoveryRecord(root, specPath, { ref: REF });
    const [ev] = readEvents(root, specPath);
    assert.ok(!("category" in ev), "absent category is not written as null");
    assert.ok(!("note" in ev), "absent note is not written as null");
  } finally {
    cleanupTempDir(root);
  }
});
