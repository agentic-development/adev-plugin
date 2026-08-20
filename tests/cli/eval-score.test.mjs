import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const runVerb = (args, opts = {}) => {
  try {
    const stdout = execFileSync(process.execPath, ["cli/index.mjs", "eval", "score", ...args],
      { encoding: "utf8", ...opts });
    return { code: 0, stdout, stderr: "" };
  } catch (err) {
    return { code: err.status, stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
  }
};

const RUBRIC = "tests/fixtures/evals/rubrics/conforming.yaml";
const INPUT = "tests/fixtures/evals/verdicts/complete.json";

test("the default rendering emits the verdict table together with the aggregate", () => {
  const { code, stdout } = runVerb(["--rubric", RUBRIC, "--input", INPUT]);
  assert.equal(code, 0);
  assert.match(stdout, /spec_criteria_referenced/);
  assert.match(stdout, /separation_of_concerns/);
  assert.match(stdout, /deterministic/i);
  assert.match(stdout, /judged/i);
});

test("--json carries the table, both halves, and the total in one object", () => {
  const { code, stdout } = runVerb(["--rubric", RUBRIC, "--input", INPUT, "--json"]);
  assert.equal(code, 0);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.verdicts.length, 4);
  assert.ok("deterministic" in parsed && "judged" in parsed && "total" in parsed);
});

test("a half carrying a status renders by name, never as 0", () => {
  const { stdout } = runVerb(["--rubric", "tests/fixtures/evals/rubrics/no-quality-dimensions.yaml",
    "--input", "tests/fixtures/evals/verdicts/elements-only.json"]);
  assert.match(stdout, /NOT_SCORED/);
  assert.doesNotMatch(stdout, /judged\s*[:|]\s*0\b/i);
});

test("a traversal path on --rubric exits non-zero, names the path, and reads nothing", () => {
  const { code, stderr } = runVerb(["--rubric", "../../../etc/passwd", "--input", INPUT]);
  assert.notEqual(code, 0);
  assert.match(stderr, /UNSAFE_SCORE_PATH/);
  assert.match(stderr, /\.\.\/\.\.\/\.\.\/etc\/passwd/, "the offending path is reported verbatim");
});

test("a traversal path on --input is refused the same way", () => {
  const { code, stderr } = runVerb(["--rubric", RUBRIC, "--input", "../../../etc/passwd"]);
  assert.notEqual(code, 0);
  assert.match(stderr, /UNSAFE_SCORE_PATH/);
});

test("a contained but missing --input exits non-zero with SCORE_INPUT_NOT_FOUND", () => {
  const { code, stderr } = runVerb(["--rubric", RUBRIC, "--input", "tests/fixtures/evals/verdicts/absent.json"]);
  assert.notEqual(code, 0);
  assert.match(stderr, /SCORE_INPUT_NOT_FOUND/);
  assert.match(stderr, /absent\.json/);
});

test("an engine rejection surfaces its code and exits non-zero", () => {
  const { code, stderr } = runVerb(["--rubric", RUBRIC, "--input", "tests/fixtures/evals/verdicts/unsafe-input.json"]);
  assert.notEqual(code, 0);
  assert.match(stderr, /SCORE_(EMPTY_EVIDENCE|MISSING_VERDICT|UNKNOWN_VERDICT_ID)/);
});
