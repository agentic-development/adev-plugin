/**
 * The github-only complement of contract-cases.mjs: behaviors where the github
 * adapter deliberately differs from the json adapter, so they cannot be shared
 * contract cases. Each case drives the json adapter on a seeded temp board and
 * the github adapter on the hand-built replay builders of tests/issues/github/fixtures,
 * so no case needs a recorded fixture, a token, or the network.
 */

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GithubAdapter } from "../../../lib/issues/github-adapter.mjs";
import { JsonAdapter } from "../../../lib/issues/json-adapter.mjs";
import { parseId } from "../../../lib/issues/id-utils.mjs";
import { createTempDir, cleanupTempDir } from "../../helpers.mjs";
import { replayExec } from "../github/replay-transport.mjs";
import { board, buildBoard } from "../github/fixtures/board.mjs";
import { writes, task, CLOSED, TEXT_FIELD_IDS } from "../github/fixtures/writes.mjs";
import { claims, NOW_ISO, WINNER_AT } from "../github/fixtures/claims.mjs";

const NOW = Date.parse(NOW_ISO);
const SETTLE_MS = 1500;
const MANIFEST = {
  tasks: {
    backend: "github",
    claim_ttl_minutes: 240,
    github: { project: "https://github.com/orgs/acme/projects/7", repo: "acme/board", claim_settle_ms: SETTLE_MS },
  },
};

const dirs = [];
after(() => dirs.forEach(cleanupTempDir));

function tempDir() {
  const dir = createTempDir();
  dirs.push(dir);
  return dir;
}

function jsonManager() {
  const dir = tempDir();
  mkdirSync(join(dir, ".context-index"), { recursive: true });
  writeFileSync(join(dir, ".context-index", "manifest.yaml"), "tasks:\n  backend: json\n");
  return new JsonAdapter(dir);
}

// Sleeps are logged into exec.calls so a case can assert where the settle wait falls among the requests.
function githubManager(fixtures) {
  const exec = replayExec(fixtures);
  const manager = new GithubAdapter(tempDir(), MANIFEST, {
    exec,
    now: () => NOW,
    sleep: async (ms) => {
      exec.calls.push({ operation: `sleep(${ms})`, query: "", variables: {} });
    },
  });
  return { manager, exec };
}

const ids = (items) => items.map((i) => i.id);
const isMutation = (call) => call.query.startsWith("mutation");
const operations = (exec) => exec.calls.map((c) => c.operation);
const fieldIdsOf = (call) => Object.keys(call.variables).filter((k) => /^f\d+Field$/.test(k)).sort().map((k) => call.variables[k]);

// --- ID shape -----------------------------------------------------------------

test("ID shape: json mints a flat legacy ID; github returns gh-<n> for a home-repo issue", async () => {
  const local = await jsonManager().create({ title: "adev-fixture: plain" });
  assert.match(local.id, /^issue-[a-z0-9]{6}$/);
  assert.equal(parseId(local.id).legacy, true);

  const { manager } = githubManager(writes.createPlain);
  const remote = await manager.create({ title: "adev-fixture: plain" });
  assert.equal(remote.id, "gh-304");
  assert.equal(parseId(remote.id).github, true);
  assert.equal(parseId(remote.id).legacy, false);
});

test("ID shape: a cross-repo github item is gh-<owner>.<repo>.<n>", async () => {
  const { manager } = githubManager(board.full);
  const item = await manager.get("gh-acme.api.7");
  assert.equal(item.id, "gh-acme.api.7");
  assert.equal(item.parent_id, "gh-5");
});

test("ID shape: github normalizes display forms and issue URLs to the canonical ID; json matches IDs verbatim", async () => {
  const { manager } = githubManager(board.full);
  for (const input of ["#2", "2", "acme/board#2", "https://github.com/acme/board/issues/2"]) {
    assert.equal((await manager.get(input)).id, "gh-2", input);
  }
  assert.equal((await manager.get("acme/api#7")).id, "gh-acme.api.7");

  const json = jsonManager();
  const local = await json.create({ title: "adev-fixture: plain" });
  assert.equal(await json.get(`#${local.id}`), null);
  assert.equal((await json.get(local.id)).id, local.id);
});

test("ID shape: github refuses a URL off github.com with GITHUB_INVALID_ID; json reads it as an unknown ID", async () => {
  const { manager } = githubManager(board.full);
  await assert.rejects(manager.get("https://example.com/acme/board/issues/2"), { code: "GITHUB_INVALID_ID" });
  await assert.rejects(manager.get("http://github.com/acme/board/issues/2"), { code: "GITHUB_INVALID_ID" });
  assert.equal(await jsonManager().get("https://example.com/acme/board/issues/2"), null);
});

// --- sub-issue walkTree -------------------------------------------------------

