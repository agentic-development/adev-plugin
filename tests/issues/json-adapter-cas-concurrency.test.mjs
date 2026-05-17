import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { JsonAdapter } from "../../lib/issues/json-adapter.mjs";
import { createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHILD_PATH = join(__dirname, "_cas-concurrency-child.mjs");
const N = 10;

function runChild(projectRoot, idx) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CHILD_PATH, projectRoot, String(idx)]);
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => {
      out += d.toString();
    });
    child.stderr.on("data", (d) => {
      err += d.toString();
    });
    child.on("error", reject);
    child.on("exit", () => {
      try {
        resolve(JSON.parse(out));
      } catch (e) {
        reject(new Error(`child ${idx} produced unparseable stdout: "${out}" stderr: "${err}"`));
      }
    });
  });
}

test(`N=${N} concurrent mutators: every outcome observable, no silent loss, no orphan temp files`, async () => {
  const root = createTempDir();
  try {
    writeFixture(root, ".context-index/manifest.yaml", "tasks:\n  backend: json\n");
    // Seed an empty board so children don't race on init().
    await new JsonAdapter(root).init();

    // Spawn N children in parallel.
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) => runChild(root, i)),
    );

    // Every result is either "committed" or "stale" — no other outcome.
    const committed = results.filter((r) => r.status === "committed");
    const stale = results.filter((r) => r.status === "stale");
    assert.equal(
      committed.length + stale.length,
      N,
      `expected every outcome to be committed or stale; got ${JSON.stringify(results)}`,
    );
    for (const r of stale) {
      assert.equal(r.code, "STALE_BOARD_WRITE", `stale outcome must carry STALE_BOARD_WRITE code`);
    }

    // Read the final board.
    const board = JSON.parse(readFileSync(join(root, ".context-index/tasks/tasks.json"), "utf8"));

    // CONTRACTUAL GUARANTEE (Behavior 8): no mutation silently lost.
    // Every committed result must appear on the board.
    const committedTitles = new Set(committed.map((r) => r.title));
    const boardTitles = new Set(board.issues.map((i) => i.title));
    for (const t of committedTitles) {
      assert.ok(boardTitles.has(t), `committed title "${t}" missing from final board`);
    }

    // Board size equals committed count.
    assert.equal(
      board.issues.length,
      committed.length,
      `silent loss: ${committed.length} mutations committed but board has ${board.issues.length}`,
    );

    // seq tracks committed mutations (started at 0 from init()).
    assert.equal(
      board.seq,
      committed.length,
      `seq drift: expected seq=${committed.length}, got ${board.seq}`,
    );

    // No orphan .tmp files remain.
    const dirFiles = readdirSync(join(root, ".context-index/tasks"));
    const orphans = dirFiles.filter((f) => f.endsWith(".tmp"));
    assert.deepEqual(orphans, [], `orphan temp files left behind: ${orphans.join(", ")}`);
  } finally {
    cleanupTempDir(root);
  }
});
