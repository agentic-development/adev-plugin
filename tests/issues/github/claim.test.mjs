import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { accessSync, constants, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, delimiter } from "node:path";
import { fileURLToPath } from "node:url";
import { GithubAdapter } from "../../../lib/issues/github-adapter.mjs";
import { setFieldsDocument } from "../../../lib/issues/github/mutations.mjs";
import { replayExec } from "./replay-transport.mjs";
import { claims, NOW_ISO, LIVE_AT, STALE_AT, TTL_EDGE_AT, WINNER_AT, OWNER_REJECTION, CLAIMED_AT_REJECTION, COMPENSATION_REJECTION, LEASE_CLEAR_REJECTION } from "./fixtures/claims.mjs";
import { TEXT_FIELD_IDS, STATUS_FIELD_ID } from "./fixtures/writes.mjs";
import { createTempDir, cleanupTempDir } from "../../helpers.mjs";
const manifest = (settle = 0) => ({ tasks: { backend: "github", claim_ttl_minutes: 240, github: { project: "https://github.com/orgs/acme/projects/7", repo: "acme/board", claim_settle_ms: settle } } });
const NOW = Date.parse("2026-11-26T10:00:00.000Z"); // claims.mjs fixtures are built with this clock
const make = (fx) => { const exec = replayExec(fx); return { a: new GithubAdapter(createTempDir(), manifest(), { exec, now: () => NOW, sleep: async () => {} }), exec }; };

test("(a) competing claim on a live lease → ISSUE_ALREADY_CLAIMED", async () => {
  await assert.rejects(make(claims.liveLease).a.claim("gh-5", "agent-b"), (e) => e.code === "ISSUE_ALREADY_CLAIMED" && e.owner === "agent-a");
});
test("(b) lost before first re-read → throw, nothing further written", async () => {
  const { a, exec } = make(claims.lostBeforeReread);
  await assert.rejects(a.claim("gh-5", "agent-b", { branch: "feat/x" }), { code: "ISSUE_ALREADY_CLAIMED" });
  assert.equal(exec.calls.filter((c) => c.operation === "SetFields").length, 1); // only the claim write
});
test("(c) lost within the settle interval → throw", async () => {
  await assert.rejects(make(claims.lostDuringSettle).a.claim("gh-5", "agent-b"), { code: "ISSUE_ALREADY_CLAIMED" });
});
test("(d) owner write fails after claimed_at → unclaimed + GITHUB_WRITE_FAILED", async () => {
  const { a } = make(claims.ownerWriteFails);
  await assert.rejects(a.claim("gh-5", "agent-b"), { code: "GITHUB_WRITE_FAILED" });
  assert.equal((await a.get("gh-5")).owner, undefined);
});
test("(e) stale lease takeover returns the json-shaped takeover object; status unchanged", async () => {
  const item = await make(claims.staleLease).a.claim("gh-5", "agent-b");
  assert.deepEqual(Object.keys(item.takeover).sort(), ["previous_claimed_at", "previous_owner", "ttl_minutes"]);
  assert.equal(item.status, "open");
});
test("legacy IDs on claim: unknown → NOT_FOUND, ambiguous → GITHUB_AMBIGUOUS_LEGACY_ID", async () => {
  await assert.rejects(make(claims.migratedBoard).a.claim("issue-zzzzzz", "agent-b"), { code: "NOT_FOUND" });
  await assert.rejects(make(claims.migratedBoard).a.claim("epic-2", "agent-b"), { code: "GITHUB_AMBIGUOUS_LEGACY_ID" });
});
// Release clears are `clear` slots of the one SetFields document (there is no
// ClearFields operation), so the order is the slot order of that request's field ids.
test("release clears owner before claimed_at", async () => {
  const { a, exec } = make(claims.release);
  await a.release("gh-5", "agent-a");
  const clear = exec.calls.find((c) => c.operation === "SetFields");
  assert.deepEqual([clear.variables.f0Field, clear.variables.f1Field], [TEXT_FIELD_IDS.owner, TEXT_FIELD_IDS.claimed_at]);
});

