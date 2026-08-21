import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(p) {
  return readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
}

test("docs/cli-reference.md documents adev implement resolve-depth", () => {
  const md = read("docs/cli-reference.md");
  assert.match(md, /adev implement resolve-depth/);
});

test("docs/skill-reference.md documents /adev:implement's --tier and --review-cycles flags", () => {
  const md = read("docs/skill-reference.md");
  const section = md.slice(md.indexOf("/adev:implement"));
  assert.match(section, /--tier/);
  assert.match(section, /--review-cycles/);
});

test("docs/cli-reference.md documents the resolve-depth exit codes and error codes", () => {
  const doc = read("docs/cli-reference.md");
  assert.match(doc, /INVALID_REVIEW_CYCLES/);
  assert.match(doc, /INVALID_SPEC_PATH/);
  assert.match(doc, /INVALID_PLAN_PATH/);
  assert.match(doc, /INVALID_TIER/);
  assert.match(doc, /MISSING_DIFF_RANGE/);
  assert.match(doc, /ROUTING_SIDECAR_MISSING/);
  assert.match(doc, /ROUTING_ENTRY_MISSING/);
});
