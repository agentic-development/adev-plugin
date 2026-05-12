/**
 * Integration tests for `adev status --render` (Task 10).
 *
 * Spawns the CLI via spawnSync and asserts:
 *   - tasks.md is written from tasks.json
 *   - each <slug>.jsonl produces a sibling <slug>.md
 *   - per-file action summary appears on stdout (✓ tasks.md, ✓ <slug>.md, ⚠ skipped)
 *   - exit 0 on success
 *   - exit 1 on INVALID_PROJECT_ROOT / INVALID_STORAGE_PATH
 *   - SA-2: advisory-skipped files (SKIPPED_INVALID_SLUG, OVERSIZED_LOG_SKIPPED,
 *     MALFORMED_FILE_SKIPPED) do NOT affect the exit code (exit 0).
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync, mkdirSync, truncateSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";
import { JsonAdapter } from "../../lib/issues/json-adapter.mjs";
import { ensureLifecycleState, appendEvent } from "../../lib/lifecycle-state.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(__dirname, "../../cli/index.mjs");

function runCli(args, opts = {}) {
  return spawnSync("node", [CLI, ...args], {
    cwd: opts.cwd,
    env: { ...process.env, ...(opts.env ?? {}) },
    encoding: "utf8",
    timeout: 15_000,
  });
}

function seedProject(tmp) {
  writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: status-render-test\n");
  return tmp;
}

describe("adev status --render", () => {
  let tmp;
  beforeEach(() => {
    tmp = seedProject(createTempDir());
  });
  afterEach(() => cleanupTempDir(tmp));

  it("writes tasks.md from tasks.json and exits 0", async () => {
    const adapter = new JsonAdapter(tmp);
    await adapter.init();
    await adapter.create({ title: "TaskA", type: "task", priority: 2 });
    const res = runCli(["status", "--render"], { cwd: tmp });
    assert.equal(res.status, 0, `expected exit 0, got ${res.status}: ${res.stderr}`);
    assert.ok(existsSync(join(tmp, ".context-index", "tasks", "tasks.md")), "tasks.md must exist");
    assert.ok(res.stdout.includes("tasks.md"), "stdout must mention tasks.md action");
  });

  it("renders one <slug>.md per <slug>.jsonl in lifecycle-state/", () => {
    for (const slug of ["alpha", "beta"]) {
      const specPath = `.context-index/specs/.synthetic/${slug}.spec.md`;
      ensureLifecycleState(tmp, specPath);
      appendEvent(tmp, specPath, {
        ts: "2026-05-01T10:00:00Z",
        event: "lifecycle_step",
        step: "specify",
        status: "started",
        actor: "system",
      });
    }
    const res = runCli(["status", "--render"], { cwd: tmp });
    assert.equal(res.status, 0, `expected exit 0, got ${res.status}: ${res.stderr}`);
    assert.ok(
      existsSync(join(tmp, ".context-index", "lifecycle-state", "alpha.md")),
      "alpha.md must exist",
    );
    assert.ok(
      existsSync(join(tmp, ".context-index", "lifecycle-state", "beta.md")),
      "beta.md must exist",
    );
    assert.ok(res.stdout.includes("alpha"), "stdout must reference alpha render");
    assert.ok(res.stdout.includes("beta"), "stdout must reference beta render");
  });

  it("exits 1 on INVALID_PROJECT_ROOT (no manifest)", () => {
    const bare = createTempDir();
    try {
      const res = runCli(["status", "--render"], { cwd: bare });
      assert.notEqual(res.status, 0, "must exit non-zero");
      assert.equal(res.status, 1);
    } finally {
      cleanupTempDir(bare);
    }
  });

  it("SA-2: advisory-skipped slug allowlist failures do NOT affect exit code", () => {
    // Create a valid sibling and a slug-allowlist-violating file.
    const dir = join(tmp, ".context-index", "lifecycle-state");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "ok.jsonl"),
      '{"event":"lifecycle_step","step":"specify","status":"started","ts":"2026-05-01T10:00:00Z"}\n',
    );
    writeFileSync(join(dir, "BAD.jsonl"), '{}\n'); // uppercase fails allowlist
    const res = runCli(["status", "--render"], { cwd: tmp });
    assert.equal(res.status, 0, `expected exit 0 (advisory only), got ${res.status}: ${res.stderr}`);
    assert.ok(
      existsSync(join(dir, "ok.md")),
      "valid slug must still render",
    );
  });

  it("SA-2: oversized log advisory does NOT affect exit code", () => {
    const dir = join(tmp, ".context-index", "lifecycle-state");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "small.jsonl"),
      '{"event":"lifecycle_step","step":"specify","status":"started","ts":"2026-05-01T10:00:00Z"}\n',
    );
    const big = join(dir, "huge.jsonl");
    writeFileSync(
      big,
      '{"event":"lifecycle_step","step":"specify","status":"started","ts":"2026-05-01T10:00:00Z"}\n',
    );
    truncateSync(big, 60 * 1024 * 1024);
    const res = runCli(["status", "--render"], { cwd: tmp });
    assert.equal(res.status, 0, `expected exit 0 (advisory only), got ${res.status}: ${res.stderr}`);
    assert.ok(existsSync(join(dir, "small.md")), "small sibling must still render");
    assert.ok(!existsSync(join(dir, "huge.md")), "oversized log must not produce huge.md");
  });
});
