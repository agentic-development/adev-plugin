// tests/skills/rigor-ladder-forwarding.test.mjs
//
// BEH-11: `lite` reaches /adev:implement only when the operator typed it, and
// every other consumer runs it as `quick`. These skill-text assertions pin the
// forwarding rules in /adev:build, /adev:work and /adev:review-specs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PLUGIN_ROOT } from "../helpers.mjs";

const BUILD_SKILL = join(PLUGIN_ROOT, "skills", "build", "SKILL.md");
const BUILD_ARGUMENTS = join(PLUGIN_ROOT, "skills", "build", "references", "arguments.md");
const BUILD_STEP4_REF = join(PLUGIN_ROOT, "skills", "build", "references", "pipeline", "step-4-implement.md");
const STEP4_COMPANION = join(PLUGIN_ROOT, "skills", "build", "step4-tier-propagation.md");
const WORK_SKILL = join(PLUGIN_ROOT, "skills", "work", "SKILL.md");
const REVIEW_SPECS_SKILL = join(PLUGIN_ROOT, "skills", "review-specs", "SKILL.md");

function read(path) {
  return readFileSync(path, "utf8");
}

function section(md, startHeading, endHeading) {
  const start = md.indexOf(startHeading);
  assert.notEqual(start, -1, `heading not found: ${startHeading}`);
  const end = md.indexOf(endHeading, start + startHeading.length);
  assert.notEqual(end, -1, `heading not found: ${endHeading}`);
  return md.slice(start, end);
}

test("build body documents --lite in its Arguments section", () => {
  const args = section(read(BUILD_SKILL), "## Arguments", "## Prerequisites");
  assert.match(args, /`--lite`[^\n]*forwarded to `\/adev:implement` only[^\n]*only when the operator passed it/);
});

test("build arguments reference lists lite and states each forwarding target", () => {
  const md = read(BUILD_ARGUMENTS);
  assert.match(md, /^- `--tier <full\|quick\|lite>`:/m);
  const lite = md.split("\n").find((line) => line.startsWith("- `--lite`:"));
  assert.ok(lite, "the --lite argument bullet is present");
  assert.match(lite, /reaches Step 4 as `--lite` on the `\/adev:implement` dispatch/);
  assert.match(lite, /Steps 1 and 5 receive `--tier lite` unchanged/);
  assert.match(lite, /never add it on your own/);
});

test("build forwards --lite to /adev:implement and --tier lite unchanged to review-specs and validate", () => {
  const md = read(STEP4_COMPANION);
  assert.match(md, /append `--lite` to the dispatched args so `\/adev:implement` receives/);
  assert.match(md, /Steps 1 and 5 forward `--tier lite` unchanged to `\/adev:review-specs` and `\/adev:validate`/);
});

test("both Step 4 pointers to the propagation companion are ADEV_ROOT-anchored", () => {
  const pointer =
    "Read `<ADEV_ROOT>/skills/build/step4-tier-propagation.md` for the `--tier` and `--lite` handoff to `/adev:implement`.";
  assert.ok(read(BUILD_SKILL).includes(pointer), "SKILL.md Step 4 pointer");
  assert.ok(read(BUILD_STEP4_REF).includes(pointer), "step-4-implement.md pointer");
  assert.doesNotMatch(read(BUILD_SKILL), /Read `skills\/build\/step4-tier-propagation\.md`/);
  assert.doesNotMatch(read(BUILD_STEP4_REF), /Read `skills\/build\/step4-tier-propagation\.md`/);
});

test("work forwards only operator-typed --lite/--tier lite", () => {
  const md = read(WORK_SKILL);
  assert.match(md, /`--lite`[^\n]*`--tier lite`[^\n]*only when the operator typed it/);
  assert.match(md, /only when the operator typed it[^\n]*[Nn]ever add[^\n]*on your own judgment/);
});

test("work names each lite forwarding target and keeps a typed --tier beside --lite", () => {
  const bullet = read(WORK_SKILL).split("\n").find((line) => line.includes("**Operator-typed `lite`:**"));
  assert.ok(bullet, "the operator-typed lite bullet is present");
  assert.match(bullet, /as `--lite` to `\/adev:implement`/);
  assert.match(bullet, /`--tier lite` alone, unchanged to `\/adev:review-specs` and `\/adev:validate`/);
  assert.match(bullet, /explicit `--tier full\|quick` they also typed \(never drop it; `check-flags` raises `CONFLICTING_TIER_FLAGS`\)/);
});

test("work's easy-work bullet still propagates --tier quick and never --lite", () => {
  const md = read(WORK_SKILL);
  const easy = md.split("\n").find((line) => line.includes('classify the work as "easy"'));
  assert.ok(easy, "the easy-work bullet is present");
  assert.match(easy, /propagate `--tier quick`/);
  assert.doesNotMatch(easy, /--lite|--tier lite/);
});

test("review-specs accepts --tier lite as quick with one printed line", () => {
  const md = read(REVIEW_SPECS_SKILL);
  assert.match(md, /`--tier <full\|quick\|lite>`[^\n]*`lite` runs exactly as `quick`/);
  assert.match(md, /`--tier lite runs as quick here`/);
});

test("review-specs precedence item 1 names lite and maps it to quick", () => {
  const step = section(read(REVIEW_SPECS_SKILL), "## Step 2.5: Resolve Rigor Tier", "## Step 3:");
  assert.match(step, /Resolve the \*\*rigor tier\*\* \(`full` \| `quick`\)[^\n]*`--tier lite` resolves to `quick`/);
  assert.match(step, /1\. \*\*Explicit `--tier <full\|quick\|lite>`\*\*[^\n]*`lite` runs exactly as `quick`/);
});
