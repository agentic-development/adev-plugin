import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  REQUIRED_TOP_LEVEL_KEYS,
  ELEMENT_VERDICTS,
  CRITERION_VERDICTS,
  REQUIRED_ELEMENT_FIELDS,
  REQUIRED_CRITERION_FIELDS,
  BUDGET_KEY_PATTERN,
  RUBRIC_ERROR_CODES,
  LIST_TYPED_KEYS,
  ID_FIELD,
  VERDICT_FIELD,
  WEIGHT_FIELD,
} from "../../../lib/evals/rubric-schema.mjs";

test("verdict enums differ: elements never take unknown, criteria never take not_applicable", () => {
  assert.deepEqual([...ELEMENT_VERDICTS].sort(), ["met", "not_applicable", "not_met"]);
  assert.deepEqual([...CRITERION_VERDICTS].sort(), ["met", "not_met", "unknown"]);
});

test("every error code named in the spec's Error Cases table is declared", () => {
  for (const code of [
    "RUBRIC_NESTED_MAP", "RUBRIC_MISSING_KEY", "RUBRIC_INVALID_VERDICT",
    "RUBRIC_INCOMPLETE_ELEMENT", "RUBRIC_INCOMPLETE_CRITERION",
    "RUBRIC_INVALID_BUDGET", "UNSAFE_RUBRIC_PATH", "RUBRIC_LEGACY_SCALE",
    "RUBRIC_NOT_FOUND", "RUBRIC_DUPLICATE_ID",
  ]) {
    assert.ok(RUBRIC_ERROR_CODES.includes(code), `missing code ${code}`);
  }
});

test("the shipped default rubric declares every required top-level key", () => {
  const raw = readFileSync("skills/eval/references/default-rubric.yaml", "utf8");
  for (const key of REQUIRED_TOP_LEVEL_KEYS) {
    assert.match(raw, new RegExp(`^${key}:`, "m"), `default rubric lacks ${key}`);
  }
});

test("budget keys match the budget_max_* form and nothing else", () => {
  assert.ok(BUDGET_KEY_PATTERN.test("budget_max_turns"));
  assert.ok(BUDGET_KEY_PATTERN.test("budget_max_cost_usd"));
  assert.ok(!BUDGET_KEY_PATTERN.test("budget_turns"));
  assert.ok(!BUDGET_KEY_PATTERN.test("max_turns"));
});

test("per-entry required-field lists match the charter domain model", () => {
  assert.deepEqual([...REQUIRED_ELEMENT_FIELDS].sort(), ["id", "met_when", "source"]);
  assert.deepEqual(
    [...REQUIRED_CRITERION_FIELDS].sort(),
    ["criterion", "id", "met_when", "not_met_when", "reference", "unknown_when"],
  );
});

test("RUBRIC_INVALID_LIST_SHAPE (BEH-9) is declared alongside the other error codes", () => {
  assert.ok(RUBRIC_ERROR_CODES.includes("RUBRIC_INVALID_LIST_SHAPE"));
});

test("the two list-typed keys are exactly required_elements and quality_dimensions", () => {
  assert.deepEqual([...LIST_TYPED_KEYS].sort(), ["quality_dimensions", "required_elements"]);
});

test("ID_FIELD, VERDICT_FIELD and WEIGHT_FIELD document the entry-level field names the loader checks", () => {
  // Reading this module alone is enough to learn that `verdict:` is a legal
  // optional entry field and `weight:` is a forbidden (legacy-scale) one —
  // the design-consistency gap this test guards against.
  assert.equal(ID_FIELD, "id");
  assert.equal(VERDICT_FIELD, "verdict");
  assert.equal(WEIGHT_FIELD, "weight");
  assert.ok(REQUIRED_ELEMENT_FIELDS.includes(ID_FIELD));
  assert.ok(REQUIRED_CRITERION_FIELDS.includes(ID_FIELD));
  assert.ok(!REQUIRED_ELEMENT_FIELDS.includes(VERDICT_FIELD));
  assert.ok(!REQUIRED_CRITERION_FIELDS.includes(VERDICT_FIELD));
  assert.ok(!REQUIRED_CRITERION_FIELDS.includes(WEIGHT_FIELD));
});
