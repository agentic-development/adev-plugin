import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readSkillSurface } from "../helpers.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const COMPANION_PATH = join(ROOT, "skills", "implement", "graduated-review-depth.md");

test("/adev:implement captures git rev-parse HEAD as the task's base SHA before dispatch", () => {
  const md = readSkillSurface("implement");
  assert.match(md, /git rev-parse HEAD/);
});

test("/adev:implement's review-cycle cap reads from implement.max_review_cycles, not either hardcoded 3", () => {
  const md = readSkillSurface("implement");
  assert.match(md, /implement\.max_review_cycles/);
  assert.doesNotMatch(md, /Maximum 3 review cycles per task/);
  assert.doesNotMatch(md, /Maximum 3 code-quality review cycles per task/);
});

test("/adev:implement calls adev implement resolve-depth at both provisional and final passes", () => {
  const md = readSkillSurface("implement");
  assert.match(md, /adev implement resolve-depth/);
  // Literal flag values only — a bare-word `provisional`/`final` match would
  // pass against the pre-graduated SKILL.md and prove nothing.
  assert.match(md, /--pass provisional/);
  assert.match(md, /--pass final/);
});

test("/adev:implement dispatches the synthesized reviewer once under quick, and two reviewers unchanged under full", () => {
  const md = readSkillSurface("implement");
  assert.match(md, /synthesized-reviewer-prompt\.md/);
  // quick: exactly one dispatch, both stages skipped.
  assert.match(md, /skip both stages; dispatch one synthesized reviewer/);
  // full: 2f then 2g, verbatim — the pre-graduated path is untouched.
  assert.match(md, /\*\*`full`\*\* — run 2f then 2g below exactly as written/);
});

test("/adev:implement reports review_depth_resolved for each resolution pass", () => {
  const md = readSkillSurface("implement");
  assert.match(md, /reportReviewDepthResolved|review_depth_resolved/);
});

test("/adev:implement records the synthesized stage on the task's review-round provenance", () => {
  const md = readSkillSurface("implement");
  assert.match(md, /stage.*synthesized|synthesized.*stage/);
});

test("/adev:implement accepts --review-cycles and threads it to the resolve-depth verb", () => {
  const md = readSkillSurface("implement");
  assert.match(md, /--review-cycles/);
});

test("/adev:implement echoes REVIEW_DEPTH_FLOOR_APPLIED and ROUTING_SCORE_OUT_OF_RANGE to the operator-facing transcript, not just to the persisted event", () => {
  const md = readSkillSurface("implement");
  assert.match(md, /REVIEW_DEPTH_FLOOR_APPLIED/);
  assert.match(md, /ROUTING_SCORE_OUT_OF_RANGE/);
});

// The substantive contract lives in the companion, not in SKILL.md's summary
// bullets — assert it directly so deleting the companion fails the suite.

test("graduated-review-depth.md documents both resolve-depth passes with their literal flags", () => {
  const md = readFileSync(COMPANION_PATH, "utf8");
  assert.match(md, /adev implement resolve-depth/);
  assert.match(md, /--pass provisional/);
  assert.match(md, /--pass final/);
  assert.match(md, /--base-sha/);
  assert.match(md, /--review-cycles/);
});

test("graduated-review-depth.md documents --had-critical-finding as a persisting floor leg", () => {
  const md = readFileSync(COMPANION_PATH, "utf8");
  assert.match(md, /--had-critical-finding/);
  assert.match(md, /critical-finding/);
  assert.match(md, /floor/i);
});

test("graduated-review-depth.md requires floor and routing warnings echoed to the operator transcript", () => {
  const md = readFileSync(COMPANION_PATH, "utf8");
  assert.match(md, /floor_applied/);
  assert.match(md, /REVIEW_DEPTH_FLOOR_APPLIED/);
  assert.match(md, /floor_legs/);
  assert.match(md, /ROUTING_SCORE_OUT_OF_RANGE/);
  assert.match(md, /operator-facing transcript/);
});

test("graduated-review-depth.md branches on depth with an unchanged full leg and a single-dispatch quick leg", () => {
  const md = readFileSync(COMPANION_PATH, "utf8");
  assert.match(md, /###\s+`full`/);
  assert.match(md, /###\s+`quick`/);
  assert.match(md, /Step 2f[\s\S]{0,120}Step 2g/);
  assert.match(md, /byte-identical to the\s*\n?\s*pre-graduated flow/);
  assert.match(md, /\*\*single\*\* fresh reviewer subagent/);
  assert.match(md, /synthesized-reviewer-prompt\.md/);
});

test("graduated-review-depth.md holds the quick path to Stage 2's cq-<n> tagging and evaluateStopCondition convergence", () => {
  const md = readFileSync(COMPANION_PATH, "utf8");
  assert.match(md, /`cq-<n>`/);
  assert.match(md, /evaluateStopCondition/);
  assert.match(md, /lib\/loop-convergence\.mjs/);
  assert.match(md, /LOOP_NO_PROGRESS/);
  assert.match(md, /LOOP_BUDGET_EXHAUSTED/);
});

test("graduated-review-depth.md states the synthesized stage replaces both stage records", () => {
  const md = readFileSync(COMPANION_PATH, "utf8");
  assert.match(md, /stage:\s*"synthesized"/);
  assert.match(md, /Review-round:\s*synthesized=<n>/);
  assert.match(md, /replaces both\s*\n?\s*`spec-compliance` and `code-quality`/);
  assert.match(md, /do not\s*\n?\s*also record those two stages/i);
});

test("graduated-review-depth.md states the cap semantics: one effective review_cycles for both branches", () => {
  const md = readFileSync(COMPANION_PATH, "utf8");
  assert.match(md, /review_cycles/);
  assert.match(md, /effective cap for\s*\n?\s*both/);
  assert.match(md, /INVALID_REVIEW_CYCLES/);
  assert.match(md, /`1 × cap`/);
  assert.match(md, /`2 × cap`/);
});
