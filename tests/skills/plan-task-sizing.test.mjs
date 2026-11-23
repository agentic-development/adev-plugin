import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PLUGIN_ROOT } from "../helpers.mjs";

const read = (rel) => readFileSync(join(PLUGIN_ROOT, rel), "utf8");
const STEP5 = read("skills/plan/references/steps/step-5-write-the-plan.md");
const REVIEWER = read("skills/plan/references/plan-reviewer-prompt.md");

test("step 5 states both split thresholds and keeps test updates with the change", () => {
  const section = STEP5.slice(STEP5.indexOf("### Task Sizing"));
  assert.ok(STEP5.includes("### Task Sizing"), "step 5 must carry a Task Sizing section");
  assert.match(section, /more than 5 non-test files/);
  assert.match(section, /more than 8 existing tests/);
  assert.match(section, /Do not split off the test updates into a later task/);
});

test("step 5 requires Why not split on large tasks and Fixture platform on machine-dependent fixtures", () => {
  assert.match(STEP5, /`large`[^\n]*\*\*Why not split:\*\*/);
  assert.match(STEP5, /\*\*Fixture platform:\*\*[^\n]*CI Linux container/);
});

test("the plan reviewer's Task Sizing check flags every rule step 5 states", () => {
  const row = REVIEWER.split("\n").find((l) => l.startsWith("| **Task Sizing** |"));
  assert.ok(row, "plan reviewer must keep its Task Sizing row");
  assert.match(row, /more than 5 non-test files/);
  assert.match(row, /more than 8 existing tests/);
  assert.match(row, /\*\*Why not split:\*\*/);
  assert.match(row, /\*\*Fixture platform:\*\*/);
});
