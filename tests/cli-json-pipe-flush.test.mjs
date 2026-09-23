/**
 * Regression test for large --json output being truncated when the CLI's
 * stdout is a real OS pipe (e.g. `adev <verb> --json | some-consumer`).
 *
 * spawnSync's captured stdout deliberately is NOT used here: its socketpair
 * is large enough to absorb payloads well past 64 KiB, which is exactly why
 * this defect shipped undetected under the existing spawnSync-based E2E
 * suite. This test shells out through a genuine pipe (`| wc -c`) so the
 * fixture data crosses a real, small OS pipe buffer.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "child_process";
import { writeFileSync } from "fs";
import { join } from "path";
import { createTempDir, cleanupTempDir, PLUGIN_ROOT } from "./helpers.mjs";

// Comfortably past the 64 KiB (65536-byte) pipe-buffer boundary that
// truncated output pre-fix.
const PAYLOAD_LEN = 200_000;

describe("CLI dispatch — stdout flush on pipe (VERB_REGISTRY funnel)", () => {
  let tempDir;
  let harnessPath;
  let expectedBytes;

  beforeEach(() => {
    tempDir = createTempDir();
    harnessPath = join(tempDir, "harness.mjs");

    const cliIndexPath = join(PLUGIN_ROOT, "cli", "index.mjs").replace(/\\/g, "\\\\");
    const payload = JSON.stringify({ payload: "x".repeat(PAYLOAD_LEN) });
    expectedBytes = Buffer.byteLength(payload + "\n", "utf8");

    // Registers a synthetic new-contract verb directly on the real
    // VERB_REGISTRY/dispatch exported by cli/index.mjs, so this exercises
    // the actual centralized exit path rather than a copy of it.
    writeFileSync(
      harnessPath,
      `import { dispatch, VERB_REGISTRY } from ${JSON.stringify(cliIndexPath)};\n` +
        `VERB_REGISTRY.set("_pipe-flush-fixture", () => ({\n` +
        `  run: async () => {\n` +
        `    console.log(${JSON.stringify(payload)});\n` +
        `    return 0;\n` +
        `  },\n` +
        `}));\n` +
        `await dispatch(["node", "harness.mjs", "_pipe-flush-fixture"]);\n`,
      "utf8",
    );
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it("delivers the full byte length through a real pipe, not just a captured buffer", () => {
    const wcOutput = execSync(`node ${JSON.stringify(harnessPath)} | wc -c`, {
      encoding: "utf8",
      timeout: 30_000,
    });
    const actualBytes = parseInt(wcOutput.trim(), 10);

    assert.equal(
      actualBytes,
      expectedBytes,
      `expected ${expectedBytes} bytes to cross the pipe, got ${actualBytes} ` +
        `(truncation at 65536 indicates process.exit() raced ahead of a pending stdout write)`,
    );
  });
});
