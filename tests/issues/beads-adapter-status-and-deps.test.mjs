/**
 * Two migration-fidelity defects found by a round-trip check of a real
 * 311-issue board (issue-fw00cl and issue-bum897).
 *
 * 1. STATUS WAS DROPPED ON CREATE (issue-fw00cl).
 *    `br create` has no status flag, so a non-open status needs a follow-up
 *    call. The legacy-import path already did this for epics; `create()` did
 *    not. Every closed issue therefore landed open: the board held 79 closed
 *    items where 262 were expected — exactly the epic count, with all 183
 *    closed issues arriving open. A board that reports finished work as
 *    actionable is worse than one that is merely incomplete.
 *
 *    Terminal states go through `br close`, not `br update --status`: br
 *    refuses terminal statuses on update. That asymmetry is the whole reason
 *    this needs its own code path rather than a flag on create.
 *
 * 2. DEPENDENCIES WERE NEVER READ BACK (issue-bum897).
 *    Not data loss — the edges were correctly written (br reported
 *    `dependency_count: 2` on issue-628) — but `_toIssue()` never populated
 *    the field, so all 44 edges were invisible through list()/get().
 *    `/adev:issues ready` filters on dependencies, so every blocked issue
 *    would report as ready while the real edges sat intact in the database.
 *
 * Mock-only: `_runBr` / `_scan` are stubbed, so `br` is never required.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { BeadsAdapter } from "../../lib/issues/beads-adapter.mjs";

function makeAdapter() {
  const adapter = new BeadsAdapter("/tmp/nonexistent-beads", { checkBr: false });
  const calls = [];
  adapter._scan = () => [];
  adapter._scanRaw = () => [{ id: "br-1", external_ref: "issue-1" }];
  adapter._runBr = (args) => {
    calls.push(args);
    return JSON.stringify({ id: "br-1", title: args[1] });
  };
  return { adapter, calls };
}

describe("BeadsAdapter — status on create (issue-fw00cl)", () => {
  let ctx;
  beforeEach(() => {
    ctx = makeAdapter();
  });

  it("routes a closed issue through `br close`, not `br update --status`", async () => {
    await ctx.adapter.create({ id: "issue-1", title: "done work", type: "task", priority: 2, status: "closed" });

    const close = ctx.calls.find((c) => c[0] === "close");
    assert.ok(close, "a closed issue must be closed after create — br create has no status flag");
    assert.equal(close[1], "br-1");

    const badUpdate = ctx.calls.find((c) => c[0] === "update" && c.includes("closed"));
    assert.equal(badUpdate, undefined, "br refuses terminal statuses on update; close is the only path");
  });

  it("routes a non-terminal, non-open status through `br update --status`", async () => {
    await ctx.adapter.create({ id: "issue-1", title: "parked", type: "task", priority: 2, status: "deferred" });

    const update = ctx.calls.find((c) => c[0] === "update");
    assert.ok(update, "a deferred issue needs a follow-up update");
    const i = update.indexOf("--status");
    assert.notEqual(i, -1);
    assert.equal(update[i + 1], "deferred");
  });

  it("does not emit a follow-up call for an open issue", async () => {
    await ctx.adapter.create({ id: "issue-1", title: "new work", type: "task", priority: 2, status: "open" });

    assert.equal(ctx.calls.filter((c) => c[0] === "close" || c[0] === "update").length, 0,
      "open is br's default — a second call would be wasted work on every create");
  });

  it("does not emit a follow-up call when status is absent", async () => {
    await ctx.adapter.create({ id: "issue-1", title: "new work", type: "task", priority: 2 });
    assert.equal(ctx.calls.filter((c) => c[0] === "close" || c[0] === "update").length, 0);
  });

  it("returns the requested status rather than br's create-time default", async () => {
    const issue = await ctx.adapter.create({ id: "issue-1", title: "done", type: "task", priority: 2, status: "closed" });
    assert.equal(issue.status, "closed");
  });
});

describe("BeadsAdapter — dependencies read back (issue-bum897)", () => {
  it("_toIssue surfaces dependencies resolved to adev ids", () => {
    const adapter = new BeadsAdapter("/tmp/nonexistent-beads", { checkBr: false });
    // br speaks its own id namespace; the adev-facing shape must use adev ids.
    const raw = {
      id: "br-aaa",
      external_ref: "issue-628",
      title: "a blocked issue",
      status: "open",
      dependency_count: 2,
    };
    const edges = new Map([["br-aaa", ["issue-626", "issue-627"]]]);

    const issue = adapter._toIssue(raw, edges);
    assert.deepEqual(issue.dependencies, ["issue-626", "issue-627"]);
  });

  it("_toIssue yields an empty list when an issue has no edges", () => {
    const adapter = new BeadsAdapter("/tmp/nonexistent-beads", { checkBr: false });
    const issue = adapter._toIssue({ id: "br-b", external_ref: "issue-2", title: "free" }, new Map());
    assert.deepEqual(issue.dependencies, []);
  });

  it("_toIssue tolerates being called without an edge map at all", () => {
    // Every existing caller passes one argument. Adding a required second
    // parameter would break them silently, so absence must degrade to [].
    const adapter = new BeadsAdapter("/tmp/nonexistent-beads", { checkBr: false });
    const issue = adapter._toIssue({ id: "br-c", external_ref: "issue-3", title: "x" });
    assert.deepEqual(issue.dependencies, []);
  });
});
