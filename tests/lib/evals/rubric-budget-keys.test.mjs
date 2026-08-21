import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { captureThrow, cleanupTempDir, createTempDir, PLUGIN_ROOT } from "../../helpers.mjs";
import { loadRubric } from "../../../lib/evals/rubric.mjs";
import { BUDGET_KEY_PATTERN } from "../../../lib/evals/rubric-schema.mjs";

// The fixture paths below are relative to the repository root, which is what
// PLUGIN_ROOT resolves to.
const repoRoot = PLUGIN_ROOT;

/**
 * The twelve required top-level keys, so a one-off source clears every earlier
 * pass and reaches the budget pass. Budget keys are optional, so none appear
 * here — each caller appends the budget line it exists to exercise.
 */
const REQUIRED_KEYS = [
  'rubric_id: "x"',
  "version: 1",
  "layer: 3",
  'verdict_values: "met | not_met | unknown"',
  "required_elements: []",
  "quality_dimensions: []",
  "layer3_max_points: 25",
  "required_element_points: 10",
  "judged_criterion_points: 15",
  'unknown_policy: "exclude_from_denominator"',
  'not_applicable_policy: "exclude_from_denominator"',
  "insufficient_evidence_threshold_percent: 40",
].join("\n");

/**
 * Load a one-off rubric carrying `budgetLines` from a throwaway root, returning
 * the loaded document. Built inline rather than as an on-disk fixture: these
 * shapes exist to probe value typing, and no later suite should copy them.
 *
 * @param {string} budgetLines - extra top-level lines appended to the source
 * @returns {object} the loaded rubric document
 */
function loadWithBudget(budgetLines) {
  const root = createTempDir();
  try {
    writeFileSync(join(root, "rubric.yaml"), `${REQUIRED_KEYS}\n${budgetLines}\n`);
    return loadRubric("rubric.yaml", { projectRoot: root });
  } finally {
    cleanupTempDir(root);
  }
}

/**
 * As {@link loadWithBudget}, but asserts the load threw and returns the error.
 *
 * @param {string} budgetLines - extra top-level lines appended to the source
 * @returns {Error} the error the load threw
 */
function loadWithBudgetExpectingThrow(budgetLines) {
  const root = createTempDir();
  try {
    writeFileSync(join(root, "rubric.yaml"), `${REQUIRED_KEYS}\n${budgetLines}\n`);
    return captureThrow(() => loadRubric("rubric.yaml", { projectRoot: root }));
  } finally {
    cleanupTempDir(root);
  }
}

test("a zero or negative budget is rejected, naming the offending key", () => {
  // fixture: budget_max_turns: 0, budget_max_cost_usd: -1
  const err = captureThrow(() =>
    loadRubric("tests/fixtures/evals/rubrics/invalid-budget-nonpositive.yaml", {
      projectRoot: repoRoot,
    }),
  );
  assert.equal(err.code, "RUBRIC_INVALID_BUDGET");
  assert.match(err.message, /budget_max_turns/);
});

test("a non-numeric budget is rejected, naming the offending key", () => {
  // separate fixture so the two failure modes cannot be confused: this one carries
  // budget_max_duration_ms: "twelve" and a quoted budget_max_cost_usd: "12".
  // parseYaml types scalars, so a quoted value arrives as a string and must fail —
  // a numeric-looking string is an authoring error, not something to coerce.
  const err = captureThrow(() =>
    loadRubric("tests/fixtures/evals/rubrics/invalid-budget-nonnumeric.yaml", {
      projectRoot: repoRoot,
    }),
  );
  assert.equal(err.code, "RUBRIC_INVALID_BUDGET");
  assert.match(err.message, /budget_max_duration_ms/);
});

test("a rubric declaring no budget keys at all loads — budgets are optional", () => {
  assert.ok(loadRubric("tests/fixtures/evals/rubrics/conforming.yaml", { projectRoot: repoRoot }));
});

// --- strengthening tests -----------------------------------------------------

