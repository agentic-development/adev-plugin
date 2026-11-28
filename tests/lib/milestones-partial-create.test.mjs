// `milestoneCreate` links a new milestone to an epic it creates. When the epic
// create fails before anything exists, the milestone is still written with
// `epic_id: null` and linked later. A GITHUB_PARTIAL_CREATE is different: the
// epic now exists on GitHub, and the error is the only place its canonical ID
// and the unwritten fields are carried. The milestone is written linked to that
// ID, exactly as a successful create would write it, so a re-run takes the
// idempotent existing-milestone path instead of opening a second epic; then the
// same error is rethrown so the caller reports the code, ID and unwritten fields.
// Without a usable ID there is nothing to link, so nothing is written.

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { loadMilestones, milestoneCreate, saveMilestones } from "../../lib/milestones.mjs";
import { GithubAdapter } from "../../lib/issues/github-adapter.mjs";
import { createTempDir, cleanupTempDir } from "../helpers.mjs";
import { replayExec } from "../issues/github/replay-transport.mjs";
import { writes } from "../issues/github/fixtures/writes.mjs";

const GITHUB_MANIFEST = {
  tasks: { backend: "github", github: { project: "https://github.com/orgs/acme/projects/7", repo: "acme/board" } },
};

const dirs = [];
afterEach(() => {
  while (dirs.length) cleanupTempDir(dirs.pop());
});

function makeProject() {
  const dir = createTempDir();
  dirs.push(dir);
  mkdirSync(join(dir, ".context-index"), { recursive: true });
  writeFileSync(join(dir, ".context-index", "manifest.yaml"), "tasks:\n  backend: json\n");
  return dir;
}

const milestonesFile = (dir) => join(dir, ".context-index", "milestones.json");

function partialCreate({ id = "gh-12", unwritten = ["status"] } = {}) {
  return Object.assign(new Error(`GitHub issue ${id} was created and kept, but these fields were not written: ${unwritten.join(", ")}.`), {
    code: "GITHUB_PARTIAL_CREATE",
    id,
    unwritten,
    causeCode: "GITHUB_WRITE_FAILED",
  });
}

function throwingManager(err) {
  const calls = [];
  return {
    calls,
    createEpic: async (data) => {
      calls.push(data);
      throw err;
    },
  };
}

const OPTIONS = { targetDate: "2026-12-01", strategy: "tag-only", checks: ["gates_pass"], confirms: ["QA signed off"] };

function succeedingManager(id) {
  const calls = [];
  return { calls, createEpic: async (data) => { calls.push(data); return { id, ...data }; } };
}

const stored = (dir) => JSON.parse(readFileSync(milestonesFile(dir), "utf8")).milestones;

