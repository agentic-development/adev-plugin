/**
 * Tests for `adev issues claim` / `adev issues release`.
 *
 * Layers exercised:
 *   1. `requireClaimable` / `requireReleasable` — the pure preconditions,
 *      modelled on `lifecycle-state.mjs::requireGate`.
 *   2. `JsonAdapter.claim` / `.release` — the atomic check-and-set over the
 *      existing CAS discipline.
 *   3. `lib/cli/issues.mjs` dispatch → `lib/cli/issues-claim.mjs` exit codes.
 *
 * Lease expiry / TTL is deliberately NOT covered: claims do not expire, and
 * a stale claim must still block. That is separate work.
 */

import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  requireClaimable,
  requireReleasable,
  normalizeOwner,
} from "../../lib/issues/interface.mjs";
import { JsonAdapter } from "../../lib/issues/json-adapter.mjs";
import { run as runIssues } from "../../lib/cli/issues.mjs";

function makeProject() {
  const dir = mkdtempSync(join(tmpdir(), "issue-claim-test-"));
  mkdirSync(join(dir, ".context-index"), { recursive: true });
  writeFileSync(join(dir, ".context-index", "manifest.yaml"), "tasks:\n  backend: json\n");
  return dir;
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
// Pure preconditions
// ---------------------------------------------------------------------------

describe("requireClaimable — precondition", () => {
  it("permits claiming an unowned issue", () => {
    requireClaimable({ id: "issue-1", status: "open" }, "agent-a");
  });

  it("permits an idempotent re-claim by the same owner", () => {
    requireClaimable(
      { id: "issue-1", status: "in_progress", owner: "agent-a", claimed_at: "2026-08-12T00:00:00.000Z" },
      "agent-a",
    );
  });

  it("refuses a claim held by a different owner, and reports the holder", () => {
    assert.throws(
      () =>
        requireClaimable(
          { id: "issue-1", status: "open", owner: "agent-a", claimed_at: "2026-08-12T00:00:00.000Z" },
          "agent-b",
        ),
      (err) => {
        assert.equal(err.code, "ISSUE_ALREADY_CLAIMED");
        assert.equal(err.owner, "agent-a");
        assert.equal(err.claimed_at, "2026-08-12T00:00:00.000Z");
        assert.match(err.message, /already claimed by "agent-a"/);
        return true;
      },
    );
  });

  it("refuses a claim on a closed issue", () => {
    assert.throws(
      () => requireClaimable({ id: "issue-1", status: "closed" }, "agent-a"),
      (err) => err.code === "ISSUE_CLOSED",
    );
  });

  it("does not mutate the issue it inspects", () => {
    const issue = { id: "issue-1", status: "open" };
    const before = JSON.stringify(issue);
    requireClaimable(issue, "agent-a");
    assert.equal(JSON.stringify(issue), before);
  });
});

describe("requireReleasable — precondition", () => {
  it("permits releasing an unclaimed issue (idempotent)", () => {
    requireReleasable({ id: "issue-1", status: "open" }, "agent-a");
  });

  it("permits the holder to release", () => {
    requireReleasable({ id: "issue-1", owner: "agent-a" }, "agent-a");
  });

  it("refuses a non-holder without force", () => {
    assert.throws(
      () => requireReleasable({ id: "issue-1", owner: "agent-a" }, "agent-b"),
      (err) => err.code === "CLAIM_OWNER_MISMATCH" && err.owner === "agent-a",
    );
  });

  it("permits a non-holder with force", () => {
    requireReleasable({ id: "issue-1", owner: "agent-a" }, "agent-b", { force: true });
  });
});

describe("normalizeOwner", () => {
  it("trims a valid owner", () => {
    assert.equal(normalizeOwner("  agent-a  "), "agent-a");
  });

  it("rejects blank and missing owners with MISSING_OWNER", () => {
    for (const bad of [undefined, null, "", "   "]) {
      assert.throws(() => normalizeOwner(bad), (err) => err.code === "MISSING_OWNER");
    }
  });

  it("rejects non-string owners with INVALID_OWNER", () => {
    assert.throws(() => normalizeOwner(42), (err) => err.code === "INVALID_OWNER");
  });
});

// ---------------------------------------------------------------------------
// JsonAdapter.claim / .release
// ---------------------------------------------------------------------------

describe("JsonAdapter.claim — atomic check-and-set", () => {
  let dir, adapter;

  before(async () => {
    dir = makeProject();
    adapter = new JsonAdapter(dir);
    await adapter.init();
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  it("sets owner and claimed_at, and persists them", async () => {
    const issue = await adapter.create({ title: "Claimable" });
    const claimed = await adapter.claim(issue.id, "agent-a");
    assert.equal(claimed.owner, "agent-a");
    assert.match(claimed.claimed_at, /^\d{4}-\d{2}-\d{2}T/);

    const persisted = await new JsonAdapter(dir).get(issue.id);
    assert.equal(persisted.owner, "agent-a");
    assert.equal(persisted.claimed_at, claimed.claimed_at);
  });

  it("refuses a second owner with ISSUE_ALREADY_CLAIMED and leaves the board untouched", async () => {
    const issue = await adapter.create({ title: "Contended" });
    await adapter.claim(issue.id, "agent-a");
    const beforeState = await adapter.get(issue.id);

    await assert.rejects(
      () => adapter.claim(issue.id, "agent-b"),
      (err) => {
        assert.equal(err.code, "ISSUE_ALREADY_CLAIMED");
        assert.equal(err.owner, "agent-a");
        return true;
      },
    );

    const afterState = await new JsonAdapter(dir).get(issue.id);
    assert.equal(afterState.owner, "agent-a", "the loser must not overwrite the holder");
    assert.equal(afterState.claimed_at, beforeState.claimed_at);
  });

  it("is idempotent for the same owner and preserves the original claimed_at", async () => {
    const issue = await adapter.create({ title: "Re-claimable" });
    const first = await adapter.claim(issue.id, "agent-a");
    await new Promise((r) => setTimeout(r, 5));
    const second = await adapter.claim(issue.id, "agent-a");
    assert.equal(second.owner, "agent-a");
    assert.equal(
      second.claimed_at,
      first.claimed_at,
      "a re-claim is not a new claim — claimed_at must not advance",
    );
  });

  it("does not churn the CAS seq on a fully idempotent re-claim", async () => {
    const issue = await adapter.create({ title: "No churn" });
    await adapter.claim(issue.id, "agent-a");
    const boardPath = join(dir, ".context-index", "tasks", "tasks.json");
    const seqBefore = JSON.parse(readFileSync(boardPath, "utf8")).seq;
    await adapter.claim(issue.id, "agent-a");
    const seqAfter = JSON.parse(readFileSync(boardPath, "utf8")).seq;
    assert.equal(seqAfter, seqBefore, "a no-op claim should not write");
  });

  it("records branch and pr alongside the claim", async () => {
    const issue = await adapter.create({ title: "Bound on claim" });
    const claimed = await adapter.claim(issue.id, "agent-a", {
      branch: "feat/thing",
      pr: "#123",
    });
    assert.equal(claimed.branch, "feat/thing");
    assert.equal(claimed.pr, "#123");

    const persisted = await new JsonAdapter(dir).get(issue.id);
    assert.equal(persisted.branch, "feat/thing");
    assert.equal(persisted.pr, "#123");
  });

  it("lets the holder update branch/pr on re-claim without resetting claimed_at", async () => {
    const issue = await adapter.create({ title: "Rebind on re-claim" });
    const first = await adapter.claim(issue.id, "agent-a", { branch: "feat/one" });
    const second = await adapter.claim(issue.id, "agent-a", { branch: "feat/two", pr: "#9" });
    assert.equal(second.branch, "feat/two");
    assert.equal(second.pr, "#9");
    assert.equal(second.claimed_at, first.claimed_at);
  });

  it("refuses to claim a closed issue", async () => {
    const issue = await adapter.create({ title: "Done already" });
    await adapter.close(issue.id, "finished");
    await assert.rejects(
      () => adapter.claim(issue.id, "agent-a"),
      (err) => err.code === "ISSUE_CLOSED",
    );
  });

  it("rejects an unknown issue id", async () => {
    await assert.rejects(
      () => adapter.claim("issue-99999", "agent-a"),
      (err) => err.code === "NOT_FOUND",
    );
  });

  it("requires an owner", async () => {
    const issue = await adapter.create({ title: "Ownerless claim" });
    await assert.rejects(
      () => adapter.claim(issue.id, ""),
      (err) => err.code === "MISSING_OWNER",
    );
  });

  it("only one of N concurrent claimants wins", async () => {
    const issue = await adapter.create({ title: "Race" });
    const claimants = ["a", "b", "c", "d", "e"];
    const results = await Promise.allSettled(
      claimants.map((who) => new JsonAdapter(dir).claim(issue.id, who)),
    );

    const winners = results.filter((r) => r.status === "fulfilled");
    assert.equal(winners.length, 1, "exactly one claimant may win");

    // Every loser must have an observable refusal — never a silent success.
    for (const r of results.filter((x) => x.status === "rejected")) {
      assert.ok(
        ["ISSUE_ALREADY_CLAIMED", "STALE_BOARD_WRITE"].includes(r.reason.code),
        `unexpected rejection code: ${r.reason.code}`,
      );
    }

    const persisted = await new JsonAdapter(dir).get(issue.id);
    assert.equal(persisted.owner, winners[0].value.owner);
  });
});

describe("JsonAdapter.release", () => {
  let dir, adapter;

  before(async () => {
    dir = makeProject();
    adapter = new JsonAdapter(dir);
    await adapter.init();
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  it("clears owner and claimed_at but keeps branch and pr", async () => {
    const issue = await adapter.create({ title: "Releasable" });
    await adapter.claim(issue.id, "agent-a", { branch: "feat/x", pr: "#3" });
    const released = await adapter.release(issue.id, "agent-a");
    assert.equal(released.owner, undefined);
    assert.equal(released.claimed_at, undefined);
    assert.equal(released.branch, "feat/x", "branch records where the work went");
    assert.equal(released.pr, "#3");

    const persisted = await new JsonAdapter(dir).get(issue.id);
    assert.equal(persisted.owner, undefined);
    assert.equal(persisted.branch, "feat/x");
  });

  it("refuses a non-holder without force", async () => {
    const issue = await adapter.create({ title: "Not yours" });
    await adapter.claim(issue.id, "agent-a");
    await assert.rejects(
      () => adapter.release(issue.id, "agent-b"),
      (err) => err.code === "CLAIM_OWNER_MISMATCH",
    );
    const persisted = await new JsonAdapter(dir).get(issue.id);
    assert.equal(persisted.owner, "agent-a");
  });

  it("allows a forced release by a non-holder", async () => {
    const issue = await adapter.create({ title: "Forcible" });
    await adapter.claim(issue.id, "agent-a");
    const released = await adapter.release(issue.id, "agent-b", { force: true });
    assert.equal(released.owner, undefined);
  });

  it("is an idempotent no-op on an unclaimed issue", async () => {
    const issue = await adapter.create({ title: "Never claimed" });
    const boardPath = join(dir, ".context-index", "tasks", "tasks.json");
    const seqBefore = JSON.parse(readFileSync(boardPath, "utf8")).seq;
    const released = await adapter.release(issue.id, "agent-a");
    assert.equal(released.owner, undefined);
    assert.equal(JSON.parse(readFileSync(boardPath, "utf8")).seq, seqBefore);
  });

  it("re-claim after release is allowed for a different owner", async () => {
    const issue = await adapter.create({ title: "Handoff" });
    await adapter.claim(issue.id, "agent-a");
    await adapter.release(issue.id, "agent-a");
    const reclaimed = await adapter.claim(issue.id, "agent-b");
    assert.equal(reclaimed.owner, "agent-b");
  });
});

// ---------------------------------------------------------------------------
// CLI surface
// ---------------------------------------------------------------------------

describe("adev issues claim / release — CLI", () => {
  let dir, manifest, issueId;

  before(async () => {
    dir = makeProject();
    const adapter = new JsonAdapter(dir);
    await adapter.init();
    manifest = { tasks: { backend: "json" } };
  });

  beforeEach(async () => {
    const adapter = new JsonAdapter(dir);
    const issue = await adapter.create({ title: "CLI subject" });
    issueId = issue.id;
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  const call = (argv) =>
    capture(() => runIssues({ projectRoot: dir, argv, manifest }));

  it("claims an issue and exits 0", async () => {
    const { code, out } = await call(["claim", issueId, "--owner", "agent-a"]);
    assert.equal(code, 0);
    assert.match(out, new RegExp(`claimed ${issueId} for agent-a`));
  });

  it("exits 2 when the issue is held by someone else", async () => {
    await call(["claim", issueId, "--owner", "agent-a"]);
    const { code, err } = await call(["claim", issueId, "--owner", "agent-b"]);
    assert.equal(code, 2, "a refused claim must be distinguishable from a usage error");
    assert.match(err, /already claimed by "agent-a"/);
  });

  it("exits 0 on an idempotent re-claim by the same owner", async () => {
    await call(["claim", issueId, "--owner", "agent-a"]);
    const { code } = await call(["claim", issueId, "--owner", "agent-a"]);
    assert.equal(code, 0);
  });

  it("records --branch and --pr, and reports them as JSON", async () => {
    const { code, out } = await call([
      "claim", issueId, "--owner", "agent-a",
      "--branch", "feat/cli", "--pr", "#77", "--json",
    ]);
    assert.equal(code, 0);
    const payload = JSON.parse(out);
    assert.equal(payload.owner, "agent-a");
    assert.equal(payload.branch, "feat/cli");
    assert.equal(payload.pr, "#77");
    assert.equal(payload.id, issueId);
  });

  it("releases a claim and exits 0", async () => {
    await call(["claim", issueId, "--owner", "agent-a"]);
    const { code, out } = await call(["release", issueId, "--owner", "agent-a"]);
    assert.equal(code, 0);
    assert.match(out, new RegExp(`released ${issueId}`));
  });

  it("exits 2 when releasing another owner's claim, 0 with --force", async () => {
    await call(["claim", issueId, "--owner", "agent-a"]);
    const refused = await call(["release", issueId, "--owner", "agent-b"]);
    assert.equal(refused.code, 2);
    const forced = await call(["release", issueId, "--owner", "agent-b", "--force"]);
    assert.equal(forced.code, 0);
  });

  it("exits 1 without an owner", async () => {
    const saved = process.env.ADEV_ISSUE_OWNER;
    delete process.env.ADEV_ISSUE_OWNER;
    try {
      const { code, err } = await call(["claim", issueId]);
      assert.equal(code, 1);
      assert.match(err, /owner is required/);
    } finally {
      if (saved !== undefined) process.env.ADEV_ISSUE_OWNER = saved;
    }
  });

  it("falls back to ADEV_ISSUE_OWNER when --owner is omitted", async () => {
    const saved = process.env.ADEV_ISSUE_OWNER;
    process.env.ADEV_ISSUE_OWNER = "env-agent";
    try {
      const { code, out } = await call(["claim", issueId, "--json"]);
      assert.equal(code, 0);
      assert.equal(JSON.parse(out).owner, "env-agent");
    } finally {
      if (saved === undefined) delete process.env.ADEV_ISSUE_OWNER;
      else process.env.ADEV_ISSUE_OWNER = saved;
    }
  });

  it("exits 1 without an issue id", async () => {
    const { code, err } = await call(["claim", "--owner", "agent-a"]);
    assert.equal(code, 1);
    assert.match(err, /usage: adev issues claim/);
  });

  it("exits 1 for an unknown issue id", async () => {
    const { code, err } = await call(["claim", "issue-99999", "--owner", "agent-a"]);
    assert.equal(code, 1);
    assert.match(err, /Issue not found/);
  });
});
