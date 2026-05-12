/**
 * Integration tests for `adev status --pipeline` (Task 11) and the
 * `--render` + `--pipeline` composite (Task 12, SA-3 exit-code rule).
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync, truncateSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";
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
  writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: pipeline-test\n");
  return tmp;
}

describe("adev status --pipeline", () => {
  let tmp;
  beforeEach(() => {
    tmp = seedProject(createTempDir());
  });
  afterEach(() => cleanupTempDir(tmp));

  it("prints an empty-result message when no specs exist; exit 0", () => {
    const res = runCli(["status", "--pipeline"], { cwd: tmp });
    assert.equal(res.status, 0);
    assert.ok(
      res.stdout.includes("No specs found"),
      `expected 'No specs found', got: ${res.stdout}`,
    );
  });

  it("prints an aligned table with Spec / Status / Current Step / Updated columns", () => {
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
    const res = runCli(["status", "--pipeline"], { cwd: tmp });
    assert.equal(res.status, 0);
    assert.ok(res.stdout.includes("Spec"), "must include Spec column header");
    assert.ok(res.stdout.includes("Status"), "must include Status column header");
    assert.ok(res.stdout.includes("Current Step"), "must include Current Step column header");
    assert.ok(res.stdout.includes("Updated"), "must include Updated column header");
    assert.ok(res.stdout.includes("alpha"), "must list alpha spec");
    assert.ok(res.stdout.includes("beta"), "must list beta spec");
  });

  it("truncates long spec paths to 40 chars with … ellipsis", () => {
    const longSlug = "x".repeat(40);
    const specPath = `.context-index/specs/.synthetic/${longSlug}.spec.md`;
    ensureLifecycleState(tmp, specPath);
    appendEvent(tmp, specPath, {
      ts: "2026-05-01T10:00:00Z",
      event: "lifecycle_step",
      step: "specify",
      status: "started",
      actor: "system",
      spec: `specs/very/long/path/with/lots/of/segments/${longSlug}.spec.md`,
    });
    const res = runCli(["status", "--pipeline"], { cwd: tmp });
    assert.equal(res.status, 0);
    assert.ok(res.stdout.includes("…"), "long path must be truncated with ellipsis");
  });
});

describe("adev status --render --pipeline composite (Task 12, SA-3)", () => {
  let tmp;
  beforeEach(() => {
    tmp = seedProject(createTempDir());
  });
  afterEach(() => cleanupTempDir(tmp));

  it("runs --render then prints divider then --pipeline; exit 0 on success", () => {
    const specPath = `.context-index/specs/.synthetic/alpha.spec.md`;
    ensureLifecycleState(tmp, specPath);
    appendEvent(tmp, specPath, {
      ts: "2026-05-01T10:00:00Z",
      event: "lifecycle_step",
      step: "specify",
      status: "started",
      actor: "system",
    });
    const res = runCli(["status", "--render", "--pipeline"], { cwd: tmp });
    assert.equal(res.status, 0, `expected exit 0, got ${res.status}: ${res.stderr}`);
    // Render half wrote alpha.md.
    assert.ok(existsSync(join(tmp, ".context-index", "lifecycle-state", "alpha.md")));
    // Pipeline half printed the table.
    assert.ok(res.stdout.includes("alpha"), "pipeline must list alpha");
    assert.ok(res.stdout.includes("Spec"), "pipeline must print header");
  });

  it("SA-3: composite exit code is the max of the two halves; advisory skips do not poison exit code", () => {
    // One valid log + one slug-allowlist-violating file.
    const dir = join(tmp, ".context-index", "lifecycle-state");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "ok.jsonl"),
      '{"event":"lifecycle_step","step":"specify","status":"started","ts":"2026-05-01T10:00:00Z"}\n',
    );
    writeFileSync(join(dir, "BAD.jsonl"), '{}\n');
    const res = runCli(["status", "--render", "--pipeline"], { cwd: tmp });
    assert.equal(res.status, 0, "advisory skips must not poison composite exit code");
  });
});
