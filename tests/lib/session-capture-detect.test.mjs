/**
 * Tests for `detectExistingCapture(projectRoot)` in `lib/session-capture.mjs`.
 *
 * Charter Domain Model defaults:
 *   - new project (no signals) → `existing: false`, defaults to `hook, true`
 *   - existing project (any signal) → `existing: true`, defaults to `post-commit, false`
 *
 * Signal sources:
 *   - post-commit-sentinel-block: paired `# >>> adev:session-capture >>>` markers
 *   - post-commit-legacy-signature: legacy capture without sentinels (pre-rev-2)
 *   - tracked-sessions: any `.context-index/sessions/*.md` exists
 */

import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { detectExistingCapture } from "../../lib/session-capture.mjs";

function makeProject() {
  const dir = mkdtempSync(join(tmpdir(), "adev-detect-"));
  return dir;
}

test("detectExistingCapture returns existing:false on a bare temp dir", async () => {
  const dir = makeProject();
  const result = await detectExistingCapture(dir);
  assert.deepStrictEqual(result, { existing: false, signals: [] });
});

test("detectExistingCapture detects post-commit sentinel block", async () => {
  const dir = makeProject();
  mkdirSync(join(dir, ".githooks"), { recursive: true });
  writeFileSync(
    join(dir, ".githooks", "post-commit"),
    [
      "#!/usr/bin/env bash",
      "set -e",
      "# >>> adev:session-capture >>>",
      "# capture body",
      "# <<< adev:session-capture <<<",
    ].join("\n"),
  );

  const result = await detectExistingCapture(dir);
  assert.strictEqual(result.existing, true);
  assert.ok(
    result.signals.includes("post-commit-sentinel-block"),
    `signals: ${JSON.stringify(result.signals)}`,
  );
});

test("detectExistingCapture detects legacy capture signature (no sentinels)", async () => {
  const dir = makeProject();
  mkdirSync(join(dir, ".githooks"), { recursive: true });
  writeFileSync(
    join(dir, ".githooks", "post-commit"),
    [
      "#!/usr/bin/env bash",
      "# session-capture legacy block",
      "OUTPUT_DIR=\".context-index/sessions\"",
      "node lib/session-summary.mjs \"$OUTPUT_DIR\"",
    ].join("\n"),
  );

  const result = await detectExistingCapture(dir);
  assert.strictEqual(result.existing, true);
  assert.ok(
    result.signals.includes("post-commit-legacy-signature"),
    `signals: ${JSON.stringify(result.signals)}`,
  );
});

test("detectExistingCapture detects tracked sessions files", async () => {
  const dir = makeProject();
  mkdirSync(join(dir, ".context-index", "sessions"), { recursive: true });
  writeFileSync(
    join(dir, ".context-index", "sessions", "2024-01-01-abc1234.md"),
    "---\ndate: 2024-01-01\n---\n\nbody\n",
  );

  const result = await detectExistingCapture(dir);
  assert.strictEqual(result.existing, true);
  assert.ok(
    result.signals.includes("tracked-sessions"),
    `signals: ${JSON.stringify(result.signals)}`,
  );
});

test("detectExistingCapture collects multiple signals", async () => {
  const dir = makeProject();
  mkdirSync(join(dir, ".githooks"), { recursive: true });
  writeFileSync(
    join(dir, ".githooks", "post-commit"),
    "# >>> adev:session-capture >>>\n# <<< adev:session-capture <<<\n",
  );
  mkdirSync(join(dir, ".context-index", "sessions"), { recursive: true });
  writeFileSync(
    join(dir, ".context-index", "sessions", "2024-01-01-deadbee.md"),
    "x",
  );

  const result = await detectExistingCapture(dir);
  assert.strictEqual(result.existing, true);
  assert.ok(result.signals.includes("post-commit-sentinel-block"));
  assert.ok(result.signals.includes("tracked-sessions"));
});

test("detectExistingCapture is pure (never writes)", async () => {
  // Mostly aspirational — but verify the function does not create directories
  // that did not previously exist.
  const dir = makeProject();
  const { existsSync } = await import("node:fs");
  await detectExistingCapture(dir);
  assert.strictEqual(existsSync(join(dir, ".context-index")), false);
  assert.strictEqual(existsSync(join(dir, ".githooks")), false);
});
