import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const content = readFileSync(join(__dirname, "..", "..", "skills", "review-specs", "SKILL.md"), "utf8");
const start = content.indexOf("## Step 3: Load Reviewer Registry");
const end = content.indexOf("\n## Step 4:");
const step3 = content.substring(start, end);

test("Step 3 checks the exact BEH-4 predicate", () => {
  assert.match(step3, /enabled\s*!==\s*false/);
  assert.match(step3, /\.length\s*===\s*0/);
});

test("Step 3 states the warning is not suppressible, and review still completes", () => {
  assert.match(step3, /standing warning/i);
  assert.match(step3, /not suppressible/i);
  assert.match(step3, /still (runs|completes|dispatches)/i);
});

test("Step 3 covers both empty-list and all-disabled cases", () => {
  assert.match(step3, /all disabled|every (entry|reviewer) (is )?disabled/i);
});
