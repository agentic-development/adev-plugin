// tests/skills/build-dispatch-availability.test.mjs
//
// Regression smoke test for the build orchestrator's dispatch protocol.
//
// Failure mode under test: the orchestrator inspects the loaded tool list /
// deferred-tools list, fails to find a literal "Agent" entry (because the
// Agent tool is eagerly loaded, not surfaced via ToolSearch), concludes the
// subagent dispatcher is unavailable, and self-aborts a pipeline step with
// `error: "Agent/Task dispatcher tool not available in this environment"` —
// without ever attempting a real Agent({...}) call.
//
// The fix is a prose-level instruction in skills/build/SKILL.md telling the
// orchestrator to dispatch optimistically and to treat a harness-rejected
// Agent call as the ONLY signal of tool absence.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import { PLUGIN_ROOT, readSkillSurface } from "../helpers.mjs";

const SKILL_PATH = join(PLUGIN_ROOT, "skills", "build", "SKILL.md");
const skill = readSkillSurface("build");

/**
 * Slice a heading's section out of `text`.
 *
 * Searches from the LAST matching heading, not the first. Under progressive
 * disclosure the concatenated surface holds SKILL.md's stub for a heading
 * before the companion that carries the real body; taking the first match
 * would return the conditional-loading pointer and nothing else.
 */
function extractSection(text, headingPattern) {
  const lines = text.split("\n");
  let startIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (headingPattern.test(lines[i])) { startIdx = i; break; }
  }
  if (startIdx === -1) return null;
  const headingLevel = lines[startIdx].match(/^#+/)?.[0]?.length ?? 2;
  const endIdx = lines.findIndex((line, i) => {
    if (i <= startIdx) return false;
    const m = line.match(/^#+/);
    return m && m[0].length <= headingLevel;
  });
  return lines.slice(startIdx, endIdx === -1 ? lines.length : endIdx).join("\n");
}

describe("adev:build SKILL.md — Dispatch optimism (orchestrator must not introspect tool availability)", () => {
  it("Red Flags section forbids pre-dispatch tool-availability introspection", () => {
    const redFlags = extractSection(skill, /^##\s+Red Flags/i);
    assert.ok(redFlags, "Red Flags section must exist");
    assert.match(
      redFlags,
      /tool.availability|tool.list|deferred.tool|ToolSearch|self.abort|self.block/i,
      "Red Flags must explicitly forbid introspecting tool availability before dispatching"
    );
  });

  it("Red Flags forbids treating absence from the deferred-tools list as proof of unavailability", () => {
    const redFlags = extractSection(skill, /^##\s+Red Flags/i);
    assert.ok(redFlags, "Red Flags section must exist");
    assert.match(
      redFlags,
      /eagerly loaded|pre.loaded|not deferred|loaded.*not deferred|deferred.tool.*not.*evidence/i,
      "Red Flags must clarify that absence from deferred-tools is NOT evidence Agent is unavailable"
    );
  });

  it("Delegation Protocol instructs optimistic dispatch (call Agent; harness is the only authority on availability)", () => {
    const delegation = extractSection(skill, /^##\s+Delegation Protocol/i);
    assert.ok(delegation, "Delegation Protocol section must exist");
    assert.match(
      delegation,
      /optimistic|dispatch.*optimist|attempt.*Agent.*call|harness.*reject|harness.*authority|just call.*Agent/i,
      "Delegation Protocol must instruct optimistic dispatch — call Agent and let the harness reject if absent"
    );
  });

  it("explicitly forbids recording the 'Agent tool not available' error without an actual failed Agent() call (+1 more contract assertions)", () => {
    // explicitly forbids recording the 'Agent tool not available' error without an actual failed Agent() call
    assert.match(
    skill,
    /must not record.*not available|never record.*unavailable.*without.*attempt|do not.*self.abort.*tool|must attempt.*Agent.*before.*recording/i,
    "Skill must forbid recording a tool-unavailability failure without first attempting an Agent() call"
    );

    // clarifies 'Task' is not the dispatcher name in this CLI (Agent is the only dispatcher)
    assert.match(
    skill,
    /Agent.*only.*dispatcher|no.*Task.*tool|Task.*not.*dispatcher|dispatcher.*named.*Agent/i,
    "Skill must clarify that 'Task' (used elsewhere in Anthropic docs) is not a tool name in Claude Code — Agent is the only dispatcher"
    );
  });
});