// ---------------------------------------------------------------------------
// BEH-21 – BEH-25, the closed SetFields document set, the lease boundary, and
// the CLI entry points `adev issues claim|release`.
// ---------------------------------------------------------------------------

const isMutation = (c) => /^\s*mutation\b/.test(c.query);
const mutations = (exec) => exec.calls.filter(isMutation);
const ops = (exec) => exec.calls.map((c) => c.operation);

/** An adapter whose sleep is logged into the request log, so the settle wait has a position. */
function traced(fx, m = manifest(1500)) {
  const exec = replayExec(fx);
  const sleeps = [];
  const a = new GithubAdapter(createTempDir(), m, {
    exec,
    now: () => NOW,
    sleep: async (ms) => {
      sleeps.push(ms);
      exec.calls.push({ operation: `sleep(${ms})`, query: "", variables: {} });
    },
  });
  return { a, exec, sleeps };
}

const withTtl = (ttl) => ({ tasks: { ...manifest(1500).tasks, claim_ttl_minutes: ttl } });

// --- claim: preconditions (BEH-21) -------------------------------------------

test("claim on a live lease carries the holder's owner and claimed_at, and sends no mutation", async () => {
  const { a, exec } = traced(claims.liveLease);
  await assert.rejects(a.claim("gh-5", "agent-b"), (e) => e.code === "ISSUE_ALREADY_CLAIMED" && e.owner === "agent-a" && e.claimed_at === LIVE_AT);
  assert.deepEqual(mutations(exec), []);
});

test("claim on a closed issue refuses with ISSUE_CLOSED and sends no mutation", async () => {
  const { a, exec } = traced(claims.closedItem);
  await assert.rejects(a.claim("gh-5", "agent-b"), { code: "ISSUE_CLOSED" });
  assert.deepEqual(mutations(exec), []);
});

test("claim checks the lease on a fresh item read, not on a board cached by an earlier read", async () => {
  const { a, exec } = traced(claims.cachedBoardStale);
  assert.equal((await a.get("gh-5")).owner, undefined);
  await assert.rejects(a.claim("gh-5", "agent-b"), (e) => e.code === "ISSUE_ALREADY_CLAIMED" && e.owner === "agent-a" && e.claimed_at === LIVE_AT);
  assert.equal(exec.calls.filter((c) => c.operation === "ProjectItem").length, 1);
  assert.deepEqual(mutations(exec), []);
});

test("an owner with no claimed_at holds a lease that cannot expire: claim refuses, fail-closed", async () => {
  const { a, exec } = traced(claims.unexpirable);
  await assert.rejects(a.claim("gh-5", "agent-b"), (e) => e.code === "ISSUE_ALREADY_CLAIMED" && e.owner === "agent-a" && e.claimed_at === null);
  assert.deepEqual(mutations(exec), []);
});

test("a blank owner is refused with MISSING_OWNER before any mutation", async () => {
  for (const owner of ["", "   ", undefined]) {
    const { a, exec } = traced(claims.freeClaim);
    await assert.rejects(a.claim("gh-5", owner), { code: "MISSING_OWNER" });
    assert.deepEqual(mutations(exec), []);
  }
});

test("a branch the BEH-39 predicate refuses is rejected before the claim is written", async () => {
  const { a, exec } = traced(claims.freeClaim);
  await assert.rejects(a.claim("gh-5", "agent-b", { branch: "@" }), (e) => e.code === "GITHUB_INVALID_FIELD_VALUE" && e.field === "branch");
  assert.deepEqual(mutations(exec), []);
});

test("claim of an ID not on the project → NOT_FOUND with no mutation", async () => {
  const { a, exec } = traced(claims.freeClaim);
  await assert.rejects(a.claim("gh-404", "agent-b"), { code: "NOT_FOUND" });
  assert.deepEqual(mutations(exec), []);
});

// --- claim: write order, re-reads and settle (BEH-21, BEH-22) ----------------

