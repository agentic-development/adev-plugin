// tests/governance/registry-marker.test.mjs
//
// The consumer half of the explicit-registry work: the fail-closed
// `materialized_at` guard. Task 9 taught `adev governance materialize` to stamp
// the marker; this suite pins what the marker BUYS — a loader that refuses to
// hand a caller a set it cannot vouch for.
//
// Four properties are load-bearing here, and each has a test that fails if it
// stops holding:
//
//   1. FAIL CLOSED. An unmarked-but-populated registry raises rather than
//      returning the entries it happens to contain. "Some of the set" is the
//      failure this whole spec exists to remove, so returning it is worse than
//      raising.
//   2. DECIDABILITY. The verdict is a property of the PROJECT FILE ALONE. The
//      guard never consults bundled or domain defaults to decide, because Task
//      11 removes run-time merging and would make "do defaults exist" an
//      undecidable question at exactly this point.
//   3. THE BOUNDING IS REAL. `validate.yaml` and `boundaries.yaml` are EXEMPT
//      (DDR-1) and keep loading untouched. If the exemption were reworded
//      rather than real, these two would raise too.
//   4. ROUND TRIP. Raise → `adev governance materialize` → proceed. A guard
//      with no reachable remedy is a wall, not a gate.
//
// Spec: .context-index/specs/cross-cutting/explicit-governance-registries.spec.md
// Plan-task: 10.

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { cleanupTempDir, createTempDir, writeFixture, PLUGIN_ROOT } from "../helpers.mjs";
import { assertMaterialized, stampMarker } from "../../lib/governance/registry-marker.mjs";
import { loadReviewConfig } from "../../lib/governance/review-config.mjs";
import { loadCheck1Gates } from "../../lib/gates/gate-sets.mjs";
import { loadRegistry } from "../../lib/diagnostics/index.mjs";
import { loadValidateConfig } from "../../lib/governance/validate-config.mjs";
import { checkBoundaries } from "../../lib/governance/boundaries.mjs";

const GATES = ".context-index/governance/gates.yaml";
const REVIEW = ".context-index/governance/review.yaml";
const DIAGNOSTICS = ".context-index/governance/diagnostics.yaml";
const VALIDATE = ".context-index/governance/validate.yaml";
const BOUNDARIES = ".context-index/governance/boundaries.yaml";

