// `/adev:plan`'s Feature, Epic and Release modes create board items in
// process. On the github backend a create that fails after the issue exists
// throws GITHUB_PARTIAL_CREATE carrying the new canonical `id` and the
// `unwritten` fields. Catching it and continuing would leave a half-written
// item behind and stack more items on top of it, so each mode must stop,
// report the code, the ID and the unwritten fields, create nothing further,
// and send the operator to finish that item and re-run — never retry.
// `/adev:specify` Step 5.6 deliberately keeps its catch-log-continue: its spec
// file is already written, so the create there is best effort.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PLUGIN_ROOT } from "../helpers.mjs";

const MODES = [
  { file: "skills/plan/references/feature-mode.md" },
  { file: "skills/plan/references/epic-mode.md" },
  { file: "skills/plan/references/release-mode.md" },
];

const ANCHOR = "create({";
// The approval step, whatever its number, is where every mode issues its create() calls.
const ON_APPROVAL = /^\d+\. \*\*On approval\*\*/;

// One regex per BEH-14 obligation, matched case-insensitively.
const OBLIGATIONS = [
  ["names the GITHUB_PARTIAL_CREATE code", /GITHUB_PARTIAL_CREATE/i],
  ["says the mode stops", /\b(stop|stops|halt|halts)\b/i],
  ["reports the canonical ID", /\breport[^.]*\b(canonical )?id\b/i],
  ["reports the unwritten fields", /\breport[^.]*\bunwritten\b/i],
  ["creates no further items", /\b(no|not|never|without)\b[^.]*\bfurther\b[^.]*\bitems?\b/i],
  ["does not retry", /\b(no|not|never|without)\b[^.]*\bretr(y|ies|ying)\b/i],
  ["tells the operator to finish the item and re-run", /\bfinish\b[\s\S]*?\bre-?run\b/i],
  ["names `adev issues update` as a way to finish the item", /adev issues update/i],
];

const read = (rel) => readFileSync(join(PLUGIN_ROOT, rel), "utf8");

// A boundary is an unindented heading or top-level numbered step outside a code fence.
function boundaries(lines) {
  const marks = [];
  let inFence = false;
  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (!inFence && (/^#{1,6}\s/.test(line) || /^\d+\.\s/.test(line))) marks.push(i);
  });
  return marks;
}

// The section enclosing the first `create({`: from the nearest preceding boundary to the next one.
function createSection(text) {
  const lines = text.split("\n");
  const anchor = lines.findIndex((line) => line.includes(ANCHOR));
  if (anchor === -1) return null;
  const marks = boundaries(lines);
  const start = marks.filter((i) => i <= anchor).at(-1) ?? 0;
  const end = marks.find((i) => i > anchor) ?? lines.length;
  return lines.slice(start, end).join("\n");
}

describe("BEH-14: /adev:plan modes stop loudly on GITHUB_PARTIAL_CREATE", () => {
  for (const { file } of MODES) {
    describe(file, () => {
      const text = read(file);
      const section = createSection(text);

      it("anchors on the approval step that holds the create() calls", () => {
        assert.notEqual(section, null, `${file} has no ${ANCHOR}`);
        assert.match(section.split("\n")[0], ON_APPROVAL);
        assert.ok(section.includes(ANCHOR));
      });

      for (const [label, re] of OBLIGATIONS) {
        it(`the create step ${label}`, () => {
          assert.match(section, re);
        });
      }

      it("places the stop paragraph after the last create() call in the step", () => {
        const codeAt = section.indexOf("GITHUB_PARTIAL_CREATE");
        assert.ok(codeAt > section.lastIndexOf(ANCHOR),
          `GITHUB_PARTIAL_CREATE must follow the last ${ANCHOR} (code at ${codeAt}, last create at ${section.lastIndexOf(ANCHOR)})`);
      });

      it("gains no inline-Node or fenced JavaScript directive", () => {
        assert.doesNotMatch(text, /node\s+(--input-type=module\s+)?-e\b/);
        assert.doesNotMatch(text, /Run inline Node/i);
        assert.doesNotMatch(text, /^\s*```(javascript|js|mjs)\b/m);
      });
    });
  }

  it("release mode's Workspace-mode skip paragraph is not the anchored section", () => {
    const text = read("skills/plan/references/release-mode.md");
    const section = createSection(text);
    assert.match(text, /Skip epic-board `create\(\)` calls \*\*unconditionally\*\*/);
    assert.doesNotMatch(section, /Skip epic-board `create\(\)` calls/);
  });
});

describe("BEH-14: /adev:specify Step 5.6 keeps catch-log-continue", () => {
  const text = read("skills/specify/references/modes/standard-mode.md");
  const start = text.indexOf("### Step 5.6:");
  const next = text.indexOf("\n### ", start + 1);
  const step56 = text.slice(start, next === -1 ? undefined : next);

  it("Step 5.6 exists", () => {
    assert.notEqual(start, -1);
  });

  it("Step 5.6 still says the adapter failure does not block spec completion", () => {
    assert.match(step56, /do not block/);
  });

  it("Step 5.6 does not adopt the plan-mode stop on GITHUB_PARTIAL_CREATE", () => {
    assert.doesNotMatch(step56, /GITHUB_PARTIAL_CREATE/);
  });
});