test("claim writes claimed_at then owner in one SetFields request, re-reads, settles, re-reads, and returns the confirmed item", async () => {
  const { a, exec, sleeps } = traced(claims.freeClaim);
  const item = await a.claim("gh-5", "agent-b");
  const write = exec.calls.find((c) => c.operation === "SetFields");
  assert.equal(write.query, setFieldsDocument(["text", "text"]));
  assert.deepEqual(write.variables, {
    projectId: "PVT_fixture",
    itemId: "PVTI_fixture_5",
    f0Field: TEXT_FIELD_IDS.claimed_at,
    f0Value: NOW_ISO,
    f1Field: TEXT_FIELD_IDS.owner,
    f1Value: "agent-b",
  });
  const fromWrite = ops(exec).slice(ops(exec).indexOf("SetFields"));
  assert.deepEqual(fromWrite, ["SetFields", "ProjectItem", "sleep(1500)", "ProjectItem"]);
  assert.deepEqual(sleeps, [1500]);
  assert.equal(item.id, "gh-5");
  assert.equal(item.owner, "agent-b");
  assert.equal(item.claimed_at, NOW_ISO);
  assert.equal(item.takeover, undefined);
  assert.equal(item.status, "open");
});

test("claim_settle_ms: 0 waits no time but still takes the settle re-read", async () => {
  const { a, exec, sleeps } = traced(claims.freeClaim, manifest(0));
  const item = await a.claim("gh-5", "agent-b");
  assert.equal(sleeps.reduce((sum, ms) => sum + ms, 0), 0);
  assert.equal(exec.calls.filter((c) => c.operation === "ProjectItem").length, 3);
  assert.equal(item.owner, "agent-b");
});

test("a claim invalidates the cached board: a later get() shows the new owner", async () => {
  const { a } = traced(claims.freeClaim);
  await a.claim("gh-5", "agent-b");
  const after = await a.get("gh-5");
  assert.equal(after.owner, "agent-b");
  assert.equal(after.claimed_at, NOW_ISO);
});

test("branch and pr are written only after the settle re-read confirms, then the item is read back", async () => {
  const { a, exec } = traced(claims.claimWithWork);
  const item = await a.claim("gh-5", "agent-b", { branch: "feat/x", pr: "#12" });
  const writes = mutations(exec);
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[1].variables, {
    projectId: "PVT_fixture",
    itemId: "PVTI_fixture_5",
    f0Field: TEXT_FIELD_IDS.branch,
    f0Value: "feat/x",
    f1Field: TEXT_FIELD_IDS.pr,
    f1Value: "#12",
  });
  assert.deepEqual(ops(exec).slice(ops(exec).indexOf("SetFields")), ["SetFields", "ProjectItem", "sleep(1500)", "ProjectItem", "SetFields", "ProjectItem"]);
  assert.equal(item.owner, "agent-b");
  assert.equal(item.branch, "feat/x");
  assert.equal(item.pr, "#12");
});

test("a claim lost before the first re-read carries the winner, never waits, and writes no branch", async () => {
  const { a, exec, sleeps } = traced(claims.lostBeforeReread);
  await assert.rejects(a.claim("gh-5", "agent-b", { branch: "feat/x", pr: "#12" }), (e) => e.code === "ISSUE_ALREADY_CLAIMED" && e.owner === "agent-a" && e.claimed_at === WINNER_AT);
  assert.deepEqual(sleeps, []);
  assert.deepEqual(mutations(exec).map((c) => c.variables.f1Value), ["agent-b"]);
  assert.equal(exec.calls.at(-1).operation, "ProjectItem");
});

test("a re-read showing no owner → ISSUE_ALREADY_CLAIMED saying the item no longer carries the claim, nothing further written", async () => {
  const { a, exec } = traced(claims.lostToNoOwner);
  await assert.rejects(a.claim("gh-5", "agent-b"), (e) =>
    e.code === "ISSUE_ALREADY_CLAIMED" && e.owner === null && /claim lost: gh-5 no longer carries our claim/i.test(e.message) && !/claimed by/.test(e.message));
  assert.equal(mutations(exec).length, 1);
});

