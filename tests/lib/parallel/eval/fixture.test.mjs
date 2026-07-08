// tests/lib/parallel/eval/fixture.test.mjs
//
// Meta-test: the equivalence-eval fixture plan must parse into the group shape
// the eval depends on — ≥2 independent groups + 1 sequential group — so the
// harness can assert --parallel's group selection.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseParallelizationSection } from "../../../../lib/parallel/groups.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const fixturePlan = readFileSync(
  join(ROOT, "tests", "evals", "worktree-parallelization", "fixture", "example.plan.md"),
  "utf8",
);

describe("equivalence-eval fixture", () => {
  it("parses into ≥2 independent groups + 1 sequential group", () => {
    const { groups, malformed } = parseParallelizationSection(fixturePlan);
    assert.equal(malformed, false);
    const independent = groups.filter((g) => g.independent);
    const sequential = groups.filter((g) => !g.independent);
    assert.ok(independent.length >= 2, `expected ≥2 independent, got ${independent.length}`);
    assert.equal(sequential.length, 1);
    assert.ok(sequential[0].members.length >= 2, "sequential group spans multiple tasks");
  });
});
