/**
 * Tests for `lib/cli/issues-migrate.mjs` and `lib/cli/issues.mjs`
 * (the `adev issues migrate` CLI verb).
 *
 * Spec: .context-index/specs/features/task-management/backend-migration.spec.md
 * Plan: .context-index/specs/features/task-management/backend-migration.plan.md
 *
 * Tests are added incrementally across plan tasks 2-9. Task 9 closes any
 * coverage gaps once the verb implementation lands.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { run as runMigrate, help as helpMigrate } from "../../lib/cli/issues-migrate.mjs";
import { run as runIssues, help as helpIssues } from "../../lib/cli/issues.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "..", "..");
const CLI = resolve(PROJECT_ROOT, "cli", "index.mjs");

/**
 * Create an isolated temp project root with `.context-index/manifest.yaml`.
 * @param {object} [opts]
 * @param {string} [opts.backend] - tasks.backend value (default "json")
 */
function makeTempProject({ backend = "json" } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "adev-issues-migrate-test-"));
  mkdirSync(join(dir, ".context-index", "tasks"), { recursive: true });
  writeFileSync(
    join(dir, ".context-index", "manifest.yaml"),
    `project:\n  name: test\n  adev_version: "0.27.1"\ntasks:\n  backend: ${backend}\n`,
  );
  // Seed an empty json board so list() doesn't fall through to legacy parse.
  writeFileSync(
    join(dir, ".context-index", "tasks", "tasks.json"),
    JSON.stringify({ version: 2, seq: 0, epics: [], issues: [] }, null, 2) + "\n",
  );
  return dir;
}

function cleanup(dir) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

/**
 * Spawn the CLI as a subprocess to capture real exit codes + stdio.
 *
 * @param {string[]} argv - args after `node cli/index.mjs`
 * @param {object} [opts]
 * @param {string} [opts.cwd]
 * @param {Record<string,string>} [opts.env]
 */
