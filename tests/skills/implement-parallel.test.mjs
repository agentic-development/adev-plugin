// tests/skills/implement-parallel.test.mjs
//
// Doc-contract test: skills/implement/SKILL.md must document the --parallel
// orchestration mode (worktree-parallelization/parallel-implement.spec.md) while
// preserving the existing anti-isolation:"worktree" guardrail. Prose-only — no
// inline-Node in the skill (constitution Principle 2 / cli-driver-surface).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const skill = readFileSync(join(ROOT, "skills", "implement", "SKILL.md"), "utf8");

describe("implement --parallel documentation contract", () => {
  it("documents the --parallel mode", () => {
    assert.match(skill, /--parallel/);
    assert.match(skill, /adev parallel groups/);
  });

  it("preserves the anti-isolation:\"worktree\" guardrail", () => {
    assert.match(skill, /Do not pass `isolation: "worktree"`/);
    // and the parallel section reiterates never-isolation, synchronous, single-message dispatch
    assert.match(skill, /`Agent\(\{description, prompt, run_in_background: false\}\)`/);
    assert.match(skill, /concurrently in a single message/);
  });

  it("documents the worktree-binding prompt contract (absolute / git -C)", () => {
    assert.match(skill, /git -C/);
  });

  it("documents the join-time verifications by error code", () => {
    assert.match(skill, /ORCHESTRATOR_POLLUTED/);
    assert.match(skill, /COMMITS_NOT_VERIFIED/);
    assert.match(skill, /adev parallel assert-clean/);
    assert.match(skill, /adev parallel verify/);
  });

  it("documents merge-back, per-group removal, and re-run collision", () => {
    assert.match(skill, /adev worktree merge/);
    assert.match(skill, /RERUN_COLLISION/);
    assert.match(skill, /--fresh/);
    // recovery from a retained worktree uses the implemented force-remove path
    assert.match(skill, /adev worktree remove --slug <…> --force/);
  });

  it("documents all serial-fallback reasons", () => {
    assert.match(skill, /serial: single group/);
    assert.match(skill, /serial: nested/);
    assert.match(skill, /malformed/);
  });

  it("contains no inline-Node execution directive in the parallel prose", () => {
    // Guard the constitution rule: the --parallel section names verbs, not node -e.
    const parIdx = skill.indexOf("Parallel Group Execution");
    assert.ok(parIdx > 0, "parallel section present");
    const section = skill.slice(parIdx, parIdx + 4000);
    assert.doesNotMatch(section, /node\s+-e|node --input-type=module -e|Run inline Node/);
  });
});
