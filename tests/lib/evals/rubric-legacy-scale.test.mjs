/**
 * BEH-8 — a rubric carrying numeric `weight` values on its judged criteria is a
 * PRE-MIGRATION rubric and is refused, never coerced into binary verdicts.
 *
 * Review note SA-1 fixes the trigger: the PRESENCE of a numeric `weight` on a
 * `quality_dimensions` entry, NOT a 1-5 range check. The binary-verdict schema
 * declares no `weight` field at all, so any numeric weight is by definition
 * legacy — and a range check would wave a 1-10 or 0-1 rescaling straight
 * through.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { captureThrow, cleanupTempDir, createTempDir, PLUGIN_ROOT } from "../../helpers.mjs";
import { loadRubric } from "../../../lib/evals/rubric.mjs";

// The fixture paths below are relative to the repository root, which is what
// PLUGIN_ROOT resolves to.
const repoRoot = PLUGIN_ROOT;

/**
 * Build a one-off rubric source that clears every earlier pass — all twelve
 * required top-level keys, one complete element and one complete criterion —
 * with caller-supplied extra lines spliced into whichever entry the case exists
 * to probe.
 *
 * @param {object} [extras]
 * @param {string[]} [extras.elementExtra] - extra lines on the `required_elements` entry
 * @param {string[]} [extras.criterionExtra] - extra lines on the `quality_dimensions` entry
 * @returns {string} the rubric source
 */
function buildSource({ elementExtra = [], criterionExtra = [] } = {}) {
  return [
    'rubric_id: "x"',
    "version: 1",
    "layer: 3",
    'verdict_values: "met | not_met | unknown"',
    "required_elements:",
    "  - id: e1",
    '    source: "the diff file list"',
    '    met_when: "no changed source file lacks a corresponding test change"',
    ...elementExtra.map((line) => `    ${line}`),
    "quality_dimensions:",
    "  - id: c1",
    '    criterion: "is every new symbol legible from its signature alone"',
    '    reference: "the matched golden sample"',
    '    met_when: "every new symbol reads clearly"',
    '    not_met_when: "at least one new symbol does not"',
    '    unknown_when: "no golden sample exists"',
    ...criterionExtra.map((line) => `    ${line}`),
    "layer3_max_points: 25",
    "required_element_points: 10",
    "judged_criterion_points: 15",
    'unknown_policy: "exclude_from_denominator"',
    'not_applicable_policy: "exclude_from_denominator"',
    "insufficient_evidence_threshold_percent: 40",
  ].join("\n");
}

/**
 * Load a one-off rubric built by {@link buildSource} from a throwaway root.
 * Built inline rather than as an on-disk fixture: these shapes exist to probe
 * the trigger's exact edges, and no later suite should copy them.
 *
 * @param {object} [extras] - forwarded to {@link buildSource}
 * @returns {object} the loaded rubric document
 */
function loadInline(extras) {
  const root = createTempDir();
  try {
    writeFileSync(join(root, "rubric.yaml"), `${buildSource(extras)}\n`);
    return loadRubric("rubric.yaml", { projectRoot: root });
  } finally {
    cleanupTempDir(root);
  }
}

/**
 * As {@link loadInline}, but asserts the load threw and returns the error.
 *
 * @param {object} [extras] - forwarded to {@link buildSource}
 * @returns {Error} the error the load threw
 */
function loadInlineExpectingThrow(extras) {
  const root = createTempDir();
  try {
    writeFileSync(join(root, "rubric.yaml"), `${buildSource(extras)}\n`);
    return captureThrow(() => loadRubric("rubric.yaml", { projectRoot: root }));
  } finally {
    cleanupTempDir(root);
  }
}

test("a numeric weight on a quality dimension is rejected with a migration message", () => {
  const err = captureThrow(() =>
    loadRubric("tests/fixtures/evals/rubrics/legacy-weight-scale.yaml", { projectRoot: repoRoot }),
  );
  assert.equal(err.code, "RUBRIC_LEGACY_SCALE");
  assert.match(err.message, /binary verdict/i); // names the migration, per BEH-8
});

test("the scale is never coerced — no partially migrated rubric comes back", () => {
  assert.throws(() =>
    loadRubric("tests/fixtures/evals/rubrics/legacy-weight-scale.yaml", { projectRoot: repoRoot }),
  );
});

