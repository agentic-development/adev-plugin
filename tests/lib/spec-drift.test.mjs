/**
 * Tests for lib/spec-drift.mjs
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scanForDrift, stampDrift, clearDrift, hasDrift } from "../../lib/spec-drift.mjs";
import { readEvents, _clearEventDiagnosticsRegistryCache } from "../../lib/lifecycle-state.mjs";

/**
 * Helper: create a temp project directory with a minimal .context-index/
 * scaffold (manifest.yaml + specs/ directory). Required for any test that
 * exercises stampDrift / clearDrift now that they emit lifecycle JSONL
 * events (jsonl-drift-events.spec.md Behavior 1).
 */
function makeTempProject() {
  const root = mkdtempSync(join(tmpdir(), "drift-test-"));
  mkdirSync(join(root, ".context-index"), { recursive: true });
  writeFileSync(join(root, ".context-index", "manifest.yaml"), "domain: software\n");
  mkdirSync(join(root, ".context-index", "specs"), { recursive: true });
  // Per-test registry cache must be cleared so manifest reads stay fresh
  // across temp roots (event-diagnostics caches per resolved projectRoot).
  _clearEventDiagnosticsRegistryCache();
  return root;
}

/**
 * Helper: write a file inside a project root.
 */
function writeFile(root, relPath, content) {
  const full = join(root, relPath);
  mkdirSync(join(root, relPath, ".."), { recursive: true });
  writeFileSync(full, content);
  return relPath;
}

/**
 * Helper: create a properly-named spec file at .context-index/specs/<name>.spec.md
 * with optional source-manifest. Returns the absolute path.
 */
function makeSpec(root, slug, { sourceManifestFiles = [], drift = null } = {}) {
  const lines = ["---", "title: " + slug, "status: review-passed"];
  if (sourceManifestFiles.length > 0) {
    lines.push("source-manifest:");
    lines.push("  sha: \"abc1234\"");
    lines.push("  files:");
    for (const f of sourceManifestFiles) lines.push("    - " + f);
    lines.push("  computed-at: \"2026-04-01T12:00:00Z\"");
  }
  if (drift && drift.detected) {
    lines.push("drift_detected: true");
    if (drift.source) lines.push("drift_source: " + drift.source);
    if (drift.at) lines.push("drift_at: " + drift.at);
  }
  lines.push("---", "", "# " + slug);
  const specPath = join(root, ".context-index", "specs", slug + ".spec.md");
  writeFile(root, join(".context-index", "specs", slug + ".spec.md"), lines.join("\n"));
  return specPath;
}

