// `adev test-policy strategy` resolves a task's test strategy and its profile
// file. The resolver (lib/test-strategies/assignment.mjs) and profile loader
// (profiles.mjs) existed with no CLI verb, so /adev:plan and /adev:write-test
// could only describe them in prose, and /adev:implement never passed a
// strategy profile to the implementer at all.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join, dirname, resolve as resolvePath, basename } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";

const CLI = resolvePath(dirname(fileURLToPath(import.meta.url)), "..", "..", "cli", "index.mjs");
const SPEC = ".context-index/specs/features/demo/x.spec.md";

function run(cwd, ...args) {
  const r = spawnSync("node", [CLI, "test-policy", "strategy", ...args], { cwd, encoding: "utf8" });
  return { status: r.status, stderr: r.stderr, out: r.status === 0 ? JSON.parse(r.stdout) : null };
}

async function seed(dir, { manifest = "modules: []\n", specFrontmatter = "", planBody }) {
  await writeFixture(dir, ".context-index/manifest.yaml", manifest);
  await writeFixture(dir, SPEC, `---\n${specFrontmatter}---\n# X\n`);
  await writeFixture(dir, "p.plan.md", `> **Spec:** ${SPEC}\n\n${planBody}`);
}

test("a strategy the plan recorded for the task wins, and its profile file exists", async () => {
  const dir = await createTempDir();
  try {
    await seed(dir, {
      planBody: "### Task 1: Add column\n\n**Strategy:** schema (source: detected, confidence: high)\n**Files:**\n- Create: `migrations/001.sql`\n",
    });
    const r = run(dir, "--plan", "p.plan.md", "--task-id", "t1");
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.out.strategy_id, "schema");
    assert.equal(r.out.source, "plan");
    assert.equal(basename(r.out.profile_path), "schema.md");
    assert.ok(existsSync(r.out.profile_path));
  } finally {
    await cleanupTempDir(dir);
  }
});

test("without a recorded strategy, manifest test_strategies paths decide", async () => {
  const dir = await createTempDir();
  try {
    await seed(dir, {
      manifest: "modules: []\ntest_strategies:\n  - strategy_id: contract\n    paths: [\"contracts/**\"]\n",
      planBody: "### Task 1: Add contract\n\n**Files:**\n- Create: `contracts/orders.json`\n",
    });
    const r = run(dir, "--plan", "p.plan.md", "--task-id", "t1");
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.out.strategy_id, "contract");
    assert.equal(r.out.source, "manifest");
  } finally {
    await cleanupTempDir(dir);
  }
});

test("a spec-declared test_strategy beats path matching", async () => {
  const dir = await createTempDir();
  try {
    await seed(dir, {
      specFrontmatter: "test_strategy: integration\n",
      planBody: "### Task 1: Thing\n\n**Files:**\n- Create: `src/thing.ts`\n",
    });
    const r = run(dir, "--plan", "p.plan.md", "--task-id", "t1");
    assert.equal(r.out.strategy_id, "integration");
    assert.equal(r.out.source, "spec-declared");
  } finally {
    await cleanupTempDir(dir);
  }
});

test("an unknown recorded strategy falls through with a warning instead of failing", async () => {
  const dir = await createTempDir();
  try {
    await seed(dir, { planBody: "### Task 1: Thing\n\n**Strategy:** bogus\n**Files:**\n- Create: `src/thing.ts`\n" });
    const r = run(dir, "--plan", "p.plan.md", "--task-id", "t1");
    assert.equal(r.status, 0, r.stderr);
    assert.notEqual(r.out.strategy_id, "bogus");
    assert.ok(r.out.warnings.some((w) => /bogus/.test(w)));
  } finally {
    await cleanupTempDir(dir);
  }
});

test("--files resolves a task that is not in a plan yet (the form /adev:plan uses)", async () => {
  const dir = await createTempDir();
  try {
    await writeFixture(dir, ".context-index/manifest.yaml", "modules: []\n");
    const r = run(dir, "--files", "src/a.ts,tests/a.test.ts");
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.out.strategy_id, "unit");
    assert.equal(basename(r.out.profile_path), "unit.md");
  } finally {
    await cleanupTempDir(dir);
  }
});

test("neither --plan/--task-id nor --files is a usage error", async () => {
  const dir = await createTempDir();
  try {
    await writeFixture(dir, ".context-index/manifest.yaml", "modules: []\n");
    const r = run(dir);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /STRATEGY_TARGET_REQUIRED/);
  } finally {
    await cleanupTempDir(dir);
  }
});
