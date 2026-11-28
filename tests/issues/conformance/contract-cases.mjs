/**
 * The IssueManager contract every board backend must honor identically. Each
 * case runs on a manager of its own, built by `makeManager(caseName)`: a runner
 * that replays recorded GitHub traffic loads the fixture set recorded under that
 * name, so case names are stable identifiers and must stay unique.
 *
 * Cases are backend-neutral: they assume no ID shape (IDs are only compared, never
 * parsed), no storage layout, and no board beyond what the case itself created,
 * since a live project carries items from other cases. Every title, body and close
 * reason starts with `adev-fixture:`, which the fixture lint requires of recorded
 * text. Behaviors where the github backend deliberately differs live in
 * github-differences.test.mjs.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

export const FIXTURE_TEXT_PREFIX = "adev-fixture:";

const text = (s) => `${FIXTURE_TEXT_PREFIX} ${s}`;
const OWNER_A = "adev-fixture-agent-a";
const OWNER_B = "adev-fixture-agent-b";
const BRANCH = "adev-fixture/conformance";
const PR = "12";
// An ID no case ever creates. It is a well-formed canonical ID on the github backend and
// an arbitrary absent key on the json backend, so both must report it as not on the board.
const UNKNOWN_ID = "gh-999999";
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const CONTRACT_METHODS = ["create", "get", "list", "update", "close", "claim", "release", "addDependency", "walkTree"];

const only = (issues, created) => issues.filter((i) => created.includes(i.id)).map((i) => i.id);
const ownerOf = (issue) => issue.owner ?? null;
const claimedAtOf = (issue) => issue.claimed_at ?? null;

/** @type {ReadonlyArray<{ name: string, run: (manager: object) => Promise<void> }>} */
export const CASES = Object.freeze([
  {
    name: "create returns the issue with the given fields and get reads it back",
    async run(m) {
      const fields = {
        title: text("create round trip"),
        notes: text("create body"),
        priority: 1,
        spec_ref: "specs/adev-fixture.spec.md",
        planRef: "plans/adev-fixture.plan.md",
      };
      const created = await m.create(fields);
      assert.equal(typeof created.id, "string");
      assert.notEqual(created.id, "");
      for (const [key, value] of Object.entries(fields)) assert.equal(created[key], value, key);
      assert.equal(created.status, "open");
      assert.deepEqual(created.dependencies, []);

      const read = await m.get(created.id);
      assert.equal(read.id, created.id);
      for (const [key, value] of Object.entries(fields)) assert.equal(read[key], value, key);
      assert.equal(read.status, "open");
      assert.deepEqual(read.dependencies, []);
    },
  },
  {
    name: "create stores a non-default status",
    async run(m) {
      const created = await m.create({ title: text("created in progress"), status: "in_progress" });
      assert.equal(created.status, "in_progress");
      assert.equal((await m.get(created.id)).status, "in_progress");
    },
  },
  {
    name: "create refuses a missing or blank title with MISSING_REQUIRED_FIELD and writes nothing",
    async run(m) {
      const before = (await m.list()).map((i) => i.id);
      await assert.rejects(m.create({ notes: text("no title") }), { code: "MISSING_REQUIRED_FIELD" });
      await assert.rejects(m.create({ title: "   " }), { code: "MISSING_REQUIRED_FIELD" });
      assert.deepEqual((await m.list()).map((i) => i.id), before);
    },
  },
  {
    name: "create refuses planTask with BOARD_GRANULARITY_VIOLATION",
    async run(m) {
      await assert.rejects(m.create({ title: text("plan task"), planTask: 3 }), { code: "BOARD_GRANULARITY_VIOLATION" });
    },
  },
  {
    name: "get returns null for an ID that is not on the board",
    async run(m) {
      assert.equal(await m.get(UNKNOWN_ID), null);
    },
  },
  {
    name: "list orders issues by priority and filters by status",
    async run(m) {
      const low = await m.create({ title: text("list low"), priority: 3 });
      const high = await m.create({ title: text("list high"), priority: 1, status: "in_progress" });
      const mine = [low.id, high.id];

      assert.deepEqual(only(await m.list(), mine), [high.id, low.id]);
      assert.deepEqual(only(await m.list({ status: "in_progress" }), mine), [high.id]);
      assert.deepEqual(only(await m.list({ status: "open" }), mine), [low.id]);
      assert.deepEqual(only(await m.list({ status: "closed" }), mine), []);
    },
  },
  {
    name: "update writes the changed fields and get reads them back",
    async run(m) {
      const created = await m.create({ title: text("before update"), notes: text("old body"), priority: 3 });
      const changes = { title: text("after update"), notes: text("new body"), priority: 0, status: "in_progress" };
      const updated = await m.update(created.id, changes);
      assert.equal(updated.id, created.id);
      for (const [key, value] of Object.entries(changes)) assert.equal(updated[key], value, key);

      const read = await m.get(created.id);
      for (const [key, value] of Object.entries(changes)) assert.equal(read[key], value, key);
    },
  },
  {
    name: "update folds a description alias into notes",
    async run(m) {
      const created = await m.create({ title: text("alias update"), notes: text("old body") });
      await m.update(created.id, { description: text("body via alias") });
      const read = await m.get(created.id);
      assert.equal(read.notes, text("body via alias"));
      assert.equal(Object.hasOwn(read, "description"), false);
    },
  },
  {
    name: "update refuses an ID that is not on the board with NOT_FOUND",
    async run(m) {
      await assert.rejects(m.update(UNKNOWN_ID, { title: text("nowhere") }), { code: "NOT_FOUND" });
    },
  },
  {
    name: "update refuses status closed with USE_CLOSE_METHOD and leaves the issue open",
    async run(m) {
      const created = await m.create({ title: text("no close via update") });
      await assert.rejects(m.update(created.id, { status: "closed" }), { code: "USE_CLOSE_METHOD" });
      assert.equal((await m.get(created.id)).status, "open");
    },
  },
  {
    name: "close marks the issue closed and a closed issue refuses update with ISSUE_CLOSED",
    async run(m) {
      const created = await m.create({ title: text("to close") });
      const closed = await m.close(created.id, text("done"));
      assert.equal(closed.id, created.id);
      assert.equal(closed.status, "closed");
      assert.equal((await m.get(created.id)).status, "closed");
      await assert.rejects(m.update(created.id, { title: text("reopen attempt") }), { code: "ISSUE_CLOSED" });
      assert.equal((await m.get(created.id)).title, text("to close"));
    },
  },
  {
    name: "close refuses an issue with an open blocker with BLOCKED_BY_DEPENDENCIES and succeeds once it is closed",
    async run(m) {
      const dependent = await m.create({ title: text("blocked issue") });
      const blocker = await m.create({ title: text("blocker issue") });
      await m.addDependency(dependent.id, blocker.id);

      await assert.rejects(m.close(dependent.id, text("too early")), { code: "BLOCKED_BY_DEPENDENCIES", blockers: [blocker.id] });
      assert.equal((await m.get(dependent.id)).status, "open");

      await m.close(blocker.id, text("blocker done"));
      assert.equal((await m.close(dependent.id, text("unblocked"))).status, "closed");
      assert.equal((await m.get(dependent.id)).status, "closed");
    },
  },
  {
    name: "close refuses an ID that is not on the board with NOT_FOUND",
    async run(m) {
      await assert.rejects(m.close(UNKNOWN_ID, text("nowhere")), { code: "NOT_FOUND" });
    },
  },
  {
    name: "addDependency records the blocker on the dependent issue only, and repeating it is a no-op",
    async run(m) {
      const dependent = await m.create({ title: text("depends") });
      const blocker = await m.create({ title: text("blocks") });
      await m.addDependency(dependent.id, blocker.id);
      await m.addDependency(dependent.id, blocker.id);
      assert.deepEqual((await m.get(dependent.id)).dependencies, [blocker.id]);
      assert.deepEqual((await m.get(blocker.id)).dependencies, []);
    },
  },
  {
    name: "addDependency refuses a self-dependency and a cycle with CIRCULAR_DEPENDENCY",
    async run(m) {
      const a = await m.create({ title: text("cycle a") });
      const b = await m.create({ title: text("cycle b") });
      await assert.rejects(m.addDependency(a.id, a.id), { code: "CIRCULAR_DEPENDENCY" });
      await m.addDependency(a.id, b.id);
      await assert.rejects(m.addDependency(b.id, a.id), { code: "CIRCULAR_DEPENDENCY" });
      assert.deepEqual((await m.get(a.id)).dependencies, [b.id]);
      assert.deepEqual((await m.get(b.id)).dependencies, []);
    },
  },
  {
    name: "addDependency refuses a dependent ID that is not on the board with NOT_FOUND",
    async run(m) {
      const blocker = await m.create({ title: text("lonely blocker") });
      await assert.rejects(m.addDependency(UNKNOWN_ID, blocker.id), { code: "NOT_FOUND" });
    },
  },
  {
    name: "claim sets owner and an ISO claimed_at, and a re-claim by the same owner keeps claimed_at",
    async run(m) {
      const created = await m.create({ title: text("claim me") });
      const claimed = await m.claim(created.id, OWNER_A);
      assert.equal(claimed.id, created.id);
      assert.equal(claimed.owner, OWNER_A);
      assert.match(claimed.claimed_at, ISO_TIMESTAMP);

      const read = await m.get(created.id);
      assert.equal(read.owner, OWNER_A);
      assert.equal(read.claimed_at, claimed.claimed_at);

      const again = await m.claim(created.id, OWNER_A);
      assert.equal(again.owner, OWNER_A);
      assert.equal(again.claimed_at, claimed.claimed_at);
    },
  },
  {
    name: "claim by another owner inside a live lease is refused with ISSUE_ALREADY_CLAIMED naming the holder",
    async run(m) {
      const created = await m.create({ title: text("contended") });
      const claimed = await m.claim(created.id, OWNER_A);
      await assert.rejects(m.claim(created.id, OWNER_B), { code: "ISSUE_ALREADY_CLAIMED", owner: OWNER_A });
      const read = await m.get(created.id);
      assert.equal(read.owner, OWNER_A);
      assert.equal(read.claimed_at, claimed.claimed_at);
    },
  },
  {
    name: "claim refuses a blank owner with MISSING_OWNER and leaves the issue unclaimed",
    async run(m) {
      const created = await m.create({ title: text("blank owner") });
      await assert.rejects(m.claim(created.id, ""), { code: "MISSING_OWNER" });
      await assert.rejects(m.claim(created.id, "   "), { code: "MISSING_OWNER" });
      assert.equal(ownerOf(await m.get(created.id)), null);
    },
  },
  {
    name: "claim refuses a closed issue with ISSUE_CLOSED",
    async run(m) {
      const created = await m.create({ title: text("closed before claim") });
      await m.close(created.id, text("closed first"));
      await assert.rejects(m.claim(created.id, OWNER_A), { code: "ISSUE_CLOSED" });
      assert.equal(ownerOf(await m.get(created.id)), null);
    },
  },
  {
    name: "claim records branch and pr, and release clears owner and claimed_at but keeps them",
    async run(m) {
      const created = await m.create({ title: text("claim with refs") });
      const claimed = await m.claim(created.id, OWNER_A, { branch: BRANCH, pr: PR });
      assert.equal(claimed.owner, OWNER_A);
      assert.equal(claimed.branch, BRANCH);
      assert.equal(claimed.pr, PR);

      const released = await m.release(created.id, OWNER_A);
      assert.equal(ownerOf(released), null);
      assert.equal(claimedAtOf(released), null);
      assert.equal(released.branch, BRANCH);
      assert.equal(released.pr, PR);

      const read = await m.get(created.id);
      assert.equal(ownerOf(read), null);
      assert.equal(claimedAtOf(read), null);
      assert.equal(read.branch, BRANCH);
      assert.equal(read.pr, PR);
    },
  },
  {
    name: "release by a non-holder is refused with CLAIM_OWNER_MISMATCH unless forced",
    async run(m) {
      const created = await m.create({ title: text("held by a") });
      await m.claim(created.id, OWNER_A);
      await assert.rejects(m.release(created.id, OWNER_B), { code: "CLAIM_OWNER_MISMATCH", owner: OWNER_A });
      assert.equal((await m.get(created.id)).owner, OWNER_A);

      const released = await m.release(created.id, OWNER_B, { force: true });
      assert.equal(ownerOf(released), null);
      assert.equal(claimedAtOf(released), null);
      assert.equal(ownerOf(await m.get(created.id)), null);
    },
  },
  {
    name: "release of an unclaimed issue is a no-op",
    async run(m) {
      const created = await m.create({ title: text("never claimed") });
      const released = await m.release(created.id, OWNER_A);
      assert.equal(released.id, created.id);
      assert.equal(ownerOf(released), null);
      assert.equal(claimedAtOf(released), null);
      assert.equal(released.status, "open");
    },
  },
  {
    name: "claim and release refuse an ID that is not on the board with NOT_FOUND",
    async run(m) {
      await assert.rejects(m.claim(UNKNOWN_ID, OWNER_A), { code: "NOT_FOUND" });
      await assert.rejects(m.release(UNKNOWN_ID, OWNER_A), { code: "NOT_FOUND" });
    },
  },
  {
    name: "walkTree returns an empty array for an issue with no children and for an ID not on the board",
    async run(m) {
      const leaf = await m.create({ title: text("leaf") });
      assert.deepEqual(await m.walkTree(leaf.id), []);
      assert.deepEqual(await m.walkTree(UNKNOWN_ID), []);
    },
  },
]);

/**
 * Register every contract case as a node:test test.
 *
 * @param {(caseName: string) => object} makeManager - called once per case, inside the
 *   test, with that case's name; it returns a fresh IssueManager for the case alone.
 */
export function contractCases(makeManager) {
  for (const { name, run } of CASES) {
    test(name, async () => {
      const manager = await makeManager(name);
      const missing = CONTRACT_METHODS.filter((method) => typeof manager?.[method] !== "function");
      assert.deepEqual(missing, [], `makeManager("${name}") must return an IssueManager`);
      await run(manager);
    });
  }
}
