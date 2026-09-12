import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const content = readFileSync(join(__dirname, "..", "..", "skills", "init", "SKILL.md"), "utf8");

test("Step 7c.0 states the overlay base is the operator's own selection, not the full bundle", () => {
  const start = content.indexOf("#### Step 7c.0");
  const end = content.indexOf("\n1. **Scan for existing charters.**");
  const section = content.substring(start, end);
  assert.ok(!/load the resolved domain's bundled `reviewers\.yaml`/.test(section),
    "Step 7c.0 must no longer name the full domain bundle as the overlay base");
  assert.match(section, /operator's own (Step 7c )?selection/i);
});

test("Step 7c.0 / Step 7d.0 surface overlay warnings in the Step 7 summary, not discard them", () => {
  assert.match(content, /RISK_TIER_OVERLAY_UNKNOWN_ID/);
  assert.match(content, /surface(d|s)? (in|at) the Step 7 summary/i);
});

test("an unselected-id overlay warning is named as a meaningful signal, not noise", () => {
  assert.match(content, /RISK_TIER_OVERLAY_UNKNOWN_ID/);
  assert.match(content, /tier expects|didn't select|not (selected|part of)/i);
});
