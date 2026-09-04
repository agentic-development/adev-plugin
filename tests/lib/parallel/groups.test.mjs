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
    assert.deepEqual(r, { groups: [], malformed: false, warnings: [] });
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

  // Regression: hermetic-fixture-and-ground-truth-catalog.plan.md's actual
  // Parallelization section (.context-index/specs/features/eval-harness/) —
  // free-prose group lines beyond the terse "Task N" grammar the parser expects.
  const HERMETIC_FIXTURE_PLAN = `# Plan

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6. Every task in this chain either extends a test file its predecessor created or cites files its predecessor authored, and all six touch \`skill-regression-hermeticity.test.mjs\` or \`skill-regression-catalog.test.mjs\`. Running any two concurrently is a merge conflict, not a speedup.
- Group B (the two run in parallel with each other, both after Group A): Task 7 completes \`skill-regression-catalog.test.mjs\`, Task 8 completes \`skill-regression-hermeticity.test.mjs\` — disjoint files, no overlap.
- Task 9 runs **last**: it modifies the root \`.context-index/manifest.yaml\` and adds two assertions to \`skill-regression-hermeticity.test.mjs\`, the file Task 8 last touches. It is not independent and must not be scheduled first — the suite it extends does not exist until Task 1, and the property its effect assertion sits beside is Task 8's.

So the only real concurrency in this plan is Task 7 alongside Task 8. Group B cannot start before Group A completes: both tasks extend suites their Group A predecessors created, and both assert against a fixture tree and catalog that must already be on disk.

## Task Summary
`;

  it("extracts only well-formed task references from trailing prose, without junk from sentence punctuation or stray words", () => {
    const r = parseParallelizationSection(HERMETIC_FIXTURE_PLAN);
    const byId = Object.fromEntries(r.groups.map((g) => [g.id, g]));
    // Trailing "Task 6." must yield "6", not "6." (TASK_RE must not swallow
    // sentence-ending punctuation into the captured task id).
    assert.deepEqual(byId.A.members, ["1", "2", "3", "4", "5", "6"]);
    // "Every task in this chain" must not be scanned into a bogus "in" member
    // (TASK_RE must require a digit immediately after "Task", not any word).
    assert.ok(!byId.A.members.includes("in"), `unexpected junk member: ${JSON.stringify(byId.A.members)}`);
  });

  it("reports a malformed group line (bad parenthetical) loudly instead of silently dropping it", () => {
    const r = parseParallelizationSection(HERMETIC_FIXTURE_PLAN);
    // Group B's parenthetical ("the two run in parallel...") is neither
    // "independent" nor "sequential" — the whole result must flag this rather
    // than silently vanish Group B with no signal.
    assert.equal(r.malformed, true);
    assert.ok(Array.isArray(r.warnings) && r.warnings.length > 0, "expected a non-empty warnings array");
    assert.ok(
      r.warnings.some((w) => /\bB\b/.test(w)),
      `expected a warning naming Group B, got: ${JSON.stringify(r.warnings)}`,
    );
  });

  it("TASK_RE does not extract a bare word following lowercase 'task'", () => {
    const r = parseParallelizationSection(`## Parallelization

- Group A (independent): Task 1. Note that task in this chain matters.

## Next
`);
    assert.deepEqual(r.groups[0].members, ["1"]);
  });

  it("TASK_RE keeps dotted and lettered sub-task ids intact", () => {
    const r = parseParallelizationSection(`## Parallelization

- Group A (independent): Task 3.1 → Task 3a → Task 8b

## Next
`);
    assert.deepEqual(r.groups[0].members, ["3.1", "3a", "8b"]);
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
