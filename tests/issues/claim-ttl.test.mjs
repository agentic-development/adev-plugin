/**
 * Tests for claim LEASE EXPIRY — `tasks.claim_ttl_minutes` (issue-610).
 *
 * The bug being killed: without expiry, the first crashed or abandoned session
 * holds an issue forever, and the claim gate becomes something people route
 * around — worse than no gate, because it trains bypassing.
 *
 * Layers exercised (mirrors `claim.test.mjs`):
 *   1. `isClaimStale` / `isClaimUnexpirable` / `normalizeClaimTtlMinutes` /
 *      `requireClaimable` — the pure lease rules.
 *   2. `JsonAdapter.claim` / `.release` — takeover inside the CAS loop, and
 *      release's deliberate lease-blindness.
 *   3. `adev issues stale` and `adev issues claim` at the CLI surface.
 *
 * Time is controlled by injecting `now`/`ttlMs` into the pure functions, and by
 * writing an old `claimed_at` directly for adapter-level cases. No sleeps: a
 * test that waits out a real lease is a test nobody runs.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  isClaimStale,
  isClaimUnexpirable,
  normalizeClaimTtlMinutes,
  requireClaimable,
  requireReleasable,
  DEFAULT_CLAIM_TTL_MINUTES,
} from "../../lib/issues/interface.mjs";
import { JsonAdapter } from "../../lib/issues/json-adapter.mjs";
import { run as runIssues } from "../../lib/cli/issues.mjs";

const MINUTE = 60_000;

/** @param {string} [tasksYaml] extra lines under the `tasks:` key */
function makeProject(tasksYaml = "") {
  const dir = mkdtempSync(join(tmpdir(), "issue-claim-ttl-test-"));
  mkdirSync(join(dir, ".context-index"), { recursive: true });
  writeFileSync(
    join(dir, ".context-index", "manifest.yaml"),
    `tasks:\n  backend: json\n${tasksYaml}`,
  );
  return dir;
}

/** An ISO timestamp `minutes` in the past. */
const minutesAgo = (minutes) => new Date(Date.now() - minutes * MINUTE).toISOString();

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

/** Age a claim on the board without waiting for it. */
async function ageClaim(adapter, id, minutes) {
  return adapter.update(id, { claimed_at: minutesAgo(minutes) });
}

// ---------------------------------------------------------------------------
// Pure lease rules
// ---------------------------------------------------------------------------

describe("normalizeClaimTtlMinutes", () => {
  it("defaults to 240 minutes when unset (+2 more contract assertions)", () => {
    // defaults to 240 minutes when unset
    assert.equal(normalizeClaimTtlMinutes(undefined), 240);
    assert.equal(normalizeClaimTtlMinutes(null), 240);
    assert.equal(DEFAULT_CLAIM_TTL_MINUTES, 240);

    // accepts an integer as a number or as a manifest string literal
    assert.equal(normalizeClaimTtlMinutes(60), 60);
    assert.equal(normalizeClaimTtlMinutes("60"), 60);
    assert.equal(normalizeClaimTtlMinutes(" 15 "), 15);

    // treats 0 as expiry disabled
    assert.equal(normalizeClaimTtlMinutes(0), 0);
    assert.equal(normalizeClaimTtlMinutes("0"), 0);
  });

  it("rejects anything that is not an integer literal, rather than defaulting", () => {
    for (const bad of ["thirty", "5.5", 5.5, true, false, [], {}, "", "-1", -1, NaN]) {
      assert.throws(
        () => normalizeClaimTtlMinutes(bad),
        (err) => err.code === "BOARD_INVALID_CLAIM_TTL_MINUTES",
        `expected rejection for ${JSON.stringify(bad)}`,
      );
    }
  });

  it("does not echo the offending value in the message", () => {
    assert.throws(
      () => normalizeClaimTtlMinutes("s3cr3t-typo"),
      (err) => !/s3cr3t-typo/.test(err.message),
    );
  });
});

