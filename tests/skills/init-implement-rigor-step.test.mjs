import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PLUGIN_ROOT } from "../helpers.mjs";

const content = readFileSync(
  join(PLUGIN_ROOT, "skills", "init", "references", "behavior-by-project-state.md"),
  "utf8",
);

function section() {
  const start = content.indexOf("### Step 8c: Implement rigor");
  assert.ok(start > -1, "Step 8c (implement rigor) heading not found");
  const end = content.indexOf("Step 9/11", start);
  assert.ok(end > start, "Step 8c must precede Step 9");
  return content.substring(start, end);
}

test("the implement-rigor step follows the implementation-mode step", () => {
  const step8b = content.indexOf("### Step 8b: Implementation mode");
  assert.ok(step8b > -1);
  assert.ok(content.indexOf("### Step 8c: Implement rigor") > step8b);
});

test("the step shows the lite / quick / full menu under the /11 denominator", () => {
  const s = section();
  assert.match(s, /Step 8c\/11: Implement Rigor/);
  for (const choice of ["lite", "quick", "full"]) {
    assert.match(s, new RegExp(`^\\s*- ${choice}\\s`, "m"), `menu must list ${choice}`);
  }
});

test("the step delegates to the verb", () => {
  assert.match(section(), /Invoke `adev init prompt implement-rigor` to drive this step/);
});

test("the step runs for every risk_tier preset and on re-runs", () => {
  const s = section();
  assert.match(s, /every `risk_tier` preset/);
  for (const preset of ["prototype", "standard", "strict"]) assert.match(s, new RegExp(`\`${preset}\``));
  assert.match(s, /re-run/i);
});

test("the step states all choice, validation and write logic lives in the verb", () => {
  assert.match(section(), /choice, validation(,)? and write logic/);
  assert.match(section(), /verb is the single source of truth/);
});

test("the step passes the operator's typed answer verbatim as --mode", () => {
  const s = section();
  assert.match(s, /`adev init prompt implement-rigor --mode <answer>`/);
  assert.match(s, /verbatim/);
  assert.match(s, /no TTY/);
});

test("the step re-asks on INVALID_IMPLEMENT_RIGOR, up to 3 attempts in total", () => {
  assert.match(section(), /INVALID_IMPLEMENT_RIGOR.*ask again.*3 attempts in total/is);
});

test("the step runs without --mode only when no operator can answer", () => {
  assert.match(section(), /without `--mode` only when no operator can answer/);
});

test("the step does not tell the agent to pick lite on its behalf", () => {
  const s = section();
  assert.doesNotMatch(s, /adev init prompt implement-rigor --mode lite/);
  assert.match(s, /[Nn]ever supply `lite` on the operator's behalf/);
});