test("a claim lost within the settle interval carries the winner and writes nothing further (rollback by abstention)", async () => {
  const { a, exec, sleeps } = traced(claims.lostDuringSettle);
  await assert.rejects(a.claim("gh-5", "agent-b", { branch: "feat/x" }), (e) => e.code === "ISSUE_ALREADY_CLAIMED" && e.owner === "agent-a" && e.claimed_at === WINNER_AT);
  assert.deepEqual(sleeps, [1500]);
  // The loser neither clears its own writes nor restores the winner's claimed_at.
  assert.equal(mutations(exec).length, 1);
  assert.equal(exec.calls.at(-1).operation, "ProjectItem");
});

// --- claim: owner write failure (BEH-23) --------------------------------------

test("an owner write rejected after claimed_at landed → GITHUB_WRITE_FAILED with GitHub's reason, no re-read, and the item reads unclaimed", async () => {
  const { a, exec } = traced(claims.ownerWriteFails);
  await assert.rejects(a.claim("gh-5", "agent-b"), (e) => e.code === "GITHUB_WRITE_FAILED" && e.message.includes(OWNER_REJECTION));
  assert.equal(exec.calls.at(-1).operation, "SetFields");
  const after = await a.get("gh-5");
  assert.equal(after.owner, undefined);
  assert.equal(after.claimed_at, NOW_ISO);
});

// Aliases of one request execute independently, so owner can land while claimed_at is
// rejected; adev then clears owner at once, since an owner without claimed_at never expires.
test("a claimed_at write rejected while owner landed → a re-read, one compensating owner clear, GITHUB_WRITE_FAILED, and the item reads unclaimed", async () => {
  const { a, exec } = traced(claims.claimedAtWriteFails);
  await assert.rejects(a.claim("gh-5", "agent-b"), (e) => e.code === "GITHUB_WRITE_FAILED" && e.message.includes(CLAIMED_AT_REJECTION) && e.id === "gh-5");
  assert.deepEqual(ops(exec).slice(-3), ["SetFields", "ProjectItem", "SetFields"]);
  const writes = mutations(exec);
  assert.equal(writes.length, 2);
  assert.equal(writes[1].query, setFieldsDocument(["clear"]));
  assert.deepEqual(writes[1].variables, { projectId: "PVT_fixture", itemId: "PVTI_fixture_5", f0Field: TEXT_FIELD_IDS.owner });
  assert.equal(exec.calls.at(-1).operation, "SetFields");
  const after = await a.get("gh-5");
  assert.equal(after.owner, undefined);
  assert.equal(after.claimed_at, undefined);
});

test("a failed compensating owner clear → GITHUB_WRITE_FAILED naming the item and warning that owner may be set without claimed_at", async () => {
  const { a, exec } = traced(claims.compensationFails);
  await assert.rejects(a.claim("gh-5", "agent-b"), (e) =>
    e.code === "GITHUB_WRITE_FAILED" && e.id === "gh-5" && e.message.includes("gh-5") &&
    /owner may be set without claimed_at/.test(e.message) && e.message.includes(COMPENSATION_REJECTION));
  assert.equal(mutations(exec).length, 2);
  assert.equal(exec.calls.at(-1).operation, "SetFields");
});

test("a claimed_at write rejected while owner landed, with another owner on the re-read → GITHUB_WRITE_FAILED naming that holder and no compensating clear", async () => {
  const { a, exec } = traced(claims.claimedAtWriteFailsOvertaken);
  await assert.rejects(a.claim("gh-5", "agent-b"), (e) =>
    e.code === "GITHUB_WRITE_FAILED" && e.id === "gh-5" && e.owner === "agent-a" &&
    e.message.includes(CLAIMED_AT_REJECTION) && e.message.includes('"agent-a"'));
  assert.equal(mutations(exec).length, 1);
  assert.equal(exec.calls.at(-1).operation, "ProjectItem");
});

