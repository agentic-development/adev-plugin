/**
 * Unit tests for lib/lifecycle-state.mjs `reportPartialRecovery` helper and
 * the `partialRecoveries[]` projection field.
 *
 * Covers Task 6 from incremental-artifact-writes.plan.md. Closes the
 * SA-12/CON-11 projection-field pinning decision.
 *
 * Cross-spec contract: this module owns the helper signature and validation;
 * `incremental-artifact-writes.spec.md` owns the .partial recovery lifecycle.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTempDir, cleanupTempDir } from "../helpers.mjs";

import {
  CANONICAL_EVENTS,
  appendEvent,
  currentState,
  reportPartialRecovery,
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

test("CANONICAL_EVENTS includes partial_recovery", () => {
  assert.ok(
    CANONICAL_EVENTS.has("partial_recovery"),
    "partial_recovery must be in CANONICAL_EVENTS"
  );
});

test("reportPartialRecovery writes a partial_recovery event with validated payload", () => {
  const { root, specPath } = makeProject();
  try {
    reportPartialRecovery(root, specPath, {
      artifact_path: ".context-index/specs/features/test/sample.plan.md",
      prior_partial_ts: "2026-05-17T10:00:00.000Z",
      action: "resumed",
      dispatch_mode: "subagent",
    });
    const events = readEvents(root, specPath);
    assert.equal(events.length, 1);
    const ev = events[0];
    assert.equal(ev.event, "partial_recovery");
    assert.equal(
      ev.artifact_path,
      ".context-index/specs/features/test/sample.plan.md"
    );
    assert.equal(ev.prior_partial_ts, "2026-05-17T10:00:00.000Z");
    assert.equal(ev.action, "resumed");
    assert.equal(ev.dispatch_mode, "subagent");
    assert.ok(ev.ts, "ts is stamped");
  } finally {
    cleanupTempDir(root);
  }
});

test("reportPartialRecovery accepts every action enum value", () => {
  const { root, specPath } = makeProject();
  try {
    for (const action of ["resumed", "discarded", "stolen", "aborted"]) {
      reportPartialRecovery(root, specPath, {
        artifact_path: ".context-index/x.md",
        prior_partial_ts: "2026-05-17T10:00:00.000Z",
        action,
        dispatch_mode: "foreground",
      });
    }
    const events = readEvents(root, specPath);
    assert.equal(events.length, 4);
    assert.deepEqual(
      events.map((e) => e.action),
      ["resumed", "discarded", "stolen", "aborted"]
    );
  } finally {
    cleanupTempDir(root);
  }
});

test("reportPartialRecovery rejects unknown action values", () => {
  const { root, specPath } = makeProject();
  try {
    assert.throws(
      () =>
        reportPartialRecovery(root, specPath, {
          artifact_path: ".context-index/x.md",
          prior_partial_ts: "2026-05-17T10:00:00.000Z",
          action: "rolled-back", // not in the closed enum
          dispatch_mode: "foreground",
        }),
      (err) => err && err.code === "EVENT_SCHEMA_INVALID"
    );
  } finally {
    cleanupTempDir(root);
  }
});

test("reportPartialRecovery rejects absolute artifact_path (SEC-3)", () => {
  const { root, specPath } = makeProject();
  try {
    assert.throws(
      () =>
        reportPartialRecovery(root, specPath, {
          artifact_path: "/Users/foo/absolute/path.md",
          prior_partial_ts: "2026-05-17T10:00:00.000Z",
          action: "resumed",
          dispatch_mode: "foreground",
        }),
      (err) => err && err.code === "EVENT_SCHEMA_INVALID"
    );
  } finally {
    cleanupTempDir(root);
  }
});

test("reportPartialRecovery rejects unknown dispatch_mode", () => {
  const { root, specPath } = makeProject();
  try {
    assert.throws(
      () =>
        reportPartialRecovery(root, specPath, {
          artifact_path: ".context-index/x.md",
          prior_partial_ts: "2026-05-17T10:00:00.000Z",
          action: "resumed",
          dispatch_mode: "background", // not foreground|subagent
        }),
      (err) => err && err.code === "EVENT_SCHEMA_INVALID"
    );
  } finally {
    cleanupTempDir(root);
  }
});

test("reportPartialRecovery rejects missing or non-object args", () => {
  const { root, specPath } = makeProject();
  try {
    assert.throws(
      () => reportPartialRecovery(root, specPath),
      (err) => err && err.code === "EVENT_SCHEMA_INVALID"
    );
    assert.throws(
      () => reportPartialRecovery(root, specPath, null),
      (err) => err && err.code === "EVENT_SCHEMA_INVALID"
    );
  } finally {
    cleanupTempDir(root);
  }
});

test("currentState surfaces partial_recovery events under partialRecoveries[]", () => {
  const { root, specPath } = makeProject();
  try {
    reportPartialRecovery(root, specPath, {
      artifact_path: ".context-index/x.md",
      prior_partial_ts: "2026-05-17T10:00:00.000Z",
      action: "stolen",
      dispatch_mode: "subagent",
    });
    reportPartialRecovery(root, specPath, {
      artifact_path: ".context-index/y.md",
      prior_partial_ts: "2026-05-17T11:00:00.000Z",
      action: "discarded",
      dispatch_mode: "foreground",
    });

    const state = currentState(root, specPath);
    assert.ok(Array.isArray(state.partialRecoveries));
    assert.equal(state.partialRecoveries.length, 2);
    assert.equal(state.partialRecoveries[0].action, "stolen");
    assert.equal(state.partialRecoveries[1].action, "discarded");

    // Must NOT have folded into interventions[]
    assert.equal(state.interventions.length, 0);
    // Must NOT have folded into unknownEvents[]
    assert.equal(state.unknownEvents.length, 0);
  } finally {
    cleanupTempDir(root);
  }
});

test("currentState returns an empty partialRecoveries[] for a fresh spec", () => {
  const { root, specPath } = makeProject();
  try {
    const state = currentState(root, specPath);
    assert.deepEqual(state.partialRecoveries, []);
  } finally {
    cleanupTempDir(root);
  }
});

test("appendEvent accepts partial_recovery as a canonical variant", () => {
  // Sanity that the helper's underlying primitive sees partial_recovery as
  // canonical (not surfaced under unknownEvents[]).
  const { root, specPath } = makeProject();
  try {
    appendEvent(root, specPath, {
      event: "partial_recovery",
      artifact_path: ".context-index/x.md",
      prior_partial_ts: "2026-05-17T10:00:00.000Z",
      action: "aborted",
      dispatch_mode: "subagent",
    });
    const state = currentState(root, specPath);
    assert.equal(state.unknownEvents.length, 0);
    assert.equal(state.partialRecoveries.length, 1);
  } finally {
    cleanupTempDir(root);
  }
});
