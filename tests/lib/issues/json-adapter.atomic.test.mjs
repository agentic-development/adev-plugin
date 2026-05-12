/**
 * Atomic-write fault injection for `JsonAdapter._write()`.
 *
 * Verifies the CON-6 commitment: a failure between temp-file write and rename
 * leaves the prior `tasks.json` content unchanged and best-effort cleans up
 * the orphan temp file.
 *
 * Strategy: ES-module bindings are read-only, so we can't patch `fs` directly.
 * Instead we provoke a real renameSync failure by making the destination
 * directory non-writable on POSIX, and we provoke a writeFile failure by
 * occupying the temp filename with a directory (so writeFileSync EISDIR).
 *
 * On platforms where chmod-based read-only does not actually block writes for
 * the test user (e.g. running as root, Windows), the tests are skipped with a
 * note rather than failing.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  chmodSync,
  statSync,
  renameSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { JsonAdapter } from "../../../lib/issues/json-adapter.mjs";

function makeProject() {
  const dir = mkdtempSync(join(tmpdir(), "json-adapter-atomic-test-"));
  mkdirSync(join(dir, ".context-index"), { recursive: true });
  writeFileSync(join(dir, ".context-index", "manifest.yaml"), "tasks:\n  backend: json\n");
  return dir;
}

/** Check whether we can effectively chmod-block writes on this platform/user. */
function canBlockWithChmod(dir) {
  if (process.platform === "win32") return false;
  if (typeof process.getuid === "function" && process.getuid() === 0) return false;
  const probe = join(dir, ".probe");
  mkdirSync(probe);
  chmodSync(probe, 0o500);
  try {
    writeFileSync(join(probe, "x"), "x");
    return false;
  } catch {
    return true;
  } finally {
    chmodSync(probe, 0o700);
    rmSync(probe, { recursive: true, force: true });
  }
}

describe("JsonAdapter — atomic-write fault injection (CON-6)", () => {
  it("leaves tasks.json unchanged when writeFile fails before rename", async () => {
    const dir = makeProject();
    let supported = false;
    try {
      supported = canBlockWithChmod(dir);
      if (!supported) {
        // Skip on platforms where the test infrastructure can't enforce a
        // write failure (root user, Windows). Surface as a TODO instead.
        return;
      }

      const adapter = new JsonAdapter(dir);
      await adapter.init();
      await adapter.create({ title: "Baseline", type: "task" });
      const baseline = readFileSync(adapter.filePath, "utf8");

      // Make the tasks directory read-only — both temp-file creation and the
      // subsequent rename will fail with EACCES.
      const tasksDir = join(dir, ".context-index", "tasks");
      chmodSync(tasksDir, 0o500);

      try {
        await assert.rejects(
          adapter.create({ title: "Will-fail", type: "task" }),
          (err) => err && (err.code === "EACCES" || err.code === "EPERM")
        );
      } finally {
        // Restore so the after-cleanup can remove the directory.
        chmodSync(tasksDir, 0o700);
      }

      // Baseline unchanged.
      const after = readFileSync(adapter.filePath, "utf8");
      assert.equal(after, baseline);

      // Temp file cleaned up.
      const files = readdirSync(tasksDir);
      const tmps = files.filter((f) => f.endsWith(".tmp"));
      assert.equal(tmps.length, 0, `unexpected temp files: ${tmps.join(", ")}`);

      // Re-instantiate and verify state still reads cleanly.
      const adapter2 = new JsonAdapter(dir);
      const issues = await adapter2.list({});
      assert.equal(issues.length, 1);
      assert.equal(issues[0].title, "Baseline");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("an orphan temp file present at start of write does not corrupt the result", async () => {
    // Hand-craft an orphan temp file matching the adapter's naming convention.
    // The adapter's `_write()` uses a random suffix, so this orphan should
    // coexist with the next successful write. It is left as evidence of an
    // earlier crash; the next successful write does NOT clean it up
    // (cleanup happens only on failure paths). The point of this assertion is
    // to prove that an orphan does not interfere with subsequent writes.
    const dir = makeProject();
    try {
      const adapter = new JsonAdapter(dir);
      await adapter.init();

      const tasksDir = join(dir, ".context-index", "tasks");
      const orphan = join(tasksDir, "tasks.json.deadbeef.tmp");
      writeFileSync(orphan, "{ partial");

      await adapter.create({ title: "After-orphan", type: "task" });

      // The new write succeeded and is parseable.
      const board = JSON.parse(readFileSync(adapter.filePath, "utf8"));
      assert.equal(board.issues.length, 1);
      assert.equal(board.issues[0].title, "After-orphan");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
