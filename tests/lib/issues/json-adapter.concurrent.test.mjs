/**
 * Concurrent multi-update test for `JsonAdapter`.
 *
 * Verifies the spec's last-writer-wins semantics: N concurrent appenders
 * each spawn an independent process that creates a single issue with a
 * unique title. Because temp-then-rename is atomic at the OS level, every
 * appended write produces a complete file — but races may overwrite each
 * other (last-writer-wins).
 *
 * The assertion isn't that all N writes survive (they can't under
 * last-writer-wins) — the assertion is that:
 *
 *   1. The final `tasks.json` is always a complete, parseable document.
 *   2. At least one of the N writes survived (no full data loss).
 *   3. The file's `version` and shape remain valid.
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
      await adapter.create({ title: ${JSON.stringify(title)}, type: "task" });
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

      // All children should exit cleanly.
      for (const r of results) {
        assert.equal(r.code, 0, `child failed:\n${r.stderr}`);
      }

      // Final file must be parseable.
      const raw = readFileSync(join(dir, ".context-index", "tasks", "tasks.json"), "utf8");
      const board = JSON.parse(raw);
      assert.equal(board.version, 2);
      assert.ok(Array.isArray(board.epics));
      assert.ok(Array.isArray(board.issues));

      // At least one of the N appends must have survived. Last-writer-wins
      // means we won't necessarily see all N, but at least one is required.
      const titlesFound = new Set(board.issues.map((i) => i.title));
      const hits = titles.filter((t) => titlesFound.has(t));
      assert.ok(hits.length >= 1, `no concurrent writes survived; final board had: ${[...titlesFound].join(", ")}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