describe("isClaimStale", () => {
  const ttlMs = 60 * MINUTE;
  const now = Date.parse("2026-08-13T12:00:00.000Z");

  it("is false when nothing is held", () => {
    assert.equal(isClaimStale({ id: "i1" }, { ttlMs, now }), false);
    assert.equal(isClaimStale(null, { ttlMs, now }), false);
  });

  it("is false inside the lease window", () => {
    const issue = { id: "i1", owner: "agent-a", claimed_at: "2026-08-13T11:30:00.000Z" };
    assert.equal(isClaimStale(issue, { ttlMs, now }), false);
  });

  it("is true once the lease window has elapsed", () => {
    const issue = { id: "i1", owner: "agent-a", claimed_at: "2026-08-13T10:30:00.000Z" };
    assert.equal(isClaimStale(issue, { ttlMs, now }), true);
  });

  it("expires exactly at the boundary", () => {
    const issue = { id: "i1", owner: "agent-a", claimed_at: "2026-08-13T11:00:00.000Z" };
    assert.equal(isClaimStale(issue, { ttlMs, now }), true);
  });

  it("never goes stale when expiry is disabled (ttl 0)", () => {
    const issue = { id: "i1", owner: "agent-a", claimed_at: "2020-01-01T00:00:00.000Z" };
    assert.equal(isClaimStale(issue, { ttlMs: 0, now }), false);
  });

  it("fails CLOSED on a missing or unparseable claimed_at", () => {
    for (const claimed_at of [undefined, null, "", "not-a-date"]) {
      assert.equal(
        isClaimStale({ id: "i1", owner: "agent-a", claimed_at }, { ttlMs, now }),
        false,
        "an unprovable claim age must never hand work to a second agent",
      );
    }
  });
});

describe("isClaimUnexpirable", () => {
  it("flags a held claim with no usable claimed_at (+1 more contract assertions)", () => {
    // flags a held claim with no usable claimed_at
    assert.equal(isClaimUnexpirable({ owner: "agent-a" }), true);
    assert.equal(isClaimUnexpirable({ owner: "agent-a", claimed_at: "garbage" }), true);

    // does not flag a normal claim or an unclaimed issue
    assert.equal(isClaimUnexpirable({ owner: "agent-a", claimed_at: minutesAgo(1) }), false);
    assert.equal(isClaimUnexpirable({ id: "i1" }), false);
  });
});

describe("requireClaimable — lease semantics", () => {
  const ttlMs = 60 * MINUTE;
  const now = Date.parse("2026-08-13T12:00:00.000Z");
  const held = (claimed_at) => ({ id: "issue-1", status: "open", owner: "agent-a", claimed_at });

  it("still refuses a LIVE claim by a different owner", () => {
    assert.throws(
      () => requireClaimable(held("2026-08-13T11:59:00.000Z"), "agent-b", { ttlMs, now }),
      (err) => {
        assert.equal(err.code, "ISSUE_ALREADY_CLAIMED");
        assert.equal(err.owner, "agent-a");
        return true;
      },
    );
  });

  it("permits takeover of a STALE claim by a different owner", () => {
    requireClaimable(held("2026-08-13T10:00:00.000Z"), "agent-b", { ttlMs, now });
  });

  it("refuses an ancient claim when expiry is disabled", () => {
    assert.throws(
      () => requireClaimable(held("2020-01-01T00:00:00.000Z"), "agent-b", { ttlMs: 0, now }),
      (err) => err.code === "ISSUE_ALREADY_CLAIMED",
    );
  });

  it("refuses when the holder has no claimed_at (staleness unprovable)", () => {
    assert.throws(
      () => requireClaimable(held(undefined), "agent-b", { ttlMs, now }),
      (err) => err.code === "ISSUE_ALREADY_CLAIMED",
    );
  });

  it("refuses a closed issue even when its claim is stale", () => {
    assert.throws(
      () =>
        requireClaimable(
          { ...held("2026-08-13T10:00:00.000Z"), status: "closed" },
          "agent-b",
          { ttlMs, now },
        ),
      (err) => err.code === "ISSUE_CLOSED",
      "expiry frees a claim; it does not reopen work",
    );
  });

  it("does not mutate the issue it inspects", () => {
    const issue = held("2026-08-13T10:00:00.000Z");
    const snapshot = JSON.stringify(issue);
    requireClaimable(issue, "agent-b", { ttlMs, now });
    assert.equal(JSON.stringify(issue), snapshot);
  });
});

describe("requireReleasable — deliberately lease-blind", () => {
  it("lets the holder release a stale claim", () => {
    requireReleasable({ id: "i1", owner: "agent-a", claimed_at: minutesAgo(10_000) }, "agent-a");
  });

  it("still refuses a non-holder on a stale claim without force", () => {
    assert.throws(
      () =>
        requireReleasable({ id: "i1", owner: "agent-a", claimed_at: minutesAgo(10_000) }, "agent-b"),
      (err) => err.code === "CLAIM_OWNER_MISMATCH",
      "takeover is claim's job — a second bypass shape would train bypassing",
    );
  });
});