test("detection triggers on a numeric weight of any range, not only 1-5", () => {
  // SA-1: the trigger is the presence of a numeric `weight` on a judged criterion,
  // because the binary-verdict schema has no `weight` field at all. A 1-10 or 0-1
  // rescaling is just as legacy as a 1-5 one.
  const err = captureThrow(() =>
    loadRubric("tests/fixtures/evals/rubrics/legacy-weight-scale.yaml", { projectRoot: repoRoot }),
  );
  assert.equal(err.code, "RUBRIC_LEGACY_SCALE");
});

// --- strengthening tests -----------------------------------------------------

test("every offending criterion is named, not only the first", () => {
  // The fixture's out-of-range `weight: 9` entry must appear alongside the
  // in-range `weight: 3` one: aggregating is what stops an author paying a
  // reload per criterion while migrating a whole rubric.
  const err = captureThrow(() =>
    loadRubric("tests/fixtures/evals/rubrics/legacy-weight-scale.yaml", { projectRoot: repoRoot }),
  );
  assert.deepEqual(err.entryIds, ["readability_naming", "separation_of_concerns"]);
  assert.deepEqual(err.legacyWeights, { readability_naming: 3, separation_of_concerns: 9 });
  assert.match(err.message, /readability_naming/);
  assert.match(err.message, /separation_of_concerns/);
});

test("a weight of zero is legacy too — zero is a number, and the schema has no weight field", () => {
  const err = loadInlineExpectingThrow({ criterionExtra: ["weight: 0"] });
  assert.equal(err.code, "RUBRIC_LEGACY_SCALE");
  assert.deepEqual(err.legacyWeights, { c1: 0 });
});

test("a fractional weight slips through, because this repo's YAML reader hands it over as a string", () => {
  // PARSER LIMITATION, recorded deliberately (the same one
  // tests/lib/evals/rubric-budget-keys.test.mjs pins for budgets):
  // lib/profiles/yaml.mjs types bare integers via /^-?\d+$/ and nothing else,
  // so `weight: 0.5` parses to the STRING "0.5", never the number 0.5. SA-1
  // scopes the trigger to a NUMERIC weight, so this pass does not fire and the
  // rubric loads with a vestigial string key. Widening the trigger to strings is
  // not the fix — a string `weight` is indistinguishable from any other unknown
  // extra entry field, which the loader leaves alone by design. The real fix is
  // teaching the reader to type floats, whose blast radius reaches well beyond
  // rubrics.
  const loaded = loadInline({ criterionExtra: ["weight: 0.5"] });
  assert.equal(loaded.quality_dimensions[0].weight, "0.5");
  assert.equal(typeof loaded.quality_dimensions[0].weight, "string");
});

test("a non-numeric weight is NOT treated as legacy", () => {
  // SA-1 scopes the trigger to a NUMERIC weight. `weight: "heavy"` carries no
  // scale to migrate away from, and rejecting it would be this pass guessing an
  // author's intent from a key name alone — extra entry fields are otherwise
  // unpoliced (the shipped rubric's `not_applicable_when` is one). It loads, and
  // the key is simply ignored downstream.
  const loaded = loadInline({ criterionExtra: ['weight: "heavy"'] });
  assert.equal(loaded.quality_dimensions[0].weight, "heavy");
});

test("a weight on a required_elements entry is NOT treated as legacy", () => {
  // SA-1 scopes the trigger to JUDGED criteria. A deterministic element is not
  // scored on a scale at all — it is met / not_met / not_applicable — so a
  // weight there is meaningless rather than pre-migration, and keeping the pass
  // narrow is what makes its error always mean the one thing it says it means.
  const loaded = loadInline({ elementExtra: ["weight: 4"] });
  assert.equal(loaded.required_elements[0].weight, 4);
  assert.equal(loaded.quality_dimensions[0].weight, undefined);
});

test("conforming.yaml still loads — it carries no weight anywhere", () => {
  const rubric = loadRubric("tests/fixtures/evals/rubrics/conforming.yaml", {
    projectRoot: repoRoot,
  });
  assert.equal(rubric.rubric_id, "fixture-conforming");
  assert.ok(rubric.quality_dimensions.every((d) => d.weight === undefined));
});

test("the shipped default rubric loads — its vestigial weight: 1 lines are gone", () => {
  // Regression guard for the five `weight: 1` lines deleted from
  // skills/eval/default-rubric.yaml. That file's own header states its
  // quality_dimensions are BINARY (met / not_met / unknown) and calls that a
  // deliberate deviation from the older weighted-scale pattern, so a uniform
  // weight of 1 on every entry was left-over scaffolding from the pattern the
  // file says it departs from — and carried no information even if it were
  // read.
  const rubric = loadRubric("skills/eval/default-rubric.yaml", { projectRoot: repoRoot });
  assert.ok(rubric.quality_dimensions.length > 0);
  assert.ok(rubric.quality_dimensions.every((d) => d.weight === undefined));
});