test("a positive integer budget loads and round-trips as a number", () => {
  const loaded = loadWithBudget("budget_max_turns: 12");
  assert.equal(loaded.budget_max_turns, 12);
  assert.equal(typeof loaded.budget_max_turns, "number");
});

test("both offending keys are named, not only the first", () => {
  // The pass aggregates, the way assertRequiredKeysPresent does: an author who
  // fixes one budget key at a time pays a full reload per key otherwise.
  const err = captureThrow(() =>
    loadRubric("tests/fixtures/evals/rubrics/invalid-budget-nonpositive.yaml", {
      projectRoot: repoRoot,
    }),
  );
  assert.match(err.message, /budget_max_cost_usd/);
  assert.deepEqual(err.invalidBudgetKeys, ["budget_max_turns", "budget_max_cost_usd"]);
});

test("the error renders the offending value so a quoted number reads as a string", () => {
  const err = captureThrow(() =>
    loadRubric("tests/fixtures/evals/rubrics/invalid-budget-nonnumeric.yaml", {
      projectRoot: repoRoot,
    }),
  );
  assert.match(err.message, /"12"/);
});

test("booleans and null are rejected as budget values", () => {
  // parseYaml types `true` / `false` / `null` (and `~`), so all four reach the
  // budget pass as real non-numeric values rather than as strings.
  for (const literal of ["true", "false", "null", "~"]) {
    const err = loadWithBudgetExpectingThrow(`budget_max_turns: ${literal}`);
    assert.equal(err.code, "RUBRIC_INVALID_BUDGET");
    assert.match(err.message, /budget_max_turns/);
  }
});

test("NaN and Infinity spellings are rejected — as strings, the only route a YAML file has", () => {
  // There is no YAML literal that yields the NUMBERS NaN or Infinity through
  // this parser: parseInlineValue types integers via /^-?\d+$/ only, so `NaN`,
  // `nan`, `.inf`, `-.inf` and `Infinity` all arrive as strings. The number
  // forms are therefore unreachable from a rubric file and can only be probed
  // by calling the predicate directly, which is not what loadRubric exposes.
  // What IS reachable is asserted here; the guard against the numeric forms
  // lives in the implementation's `Number.isFinite` check.
  for (const literal of ["NaN", "nan", ".inf", "-.inf", "Infinity"]) {
    const err = loadWithBudgetExpectingThrow(`budget_max_turns: ${literal}`);
    assert.equal(err.code, "RUBRIC_INVALID_BUDGET");
    assert.match(err.message, /budget_max_turns/);
  }
});

test("a key that merely looks budget-ish is not a budget key and is not checked", () => {
  // Neither name matches BUDGET_KEY_PATTERN, so no value check applies to them
  // even though both carry values the pass would reject on a real budget key.
  assert.equal(BUDGET_KEY_PATTERN.test("budget_turns"), false);
  assert.equal(BUDGET_KEY_PATTERN.test("max_turns"), false);
  const loaded = loadWithBudget("budget_turns: 0\nmax_turns: -1");
  assert.equal(loaded.budget_turns, 0);
  assert.equal(loaded.max_turns, -1);
});

test("a float budget is rejected, because this repo's YAML reader hands it over as a string", () => {
  // PARSER LIMITATION, recorded deliberately: lib/profiles/yaml.mjs types bare
  // integers via /^-?\d+$/ and nothing else, so `budget_max_cost_usd: 0.5`
  // parses to the STRING "0.5", never the number 0.5. Against the rule "must be
  // a finite number greater than zero" that is a rejection — the loader will not
  // coerce a string, since coercion is exactly what makes a quoted "12" load
  // silently. The consequence is real and worth naming: a fractional budget is
  // currently UNWRITABLE in this repo's YAML subset. Fixing it means teaching
  // the reader to type floats (a change with blast radius well beyond rubrics),
  // not loosening this pass.
  const err = loadWithBudgetExpectingThrow("budget_max_cost_usd: 0.5");
  assert.equal(err.code, "RUBRIC_INVALID_BUDGET");
  assert.match(err.message, /budget_max_cost_usd/);
  assert.match(err.message, /"0\.5"/);
});