// ---------------------------------------------------------------------------
// TTL configuration on the adapter
// ---------------------------------------------------------------------------

describe("JsonAdapter — claim_ttl_minutes configuration", () => {
  it("defaults to 240 minutes when the manifest says nothing", () => {
    const dir = makeProject();
    try {
      const adapter = new JsonAdapter(dir);
      assert.equal(adapter.claimTtlMinutes, 240);
      assert.equal(adapter.claimTtlMs, 240 * MINUTE);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reads tasks.claim_ttl_minutes from the manifest", () => {
    const dir = makeProject("  claim_ttl_minutes: 15\n");
    try {
      assert.equal(new JsonAdapter(dir).claimTtlMinutes, 15);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("accepts 0 to disable expiry", () => {
    const dir = makeProject("  claim_ttl_minutes: 0\n");
    try {
      const adapter = new JsonAdapter(dir);
      assert.equal(adapter.claimTtlMinutes, 0);
      assert.equal(adapter.claimTtlMs, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects an invalid manifest value at construction", () => {
    for (const bad of ["thirty", "5.5", "-10", "true"]) {
      const dir = makeProject(`  claim_ttl_minutes: ${bad}\n`);
      try {
        assert.throws(
          () => new JsonAdapter(dir),
          (err) => err.code === "BOARD_INVALID_CLAIM_TTL_MINUTES",
          `expected construction to reject claim_ttl_minutes: ${bad}`,
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it("ignores a commented-out manifest line", () => {
    const dir = makeProject("  # claim_ttl_minutes: 15\n");
    try {
      assert.equal(new JsonAdapter(dir).claimTtlMinutes, 240);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("lets an explicit constructor option override the manifest", () => {
    const dir = makeProject("  claim_ttl_minutes: 15\n");
    try {
      assert.equal(new JsonAdapter(dir, { claimTtlMinutes: 90 }).claimTtlMinutes, 90);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Takeover through the CAS loop
// ---------------------------------------------------------------------------

describe("JsonAdapter.claim — stale-claim takeover", () => {
  let dir, adapter;

  before(async () => {
    // 30-minute lease keeps the fixtures readable; ages are written directly.
    dir = makeProject("  claim_ttl_minutes: 30\n");
    adapter = new JsonAdapter(dir);
    await adapter.init();
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  it("still refuses a LIVE claim held by a different owner", async () => {
    const issue = await adapter.create({ title: "Live holder" });
    await adapter.claim(issue.id, "agent-a");
    await ageClaim(adapter, issue.id, 5); // well inside the 30-minute lease

    await assert.rejects(
      () => adapter.claim(issue.id, "agent-b"),
      (err) => err.code === "ISSUE_ALREADY_CLAIMED" && err.owner === "agent-a",
    );
    assert.equal((await new JsonAdapter(dir).get(issue.id)).owner, "agent-a");
  });

  it("hands a stale claim to the next claimant with a fresh claimed_at", async () => {
    const issue = await adapter.create({ title: "Abandoned by a dead session" });
    await adapter.claim(issue.id, "agent-a");
    const aged = await ageClaim(adapter, issue.id, 120);

    const taken = await adapter.claim(issue.id, "agent-b");
    assert.equal(taken.owner, "agent-b");
    // Compare against the AGED stamp, not the original claim: the claim and
    // the takeover can land in the same millisecond on a fast machine, which
    // made this flake in CI. What must hold is that the takeover does not
    // inherit the EXPIRED lease — and that stamp is 120 minutes old, so the
    // comparison is deterministic.
    assert.notEqual(taken.claimed_at, aged.claimed_at);
    assert.ok(
      Date.now() - Date.parse(taken.claimed_at) < 5 * MINUTE,
      "a takeover starts a new lease, so claimed_at must be current",
    );

    const persisted = await new JsonAdapter(dir).get(issue.id);
    assert.equal(persisted.owner, "agent-b");
    assert.equal(persisted.claimed_at, taken.claimed_at);
  });

  it("reports the displaced owner without persisting it", async () => {
    const issue = await adapter.create({ title: "Displaced owner" });
    await adapter.claim(issue.id, "agent-a");
    const aged = await ageClaim(adapter, issue.id, 90);

    const taken = await adapter.claim(issue.id, "agent-b");
    assert.deepEqual(taken.takeover, {
      previous_owner: "agent-a",
      previous_claimed_at: aged.claimed_at,
      ttl_minutes: 30,
    });

    const persisted = await new JsonAdapter(dir).get(issue.id);
    assert.equal(persisted.takeover, undefined, "takeover is ephemeral, not board state");
    assert.equal(persisted.previous_owner, undefined, "no fifth ref field was introduced");
  });

  it("omits takeover metadata on an ordinary claim", async () => {
    const issue = await adapter.create({ title: "Uncontended" });
    const claimed = await adapter.claim(issue.id, "agent-a");
    assert.equal(claimed.takeover, undefined);
  });

  it("preserves claimed_at on a re-claim by the same owner while the lease is LIVE", async () => {
    const issue = await adapter.create({ title: "Live re-claim" });
    const first = await adapter.claim(issue.id, "agent-a");
    await ageClaim(adapter, issue.id, 5);
    const aged = await adapter.get(issue.id);

    const second = await adapter.claim(issue.id, "agent-a");
    assert.equal(
      second.claimed_at,
      aged.claimed_at,
      "a re-claim inside the lease is not a new claim — claimed_at must not advance",
    );
    assert.notEqual(first.claimed_at, undefined);
    assert.equal(second.takeover, undefined);
  });

  it("refreshes claimed_at when the SAME owner re-claims a stale lease", async () => {
    const issue = await adapter.create({ title: "Self re-claim after expiry" });
    await adapter.claim(issue.id, "agent-a");
    const aged = await ageClaim(adapter, issue.id, 120);

    const refreshed = await adapter.claim(issue.id, "agent-a");
    assert.equal(refreshed.owner, "agent-a");
    assert.notEqual(
      refreshed.claimed_at,
      aged.claimed_at,
      "an expired lease is a new claim even for its original holder",
    );
    assert.equal(refreshed.takeover.previous_owner, "agent-a");
  });

  it("refuses takeover of a stale claim on a closed issue", async () => {
    const issue = await adapter.create({ title: "Closed and stale" });
    await adapter.claim(issue.id, "agent-a");
    await ageClaim(adapter, issue.id, 500);
    await adapter.close(issue.id, "done");

    await assert.rejects(
      () => adapter.claim(issue.id, "agent-b"),
      (err) => err.code === "ISSUE_CLOSED",
    );
  });

  it("blocks an ancient claim forever when expiry is disabled", async () => {
    const zeroDir = makeProject("  claim_ttl_minutes: 0\n");
    try {
      const zeroAdapter = new JsonAdapter(zeroDir);
      await zeroAdapter.init();
      const issue = await zeroAdapter.create({ title: "No expiry configured" });
      await zeroAdapter.claim(issue.id, "agent-a");
      await ageClaim(zeroAdapter, issue.id, 60 * 24 * 30);

      await assert.rejects(
        () => zeroAdapter.claim(issue.id, "agent-b"),
        (err) => err.code === "ISSUE_ALREADY_CLAIMED",
      );
    } finally {
      rmSync(zeroDir, { recursive: true, force: true });
    }
  });

  it("still lets exactly one of N concurrent claimants win a stale issue", async () => {
    const issue = await adapter.create({ title: "Stale race" });
    await adapter.claim(issue.id, "agent-a");
    await ageClaim(adapter, issue.id, 240);

    const results = await Promise.allSettled(
      ["b", "c", "d", "e"].map((who) => new JsonAdapter(dir).claim(issue.id, who)),
    );
    const winners = results.filter((r) => r.status === "fulfilled");
    assert.equal(winners.length, 1, "expiry must not turn a takeover into a free-for-all");
    for (const r of results.filter((x) => x.status === "rejected")) {
      assert.ok(
        ["ISSUE_ALREADY_CLAIMED", "STALE_BOARD_WRITE"].includes(r.reason.code),
        `unexpected rejection code: ${r.reason.code}`,
      );
    }
    assert.equal((await new JsonAdapter(dir).get(issue.id)).owner, winners[0].value.owner);
  });
});

describe("JsonAdapter.release — with expiry configured", () => {
  let dir, adapter;

  before(async () => {
    dir = makeProject("  claim_ttl_minutes: 30\n");
    adapter = new JsonAdapter(dir);
    await adapter.init();
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  it("releases a stale claim held by the caller without error", async () => {
    const issue = await adapter.create({ title: "Stale but mine" });
    await adapter.claim(issue.id, "agent-a", { branch: "feat/x" });
    await ageClaim(adapter, issue.id, 300);

    const released = await adapter.release(issue.id, "agent-a");
    assert.equal(released.owner, undefined);
    assert.equal(released.claimed_at, undefined);
    assert.equal(released.branch, "feat/x", "branch still records where the work went");
  });

  it("still refuses a non-holder on a stale claim, and allows --force", async () => {
    const issue = await adapter.create({ title: "Stale, not mine" });
    await adapter.claim(issue.id, "agent-a");
    await ageClaim(adapter, issue.id, 300);

    await assert.rejects(
      () => adapter.release(issue.id, "agent-b"),
      (err) => err.code === "CLAIM_OWNER_MISMATCH",
    );
    const forced = await adapter.release(issue.id, "agent-b", { force: true });
    assert.equal(forced.owner, undefined);
  });

  it("leaves a released issue claimable by anyone", async () => {
    const issue = await adapter.create({ title: "Handoff after expiry" });
    await adapter.claim(issue.id, "agent-a");
    await ageClaim(adapter, issue.id, 300);
    await adapter.release(issue.id, "agent-a");

    const reclaimed = await adapter.claim(issue.id, "agent-b");
    assert.equal(reclaimed.owner, "agent-b");
    assert.equal(reclaimed.takeover, undefined, "nothing was displaced — the claim was released");
  });
});

// ---------------------------------------------------------------------------
// CLI surface
// ---------------------------------------------------------------------------

describe("adev issues stale — CLI report", () => {
  let dir, adapter, manifest;

  before(async () => {
    dir = makeProject("  claim_ttl_minutes: 30\n");
    adapter = new JsonAdapter(dir);
    await adapter.init();
    manifest = { tasks: { backend: "json" } };
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  const call = (argv) => capture(() => runIssues({ projectRoot: dir, argv, manifest }));

  it("reports nothing to do on a board with no claims", async () => {
    const { code, out } = await call(["stale"]);
    assert.equal(code, 0);
    assert.match(out, /No stale claims \(TTL 30 min\)/);
  });

  it("lists stale claims, unexpirable claims, and counts live ones", async () => {
    const staleIssue = await adapter.create({ title: "Left by a dead session" });
    await adapter.claim(staleIssue.id, "agent-a", { branch: "feat/dead" });
    await ageClaim(adapter, staleIssue.id, 400);

    const liveIssue = await adapter.create({ title: "Being worked right now" });
    await adapter.claim(liveIssue.id, "agent-live");

    const stuckIssue = await adapter.create({ title: "Owner without a timestamp" });
    await adapter.update(stuckIssue.id, { owner: "agent-ghost", claimed_at: undefined });

    const { code, out } = await call(["stale", "--json"]);
    assert.equal(code, 0);
    const payload = JSON.parse(out);

    assert.equal(payload.ttl_minutes, 30);
    assert.equal(payload.expiry_enabled, true);
    assert.equal(payload.live_count, 1);

    const staleIds = payload.stale.map((c) => c.id);
    assert.deepEqual(staleIds, [staleIssue.id]);
    assert.equal(payload.stale[0].owner, "agent-a");
    assert.equal(payload.stale[0].branch, "feat/dead");
    assert.ok(payload.stale[0].age_minutes >= 400);

    assert.deepEqual(payload.unexpirable.map((c) => c.id), [stuckIssue.id]);
    assert.equal(payload.unexpirable[0].age_minutes, null);

    const human = await call(["stale"]);
    assert.match(human.out, new RegExp(`Stale claims \\(TTL 30 min\\): 1`));
    assert.match(human.out, new RegExp(staleIssue.id));
    assert.match(human.out, /cannot expire — no claimed_at/);
    assert.match(human.out, /Live claims: 1\./);
  });

  it("ignores a claim left on a closed issue", async () => {
    const closedDir = makeProject("  claim_ttl_minutes: 30\n");
    try {
      const closedAdapter = new JsonAdapter(closedDir);
      await closedAdapter.init();
      const issue = await closedAdapter.create({ title: "Closed while claimed" });
      await closedAdapter.claim(issue.id, "agent-a");
      await ageClaim(closedAdapter, issue.id, 400);
      await closedAdapter.close(issue.id, "done");

      // close() does not clear owner/claimed_at — only release() does.
      assert.equal((await closedAdapter.get(issue.id)).owner, "agent-a");

      const { code, out } = await capture(() =>
        runIssues({ projectRoot: closedDir, argv: ["stale", "--json"], manifest }),
      );
      assert.equal(code, 0);
      const payload = JSON.parse(out);
      assert.deepEqual(payload.stale, [], "a closed issue has no work left to recover");
      assert.deepEqual(payload.unexpirable, []);
      assert.equal(payload.live_count, 0);
    } finally {
      rmSync(closedDir, { recursive: true, force: true });
    }
  });

  it("says so when expiry is disabled", async () => {
    const zeroDir = makeProject("  claim_ttl_minutes: 0\n");
    try {
      const zeroAdapter = new JsonAdapter(zeroDir);
      await zeroAdapter.init();
      const issue = await zeroAdapter.create({ title: "Ancient but protected" });
      await zeroAdapter.claim(issue.id, "agent-a");
      await ageClaim(zeroAdapter, issue.id, 100_000);

      const { code, out } = await capture(() =>
        runIssues({ projectRoot: zeroDir, argv: ["stale", "--json"], manifest }),
      );
      assert.equal(code, 0);
      const payload = JSON.parse(out);
      assert.equal(payload.expiry_enabled, false);
      assert.deepEqual(payload.stale, []);
      assert.equal(payload.live_count, 1);
    } finally {
      rmSync(zeroDir, { recursive: true, force: true });
    }
  });

  it("prints help without touching the board", async () => {
    const { code, out } = await call(["stale", "--help"]);
    assert.equal(code, 0);
    assert.match(out, /usage: adev issues stale/);
  });

  it("rejects stray positionals", async () => {
    const { code, err } = await call(["stale", "issue-1"]);
    assert.equal(code, 1);
    assert.match(err, /usage: adev issues stale/);
  });

  it("is listed in the parent help", async () => {
    const { out } = await call([]);
    assert.match(out, /stale\s+List claims whose lease has expired/);
  });
});

describe("adev issues claim — takeover at the CLI surface", () => {
  let dir, adapter, manifest;

  before(async () => {
    dir = makeProject("  claim_ttl_minutes: 30\n");
    adapter = new JsonAdapter(dir);
    await adapter.init();
    manifest = { tasks: { backend: "json" } };
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  const call = (argv) => capture(() => runIssues({ projectRoot: dir, argv, manifest }));

  it("exits 0 and names the displaced owner when taking over a stale claim", async () => {
    const issue = await adapter.create({ title: "CLI takeover" });
    await call(["claim", issue.id, "--owner", "agent-a"]);
    await ageClaim(adapter, issue.id, 400);

    const { code, out, err } = await call(["claim", issue.id, "--owner", "agent-b"]);
    assert.equal(code, 0);
    assert.match(out, new RegExp(`claimed ${issue.id} for agent-b`));
    assert.match(err, /took over an expired claim/);
    assert.match(err, /"agent-a"/);
  });

  it("emits takeover metadata under --json, and null when nothing was displaced", async () => {
    const issue = await adapter.create({ title: "CLI takeover json" });
    await call(["claim", issue.id, "--owner", "agent-a"]);
    await ageClaim(adapter, issue.id, 400);

    const taken = await call(["claim", issue.id, "--owner", "agent-b", "--json"]);
    const payload = JSON.parse(taken.out);
    assert.equal(payload.owner, "agent-b");
    assert.equal(payload.takeover.previous_owner, "agent-a");
    assert.equal(payload.takeover.ttl_minutes, 30);

    const plain = await adapter.create({ title: "CLI plain claim" });
    const fresh = await call(["claim", plain.id, "--owner", "agent-c", "--json"]);
    assert.equal(JSON.parse(fresh.out).takeover, null);
  });

  it("still exits 2 for a LIVE claim held by someone else", async () => {
    const issue = await adapter.create({ title: "CLI live refusal" });
    await call(["claim", issue.id, "--owner", "agent-a"]);
    const { code, err } = await call(["claim", issue.id, "--owner", "agent-b"]);
    assert.equal(code, 2);
    assert.match(err, /already claimed by "agent-a"/);
  });
});
