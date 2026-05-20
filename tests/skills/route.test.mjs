// tests/skills/route.test.mjs
//
// Architectural test for skills/route/SKILL.md.
//
// Spec: .context-index/specs/features/agent-reliable-state-artifacts/plan-routing-sidecar.spec.md
//       Behavior 1; Red Flag tightening; cli-driver-surface boundary.
// Plan-task: t5
//
// /adev:route MUST write routing decisions to <plan-stem>.routing.md via the
// `adev route emit-sidecar` CLI verb. The plan body MUST NOT be mutated.

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

test("/adev:route Step 4 references the <plan-stem>.routing.md sidecar", () => {
  const md = readFileSync(SKILL_PATH, "utf8");
  assert.match(md, /routing\.md/, "Step 4 must reference the sidecar file");
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