// On a takeover, a landed claimed_at with a rejected owner would leave the previous holder
// with a fresh lease; adev clears it, but only while the re-read still shows that state.
test("a takeover whose owner write is rejected after claimed_at landed → a re-read, one request clearing owner then claimed_at, GITHUB_WRITE_FAILED, and the item reads unclaimed", async () => {
  const { a, exec } = traced(claims.takeoverOwnerWriteFails);
  await assert.rejects(a.claim("gh-5", "agent-b"), (e) => e.code === "GITHUB_WRITE_FAILED" && e.id === "gh-5" && e.message.includes(OWNER_REJECTION));
  assert.deepEqual(ops(exec).slice(-3), ["SetFields", "ProjectItem", "SetFields"]);
  const writes = mutations(exec);
  assert.equal(writes.length, 2);
  assert.equal(writes[1].query, setFieldsDocument(["clear", "clear"]));
  assert.deepEqual(writes[1].variables, { projectId: "PVT_fixture", itemId: "PVTI_fixture_5", f0Field: TEXT_FIELD_IDS.owner, f1Field: TEXT_FIELD_IDS.claimed_at });
  const after = await a.get("gh-5");
  assert.equal(after.owner, undefined);
  assert.equal(after.claimed_at, undefined);
});

test("a failed compensating lease clear on a takeover → GITHUB_WRITE_FAILED naming the item and warning the lease may be extended", async () => {
  const { a, exec } = traced(claims.takeoverClearFails);
  await assert.rejects(a.claim("gh-5", "agent-b"), (e) =>
    e.code === "GITHUB_WRITE_FAILED" && e.id === "gh-5" && e.message.includes("gh-5") &&
    /lease .*may be extended/.test(e.message) && e.message.includes(LEASE_CLEAR_REJECTION));
  assert.equal(mutations(exec).length, 2);
  assert.equal(exec.calls.at(-1).operation, "SetFields");
});

test("a takeover whose owner write is rejected, with a re-read this claim did not leave → GITHUB_WRITE_FAILED and nothing further written", async () => {
  for (const [fx, holder] of [[claims.takeoverStampOverwritten, "agent-a"], [claims.takeoverOvertaken, "agent-c"]]) {
    const { a, exec } = traced(fx);
    await assert.rejects(a.claim("gh-5", "agent-b"), (e) =>
      e.code === "GITHUB_WRITE_FAILED" && e.id === "gh-5" && e.owner === holder && e.message.includes(OWNER_REJECTION));
    assert.equal(mutations(exec).length, 1);
    assert.equal(exec.calls.at(-1).operation, "ProjectItem");
  }
});

// A re-claim inside the claimant's own live lease leaves a valid lease whichever alias
// landed, so compensating either direction would only destroy the holder's claim.
test("a re-claim inside its own live lease with one alias rejected → GITHUB_WRITE_FAILED with no re-read and no compensating clear", async () => {
  for (const [fx, reason] of [[claims.reclaimLiveClaimedAtWriteFails, CLAIMED_AT_REJECTION], [claims.reclaimLiveOwnerWriteFails, OWNER_REJECTION]]) {
    const { a, exec } = traced(fx);
    await assert.rejects(a.claim("gh-5", "agent-a"), (e) => e.code === "GITHUB_WRITE_FAILED" && e.message.includes(reason));
    assert.equal(mutations(exec).length, 1);
    assert.equal(exec.calls.at(-1).operation, "SetFields");
  }
});

test("both claim aliases rejected, or a request-level rejection → GITHUB_WRITE_FAILED with no compensating request", async () => {
  for (const fx of [claims.claimWriteRejected, claims.claimRequestRejected]) {
    const { a, exec } = traced(fx);
    await assert.rejects(a.claim("gh-5", "agent-b"), (e) => e.code === "GITHUB_WRITE_FAILED" && e.message.includes(CLAIMED_AT_REJECTION));
    assert.equal(mutations(exec).length, 1);
    assert.equal(exec.calls.at(-1).operation, "SetFields");
  }
});

// --- claim: leases and takeover (BEH-21, BEH-25) -------------------------------

