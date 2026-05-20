/**
 * Unit tests for lib/plan-routing-sidecar.mjs.
 *
 * Spec: .context-index/specs/features/agent-reliable-state-artifacts/plan-routing-sidecar.spec.md
 *       Behaviors 1–3, Postconditions, Error Cases.
 *
 * Covers:
 *   - write/read roundtrip (Behavior 1 + 2)
 *   - deterministic markdown rendering keyed by task_id
 *   - atomic temp-then-rename semantics + SIDECAR_WRITE_FAILED error path
 *   - readRoutingSidecar throws ROUTING_SIDECAR_MISSING when sidecar absent
 *   - lookupRoutingEntry throws ROUTING_ENTRY_MISSING for unknown task_id
 *   - sidecarPathFor derives the correct sibling path
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  writeRoutingSidecar,
  readRoutingSidecar,
  lookupRoutingEntry,
  sidecarPathFor,
} from "../../lib/plan-routing-sidecar.mjs";

function mkPlanDir(label) {
  return mkdtempSync(join(tmpdir(), `routing-${label}-`));
}

const ENTRY_T1 = {
  task_id: "t1",
  selected_agent: "auto-agent",
  scores: {
    spec_completeness: 0.9,
    pattern_coverage: 0.8,
    blast_radius: 0.2,
    novelty: 0.3,
  },
  rationale: "high-conf path",
};

const ENTRY_T2 = {
  task_id: "t2",
  selected_agent: "frontend-design",
  scores: {
    spec_completeness: 0.7,
    pattern_coverage: 0.6,
    blast_radius: 0.4,
    novelty: 0.5,
  },
  rationale: "ui-touch task; specialist routing",
};

test("sidecarPathFor: <stem>.plan.md → <stem>.routing.md", () => {
  assert.equal(
    sidecarPathFor("/x/y/foo.plan.md"),
    "/x/y/foo.routing.md",
  );
  assert.equal(
    sidecarPathFor("rel/foo-bar.plan.md"),
    "rel/foo-bar.routing.md",
  );
});

test("sidecarPathFor: throws when path does not end with .plan.md", () => {
  assert.throws(
    () => sidecarPathFor("/x/y/foo.md"),
    /INVALID_PLAN_PATH/,
  );
});

test("writeRoutingSidecar then readRoutingSidecar roundtrip preserves entries", () => {
  const dir = mkPlanDir("roundtrip");
  try {
    const planPath = join(dir, "foo.plan.md");
    writeFileSync(planPath, "# Plan\n");

    writeRoutingSidecar(planPath, [ENTRY_T1, ENTRY_T2]);

    const sidecarPath = sidecarPathFor(planPath);
    assert.ok(existsSync(sidecarPath), "sidecar file must exist after write");

    const round = readRoutingSidecar(planPath);
    assert.equal(round.length, 2);
    // Reader returns entries sorted by task_id ascending (deterministic).
    assert.deepEqual(round[0], ENTRY_T1);
    assert.deepEqual(round[1], ENTRY_T2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("writeRoutingSidecar leaves plan body byte-identical", () => {
  const dir = mkPlanDir("plan-unchanged");
  try {
    const planPath = join(dir, "foo.plan.md");
    const planBody = "# Plan\n\nSome content.\n";
    writeFileSync(planPath, planBody);

    writeRoutingSidecar(planPath, [ENTRY_T1]);

    const after = readFileSync(planPath, "utf8");
    assert.equal(after, planBody, "plan body must not be mutated");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("writeRoutingSidecar is writer-owned: re-run replaces, no append", () => {
  const dir = mkPlanDir("rewrite");
  try {
    const planPath = join(dir, "foo.plan.md");
    writeFileSync(planPath, "# Plan\n");

    writeRoutingSidecar(planPath, [ENTRY_T1, ENTRY_T2]);
    writeRoutingSidecar(planPath, [ENTRY_T1]);

    const round = readRoutingSidecar(planPath);
    assert.equal(round.length, 1, "second write must fully replace first");
    assert.deepEqual(round[0], ENTRY_T1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("writeRoutingSidecar emits deterministic markdown sorted by task_id", () => {
  const dir = mkPlanDir("deterministic");
  try {
    const planPath = join(dir, "foo.plan.md");
    writeFileSync(planPath, "# Plan\n");

    // Write in reverse order; emitter must sort by task_id.
    writeRoutingSidecar(planPath, [ENTRY_T2, ENTRY_T1]);
    const body1 = readFileSync(sidecarPathFor(planPath), "utf8");

    writeRoutingSidecar(planPath, [ENTRY_T1, ENTRY_T2]);
    const body2 = readFileSync(sidecarPathFor(planPath), "utf8");

    assert.equal(body1, body2, "ordering of input must not affect output");
    // The t1 block must appear before the t2 block in the rendered body.
    const idxT1 = body1.indexOf("task_id: t1");
    const idxT2 = body1.indexOf("task_id: t2");
    assert.ok(idxT1 >= 0 && idxT2 >= 0 && idxT1 < idxT2, "t1 must precede t2");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("writeRoutingSidecar surfaces SIDECAR_WRITE_FAILED with err.code on rename failure", async () => {
  const dir = mkPlanDir("rename-fail-2");
  try {
    const planPath = join(dir, "foo.plan.md");
    writeFileSync(planPath, "# Plan\n");

    // Place a directory at the sidecar destination so renameSync raises EISDIR.
    const { mkdirSync } = await import("node:fs");
    mkdirSync(sidecarPathFor(planPath));

    let caught;
    try {
      writeRoutingSidecar(planPath, [ENTRY_T1]);
    } catch (err) {
      caught = err;
    }
    assert.ok(caught, "writer must throw when rename fails");
    assert.equal(caught.code, "SIDECAR_WRITE_FAILED");
    assert.ok(
      typeof caught.tmpPath === "string" && caught.tmpPath.length > 0,
      "error should carry tmpPath for inspection",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("readRoutingSidecar throws ROUTING_SIDECAR_MISSING when sidecar absent", () => {
  const dir = mkPlanDir("missing-sidecar");
  try {
    const planPath = join(dir, "foo.plan.md");
    writeFileSync(planPath, "# Plan\n");

    let caught;
    try {
      readRoutingSidecar(planPath);
    } catch (err) {
      caught = err;
    }
    assert.ok(caught, "reader must throw when sidecar absent");
    assert.equal(caught.code, "ROUTING_SIDECAR_MISSING");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("lookupRoutingEntry returns entry for matching task_id", () => {
  const dir = mkPlanDir("lookup-hit");
  try {
    const planPath = join(dir, "foo.plan.md");
    writeFileSync(planPath, "# Plan\n");
    writeRoutingSidecar(planPath, [ENTRY_T1, ENTRY_T2]);

    const found = lookupRoutingEntry(planPath, "t2");
    assert.deepEqual(found, ENTRY_T2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("lookupRoutingEntry throws ROUTING_ENTRY_MISSING for unknown task_id", () => {
  const dir = mkPlanDir("lookup-miss");
  try {
    const planPath = join(dir, "foo.plan.md");
    writeFileSync(planPath, "# Plan\n");
    writeRoutingSidecar(planPath, [ENTRY_T1]);

    let caught;
    try {
      lookupRoutingEntry(planPath, "tZ");
    } catch (err) {
      caught = err;
    }
    assert.ok(caught, "lookup must throw on miss");
    assert.equal(caught.code, "ROUTING_ENTRY_MISSING");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("lookupRoutingEntry throws ROUTING_SIDECAR_MISSING when sidecar absent", () => {
  const dir = mkPlanDir("lookup-no-sidecar");
  try {
    const planPath = join(dir, "foo.plan.md");
    writeFileSync(planPath, "# Plan\n");
    let caught;
    try {
      lookupRoutingEntry(planPath, "t1");
    } catch (err) {
      caught = err;
    }
    assert.ok(caught);
    assert.equal(caught.code, "ROUTING_SIDECAR_MISSING");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("writeRoutingSidecar validates entry schema: missing task_id throws", () => {
  const dir = mkPlanDir("validate-task-id");
  try {
    const planPath = join(dir, "foo.plan.md");
    writeFileSync(planPath, "# Plan\n");

    const bad = { ...ENTRY_T1 };
    delete bad.task_id;
    assert.throws(
      () => writeRoutingSidecar(planPath, [bad]),
      /INVALID_ROUTING_ENTRY/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("writeRoutingSidecar validates entry schema: missing scores dimension throws", () => {
  const dir = mkPlanDir("validate-scores");
  try {
    const planPath = join(dir, "foo.plan.md");
    writeFileSync(planPath, "# Plan\n");

    const bad = { ...ENTRY_T1, scores: { spec_completeness: 0.5 } };
    assert.throws(
      () => writeRoutingSidecar(planPath, [bad]),
      /INVALID_ROUTING_ENTRY/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("readRoutingSidecar tolerates trailing whitespace and recovers entries", () => {
  const dir = mkPlanDir("whitespace");
  try {
    const planPath = join(dir, "foo.plan.md");
    writeFileSync(planPath, "# Plan\n");

    writeRoutingSidecar(planPath, [ENTRY_T1]);
    const sidecarPath = sidecarPathFor(planPath);
    const body = readFileSync(sidecarPath, "utf8");
    writeFileSync(sidecarPath, body + "\n\n   \n");

    const round = readRoutingSidecar(planPath);
    assert.deepEqual(round, [ENTRY_T1]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