test("walkTree: json walks tiered ID prefixes only, so an epic's epicId members are not its tree", async () => {
  const json = jsonManager();
  const root = await json.create({ title: "adev-fixture: root", type: "epic", tier_prefix: "e" });
  const child = await json.create({ title: "adev-fixture: child", type: "feature", parent_id: root.id });
  assert.deepEqual(ids(await json.walkTree(root.id)), [child.id]);

  const epic = await json.createEpic({ title: "adev-fixture: flat epic" });
  const member = await json.create({ title: "adev-fixture: member", epicId: epic.id });
  assert.deepEqual(ids(await json.list({ epicId: epic.id })), [member.id]);
  assert.deepEqual(await json.walkTree(epic.id), []);
  assert.deepEqual(await json.walkTree(member.id), []);
});

test("walkTree: github follows sub-issue links from any gh ID, across repos, excluding off-project sub-issues", async () => {
  const { manager } = githubManager(board.full);
  assert.deepEqual(ids(await manager.walkTree("gh-1")), ["gh-2", "gh-3", "gh-4"]);
  assert.deepEqual(ids(await manager.walkTree("gh-5")), ["gh-6", "gh-acme.api.7"]);
  // gh-4's only sub-issue, #900, is not a project item.
  assert.deepEqual(await manager.walkTree("gh-4"), []);
});

test("walkTree: github resolves a legacy ID through legacy_id to the migrated item's tree; json returns [] for it", async () => {
  const { manager } = githubManager(board.migratedEpic);
  assert.deepEqual(ids(await manager.walkTree("epic-9")), ["gh-2", "gh-3", "gh-4"]);
  assert.deepEqual(ids(await manager.walkTree("epic-9")), ids(await manager.walkTree("gh-1")));

  const json = jsonManager();
  await json.createEpic({ title: "adev-fixture: legacy epic" });
  assert.deepEqual(await json.walkTree("epic-9"), []);
});

test("walkTree: a legacy ID matching no legacy_id walks nothing; one matching two refuses with GITHUB_AMBIGUOUS_LEGACY_ID", async () => {
  const { manager } = githubManager(board.migrated);
  assert.deepEqual(await manager.walkTree("issue-zzzzzz"), []);
  await assert.rejects(manager.walkTree("epic-2"), (err) => {
    assert.equal(err.code, "GITHUB_AMBIGUOUS_LEGACY_ID");
    assert.deepEqual([...err.ids].sort(), ["gh-42", "gh-43"]);
    return true;
  });
});

// --- status read mapping ------------------------------------------------------

test("status: json reads back the stored status; github derives it from issue state and the status option", async () => {
  const json = jsonManager();
  const local = await json.create({ title: "adev-fixture: s" });
  await json.update(local.id, { status: "deferred" });
  assert.equal((await json.get(local.id)).status, "deferred");

  const { manager } = githubManager(board.full);
  const statusOf = async (id) => (await manager.get(id)).status;
  assert.equal(await statusOf("gh-1"), "open"); // Ready
  assert.equal(await statusOf("gh-2"), "open"); // Backlog
  assert.equal(await statusOf("gh-30"), "in_progress"); // In Progress
  assert.equal(await statusOf("gh-31"), "in_progress"); // In Review
  assert.equal(await statusOf("gh-40"), "deferred"); // Deferred
  assert.equal(await statusOf("gh-20"), "closed"); // CLOSED, Done
  assert.equal(await statusOf("gh-21"), "closed"); // CLOSED, Backlog: issue state wins
});

test("status: an open github issue on a closed-mapped option reads open, and one with no option reads open", async () => {
  const { manager } = githubManager(buildBoard([task(1, { status: "Done" }), task(2, { status: null })]));
  assert.equal((await manager.get("gh-1")).status, "open");
  assert.equal((await manager.get("gh-2")).status, "open");
});

test("status: an open github issue on an option outside status_map refuses the read with GITHUB_UNMAPPED_STATUS", async () => {
  const { manager } = githubManager(board.unmapped);
  await assert.rejects(manager.get("gh-2"), (err) => {
    assert.equal(err.code, "GITHUB_UNMAPPED_STATUS");
    assert.match(err.message, /gh-2\b/);
    assert.match(err.message, /Icebox/);
    return true;
  });
  await assert.rejects(manager.list({}), { code: "GITHUB_UNMAPPED_STATUS" });
});

// --- UI-bypassable closure guards ---------------------------------------------

test("closure: json's cascade guard holds, so a tiered parent with an open child stays open", async () => {
  const json = jsonManager();
  const root = await json.create({ title: "adev-fixture: root", type: "epic", tier_prefix: "e" });
  const child = await json.create({ title: "adev-fixture: child", type: "feature", parent_id: root.id });
  await assert.rejects(json.close(root.id, "done"), (err) => {
    assert.equal(err.code, "CASCADE_BLOCKED");
    assert.deepEqual(err.blockers, [child.id]);
    return true;
  });
  assert.equal((await json.get(root.id)).status, "open");
});

test("closure: github close() applies the cascade guard to a flat-shaped gh ID too", async () => {
  const { manager, exec } = githubManager(writes.parentWithOpenChild);
  await assert.rejects(manager.close("gh-30", "done"), (err) => {
    assert.equal(err.code, "CASCADE_BLOCKED");
    assert.deepEqual(err.blockers, ["gh-31"]);
    return true;
  });
  assert.deepEqual(exec.calls.filter(isMutation), []);
});

