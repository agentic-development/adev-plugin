/**
 * Concurrent multi-update test for `JsonAdapter`.
 *
 * Verifies the CAS (compare-and-swap) semantics from the
 * concurrent-write-protection spec: N concurrent appenders each spawn an
 * independent process that creates a single issue with a unique title.
 * Every mutation runs through `_withCas`, which re-reads a fresh snapshot
 * on seq conflict and retries up to `casMaxRetries` times before throwing
 * `STALE_BOARD_WRITE`.
 *
 * Under contention the guarantees are therefore:
 *
 *   1. The final `tasks.json` is always a complete, parseable document.
 *   2. Every ACKNOWLEDGED write (child exited 0) is present in the final
 *      board — CAS never silently drops a write it confirmed.
 *   3. A child may legitimately fail, but only with `STALE_BOARD_WRITE`
 *      (retry budget exhausted) — never any other error class.
 *   4. At least one child succeeds (the winner of the first CAS race).
 *
 * (This file originally asserted pre-CAS last-writer-wins semantics —
 * "all children exit 0, at least one write survives" — which is exactly
 * backwards under CAS: exit codes may be non-zero under contention, but
 * acknowledged writes can never be lost.)
 *
 * Strategy is integration (Task 21): we spawn N child processes via
 * `node:child_process` so each gets its own fs state, then wait on all and
 * inspect the final file. Strictly local-filesystem; no external systems.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ADAPTER_PATH = resolve(__dirname, "../../../lib/issues/json-adapter.mjs");

// Distinct exit code a child uses to report a CAS retry-budget exhaustion
// (STALE_BOARD_WRITE) as opposed to an unexpected crash (exit 1).
const EXIT_STALE = 42;

function makeProject() {
  const dir = mkdtempSync(join(tmpdir(), "json-adapter-concurrent-test-"));
  mkdirSync(join(dir, ".context-index"), { recursive: true });
  writeFileSync(join(dir, ".context-index", "manifest.yaml"), "tasks:\n  backend: json\n");
  return dir;
}

/** Spawn a child that performs one `create()`. Resolves with stderr/code. */
function spawnAppender(projectRoot, title) {
  return new Promise((resolveP) => {
    const script = `
      const { JsonAdapter } = await import(${JSON.stringify(ADAPTER_PATH)});
      const adapter = new JsonAdapter(${JSON.stringify(projectRoot)});
      await adapter.init();
      try {
        await adapter.create({ title: ${JSON.stringify(title)}, type: "task" });
      } catch (err) {
        if (err && err.code === "STALE_BOARD_WRITE") process.exit(${EXIT_STALE});
        throw err;
      }
    `;
    const child = spawn(process.execPath, ["--input-type=module", "-e", script], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("close", (code) => resolveP({ code, stderr }));
  });
}

describe("JsonAdapter — concurrent multi-update (integration)", () => {
  it("survives N concurrent appenders without corrupting tasks.json", async () => {
    const N = 8;
    const dir = makeProject();
    try {
      // Bootstrap empty board so concurrent appenders skip init() race.
      const { JsonAdapter } = await import(ADAPTER_PATH);
      const seed = new JsonAdapter(dir);
      await seed.init();

      const titles = Array.from({ length: N }, (_, i) => `concurrent-${i + 1}`);
      const results = await Promise.all(titles.map((t) => spawnAppender(dir, t)));

      // Children may only exit 0 (write acknowledged) or EXIT_STALE
      // (CAS retry budget exhausted) — anything else is a crash.
      for (const r of results) {
        assert.ok(
          r.code === 0 || r.code === EXIT_STALE,
          `child crashed (code ${r.code}, expected 0 or ${EXIT_STALE}):\n${r.stderr}`
        );
      }

      // Final file must be parseable.
      const raw = readFileSync(join(dir, ".context-index", "tasks", "tasks.json"), "utf8");
      const board = JSON.parse(raw);
      assert.equal(board.version, 2);
      assert.ok(Array.isArray(board.epics));
      assert.ok(Array.isArray(board.issues));

      // The CAS guarantee: every ACKNOWLEDGED write is present. No silent loss.
      const titlesFound = new Set(board.issues.map((i) => i.title));
      const acknowledged = titles.filter((_, i) => results[i].code === 0);
      for (const t of acknowledged) {
        assert.ok(titlesFound.has(t), `acknowledged write lost: ${t}`);
      }

      // At least one child must win the race outright.
      assert.ok(acknowledged.length >= 1, "no concurrent writes succeeded at all");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
