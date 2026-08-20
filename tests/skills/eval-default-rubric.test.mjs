/**
 * Guards the /adev:eval Layer 3 rubric contract.
 *
 * The bug these tests exist for: skills/eval/SKILL.md documented a default
 * rubric for Layer 3 and `rubric: default` in its config block, but no rubric
 * file shipped. Layer 3 was prose an agent improvised against, so scores were
 * not comparable across runs.
 *
 * The tests therefore derive the rubric path FROM SKILL.md rather than
 * hardcoding it — a test that only asserts `skills/eval/default-rubric.yaml`
 * exists would still pass if the skill later pointed somewhere else, which is
 * the exact drift being fixed.
 *
 * The derivation is anchored to the sentence that DEFINES what the `default`
 * keyword resolves to ("The shipped default rubric is `<path>` — that is what
 * the `default` keyword resolves to"), not to the first `skills/eval/*.yaml`
 * substring anywhere in the file. SKILL.md mentions rubric paths in more than
 * one place — the config-block comment, override examples — so an unanchored
 * match is incidental: it is not tied to the definition being guarded, and it
 * silently stops guarding it. A miss degrades quietly (empty match → sentinel
 * path → empty rubric → vacuous passes), so a dedicated assertion below fails
 * loudly when the defining sentence is absent or reworded.
 *
 * Pattern: tests/skills/skill-integration-preflight.test.mjs
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PLUGIN_ROOT } from "../helpers.mjs";
import { parseYaml } from "../../lib/profiles/yaml.mjs";

const SKILL_PATH = join(PLUGIN_ROOT, "skills", "eval", "SKILL.md");
const skill = readFileSync(SKILL_PATH, "utf8");

/** Top-level keys the skill promises every rubric (default or --rubric) carries. */
const REQUIRED_KEYS = [
  "rubric_id",
  "version",
  "layer",
  "verdict_values",
  "required_elements",
  "quality_dimensions",
  "layer3_max_points",
  "required_element_points",
  "judged_criterion_points",
  "unknown_policy",
  "not_applicable_policy",
  "insufficient_evidence_threshold_percent",
];

/**
 * The sentence in SKILL.md that defines what the `default` keyword resolves
 * to. The captured group is the rubric path it names. Anchoring on both
 * halves — the "shipped default rubric is <path>" clause and the "`default`
 * keyword resolves to" clause — is what stops an unrelated `skills/eval/*.yaml`
 * mention elsewhere in the file from standing in for the definition.
 */
const KEYWORD_DEFINITION_PATTERN =
  /The shipped default rubric is `(?:<ADEV_ROOT>\/)?(skills\/eval\/[A-Za-z0-9._-]+\.ya?ml)`[\s\S]{0,120}?`default` keyword resolves to/;

/**
 * Pull the documented default-rubric path out of SKILL.md prose, reading it
 * from the keyword-definition sentence only. Accepts an optional
 * `<ADEV_ROOT>/` prefix and returns a plugin-root-relative path, or the empty
 * string when SKILL.md carries no such definition.
 */
function documentedRubricPath(text = skill) {
  const m = text.match(KEYWORD_DEFINITION_PATTERN);
  return m ? m[1] : "";
}

const RUBRIC_REL = documentedRubricPath();
const RUBRIC_ABS = join(PLUGIN_ROOT, RUBRIC_REL || "skills/eval/__missing__");
const rubricRaw = existsSync(RUBRIC_ABS) ? readFileSync(RUBRIC_ABS, "utf8") : "";
const rubric = rubricRaw ? parseYaml(rubricRaw) : {};

/** Collect every value in the rubric that is a nested structure. */
function nestedValueViolations(doc) {
  const violations = [];
  for (const [key, value] of Object.entries(doc)) {
    const isList = Array.isArray(value);
    const isMap = value !== null && typeof value === "object" && !isList;
    if (isMap) violations.push(`top-level key ${key} is a nested map`);
    const items = isList ? value : [];
    for (const item of items) {
      const props = item !== null && typeof item === "object" ? item : {};
      for (const [k, v] of Object.entries(props)) {
        const nested = v !== null && typeof v === "object";
        if (nested) violations.push(`${key}[].${k} is a nested structure`);
      }
    }
  }
  return violations;
}