test("a conforming-but-weighted synthetic fixture is refused for the weight itself, not a coincidental earlier pass", () => {
  // The real tests/evals/skill-compression/rubrics/plan.yaml this test used to
  // target was a legacy weighted rubric (quality_dimensions carrying
  // weight: 2, 1.5, ...) but it never reached the legacy-weight-scale pass: it
  // declared only `skill`, `scenario`, `required_elements` and
  // `quality_dimensions` — so it would fail the REQUIRED-KEY pass — and,
  // earlier still, carried a nested `scoring:` block the NESTING pass rejects
  // first. That file is gone (rubric-set-core-lifecycle.plan.md Task 6
  // retired the tree it lived in); tests/fixtures/evals/rubrics/
  // legacy-weight-scale.yaml is the purpose-built synthetic stand-in this
  // test now targets instead — conforming except for its weights, with no
  // `scoring:` block and every required key present, so it reaches the
  // legacy-weight-scale pass and is refused for exactly the reason its name
  // says, not for an earlier structural defect. (The pass-ordering claim the
  // old target's `scoring:` block used to carry is preserved separately,
  // below, against a fixture built to keep that claim falsifiable.)
  const err = captureThrow(() =>
    loadRubric("tests/fixtures/evals/rubrics/legacy-weight-scale.yaml", { projectRoot: repoRoot }),
  );
  assert.equal(err.code, "RUBRIC_LEGACY_SCALE");
  assert.match(err.message, /weight/);
});

test("nesting is checked before the legacy-weight scale", () => {
  // The retargeted test above proves refusal on a fixture with no `scoring:`
  // block, which cannot carry the pass-ordering claim the original
  // skill-compression/rubrics/plan.yaml target used to prove: that nesting is
  // checked BEFORE the legacy-weight scale, so a composite legacy rubric
  // (nested scoring: block AND weighted quality_dimensions) never reaches
  // RUBRIC_LEGACY_SCALE at all — it is rejected earlier, for a different
  // reason. tests/fixtures/evals/rubrics/legacy-composite-shape.yaml
  // reproduces that composite shape (see its own header for the full
  // rationale) specifically so this ordering claim stays falsifiable now
  // that the real composite input is gone.
  const err = captureThrow(() =>
    loadRubric("tests/fixtures/evals/rubrics/legacy-composite-shape.yaml", { projectRoot: repoRoot }),
  );
  assert.equal(err.code, "RUBRIC_NESTED_MAP");
  assert.notEqual(err.code, "RUBRIC_LEGACY_SCALE");
  assert.match(err.message, /scoring/);
});

test("token-budget-eval's two suites are discovered at their relocated path, never at the old one", () => {
  // rubric-set-core-lifecycle.plan.md Task 5 relocates
  // tests/evals/skill-compression/token-budget-eval/ to
  // tests/evals/token-optimization/token-budget-eval/, ahead of Task 6
  // retiring the skill-compression tree entirely. `--evals --list` is the
  // discovery surface tests/test-discovery.test.mjs's bucket-partition
  // assertion depends on; this proves the relocation is visible there, not
  // merely that the files exist on disk at the new path.
  const output = execFileSync(process.execPath, [join(PLUGIN_ROOT, "scripts", "run-tests.mjs"), "--evals", "--list"], {
    cwd: PLUGIN_ROOT,
    encoding: "utf8",
  });
  assert.ok(
    output.trim().length > 0,
    "scripts/run-tests.mjs --evals --list produced no output — cannot trust the path assertions below",
  );
  const newPaths = [
    "tests/evals/token-optimization/token-budget-eval/token-budget-eval.test.mjs",
    "tests/evals/token-optimization/token-budget-eval/real-token-analysis.test.mjs",
  ];
  const oldPaths = [
    "tests/evals/skill-compression/token-budget-eval/token-budget-eval.test.mjs",
    "tests/evals/skill-compression/token-budget-eval/real-token-analysis.test.mjs",
  ];
  for (const p of newPaths) {
    assert.ok(output.includes(p), `--evals --list must list the relocated suite at ${p}, output: ${JSON.stringify(output)}`);
  }
  for (const p of oldPaths) {
    assert.ok(!output.includes(p), `--evals --list must not list the pre-relocation path ${p} any more, output: ${JSON.stringify(output)}`);
  }
});
