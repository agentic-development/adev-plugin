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
import { readSkillSurface } from "../helpers.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const skillBody = readSkillSurface("implement");

// The Step 2.5 body was extracted to a conditional-loading companion when
// implement/SKILL.md crossed the 65,536-byte cap the Copilot provider enforces
// (lib/providers/copilot/skill-validator.mjs). The skill's EFFECTIVE instruction
// set is the body plus whatever its pointers resolve to, so the doc-contract
// assertions below run against both — extracting content must not be able to
// make a contract test pass vacuously.
//
// The companion path is resolved FROM the pointer, never hardcoded: a rename or
// a dropped pointer fails loudly here rather than silently shrinking the corpus
// these assertions scan.
const parallelPointer = skillBody.match(
  /### Step 2\.5: Parallel Group Execution[^\n]*\n\s*\n> \*\*Conditional loading:\*\* Read `([^`]+)`/,
);
const skill = parallelPointer
  ? skillBody + "\n" + readFileSync(join(ROOT, parallelPointer[1]), "utf8")
  : skillBody;

describe("implement --parallel documentation contract", () => {
  it("documents the --parallel mode (+1 more contract assertions)", () => {
    // documents the --parallel mode
    assert.match(skill, /--parallel/);
    assert.match(skill, /adev parallel groups/);

    // documents all serial-fallback reasons
    assert.match(skill, /serial: single group/);
    assert.match(skill, /serial: nested/);
    assert.match(skill, /malformed/);
  });

  it("preserves the anti-isolation:\"worktree\" guardrail", () => {
    assert.match(skill, /Do not pass `isolation: "worktree"`/);
    // and the parallel section reiterates never-isolation, synchronous, single-message dispatch
    assert.match(skill, /`Agent\(\{description, prompt, run_in_background: false\}\)`/);
    assert.match(skill, /concurrently in a single message/);
  });

  it("documents the worktree-binding prompt contract (absolute / git -C) (+1 more contract assertions)", () => {
    // documents the worktree-binding prompt contract (absolute / git -C)
    assert.match(skill, /git -C/);

    // documents the join-time verifications by error code
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


  it("contains no inline-Node execution directive in the parallel prose", () => {
    // Guard the constitution rule: the --parallel section names verbs, not node -e.
    //
    // The body was extracted to a conditional-loading companion when
    // implement/SKILL.md crossed the 65,536-byte cap the Copilot provider
    // enforces. Resolve the companion FROM the pointer rather than hardcoding
    // it, so a rename or a dropped pointer fails here instead of silently
    // scanning nothing — the previous `slice(idx, idx + 4000)` would have
    // passed vacuously against a stub.
    assert.ok(
      parallelPointer,
      "Step 2.5 must carry a `Conditional loading:` pointer to its companion",
    );
    const section = readFileSync(join(ROOT, parallelPointer[1]), "utf8");
    assert.ok(section.length > 500, "companion must hold real instructions");
    assert.doesNotMatch(section, /node\s+-e|node --input-type=module -e|Run inline Node/);
  });
});
