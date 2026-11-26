// tests/skills/route-lite-eligible.test.mjs
//
// /adev:route reports how many tasks meet the "easy" rigor signal and cites
// liteEligible() as its single definition. The agent cannot run that
// predicate, so the citation carries a gloss in route's own 1–5 units that
// must match LITE_GRANT_THRESHOLD (0.6 = 3/5). The count is an eligibility
// signal only: route never authorizes lite.

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const SKILL_PATH = "skills/route/SKILL.md";

function rigorTierSection(s) {
  const start = s.indexOf("### Rigor Tier Signal");
  assert.notEqual(start, -1, "the Rigor Tier Signal section must exist");
  const end = s.indexOf("\n## ", start);
  return s.slice(start, end === -1 ? undefined : end);
}

test("route SKILL prints lite-eligible line and cites liteEligible as an eligibility signal", () => {
  const s = readFileSync(SKILL_PATH, "utf8");
  assert.match(s, /lite-eligible: <count> of <total>/);
  assert.match(s, /liteEligible\(entry\)/);
  assert.match(s, /eligibility signal, never an authorization/i);
});

test("route SKILL anchors the liteEligible citation at review-depth.mjs and names the emit-sidecar count", () => {
  const section = rigorTierSection(readFileSync(SKILL_PATH, "utf8"));
  assert.match(section, /liteEligible\(entry\)/);
  assert.match(section, /`<ADEV_ROOT>\/lib\/implement\/review-depth\.mjs`/);
  assert.match(section, /`adev route emit-sidecar` reports the count/);
});

test("the citation's gloss states the threshold rule in route's units: auto-agent and no dimension below 3 of 5", () => {
  const section = rigorTierSection(readFileSync(SKILL_PATH, "utf8"));
  const sentence = section.split("\n").find((line) => line.includes("liteEligible(entry)"));
  assert.ok(sentence, "the citation must be on one line with its gloss");
  assert.match(sentence, /liteEligible\(entry\)`[^\n]*: it routes `auto-agent` and no dimension scores below 3 of 5 \(each sidecar score ≥ 0\.6\)/);
});

test("the Rigor Tier Signal states the rule once, as the gloss, not as a separate routing-total rule", () => {
  const section = rigorTierSection(readFileSync(SKILL_PATH, "utf8"));
  assert.equal([...section.matchAll(/below 3/g)].length, 1, "the rule must appear only in the gloss");
  assert.doesNotMatch(section, /total ≥ 16/);
});

test("route SKILL never passes --lite or --tier lite", () => {
  const s = readFileSync(SKILL_PATH, "utf8");
  assert.doesNotMatch(s, /--tier lite/);
  assert.match(s, /never passes `--lite`/);
});

test("route SKILL keeps the --tier quick recommendation for review-specs and validate", () => {
  const s = readFileSync(SKILL_PATH, "utf8");
  assert.match(s, /`\/adev:review-specs`, `\/adev:validate`/);
  assert.match(s, /`--tier quick`/);
});
