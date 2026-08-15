import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKILL = readFileSync(join(ROOT, "skills", "specify", "SKILL.md"), "utf8");

// Isolate a single heading's block so the assertions cannot be satisfied by
// prose living somewhere else in the file. `indexOf` returns the FIRST
// occurrence of the heading, which for "### Step 4: Interactive Spec
// Authoring" is the standard-mode block (the cross-cutting-mode block repeats
// the same heading later in the file).
//
// The section ends at the next H2/H3 heading that is NOT inside a fenced code
// block. Fence tracking is required because the guidance this suite asserts
// quotes an example whose first line is "### Behaviors" at column 0; treating
// that as a terminator would truncate the block and fail on correct content.
// Tracking fences rather than matching a narrower "### Step " boundary also
// keeps the helper correct for a section that is the last Step in a mode
// block, which would otherwise run to EOF and let a later mode's prose satisfy
// an assertion.
//
// Limitation: fence detection is line-based and does not pair ``` against ~~~,
// so a section mixing the two marker styles would mis-toggle. No skill section
// targeted by this suite does that.
function section(md, heading) {
  const start = md.indexOf(heading);
  assert.notEqual(start, -1, `missing heading: ${heading}`);
  const rest = md.slice(start + heading.length);

  const lines = rest.split("\n");
  let inFence = false;
  let offset = 0;
  for (const line of lines) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) inFence = !inFence;
    else if (!inFence && /^#{2,3} /.test(line)) return rest.slice(0, offset);
    offset += line.length + 1;
  }
  return rest;
}

describe("specify SKILL.md — behavior-ID convention (standard mode)", () => {
  const step4 = section(SKILL, "### Step 4: Interactive Spec Authoring");

  it("states the BEH-<n> identifier form", () => {
    assert.match(step4, /\*\*BEH-/, "Step 4 must state the bolded BEH- identifier form");
  });

  it("states that behaviors render as an unordered list", () => {
    assert.match(step4, /unordered/i);
  });

  it("states the allocate-above-the-highest-ever-used rule", () => {
    assert.match(step4, /never reused|never reuse/i);
    assert.match(step4, /highest/i);
  });

  it("names the retired-behavior-ids tombstone comment", () => {
    assert.ok(step4.includes("retired-behavior-ids"));
  });
});

describe("specify SKILL.md — behavior-ID revision obligations", () => {
  const step4 = section(SKILL, "### Step 4: Interactive Spec Authoring");

  it("insertion does not renumber existing behaviors (BEH-2)", () => {
    assert.match(step4, /no other behavior'?s? ID changes|never renumber/i);
  });

  it("an in-place rewrite keeps the existing ID (BEH-3)", () => {
    assert.match(step4, /keeps? (its )?existing ID|keep the ID/i);
  });

  it("a deleted ID is tombstoned and never reassigned (BEH-4)", () => {
    assert.match(step4, /never reassigned|never reused/i);
    assert.ok(step4.includes("retired-behavior-ids"));
    // The two matchers above are satisfied by the allocation guidance alone, so
    // on their own they do not bind the deletion rule. This third assertion is
    // what ties BEH-4 to the revision obligation: a *deleted* behavior's ID is
    // appended to the tombstone list.
    assert.match(step4, /deleted behavior'?s? ID is appended to/i);
  });

  it("redefinition retires the old ID and mints a new one (BEH-5)", () => {
    assert.match(step4, /retire[sd]? the old ID|retire .* and mint/i);
  });

  it("legacy specs are not retro-migrated (BEH-7)", () => {
    assert.match(step4, /not retro-?migrat|legacy spec/i);
  });
});
