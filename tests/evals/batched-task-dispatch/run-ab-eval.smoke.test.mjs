// tests/evals/batched-task-dispatch/run-ab-eval.smoke.test.mjs
//
// Smoke test for the [live] 2-arm harness: --dry-run must print the arm plan +
// reused-helper wiring, exit 0, and write no results. The full 2-arm run is
// [live] (agent-driven — runs /adev:implement [--no-batch]) and is not
// exercised here. Mirrors tests/evals/worktree-parallelization/run-ab-eval.smoke.test.mjs.

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

describe("batched-task-dispatch run-ab-eval --dry-run smoke", () => {
  it("prints both arms and the reused helper wiring", () => {
    const out = planDryRun();
    assert.match(out, /no-batch/);
    assert.match(out, /batched/);
    assert.match(out, /judge\(\)/);
    assert.match(out, /verifyHandoffBlocks\(\)/);
    assert.match(out, /verifyNoReadAhead\(\)/);
    assert.match(out, /verifyPerTaskReviewRounds\(\)/);
    assert.match(out, /batch=\[/);
  });

  it("exits 0 and writes no results directory", () => {
    const r = spawnSync("node", [SCRIPT, "--dry-run"], { encoding: "utf8", env: ENV });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /DRY RUN/);
    assert.equal(existsSync(join(HERE, "results")), false, "dry-run must not write results/");
  });
});
