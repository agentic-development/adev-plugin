import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const skill = readFileSync("skills/eval/SKILL.md", "utf8");
const layer3 = skill.slice(skill.indexOf("## Layer 3"), skill.indexOf("## Layer 4"));

test("Layer 3 names the CLI verb that owns the arithmetic", () => {
  assert.match(layer3, /adev eval score/);
});

test("the aggregate formula no longer sits in the skill as an executable directive", () => {
  assert.doesNotMatch(layer3, /^\s*Layer 3 score\s*=\s*round\(/m,
    "the formula must document what the verb computes, not instruct the agent to compute it");
  assert.doesNotMatch(layer3, /element points\s*=\s*\(elements MET/,
    "the in-prose computation was relocated to lib/evals/score.mjs");
});

test("Layer 3 reports half-level statuses instead of discarding the whole layer", () => {
  assert.match(layer3, /INSUFFICIENT_EVIDENCE/);
  assert.match(layer3, /NOT_SCORED/);
  assert.match(layer3, /deterministic/i);
  assert.doesNotMatch(layer3, /report Layer 3 as `INSUFFICIENT_EVIDENCE`, contribute 0 points/,
    "the whole-layer discard contradicts the engine, which keeps the deterministic half numeric");
});

test("the report template renders a status half by name, never as 0", () => {
  const report = skill.slice(skill.indexOf("## Layer 3: Reference-Anchored Judgement —"));
  assert.match(report, /INSUFFICIENT_EVIDENCE|NOT_SCORED/);
});

test("the skill remains free of inline-Node directives", () => {
  assert.doesNotMatch(skill, /Run inline Node|node\s+--input-type=module\s+-e|node\s+-e/);
});
