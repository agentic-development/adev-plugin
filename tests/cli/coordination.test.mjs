// tests/cli/coordination.test.mjs
//
// Tests for `adev coordination scan` (lib/cli/coordination.mjs) — the
// pre-flight concurrency scan wired into `/adev:work` Step 1.
//
// Spec: .context-index/specs/features/work/work-triage-and-routing.spec.md
// Issue: issue-606 (epic-107)
//
// External processes (`gh`, `git`) are stubbed through the injectable `exec`
// runner, except for one spawned-CLI test that proves real gh-absence
// degradation by running the CLI with a PATH that contains `git` but no `gh`.

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  symlinkSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  run,
  help,
  scanCoordination,
  formatReport,
  resolveOperatorIdentity,
} from "../../lib/cli/coordination.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..", "..");
const CLI = resolve(PROJECT_ROOT, "cli", "index.mjs");

const MANIFEST = { tasks: { backend: "json" } };

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeProject(issues = []) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "adev-coordination-test-")));
  mkdirSync(join(dir, ".context-index", "tasks"), { recursive: true });
  writeFileSync(join(dir, ".context-index", "manifest.yaml"), "tasks:\n  backend: json\n");
  writeFileSync(
    join(dir, ".context-index", "tasks", "tasks.json"),
    JSON.stringify({ version: 2, seq: issues.length, epics: [], issues }, null, 2),
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

function issue(id, overrides = {}) {
  return {
    id,
    title: `title for ${id}`,
    status: "in_progress",
    priority: 2,
    type: "feature",
    dependencies: [],
    created: "2026-08-01T00:00:00.000Z",
    updated: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

const isoDaysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

/**
 * Build a fake command runner.
 *
 * @param {object} spec
 * @param {object} [spec.gh]      - { stdout } | { status } | { error: { code } }
 * @param {string} [spec.branch]  - current branch reported by `git rev-parse`
 * @param {string} [spec.refs]    - raw `git for-each-ref` stdout
 * @param {string} [spec.headRef] - `origin/<default>` reported by symbolic-ref
 */
function fakeExec(spec = {}) {
  const calls = [];
  const runner = (command, args) => {
    calls.push([command, ...args].join(" "));
    if (command === "gh") {
      const gh = spec.gh ?? { stdout: "[]" };
      if (gh.error) return { status: null, stdout: "", stderr: "", error: gh.error };
      return {
        status: gh.status ?? 0,
        stdout: gh.stdout ?? "",
        stderr: gh.stderr ?? "",
        error: undefined,
      };
    }
    if (command === "git") {
      if (args[0] === "rev-parse") {
        return { status: 0, stdout: `${spec.branch ?? "feat/mine"}\n`, stderr: "", error: undefined };
      }
      if (args[0] === "symbolic-ref") {
        return spec.headRef
          ? { status: 0, stdout: `${spec.headRef}\n`, stderr: "", error: undefined }
          : { status: 1, stdout: "", stderr: "", error: undefined };
      }
      if (args[0] === "for-each-ref") {
        return { status: 0, stdout: spec.refs ?? "", stderr: "", error: undefined };
      }
    }
    return { status: 127, stdout: "", stderr: "", error: undefined };
  };
  runner.calls = calls;
  return runner;
}

/** Capture console output while running `fn`. */
async function capture(fn) {
  const out = [];
  const err = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...a) => out.push(a.join(" "));
  console.error = (...a) => err.push(a.join(" "));
  try {
    const code = await fn();
    return { code, out: out.join("\n"), err: err.join("\n") };
  } finally {
    console.log = origLog;
    console.error = origErr;
  }
}

// ---------------------------------------------------------------------------
// Driver-substrate contract
// ---------------------------------------------------------------------------

describe("driver-substrate contract", () => {
  it("exports run and help", () => {
    assert.equal(typeof run, "function");
    assert.equal(typeof help, "function");
  });

  it("does NOT export LIFECYCLE_STEP (the scan is observational)", async () => {
    const mod = await import("../../lib/cli/coordination.mjs");
    assert.equal(mod.LIFECYCLE_STEP, undefined);
  });

  it("is registered in the CLI verb table", async () => {
    const { VERB_REGISTRY } = await import("../../cli/index.mjs");
    assert.ok(VERB_REGISTRY.has("coordination"));
  });
});

// ---------------------------------------------------------------------------
// Operator identity
// ---------------------------------------------------------------------------

describe("operator identity", () => {
  const saved = process.env.ADEV_ISSUE_OWNER;
  after(() => {
    if (saved === undefined) delete process.env.ADEV_ISSUE_OWNER;
    else process.env.ADEV_ISSUE_OWNER = saved;
  });

  it("prefers an explicit owner over the environment", () => {
    process.env.ADEV_ISSUE_OWNER = "from-env";
    assert.deepEqual(resolveOperatorIdentity("from-flag"), {
      owner: "from-flag",
      source: "flag",
    });
  });

  it("falls back to ADEV_ISSUE_OWNER — the same chain `adev issues claim` uses", () => {
    process.env.ADEV_ISSUE_OWNER = "agent-a";
    assert.deepEqual(resolveOperatorIdentity(undefined), { owner: "agent-a", source: "env" });
  });

  it("reports unresolved rather than failing when neither is set", () => {
    delete process.env.ADEV_ISSUE_OWNER;
    assert.deepEqual(resolveOperatorIdentity(undefined), { owner: null, source: "unresolved" });
  });
});

// ---------------------------------------------------------------------------
// gh degradation — the scan must never fail
// ---------------------------------------------------------------------------

describe("gh degradation", () => {
  let dir;
  before(() => {
    dir = makeProject();
  });
  after(() => cleanup(dir));

  it("degrades cleanly when gh is not installed (ENOENT)", async () => {
    const err = new Error("spawnSync gh ENOENT");
    err.code = "ENOENT";
    const report = await scanCoordination({
      projectRoot: dir,
      manifest: MANIFEST,
      exec: fakeExec({ gh: { error: err } }),
    });
    assert.equal(report.pull_requests.available, false);
    assert.equal(report.pull_requests.reason, "gh-not-installed");
    assert.deepEqual(report.pull_requests.items, []);
    assert.equal(report.pull_requests.total, 0);
  });

  it("degrades when gh is present but unauthenticated / has no GitHub remote (non-zero exit)", async () => {
    const report = await scanCoordination({
      projectRoot: dir,
      manifest: MANIFEST,
      exec: fakeExec({ gh: { status: 4, stderr: "gh: not authenticated" } }),
    });
    assert.equal(report.pull_requests.available, false);
    assert.equal(report.pull_requests.reason, "gh-unavailable");
  });

  it("degrades when gh times out", async () => {
    const err = new Error("timeout");
    err.code = "ETIMEDOUT";
    const report = await scanCoordination({
      projectRoot: dir,
      manifest: MANIFEST,
      exec: fakeExec({ gh: { error: err } }),
    });
    assert.equal(report.pull_requests.available, false);
    assert.equal(report.pull_requests.reason, "gh-exec-failed:ETIMEDOUT");
  });

  it("degrades when gh emits something that is not JSON", async () => {
    const report = await scanCoordination({
      projectRoot: dir,
      manifest: MANIFEST,
      exec: fakeExec({ gh: { stdout: "not json at all" } }),
    });
    assert.equal(report.pull_requests.available, false);
    assert.equal(report.pull_requests.reason, "gh-output-unparseable");
  });

  it("a fully degraded scan still exits 0 and never claims 'none detected'", async () => {
    const err = new Error("nope");
    err.code = "ENOENT";
    const gitless = () => ({ status: null, stdout: "", stderr: "", error: err });
    const report = await scanCoordination({
      projectRoot: dir,
      manifest: { tasks: { backend: "nope-not-a-backend" } },
      exec: gitless,
    });
    assert.equal(report.concurrent_work, false);
    assert.equal(report.remote_branches.reason, "git-not-installed");
    const text = formatReport(report);
    // Degraded means UNKNOWN, never "no concurrent work" (spec behavior 16).
    assert.match(text, /not scanned — no signal available/);
    assert.doesNotMatch(text, /none detected/);
    assert.match(text, /gh-not-installed/);
  });

  it("renders '?' rather than '0' for a bucket that was never read", async () => {
    const err = new Error("nope");
    err.code = "ENOENT";
    const report = await scanCoordination({
      projectRoot: dir,
      manifest: MANIFEST,
      exec: fakeExec({
        gh: { error: err },
        refs: `origin/feat/other\t${isoDaysAgo(1)}\tagent-a`,
        headRef: "origin/main",
      }),
    });
    const text = formatReport(report);
    assert.match(text, /\? open PRs/);
    assert.doesNotMatch(text, /0 open PRs/);
  });

  it("run() exits 0 when every signal is unavailable", async () => {
    const err = new Error("nope");
    err.code = "ENOENT";
    const gitless = () => ({ status: null, stdout: "", stderr: "", error: err });
    const { code } = await capture(() =>
      run({
        projectRoot: dir,
        argv: ["scan"],
        manifest: { tasks: { backend: "nope-not-a-backend" } },
        exec: gitless,
      }),
    );
    assert.equal(code, 0);
  });
});

// ---------------------------------------------------------------------------
// Pull requests
// ---------------------------------------------------------------------------

describe("open pull requests", () => {
  let dir;
  before(() => {
    dir = makeProject();
  });
  after(() => cleanup(dir));

  const prJson = JSON.stringify([
    {
      number: 214,
      title: "fix(security): sanitize the path",
      headRefName: "fix/issue-582",
      author: { login: "agent-a" },
      updatedAt: "2026-08-12T10:00:00Z",
      isDraft: false,
    },
    {
      number: 215,
      title: "my own work",
      headRefName: "feat/mine",
      author: { login: "agent-b" },
      updatedAt: "2026-08-12T11:00:00Z",
      isDraft: false,
    },
  ]);

  it("lists other agents' open PRs and excludes the PR for the current branch", async () => {
    const report = await scanCoordination({
      projectRoot: dir,
      manifest: MANIFEST,
      exec: fakeExec({ gh: { stdout: prJson }, branch: "feat/mine" }),
    });
    assert.equal(report.pull_requests.available, true);
    assert.equal(report.pull_requests.total, 1);
    assert.deepEqual(
      report.pull_requests.items.map((p) => p.number),
      [214],
    );
    assert.equal(report.pull_requests.items[0].author, "agent-a");
    assert.equal(report.pull_requests.items[0].branch, "fix/issue-582");
  });

  it("truncates to --limit and reports the untruncated total", async () => {
    const many = JSON.stringify(
      Array.from({ length: 7 }, (_, i) => ({
        number: i + 1,
        title: `pr ${i}`,
        headRefName: `b${i}`,
        author: { login: "x" },
        updatedAt: "2026-08-12T10:00:00Z",
      })),
    );
    const report = await scanCoordination({
      projectRoot: dir,
      manifest: MANIFEST,
      limit: 2,
      exec: fakeExec({ gh: { stdout: many } }),
    });
    assert.equal(report.pull_requests.total, 7);
    assert.equal(report.pull_requests.items.length, 2);
    assert.equal(report.pull_requests.truncated, true);
    assert.match(formatReport(report), /\+5 more/);
  });
});

// ---------------------------------------------------------------------------
// Remote branches
// ---------------------------------------------------------------------------

describe("remote branches", () => {
  let dir;
  before(() => {
    dir = makeProject();
  });
  after(() => cleanup(dir));

  const refs = [
    ["origin/HEAD", isoDaysAgo(1), "someone"],
    ["origin/main", isoDaysAgo(1), "someone"],
    ["origin/feat/mine", isoDaysAgo(1), "me"],
    ["origin/feat/epic-102", isoDaysAgo(2), "agent-a"],
    ["origin/chore/ancient", isoDaysAgo(400), "ghost"],
    ["origin", isoDaysAgo(1), "someone"],
  ]
    .map((r) => r.join("\t"))
    .join("\n");

  it("excludes HEAD, the default branch, the current branch, bare remotes, and stale branches", async () => {
    const report = await scanCoordination({
      projectRoot: dir,
      manifest: MANIFEST,
      exec: fakeExec({ refs, branch: "feat/mine", headRef: "origin/main" }),
    });
    assert.equal(report.remote_branches.available, true);
    assert.deepEqual(
      report.remote_branches.items.map((b) => b.name),
      ["origin/feat/epic-102"],
    );
  });

  it("falls back to origin/main + origin/master when symbolic-ref is unavailable", async () => {
    const report = await scanCoordination({
      projectRoot: dir,
      manifest: MANIFEST,
      exec: fakeExec({ refs, branch: "feat/mine" }),
    });
    assert.deepEqual(
      report.remote_branches.items.map((b) => b.name),
      ["origin/feat/epic-102"],
    );
  });

  it("honours --branch-age-days via branchAgeDays", async () => {
    const report = await scanCoordination({
      projectRoot: dir,
      manifest: MANIFEST,
      branchAgeDays: 1000,
      exec: fakeExec({ refs, branch: "feat/mine", headRef: "origin/main" }),
    });
    assert.deepEqual(
      report.remote_branches.items.map((b) => b.name).sort(),
      ["origin/chore/ancient", "origin/feat/epic-102"],
    );
  });

  it("degrades when git is absent", async () => {
    const err = new Error("no git");
    err.code = "ENOENT";
    const report = await scanCoordination({
      projectRoot: dir,
      manifest: MANIFEST,
      exec: (command) =>
        command === "git"
          ? { status: null, stdout: "", stderr: "", error: err }
          : { status: 0, stdout: "[]", stderr: "", error: undefined },
    });
    assert.equal(report.remote_branches.available, false);
    assert.equal(report.remote_branches.reason, "git-not-installed");
  });
});

// ---------------------------------------------------------------------------
// Board issues — the different-owner filter
// ---------------------------------------------------------------------------

describe("in_progress issues under a different owner", () => {
  let dir;
  const savedOwner = process.env.ADEV_ISSUE_OWNER;

  before(() => {
    dir = makeProject([
      issue("issue-582", { owner: "agent-b", claimed_at: "2026-08-12T09:00:00.000Z", branch: "fix/issue-582" }),
      issue("issue-590", { owner: "agent-a", claimed_at: "2026-08-12T09:30:00.000Z" }),
      issue("issue-600"), // in_progress, nobody claimed it
      issue("issue-601", { status: "open", owner: "agent-b" }), // not in_progress
      issue("issue-602", { status: "closed", owner: "agent-b" }),
    ]);
    delete process.env.ADEV_ISSUE_OWNER;
  });
  after(() => {
    cleanup(dir);
    if (savedOwner === undefined) delete process.env.ADEV_ISSUE_OWNER;
    else process.env.ADEV_ISSUE_OWNER = savedOwner;
  });

  it("excludes issues claimed by the current operator and keeps the rest", async () => {
    const report = await scanCoordination({
      projectRoot: dir,
      manifest: MANIFEST,
      owner: "agent-a",
      exec: fakeExec(),
    });
    assert.equal(report.issues.available, true);
    assert.deepEqual(
      report.issues.claimed_elsewhere.map((i) => i.id),
      ["issue-582"],
    );
    assert.equal(report.issues.claimed_elsewhere[0].owner, "agent-b");
    assert.equal(report.issues.claimed_elsewhere[0].branch, "fix/issue-582");
  });

  it("keeps unclaimed in_progress issues in their own bucket (the issue-582 signal)", async () => {
    const report = await scanCoordination({
      projectRoot: dir,
      manifest: MANIFEST,
      owner: "agent-a",
      exec: fakeExec(),
    });
    assert.deepEqual(
      report.issues.unclaimed.map((i) => i.id),
      ["issue-600"],
    );
    assert.equal(report.issues.total, 2);
  });

  it("never reports issues that are not in_progress", async () => {
    const report = await scanCoordination({
      projectRoot: dir,
      manifest: MANIFEST,
      owner: "agent-a",
      exec: fakeExec(),
    });
    const ids = [...report.issues.claimed_elsewhere, ...report.issues.unclaimed].map((i) => i.id);
    assert.ok(!ids.includes("issue-601"));
    assert.ok(!ids.includes("issue-602"));
  });

  it("over-reports every claimed issue when operator identity is unresolved", async () => {
    const report = await scanCoordination({
      projectRoot: dir,
      manifest: MANIFEST,
      exec: fakeExec(),
    });
    assert.equal(report.owner, null);
    assert.equal(report.owner_source, "unresolved");
    assert.deepEqual(
      report.issues.claimed_elsewhere.map((i) => i.id).sort(),
      ["issue-582", "issue-590"],
    );
    assert.match(formatReport(report), /operator identity unresolved/);
  });

  it("uses ADEV_ISSUE_OWNER when no owner is passed", async () => {
    process.env.ADEV_ISSUE_OWNER = "agent-b";
    try {
      const report = await scanCoordination({
        projectRoot: dir,
        manifest: MANIFEST,
        exec: fakeExec(),
      });
      assert.equal(report.owner_source, "env");
      assert.deepEqual(
        report.issues.claimed_elsewhere.map((i) => i.id),
        ["issue-590"],
      );
    } finally {
      delete process.env.ADEV_ISSUE_OWNER;
    }
  });

  it("degrades when the backend is unknown instead of throwing", async () => {
    const report = await scanCoordination({
      projectRoot: dir,
      manifest: { tasks: { backend: "not-a-backend" } },
      exec: fakeExec(),
    });
    assert.equal(report.issues.available, false);
    assert.match(report.issues.reason, /^board-unavailable:/);
    assert.deepEqual(report.issues.claimed_elsewhere, []);
  });
});

// ---------------------------------------------------------------------------
// Output surface
// ---------------------------------------------------------------------------

describe("--json output shape", () => {
  let dir;
  before(() => {
    dir = makeProject([issue("issue-582", { owner: "agent-b", claimed_at: "2026-08-12T09:00:00.000Z" })]);
  });
  after(() => cleanup(dir));

  it("emits one parseable JSON object with the documented buckets", async () => {
    const { code, out } = await capture(() =>
      run({
        projectRoot: dir,
        argv: ["scan", "--json", "--owner", "agent-a"],
        manifest: MANIFEST,
        exec: fakeExec({ refs: `origin/feat/other\t${isoDaysAgo(1)}\tagent-a`, headRef: "origin/main" }),
      }),
    );
    assert.equal(code, 0);
    const report = JSON.parse(out);
    assert.deepEqual(
      Object.keys(report).sort(),
      [
        "branch_age_days",
        "concurrent_work",
        "current_branch",
        "issues",
        "owner",
        "owner_source",
        "pull_requests",
        "remote_branches",
        "scanned_at",
        "signal_count",
      ],
    );
    for (const bucket of ["pull_requests", "remote_branches"]) {
      assert.deepEqual(
        Object.keys(report[bucket]).sort(),
        ["available", "items", "reason", "total", "truncated"],
      );
    }
    assert.deepEqual(
      Object.keys(report.issues).sort(),
      ["available", "claimed_elsewhere", "reason", "total", "truncated", "unclaimed"],
    );
    assert.equal(report.owner, "agent-a");
    assert.equal(report.owner_source, "flag");
    assert.equal(report.issues.claimed_elsewhere[0].id, "issue-582");
    assert.equal(typeof report.concurrent_work, "boolean");
    assert.equal(report.signal_count, report.issues.total + report.pull_requests.total + report.remote_branches.total);
  });

  it("keeps the default digest short", async () => {
    const report = await scanCoordination({
      projectRoot: dir,
      manifest: MANIFEST,
      owner: "agent-a",
      exec: fakeExec({
        gh: {
          stdout: JSON.stringify(
            Array.from({ length: 20 }, (_, i) => ({
              number: i,
              title: "x".repeat(200),
              headRefName: `b${i}`,
              author: { login: "a" },
              updatedAt: "2026-08-12T10:00:00Z",
            })),
          ),
        },
        refs: Array.from({ length: 20 }, (_, i) => `origin/b${i}\t${isoDaysAgo(1)}\ta`).join("\n"),
      }),
    });
    const lines = formatReport(report).split("\n");
    assert.ok(lines.length <= 22, `digest is ${lines.length} lines — too long for Step 1`);
    for (const line of lines) {
      assert.ok(line.length <= 120, `line too long: ${line}`);
    }
  });
});

describe("argument handling", () => {
  let dir;
  before(() => {
    dir = makeProject();
  });
  after(() => cleanup(dir));

  it("exits 1 on an unknown subcommand", async () => {
    const { code, err } = await capture(() =>
      run({ projectRoot: dir, argv: ["bogus"], manifest: MANIFEST }),
    );
    assert.equal(code, 1);
    assert.match(err, /usage: adev coordination scan/);
  });

  it("exits 1 on a non-positive --limit", async () => {
    const { code } = await capture(() =>
      run({ projectRoot: dir, argv: ["scan", "--limit", "0"], manifest: MANIFEST }),
    );
    assert.equal(code, 1);
  });

  it("exits 0 for --help", async () => {
    const { code, out } = await capture(() =>
      run({ projectRoot: dir, argv: ["--help"], manifest: MANIFEST }),
    );
    assert.equal(code, 0);
    assert.match(out, /coordination scan/);
  });
});

// ---------------------------------------------------------------------------
// End-to-end: gh genuinely absent from PATH (git still present)
// ---------------------------------------------------------------------------

describe("spawned CLI with no gh on PATH", () => {
  let dir;
  let binDir;

  before(() => {
    dir = makeProject([issue("issue-582", { owner: "agent-b", claimed_at: "2026-08-12T09:00:00.000Z" })]);
    // A PATH holding only git + node: scrubbing PATH entirely would break the
    // branch scan too and we would be testing the wrong degradation.
    binDir = realpathSync(mkdtempSync(join(tmpdir(), "adev-coordination-bin-")));
    for (const tool of ["git", "node"]) {
      try {
        const real = execFileSync("which", [tool], { encoding: "utf8" }).trim();
        if (real) symlinkSync(real, join(binDir, tool));
      } catch {
        // tool not found — the assertions below tolerate a degraded git too
      }
    }
  });
  after(() => {
    cleanup(dir);
    cleanup(binDir);
  });

  it("exits 0 and reports gh-not-installed without touching the network", () => {
    const res = spawnSync(process.execPath, [CLI, "coordination", "scan", "--json", "--owner", "agent-a"], {
      cwd: dir,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: binDir,
        ADEV_ISSUE_OWNER: "",
        ADEV_SILENCE_DEFAULT_BACKEND_ADVISORY: "1",
        ADEV_SILENCE_SHADOW_BOARD: "1",
      },
    });
    assert.equal(res.status, 0, `stderr: ${res.stderr}`);
    const report = JSON.parse(res.stdout);
    assert.equal(report.pull_requests.available, false);
    assert.equal(report.pull_requests.reason, "gh-not-installed");
    // The board signal is worktree-independent and must still be present.
    assert.deepEqual(
      report.issues.claimed_elsewhere.map((i) => i.id),
      ["issue-582"],
    );
  });
});
