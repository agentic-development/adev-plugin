import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { BeadsAdapter } from "../../lib/issues/beads-adapter.mjs";

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

// ─── merged from tests/issues/beads-adapter-id-preservation.test.mjs ──────────────────────────────────────────────
{
  /**
   * Source-id preservation on create (issue-628).
   *
   * Bug: `BeadsAdapter.create()` and `.createEpic()` unconditionally overwrote
   * `issue.id` with `this._nextId(...)`, discarding any caller-supplied id. In
   * combination with `projectIssueForCreate()` in lib/cli/issues-migrate.mjs —
   * which strips `id` before calling the adapter — a json -> beads migration
   * gave every item a brand-new random identity.
   *
   * Observed on a real 310-issue board: source `issue-625` came out the far side
   * as `issue-fenorl`, and 0 of 41 dependency edges replayed because the verb
   * resolves edge endpoints by SOURCE id. Worse and entirely unreported, every
   * human-readable cross-reference broke — this board's notes, commit messages,
   * PR bodies and specs refer to issues by id ("tracked as issue-623"), and all
   * of those would silently point at a different issue.
   *
   * Minting is correct for a NEW issue (issue-613 made ids merge-safe precisely
   * so two branches cannot collide). It is wrong for a MIGRATION, whose whole
   * job is to carry identity across. So the rule is: honour an explicitly
   * supplied id; mint only when none is given.
   *
   * br enforces uniqueness on `external_ref`, so a genuinely colliding supplied
   * id fails loudly at create rather than silently double-minting.
   *
   * Mock-only: `_runBr` and `_scan` are stubbed, so `br` is never required.
   */






  function makeAdapter() {
    const adapter = new BeadsAdapter("/tmp/nonexistent-beads", { checkBr: false });
    const calls = [];
    adapter._scan = () => [];
    adapter._runBr = (args) => {
      calls.push(args);
      return JSON.stringify({ id: "br-generated-1", title: args[1] });
    };
    return { adapter, calls };
  }

  /** Value passed to `--external-ref` in the last recorded create. */
  function externalRef(calls) {
    const create = calls.find((c) => c[0] === "create");
    assert.ok(create, "expected a `br create` invocation");
    const i = create.indexOf("--external-ref");
    assert.notEqual(i, -1, "create must carry --external-ref");
    return create[i + 1];
  }

  describe("BeadsAdapter — source id preservation (issue-628)", () => {
    let ctx;
    beforeEach(() => {
      ctx = makeAdapter();
    });

    it("create() honours an explicitly supplied id instead of minting", async () => {
      const issue = await ctx.adapter.create({
        id: "issue-625",
        title: "gate doctor verifies a different gate set",
        type: "bug",
        priority: 1,
      });

      assert.equal(issue.id, "issue-625", "the supplied id must survive");
      assert.equal(
        externalRef(ctx.calls),
        "issue-625",
        "external_ref must carry the source id, since that is what resolves edges and cross-references",
      );
    });

    it("create() still mints when no id is supplied", async () => {
      const issue = await ctx.adapter.create({ title: "brand new work", type: "task", priority: 2 });

      assert.match(
        issue.id,
        /^issue-[a-z0-9]{6}$/,
        "a new issue must still get a merge-safe minted id (issue-613)",
      );
      assert.equal(externalRef(ctx.calls), issue.id);
    });

    it("create() mints when id is an empty string", async () => {
      // validateIssue normalises a missing id to "", so empty must be treated as
      // absent rather than preserved as a literal empty external_ref.
      const issue = await ctx.adapter.create({ id: "", title: "x", type: "task", priority: 2 });
      assert.match(issue.id, /^issue-[a-z0-9]{6}$/);
    });

    it("createEpic() honours an explicitly supplied id instead of minting", async () => {
      const epic = await ctx.adapter.createEpic({ id: "epic-108", title: "Test Strategy Follow-ups" });

      assert.equal(epic.id, "epic-108");
      assert.equal(externalRef(ctx.calls), "epic-108");
    });

    it("createEpic() still mints when no id is supplied", async () => {
      const epic = await ctx.adapter.createEpic({ title: "a new epic" });
      assert.match(epic.id, /^epic-[a-z0-9]{6}$/);
    });

    it("preserves a legacy numeric id verbatim — no renumbering, no reshaping", async () => {
      // The migration case that matters: sparse legacy ids (issue-1..issue-627
      // with gaps) must not be resequenced into a contiguous range, and must not
      // be rewritten into the new random shape either.
      for (const id of ["issue-1", "issue-84", "issue-627"]) {
        const c = makeAdapter();
        const issue = await c.adapter.create({ id, title: `t-${id}`, type: "task", priority: 2 });
        assert.equal(issue.id, id);
        assert.equal(externalRef(c.calls), id);
      }
    });
  });
}

// ─── merged from tests/issues/beads-adapter-tier.test.mjs ──────────────────────────────────────────────
{
  /**
   * Tests for tiered hierarchy in lib/issues/beads-adapter.mjs
   *
   * These tests are mock-only (do not require `br` to be installed).
   * They verify that the beads adapter exposes walkTree and cascade-aware
   * close per the tiered-hierarchy spec.
   *
   * Full walkTree logic is tested through the file adapter since beads
   * delegates epic and tiered operations to it. Here we test that:
   * - walkTree is exposed as a function
   * - walkTree for legacy IDs returns empty list
   * - close throws CASCADE_BLOCKED when children are unclosed
   */






  describe("BeadsAdapter — walkTree (interface check)", () => {
    it("exposes walkTree method", () => {
      const adapter = new BeadsAdapter("/tmp/nonexistent", { checkBr: false });
      assert.equal(typeof adapter.walkTree, "function");
    });

    it("walkTree for legacy flat ID returns empty list", async () => {
      const adapter = new BeadsAdapter("/tmp/nonexistent", { checkBr: false });
      // Delegates to file adapter which returns [] for legacy IDs without reading disk
      // (no .beads-map.json, no tasks.md — both read as empty)
      const result = await adapter.walkTree("epic-1");
      assert.deepEqual(result, []);
    });

    it("walkTree for issue-N legacy ID returns empty list", async () => {
      const adapter = new BeadsAdapter("/tmp/nonexistent", { checkBr: false });
      const result = await adapter.walkTree("issue-10");
      assert.deepEqual(result, []);
    });

    it("walkTree for bd-XXXXXX legacy ID returns empty list", async () => {
      const adapter = new BeadsAdapter("/tmp/nonexistent", { checkBr: false });
      const result = await adapter.walkTree("bd-abc123");
      assert.deepEqual(result, []);
    });

    it("walkTree for invalid ID returns empty list", async () => {
      const adapter = new BeadsAdapter("/tmp/nonexistent", { checkBr: false });
      const result = await adapter.walkTree("GARBAGE!!");
      assert.deepEqual(result, []);
    });
  });

  describe("BeadsAdapter — methods from IssueManagerInterface (updated)", () => {
    it("exposes all required interface methods including walkTree", () => {
      const adapter = new BeadsAdapter("/tmp/nonexistent", { checkBr: false });
      const methods = [
        "create", "update", "close", "list", "get",
        "createEpic", "updateEpic", "addDependency", "init",
        "walkTree",
      ];
      for (const method of methods) {
        assert.equal(typeof adapter[method], "function",
          `Expected method '${method}' to exist on BeadsAdapter`);
      }
    });
  });
}