describe("scanForDrift", () => {
  let root;

  before(() => {
    root = makeTempProject();

    // Spec with source manifest tracking lib/foo.mjs
    writeFile(root, ".context-index/specs/features/auth/login.spec.md", [
      "---",
      "type: live-spec",
      "title: Login",
      "source-manifest:",
      '  sha: "abc1234"',
      "  files:",
      "    - lib/foo.mjs",
      "    - tests/foo.test.mjs",
      '  computed-at: "2026-04-01T12:00:00Z"',
      "---",
      "",
      "# Login",
    ].join("\n"));

    // Second spec also tracking lib/foo.mjs (shared file)
    writeFile(root, ".context-index/specs/features/dashboard/widgets.spec.md", [
      "---",
      "type: live-spec",
      "title: Widgets",
      "source-manifest:",
      '  sha: "def5678"',
      "  files:",
      "    - lib/foo.mjs",
      "    - lib/widgets.mjs",
      '  computed-at: "2026-04-02T10:00:00Z"',
      "---",
      "",
      "# Widgets",
    ].join("\n"));

    // Spec without source-manifest
    writeFile(root, ".context-index/specs/features/auth/session.spec.md", [
      "---",
      "type: live-spec",
      "title: Session",
      "status: draft",
      "---",
      "",
      "# Session",
    ].join("\n"));

    // Spec with malformed frontmatter
    writeFile(root, ".context-index/specs/features/auth/broken.spec.md", [
      "---",
      "type: live-spec",
      "title: Broken",
      "source-manifest: [invalid yaml that breaks",
      "---",
      "",
      "# Broken",
    ].join("\n"));
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("returns matching specs when file is tracked by source manifest", async () => {
    const results = await scanForDrift("lib/foo.mjs", root);
    assert.ok(results.length >= 1);
    const specPaths = results.map(r => r.specPath);
    assert.ok(specPaths.some(p => p.includes("login.spec.md")));
  });

  it("returns empty array when file is not tracked", async () => {
    const results = await scanForDrift("untracked.mjs", root);
    assert.deepEqual(results, []);
  });

  it("returns multiple specs when file is tracked by multiple specs", async () => {
    const results = await scanForDrift("lib/foo.mjs", root);
    assert.equal(results.length, 2);
    const specPaths = results.map(r => r.specPath);
    assert.ok(specPaths.some(p => p.includes("login.spec.md")));
    assert.ok(specPaths.some(p => p.includes("widgets.spec.md")));
  });

  it("skips specs with malformed frontmatter", async () => {
    // Should not throw even though broken.md has bad frontmatter
    const results = await scanForDrift("lib/foo.mjs", root);
    assert.ok(Array.isArray(results));
  });

  it("skips specs without source-manifest block", async () => {
    // session.md has no source-manifest, should not appear in results
    const results = await scanForDrift("some-untracked.mjs", root);
    assert.deepEqual(results, []);
  });

  it("returns empty when context-index does not exist", async () => {
    const emptyRoot = makeTempProject();
    const results = await scanForDrift("lib/foo.mjs", emptyRoot);
    assert.deepEqual(results, []);
    rmSync(emptyRoot, { recursive: true, force: true });
  });
});

describe("stampDrift", () => {
  let root;
  let specPath;

  before(() => {
    root = makeTempProject();
    specPath = makeSpec(root, "test-spec", { sourceManifestFiles: ["lib/foo.mjs", "lib/bar.mjs"] });
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("writes drift_detected boolean to frontmatter", async () => {
    await stampDrift(specPath, "lib/foo.mjs");
    const content = readFileSync(specPath, "utf-8");
    assert.ok(content.includes("drift_detected: true"));
  });

  it("re-stamp keeps a single drift_detected line (idempotent boolean)", async () => {
    await stampDrift(specPath, "lib/bar.mjs");
    const content = readFileSync(specPath, "utf-8");
    const matches = content.match(/drift_detected/g);
    assert.equal(matches.length, 1);
  });

  it("appends a code_drift_detected JSONL event with drift_source and drift_at (jsonl-drift-events Behavior 1)", async () => {
    const fresh = makeSpec(root, "fresh-evt", { sourceManifestFiles: ["lib/foo.mjs"] });
    await stampDrift(fresh, "lib/foo.mjs");
    const events = readEvents(root, fresh).filter(e => e.event === "code_drift_detected");
    assert.equal(events.length, 1);
    assert.equal(events[0].drift_source, "lib/foo.mjs");
    assert.match(events[0].drift_at, /^\d{4}-\d{2}-\d{2}T/);
  });

  it("canonicalizes a non-canonical driftSource path before emitting", async () => {
    const fresh = makeSpec(root, "canon-evt", { sourceManifestFiles: ["lib/foo.mjs"] });
    await stampDrift(fresh, "lib/bar/../foo.mjs");
    const events = readEvents(root, fresh).filter(e => e.event === "code_drift_detected");
    assert.equal(events.at(-1).drift_source, "lib/foo.mjs");
  });

  it("rejects a driftSource that resolves outside projectRoot with PATH_TRAVERSAL_REJECTED", async () => {
    const fresh = makeSpec(root, "traversal-evt", { sourceManifestFiles: ["lib/foo.mjs"] });
    await assert.rejects(
      () => stampDrift(fresh, "../../etc/passwd"),
      (err) => err && err.code === "PATH_TRAVERSAL_REJECTED",
    );
    const events = readEvents(root, fresh).filter(e => e.event === "code_drift_detected");
    assert.equal(events.length, 0);
  });

  it("subsequent stamps on an already-drifted spec are no-ops (idempotent JSONL emit)", async () => {
    const fresh = makeSpec(root, "multi-evt", { sourceManifestFiles: ["a.mjs", "b.mjs", "c.mjs"] });
    await stampDrift(fresh, "a.mjs");
    await stampDrift(fresh, "b.mjs");
    await stampDrift(fresh, "c.mjs");
    const events = readEvents(root, fresh).filter(e => e.event === "code_drift_detected");
    assert.deepEqual(events.map(e => e.drift_source), ["a.mjs"]);
  });

  it("clearDrift re-arms stamping — next stamp after clear emits a new event", async () => {
    const fresh = makeSpec(root, "rearm-evt", { sourceManifestFiles: ["a.mjs", "b.mjs"] });
    await stampDrift(fresh, "a.mjs");
    await clearDrift(fresh);
    await stampDrift(fresh, "b.mjs");
    const events = readEvents(root, fresh).filter(e => e.event === "code_drift_detected");
    assert.deepEqual(events.map(e => e.drift_source), ["a.mjs", "b.mjs"]);
  });

  it("no longer writes drift_source or drift_at to spec frontmatter (Migration Step 3)", async () => {
    const fresh = makeSpec(root, "step3-stamp", { sourceManifestFiles: ["a.mjs"] });
    await stampDrift(fresh, "a.mjs");
    const content = readFileSync(fresh, "utf-8");
    assert.match(content, /^drift_detected:\s*true$/m);
    assert.doesNotMatch(content, /^drift_source:/m);
    assert.doesNotMatch(content, /^drift_at:/m);
  });
});

describe("clearDrift", () => {
  let root;

  before(() => {
    root = makeTempProject();
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("removes the drift_detected inline boolean from frontmatter", async () => {
    const specPath = makeSpec(root, "drifted", {
      sourceManifestFiles: ["lib/foo.mjs"],
      drift: { detected: true, source: "lib/foo.mjs", at: "2026-05-01T10:00:00.000Z" },
    });
    await clearDrift(specPath);
    const content = readFileSync(specPath, "utf-8");
    assert.ok(!content.includes("drift_detected"));
  });

  it("is a no-op on specs without drift fields (no JSONL emit either)", async () => {
    const specPath = makeSpec(root, "clean-clear", { sourceManifestFiles: ["lib/foo.mjs"] });
    const original = readFileSync(specPath, "utf-8");
    await clearDrift(specPath);
    const content = readFileSync(specPath, "utf-8");
    assert.equal(content, original);
  });

  it("preserves other frontmatter fields", async () => {
    const specPath = makeSpec(root, "preserve-clear", {
      sourceManifestFiles: ["lib/foo.mjs"],
      drift: { detected: true, source: "lib/foo.mjs", at: "2026-05-01T10:00:00.000Z" },
    });
    await clearDrift(specPath);
    const content = readFileSync(specPath, "utf-8");
    assert.ok(content.includes("title: preserve-clear"));
    assert.ok(content.includes("status: review-passed"));
    assert.ok(!content.includes("drift_detected"));
  });

  it("appends a code_drift_cleared JSONL event AND removes the inline boolean (jsonl-drift-events Behavior 3)", async () => {
    const specPath = makeSpec(root, "cleared-evt", { sourceManifestFiles: ["lib/foo.mjs"] });
    await stampDrift(specPath, "lib/foo.mjs");
    await clearDrift(specPath);
    const events = readEvents(root, specPath);
    const cleared = events.filter(e => e.event === "code_drift_cleared");
    assert.equal(cleared.length, 1);
    assert.match(cleared[0].drift_at, /^\d{4}-\d{2}-\d{2}T/);
    const content = readFileSync(specPath, "utf-8");
    assert.doesNotMatch(content, /^drift_detected:/m);
  });

  it("no longer mutates drift_source or drift_at in frontmatter (Migration Step 3)", async () => {
    const specPath = makeSpec(root, "step3-clear", { sourceManifestFiles: ["lib/foo.mjs"] });
    await stampDrift(specPath, "lib/foo.mjs");
    await clearDrift(specPath);
    const content = readFileSync(specPath, "utf-8");
    assert.doesNotMatch(content, /^drift_(detected|source|at):/m);
  });
});

describe("stampDrift concurrency (SEC-6: per-spec lock-scope)", () => {
  let root;

  before(() => {
    root = makeTempProject();
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("concurrent stampDrift calls on different specs proceed in parallel (per-spec lock-scope)", async () => {
    const specA = makeSpec(root, "lock-spec-a", { sourceManifestFiles: ["lib/a.mjs"] });
    const specB = makeSpec(root, "lock-spec-b", { sourceManifestFiles: ["lib/b.mjs"] });
    const start = Date.now();
    await Promise.all([
      stampDrift(specA, "lib/a.mjs"),
      stampDrift(specB, "lib/b.mjs"),
    ]);
    const elapsed = Date.now() - start;
    // appendFileSync with O_APPEND is per-file, so different specs never block
    // each other. A global lock would serialize and roughly double the wall
    // time. 500ms is a generous ceiling for two stamps on independent files.
    assert.ok(
      elapsed < 500,
      `Concurrent stamps on different specs took ${elapsed}ms — suggests a global lock`,
    );
    // Both stamps must have landed.
    const evA = readEvents(root, specA).filter(e => e.event === "code_drift_detected");
    const evB = readEvents(root, specB).filter(e => e.event === "code_drift_detected");
    assert.equal(evA.length, 1);
    assert.equal(evB.length, 1);
  });

  it("concurrent stampDrift calls on the same spec produce exactly one event (idempotency under contention)", async () => {
    const specPath = makeSpec(root, "lock-same-spec", { sourceManifestFiles: ["a.mjs", "b.mjs"] });
    await Promise.all([
      stampDrift(specPath, "a.mjs"),
      stampDrift(specPath, "b.mjs"),
    ]);
    const events = readEvents(root, specPath).filter(e => e.event === "code_drift_detected");
    // Whichever call won the lock first transitions clean → drifted and emits
    // its event; the loser sees `drift_detected: true` and no-ops. Source can
    // be either "a.mjs" or "b.mjs" depending on scheduling.
    assert.equal(events.length, 1, "exactly one event lands under contention");
    assert.ok(["a.mjs", "b.mjs"].includes(events[0].drift_source));
  });
});

describe("hasDrift", () => {
  let root;

  before(() => {
    root = makeTempProject();
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("returns true when drift_detected is true", async () => {
    const specPath = makeSpec(root, "drifted-has", {
      sourceManifestFiles: ["lib/foo.mjs"],
      drift: { detected: true, source: "lib/foo.mjs", at: "2026-05-01T10:00:00.000Z" },
    });
    const result = await hasDrift(specPath);
    assert.equal(result, true);
  });

  it("returns false when drift_detected is absent", async () => {
    const specPath = makeSpec(root, "clean-has", { sourceManifestFiles: ["lib/foo.mjs"] });
    const result = await hasDrift(specPath);
    assert.equal(result, false);
  });

  it("returns false when drift_detected is false", async () => {
    // Manually create a spec with explicit false (makeSpec only emits drift fields when detected:true)
    const specPath = join(root, ".context-index", "specs", "explicit-false.spec.md");
    writeFile(root, join(".context-index", "specs", "explicit-false.spec.md"), [
      "---",
      "title: Explicit False",
      "drift_detected: false",
      "---",
      "",
      "# Explicit False",
    ].join("\n"));
    const result = await hasDrift(specPath);
    assert.equal(result, false);
  });

  it("returns false for specs with malformed frontmatter", async () => {
    const specPath = join(root, ".context-index", "specs", "malformed.spec.md");
    writeFile(root, join(".context-index", "specs", "malformed.spec.md"), "No frontmatter at all\n# Just markdown\n");
    const result = await hasDrift(specPath);
    assert.equal(result, false);
  });
});
