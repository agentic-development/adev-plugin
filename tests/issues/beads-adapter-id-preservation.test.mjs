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

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { BeadsAdapter } from "../../lib/issues/beads-adapter.mjs";

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