describe("milestoneCreate: GITHUB_PARTIAL_CREATE from createEpic links, then stops loudly", () => {
  it("rejects with the same error object, carrying code, id and unwritten", async () => {
    const dir = makeProject();
    const err = partialCreate();
    const manager = throwingManager(err);

    await assert.rejects(milestoneCreate(dir, "v1", { issueManager: manager }), (thrown) => {
      assert.equal(thrown, err);
      assert.equal(thrown.code, "GITHUB_PARTIAL_CREATE");
      assert.equal(thrown.id, "gh-12");
      assert.deepEqual(thrown.unwritten, ["status"]);
      return true;
    });
    assert.deepEqual(manager.calls, [{ title: "v1", milestone: "v1" }]);
  });

  it("writes the entry a successful create would, with epic_id set to the error's id", async () => {
    const reference = makeProject();
    const expected = await milestoneCreate(reference, "v1", { issueManager: succeedingManager("gh-12"), ...OPTIONS });

    const dir = makeProject();
    await assert.rejects(milestoneCreate(dir, "v1", { issueManager: throwingManager(partialCreate()), ...OPTIONS }), { code: "GITHUB_PARTIAL_CREATE" });
    assert.deepEqual(stored(dir), [expected]);
    assert.equal(stored(dir)[0].epic_id, "gh-12");
  });

  it("keeps existing milestones and appends only the new linked entry", async () => {
    const dir = makeProject();
    const v0 = { name: "v0", status: "planned", epic_id: "gh-1", target_date: null, release: null, ship_criteria: [] };
    saveMilestones(dir, [v0]);
    const [v0Loaded] = loadMilestones(dir);

    await assert.rejects(milestoneCreate(dir, "v1", { issueManager: throwingManager(partialCreate()) }), { code: "GITHUB_PARTIAL_CREATE" });
    assert.deepEqual(stored(dir).map((m) => [m.name, m.epic_id]), [["v0", "gh-1"], ["v1", "gh-12"]]);
    assert.deepEqual(loadMilestones(dir)[0], v0Loaded);
  });

  it("a re-run with the same name does not call createEpic again and keeps the link", async () => {
    const dir = makeProject();
    await assert.rejects(milestoneCreate(dir, "v1", { issueManager: throwingManager(partialCreate()) }), { code: "GITHUB_PARTIAL_CREATE" });

    const rerun = succeedingManager("gh-99");
    const entry = await milestoneCreate(dir, "v1", { issueManager: rerun });
    assert.deepEqual(rerun.calls, []);
    assert.equal(entry.epic_id, "gh-12");
    assert.deepEqual(stored(dir).map((m) => [m.name, m.epic_id]), [["v1", "gh-12"]]);
  });

  it("links and rethrows when every field was written but the read-back failed (unwritten is empty)", async () => {
    const dir = makeProject();
    const err = partialCreate({ id: "gh-40", unwritten: [] });
    await assert.rejects(milestoneCreate(dir, "v1", { issueManager: throwingManager(err) }), (thrown) => thrown === err);
    assert.equal(stored(dir)[0].epic_id, "gh-40");
  });

  for (const [label, id] of [["absent", undefined], ["empty", ""], ["not a string", 12]]) {
    it(`writes nothing and rethrows when the error's id is ${label}`, async () => {
      const dir = makeProject();
      const err = partialCreate();
      err.id = id;
      await assert.rejects(milestoneCreate(dir, "v1", { issueManager: throwingManager(err) }), (thrown) => thrown === err);
      assert.equal(existsSync(milestonesFile(dir)), false);
    });
  }

  it("leaves an existing milestones.json byte-identical when the error has no id", async () => {
    const dir = makeProject();
    saveMilestones(dir, [{ name: "v0", status: "planned", epic_id: "gh-1", target_date: null, release: null, ship_criteria: [] }]);
    const before = readFileSync(milestonesFile(dir), "utf8");
    const err = partialCreate();
    delete err.id;

    await assert.rejects(milestoneCreate(dir, "v1", { issueManager: throwingManager(err), ...OPTIONS }), (thrown) => thrown === err);
    assert.equal(readFileSync(milestonesFile(dir), "utf8"), before);
  });

  it("links the real github adapter's partial create, replayed at the gh boundary, then rethrows", async () => {
    const dir = makeProject();
    const exec = replayExec(writes.partialEpicAtMilestone);
    const adapter = new GithubAdapter(createTempDir(), GITHUB_MANIFEST, { exec });
    dirs.push(adapter.storageRoot);

    await assert.rejects(milestoneCreate(dir, "v1", { issueManager: adapter }), (thrown) => {
      assert.equal(thrown.code, "GITHUB_PARTIAL_CREATE");
      assert.equal(thrown.id, "gh-345");
      assert.deepEqual(thrown.unwritten, ["milestone"]);
      return true;
    });
    assert.equal(exec.calls.filter((c) => c.operation === "CreateIssue").length, 1);
    assert.deepEqual(stored(dir).map((m) => [m.name, m.epic_id]), [["v1", "gh-345"]]);
  });
});

describe("milestoneCreate: every other createEpic failure keeps epic_id: null", () => {
  it("writes the milestone with epic_id null on a generic error", async () => {
    const dir = makeProject();
    const entry = await milestoneCreate(dir, "v1", { issueManager: throwingManager(new Error("backend down")) });

    assert.equal(entry.epic_id, null);
    const stored = JSON.parse(readFileSync(milestonesFile(dir), "utf8"));
    assert.deepEqual(stored.milestones.map((m) => [m.name, m.epic_id]), [["v1", null]]);
  });

  it("keys on the code, not the message: a different code naming GITHUB_PARTIAL_CREATE is still swallowed", async () => {
    const dir = makeProject();
    const err = Object.assign(new Error("not a GITHUB_PARTIAL_CREATE"), { code: "GITHUB_UNREACHABLE", id: "gh-12", unwritten: ["status"] });
    const entry = await milestoneCreate(dir, "v1", { issueManager: throwingManager(err) });

    assert.equal(entry.epic_id, null);
    assert.equal(JSON.parse(readFileSync(milestonesFile(dir), "utf8")).milestones[0].epic_id, null);
  });
});
