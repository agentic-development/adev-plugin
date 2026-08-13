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
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
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

/** Raw `br list -s all --json` records, straight from the binary. */
function brRecords(dir) {
  const raw = execFileSync("br", ["list", "-s", "all", "--json"], {
    cwd: dir,
    encoding: "utf8",
    stdio: "pipe",
  });
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : parsed.issues || [];
}

/**
 * Resolve an adev id to its br id the way anything outside the adapter must:
 * by scanning `external_ref`. There is no sidecar to consult, and br cannot
 * address an issue by external_ref directly.
 */
function brIdOf(dir, adevId) {
  const found = brRecords(dir).find((i) => i.external_ref === adevId);
  assert.ok(found, `no beads issue carries external_ref ${adevId}`);
  return found.id;
}

/** The adev-owned slice of an issue's br `agent_context`. */
function brContextOf(dir, adevId) {
  const found = brRecords(dir).find((i) => i.external_ref === adevId);
  assert.ok(found, `no beads issue carries external_ref ${adevId}`);
  return JSON.parse(found.agent_context || "{}").adev || {};
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

      // Epics are native beads issues (`br create -t epic`). They used to be
      // delegated to a local store, which is the other half of the dual-state
      // problem: `br list` could not see a beads project's own epics.
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
      const beadsId = brIdOf(dir, issue.id);
      execFileSync("br", ["--actor", "a-human", "update", beadsId, "--claim", "--json"], {
        cwd: dir,
        stdio: "pipe",
      });

      // The holder must be visible through the adapter, or requireClaimable
      // sees "unclaimed", passes, and br refuses the write as a generic
      // command failure — which the CLI maps to exit 1, which the
      // implement/debug preflight treats as "warn and continue". The gate
      // would open on precisely the case it exists to close.
      //
      // This is the failure the sidecar caused: adev's copy of the holder said
      // "unclaimed" while br's `assignee` — the field `--claim` actually
      // guards — said otherwise. `assignee` is now the only home for it.
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

  // ───────────────────────────────────────────────────────────────────────
  // Single source of truth: beads holds the board, nothing sits beside it.
  // ───────────────────────────────────────────────────────────────────────

  it("never creates a .beads-map.json sidecar, whatever the board is put through", async () => {
    const dir = makeBeadsProject();
    try {
      const a = new BeadsAdapter(dir);
      await a.init();

      const issue = await a.create({ title: "no sidecar", type: "task", priority: 2, epicId: "epic-1" });
      await a.createEpic({ title: "an epic" });
      await a.claim(issue.id, "alice", { branch: "feat/x" });
      await a.update(issue.id, { next_action: "keep going" });
      await a.release(issue.id, "alice");
      await a.close(issue.id, "done");

      const sidecar = join(dir, ".context-index", "tasks", ".beads-map.json");
      assert.equal(
        existsSync(sidecar),
        false,
        "the adev id ↔ beads id map is derived from `external_ref` on every " +
          "call and must never be persisted — a second store is what let the " +
          "claim gate fail open",
      );
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("round-trips every adev field through br's own columns and agent_context", async () => {
    const dir = makeBeadsProject();
    try {
      const a = new BeadsAdapter(dir);
      await a.init();

      const created = await a.create({
        title: "fully populated",
        type: "task",
        priority: 1,
        epicId: "epic-4",
        planRef: "x.plan.md",
        planTask: 7,
        spec_ref: "x.spec.md",
      });
      await a.update(created.id, { branch: "feat/y", pr: "99", next_action: "review" });

      const seen = await a.get(created.id);
      assert.equal(seen.epicId, "epic-4");
      assert.equal(seen.planRef, "x.plan.md");
      assert.equal(seen.planTask, 7);
      assert.equal(seen.spec_ref, "x.spec.md");
      assert.equal(seen.branch, "feat/y");
      assert.equal(seen.pr, "99");
      assert.equal(seen.next_action, "review");

      // Confirm the storage location, not just the round-trip: the adev id is
      // br's `external_ref` and the rest is br's `agent_context`.
      const record = brRecords(dir).find((i) => i.external_ref === created.id);
      assert.ok(record, "the adev id must be br's external_ref");
      assert.equal(brContextOf(dir, created.id).spec_ref, "x.spec.md");
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("keeps the rest of the metadata when a claim writes the lease stamp", async () => {
    const dir = makeBeadsProject();
    try {
      const a = new BeadsAdapter(dir);
      await a.init();
      const issue = await a.create({
        title: "claim must not clobber",
        type: "task",
        priority: 2,
        epicId: "epic-2",
        spec_ref: "s.spec.md",
      });
      await a.update(issue.id, { branch: "feat/keep", pr: "7" });

      await a.claim(issue.id, "alice");

      // br REPLACES agent_context wholesale, so a claim that wrote only
      // {claimed_at} would silently erase every other field. The write has to
      // be read-modify-write.
      const after = await a.get(issue.id);
      assert.equal(after.epicId, "epic-2", "claim must not drop epicId");
      assert.equal(after.spec_ref, "s.spec.md", "claim must not drop spec_ref");
      assert.equal(after.branch, "feat/keep", "claim must not drop branch");
      assert.equal(after.pr, "7", "claim must not drop pr");
      assert.ok(after.claimed_at, "and it must still stamp the lease");
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("preserves foreign keys in agent_context, which is br's field and not adev's", async () => {
    const dir = makeBeadsProject();
    try {
      const a = new BeadsAdapter(dir);
      await a.init();
      const issue = await a.create({ title: "shared field", type: "task", priority: 2 });

      // `agent_context` is br's "governing-instructions JSON", inherited by
      // descendants when configured. Another tool or a human may own keys in
      // it; adev confines itself to the "adev" key.
      const beadsId = brIdOf(dir, issue.id);
      execFileSync(
        "br",
        ["update", beadsId, "--agent-context", JSON.stringify({ house_rules: "be careful" }), "--json"],
        { cwd: dir, stdio: "pipe" },
      );

      await a.claim(issue.id, "alice");
      await a.update(issue.id, { branch: "feat/z" });

      const record = brRecords(dir).find((i) => i.external_ref === issue.id);
      const ctx = JSON.parse(record.agent_context || "{}");
      assert.equal(ctx.house_rules, "be careful", "adev must not trample foreign context keys");
      assert.equal(ctx.adev.branch, "feat/z");
      assert.ok(ctx.adev.claimed_at);
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("stores epics as native beads issues, visible to `br` itself", async () => {
    const dir = makeBeadsProject();
    try {
      const a = new BeadsAdapter(dir);
      await a.init();

      const epic = await a.createEpic({ title: "native epic", milestone: "m1" });
      assert.match(epic.id, /^epic-\d+$/);

      // The point of the change: `br list` shows the epic. Under the old
      // hybrid it lived in a local tasks.json and beads knew nothing of it.
      const record = brRecords(dir).find((i) => i.external_ref === epic.id);
      assert.ok(record, "the epic must exist in beads, not beside it");
      assert.equal(record.issue_type, "epic", "and it must be a real beads epic");

      const listed = await a.listEpics();
      assert.equal(listed.length, 1);
      assert.equal(listed[0].milestone, "m1");

      // Epics are their own collection, exactly as on the json backend.
      const issue = await a.create({ title: "a task", type: "task", priority: 2 });
      assert.deepEqual((await a.list()).map((i) => i.id), [issue.id]);

      const updated = await a.updateEpic(epic.id, { title: "renamed epic" });
      assert.equal(updated.title, "renamed epic");
      assert.equal((await a.listEpics())[0].title, "renamed epic");
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("links parent and child natively while keeping adev's own id namespace", async () => {
    const dir = makeBeadsProject();
    try {
      const a = new BeadsAdapter(dir);
      await a.init();
      const parent = await a.create({ title: "parent", type: "task", priority: 2 });
      const child = await a.create({
        title: "child",
        type: "task",
        priority: 2,
        parent_id: parent.id,
      });

      assert.equal((await a.get(child.id)).parent_id, parent.id);

      // br records a real parent-child edge; its hierarchical id (`tst-x.1`)
      // is br's namespace, not adev's, so adev ids stay flat.
      const record = brRecords(dir).find((i) => i.external_ref === child.id);
      assert.ok(record.id.includes("."), `expected a br child id, got ${record.id}`);
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("keeps closed issues addressable and never re-mints their ids", async () => {
    const dir = makeBeadsProject();
    try {
      const a = new BeadsAdapter(dir);
      await a.init();
      const first = await a.create({ title: "will close", type: "task", priority: 2 });
      await a.close(first.id, "done");

      // `br list` hides closed issues by default. A closed-blind scan would
      // hand the next create the id this one already owns.
      const next = await a.create({ title: "the next one", type: "task", priority: 2 });
      assert.notEqual(next.id, first.id, "a closed issue must not have its id recycled");

      const closed = await a.get(first.id);
      assert.equal(closed?.status, "closed", "closed issues stay readable, as on json");
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("migrates a legacy .beads-map.json into beads and retires the file", async () => {
    const dir = makeBeadsProject();
    try {
      mkdirSync(join(dir, ".context-index", "tasks"), { recursive: true });
      // A pre-change board: br issues with no external_ref, and a sidecar
      // holding the adev ids plus every field br had no column for.
      const one = JSON.parse(
        execFileSync("br", ["create", "legacy one", "--type", "task", "--priority", "2", "--json"], {
          cwd: dir,
          encoding: "utf8",
          stdio: "pipe",
        }),
      );
      writeFileSync(
        join(dir, ".context-index", "tasks", ".beads-map.json"),
        JSON.stringify({
          "issue-1": {
            beadsId: one.id,
            epicId: "epic-1",
            spec_ref: "legacy.spec.md",
            branch: "feat/old",
            owner: "alice",
            claimed_at: "2026-08-01T00:00:00.000Z",
          },
        }),
      );
      // Epics used to be delegated to a local JsonAdapter, so on a beads
      // project tasks.json was the ONLY copy of them.
      writeFileSync(
        join(dir, ".context-index", "tasks", "tasks.json"),
        JSON.stringify({
          version: 1,
          issues: [],
          epics: [{ id: "epic-1", title: "legacy epic", status: "open", milestone: "m9" }],
        }),
      );

      const a = new BeadsAdapter(dir);
      const issues = await a.list();

      // The board must NOT look empty to someone who had a sidecar.
      assert.equal(issues.length, 1, "the legacy issue must survive the move");
      assert.equal(issues[0].id, "issue-1", "under its adev id");
      assert.equal(issues[0].epicId, "epic-1");
      assert.equal(issues[0].spec_ref, "legacy.spec.md");
      assert.equal(issues[0].branch, "feat/old");
      assert.equal(issues[0].owner, "alice", "a live claim must not be released by migrating");
      assert.equal(issues[0].claimed_at, "2026-08-01T00:00:00.000Z");

      const epics = await a.listEpics();
      assert.deepEqual(epics.map((e) => e.id), ["epic-1"]);
      assert.equal(epics[0].milestone, "m9");

      assert.equal(
        existsSync(join(dir, ".context-index", "tasks", ".beads-map.json")),
        false,
        "the migrated sidecar is retired, not left to drift alongside beads",
      );

      // Idempotent: a second adapter must not duplicate anything.
      const b = new BeadsAdapter(dir);
      assert.deepEqual((await b.list()).map((i) => i.id), ["issue-1"]);
      assert.deepEqual((await b.listEpics()).map((e) => e.id), ["epic-1"]);
      assert.equal(
        (await b.create({ title: "after migration", type: "task", priority: 2 })).id,
        "issue-2",
        "minting continues from the migrated ids",
      );
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("refuses to run on a sidecar it cannot honour rather than showing an empty board", async () => {
    const dir = makeBeadsProject();
    try {
      mkdirSync(join(dir, ".context-index", "tasks"), { recursive: true });
      // The mapped beads issue does not exist — nothing can be recovered.
      writeFileSync(
        join(dir, ".context-index", "tasks", ".beads-map.json"),
        JSON.stringify({ "issue-1": { beadsId: "tst-gone" } }),
      );

      const a = new BeadsAdapter(dir);
      await assert.rejects(
        () => a.list(),
        (err) => {
          assert.equal(err.code, "BEADS_LEGACY_MIGRATION_FAILED");
          assert.match(err.message, /issue-1/);
          return true;
        },
        "an unmigratable sidecar must fail loudly — silence is indistinguishable " +
          "from an empty board, which is the outcome this exists to prevent",
      );
      assert.equal(
        existsSync(join(dir, ".context-index", "tasks", ".beads-map.json")),
        true,
        "and the file stays put so nothing is lost",
      );
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("resolves the session-capture hook's epic from beads, with no sidecar to read", async () => {
    const dir = makeBeadsProject();
    try {
      const a = new BeadsAdapter(dir);
      await a.init();
      const issue = await a.create({
        title: "bound to an epic",
        type: "task",
        priority: 2,
        epicId: "epic-3",
      });

      writeFileSync(
        join(dir, ".context-index", ".execution-state.json"),
        JSON.stringify({
          status: "active",
          planRef: "x.plan.md",
          currentTask: 1,
          issueBinding: issue.id,
          blockers: "",
          nextAction: "",
          progress: [],
          updated: "2026-05-11T00:00:00Z",
        }),
      );

      const { runToolUseCapture } = await import("../../../lib/session-capture.mjs");
      const { entry } = await runToolUseCapture({
        payload: { provider: "native", tool_name: "Edit", tool_input: { file_path: "a.ts" } },
        projectRoot: dir,
      });

      assert.equal(entry.issue, issue.id);
      assert.equal(entry.epic, "epic-3", "the hook must read the epic link out of beads");

      // The hook is a read path and must stay one: it opts out of the legacy
      // migration, so a PostToolUse never writes to the board.
      assert.equal(
        existsSync(join(dir, ".context-index", "tasks", ".beads-map.json")),
        false,
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