test("closure: an issue closed in the GitHub UI reads closed despite an open sub-issue and an open blocker", async () => {
  const { manager } = githubManager(buildBoard([
    task(1, CLOSED),
    task(2, { parent: { number: 1 } }),
    task(3),
    task(4, { ...CLOSED, blockedBy: [{ number: 3 }] }),
  ]));
  assert.equal((await manager.get("gh-1")).status, "closed");
  const tree = await manager.walkTree("gh-1");
  assert.deepEqual(ids(tree), ["gh-2"]);
  assert.equal(tree[0].status, "open");

  const blocked = await manager.get("gh-4");
  assert.equal(blocked.status, "closed");
  assert.deepEqual(blocked.dependencies, ["gh-3"]);
  assert.equal((await manager.get("gh-3")).status, "open");
});

// --- non-linearizable claims and the delayed branch/pr write ------------------

test("claim: json writes owner, claimed_at, branch and pr together in one write", async () => {
  const json = jsonManager();
  const local = await json.create({ title: "adev-fixture: c" });
  const claimed = await json.claim(local.id, "agent-b", { branch: "feat/x", pr: "#12" });
  assert.equal(claimed.owner, "agent-b");
  assert.equal(claimed.branch, "feat/x");
  assert.equal(claimed.pr, "#12");
  assert.match(claimed.claimed_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  const stored = await json.get(local.id);
  assert.deepEqual([stored.owner, stored.branch, stored.pr], ["agent-b", "feat/x", "#12"]);
});

test("claim: github writes branch and pr only after the settle re-read confirms the claim", async () => {
  const { manager, exec } = githubManager(claims.claimWithWork);
  const item = await manager.claim("gh-5", "agent-b", { branch: "feat/x", pr: "#12" });

  const ops = operations(exec);
  assert.deepEqual(ops.slice(ops.indexOf("SetFields")), ["SetFields", "ProjectItem", `sleep(${SETTLE_MS})`, "ProjectItem", "SetFields", "ProjectItem"]);

  const [leaseWrite, workWrite, ...rest] = exec.calls.filter(isMutation);
  assert.deepEqual(rest, []);
  assert.deepEqual(fieldIdsOf(leaseWrite), [TEXT_FIELD_IDS.claimed_at, TEXT_FIELD_IDS.owner]);
  assert.equal(leaseWrite.variables.f0Value, NOW_ISO);
  assert.equal(leaseWrite.variables.f1Value, "agent-b");
  assert.deepEqual(fieldIdsOf(workWrite), [TEXT_FIELD_IDS.branch, TEXT_FIELD_IDS.pr]);
  assert.equal(workWrite.variables.f0Value, "feat/x");
  assert.equal(workWrite.variables.f1Value, "#12");

  assert.deepEqual([item.owner, item.claimed_at, item.branch, item.pr], ["agent-b", NOW_ISO, "feat/x", "#12"]);
});

test("claim: a github claim overtaken before its first re-read reports the winner and writes no branch or pr", async () => {
  const { manager, exec } = githubManager(claims.lostBeforeReread);
  await assert.rejects(manager.claim("gh-5", "agent-b", { branch: "feat/x", pr: "#12" }), (err) => {
    assert.equal(err.code, "ISSUE_ALREADY_CLAIMED");
    assert.equal(err.owner, "agent-a");
    assert.equal(err.claimed_at, WINNER_AT);
    return true;
  });
  const writesSent = exec.calls.filter(isMutation);
  assert.equal(writesSent.length, 1);
  assert.deepEqual(fieldIdsOf(writesSent[0]), [TEXT_FIELD_IDS.claimed_at, TEXT_FIELD_IDS.owner]);
  assert.ok(!operations(exec).includes(`sleep(${SETTLE_MS})`), "an overtaken claim never waits to settle");
});

test("claim: a github claim confirmed once can still lose during the settle wait; json has no such window", async () => {
  const { manager, exec } = githubManager(claims.lostDuringSettle);
  await assert.rejects(manager.claim("gh-5", "agent-b", { branch: "feat/x" }), (err) => {
    assert.equal(err.code, "ISSUE_ALREADY_CLAIMED");
    assert.equal(err.owner, "agent-a");
    assert.equal(err.claimed_at, WINNER_AT);
    return true;
  });
  assert.equal(exec.calls.filter(isMutation).length, 1);
  assert.ok(operations(exec).includes(`sleep(${SETTLE_MS})`));

  const json = jsonManager();
  const local = await json.create({ title: "adev-fixture: c" });
  await json.claim(local.id, "agent-a", { branch: "feat/a" });
  await assert.rejects(json.claim(local.id, "agent-b", { branch: "feat/x" }), (err) => {
    assert.equal(err.code, "ISSUE_ALREADY_CLAIMED");
    assert.equal(err.owner, "agent-a");
    return true;
  });
  const stored = await json.get(local.id);
  assert.deepEqual([stored.owner, stored.branch], ["agent-a", "feat/a"]);
});
