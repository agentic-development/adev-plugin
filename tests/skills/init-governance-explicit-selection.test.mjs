import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillPath = join(__dirname, "..", "..", "skills", "init", "SKILL.md");
const content = readFileSync(skillPath, "utf8");
const start = content.indexOf("#### Step 7d.0");
const end = content.indexOf("\n#### Step 7d.1");
const section = content.substring(start, end);

test("Step 7d.0 presents an explicit inclusion checklist, not an unconditional copy", () => {
  assert.ok(!/copy its bytes verbatim/.test(section),
    "Step 7d.0 must no longer copy the starter verbatim");
  assert.match(section, /adev governance scaffold/, "Step 7d.0 must call the new scaffold verb");
  assert.match(section, /unchecked|not pre-selected|explicit(ly)? select/i,
    "Step 7d.0 must default the checklist to unchecked");
});

test("Step 7d.0 states a zero-selection outcome is legitimate, not an error", () => {
  assert.match(section, /zero checks|selects? (zero|none)/i);
  assert.match(section, /checks:\s*\[\]/);
});

test("Step 7d.0 sub-step 5's idempotency guard survives unchanged", () => {
  assert.match(section, /already exists.*no-op|no-op.*already exists/is);
});

const step7cStart = content.indexOf("### Step 7c:");
const step7cEnd = content.indexOf("\n### Step 7d:");
const step7c = content.substring(step7cStart, step7cEnd);

test("Step 7c always writes review.yaml, even on zero selection (BEH-3)", () => {
  assert.ok(!/If nothing was selected, DO NOT write the file/.test(step7c),
    "Step 7c must no longer skip the write on zero selection");
  assert.match(step7c, /reviewers:\s*\[\]/);
  assert.match(step7c, /materialized_at/);
});

test("Step 7c's bundled reviewer prompt starts unselected", () => {
  assert.match(step7c, /unselected|not pre-selected|opt.?in/i);
});

test("Step 7c calls the shared scaffold verb", () => {
  assert.match(step7c, /adev governance scaffold/);
});
