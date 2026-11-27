import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { helpExitCodes, helpOptionalGroups, helpSynopsisFlags, implementHelp } from "./implement-help.mjs";

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

function resolveDepthSection(doc) {
  const heading = "#### `implement resolve-depth`\n";
  const start = doc.indexOf(heading);
  assert.ok(start !== -1, "missing `implement resolve-depth` heading");
  const rest = doc.slice(start + heading.length);
  const next = rest.search(/^#{1,4} /m);
  return next === -1 ? rest : rest.slice(0, next);
}

test("resolve-depth signature carries every flag --help lists and drops --in-batch", () => {
  const help = implementHelp();
  const s = resolveDepthSection(read("docs/cli-reference.md"));
  const signature = s.split("```")[1];
  assert.ok(signature, "resolve-depth has a fenced signature");
  for (const flag of helpSynopsisFlags(help, "resolve-depth")) assert.ok(signature.includes(flag), `flag ${flag}`);
  for (const group of helpOptionalGroups(help, "resolve-depth"))
    assert.ok(signature.includes(group), `optional group ${group}`);
  assert.match(signature, /--run-base <sha>/);
  assert.doesNotMatch(signature, /--in-batch/);
  for (const line of s.split("\n").filter((l) => l.includes("--in-batch")))
    assert.match(line, /accepted and ignored/, line);
});

test("resolve-depth documents every exit code --help lists", () => {
  const help = implementHelp();
  const s = resolveDepthSection(read("docs/cli-reference.md"));
  const codes = helpExitCodes(help, "resolve-depth");
  assert.ok(codes.length > 0, "--help lists resolve-depth exit codes");
  for (const code of codes) assert.ok(s.includes(code), `exit code ${code}`);
});

test("resolve-depth documents its output fields, source values and warnings", () => {
  const s = resolveDepthSection(read("docs/cli-reference.md"));
  for (const field of ["lite_denied", "lite_source", "escalated_from", "review_cycles"])
    assert.ok(s.includes(`\`${field}\``), field);
  for (const v of ["not-authorized", "routing-scores", "high-risk", "floor:<leg>", "parallel"])
    assert.ok(s.includes(`\`${v}\``), v);
  for (const src of ["tier-full-absolute", "policy-baseline", "default-quick", "lite-grant", "lite-tripwire"])
    assert.ok(s.includes(`\`${src}\``), src);
  for (const w of ["LITE_TRIPWIRE_ESCALATED", "ROUTING_SIDECAR_MISSING", "ROUTING_SCORE_OUT_OF_RANGE", "REVIEW_DEPTH_FLOOR_APPLIED"])
    assert.ok(s.includes(w), w);
  assert.doesNotMatch(s, /predicate-grant|quick-grant/);
});

test("docs/skill-reference.md documents the three-level --tier on /adev:implement", () => {
  const md = read("docs/skill-reference.md");
  const start = md.indexOf("### `/adev:implement`");
  const section = md.slice(start, md.indexOf("\n### ", start + 1));
  assert.match(section, /- `--tier <full\|quick\|lite>`:/);
  assert.doesNotMatch(section, /quick-grant predicate/);
});