describe("eval SKILL.md — default rubric is a real file", () => {
  it("anchors the documented path to the sentence defining `default` (+2 more contract assertions)", () => {
    // SKILL.md still carries the sentence that defines what `default` resolves
    // to. Without it every assertion below degrades to a vacuous pass, so this
    // is the guard that keeps the rest of the suite load-bearing.
    assert.match(
      skill,
      KEYWORD_DEFINITION_PATTERN,
      "skills/eval/SKILL.md must state what the `default` rubric keyword resolves to, in the form: The shipped default rubric is `<ADEV_ROOT>/skills/eval/<file>.yaml` — that is what the `default` keyword resolves to",
    );

    // The anchor is specific, not incidental: a rubric path mentioned outside
    // the defining sentence must not be mistaken for the definition.
    assert.equal(
      documentedRubricPath(
        "Pass `--rubric skills/eval/custom-rubric.yaml` to override the shipped rubric.",
      ),
      "",
      "documentedRubricPath must ignore skills/eval/*.yaml mentions outside the keyword-definition sentence",
    );

    // ...and it genuinely reads the path from that sentence rather than
    // hardcoding today's filename.
    assert.equal(
      documentedRubricPath(
        "The shipped default rubric is `<ADEV_ROOT>/skills/eval/relocated.yaml` — that is what the\n`default` keyword resolves to, not a value to type on the command line.",
      ),
      "skills/eval/relocated.yaml",
      "documentedRubricPath must derive the path from the defining sentence",
    );
  });

  it("documents a default rubric path (+1 more contract assertions)", () => {
    // documents a default rubric path
    assert.notEqual(
    RUBRIC_REL,
    "",
    "skills/eval/SKILL.md must name a shipped default rubric path under skills/eval/",
    );

    // the documented default rubric file exists on disk
    assert.equal(
    existsSync(RUBRIC_ABS),
    true,
    `SKILL.md documents ${RUBRIC_REL || "<nothing>"} but no such file ships with the plugin`,
    );
  });

  it("the default rubric parses as YAML", () => {
    assert.doesNotThrow(
      () => parseYaml(rubricRaw),
      `${RUBRIC_REL} is not parseable YAML`,
    );
    assert.notEqual(rubricRaw, "", "rubric file is empty or unreadable");
  });

  it("the default rubric carries every required top-level key", () => {
    const missing = REQUIRED_KEYS.filter(
      (k) => !Object.prototype.hasOwnProperty.call(rubric, k),
    );
    assert.deepEqual(
      missing,
      [],
      `${RUBRIC_REL} is missing required top-level keys: ${missing.join(", ")}`,
    );
  });

  it("SKILL.md documents every top-level key the rubric provides", () => {
    // Bidirectional: the documented contract and the shipped file must agree
    // in both directions, so neither a missing key nor an undocumented extra
    // key can drift in unnoticed.
    const undocumented = Object.keys(rubric).filter(
      (k) => !skill.includes(`\`${k}\``),
    );
    assert.deepEqual(
      undocumented,
      [],
      `SKILL.md does not document rubric keys: ${undocumented.join(", ")}`,
    );
    const unshipped = REQUIRED_KEYS.filter(
      (k) => !Object.prototype.hasOwnProperty.call(rubric, k),
    );
    assert.deepEqual(
      unshipped,
      [],
      `SKILL.md documents keys the rubric does not ship: ${unshipped.join(", ")}`,
    );
  });

  it("stays flat — the repo's minimal YAML readers do not parse nested maps", () => {
    assert.deepEqual(
      nestedValueViolations(rubric),
      [],
      `${RUBRIC_REL} must use flat scalars and lists of flat objects only`,
    );
  });
});