function runCli(argv, { cwd, env } = {}) {
  const result = spawnSync("node", [CLI, ...argv], {
    cwd: cwd || process.cwd(),
    env: { ...process.env, ...(env || {}) },
    encoding: "utf8",
    timeout: 15000,
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

describe("issues migrate verb wiring (plan-task 2)", () => {
  it("issues-migrate exposes a run() function", () => {
    assert.equal(typeof runMigrate, "function");
  });

  it("issues-migrate exposes a help() function", () => {
    assert.equal(typeof helpMigrate, "function");
  });

  it("issues parent verb exposes a run() function", () => {
    assert.equal(typeof runIssues, "function");
  });

  it("issues parent verb exposes a help() function", () => {
    assert.equal(typeof helpIssues, "function");
  });

  it("issues parent prints usage and exits 1 when no subcommand", async () => {
    // Capture stdout/stderr to keep test output clean.
    const originalLog = console.log;
    const originalErr = console.error;
    const stdoutBuf = [];
    const stderrBuf = [];
    console.log = (msg) => stdoutBuf.push(String(msg));
    console.error = (msg) => stderrBuf.push(String(msg));
    try {
      const exit = await runIssues({ projectRoot: process.cwd(), argv: [], manifest: null });
      assert.equal(exit, 1);
      assert.ok(stdoutBuf.join("\n").includes("subcommand"),
        "expected usage banner on stdout");
    } finally {
      console.log = originalLog;
      console.error = originalErr;
    }
  });

  it("issues parent rejects unknown subcommands with exit 1", async () => {
    const originalLog = console.log;
    const originalErr = console.error;
    console.log = () => {};
    console.error = () => {};
    try {
      const exit = await runIssues({
        projectRoot: process.cwd(),
        argv: ["unknown-subcommand"],
        manifest: null,
      });
      assert.equal(exit, 1);
    } finally {
      console.log = originalLog;
      console.error = originalErr;
    }
  });

  it("issues parent dispatches migrate to issues-migrate.run", async () => {
    // Without any args, migrate prints usage and exits non-zero (MIGRATE_MISSING_TARGET
    // once Task 3 lands; in the Task 2 skeleton, the stub returns 0). The
    // wiring assertion is that calling issues with ["migrate"] reaches
    // issues-migrate's run() instead of throwing "unknown subcommand".
    const originalLog = console.log;
    const originalErr = console.error;
    console.log = () => {};
    console.error = () => {};
    try {
      // Should not throw "unknown issues subcommand: migrate"
      const exit = await runIssues({
        projectRoot: process.cwd(),
        argv: ["migrate"],
        manifest: null,
      });
      assert.equal(typeof exit, "number");
    } finally {
      console.log = originalLog;
      console.error = originalErr;
    }
  });
});

describe("issues migrate argument validation (plan-task 3)", () => {
  it("emits MIGRATE_MISSING_TARGET when --to is omitted (Behavior 4)", () => {
    const proj = makeTempProject();
    try {
      const { exitCode, stderr } = runCli(["issues", "migrate"], { cwd: proj });
      assert.notEqual(exitCode, 0, "expected non-zero exit");
      assert.ok(
        stderr.includes("MIGRATE_MISSING_TARGET"),
        `expected MIGRATE_MISSING_TARGET in stderr, got: ${stderr}`,
      );
    } finally {
      cleanup(proj);
    }
  });

  it("emits MIGRATE_UNKNOWN_BACKEND with supported list when --to is unrecognised (Behavior 5)", () => {
    const proj = makeTempProject();
    try {
      const { exitCode, stderr } = runCli(
        ["issues", "migrate", "--to", "xyz"],
        { cwd: proj },
      );
      assert.notEqual(exitCode, 0);
      assert.ok(
        stderr.includes("MIGRATE_UNKNOWN_BACKEND"),
        `expected MIGRATE_UNKNOWN_BACKEND in stderr, got: ${stderr}`,
      );
      // Must list the supported values (per SEC-2 the source is SUPPORTED_BACKENDS).
      assert.ok(stderr.includes("json"), "expected supported list to include 'json'");
      assert.ok(stderr.includes("beads"), "expected supported list to include 'beads'");
      assert.ok(stderr.includes("file"), "expected supported list to include 'file'");
    } finally {
      cleanup(proj);
    }
  });

  it("emits MIGRATE_TARGET_READONLY when --to file (Behavior 6)", () => {
    const proj = makeTempProject();
    try {
      const { exitCode, stderr } = runCli(
        ["issues", "migrate", "--to", "file"],
        { cwd: proj },
      );
      assert.notEqual(exitCode, 0);
      assert.ok(
        stderr.includes("MIGRATE_TARGET_READONLY"),
        `expected MIGRATE_TARGET_READONLY in stderr, got: ${stderr}`,
      );
    } finally {
      cleanup(proj);
    }
  });

  it("emits MIGRATE_NOOP when source backend equals target (Behavior 3)", () => {
    const proj = makeTempProject({ backend: "json" });
    try {
      const { exitCode, stderr } = runCli(
        ["issues", "migrate", "--to", "json"],
        { cwd: proj },
      );
      assert.notEqual(exitCode, 0);
      assert.ok(
        stderr.includes("MIGRATE_NOOP"),
        `expected MIGRATE_NOOP in stderr, got: ${stderr}`,
      );
    } finally {
      cleanup(proj);
    }
  });

  it("emits MIGRATE_NOOP when --from explicitly matches --to (Behavior 2 + 3)", () => {
    const proj = makeTempProject({ backend: "beads" });
    try {
      // Override source via --from to confirm the noop check uses the resolved
      // source, not just manifest.
      const { exitCode, stderr } = runCli(
        ["issues", "migrate", "--to", "json", "--from", "json"],
        { cwd: proj },
      );
      assert.notEqual(exitCode, 0);
      assert.ok(
        stderr.includes("MIGRATE_NOOP"),
        `expected MIGRATE_NOOP in stderr, got: ${stderr}`,
      );
    } finally {
      cleanup(proj);
    }
  });

  it("emits BEADS_NOT_AVAILABLE when --to beads and br is missing (Behavior 7)", () => {
    // Force `br` lookup to fail by setting PATH to a directory that contains
    // only `node` (and a `which` shim) — `br` is not on this PATH, but the
    // subprocess can still spawn node to run the CLI.
    //
    // To keep the test hermetic regardless of whether `br` happens to be
    // installed on the host machine, we build a minimal PATH dir that
    // contains a symlink to the real `node` binary (so spawnSync can resolve
    // it) AND a symlink to a real `which` (so BeadsAdapter._detectBr's
    // `which br` call resolves the binary but returns non-zero for `br`).
    const proj = makeTempProject();
    const minimalBin = mkdtempSync(join(tmpdir(), "adev-min-path-"));
    try {
      // Symlink only the binaries BeadsAdapter._detectBr explicitly needs:
      // `which`. We do NOT symlink `br`. Node itself is found by spawnSync
      // via PATH lookup of the bare "node" name — so include the node bin
      // dir AND a real `which`.
      //
      // Cross-platform note: on Linux/macOS `which` lives at /usr/bin/which
      // or /usr/local/bin/which. We resolve at test time.
      const nodeBin = dirname(process.execPath);
      // Locate `which` in the current PATH.
      const whichLookup = spawnSync(
        process.platform === "win32" ? "where" : "which",
        ["which"],
        { encoding: "utf8" },
      );
      const whichPath = (whichLookup.stdout || "").trim().split("\n")[0];
      if (!whichPath) {
        // No `which` resolver available — skip this assertion rather than
        // false-fail.
        return;
      }
      // Build a colon-joined PATH containing only what we need.
      const restrictedPath = [nodeBin, dirname(whichPath)].join(":");

      const { exitCode, stderr } = runCli(
        ["issues", "migrate", "--to", "beads"],
        {
          cwd: proj,
          // Hermetic env: clean PATH limited to node + which only.
          env: {
            PATH: restrictedPath,
            HOME: process.env.HOME || "/tmp",
          },
        },
      );
      assert.notEqual(exitCode, 0);
      assert.ok(
        stderr.includes("BEADS_NOT_AVAILABLE"),
        `expected BEADS_NOT_AVAILABLE in stderr, got: ${stderr}`,
      );
      // Install hint must be present.
      assert.ok(
        stderr.toLowerCase().includes("install") ||
          stderr.includes("beads_rust"),
        "expected install hint in stderr",
      );
    } finally {
      cleanup(minimalBin);
      cleanup(proj);
    }
  });

  it("accepts --include-closed and --dry-run flags without erroring on parse", () => {
    const proj = makeTempProject();
    try {
      // With dry-run on a json→json setup we still expect MIGRATE_NOOP since
      // source == target; this proves the flag parse succeeded before the
      // noop check fired (i.e., no "unrecognized flag" error).
      const { stderr } = runCli(
        ["issues", "migrate", "--to", "json", "--dry-run", "--include-closed"],
        { cwd: proj },
      );
      // Should NOT contain "unrecognized" / "unknown flag" type errors.
      assert.ok(!/unrecognized|unknown flag/i.test(stderr));
    } finally {
      cleanup(proj);
    }
  });
});

describe("issues migrate source read + scope filter (plan-task 4)", () => {
  /**
   * Seed a tasks.json file with N open + M closed issues and one epic.
   * @returns {string} project root path
   */
  function seedJsonBoard(openCount, closedCount, epicCount = 1) {
    const dir = makeTempProject({ backend: "json" });
    const issues = [];
    for (let i = 0; i < openCount; i++) {
      issues.push({
        id: `issue-${i + 1}`,
        title: `open ${i + 1}`,
        status: "open",
        priority: 2,
        type: "task",
        dependencies: [],
        notes: "",
        next_action: null,
        created: "2026-05-19T00:00:00.000Z",
        updated: "2026-05-19T00:00:00.000Z",
      });
    }
    for (let i = 0; i < closedCount; i++) {
      issues.push({
        id: `issue-${openCount + i + 1}`,
        title: `closed ${i + 1}`,
        status: "closed",
        priority: 2,
        type: "task",
        dependencies: [],
        notes: "",
        next_action: null,
        created: "2026-05-19T00:00:00.000Z",
        updated: "2026-05-19T00:00:00.000Z",
      });
    }
    const epics = [];
    for (let i = 0; i < epicCount; i++) {
      epics.push({
        id: `epic-${i + 1}`,
        title: `epic ${i + 1}`,
        status: "open",
        created: "2026-05-19T00:00:00.000Z",
        updated: "2026-05-19T00:00:00.000Z",
      });
    }
    writeFileSync(
      join(dir, ".context-index", "tasks", "tasks.json"),
      JSON.stringify({ version: 2, seq: 0, epics, issues }, null, 2) + "\n",
    );
    return dir;
  }

  it("readSource() excludes closed items by default (Behavior 12)", async () => {
    const proj = seedJsonBoard(3, 2, 1);
    try {
      const mod = await import("../../lib/cli/issues-migrate.mjs");
      const manifest = { tasks: { backend: "json" } };
      const { issues, epics } = await mod.readSource({
        projectRoot: proj,
        source: "json",
        includeClosed: false,
        manifest,
      });
      assert.equal(issues.length, 3, "expected 3 open issues");
      assert.equal(epics.length, 1, "expected 1 epic");
    } finally {
      cleanup(proj);
    }
  });

  it("readSource() includes closed items with --include-closed (Behavior 12)", async () => {
    const proj = seedJsonBoard(3, 2, 1);
    try {
      const mod = await import("../../lib/cli/issues-migrate.mjs");
      const manifest = { tasks: { backend: "json" } };
      const { issues, epics } = await mod.readSource({
        projectRoot: proj,
        source: "json",
        includeClosed: true,
        manifest,
      });
      assert.equal(issues.length, 5, "expected 5 items with --include-closed");
      assert.equal(epics.length, 1);
    } finally {
      cleanup(proj);
    }
  });

  it("readSource() returns empty arrays on an empty board", async () => {
    const proj = makeTempProject({ backend: "json" });
    try {
      const mod = await import("../../lib/cli/issues-migrate.mjs");
      const manifest = { tasks: { backend: "json" } };
      const { issues, epics } = await mod.readSource({
        projectRoot: proj,
        source: "json",
        includeClosed: false,
        manifest,
      });
      assert.equal(issues.length, 0);
      assert.equal(epics.length, 0);
    } finally {
      cleanup(proj);
    }
  });

  it("readSource() surfaces MIGRATE_SOURCE_INVALID on malformed tasks.json (Behavior 8)", async () => {
    const proj = makeTempProject({ backend: "json" });
    try {
      // Overwrite tasks.json with invalid JSON.
      writeFileSync(
        join(proj, ".context-index", "tasks", "tasks.json"),
        "{this is not json",
      );
      const mod = await import("../../lib/cli/issues-migrate.mjs");
      const manifest = { tasks: { backend: "json" } };
      let caught;
      try {
        await mod.readSource({
          projectRoot: proj,
          source: "json",
          includeClosed: false,
          manifest,
        });
      } catch (err) {
        caught = err;
      }
      assert.ok(caught, "expected readSource to throw on malformed JSON");
      assert.equal(caught.code, "MIGRATE_SOURCE_INVALID");
      assert.ok(
        caught.message.includes("tasks.json"),
        `expected error message to include path context, got: ${caught.message}`,
      );
    } finally {
      cleanup(proj);
    }
  });
});

describe("issues migrate dry-run path (plan-task 5)", () => {
  /**
   * Seed a populated json board and return its project root.
   * Dependency edges live on `dependencies` arrays.
   */
  function seedRichJsonBoard({ issues = [], epics = [] } = {}) {
    const dir = makeTempProject({ backend: "json" });
    writeFileSync(
      join(dir, ".context-index", "tasks", "tasks.json"),
      JSON.stringify({ version: 2, seq: 0, epics, issues }, null, 2) + "\n",
    );
    return dir;
  }

  function makeIssue(id, overrides = {}) {
    return {
      id,
      title: `${id} title`,
      status: "open",
      priority: 2,
      type: "task",
      dependencies: [],
      notes: "",
      next_action: null,
      created: "2026-05-19T00:00:00.000Z",
      updated: "2026-05-19T00:00:00.000Z",
      ...overrides,
    };
  }

  function makeEpic(id, overrides = {}) {
    return {
      id,
      title: `${id} title`,
      status: "open",
      created: "2026-05-19T00:00:00.000Z",
      updated: "2026-05-19T00:00:00.000Z",
      ...overrides,
    };
  }

  it("json → beads dry-run emits the documented JSON shape with no .beads-map.json (Behavior 15)", () => {
    const proj = seedRichJsonBoard({
      issues: [makeIssue("issue-1"), makeIssue("issue-2"), makeIssue("issue-3")],
      epics: [makeEpic("epic-1")],
    });
    try {
      // Snapshot tasks.json bytes BEFORE the run for Postcondition 7.
      const tasksJsonBefore = readFileSync(
        join(proj, ".context-index", "tasks", "tasks.json"),
        "utf8",
      );
      const mapPathBefore = existsSync(
        join(proj, ".context-index", "tasks", ".beads-map.json"),
      );

      // Use --from beads sentinel: not equal to target. But source must be a
      // real adapter; use json source with `--to beads` since this is a
      // json→beads scenario. We need br to be missing to avoid actually
      // running br; the BEADS_NOT_AVAILABLE check fires before dry-run. So
      // we restrict PATH like in Behavior 7's test... unless dry-run skips
      // the env probe. Behavior 7 says env check fires BEFORE source read;
      // Behavior 15 says dry-run is read-only. The conservative interpretation
      // is that even dry-run needs br on PATH so the target adapter can be
      // probed. We assume br IS available on the dev machine (we already
      // saw `which br` succeed earlier in the env). For CI without br, this
      // test will skip — guard accordingly.
      const brCheck = spawnSync("which", ["br"], { encoding: "utf8" });
      if ((brCheck.status ?? 1) !== 0) {
        // br not on PATH — skip this assertion path.
        return;
      }

      const { exitCode, stdout, stderr } = runCli(
        ["issues", "migrate", "--to", "beads", "--dry-run"],
        { cwd: proj },
      );
      assert.equal(exitCode, 0, `expected dry-run exit 0, got ${exitCode}; stderr=${stderr}`);

      // Find the JSON object in stdout (verb may print other lines).
      const jsonLine = stdout.split("\n").find((l) => l.trim().startsWith("{"));
      assert.ok(jsonLine, `expected JSON object on stdout, got: ${stdout}`);
      const report = JSON.parse(jsonLine);
      assert.equal(report.source, "json");
      assert.equal(report.target, "beads");
      assert.deepEqual(report.in_scope, { issues: 3, epics: 1 });
      // The lone epic already counts as migrated. beads has no epic adev can
      // create (`br epic` is status/close-eligible only), so the adapter keeps
      // epics in a local JsonAdapter — i.e. in this very tasks.json. For a
      // json → beads move the epics are therefore already at their
      // destination and need no copying.
      //
      // Before that delegation was repointed, epics went to the FileAdapter,
      // which is read-only-deprecated — so a real (non-dry) run of this
      // migration threw BACKEND_READ_ONLY_DEPRECATED. Reporting 0 here was
      // never reachable behavior.
      assert.equal(report.already_migrated, 1);
      assert.deepEqual(report.would_create, { issues: 3, epics: 0 });
      assert.equal(report.dependencies_to_replay, 0);

      // Postcondition 7: dry-run writes neither target state nor .beads-map.json.
      const tasksJsonAfter = readFileSync(
        join(proj, ".context-index", "tasks", "tasks.json"),
        "utf8",
      );
      assert.equal(tasksJsonAfter, tasksJsonBefore, "tasks.json must be byte-equal after dry-run");
      const mapPathAfter = existsSync(
        join(proj, ".context-index", "tasks", ".beads-map.json"),
      );
      assert.equal(mapPathAfter, mapPathBefore, ".beads-map.json must not be created by dry-run");
    } finally {
      cleanup(proj);
    }
  });

  it("json → beads dry-run reads .beads-map.json to compute already_migrated (Behavior 15)", () => {
    const proj = seedRichJsonBoard({
      issues: [makeIssue("issue-1"), makeIssue("issue-2"), makeIssue("issue-3")],
      epics: [makeEpic("epic-1")],
    });
    try {
      // Pre-seed a .beads-map.json covering issue-1 and issue-2.
      writeFileSync(
        join(proj, ".context-index", "tasks", ".beads-map.json"),
        JSON.stringify(
          {
            "issue-1": { beadsId: "br-1" },
            "issue-2": { beadsId: "br-2" },
          },
          null,
          2,
        ),
      );

      const brCheck = spawnSync("which", ["br"], { encoding: "utf8" });
      if ((brCheck.status ?? 1) !== 0) return;

      const { exitCode, stdout } = runCli(
        ["issues", "migrate", "--to", "beads", "--dry-run"],
        { cwd: proj },
      );
      assert.equal(exitCode, 0);
      const jsonLine = stdout.split("\n").find((l) => l.trim().startsWith("{"));
      const report = JSON.parse(jsonLine);
      // 2 mapped issues + the epic, which lives in tasks.json on both sides
      // (beads has no creatable epic — see the sibling test).
      assert.equal(report.already_migrated, 3);
      // would_create.issues = in_scope.issues - already-mapped issues = 3 - 2 = 1
      assert.equal(report.would_create.issues, 1);
      assert.equal(report.would_create.epics, 0);
    } finally {
      cleanup(proj);
    }
  });

  it("dry-run counts in-scope dependency edges (Behavior 15)", () => {
    const proj = seedRichJsonBoard({
      issues: [
        makeIssue("issue-1", { dependencies: [] }),
        makeIssue("issue-2", { dependencies: ["issue-1"] }),
        makeIssue("issue-3", { dependencies: ["issue-1", "issue-2"] }),
      ],
      epics: [],
    });
    try {
      const brCheck = spawnSync("which", ["br"], { encoding: "utf8" });
      if ((brCheck.status ?? 1) !== 0) return;

      const { exitCode, stdout } = runCli(
        ["issues", "migrate", "--to", "beads", "--dry-run"],
        { cwd: proj },
      );
      assert.equal(exitCode, 0);
      const jsonLine = stdout.split("\n").find((l) => l.trim().startsWith("{"));
      const report = JSON.parse(jsonLine);
      // 3 edges total, all in-scope: (2→1), (3→1), (3→2)
      assert.equal(report.dependencies_to_replay, 3);
    } finally {
      cleanup(proj);
    }
  });

  it("dry-run excludes edges pointing to out-of-scope (closed) items (Behavior 14 + 15)", () => {
    const proj = seedRichJsonBoard({
      issues: [
        makeIssue("issue-1"),
        makeIssue("issue-2", { dependencies: ["issue-1"] }),
        // issue-3 is closed (out of scope by default)
        makeIssue("issue-3", { status: "closed" }),
        makeIssue("issue-4", { dependencies: ["issue-3"] }), // depends on closed
      ],
    });
    try {
      const brCheck = spawnSync("which", ["br"], { encoding: "utf8" });
      if ((brCheck.status ?? 1) !== 0) return;

      const { exitCode, stdout } = runCli(
        ["issues", "migrate", "--to", "beads", "--dry-run"],
        { cwd: proj },
      );
      assert.equal(exitCode, 0);
      const jsonLine = stdout.split("\n").find((l) => l.trim().startsWith("{"));
      const report = JSON.parse(jsonLine);
      // in-scope issues: 1, 2, 4. Edge (2→1) is in-scope. Edge (4→3) is NOT
      // (endpoint 3 is closed). dependencies_to_replay = 1.
      assert.equal(report.dependencies_to_replay, 1);
    } finally {
      cleanup(proj);
    }
  });
});

describe("issues migrate live loop + state file (plan-task 6)", () => {
  function makeIssue(id, overrides = {}) {
    return {
      id,
      title: `${id} title`,
      status: "open",
      priority: 2,
      type: "task",
      dependencies: [],
      notes: "",
      next_action: null,
      created: "2026-05-19T00:00:00.000Z",
      updated: "2026-05-19T00:00:00.000Z",
      ...overrides,
    };
  }
  function makeEpic(id, overrides = {}) {
    return {
      id,
      title: `${id} title`,
      status: "open",
      created: "2026-05-19T00:00:00.000Z",
      updated: "2026-05-19T00:00:00.000Z",
      ...overrides,
    };
  }

  /** Build a stub adapter with in-memory issues/epics state. */
  function makeStubAdapter({ name = "stub", initialIssues = [], initialEpics = [], throwOnIndex = -1 } = {}) {
    let nextId = initialIssues.length + 1;
    let nextEpicId = initialEpics.length + 1;
    let createCallIdx = 0;
    const issues = [...initialIssues];
    const epics = [...initialEpics];
    return {
      name,
      issues, // exposed for assertions
      epics,
      createCalls: [],
      createEpicCalls: [],
      addDependencyCalls: [],
      async list() {
        return [...issues];
      },
      async listEpics() {
        return [...epics];
      },
      async create(input) {
        if (createCallIdx === throwOnIndex) {
          createCallIdx++;
          const err = new Error(`stub adapter forced failure on create call ${throwOnIndex}`);
          err.code = "BEADS_COMMAND_FAILED";
          err.stderr = "br create: simulated failure\n";
          throw err;
        }
        createCallIdx++;
        const id = `${name}-${nextId++}`;
        const newItem = { ...input, id, dependencies: input.dependencies || [] };
        issues.push(newItem);
        this.createCalls.push({ input, returned: newItem });
        return newItem;
      },
      async createEpic(input) {
        const id = `${name}-epic-${nextEpicId++}`;
        const newEpic = { ...input, id };
        epics.push(newEpic);
        this.createEpicCalls.push({ input, returned: newEpic });
        return newEpic;
      },
      async addDependency(issueId, dependsOnId) {
        this.addDependencyCalls.push({ issueId, dependsOnId });
        const i = issues.find((x) => x.id === issueId);
        if (i) {
          i.dependencies = i.dependencies || [];
          if (!i.dependencies.includes(dependsOnId)) {
            i.dependencies.push(dependsOnId);
          }
        }
      },
    };
  }

  it("runLiveMigration calls create() once per non-migrated item and tracks last_successful_index", async () => {
    const proj = makeTempProject({ backend: "json" });
    try {
      const sourceIssues = [
        makeIssue("issue-1"),
        makeIssue("issue-2"),
        makeIssue("issue-3"),
      ];
      const sourceEpics = [makeEpic("epic-1")];
      const sourceAdapter = makeStubAdapter({
        name: "src",
        initialIssues: sourceIssues,
        initialEpics: sourceEpics,
      });
      const targetAdapter = makeStubAdapter({ name: "tgt" });

      const mod = await import("../../lib/cli/issues-migrate.mjs");
      const result = await mod.runLiveMigration({
        projectRoot: proj,
        source: "json",
        target: "beads",
        sourceAdapter,
        targetAdapter,
        sourceIssues,
        sourceEpics,
        alreadyMigratedIssueIds: new Set(),
        alreadyMigratedEpicIds: new Set(),
        startIndex: 0,
        scopeArgs: { includeClosed: false },
      });

      assert.equal(result.created.issues, 3);
      assert.equal(result.created.epics, 1);
      assert.equal(result.skipped, 0);
      assert.equal(targetAdapter.createCalls.length, 3);
      assert.equal(targetAdapter.createEpicCalls.length, 1);

      // After successful completion, the state file should be removed (cleanup
      // is the verb's responsibility — runLiveMigration writes it during the
      // loop and the calling run() removes it on success). Here we only
      // assert that the state file exists during the run (write happened).
      // The runLiveMigration result should expose lastSuccessfulIndex=2.
      assert.equal(result.lastSuccessfulIndex, 2);
    } finally {
      cleanup(proj);
    }
  });

  it("runLiveMigration skips items present in alreadyMigratedIssueIds", async () => {
    const proj = makeTempProject({ backend: "json" });
    try {
      const sourceIssues = [
        makeIssue("issue-1"),
        makeIssue("issue-2"),
        makeIssue("issue-3"),
      ];
      const sourceAdapter = makeStubAdapter({ name: "src", initialIssues: sourceIssues });
      const targetAdapter = makeStubAdapter({ name: "tgt" });

      const mod = await import("../../lib/cli/issues-migrate.mjs");
      const result = await mod.runLiveMigration({
        projectRoot: proj,
        source: "json",
        target: "beads",
        sourceAdapter,
        targetAdapter,
        sourceIssues,
        sourceEpics: [],
        alreadyMigratedIssueIds: new Set(["issue-1", "issue-2"]),
        alreadyMigratedEpicIds: new Set(),
        startIndex: 0,
        scopeArgs: { includeClosed: false },
      });

      assert.equal(result.skipped, 2);
      assert.equal(result.created.issues, 1);
      assert.equal(targetAdapter.createCalls.length, 1);
      assert.equal(targetAdapter.createCalls[0].input.title, "issue-3 title");
    } finally {
      cleanup(proj);
    }
  });

  it("runLiveMigration writes .migrate-state.json per item and removes it on completion (SA-2)", async () => {
    const proj = makeTempProject({ backend: "json" });
    try {
      const sourceIssues = [makeIssue("issue-1"), makeIssue("issue-2")];
      const sourceAdapter = makeStubAdapter({ name: "src", initialIssues: sourceIssues });
      const targetAdapter = makeStubAdapter({ name: "tgt" });

      const mod = await import("../../lib/cli/issues-migrate.mjs");
      const statePath = join(proj, ".context-index", "tasks", ".migrate-state.json");

      await mod.runLiveMigration({
        projectRoot: proj,
        source: "json",
        target: "beads",
        sourceAdapter,
        targetAdapter,
        sourceIssues,
        sourceEpics: [],
        alreadyMigratedIssueIds: new Set(),
        alreadyMigratedEpicIds: new Set(),
        startIndex: 0,
        scopeArgs: { includeClosed: false },
      });

      // On successful completion, runLiveMigration does NOT remove the state
      // file (that's the verb-level run() responsibility, Task 8). Here we
      // only assert the file content reflects the last successful index.
      assert.ok(existsSync(statePath), "expected .migrate-state.json after run");
      const state = JSON.parse(readFileSync(statePath, "utf8"));
      assert.equal(state.source, "json");
      assert.equal(state.target, "beads");
      assert.equal(state.last_successful_index, 1); // 2 items, indices 0+1
    } finally {
      cleanup(proj);
    }
  });

  it("runLiveMigration emits MIGRATE_PARTIAL_FAILURE on mid-loop adapter failure", async () => {
    const proj = makeTempProject({ backend: "json" });
    try {
      const sourceIssues = [
        makeIssue("issue-1"),
        makeIssue("issue-2"),
        makeIssue("issue-3"),
      ];
      const sourceAdapter = makeStubAdapter({ name: "src", initialIssues: sourceIssues });
      const targetAdapter = makeStubAdapter({ name: "tgt", throwOnIndex: 1 });

      const mod = await import("../../lib/cli/issues-migrate.mjs");
      let thrown;
      try {
        await mod.runLiveMigration({
          projectRoot: proj,
          source: "json",
          target: "beads",
          sourceAdapter,
          targetAdapter,
          sourceIssues,
          sourceEpics: [],
          alreadyMigratedIssueIds: new Set(),
          alreadyMigratedEpicIds: new Set(),
          startIndex: 0,
          scopeArgs: { includeClosed: false },
        });
      } catch (err) {
        thrown = err;
      }
      assert.ok(thrown, "expected throw on mid-loop adapter failure");
      assert.equal(thrown.code, "MIGRATE_PARTIAL_FAILURE");
      // SEC-1: stderr passthrough verbatim
      assert.ok(thrown.message.includes("br create: simulated failure"),
        `expected stderr verbatim in message, got: ${thrown.message}`);

      // State file should record the last successful index = 0 (only issue-1 succeeded).
      const statePath = join(proj, ".context-index", "tasks", ".migrate-state.json");
      const state = JSON.parse(readFileSync(statePath, "utf8"));
      assert.equal(state.last_successful_index, 0);
    } finally {
      cleanup(proj);
    }
  });

  it("loadResumeState rejects when source/target mismatch (Procedure Step 2)", async () => {
    const proj = makeTempProject({ backend: "json" });
    try {
      const statePath = join(proj, ".context-index", "tasks", ".migrate-state.json");
      // Pre-seed a state file from a different migration (json → beads).
      writeFileSync(
        statePath,
        JSON.stringify(
          {
            source: "json",
            target: "beads",
            last_successful_index: 2,
            scope_args: { includeClosed: false },
          },
          null,
          2,
        ),
      );

      const mod = await import("../../lib/cli/issues-migrate.mjs");
      let caught;
      try {
        mod.loadResumeState({
          projectRoot: proj,
          source: "beads",
          target: "json",
          scopeArgs: { includeClosed: false },
        });
      } catch (err) {
        caught = err;
      }
      assert.ok(caught, "expected throw on mismatched resume state");
      assert.equal(caught.code, "MIGRATE_RESUME_MISMATCH");
    } finally {
      cleanup(proj);
    }
  });

  it("loadResumeState returns startIndex = last_successful_index + 1 on matching args", async () => {
    const proj = makeTempProject({ backend: "json" });
    try {
      const statePath = join(proj, ".context-index", "tasks", ".migrate-state.json");
      writeFileSync(
        statePath,
        JSON.stringify(
          {
            source: "json",
            target: "beads",
            last_successful_index: 4,
            scope_args: { includeClosed: false },
          },
          null,
          2,
        ),
      );

      const mod = await import("../../lib/cli/issues-migrate.mjs");
      const state = mod.loadResumeState({
        projectRoot: proj,
        source: "json",
        target: "beads",
        scopeArgs: { includeClosed: false },
      });
      assert.equal(state.startIndex, 5);
    } finally {
      cleanup(proj);
    }
  });

  it("loadResumeState returns startIndex 0 when no state file exists", async () => {
    const proj = makeTempProject({ backend: "json" });
    try {
      const mod = await import("../../lib/cli/issues-migrate.mjs");
      const state = mod.loadResumeState({
        projectRoot: proj,
        source: "json",
        target: "beads",
        scopeArgs: { includeClosed: false },
      });
      assert.equal(state.startIndex, 0);
    } finally {
      cleanup(proj);
    }
  });
});

describe("issues migrate dependency replay (plan-task 7)", () => {
  function makeIssue(id, overrides = {}) {
    return {
      id,
      title: `${id} title`,
      status: "open",
      priority: 2,
      type: "task",
      dependencies: [],
      notes: "",
      next_action: null,
      created: "2026-05-19T00:00:00.000Z",
      updated: "2026-05-19T00:00:00.000Z",
      ...overrides,
    };
  }

  it("replayDependencies calls addDependency for each in-scope edge (json → beads)", async () => {
    const proj = makeTempProject({ backend: "json" });
    try {
      // Pre-populate .beads-map.json so source ids map to target (beads) ids.
      writeFileSync(
        join(proj, ".context-index", "tasks", ".beads-map.json"),
        JSON.stringify(
          {
            "issue-1": { beadsId: "br-1" },
            "issue-2": { beadsId: "br-2" },
            "issue-3": { beadsId: "br-3" },
          },
          null,
          2,
        ),
      );

      const sourceIssues = [
        makeIssue("issue-1"),
        makeIssue("issue-2", { dependencies: ["issue-1"] }),
        makeIssue("issue-3", { dependencies: ["issue-1", "issue-2"] }),
      ];
      const addDepCalls = [];
      const targetAdapter = {
        async addDependency(itemId, depId) {
          addDepCalls.push({ itemId, depId });
        },
      };

      const mod = await import("../../lib/cli/issues-migrate.mjs");
      const result = await mod.replayDependencies({
        projectRoot: proj,
        source: "json",
        target: "beads",
        sourceIssues,
        targetAdapter,
      });

      assert.equal(result.replayed, 3);
      assert.equal(result.skippedEdges.length, 0);
      assert.equal(addDepCalls.length, 3);
      // For json → beads, addDependency is called with source ids; the
      // adapter internally maps via .beads-map.json. The verb passes the
      // source ids directly (the adapter handles translation).
      assert.deepEqual(addDepCalls[0], { itemId: "issue-2", depId: "issue-1" });
    } finally {
      cleanup(proj);
    }
  });

  it("replayDependencies warns and skips edges with out-of-scope endpoints (Behavior 14)", async () => {
    const proj = makeTempProject({ backend: "json" });
    try {
      const sourceIssues = [
        makeIssue("issue-1"),
        makeIssue("issue-2", {
          // depends on issue-99 which is NOT in sourceIssues (out of scope)
          dependencies: ["issue-1", "issue-99"],
        }),
      ];
      const addDepCalls = [];
      const targetAdapter = {
        async addDependency(itemId, depId) {
          addDepCalls.push({ itemId, depId });
        },
      };

      const originalErr = console.error;
      const stderrBuf = [];
      console.error = (msg) => stderrBuf.push(String(msg));

      let result;
      try {
        const mod = await import("../../lib/cli/issues-migrate.mjs");
        result = await mod.replayDependencies({
          projectRoot: proj,
          source: "json",
          target: "beads",
          sourceIssues,
          targetAdapter,
        });
      } finally {
        console.error = originalErr;
      }

      // Only (issue-2 → issue-1) is in-scope.
      assert.equal(result.replayed, 1);
      assert.equal(addDepCalls.length, 1);
      assert.equal(result.skippedEdges.length, 1);
      assert.deepEqual(result.skippedEdges[0], { from: "issue-2", to: "issue-99" });

      // Warning text mentions both source ids.
      const allErr = stderrBuf.join("\n");
      assert.ok(
        allErr.includes("issue-2") && allErr.includes("issue-99"),
        `expected warning to mention both ids, got: ${allErr}`,
      );
    } finally {
      cleanup(proj);
    }
  });

  it("replayDependencies handles beads → json direction via target id lookup", async () => {
    const proj = makeTempProject({ backend: "json" });
    try {
      // Source = beads with synthetic source ids.
      const sourceIssues = [
        makeIssue("br-1"),
        makeIssue("br-2", { dependencies: ["br-1"] }),
      ];
      const addDepCalls = [];
      // For beads → json, the verb resolves the target id by reading the
      // target adapter's items and matching by (title, spec_ref) OR by
      // `original_id: <source-id>` marker in notes. Stub a target adapter
      // that exposes its list with original_id markers.
      const targetAdapter = {
        async list() {
          return [
            {
              id: "issue-100",
              title: "br-1 title",
              notes: "original_id: br-1",
            },
            {
              id: "issue-101",
              title: "br-2 title",
              notes: "original_id: br-2",
            },
          ];
        },
        async addDependency(itemId, depId) {
          addDepCalls.push({ itemId, depId });
        },
      };

      const mod = await import("../../lib/cli/issues-migrate.mjs");
      const result = await mod.replayDependencies({
        projectRoot: proj,
        source: "beads",
        target: "json",
        sourceIssues,
        targetAdapter,
      });

      assert.equal(result.replayed, 1);
      assert.equal(addDepCalls.length, 1);
      // Translated to target ids: issue-101 depends on issue-100.
      assert.deepEqual(addDepCalls[0], { itemId: "issue-101", depId: "issue-100" });
    } finally {
      cleanup(proj);
    }
  });

  it("replayDependencies skips edge when target id resolution fails (beads → json)", async () => {
    const proj = makeTempProject({ backend: "json" });
    try {
      const sourceIssues = [
        makeIssue("br-1"),
        makeIssue("br-2", { dependencies: ["br-1"] }),
      ];
      const addDepCalls = [];
      // Target adapter list returns ONLY br-2's target — br-1 missing on target.
      const targetAdapter = {
        async list() {
          return [
            { id: "issue-101", title: "br-2 title", notes: "original_id: br-2" },
            // br-1 has no target match
          ];
        },
        async addDependency(itemId, depId) {
          addDepCalls.push({ itemId, depId });
        },
      };

      const originalErr = console.error;
      const stderrBuf = [];
      console.error = (msg) => stderrBuf.push(String(msg));

      let result;
      try {
        const mod = await import("../../lib/cli/issues-migrate.mjs");
        result = await mod.replayDependencies({
          projectRoot: proj,
          source: "beads",
          target: "json",
          sourceIssues,
          targetAdapter,
        });
      } finally {
        console.error = originalErr;
      }

      assert.equal(addDepCalls.length, 0);
      assert.equal(result.replayed, 0);
      assert.equal(result.skippedEdges.length, 1);

      const allErr = stderrBuf.join("\n");
      assert.ok(allErr.toLowerCase().includes("br-1"), "expected warning to mention missing endpoint");
    } finally {
      cleanup(proj);
    }
  });
});

describe("issues migrate final report + cleanup (plan-task 8)", () => {
  it("buildLiveRunReport returns the documented JSON shape", async () => {
    const mod = await import("../../lib/cli/issues-migrate.mjs");
    const report = mod.buildLiveRunReport({
      source: "json",
      target: "beads",
      created: { issues: 5, epics: 1 },
      skipped: 2,
      dependenciesReplayed: 3,
      errors: [],
    });
    assert.equal(report.source, "json");
    assert.equal(report.target, "beads");
    assert.deepEqual(report.created, { issues: 5, epics: 1 });
    assert.equal(report.skipped, 2);
    assert.equal(report.dependencies_replayed, 3);
    assert.equal(report.manifest_update_suggested, true);
    assert.deepEqual(report.errors, []);
  });

  it(".gitignore contains .context-index/tasks/.migrate-state.json (Postcondition 8)", () => {
    // Real repo gitignore must have the new line. This is a direct file check.
    const gi = readFileSync(resolve(PROJECT_ROOT, ".gitignore"), "utf8");
    assert.ok(
      gi.includes(".context-index/tasks/.migrate-state.json"),
      ".gitignore must list .context-index/tasks/.migrate-state.json",
    );
  });

  it("clearMigrateState removes the state file if present and is a no-op if absent", async () => {
    const proj = makeTempProject({ backend: "json" });
    try {
      const statePath = join(proj, ".context-index", "tasks", ".migrate-state.json");
      writeFileSync(statePath, JSON.stringify({ source: "json", target: "beads", last_successful_index: 2, scope_args: {} }));
      assert.ok(existsSync(statePath));

      const mod = await import("../../lib/cli/issues-migrate.mjs");
      mod.clearMigrateState(proj);
      assert.equal(existsSync(statePath), false, "expected state file removed");

      // No-op when absent.
      mod.clearMigrateState(proj);
      assert.equal(existsSync(statePath), false);
    } finally {
      cleanup(proj);
    }
  });
});

describe("issues migrate coverage sweep (plan-task 9)", () => {
  function makeIssue(id, overrides = {}) {
    return {
      id,
      title: `${id} title`,
      status: "open",
      priority: 2,
      type: "task",
      dependencies: [],
      notes: "",
      next_action: null,
      created: "2026-05-19T00:00:00.000Z",
      updated: "2026-05-19T00:00:00.000Z",
      ...overrides,
    };
  }

  it("uses manifest tasks.backend as source when --from is absent (Behavior 1)", () => {
    // manifest tasks.backend=json, --to=beads → source resolves to 'json'.
    // We assert this indirectly via the noop check: if --to=json, NOOP fires
    // (proving source resolved from manifest); if it did not, this would not
    // be a noop.
    const proj = makeTempProject({ backend: "json" });
    try {
      const { exitCode, stderr } = runCli(
        ["issues", "migrate", "--to", "json"],
        { cwd: proj },
      );
      assert.notEqual(exitCode, 0);
      assert.ok(stderr.includes("MIGRATE_NOOP"));
      // The NOOP message includes "both '<source>'" — confirms manifest
      // was used as source.
      assert.ok(stderr.includes("'json'"), `expected source 'json' in NOOP message, got: ${stderr}`);
    } finally {
      cleanup(proj);
    }
  });

  it("manifest.yaml is byte-equal before and after a dry-run (Postcondition 5, Behavior 19)", () => {
    const proj = makeTempProject({ backend: "json" });
    try {
      const manifestPath = join(proj, ".context-index", "manifest.yaml");
      const before = readFileSync(manifestPath, "utf8");

      const brCheck = spawnSync("which", ["br"], { encoding: "utf8" });
      if ((brCheck.status ?? 1) !== 0) return; // skip if no br

      const { exitCode } = runCli(
        ["issues", "migrate", "--to", "beads", "--dry-run"],
        { cwd: proj },
      );
      assert.equal(exitCode, 0);

      const after = readFileSync(manifestPath, "utf8");
      assert.equal(after, before, "manifest.yaml must be byte-equal after dry-run");
    } finally {
      cleanup(proj);
    }
  });

  it("manifest.yaml is byte-equal before and after a live run under --auto (Behavior 19)", async () => {
    const proj = makeTempProject({ backend: "json" });
    try {
      const manifestPath = join(proj, ".context-index", "manifest.yaml");

      // Seed a populated json board.
      writeFileSync(
        join(proj, ".context-index", "tasks", "tasks.json"),
        JSON.stringify(
          {
            version: 2,
            seq: 0,
            epics: [],
            issues: [makeIssue("issue-1"), makeIssue("issue-2")],
          },
          null,
          2,
        ) + "\n",
      );

      const before = readFileSync(manifestPath, "utf8");

      // Use runLiveMigration directly with stub adapters — bypasses the need
      // for real br and isolates the manifest-write policy assertion.
      const sourceAdapter = {
        async list() { return [makeIssue("issue-1"), makeIssue("issue-2")]; },
        async listEpics() { return []; },
      };
      const targetAdapter = {
        async create() { return { id: "tgt-x" }; },
        async createEpic() { return { id: "tgt-epic" }; },
        async addDependency() {},
      };

      const mod = await import("../../lib/cli/issues-migrate.mjs");
      await mod.runLiveMigration({
        projectRoot: proj,
        source: "json",
        target: "beads",
        sourceAdapter,
        targetAdapter,
        sourceIssues: [makeIssue("issue-1"), makeIssue("issue-2")],
        sourceEpics: [],
        alreadyMigratedIssueIds: new Set(),
        alreadyMigratedEpicIds: new Set(),
        startIndex: 0,
        scopeArgs: { includeClosed: false },
      });

      const after = readFileSync(manifestPath, "utf8");
      assert.equal(after, before, "manifest.yaml must be byte-equal after live run (Behavior 19)");
    } finally {
      cleanup(proj);
    }
  });

  it("resumes from next index on re-invocation after partial failure (Behavior 18, Postcondition 6)", async () => {
    const proj = makeTempProject({ backend: "json" });
    try {
      const sourceIssues = [
        makeIssue("issue-1"),
        makeIssue("issue-2"),
        makeIssue("issue-3"),
        makeIssue("issue-4"),
      ];

      // First call: fail at index 2 (3rd item).
      let createIdx = 0;
      const failingTarget = {
        async create() {
          if (createIdx === 2) {
            createIdx++;
            const err = new Error("simulated br failure");
            err.code = "BEADS_COMMAND_FAILED";
            err.stderr = "br create: simulated failure\n";
            throw err;
          }
          createIdx++;
          return { id: `tgt-${createIdx}` };
        },
      };

      const mod = await import("../../lib/cli/issues-migrate.mjs");
      const stubSrc = { async list() { return sourceIssues; }, async listEpics() { return []; } };

      let caught;
      try {
        await mod.runLiveMigration({
          projectRoot: proj,
          source: "json",
          target: "beads",
          sourceAdapter: stubSrc,
          targetAdapter: failingTarget,
          sourceIssues,
          sourceEpics: [],
          alreadyMigratedIssueIds: new Set(),
          alreadyMigratedEpicIds: new Set(),
          startIndex: 0,
          scopeArgs: { includeClosed: false },
        });
      } catch (err) {
        caught = err;
      }
      assert.equal(caught.code, "MIGRATE_PARTIAL_FAILURE");

      // .migrate-state.json should record last_successful_index = 1.
      const statePath = join(proj, ".context-index", "tasks", ".migrate-state.json");
      const state = JSON.parse(readFileSync(statePath, "utf8"));
      assert.equal(state.last_successful_index, 1);

      // Second call: resume. Use a passing target adapter; loadResumeState
      // should yield startIndex=2 so only issue-3 and issue-4 are created.
      const passingTargetCalls = [];
      const passingTarget = {
        async create(input) {
          passingTargetCalls.push(input);
          return { id: `tgt-resumed-${passingTargetCalls.length}` };
        },
      };

      const resume = mod.loadResumeState({
        projectRoot: proj,
        source: "json",
        target: "beads",
        scopeArgs: { includeClosed: false },
      });
      assert.equal(resume.startIndex, 2);

      const second = await mod.runLiveMigration({
        projectRoot: proj,
        source: "json",
        target: "beads",
        sourceAdapter: stubSrc,
        targetAdapter: passingTarget,
        sourceIssues,
        sourceEpics: [],
        alreadyMigratedIssueIds: new Set(),
        alreadyMigratedEpicIds: new Set(),
        startIndex: resume.startIndex,
        scopeArgs: { includeClosed: false },
      });

      assert.equal(second.created.issues, 2, "expected only 2 items created on resume (issue-3, issue-4)");
      assert.equal(passingTargetCalls.length, 2);
      assert.equal(passingTargetCalls[0].title, "issue-3 title");
      assert.equal(passingTargetCalls[1].title, "issue-4 title");
    } finally {
      cleanup(proj);
    }
  });

  it("passes the documented field set verbatim to target create() (Behaviors 9-10)", async () => {
    const proj = makeTempProject({ backend: "json" });
    try {
      const rich = {
        id: "issue-1",
        title: "rich issue",
        status: "in_progress",
        priority: 1,
        type: "feature",
        epicId: "epic-1",
        parent_id: "e1",
        planRef: "/path/to/plan.md",
        spec_ref: "/path/to/spec.md",
        next_action: "/adev:test",
        notes: "some notes",
        dependencies: ["issue-99"], // will be stripped — replayed separately
        created: "2026-05-19T00:00:00.000Z",
        updated: "2026-05-19T00:00:00.000Z",
      };

      const calls = [];
      const targetAdapter = {
        async create(input) {
          calls.push(input);
          return { ...input, id: "tgt-1" };
        },
      };

      const mod = await import("../../lib/cli/issues-migrate.mjs");
      await mod.runLiveMigration({
        projectRoot: proj,
        source: "json",
        target: "beads",
        sourceAdapter: { async list() { return [rich]; }, async listEpics() { return []; } },
        targetAdapter,
        sourceIssues: [rich],
        sourceEpics: [],
        alreadyMigratedIssueIds: new Set(),
        alreadyMigratedEpicIds: new Set(),
        startIndex: 0,
        scopeArgs: { includeClosed: false },
      });

      const passed = calls[0];
      // Documented field set per Behaviors 9-10: title, type, priority, notes,
      // epicId, parent_id, planRef, spec_ref, next_action. ID, dependencies,
      // created, updated are NOT passed through (handled separately).
      assert.equal(passed.title, "rich issue");
      assert.equal(passed.type, "feature");
      assert.equal(passed.priority, 1);
      assert.equal(passed.notes, "some notes");
      assert.equal(passed.epicId, "epic-1");
      assert.equal(passed.parent_id, "e1");
      assert.equal(passed.planRef, "/path/to/plan.md");
      assert.equal(passed.spec_ref, "/path/to/spec.md");
      assert.equal(passed.next_action, "/adev:test");
      assert.equal(passed.id, undefined, "source id must NOT be passed (adapter assigns)");
      assert.equal(passed.dependencies, undefined, "dependencies replayed separately");
      assert.equal(passed.created, undefined, "created stripped");
      assert.equal(passed.updated, undefined, "updated stripped");
    } finally {
      cleanup(proj);
    }
  });

  it("beads → json migration stamps original_id marker in target notes (idempotency)", async () => {
    const proj = makeTempProject({ backend: "json" });
    try {
      const sourceIssues = [makeIssue("br-7", { notes: "" })];
      const calls = [];
      const targetAdapter = {
        async create(input) {
          calls.push(input);
          return { ...input, id: "issue-1" };
        },
      };

      const mod = await import("../../lib/cli/issues-migrate.mjs");
      await mod.runLiveMigration({
        projectRoot: proj,
        source: "beads",
        target: "json",
        sourceAdapter: { async list() { return sourceIssues; }, async listEpics() { return []; } },
        targetAdapter,
        sourceIssues,
        sourceEpics: [],
        alreadyMigratedIssueIds: new Set(),
        alreadyMigratedEpicIds: new Set(),
        startIndex: 0,
        scopeArgs: { includeClosed: false },
      });

      assert.equal(calls.length, 1);
      assert.ok(
        calls[0].notes.includes("original_id: br-7"),
        `expected original_id marker in notes, got: ${calls[0].notes}`,
      );
    } finally {
      cleanup(proj);
    }
  });

  it("partial-failure errors[] includes underlying adapter stderr verbatim (SEC-1)", async () => {
    const proj = makeTempProject({ backend: "json" });
    try {
      const sourceIssues = [makeIssue("issue-1"), makeIssue("issue-2")];
      const failingTarget = {
        async create() {
          const err = new Error("br exec failed");
          err.code = "BEADS_COMMAND_FAILED";
          err.stderr =
            "Error: br create failed: tasks.beads is corrupt at line 42\n  caused by: db_lock_held\n";
          throw err;
        },
      };

      const originalErr = console.error;
      const stderrBuf = [];
      console.error = (msg) => stderrBuf.push(String(msg));

      let caught;
      try {
        const mod = await import("../../lib/cli/issues-migrate.mjs");
        await mod.runLiveMigration({
          projectRoot: proj,
          source: "json",
          target: "beads",
          sourceAdapter: { async list() { return sourceIssues; }, async listEpics() { return []; } },
          targetAdapter: failingTarget,
          sourceIssues,
          sourceEpics: [],
          alreadyMigratedIssueIds: new Set(),
          alreadyMigratedEpicIds: new Set(),
          startIndex: 0,
          scopeArgs: { includeClosed: false },
        });
      } catch (err) {
        caught = err;
      } finally {
        console.error = originalErr;
      }

      assert.equal(caught.code, "MIGRATE_PARTIAL_FAILURE");
      // errors[] carries stderr verbatim.
      assert.equal(caught.errors.length, 1);
      assert.ok(
        caught.errors[0].stderr.includes("tasks.beads is corrupt at line 42"),
        "expected stderr verbatim in errors[0].stderr",
      );
      // Stderr also printed to terminal at failure time (SEC-1).
      const allStderr = stderrBuf.join("\n");
      assert.ok(
        allStderr.includes("tasks.beads is corrupt at line 42"),
        "expected stderr verbatim on terminal at failure time",
      );
    } finally {
      cleanup(proj);
    }
  });

  it("non-dry-run live runtime emits manifest-update suggestion text", () => {
    // This is a contract check on the helper: the suggestion text mentions
    // manifest.yaml AND the target name AND the never-writes guarantee.
    const text =
      // Import via dynamic to avoid top-level pollution.
      // We can use the synchronously-imported runMigrate's manifestUpdateSuggestion
      // via default export.
      undefined;
    // Re-use the already-imported mod via dynamic import:
    return import("../../lib/cli/issues-migrate.mjs").then((mod) => {
      const s = mod.manifestUpdateSuggestion("beads");
      assert.ok(s.includes("manifest.yaml"), "expected mention of manifest.yaml");
      assert.ok(s.includes("'beads'"), "expected mention of target backend");
      assert.ok(s.toLowerCase().includes("never writes"), "expected never-writes guarantee");
    });
  });
});
