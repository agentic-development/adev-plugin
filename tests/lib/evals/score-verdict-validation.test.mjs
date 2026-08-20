import { test } from "node:test";
import assert from "node:assert/strict";
import { loadRubric } from "../../../lib/evals/rubric.mjs";
import { scoreRubric } from "../../../lib/evals/score.mjs";
import { captureThrow } from "../../helpers.mjs";

const rubric = () => loadRubric("tests/fixtures/evals/rubrics/conforming.yaml");
// conforming.yaml: elements spec_criteria_referenced, tests_accompany_source;
//                  criteria readability_naming, separation_of_concerns.
const complete = () => [
  { id: "spec_criteria_referenced", value: "met", evidence: "tests/x.test.mjs:12 names criterion 1" },
  { id: "tests_accompany_source", value: "met", evidence: "the diff pairs every source file" },
  { id: "readability_naming", value: "met", evidence: "lib/x.mjs:4 names the export" },
  { id: "separation_of_concerns", value: "not_met", evidence: "lib/x.mjs:30 mixes two responsibilities" },
];

test("met with empty evidence is rejected, naming the entry", () => {
  const v = complete();
  v[0].evidence = "   ";
  const err = captureThrow(() => scoreRubric(rubric(), v));
  assert.equal(err.code, "SCORE_EMPTY_EVIDENCE");
  assert.match(err.message, /spec_criteria_referenced/);
});

test("unknown with empty evidence is legal — absence is expressible only as unknown", () => {
  const v = complete();
  v[2] = { id: "readability_naming", value: "unknown", evidence: "" };
  assert.doesNotThrow(() => scoreRubric(rubric(), v));
});

test("a verdict id the rubric does not declare is rejected, naming the id", () => {
  const err = captureThrow(() =>
    scoreRubric(rubric(), [...complete(), { id: "ghost", value: "met", evidence: "e" }]));
  assert.equal(err.code, "SCORE_UNKNOWN_VERDICT_ID");
  assert.match(err.message, /ghost/);
});

test("a declared id the verdict set omits is rejected, naming the id", () => {
  const err = captureThrow(() => scoreRubric(rubric(), complete().slice(0, 3)));
  assert.equal(err.code, "SCORE_MISSING_VERDICT");
  assert.match(err.message, /separation_of_concerns/);
});

test("an element resolving unknown is illegal; a criterion resolving not_applicable is illegal", () => {
  const asElement = complete();
  asElement[0].value = "unknown";
  const e1 = captureThrow(() => scoreRubric(rubric(), asElement));
  assert.equal(e1.code, "SCORE_INVALID_VERDICT");
  assert.match(e1.message, /spec_criteria_referenced[\s\S]*unknown/);

  const asCriterion = complete();
  asCriterion[2].value = "not_applicable";
  const e2 = captureThrow(() => scoreRubric(rubric(), asCriterion));
  assert.equal(e2.code, "SCORE_INVALID_VERDICT");
  assert.match(e2.message, /readability_naming[\s\S]*not_applicable/);
});

test("a repeated verdict for one id is rejected, naming the id", () => {
  const err = captureThrow(() => scoreRubric(rubric(), [...complete(), complete()[0]]));
  assert.equal(err.code, "SCORE_DUPLICATE_VERDICT");
  assert.match(err.message, /spec_criteria_referenced/);
});