describe("eval Layer 3 — binary verdicts, not numeric scales", () => {
  it("every judged criterion is a single reference-anchored yes/no question", () => {
    assert.ok(
      rubric.quality_dimensions.length > 0,
      "rubric declares no judged criteria",
    );
    const fields = [
      "id",
      "criterion",
      "reference",
      "met_when",
      "not_met_when",
      "unknown_when",
    ];
    const missing = rubric.quality_dimensions.flatMap((d) =>
      fields
        .filter((f) => !(typeof d[f] === "string" && d[f].length > 0))
        .map((f) => `${d.id ?? "<unnamed>"}.${f}`),
    );
    assert.deepEqual(missing, [], `judged criteria missing fields: ${missing}`);
  });

  it("every deterministic element names its source and met condition", () => {
    assert.ok(
      rubric.required_elements.length > 0,
      "rubric declares no deterministic required_elements",
    );
    const fields = ["id", "description", "source", "met_when"];
    const missing = rubric.required_elements.flatMap((e) =>
      fields
        .filter((f) => !(typeof e[f] === "string" && e[f].length > 0))
        .map((f) => `${e.id ?? "<unnamed>"}.${f}`),
    );
    assert.deepEqual(
      missing,
      [],
      `required_elements missing fields: ${missing}`,
    );
  });

  it("declares the three-verdict vocabulary including the unknown escape hatch (+2 more contract assertions)", () => {
    // declares the three-verdict vocabulary including the unknown escape hatch
    assert.match(String(rubric.verdict_values), /\bmet\b/);
    assert.match(String(rubric.verdict_values), /\bnot_met\b/);
    assert.match(String(rubric.verdict_values), /\bunknown\b/);

    // SKILL.md instructs judges to return UNKNOWN rather than guess
    assert.match(skill, /VERDICT: UNKNOWN/);
    assert.match(
    skill,
    /Absence of (evidence|information) is never `?NOT_MET`?/i,
    "SKILL.md must state that absence of evidence is never NOT_MET",
    );

    // SKILL.md dispatches one judge per criterion, never a bundle
    assert.match(
    skill,
    /One criterion per judge dispatch/i,
    "SKILL.md must state the one-criterion-per-judge rule",
    );
    assert.match(
    skill,
    /Never bundle criteria/i,
    "SKILL.md must forbid bundling criteria into one prompt",
    );
    assert.match(
    skill,
    /\*\*separate\*\* reviewer subagent/i,
    "SKILL.md must dispatch a separate reviewer subagent per criterion",
    );
  });

  it("SKILL.md no longer asks a judge for a numeric score", () => {
    const layer3 = skill.slice(
      skill.indexOf("## Layer 3"),
      skill.indexOf("## Layer 4"),
    );
    assert.ok(layer3.length > 0, "Layer 3 section not found");
    assert.doesNotMatch(
      layer3,
      /\(0-5\)|score each dimension 0-5|sum of sub-scores/i,
      "Layer 3 still asks the judge for a 0-5 score",
    );
  });

  it("keeps a documented numeric aggregate for trend tracking only", () => {
    assert.equal(rubric.layer3_max_points, 25, "Layer 3 must still cap at 25");
    assert.equal(
      rubric.required_element_points + rubric.judged_criterion_points,
      rubric.layer3_max_points,
      "point budgets must sum to layer3_max_points",
    );
    // Whole percent, not a 0-1 ratio: the repo's zero-dependency YAML readers
    // parse integers only, so a float would silently load as a string.
    assert.equal(
      typeof rubric.insufficient_evidence_threshold_percent,
      "number",
      "insufficient_evidence_threshold_percent must parse as a number, not a string",
    );
    assert.ok(
      Number.isInteger(rubric.insufficient_evidence_threshold_percent) &&
        rubric.insufficient_evidence_threshold_percent > 0 &&
        rubric.insufficient_evidence_threshold_percent < 100,
      "insufficient_evidence_threshold_percent must be a whole percent between 1 and 99",
    );
    assert.match(
      skill,
      /trend tracking only/i,
      "SKILL.md must state the aggregate is for trend tracking only",
    );
    assert.match(
      skill,
      /INSUFFICIENT_EVIDENCE/,
      "SKILL.md must document the insufficient-evidence guard",
    );
  });
});

describe("eval SKILL.md — constitution compliance", () => {
  it("contains no inline-Node execution directives (+1 more contract assertions)", () => {
    // contains no inline-Node execution directives
    assert.doesNotMatch(
    skill,
    /node -e|node --input-type=module|Run inline Node/,
    "SKILL.md must not contain executable inline-Node directives",
    );

    // uses <ADEV_ROOT> rather than a hardcoded plugin path
    assert.doesNotMatch(skill, /~\/\.claude\/|\/Users\/[^/]+\/\.claude\//);
  });
});
