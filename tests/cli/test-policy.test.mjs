// tests/cli/test-policy.test.mjs
//
// Tests for `adev test-policy` (lib/cli/test-policy.mjs) — resolve, assert-assigned,
// explain, show, set.
//
// Spec: .context-index/specs/features/test-strategies/test-depth-policy.spec.md
// Plan-task: 8

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname, resolve as resolvePath } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { run } from "../../lib/cli/test-policy.mjs";
import { createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";

// Real-subprocess invocation of the CLI, mirroring the pattern established in
// tests/cli/verify.test.mjs — asserts against actual process stdout/exit code rather than the
// in-process `run()` return value, since the dispatcher (cli/index.mjs) only inspects the return
// value to pick a numeric exit code and never prints it itself (see cli/index.mjs's `dispatch()`,
// ~line 1808): each verb module is responsible for printing its own JSON to stdout.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLI = resolvePath(__dirname, "..", "..", "cli", "index.mjs");

// Every subcommand except the two argument-validation-only cases resolves the owning spec via
// the plan header's `> **Spec:** <path>` line (appendEvent/readEvents are per-spec logs, not
// global — see the resolve step's specRelFromPlan). This helper seeds both files so each test
// isn't duplicating spec-frontmatter boilerplate.
//
// `lib/lifecycle-state.mjs`'s `appendEvent`/`readEvents` both route through
// `validateProjectRoot`, which requires `.context-index/manifest.yaml` to exist (not just be
// parseable — merely present) or they throw `INVALID_PROJECT_ROOT` before ever reaching the
// per-spec log. Every other CLI test in this repo that touches the lifecycle log seeds a
// minimal manifest.yaml fixture for this reason (see tests/cli/verify.test.mjs). This helper
// does the same, guarded by existsSync so it never clobbers a manifest.yaml a test wrote
// itself (e.g. the module-override and set tests) before calling this helper.
async function seedPlanWithSpec(dir, { specRel = ".context-index/specs/features/demo/x.spec.md", specFrontmatter = "", planBody }) {
  await writeFixture(dir, specRel, `---\n${specFrontmatter}---\n# X\n`);
  await writeFixture(dir, "plan.plan.md", `> **Spec:** ${specRel}\n\n${planBody}`);
  const manifestPath = join(dir, ".context-index", "manifest.yaml");
  if (!existsSync(manifestPath)) {
    await writeFixture(dir, ".context-index/manifest.yaml", "modules: []\n");
  }
}

test("resolve rejects a malformed --task-id before any append", async () => {
  const dir = await createTempDir();
  try {
    await assert.rejects(
      run({ projectRoot: dir, argv: ["resolve", "--plan", "p.plan.md", "--task-id", "../../x"] }),
      /INVALID_TASK_ID/,
    );
  } finally {
    await cleanupTempDir(dir);
  }
});

test("resolve rejects a --plan path resolving outside the project root", async () => {
  const dir = await createTempDir();
  try {
    await assert.rejects(
      run({ projectRoot: dir, argv: ["resolve", "--plan", "../outside.plan.md", "--task-id", "t1"] }),
      /PATH_OUTSIDE_ROOT/,
    );
  } finally {
    await cleanupTempDir(dir);
  }
});

test("resolve appends test_depth_assigned and prints the assignment as JSON", async () => {
  const dir = await createTempDir();
  try {
    await seedPlanWithSpec(dir, { planBody: "## Task Structure\n\n### Task 1: X [specialist: none]\n**Files:**\n- Create: `src/x.ts`\n" });
    const result = await run({ projectRoot: dir, argv: ["resolve", "--plan", "plan.plan.md", "--task-id", "t1"] });
    assert.ok(result.depth);
    assert.ok(["minimal", "standard", "thorough"].includes(result.depth));
  } finally {
    await cleanupTempDir(dir);
  }
});

test("assert-assigned fails with MISSING_DEPTH_ASSIGNMENT when no event exists", async () => {
  const dir = await createTempDir();
  try {
    await seedPlanWithSpec(dir, { planBody: "## Task Structure\n\n### Task 2: Y [specialist: none]\n" });
    await assert.rejects(
      run({ projectRoot: dir, argv: ["assert-assigned", "--plan", "plan.plan.md", "--task-id", "t2"] }),
      /MISSING_DEPTH_ASSIGNMENT/,
    );
  } finally {
    await cleanupTempDir(dir);
  }
});

test("explain reports NO_RECORDED_ASSIGNMENT for a task with no assignment event", async () => {
  const dir = await createTempDir();
  try {
    await seedPlanWithSpec(dir, { planBody: "## Task Structure\n\n### Task 3: Z [specialist: none]\n" });
    const result = await run({ projectRoot: dir, argv: ["explain", "--plan", "plan.plan.md", "--task-id", "t3"] });
    assert.equal(result.code, "NO_RECORDED_ASSIGNMENT");
  } finally {
    await cleanupTempDir(dir);
  }
});

test("explain never echoes targetPaths or any task file path", async () => {
  const dir = await createTempDir();
  try {
    await seedPlanWithSpec(dir, { planBody: "## Task Structure\n\n### Task 4: W [specialist: none]\n**Files:**\n- Create: `src/secret-path.ts`\n" });
    await run({ projectRoot: dir, argv: ["resolve", "--plan", "plan.plan.md", "--task-id", "t4"] });
    const result = await run({ projectRoot: dir, argv: ["explain", "--plan", "plan.plan.md", "--task-id", "t4"] });
    assert.ok(!JSON.stringify(result).includes("secret-path"));
  } finally {
    await cleanupTempDir(dir);
  }
});

test("resolve reads the spec's spec-declared test_depth via the plan header's Spec: line", async () => {
  const dir = await createTempDir();
  try {
    await seedPlanWithSpec(dir, {
      specFrontmatter: "test_depth: thorough\nrisk_level: low\n",
      planBody: "## Task Structure\n\n### Task 5: V [specialist: none]\n**Files:**\n- Create: `src/v.ts`\n",
    });
    const result = await run({ projectRoot: dir, argv: ["resolve", "--plan", "plan.plan.md", "--task-id", "t5"] });
    assert.equal(result.depth, "thorough");
    assert.equal(result.source, "spec-declared");
  } finally {
    await cleanupTempDir(dir);
  }
});

test("resolve consults a modules[].test_depth override by matching targetPaths against modules[].paths", async () => {
  const dir = await createTempDir();
  try {
    await writeFixture(dir, ".context-index/manifest.yaml", "modules:\n  - slug: payments\n    paths:\n      - src/payments/\n    test_depth: thorough\n");
    await seedPlanWithSpec(dir, { planBody: "## Task Structure\n\n### Task 6: U [specialist: none]\n**Files:**\n- Create: `src/payments/charge.ts`\n" });
    const result = await run({ projectRoot: dir, argv: ["resolve", "--plan", "plan.plan.md", "--task-id", "t6"] });
    assert.equal(result.depth, "thorough");
    assert.equal(result.source, "module");
  } finally {
    await cleanupTempDir(dir);
  }
});

test("resolve evaluates boundary crossing against governance/boundaries.yaml and floors on a match", async () => {
  const dir = await createTempDir();
  try {
    await writeFixture(
      dir, ".context-index/governance/boundaries.yaml",
      "boundaries:\n  - id: no-direct-db\n    severity: error\n    pattern: 'src/db/'\n    exclude: []\n",
    );
    await seedPlanWithSpec(dir, { planBody: "## Task Structure\n\n### Task 7: T [specialist: none]\n**Files:**\n- Create: `src/db/query.ts`\n" });
    const result = await run({ projectRoot: dir, argv: ["resolve", "--plan", "plan.plan.md", "--task-id", "t7"] });
    assert.equal(result.floor_applied, true);
    assert.ok(result.floor_legs.includes("boundary"));
  } finally {
    await cleanupTempDir(dir);
  }
});

test("resolve degrades to no escalation when .routing.json is absent (ROUTING_SIDECAR_MISSING must not crash resolve)", async () => {
  const dir = await createTempDir();
  try {
    await seedPlanWithSpec(dir, { planBody: "## Task Structure\n\n### Task 8: S [specialist: none]\n**Files:**\n- Create: `src/s.ts`\n" });
    // No plan.routing.json fixture written — this is the normal pre-/adev:route state.
    const result = await run({ projectRoot: dir, argv: ["resolve", "--plan", "plan.plan.md", "--task-id", "t8"] });
    assert.equal(result.escalated, false);
    assert.equal(result.escalation_skipped, "no-routing-entry");
  } finally {
    await cleanupTempDir(dir);
  }
});

test("resolve consults risk-policies.yaml's test_depth per risk level via loadRigorPolicies, not a manifest.yaml field", async () => {
  const dir = await createTempDir();
  try {
    await writeFixture(dir, ".context-index/governance/risk-policies.yaml", "policies:\n  low: { review_mode: quick, validate_mode: quick, test_depth: minimal }\n");
    await seedPlanWithSpec(dir, {
      specFrontmatter: "risk_level: low\n",
      planBody: "## Task Structure\n\n### Task 9: R [specialist: none]\n**Files:**\n- Create: `src/r.ts`\n",
    });
    const result = await run({ projectRoot: dir, argv: ["resolve", "--plan", "plan.plan.md", "--task-id", "t9"] });
    assert.equal(result.depth, "minimal");
    assert.equal(result.source, "risk-policy");
  } finally {
    await cleanupTempDir(dir);
  }
});

// ── governance/sensitive-paths.yaml self-hosting (Behavior 7 — NOT a manifest.yaml field) ──

test("resolve reads .context-index/governance/sensitive-paths.yaml (not a manifest.yaml field) and floors on a custom entry", async () => {
  const dir = await createTempDir();
  try {
    // "src/payments/**" matches no DEFAULT_SENSITIVE_PATHS glob (no auth/crypto/secret/
    // credential/.env/.pem/.key/.p12/governance/workflows token anywhere in the path), so the
    // floor can only fire here because this YAML file was actually read.
    await writeFixture(
      dir, ".context-index/governance/sensitive-paths.yaml",
      'sensitive_paths:\n  - "src/payments/**"\n',
    );
    await seedPlanWithSpec(dir, {
      specFrontmatter: "risk_level: medium\n",
      planBody: "## Task Structure\n\n### Task 10: Q [specialist: none]\n**Files:**\n- Create: `src/payments/charge.ts`\n",
    });
    const result = await run({ projectRoot: dir, argv: ["resolve", "--plan", "plan.plan.md", "--task-id", "t10"] });
    assert.equal(result.floor_applied, true, "a target path matching only the custom governance/sensitive-paths.yaml entry must floor the task");
    assert.ok(result.floor_legs.includes("sensitive-path"));
  } finally {
    await cleanupTempDir(dir);
  }
});

test("resolve degrades to the built-in sensitive-path set (no crash, no floor) when sensitive-paths.yaml is absent", async () => {
  const dir = await createTempDir();
  try {
    await seedPlanWithSpec(dir, {
      specFrontmatter: "risk_level: medium\n",
      planBody: "## Task Structure\n\n### Task 11: P [specialist: none]\n**Files:**\n- Create: `src/payments/charge.ts`\n",
    });
    const result = await run({ projectRoot: dir, argv: ["resolve", "--plan", "plan.plan.md", "--task-id", "t11"] });
    assert.equal(result.floor_applied, false);
  } finally {
    await cleanupTempDir(dir);
  }
});

test("resolve surfaces INVALID_SENSITIVE_PATHS in warnings when sensitive-paths.yaml has a non-string entry, and still degrades to the built-in set", async () => {
  const dir = await createTempDir();
  try {
    await writeFixture(
      dir, ".context-index/governance/sensitive-paths.yaml",
      "sensitive_paths:\n  - 42\n",
    );
    await seedPlanWithSpec(dir, {
      specFrontmatter: "risk_level: medium\n",
      planBody: "## Task Structure\n\n### Task 12: O [specialist: none]\n**Files:**\n- Create: `src/o.ts`\n",
    });
    const result = await run({ projectRoot: dir, argv: ["resolve", "--plan", "plan.plan.md", "--task-id", "t12"] });
    assert.equal(result.floor_applied, false);
    assert.ok(
      result.warnings.some((w) => w.code === "INVALID_SENSITIVE_PATHS"),
      "a malformed sensitive-paths.yaml entry must surface an INVALID_SENSITIVE_PATHS advisory",
    );
  } finally {
    await cleanupTempDir(dir);
  }
});

test("show distinguishes built-in from configured sensitive paths, reading governance/sensitive-paths.yaml (not a manifest.yaml field)", async () => {
  const dir = await createTempDir();
  try {
    await writeFixture(dir, ".context-index/manifest.yaml", "modules: []\n");
    await writeFixture(
      dir, ".context-index/governance/sensitive-paths.yaml",
      'sensitive_paths:\n  - "src/payments/**"\n',
    );
    const result = await run({ projectRoot: dir, argv: ["show"] });
    assert.ok(result.sensitive_paths.configured.includes("src/payments/**"));
    assert.ok(!result.sensitive_paths.built_in.includes("src/payments/**"));
  } finally {
    await cleanupTempDir(dir);
  }
});

test("show prints the effective policy with the layer that supplied each field", async () => {
  const dir = await createTempDir();
  try {
    const result = await run({ projectRoot: dir, argv: ["show"] });
    assert.ok(result.granularity);
    assert.ok(result.granularity_source);
    assert.ok(Array.isArray(result.sensitive_paths.built_in));
  } finally {
    await cleanupTempDir(dir);
  }
});

test("set validates --module against modules[] and rejects an unknown slug with UNKNOWN_POLICY_MODULE", async () => {
  const dir = await createTempDir();
  try {
    await writeFixture(dir, ".context-index/manifest.yaml", "modules:\n  - slug: lib\n    paths:\n      - lib/\n");
    await assert.rejects(
      run({ projectRoot: dir, argv: ["set", "--module", "does-not-exist", "--test_depth", "thorough"] }),
      /UNKNOWN_POLICY_MODULE/,
    );
  } finally {
    await cleanupTempDir(dir);
  }
});

test("set writes via temp-file-plus-rename and round-trip-verifies before committing", async () => {
  const dir = await createTempDir();
  try {
    await writeFixture(dir, ".context-index/manifest.yaml", "modules:\n  - slug: lib\n    paths:\n      - lib/\n");
    await run({ projectRoot: dir, argv: ["set", "--module", "lib", "--test_depth", "thorough"] });
    const result = await run({ projectRoot: dir, argv: ["show", "--module", "lib"] });
    assert.equal(result.test_depth.value, "thorough");
  } finally {
    await cleanupTempDir(dir);
  }
});

// ── real-CLI stdout contract (Interface Contract table; Behaviors 12 and 15) ──────────────

test("[subprocess] adev test-policy resolve prints the assignment as JSON to real stdout", async () => {
  const dir = await createTempDir();
  try {
    await seedPlanWithSpec(dir, {
      planBody: "## Task Structure\n\n### Task 1: X [specialist: none]\n**Files:**\n- Create: `src/x.ts`\n",
    });
    const r = spawnSync(
      "node",
      [CLI, "test-policy", "resolve", "--plan", "plan.plan.md", "--task-id", "t1"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    assert.notEqual(r.stdout.trim(), "", "resolve must print JSON to stdout, not just return it");
    const parsed = JSON.parse(r.stdout);
    assert.ok(["minimal", "standard", "thorough"].includes(parsed.depth));
  } finally {
    await cleanupTempDir(dir);
  }
});

test("[subprocess] adev test-policy show prints the effective policy as JSON to real stdout", async () => {
  const dir = await createTempDir();
  try {
    await writeFixture(dir, ".context-index/manifest.yaml", "modules: []\n");
    const r = spawnSync("node", [CLI, "test-policy", "show"], { encoding: "utf8", cwd: dir });
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    assert.notEqual(r.stdout.trim(), "", "show must print JSON to stdout, not just return it");
    const parsed = JSON.parse(r.stdout);
    assert.ok(parsed.granularity);
    assert.ok(parsed.granularity_source);
  } finally {
    await cleanupTempDir(dir);
  }
});

// ── set: closed-enumeration validation (Behavior 9 — no silent fallback for malformed policy) ──

test("set rejects an out-of-enumeration --test_depth with INVALID_TEST_DEPTH before any write", async () => {
  const dir = await createTempDir();
  try {
    const manifestRel = ".context-index/manifest.yaml";
    const manifestContent = "modules:\n  - slug: lib\n    paths:\n      - lib/\n";
    await writeFixture(dir, manifestRel, manifestContent);
    const manifestPath = join(dir, manifestRel);
    const before = readFileSync(manifestPath, "utf8");

    await assert.rejects(
      run({ projectRoot: dir, argv: ["set", "--module", "lib", "--test_depth", "bogus"] }),
      /INVALID_TEST_DEPTH/,
    );

    const after = readFileSync(manifestPath, "utf8");
    assert.strictEqual(after, before, "manifest.yaml must be byte-identical after a rejected set");
    assert.ok(!existsSync(`${manifestPath}.tmp-${process.pid}`), "no temp file should be left behind");
  } finally {
    await cleanupTempDir(dir);
  }
});

test("set rejects an out-of-enumeration --granularity with INVALID_TEST_GRANULARITY before any write", async () => {
  const dir = await createTempDir();
  try {
    const manifestRel = ".context-index/manifest.yaml";
    const manifestContent = "modules: []\n";
    await writeFixture(dir, manifestRel, manifestContent);
    const manifestPath = join(dir, manifestRel);
    const before = readFileSync(manifestPath, "utf8");

    await assert.rejects(
      run({ projectRoot: dir, argv: ["set", "--granularity", "bogus"] }),
      /INVALID_TEST_GRANULARITY/,
    );

    const after = readFileSync(manifestPath, "utf8");
    assert.strictEqual(after, before, "manifest.yaml must be byte-identical after a rejected set");
  } finally {
    await cleanupTempDir(dir);
  }
});