test("a stale lease is taken over with a fresh claimed_at and the json adapter's takeover values", async () => {
  const { a, exec } = traced(claims.staleLease);
  const item = await a.claim("gh-5", "agent-b");
  assert.deepEqual(item.takeover, { previous_owner: "agent-a", previous_claimed_at: STALE_AT, ttl_minutes: 240 });
  assert.equal(item.owner, "agent-b");
  assert.equal(item.claimed_at, NOW_ISO);
  assert.equal(exec.calls.find((c) => c.operation === "SetFields").variables.f0Value, NOW_ISO);
});

test("a lease exactly claim_ttl_minutes old is stale and taken over", async () => {
  const item = await traced(claims.ttlEdge).a.claim("gh-5", "agent-b");
  assert.deepEqual(item.takeover, { previous_owner: "agent-a", previous_claimed_at: TTL_EDGE_AT, ttl_minutes: 240 });
});

test("a lease one millisecond short of claim_ttl_minutes is live and refused", async () => {
  const { a, exec } = traced(claims.ttlInside);
  await assert.rejects(a.claim("gh-5", "agent-b"), (e) => e.code === "ISSUE_ALREADY_CLAIMED" && e.owner === "agent-a");
  assert.deepEqual(mutations(exec), []);
});

test("claim_ttl_minutes: 0 disables expiry: a lease of any age is refused", async () => {
  const { a, exec } = traced(claims.staleLease, withTtl(0));
  await assert.rejects(a.claim("gh-5", "agent-b"), (e) => e.code === "ISSUE_ALREADY_CLAIMED" && e.owner === "agent-a" && e.claimed_at === STALE_AT);
  assert.deepEqual(mutations(exec), []);
});

test("a custom claim_ttl_minutes decides staleness and is reported as ttl_minutes", async () => {
  // LIVE_AT is 30 minutes old: live under the 240-minute lease, stale under a 30-minute one.
  const { a, exec } = traced(claims.shortTtlTakeover, withTtl(30));
  const item = await a.claim("gh-5", "agent-b");
  assert.deepEqual(item.takeover, { previous_owner: "agent-a", previous_claimed_at: LIVE_AT, ttl_minutes: 30 });
  assert.equal(mutations(exec)[0].variables.f0Value, NOW_ISO);
});

test("a re-claim inside the holder's live lease writes the held claimed_at back, and is no takeover", async () => {
  const { a, exec } = traced(claims.reclaimLive);
  const item = await a.claim("gh-5", "agent-a");
  assert.deepEqual(mutations(exec).map((c) => [c.variables.f0Value, c.variables.f1Value]), [[LIVE_AT, "agent-a"]]);
  assert.equal(item.claimed_at, LIVE_AT);
  assert.equal(item.takeover, undefined);
});

test("a re-claim of the holder's own expired lease is a fresh claim with a takeover naming the holder", async () => {
  const { a, exec } = traced(claims.reclaimStale);
  const item = await a.claim("gh-5", "agent-a");
  assert.equal(mutations(exec)[0].variables.f0Value, NOW_ISO);
  assert.deepEqual(item.takeover, { previous_owner: "agent-a", previous_claimed_at: STALE_AT, ttl_minutes: 240 });
});

test("no claim or release request writes the status field", async () => {
  const runs = [
    [claims.freeClaim, (a) => a.claim("gh-5", "agent-b")],
    [claims.claimWithWork, (a) => a.claim("gh-5", "agent-b", { branch: "feat/x", pr: "#12" })],
    [claims.staleLease, (a) => a.claim("gh-5", "agent-b")],
    [claims.release, (a) => a.release("gh-5", "agent-a")],
  ];
  for (const [fx, call] of runs) {
    const { a, exec } = traced(fx);
    const item = await call(a);
    assert.equal(item.status, "open");
    for (const c of mutations(exec)) {
      assert.equal(c.operation, "SetFields");
      assert.ok(!Object.values(c.variables).includes(STATUS_FIELD_ID), "a claim-path request carries the status field");
    }
  }
});

// --- release (BEH-24) ---------------------------------------------------------

