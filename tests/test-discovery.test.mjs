import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { discoverTests, isNestedProjectFile, isLiveInfraFile } from "../scripts/run-tests.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TESTS_DIR = join(REPO_ROOT, "tests");

/**
 * Guard against the silent-shrink failure mode.
 *
 * The original `npm test` script relied on `tests/**\/*.test.mjs`, but npm
 * runs scripts through `sh`, which has no `**` — the pattern collapsed to one
 * directory deep and 77 of 416 test files were never handed to the runner.
 * Nothing failed; the suite simply reported success on a subset. These tests
 * assert that discovery covers the whole tree and that every exclusion is
 * deliberate and explainable.
 */
describe("test discovery", () => {
  /** Independent walk — deliberately does NOT reuse the runner's helper. */
  function walk(dir, out = []) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (["node_modules", ".git", "coverage", ".tmp"].includes(entry.name)) continue;
        walk(join(dir, entry.name), out);
      } else if (entry.isFile() && entry.name.endsWith(".test.mjs")) {
        out.push(relative(REPO_ROOT, join(dir, entry.name)));
      }
    }
    return out;
  }

  it("every test file on disk lands in exactly one bucket", () => {
    const onDisk = walk(TESTS_DIR).sort();
    const { files, evals, excluded, liveInfra } = discoverTests();
    const union = [...files, ...evals, ...excluded, ...liveInfra].sort();

    assert.equal(
      union.length,
      onDisk.length,
      "default + evals + excluded + liveInfra must account for every *.test.mjs on disk",
    );
    assert.deepEqual(union, onDisk, "no file may be silently dropped");
    assert.equal(new Set(union).size, union.length, "buckets must not overlap");
  });

  it("live-infra suites (real external side effects) are separated from the default gate but reachable via npm run test:integration", () => {
    const { files, liveInfra } = discoverTests();
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));

    for (const f of liveInfra) {
      assert.ok(isLiveInfraFile(join(REPO_ROOT, f)), `${f} is in the liveInfra bucket but does not match isLiveInfraFile`);
      assert.match(f, /-live\.test\.mjs$/, `${f} must use the -live.test.mjs naming convention`);
    }
    assert.ok(
      files.every((f) => !f.endsWith("-live.test.mjs")),
      "default gate must not include live-infra suites (they create real external side effects)",
    );
    assert.match(
      pkg.scripts["test:integration"] ?? "",
      /--live-infra/,
      "live-infra suites must remain runnable via an explicit npm script — excluded, not hidden",
    );
  });

  it("evals are separated from the default gate but reachable via npm run test:evals", () => {
    const { files, evals } = discoverTests();
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));

    assert.ok(evals.length > 0, "expected eval harnesses to exist");
    assert.ok(
      evals.every((f) => f.startsWith("tests/evals/")),
      "eval bucket must contain only tests/evals/ files",
    );
    assert.ok(
      files.every((f) => !f.startsWith("tests/evals/")),
      "default gate must not include eval harnesses (they need docker / API keys / local session data)",
    );
    assert.match(
      pkg.scripts["test:evals"] ?? "",
      /--evals/,
      "evals must remain runnable via an explicit npm script — excluded, not hidden",
    );
  });

  it("finds tests nested three or more directories deep (the original bug)", () => {
    const { files } = discoverTests();
    const deep = files.filter((f) => f.split("/").length >= 4);

    assert.ok(deep.length > 0, "expected deeply nested tests to exist");
    // Representative victims of the sh `**` collapse.
    for (const victim of [
      "tests/lib/issues/adapter-conformance.test.mjs",
      "tests/diagnostics/tier1/frontmatter-present.test.mjs",
    ]) {
      if (existsSync(join(REPO_ROOT, victim))) {
        assert.ok(files.includes(victim), `${victim} must be discovered`);
      }
    }
  });

  it("excludes only nested projects' own suites, and nothing else", () => {
    const { excluded } = discoverTests();
    for (const rel of excluded) {
      const abs = join(REPO_ROOT, rel);
      assert.ok(
        isNestedProjectFile(abs),
        `${rel} is excluded but is not inside a nested project's tests/ dir`,
      );
      // Every exclusion must be justified by a real nested package.json.
      let dir = dirname(abs);
      let foundProject = false;
      while (dir.startsWith(TESTS_DIR) && dir !== TESTS_DIR) {
        if (existsSync(join(dir, "package.json"))) {
          foundProject = true;
          break;
        }
        dir = dirname(dir);
      }
      assert.ok(foundProject, `${rel} excluded without an owning package.json`);
    }
  });

  it("keeps our harness files that sit at a nested project's root", () => {
    const { evals, excluded } = discoverTests();
    const harness = "tests/evals/integration-sandbox/build-with-db.test.mjs";
    if (existsSync(join(REPO_ROOT, harness))) {
      // It is ours (not the fixture's), so it must not be in `excluded` — but
      // it drives a docker Postgres, so it belongs to the opt-in eval bucket
      // rather than the default gate.
      assert.ok(
        !excluded.includes(harness),
        "a test beside a nested package.json is ours, not the fixture's",
      );
      assert.ok(evals.includes(harness), "docker-driving harness belongs to the eval bucket");
    }
  });

  it("npm test does not rely on shell glob expansion", () => {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));
    const script = pkg.scripts.test;

    assert.ok(
      !script.includes("*"),
      `npm test must not use shell globs (sh does not support **): ${script}`,
    );
    assert.match(script, /run-tests\.mjs/, "npm test should delegate discovery to the runner");
  });

  it("runs the bucket it announces (--evals and --all are not the default set)", () => {
    // Same silent-shrink failure as the glob bug, one layer up: the runner
    // computed `selected` from --evals/--all, printed "running 20 of 454", and
    // then spawned `...files` — the DEFAULT bucket. `npm run test:evals`
    // reported green having never executed a single eval harness, which is the
    // opposite of what the issue-612 split exists to guarantee.
    const src = readFileSync(join(REPO_ROOT, "scripts", "run-tests.mjs"), "utf8");
    const spawnCall = src.slice(src.indexOf("spawn(process.execPath"));

    assert.match(
      spawnCall.slice(0, 200),
      /\.\.\.selected/,
      "the runner must spawn `selected`, not a fixed bucket",
    );
    assert.doesNotMatch(
      spawnCall.slice(0, 200),
      /\.\.\.files\b/,
      "spawning `files` ignores --evals/--all and silently runs the default set",
    );
  });

  it("actually selects a different, non-empty set for --evals", () => {
    const { files, evals } = discoverTests();
    assert.ok(evals.length > 0, "the evals bucket must not be empty");
    // Non-vacuity: if the two buckets were equal, the assertion above would
    // pass while --evals still ran the default set.
    assert.notDeepEqual(
      evals,
      files,
      "the evals bucket must be a distinct set from the default gate",
    );
    for (const f of evals) {
      assert.ok(
        f.startsWith("tests/evals/"),
        `eval bucket must hold only tests/evals/ files, got ${f}`,
      );
    }
  });
});
