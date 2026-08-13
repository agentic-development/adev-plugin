/**
 * Live `br` parity harness for the beads backend.
 *
 * Opt-in bucket (`npm run test:evals`) because it drives a REAL `br` binary
 * against a REAL SQLite workspace. Per the issue-612 decision, infra-dependent
 * suites are split into an explicit, printed bucket rather than silently
 * self-skipping — so when `br` is absent these tests FAIL LOUDLY with an
 * install hint instead of reporting green on an untested backend.
 *
 * What this pins, and why it cannot be pinned by a mock: the exclusivity
 * guarantee is `br`'s, not ours. `br update --claim` refuses a held issue
 * inside br's own transaction. A mocked br would assert our argv and prove
 * nothing about whether two agents can both win.
 *
 * Spec: .context-index/specs/features/task-management/backend-adapters.spec.md
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTempDir, cleanupTempDir } from "../../helpers.mjs";
import { BeadsAdapter, MIN_BR_VERSION } from "../../../lib/issues/beads-adapter.mjs";

/** Fail loudly — never skip — when the binary under test is missing. */
function requireBr() {
  let raw;
  try {
    raw = execFileSync("br", ["--version"], { encoding: "utf8", stdio: "pipe" });
  } catch {
    assert.fail(
      "`br` is not installed, so the beads backend cannot be verified. " +
        "Install from https://github.com/Dicklesworthstone/beads_rust/releases " +
        "or run the default bucket (`npm test`), which excludes this harness.",
    );
  }
  const version = String(raw).match(/(\d+\.\d+\.\d+)/)?.[1];
  assert.ok(version, `could not parse a version from \`br --version\`: ${raw}`);
  return version;
}

/** A git repo + initialized beads workspace + manifest, i.e. a real project. */
function makeBeadsProject() {
  const dir = createTempDir();
  mkdirSync(join(dir, ".context-index"), { recursive: true });
  writeFileSync(
    join(dir, ".context-index", "manifest.yaml"),
    "tasks:\n  backend: beads\n",
  );
  execFileSync("git", ["init", "-q", "-b", "main", "."], { cwd: dir, stdio: "pipe" });
  execFileSync("br", ["init", "--prefix", "tst"], { cwd: dir, stdio: "pipe" });
  return dir;
}