test("release clears owner then claimed_at as two clear slots of one request, keeps branch and pr, and returns the read-back", async () => {
  const { a, exec } = traced(claims.release);
  const item = await a.release("gh-5", "agent-a");
  const writes = mutations(exec);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].query, setFieldsDocument(["clear", "clear"]));
  assert.deepEqual(writes[0].variables, { projectId: "PVT_fixture", itemId: "PVTI_fixture_5", f0Field: TEXT_FIELD_IDS.owner, f1Field: TEXT_FIELD_IDS.claimed_at });
  assert.equal(exec.calls.at(-1).operation, "ProjectItem");
  assert.equal(item.owner, undefined);
  assert.equal(item.claimed_at, undefined);
  assert.equal(item.branch, "feat/a");
  assert.equal(item.pr, "#12");
});

test("release invalidates the cached board: a later get() shows the item unclaimed", async () => {
  const { a } = traced(claims.release);
  await a.release("gh-5", "agent-a");
  const after = await a.get("gh-5");
  assert.equal(after.owner, undefined);
  assert.equal(after.branch, "feat/a");
});

test("release by another owner refuses with CLAIM_OWNER_MISMATCH and sends no mutation", async () => {
  const { a, exec } = traced(claims.release);
  await assert.rejects(a.release("gh-5", "agent-b"), (e) => e.code === "CLAIM_OWNER_MISMATCH" && e.owner === "agent-a");
  assert.deepEqual(mutations(exec), []);
});

test("release with force clears another owner's claim", async () => {
  const { a, exec } = traced(claims.release);
  const item = await a.release("gh-5", "agent-b", { force: true });
  assert.equal(mutations(exec).length, 1);
  assert.equal(item.owner, undefined);
});

test("release of an unclaimed item is an idempotent no-op with no mutation", async () => {
  const { a, exec } = traced(claims.releaseFree);
  const item = await a.release("gh-5", "agent-a");
  assert.deepEqual(mutations(exec), []);
  assert.equal(item.id, "gh-5");
  assert.equal(item.owner, undefined);
});

test("release is lease-blind: the holder releases its own expired lease", async () => {
  const { a, exec } = traced(claims.releaseStale);
  const item = await a.release("gh-5", "agent-a");
  assert.equal(mutations(exec).length, 1);
  assert.equal(item.owner, undefined);
});

test("legacy IDs on release: unknown → NOT_FOUND, ambiguous → GITHUB_AMBIGUOUS_LEGACY_ID", async () => {
  await assert.rejects(make(claims.migratedBoard).a.release("issue-zzzzzz", "agent-a"), { code: "NOT_FOUND" });
  await assert.rejects(make(claims.migratedBoard).a.release("epic-2", "agent-a"), { code: "GITHUB_AMBIGUOUS_LEGACY_ID" });
});

// ---------------------------------------------------------------------------
// CLI: `adev issues claim` / `release` on the github backend. The CLI builds its
// own adapter with the real clock, so only paths that write no timestamp run
// here, under `claim_ttl_minutes: 0` so a lease's age never depends on today's
// date. `gh` is a fake on a PATH with every real `gh` removed; each fake spawn
// replays the earlier requests first, so recorded sequences advance across spawns.
// No token reaches the child.
// ---------------------------------------------------------------------------

const CLI = fileURLToPath(new URL("../../../cli/index.mjs", import.meta.url));
const REPLAY_URL = new URL("./replay-transport.mjs", import.meta.url).href;

