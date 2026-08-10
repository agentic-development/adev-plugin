// tests/lib/parallel/groups.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseParallelizationSection, computeMergeOrder } from "../../../lib/parallel/groups.mjs";

const PLAN = `# Plan

## Parallelization

- Group A (independent): Task 1 — foo
- Group B (independent): Task 3 — bar
- Group C (sequential): Task 4 → Task 5 (shared files)
- Group D (independent): Task 2

Groups A–D notes.

## Task Summary
`;

describe("parseParallelizationSection", () => {
  it("parses groups with members and independent flag", () => {
    const r = parseParallelizationSection(PLAN);
    assert.equal(r.malformed, false);
    const byId = Object.fromEntries(r.groups.map((g) => [g.id, g]));
    assert.deepEqual(byId.A.members, ["1"]);
    assert.equal(byId.A.independent, true);
    assert.deepEqual(byId.C.members, ["4", "5"]);
    assert.equal(byId.C.independent, false);
    assert.deepEqual(byId.D.members, ["2"]);
    assert.equal(r.groups.length, 4);
  });

  it("returns malformed:false and empty groups when the section is absent", () => {
    const r = parseParallelizationSection("# Plan\n\n## Task Summary\n");
    assert.deepEqual(r, { groups: [], malformed: false });
  });

  it("returns malformed:true when the section exists but has no parseable group lines", () => {
    const r = parseParallelizationSection("## Parallelization\n\nnothing structured here\n\n## Next\n");
    assert.equal(r.malformed, true);
    assert.deepEqual(r.groups, []);
  });

  it("does not throw on garbage input", () => {
    assert.doesNotThrow(() => parseParallelizationSection(""));
    assert.doesNotThrow(() => parseParallelizationSection(null));
  });
});

describe("computeMergeOrder", () => {
  it("orders lexicographically by id when there are no deps", () => {
    const groups = [{ id: "C" }, { id: "A" }, { id: "B" }];
    assert.deepEqual(computeMergeOrder(groups), ["A", "B", "C"]);
  });

  it("honors dependency order before lexicographic", () => {
    const groups = [{ id: "A" }, { id: "B" }, { id: "C" }];
    // C depends on B; B depends on A → A, B, C regardless of input order
    const order = computeMergeOrder(groups, { C: ["B"], B: ["A"] });
    assert.deepEqual(order, ["A", "B", "C"]);
  });

  it("is deterministic for independent groups with deps on a common root", () => {
    const groups = [{ id: "B" }, { id: "C" }, { id: "A" }];
    const order = computeMergeOrder(groups, { B: ["A"], C: ["A"] });
    assert.equal(order[0], "A");
    assert.deepEqual(order.slice(1), ["B", "C"]); // lexicographic among peers
  });
});