describe("beads backend — live br parity", () => {
  before(() => {
    const version = requireBr();
    assert.ok(
      version.split(".").map(Number)[1] >= 2,
      `br ${version} predates the ${MIN_BR_VERSION} floor this adapter requires ` +
        `(0.2.x moved --db to the database file and added atomic \`update --claim\`)`,
    );
  });

  it("runs the core CRUD surface against a real workspace", async () => {
    const dir = makeBeadsProject();
    try {
      const a = new BeadsAdapter(dir);
      await a.init();

      const created = await a.create({ title: "alpha", type: "task", priority: 2 });
      assert.ok(created.id, "create returns an adev-side id");

      assert.equal((await a.list()).length, 1);
      assert.equal((await a.get(created.id)).title, "alpha");
      assert.equal((await a.update(created.id, { priority: 1 })).priority, 1);

      // Epics have no br equivalent adev can create, so they are delegated to
      // a local JsonAdapter. This previously threw BACKEND_READ_ONLY_DEPRECATED,
      // which made /adev:implement unusable on beads at its very first step.
      const epic = await a.createEpic({ title: "an epic" });
      assert.ok(epic.id);
      assert.equal((await a.listEpics()).length, 1);

      assert.equal((await a.close(created.id, "done")).status, "closed");
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("resolves --db to the database file, not the workspace directory", () => {
    const dir = makeBeadsProject();
    try {
      const a = new BeadsAdapter(dir);
      const db = a._resolveDbPath();
      assert.ok(db, "an initialized workspace must resolve a db file");
      assert.ok(db.endsWith(".db"), `expected a *.db file, got ${db}`);
      assert.notEqual(db, a.workspaceDir, "the directory is not the database");
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("refuses a second claimant while the lease is live", async () => {
    const dir = makeBeadsProject();
    try {
      const a = new BeadsAdapter(dir);
      await a.init();
      const issue = await a.create({ title: "contended", type: "task", priority: 2 });

      const first = await a.claim(issue.id, "alice");
      assert.equal(first.owner, "alice");
      assert.ok(first.claimed_at, "a claim stamps its lease start");

      await assert.rejects(
        () => a.claim(issue.id, "bob"),
        (err) => {
          assert.equal(err.code, "ISSUE_ALREADY_CLAIMED");
          return true;
        },
        "a live claim held by someone else must be refused, same code as json",
      );
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("keeps the original lease start on an idempotent re-claim", async () => {
    const dir = makeBeadsProject();
    try {
      const a = new BeadsAdapter(dir);
      await a.init();
      const issue = await a.create({ title: "resumed", type: "task", priority: 2 });

      const first = await a.claim(issue.id, "alice");
      const again = await a.claim(issue.id, "alice");

      assert.equal(again.owner, "alice");
      assert.equal(
        again.claimed_at,
        first.claimed_at,
        "resuming a session must not silently extend its own lease",
      );
      assert.equal(again.takeover, undefined, "re-claiming yourself is not a takeover");
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("takes over an expired lease and reports the displaced owner", async () => {
    const dir = makeBeadsProject();
    try {
      const a = new BeadsAdapter(dir);
      await a.init();
      const issue = await a.create({ title: "abandoned", type: "task", priority: 2 });

      await a.claim(issue.id, "alice");
      // Backdate the lease well past the 240-minute default.
      const stale = new Date(Date.now() - 10 * 3600 * 1000).toISOString();
      await a.update(issue.id, { claimed_at: stale });

      const taken = await a.claim(issue.id, "carol");
      assert.equal(taken.owner, "carol");
      assert.equal(taken.takeover?.previous_owner, "alice");
      assert.equal(taken.takeover?.previous_claimed_at, stale);
      assert.notEqual(
        taken.claimed_at,
        stale,
        "a takeover starts a fresh lease rather than inheriting an expired one",
      );
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("releases only for the holder unless forced, and keeps branch/pr", async () => {
    const dir = makeBeadsProject();
    try {
      const a = new BeadsAdapter(dir);
      await a.init();
      const issue = await a.create({ title: "handover", type: "task", priority: 2 });

      await a.claim(issue.id, "alice", { branch: "feat/x", pr: "42" });

      await assert.rejects(
        () => a.release(issue.id, "bob"),
        (err) => {
          assert.equal(err.code, "CLAIM_OWNER_MISMATCH");
          return true;
        },
        "a non-holder must not release someone else's claim without --force",
      );

      await a.release(issue.id, "alice");
      const after = await a.get(issue.id);
      assert.ok(!after.owner, "release clears the owner");
      assert.equal(after.branch, "feat/x", "branch records where the work went");
      assert.equal(after.pr, "42", "pr records where the work went");
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("refuses a claim that a human took directly through `br` (gate must not fail open)", async () => {
    const dir = makeBeadsProject();
    try {
      const a = new BeadsAdapter(dir);
      await a.init();
      const issue = await a.create({ title: "taken outside adev", type: "task", priority: 2 });

      // br is a user-facing CLI, so this is normal usage — not an exotic race.
      // The sidecar knows nothing about it.
      const beadsId = a._getBeadsId(issue.id);
      execFileSync("br", ["--actor", "a-human", "update", beadsId, "--claim", "--json"], {
        cwd: dir,
        stdio: "pipe",
      });

      // The holder must be visible through the adapter, or requireClaimable
      // sees "unclaimed", passes, and br refuses the write as a generic
      // command failure — which the CLI maps to exit 1, which the
      // implement/debug preflight treats as "warn and continue". The gate
      // would open on precisely the case it exists to close.
      const seen = await a.get(issue.id);
      assert.equal(seen.owner, "a-human", "a br-side claim must surface as the owner");

      await assert.rejects(
        () => a.claim(issue.id, "adev-agent"),
        (err) => {
          assert.equal(
            err.code,
            "ISSUE_ALREADY_CLAIMED",
            "must be the shared refusal code (CLI exit 2 / halt), not BEADS_COMMAND_FAILED (exit 1 / continue)",
          );
          return true;
        },
      );
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("lets a different agent claim once the holder has released", async () => {
    const dir = makeBeadsProject();
    try {
      const a = new BeadsAdapter(dir);
      await a.init();
      const issue = await a.create({ title: "handoff", type: "task", priority: 2 });

      await a.claim(issue.id, "alice");
      await a.release(issue.id, "alice");
      const second = await a.claim(issue.id, "bob");

      assert.equal(second.owner, "bob");
    } finally {
      cleanupTempDir(dir);
    }
  });
});
