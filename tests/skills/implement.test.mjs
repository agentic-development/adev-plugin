// tests/skills/implement.test.mjs
//
// Architectural test for skills/implement/SKILL.md routing-reader contract.
//
// Spec: .context-index/specs/features/agent-reliable-state-artifacts/plan-routing-sidecar.spec.md
//       Behaviors 4-5; Error Cases: ROUTING_SIDECAR_MISSING, ROUTING_ENTRY_MISSING,
//       ROUTING_AGENT_INVALID; cli-driver-surface boundary.
// Plan-task: t6
//
// /adev:implement MUST read routing decisions via `adev implement read-routing`
// — never by parsing `**Routing:**` blocks from the plan body.

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const SKILL_PATH = "skills/implement/SKILL.md";

test("/adev:implement reads routing via `adev implement read-routing`", () => {
  const md = readFileSync(SKILL_PATH, "utf8");
  assert.match(
    md,
    /adev implement read-routing/,
    "must name the CLI verb (cli-driver-surface charter)",
  );
});

test("/adev:implement documents ROUTING_SIDECAR_MISSING", () => {
  const md = readFileSync(SKILL_PATH, "utf8");
  assert.match(md, /ROUTING_SIDECAR_MISSING/);
});

test("/adev:implement documents ROUTING_ENTRY_MISSING", () => {
  const md = readFileSync(SKILL_PATH, "utf8");
  assert.match(md, /ROUTING_ENTRY_MISSING/);
});

test("/adev:implement documents ROUTING_AGENT_INVALID", () => {
  const md = readFileSync(SKILL_PATH, "utf8");
  assert.match(md, /ROUTING_AGENT_INVALID/);
});

test("/adev:implement does NOT instruct parsing inline Routing blocks from the plan body", () => {
  const md = readFileSync(SKILL_PATH, "utf8");
  // Defensive: ensure no instruction directs the agent to parse inline
  // **Routing:** blocks out of the plan body. The skill prose may
  // legitimately *mention* inline blocks (e.g., in a deprecation note),
  // so we anchor on "parse … from the plan body" or equivalent.
  assert.doesNotMatch(
    md,
    /parse.{0,40}\*\*Routing:\*\*.{0,80}plan\s+body/i,
    "no-inline-parsing rule must hold",
  );
  assert.doesNotMatch(
    md,
    /read.{0,40}\*\*Routing:\*\*.{0,80}plan\s+body/i,
    "no-inline-parsing rule must hold (read form)",
  );
});

test("/adev:implement states no silent fallback to inline parsing on ROUTING_SIDECAR_MISSING", () => {
  const md = readFileSync(SKILL_PATH, "utf8");
  // Look for either an explicit no-fallback rule or instructions to stop
  // and direct the user to /adev:route.
  assert.match(
    md,
    /(no\s+(silent\s+)?fallback|do\s+not\s+(silently\s+)?fall\s+back|stop.{0,40}(re-?run\s+\/adev:route|run\s+\/adev:route))/i,
    "must explicitly forbid silent fallback to inline parsing",
  );
});
