// tests/skills/test-helper-inventory-injection.test.mjs
//
// Pins the injection contract: the shared-test-helper inventory must actually reach
// write-test's authoring subagent and implement's implementer subagent, not merely
// exist as a CLI verb nobody calls.
//
// Spec: .context-index/specs/features/test-strategies/test-helper-inventory.spec.md
// Plan-task: 5,6

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readSkillSurface } from "../helpers.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");

/**
 * Read a skill's full instruction surface when `rel` names a SKILL.md, so that
 * assertions still find prose that progressive disclosure moved into
 * references/ companions. Any other path is read verbatim.
 */
function read(rel) {
  const m = /^skills\/([^/]+)\/SKILL\.md$/.exec(rel);
  if (m) return readSkillSurface(m[1]);
  return readFileSync(join(ROOT, rel), "utf8");
}

/**
 * Slice a markdown file from a heading to the next heading at the same-or-shallower level.
 * Fenced code blocks are skipped while looking for that next heading — several SKILL.md
 * bash fences contain comment lines like `# Returns JSON array of violations`, which a naive
 * `^#{1,2} ` search treats as a heading and truncates the section at.
 */
function section(content, heading) {
  const idx = content.indexOf(heading);
  assert.notEqual(idx, -1, `heading not found: ${heading}`);
  const level = heading.match(/^#+/)[0].length;
  const rest = content.slice(idx + heading.length);

  const lines = rest.split("\n");
  const headingRe = new RegExp(`^#{1,${level}} \\S`);
  let inFence = false;
  let consumed = 0;
  for (const line of lines) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    else if (!inFence && headingRe.test(line)) return rest.slice(0, consumed);
    consumed += line.length + 1;
  }
  return rest;
}

const INVENTORY_VERB = "adev test-helpers inventory";

// ---------------------------------------------------------------------------
// write-test (Behavior 11)
// ---------------------------------------------------------------------------

test("write-test has a required RED-phase inventory step naming the verb", () => {
  const skill = read("skills/write-test/SKILL.md");
  const step = section(skill, "## Step 3a: Shared Test Helper Inventory");
  assert.match(step, new RegExp(INVENTORY_VERB.replace(/ /g, "\\s")));
  assert.match(step, /--format text/);
  // The empty case must be an omission, not an empty placeholder.
  assert.match(step, /No shared test helpers, fixtures, or test samples detected\./);
  assert.match(step, /omit the\s+section/i);
});

test("write-test passes the inventory block into the Step 4 authoring subagent", () => {
  const skill = read("skills/write-test/SKILL.md");
  const step4 = section(skill, "## Step 4: Test Authoring (RED Phase)");
  const dispatchList = step4.slice(0, step4.indexOf("### "));
  assert.match(
    dispatchList,
    /Shared Test Helper Inventory/,
    "the inventory must be in Step 4's dispatch bullet list or it never reaches the subagent",
  );
});

test("write-test runs the duplication check before the Handoff Block, advisory only", () => {
  const skill = read("skills/write-test/SKILL.md");
  const step4 = section(skill, "## Step 4: Test Authoring (RED Phase)");
  assert.match(step4, /adev test-helpers check/);
  assert.match(step4, /advisory/i);
  assert.match(step4, /Do \*\*not\*\* block the Handoff Block/);
  assert.ok(
    step4.indexOf("adev test-helpers check") < skill.indexOf("## Step 5: Handoff Block Production"),
  );
});

test("write-test's injected heading does not collide with its Companion Helpers section", () => {
  const skill = read("skills/write-test/SKILL.md");
  assert.ok(skill.includes("## Companion Helpers"), "precondition: the collision risk still exists");
  assert.ok(
    !/^## Shared Test Helpers$/m.test(skill),
    "the injected heading must be `## Shared Test Helper Inventory`, not `## Shared Test Helpers`",
  );
});

// ---------------------------------------------------------------------------
// implement (Behavior 12)
// ---------------------------------------------------------------------------

test("implement loads the inventory during context packet assembly", () => {
  const skill = read("skills/implement/SKILL.md");
  const step2a = section(skill, "#### 2a. Context Packet Assembly");
  assert.match(step2a, new RegExp(INVENTORY_VERB.replace(/ /g, "\\s")));
  assert.match(step2a, /## Shared Test Helper Inventory/);
  assert.match(step2a, /omit the section entirely/i);
});

test("implement lists the inventory in the ordered subagent prompt sections", () => {
  const skill = read("skills/implement/SKILL.md");
  const step2c = section(skill, "#### 2c. Compose Subagent Prompt");
  assert.match(step2c, /Shared Test Helper Inventory/);
});

// ---------------------------------------------------------------------------
// CLAUDE.md anti-patterns: skills name a verb, they never inline Node
// ---------------------------------------------------------------------------

test("the injected sections name a CLI verb and contain no inline Node or JS fence", () => {
  const cases = [
    [read("skills/write-test/SKILL.md"), "## Step 3a: Shared Test Helper Inventory"],
    [read("skills/write-test/SKILL.md"), "### Shared Helper Duplication Check (advisory)"],
    [read("skills/implement/SKILL.md"), "#### 2a. Context Packet Assembly"],
  ];
  for (const [content, heading] of cases) {
    const body = section(content, heading);
    assert.ok(!/Run inline Node/i.test(body), `${heading} contains an inline-Node directive`);
    assert.ok(!/node\s+--input-type=module\s+-e/.test(body), `${heading} contains a node -e heredoc`);
    assert.ok(!/node\s+-e\s/.test(body), `${heading} contains a node -e invocation`);
    assert.ok(!/```javascript/.test(body), `${heading} contains a javascript fence`);
  }
});

test("neither injected skill gained a whole-file inline-Node directive", () => {
  // Whole-file guard. `javascript` fences are NOT asserted against here: both files
  // already carry descriptive-reference fences that CLAUDE.md explicitly permits, and
  // pinning them to zero would fail on pre-existing content this spec never touched.
  for (const rel of ["skills/write-test/SKILL.md", "skills/implement/SKILL.md"]) {
    const skill = read(rel);
    assert.ok(!/Run inline Node/i.test(skill), `${rel} contains an inline-Node directive`);
    assert.ok(!/node\s+--input-type=module\s+-e/.test(skill), `${rel} contains a node -e heredoc`);
  }
});

// ---------------------------------------------------------------------------
// docs
//
// Behavior 14 (a `/adev:sample --test` curation mode, plus a `Sample kind`
// field in the sample template) was deferred out of this spec for scope
// reasons and is tracked as issue-616 — amending /adev:sample's Red Flags
// contract belongs in a PR owned by that skill. Its assertions are removed
// rather than skipped: they described deliverables this branch no longer
// ships, and a skipped test asserting a reverted behavior is exactly the
// silent-skip pattern this epic exists to eliminate.
//
// The inventory does NOT depend on that mode. Test samples are discovered
// via test-shaped `Source:` paths (Behavior 6's second clause), which
// tests/lib/test-strategies/helper-inventory.test.mjs covers directly.
// ---------------------------------------------------------------------------

test("docs/cli-reference.md documents test-helpers in the summary table and its own section", () => {
  const doc = read("docs/cli-reference.md");
  assert.match(doc, /^\| `test-helpers` \|/m);
  assert.match(doc, /^### `test-helpers`$/m);
  const sec = section(doc, "### `test-helpers`");
  assert.match(sec, /test-helpers inventory/);
  assert.match(sec, /test-helpers check/);
  assert.match(sec, /exits 0/);
});
