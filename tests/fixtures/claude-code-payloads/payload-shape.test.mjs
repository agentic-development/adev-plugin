/**
 * Shape-assertion tests for the pinned Claude Code payload fixtures (SA-9).
 * Catches upstream-rename or key-removal without requiring a hook to fire.
 */

import { test } from "node:test";
import assert from "node:assert";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("SessionEnd v1 fixture has the four documented keys", async () => {
  const raw = await readFile(join(__dirname, "session-end-v1.json"), "utf8");
  const payload = JSON.parse(raw);
  for (const key of ["session_id", "transcript_path", "cwd", "reason"]) {
    assert.ok(key in payload, `missing key ${key}`);
    assert.strictEqual(typeof payload[key], "string", `${key} should be string`);
  }
});

test("PreCompact v1 fixture has the three documented keys", async () => {
  const raw = await readFile(join(__dirname, "pre-compact-v1.json"), "utf8");
  const payload = JSON.parse(raw);
  for (const key of ["session_id", "transcript_path", "cwd"]) {
    assert.ok(key in payload, `missing key ${key}`);
    assert.strictEqual(typeof payload[key], "string", `${key} should be string`);
  }
});

test("Both fixtures use values that pass our validators", async () => {
  const { validateSessionId } = await import("../../../lib/session-capture.mjs");

  for (const name of ["session-end-v1.json", "pre-compact-v1.json"]) {
    const raw = await readFile(join(__dirname, name), "utf8");
    const payload = JSON.parse(raw);
    assert.strictEqual(
      validateSessionId(payload.session_id),
      true,
      `${name}: session_id must match SEC-2 charset`,
    );
    assert.match(payload.transcript_path, /\.jsonl$/, `${name}: .jsonl extension`);
  }
});
