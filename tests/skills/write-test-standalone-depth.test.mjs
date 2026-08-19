import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const skill = readFileSync(new URL("../../skills/write-test/SKILL.md", import.meta.url), "utf8");
const preflight = skill.slice(skill.indexOf("## Step 0: Standalone Pre-flight"));

test("standalone pre-flight pins depth to the built-in standard (+3 more contract assertions)", () => {
  // standalone pre-flight pins depth to the built-in standard
  assert.match(preflight, /built-in `standard`/);

  // standalone pre-flight performs no chain resolution, escalation, or floor evaluation
  assert.match(preflight, /no (chain resolution|policy)/i);

  // standalone mode emits no test_depth_assigned event
  assert.match(preflight, /no test_depth_assigned event/);

  // write-test SKILL.md states the gaming-blocker set is identical at every depth (Behavior 19)
  assert.match(skill, /gaming.{0,40}(blocker|pattern).{0,80}(regardless of|identical|invariant).{0,40}depth/is);
});