/** Run the real CLI against `dir` as the project root. */
function runCli(dir, args) {
  const result = spawnSync("node", [join(PLUGIN_ROOT, "cli", "index.mjs"), ...args], {
    cwd: dir,
    encoding: "utf8",
    timeout: 30_000,
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

/**
 * The code lives on `err.code`, never in the message (the `mkErr` convention
 * used across this repo), so `assert.throws(fn, /REGISTRY_NOT_MATERIALIZED/)`
 * would pass only by accident. Assert the real shape.
 */
function assertRaises(fn, registryName) {
  let caught = null;
  try {
    fn();
  } catch (err) {
    caught = err;
  }
  assert.ok(caught, `expected a throw for ${registryName}, got none`);
  assert.equal(caught.code, "REGISTRY_NOT_MATERIALIZED");
  assert.match(caught.message, new RegExp(`${registryName}\\.yaml`));
  assert.match(
    caught.message,
    new RegExp(`adev governance materialize --registry ${registryName}`),
    `the remedy must name the exact command; got: ${caught.message}`,
  );
  return caught;
}

async function assertRaisesAsync(fn, registryName) {
  let caught = null;
  try {
    await fn();
  } catch (err) {
    caught = err;
  }
  assert.ok(caught, `expected a rejection for ${registryName}, got none`);
  assert.equal(caught.code, "REGISTRY_NOT_MATERIALIZED");
  assert.match(
    caught.message,
    new RegExp(`adev governance materialize --registry ${registryName}`),
  );
  return caught;
}

const REVIEW_ENTRY =
  "reviewers:\n  - id: my-reviewer\n    prompt: prompts/x.md\n";
const GATES_ENTRY =
  'gates:\n  - id: test\n    name: Test\n    command: ["npm", "test"]\n    severity: error\n';
const DIAGNOSTICS_ENTRY =
  "diagnostics:\n  - id: adev/event-schema-valid\n" +
  "    runner: plugin:tier1/event-schema-valid.mjs\n" +
  "    severity: error\n    tier: 1\n    scope: event-impact\n";

/** A minimal project: manifest present so domain resolution has something to read. */
function seedProject(dir) {
  writeFixture(dir, ".context-index/manifest.yaml", "project:\n  name: fixture\n");
  writeFixture(dir, ".context-index/prompts/x.md", "# reviewer prompt\n");
}

describe("registry marker — fail-closed loader guard", () => {
  let dir;

  beforeEach(() => {
    dir = createTempDir();
    seedProject(dir);
  });

  afterEach(() => {
    cleanupTempDir(dir);
  });

  // ── 1. Fail closed ────────────────────────────────────────────────────────

  test("a registry with entries but no marker still raises", () => {
    writeFixture(dir, REVIEW, REVIEW_ENTRY);
    assertRaises(() => loadReviewConfig(dir), "review");
  });

  test("each of the three marked registries raises independently", async () => {
    writeFixture(dir, REVIEW, REVIEW_ENTRY);
    writeFixture(dir, GATES, GATES_ENTRY);
    writeFixture(dir, DIAGNOSTICS, DIAGNOSTICS_ENTRY);

    assertRaises(() => loadReviewConfig(dir), "review");
    assertRaises(() => loadCheck1Gates(dir), "gates");
    await assertRaisesAsync(() => loadRegistry(dir), "diagnostics");

    // Marking ONE does not silence the other two — the guard is per registry,
    // not per project.
    writeFixture(dir, GATES, stampMarker(GATES_ENTRY, "2026-08-15T00:00:00Z"));
    assert.doesNotThrow(() => loadCheck1Gates(dir));
    assertRaises(() => loadReviewConfig(dir), "review");
    await assertRaisesAsync(() => loadRegistry(dir), "diagnostics");
  });

  test("an entry-level field named materialized_at does NOT satisfy the guard", () => {
    // Task 9's `readMarker` accepts only a TOP-LEVEL key. A project that stamps
    // its own rows must not be able to buy its way past the guard.
    writeFixture(
      dir,
      REVIEW,
      "reviewers:\n  - id: my-reviewer\n    prompt: prompts/x.md\n" +
        "    materialized_at: 2026-08-15T00:00:00Z\n",
    );
    assertRaises(() => loadReviewConfig(dir), "review");
  });

  test("a marked but EMPTY registry proceeds with an empty set", () => {
    // Marker present, no entries, is a legitimate materialized state: the
    // project has declared that nothing runs. Fail-closed means "never proceed
    // on an UNVOUCHED set", not "never proceed on an empty one".
    //
    // What "proceeds" means TODAY is that the loader returns; the returned set
    // still carries the bundled contributors, because run-time merging is
    // Task 11's to remove. This test pins the guard's verdict on an empty
    // marked file, not the merge.
    writeFixture(dir, REVIEW, stampMarker("reviewers: []\n", "2026-08-15T00:00:00Z"));
    const cfg = loadReviewConfig(dir);
    assert.ok(Array.isArray(cfg.reviewers));
    assert.equal(
      cfg.reviewers.filter((r) => r.__source === "project").length,
      0,
      "an empty marked registry contributes no project reviewers",
    );
  });

  // ── 2. Decidability ───────────────────────────────────────────────────────

  test("materialization is decided from the project file alone", () => {
    writeFixture(dir, REVIEW, REVIEW_ENTRY);

    // (a) No manifest at all: no domain resolves, so no overlay could
    //     contribute. The verdict must still be "not materialized".
    rmSync(join(dir, ".context-index", "manifest.yaml"), { force: true });
    assertRaises(() => loadReviewConfig(dir), "review");

    // (b) A manifest naming a shipped domain whose overlay DOES contribute
    //     reviewers. Same verdict — so the guard is not reading "is there
    //     anything else to merge?", which Task 11 is about to make an
    //     undecidable question at this point.
    writeFixture(
      dir,
      ".context-index/manifest.yaml",
      "project:\n  name: fixture\ndomain: software\n",
    );
    assertRaises(() => loadReviewConfig(dir), "review");

    // (c) Structural evidence: the guard's whole input is a path and a name.
    //     There is no parameter through which a default could reach it.
    assert.equal(assertMaterialized.length, 2);
  });

  test("an ABSENT registry file is a distinct, legitimate state and does not raise", () => {
    // A project scaffolded without a governance file declares nothing; the
    // loaders already have documented absent-file paths (review → no overlay,
    // gates → no governance layer, diagnostics → adev/registry-missing). Making
    // absence raise would brick every fresh project before Task 12 lands the
    // scaffolding, and "no file" cannot be a partially-materialized set.
    assert.doesNotThrow(() => loadReviewConfig(dir));
    assert.doesNotThrow(() => loadCheck1Gates(dir));
  });

  // ── 3. The DDR-1 exemption is real ────────────────────────────────────────

  test("validate.yaml and boundaries.yaml are exempt from the marker", async () => {
    writeFixture(dir, BOUNDARIES, "boundaries: []\n");
    writeFixture(dir, VALIDATE, "checks: []\n");
    await assert.doesNotReject(() => checkBoundaries(dir, { changed: [] }));
    assert.doesNotThrow(() => loadValidateConfig(dir));
  });

  test("assertMaterialized refuses to be pointed at an EXEMPT registry", () => {
    // A no-op guard call on an exempt registry would read like coverage while
    // enforcing nothing. Naming one is a caller defect.
    assert.throws(
      () => assertMaterialized(join(dir, VALIDATE), "validate"),
      (err) => err.code === "MARKER_INPUT_INVALID",
    );
  });

  // ── 4. Round trip ─────────────────────────────────────────────────────────

  test("the round trip closes: raise, materialize, proceed", () => {
    writeFixture(dir, REVIEW, REVIEW_ENTRY);
    assertRaises(() => loadReviewConfig(dir), "review");

    const cli = runCli(dir, ["governance", "materialize", "--registry", "review"]);
    assert.equal(cli.exitCode, 0, cli.stderr);

    assert.doesNotThrow(() => loadReviewConfig(dir));
  });

  test("the CLI surfaces the guard as exit 1 and a clean one-line remedy", () => {
    writeFixture(dir, GATES, GATES_ENTRY);
    const cli = runCli(dir, ["domain", "load-gates", "--module", "cross-cutting"]);
    assert.equal(cli.exitCode, 1, `stdout: ${cli.stdout}\nstderr: ${cli.stderr}`);
    assert.match(cli.stderr, /adev governance materialize --registry gates/);
    assert.doesNotMatch(cli.stderr, /\n\s+at /, "a stack trace must not reach the user");
    assert.equal(
      cli.stderr.trim().split("\n").length,
      1,
      `expected one line, got: ${cli.stderr}`,
    );
  });
});
