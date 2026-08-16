import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKILL = readFileSync(join(ROOT, "skills", "specify", "SKILL.md"), "utf8");
// Standard mode's Step 4 is the canonical block both describe blocks below
// assert against. `section` is a hoisted function declaration, so deriving this
// at module scope is safe and still fails loudly if the heading is renamed.
const STEP4 = section(SKILL, "### Step 4: Interactive Spec Authoring");

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
  it("states the BEH-<n> identifier form", () => {
    assert.match(STEP4, /\*\*BEH-/, "Step 4 must state the bolded BEH- identifier form");
  });

  it("states that behaviors render as an unordered list", () => {
    assert.match(STEP4, /unordered/i);
  });

  it("states the allocate-above-the-highest-ever-used rule", () => {
    assert.match(STEP4, /never reused|never reuse/i);
    assert.match(STEP4, /highest/i);
  });

  it("names the retired-behavior-ids tombstone comment", () => {
    assert.ok(STEP4.includes("retired-behavior-ids"));
  });
});

describe("specify SKILL.md — behavior-ID revision obligations", () => {
  it("insertion does not renumber existing behaviors (BEH-2)", () => {
    assert.match(STEP4, /no other behavior'?s? ID changes|never renumber/i);
  });

  it("an in-place rewrite keeps the existing ID (BEH-3)", () => {
    assert.match(STEP4, /keeps? (its )?existing ID|keep the ID/i);
  });

  it("a deleted ID is tombstoned and never reassigned (BEH-4)", () => {
    assert.match(STEP4, /never reassigned|never reused/i);
    assert.ok(STEP4.includes("retired-behavior-ids"));
    // The two matchers above are satisfied by the allocation guidance alone, so
    // on their own they do not bind the deletion rule. This third assertion is
    // what ties BEH-4 to the revision obligation: a *deleted* behavior's ID is
    // appended to the tombstone list.
    assert.match(STEP4, /deleted behavior'?s? ID is appended to/i);
  });

  it("redefinition retires the old ID and mints a new one (BEH-5)", () => {
    assert.match(STEP4, /retire[sd]? the old ID|retire .* and mint/i);
  });

  it("legacy specs are not retro-migrated (BEH-7)", () => {
    assert.match(STEP4, /not retro-?migrat|legacy spec/i);
  });
});

describe("specify SKILL.md — non-delegating authoring sites cross-reference the convention", () => {
  for (const heading of [
    "### Step 4: Generate Snapshot Spec",
    "### Step 4: Generate Retroactive Spec",
  ]) {
    it(`${heading} references the BEH-<n> convention`, () => {
      const body = section(SKILL, heading);
      assert.match(body, /BEH-/, `${heading} must cross-reference the behavior-ID convention`);
    });
  }
});

const BEHAVIORS_TEMPLATES = [
  ["templates", "spec-template.behavioral.md"],
  ["templates", "spec-template.refactor.md"],
  ["templates", "domains", "software", "spec-template.md"],
];

describe("spec templates — Behaviors placeholder carries behavior IDs", () => {
  for (const parts of BEHAVIORS_TEMPLATES) {
    const rel = parts.join("/");
    const body = readFileSync(join(ROOT, ...parts), "utf8");

    it(`${rel} renders the placeholder as an unordered BEH-<n> item`, () => {
      assert.match(
        body,
        /^- \*\*BEH-\d+\*\* — \*\*When\*\* .+ \*\*then\*\* .+$/m,
        `${rel} must render behaviors as "- **BEH-n** — **When** ... **then** ..."`
      );
    });

    it(`${rel} carries a retired-behavior-ids tombstone comment`, () => {
      assert.match(body, /<!-- retired-behavior-ids: \(none\) -->/, rel);
    });
  }
});

// Discover every spec template rather than hardcoding the list, so a template
// added later cannot escape the guard.
function discoverSpecTemplates() {
  const roots = [join(ROOT, "templates"), join(ROOT, "templates", "domains", "software")];
  const found = [];
  for (const dir of roots) {
    for (const name of readdirSync(dir)) {
      const isSpecTemplate = name.startsWith("spec-template") && name.endsWith(".md");
      if (isSpecTemplate) found.push(join(dir, name));
    }
  }
  return found;
}

// Returns the body of the template's "## Behaviors"/"### Behaviors" section, or
// null when the template has no Behaviors section at all. Four spec templates
// (artifact, skill, integration, action) omit the section BY DESIGN; they are
// partitioned out at discovery time below rather than short-circuited inside a
// test body, so every test that runs carries real assertions.
function behaviorsSection(body) {
  const start = body.search(/^#{2,3} Behaviors\s*$/m);
  const rest = body.slice(start).replace(/^#{2,3} Behaviors\s*$/m, "");
  const end = rest.search(/\n#{2,3} /);
  return start === -1 ? null : end === -1 ? rest : rest.slice(0, end);
}

describe("spec templates — no bare behavior ordinals anywhere", () => {
  const templates = discoverSpecTemplates();
  const rel = (file) => file.slice(ROOT.length + 1);
  const sections = new Map(templates.map((f) => [f, behaviorsSection(readFileSync(f, "utf8"))]));
  const bearing = templates.filter((f) => sections.get(f) !== null);
  const omitting = templates.filter((f) => sections.get(f) === null);

  it("discovers every spec template", () => {
    assert.ok(templates.length >= 7, `expected >= 7 spec templates, found ${templates.length}`);
  });

  it("partitions templates into Behaviors-bearing and by-design omissions", () => {
    assert.deepEqual(bearing.map(rel).sort(), [
      "templates/domains/software/spec-template.md",
      "templates/spec-template.behavioral.md",
      "templates/spec-template.refactor.md",
    ]);
    assert.deepEqual(omitting.map(rel).sort(), [
      "templates/spec-template.action.md",
      "templates/spec-template.artifact.md",
      "templates/spec-template.integration.md",
      "templates/spec-template.skill.md",
    ]);
  });

  for (const file of bearing) {
    it(`${rel(file)} renders no ordinal behavior item`, () => {
      const behaviors = sections.get(file);

      assert.doesNotMatch(
        behaviors,
        /^\d+\.\s+\*\*When\*\*/m,
        "behavior statements must not render as an ordered-list ordinal"
      );
      assert.match(behaviors, /^- \*\*BEH-\d+\*\*/m, "behaviors must open with a bolded BEH- ID");
    });
  }
});
