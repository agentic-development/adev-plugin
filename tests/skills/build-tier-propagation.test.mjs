// tests/skills/build-tier-propagation.test.mjs
//
// /adev:build Steps 1 (review-specs) and 5 (validate) already carry a Rigor
// tier propagation clause telling the orchestrator to forward `--tier <t>`
// to the dispatched sub-skill. Step 4 (implement) did not, so an explicit
// `--tier` override passed to `/adev:build` was silently dropped before
// reaching `/adev:implement`. This test documents the pre-existing Step 1/5
// behavior and asserts Step 4 now carries the same propagation clause.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PLUGIN_ROOT, readSkillSurface } from "../helpers.mjs";

const BUILD_SKILL_PATH = join(PLUGIN_ROOT, "skills", "build", "SKILL.md");
const STEP4_COMPANION_PATH = join(
  PLUGIN_ROOT,
  "skills",
  "build",
  "step4-tier-propagation.md",
);

test("/adev:build Step 1 (review-specs) has a Rigor tier propagation clause", () => {
  const md = readSkillSurface("build");
  assert.match(md, /Rigor tier propagation.*review-specs/s);
});

test("/adev:build Step 5 (validate) has a Rigor tier propagation clause", () => {
  const md = readSkillSurface("build");
  assert.match(md, /Rigor tier propagation.*validate/s);
});

test("/adev:build Step 4 (implement) now has a --tier propagation clause naming /adev:implement", () => {
  const md = readFileSync(BUILD_SKILL_PATH, "utf8");
  const step4 = md.slice(
    md.indexOf("### Step 4: Implement"),
    md.indexOf("### Step 5: Validate"),
  );
  assert.match(step4, /--tier/);
  assert.match(step4, /\/adev:implement/);
});

// The substantive contract lives in the companion, not in SKILL.md's
// one-line pointer — assert it directly so blanking the companion fails
// the suite.

test("step4-tier-propagation.md documents the conditional-append behavior naming /adev:implement", () => {
  const md = readFileSync(STEP4_COMPANION_PATH, "utf8");
  assert.match(md, /was passed to `\/adev:build`/);
  assert.match(md, /append/);
  assert.match(md, /was not passed to `\/adev:build`/);
  assert.match(md, /dispatch without it/);
  assert.match(md, /\/adev:implement/);
});

test("step4-tier-propagation.md forwards an operator-typed --lite or --tier lite to /adev:implement as --lite", () => {
  const md = readFileSync(STEP4_COMPANION_PATH, "utf8");
  assert.match(md, /If `--lite` or `--tier lite` was passed to `\/adev:build`, append `--lite`/);
  assert.match(md, /Steps 1 and 5 forward `--tier lite` unchanged/);
  assert.match(md, /Never add either flag on your own/);
});

test("step4-tier-propagation.md keeps an explicit --tier full|quick typed beside --lite so check-flags can refuse the pair", () => {
  const md = readFileSync(STEP4_COMPANION_PATH, "utf8");
  assert.match(
    md,
    /If the operator also passed an explicit `--tier full` or `--tier quick`, append that `--tier <t>` too and never drop it/,
  );
  assert.match(md, /`check-flags` raises `CONFLICTING_TIER_FLAGS`/);
});

test("step4-tier-propagation.md never forwards --tier lite itself to /adev:implement", () => {
  const md = readFileSync(STEP4_COMPANION_PATH, "utf8");
  assert.doesNotMatch(md, /append `--tier lite`/);
  assert.match(md, /`--tier lite` itself is never forwarded to `\/adev:implement`\./);
  assert.match(
    md,
    /Otherwise \(neither `--lite` nor `--tier lite` was passed\), if `--tier <t>` was passed to `\/adev:build`, append `--tier <t>`/,
  );
});
