/**
 * Guards for issue-517: `partial_schema` marker placement vs the
 * `adev/frontmatter-present` diagnostic.
 *
 * `skills/specify/SKILL.md` Step 5 used to prescribe the marker as a leading
 * HTML comment ABOVE the frontmatter:
 *
 *     <!-- partial_schema: spec@1 -->
 *
 *     ---
 *     ... frontmatter ...
 *     ---
 *
 * `adev/frontmatter-present` (severity: error, `governance/diagnostics.yaml`)
 * requires the first non-blank line of a `.spec.md` to be `---`. So every spec
 * authored by following the skill instruction was born violating an
 * error-severity diagnostic, and the marker survives the atomic rename into
 * the final artifact — nothing strips it.
 *
 * `incremental-artifact-writes.spec.md` SA-6 only requires the marker to be
 * "in the first authored chunk"; the HTML-comment-above-frontmatter placement
 * was over-specified by the two skills, not mandated by the spec. The reader
 * (`readSchemaMarker`, lib/cli/partial.mjs) scans the first 4 KB for the
 * `partial_schema: <marker>` token regardless of surrounding syntax, so a
 * YAML frontmatter key satisfies both contracts with no parser change.
 *
 * `.plan.md` is deliberately NOT covered: plans carry no frontmatter contract
 * and are not one of the four artifact kinds the diagnostic serves
 * (`lib/diagnostics/tier1/frontmatter-present.mjs` docstring), so the HTML
 * comment remains correct there. The last test pins that boundary.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { PLUGIN_ROOT, readSkillSurface } from "../helpers.mjs";
import { run as frontmatterPresent } from "../../lib/diagnostics/tier1/frontmatter-present.mjs";

const SPECIFY_SKILL = join(PLUGIN_ROOT, "skills", "specify", "SKILL.md");

/** The reader's own regex (lib/cli/partial.mjs readSchemaMarker). */
const MARKER_RE = /partial_schema:\s*([a-z][a-z0-9-]{0,31}@[0-9]{1,3})/;

/** Recursively collect files matching a suffix under a directory. */
function collect(dir, suffix, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) collect(abs, suffix, out);
    else if (entry.name.endsWith(suffix)) out.push(abs);
  }
  return out;
}

/** Extract the fenced markdown block that follows a heading-ish anchor line. */
function fencedBlockAfter(body, anchorRe) {
  const idx = body.search(anchorRe);
  assert.notEqual(idx, -1, `anchor ${anchorRe} not found`);
  const rest = body.slice(idx);
  const m = rest.match(/```markdown\r?\n([\s\S]*?)```/);
  assert.ok(m, `no fenced markdown example after ${anchorRe}`);
  return m[1];
}

test("skills/specify prescribes a marker placement that satisfies adev/frontmatter-present", () => {
  const body = readSkillSurface("specify");
  const example = fencedBlockAfter(body, /partial_schema: spec@1/);
  const firstMeaningful = example
    .split(/\r?\n/)
    .find((l) => l.trim() !== "");
  assert.equal(
    firstMeaningful.trim(),
    "---",
    "the prescribed spec example must open with the frontmatter delimiter, " +
      "not an HTML comment — adev/frontmatter-present is severity: error"
  );
});

test("skills/specify's prescribed example still carries a readable marker", () => {
  const body = readSkillSurface("specify");
  const example = fencedBlockAfter(body, /partial_schema: spec@1/);
  const m = example.match(MARKER_RE);
  assert.ok(m, "the example must still contain a partial_schema marker (SA-6)");
  assert.equal(m[1], "spec@1");
});

test("skills/specify no longer instructs placing the marker above the frontmatter", () => {
  const body = readFileSync(SPECIFY_SKILL, "utf8");
  assert.doesNotMatch(
    body,
    /marker placed in an HTML comment/,
    "the HTML-comment placement instruction must be gone from the spec-authoring skill"
  );
});

test("every committed .spec.md satisfies adev/frontmatter-present", () => {
  const specs = collect(join(PLUGIN_ROOT, ".context-index", "specs"), ".spec.md");
  assert.ok(specs.length > 100, `expected a real corpus, found ${specs.length}`);
  const violations = specs
    .filter((p) => frontmatterPresent({ spec: p }).fired)
    .map((p) => p.slice(PLUGIN_ROOT.length + 1));
  assert.deepEqual(
    violations,
    [],
    `these .spec.md files do not begin with --- frontmatter:\n${violations.join("\n")}`
  );
});

test("a frontmatter-key marker satisfies the diagnostic and the reader together", () => {
  // Pins the reconciliation itself: the two contracts are compatible only
  // because the reader's scan is syntax-agnostic.
  const sample = [
    "---",
    "charter: demo",
    "partial_schema: spec@1",
    "status: draft",
    "---",
    "",
    "# Live Spec: Demo",
    "",
  ].join("\n");
  const tmp = join(PLUGIN_ROOT, "tests", ".partial-marker-sample.spec.md");
  writeFileSync(tmp, sample);
  try {
    assert.equal(frontmatterPresent({ spec: tmp }).fired, false);
    assert.equal(sample.slice(0, 4096).match(MARKER_RE)[1], "spec@1");
  } finally {
    rmSync(tmp, { force: true });
  }
});

test(".plan.md keeps the HTML-comment marker — plans carry no frontmatter contract", () => {
  const body = readFileSync(
    join(PLUGIN_ROOT, "skills", "plan", "references", "steps", "step-5-write-the-plan.md"),
    "utf8",
  );
  const example = fencedBlockAfter(body, /partial_schema: plan@1/);
  const firstMeaningful = example.split(/\r?\n/).find((l) => l.trim() !== "");
  assert.match(
    firstMeaningful,
    /^<!--\s*partial_schema: plan@1\s*-->$/,
    "plan files are not one of adev/frontmatter-present's four artifact kinds; " +
      "the HTML comment stays correct there"
  );
});
