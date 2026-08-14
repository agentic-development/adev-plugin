// tests/skills/route.test.mjs
//
// Architectural test for skills/route/SKILL.md.
//
// Spec: .context-index/specs/features/agent-reliable-state-artifacts/plan-routing-sidecar.spec.md
//       Behavior 1; Red Flag tightening; cli-driver-surface boundary.
// Plan-task: t5
//
// /adev:route MUST write routing decisions to <plan-stem>.routing.json via the
// `adev route emit-sidecar` CLI verb. The plan body MUST NOT be mutated.
// (Per plan-routing-sidecar.spec.md rev 2, the sidecar is JSON, not markdown.)

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const SKILL_PATH = "skills/route/SKILL.md";

test("/adev:route Step 4 names `adev route emit-sidecar`", () => {
  const md = readFileSync(SKILL_PATH, "utf8");
  assert.match(
    md,
    /adev route emit-sidecar/,
    "Step 4 must invoke the named CLI verb (cli-driver-surface charter)",
  );
});

test("/adev:route Step 4 references the <plan-stem>.routing.json sidecar", () => {
  const md = readFileSync(SKILL_PATH, "utf8");
  assert.match(md, /routing\.json/, "Step 4 must reference the JSON sidecar file");
});

test("/adev:route Step 4 references the render-sidecar CLI verb for the markdown view", () => {
  const md = readFileSync(SKILL_PATH, "utf8");
  assert.match(
    md,
    /adev route render-sidecar/,
    "Step 4 prose must point operators at the on-demand markdown view",
  );
});

test("/adev:route does NOT instruct appending Routing blocks to the plan body", () => {
  const md = readFileSync(SKILL_PATH, "utf8");
  assert.doesNotMatch(
    md,
    /append.{0,40}(routing\s+(metadata|annotations|blocks?)|to\s+(each\s+task|the\s+plan)).{0,40}plan/i,
    "Step 4 must not instruct mutating the plan body with Routing annotations",
  );
});

test("/adev:route has a Red Flag section that forbids inline Routing blocks", () => {
  const md = readFileSync(SKILL_PATH, "utf8");
  assert.match(md, /Red Flag/i);
  // The tightened Red Flag must explicitly forbid mutating the plan body
  // with inline **Routing:** / **Scores:** / **Rationale:** blocks.
  // Match defensively: presence of the prohibition phrase near the words
  // "inline" and "Routing" within the Red Flags section.
  const redFlagsBlockMatch = md.match(/##\s*Red Flags[\s\S]+/i);
  assert.ok(redFlagsBlockMatch, "Red Flags section must exist");
  const redFlagsBlock = redFlagsBlockMatch[0];
  assert.match(
    redFlagsBlock,
    /inline.{0,40}\*\*Routing:\*\*|never.{0,40}mutate.{0,40}plan/i,
    "Red Flags section must explicitly forbid inline Routing blocks or plan mutation",
  );
});

test("/adev:route never claims its output is written to the plan file", () => {
  const md = readFileSync(SKILL_PATH, "utf8");
  // Guards the prose that survived the Step 4 rewrite: the arguments list,
  // the Step 5 report template, and the dry-run section all used to describe
  // the non-dry-run path as "writing annotations to the plan file". A reader
  // (human or agent) following that sentence reintroduces the CON-8 violation.
  // `<plan-stem>.routing.json` is the correct destination and must not trip
  // these guards, so each pattern pins the *plan file/body* as the target.
  assert.doesNotMatch(
    md,
    /(annotations?|scores?|routing)[^.\n]{0,60}(written|added)\s+to\s+(the\s+)?<?plan(\s+file|\s+body|>)/i,
    "Skill prose must not describe routing output as written to the plan file",
  );
  assert.doesNotMatch(
    md,
    /without\s+writing\s+annotations?\s+to\s+the\s+plan/i,
    "The --dry-run description must contrast against the sidecar, not the plan file",
  );
});

test("/adev:route Step 4 documents the 1-5 to 0..1 score normalization", () => {
  const md = readFileSync(SKILL_PATH, "utf8");
  // Steps 2-3 score each dimension as an integer 1-5, but the sidecar schema
  // (plan-routing-sidecar.spec.md Behavior 2) requires 0..1 and
  // `adev route emit-sidecar` rejects out-of-range values with
  // INVALID_ROUTING_ENTRY. Without an explicit conversion rule an agent
  // emits `5` and the write fails.
  assert.match(
    md,
    /divide\s+each\s+dimension\s+score\s+by\s+5|score\s*÷\s*5|\/\s*5\b/i,
    "Step 4 must state how the 1-5 dimension scores map onto the 0..1 sidecar schema",
  );
  // Every numeric score in the emit-sidecar example must be within [0,1].
  const example = md.match(/adev route emit-sidecar[\s\S]*?ENTRIES\n```/);
  assert.ok(example, "Step 4 must carry an emit-sidecar example");
  for (const [, raw] of example[0].matchAll(
    /"(?:spec_completeness|pattern_coverage|blast_radius|novelty)":\s*([\d.]+)/g,
  )) {
    const value = Number(raw);
    assert.ok(
      value >= 0 && value <= 1,
      `example score ${raw} is outside the 0..1 range the sidecar schema enforces`,
    );
  }
});

test("/adev:route Step 4 tells --task mode to merge before emitting", () => {
  const md = readFileSync(SKILL_PATH, "utf8");
  // `adev route emit-sidecar` calls writeRoutingSidecar, which is a full
  // replace (lib/cli/route.mjs). In `--task <N>` mode only one task is
  // scored, so emitting that single entry would wipe every other task's
  // routing decision. Step 4 must spell out the read-merge-emit sequence.
  assert.match(
    md,
    /--task[^.\n]{0,40}merge|merge[^.\n]{0,60}--task/i,
    "Step 4 must state that --task mode merges into the existing sidecar",
  );
  assert.match(
    md,
    /complete\s+merged\s+array|merged\s+array/i,
    "Step 4 must require passing the full merged entry array to emit-sidecar",
  );
});

test("/adev:route notes that /adev:implement reads routing from the sidecar", () => {
  const md = readFileSync(SKILL_PATH, "utf8");
  // The integration note must point /adev:implement at adev implement read-routing
  // (or at minimum at the sidecar, not at inline annotations).
  assert.match(
    md,
    /adev implement read-routing|reads?\s+routing.{0,60}sidecar/i,
    "Integration note must point /adev:implement at the sidecar reader",
  );
});
