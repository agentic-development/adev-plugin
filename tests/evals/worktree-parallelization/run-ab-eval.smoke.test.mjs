// tests/evals/worktree-parallelization/run-ab-eval.smoke.test.mjs
//
// Smoke test for the [live] 3-arm harness: --dry-run must print the arm plan +
// helper wiring, exit 0, and write no results. The full 3-arm run is [live]
// (agent-driven) and is not exercised here.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { planDryRun } from "./run-ab-eval.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "run-ab-eval.mjs");
const ENV = { ...process.env, NODE_OPTIONS: "" };

describe("run-ab-eval --dry-run smoke", () => {
  it("prints the 3 arms and the helper wiring", () => {
    const out = planDryRun();
    assert.match(out, /serialA/);
    assert.match(out, /serialB/);
    assert.match(out, /parallel/);
    assert.match(out, /control \(determinism gate\)/);
    assert.match(out, /judge\(\)/);
    assert.match(out, /assertNoOrphans\(\)/);
    // fixture group shape surfaced
    assert.match(out, /independent=\[/);
    assert.match(out, /sequential=\[/);
  });

  it("exits 0 and writes no results directory", () => {
    const r = spawnSync("node", [SCRIPT, "--dry-run"], { encoding: "utf8", env: ENV });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /DRY RUN/);
    assert.equal(existsSync(join(HERE, "results")), false, "dry-run must not write results/");
  });
});
