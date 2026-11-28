// tests/skills/route-lite-eligible.test.mjs
//
// /adev:route's Rigor Tier Signal cites two predicates, each with a gloss the
// agent can follow because it cannot run them:
//   - quickTierSignal(), its `--tier quick` recommendation to the gate
//     skills: routed auto-agent and no dimension below 3 of 5 (0.6 = 3/5);
//   - liteEligible(), the implement lite grant's routing condition and the
//     emit-sidecar count: routed auto-agent or assisted-agent, scores not
//     consulted. The count is an eligibility signal only: route never
//     authorizes lite.

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

test("route SKILL anchors both citations at review-depth.mjs and names the emit-sidecar count beside liteEligible", () => {
  const section = rigorTierSection(readFileSync(SKILL_PATH, "utf8"));
  assert.match(section, /quickTierSignal\(entry\)` in `<ADEV_ROOT>\/lib\/implement\/review-depth\.mjs`/);
  const liteLine = section.split("\n").find((line) => line.includes("liteEligible(entry)"));
  assert.ok(liteLine, "liteEligible must be cited");
  assert.match(liteLine, /`adev route emit-sidecar` reports the count/);
  assert.match(liteLine, /routing condition of `\/adev:implement`'s `lite` grant/);
});

test("the tier-quick gloss states the score rule in route's units: auto-agent and no dimension below 3 of 5", () => {
  const section = rigorTierSection(readFileSync(SKILL_PATH, "utf8"));
  const sentence = section.split("\n").find((line) => line.includes("quickTierSignal(entry)"));
  assert.ok(sentence, "the citation must be on one line with its gloss");
  assert.match(sentence, /eligible for `tier: quick` — exactly when `quickTierSignal\(entry\)`[^\n]*: it routes `auto-agent` and no dimension scores below 3 of 5 \(each sidecar score ≥ 0\.6\)/);
  assert.doesNotMatch(sentence, /liteEligible/, "the tier signal is not the lite grant's predicate");
});

test("the liteEligible gloss states its rule: auto-agent or assisted-agent, scores not consulted", () => {
  const section = rigorTierSection(readFileSync(SKILL_PATH, "utf8"));
  const sentence = section.split("\n").find((line) => line.includes("liteEligible(entry)"));
  assert.match(sentence, /liteEligible\(entry\)`[^\n]*: it routes `auto-agent` or `assisted-agent`, and the dimension scores are not consulted\./);
});

test("the Rigor Tier Signal states each rule once, as its gloss, with no routing-total rule", () => {
  const section = rigorTierSection(readFileSync(SKILL_PATH, "utf8"));
  assert.equal([...section.matchAll(/below 3/g)].length, 1, "the score rule appears only in the quickTierSignal gloss");
  assert.equal([...section.matchAll(/not consulted/g)].length, 1, "the lite rule appears only in the liteEligible gloss");
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