function holdsGh(dir) {
  try {
    accessSync(join(dir, "gh"), constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function withProject(fixtures, fn) {
  const root = createTempDir();
  const project = join(root, "project");
  const bin = join(root, "bin");
  mkdirSync(join(project, ".context-index"), { recursive: true });
  mkdirSync(bin);
  writeFileSync(join(project, ".context-index", "manifest.yaml"), [
    "tasks:",
    "  backend: github",
    "  claim_ttl_minutes: 0",
    "  github:",
    "    project: https://github.com/orgs/acme/projects/7",
    "    repo: acme/board",
    "    claim_settle_ms: 0",
    "",
  ].join("\n"));
  for (const args of [["init", "-q", "."], ["config", "user.email", "t@example.com"], ["config", "user.name", "t"], ["commit", "-q", "--allow-empty", "-m", "init"]]) {
    execFileSync("git", args, { cwd: project });
  }
  writeFileSync(join(bin, "fixtures.json"), JSON.stringify(fixtures));
  writeFileSync(join(bin, "gh-replay.mjs"), [
    'import { readFileSync, appendFileSync, existsSync } from "node:fs";',
    `import { replayExec } from ${JSON.stringify(REPLAY_URL)};`,
    'const here = (f) => new URL(f, import.meta.url);',
    'const exec = replayExec(JSON.parse(readFileSync(here("fixtures.json"), "utf8")));',
    'const prior = existsSync(here("inputs.jsonl")) ? readFileSync(here("inputs.jsonl"), "utf8").trim().split("\\n").filter(Boolean).map((l) => JSON.parse(l)) : [];',
    "for (const input of prior) { try { exec(\"gh\", [], { input }); } catch {} }",
    'const input = readFileSync(0, "utf8");',
    'appendFileSync(here("inputs.jsonl"), JSON.stringify(input) + "\\n");',
    "let out;",
    "try { out = exec(\"gh\", process.argv.slice(2), { input }); } catch (err) { process.stderr.write(String(err.message)); process.exitCode = 1; }",
    'appendFileSync(here("calls.jsonl"), JSON.stringify(exec.calls.at(-1)) + "\\n");',
    "if (out !== undefined) process.stdout.write(out);",
    "",
  ].join("\n"));
  writeFileSync(join(bin, "gh"), `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(join(bin, "gh-replay.mjs"))} "$@"\n`, { mode: 0o755 });

  const pathDirs = [bin, ...(process.env.PATH ?? "").split(delimiter).filter((d) => d !== "" && !holdsGh(d))];
  const env = { ...process.env, PATH: pathDirs.join(delimiter), ADEV_SILENCE_SHADOW_BOARD: "1", ADEV_SILENCE_DEFAULT_BACKEND_ADVISORY: "1" };
  for (const key of ["GH_TOKEN", "GITHUB_TOKEN", "GH_ENTERPRISE_TOKEN", "GITHUB_ENTERPRISE_TOKEN", "GH_HOST", "ADEV_ISSUE_OWNER"]) delete env[key];

  const p = {
    run(verb, args) {
      const r = spawnSync(process.execPath, [CLI, "issues", verb, ...args], { cwd: project, env, encoding: "utf8", timeout: 60_000 });
      return { status: r.status, out: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
    },
    ops() {
      const file = join(bin, "calls.jsonl");
      if (!existsSync(file)) return [];
      return readFileSync(file, "utf8").trim().split("\n").map((line) => JSON.parse(line)).filter(isMutation).map((c) => c.operation);
    },
  };
  try {
    fn(p);
  } finally {
    cleanupTempDir(root);
  }
}

test("adev issues claim: a live lease held by another owner exits 2 naming the holder, with no mutation", () => {
  withProject(claims.liveLease, (p) => {
    const r = p.run("claim", ["gh-5", "--owner", "agent-b"]);
    assert.equal(r.status, 2, r.out);
    assert.match(r.out, /already claimed by "agent-a"/);
    assert.deepEqual(p.ops(), []);
  });
});

test("adev issues release: the holder's release clears the claim in one SetFields request and exits 0", () => {
  withProject(claims.release, (p) => {
    const r = p.run("release", ["gh-5", "--owner", "agent-a"]);
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /^released gh-5 \(owner cleared\)$/m);
    assert.deepEqual(p.ops(), ["SetFields"]);
  });
});

test("adev issues release: another owner without --force exits 2 with no mutation", () => {
  withProject(claims.release, (p) => {
    const r = p.run("release", ["gh-5", "--owner", "agent-b"]);
    assert.equal(r.status, 2, r.out);
    assert.match(r.out, /claimed by "agent-a", not "agent-b"/);
    assert.deepEqual(p.ops(), []);
  });
});
