// tests/skills/implement-batched-mode.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readSkillSurface } from "../helpers.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const skill = readFileSync(join(ROOT, "skills", "implement", "references", "batched-mode.md"), "utf8");
const skillBody = readSkillSurface("implement");

describe("implement batched-mode companion", () => {
  it("names the resolving CLI verb, not inline grouping logic", () => {
    assert.match(skill, /adev implement batches/);
    assert.doesNotMatch(skill, /node --input-type=module -e/);
    assert.doesNotMatch(skill, /node -e ["']/);
  });

  it("states the read-ahead prohibition verbatim", () => {
    assert.match(skill, /MUST fully complete task/i);
    assert.match(skill, /[Rr]eading ahead is\s*\n?\s*forbidden/);
  });

  it("states one Handoff Block per task, not one per batch", () => {
    assert.match(skill, /N handoff blocks, not one/i);
  });

  it("states both review stages run per task and no group-level review is dispatched — AC5", () => {
    assert.match(skill, /[Bb]oth review stages/);
    assert.match(skill, /no group-level review/i);
  });

  it("states batch abort semantics: commits stand, remaining tasks solo on re-run", () => {
    assert.match(skill, /never rolled back/i);
    assert.match(skill, /dispatched \*\*solo\*\*, regardless of\s*\n?\s*eligibility/i);
  });

  it("documents all three advisories", () => {
    assert.match(skill, /BATCH_DISPATCHED/);
    assert.match(skill, /BATCH_SOLO_FORCED/);
    assert.match(skill, /BATCH_ABORTED/);
  });

  it("preserves the anti-isolation guardrail inside a batch, same as parallel mode", () => {
    assert.match(skill, /Do not pass `isolation: "worktree"`|run_in_background: false/);
  });
});

describe("SKILL.md batched-dispatch wiring", () => {
  it("documents --no-batch and --max-batch in Arguments", () => {
    assert.match(skillBody, /--no-batch/);
    assert.match(skillBody, /--max-batch <n>/);
  });

  it("rejects --no-batch combined with --parallel via CONFLICTING_BATCH_FLAGS", () => {
    assert.match(skillBody, /CONFLICTING_BATCH_FLAGS/);
  });

  it("points to batched-mode.md before the per-task loop begins", () => {
    assert.match(
      skillBody,
      /Read `<ADEV_ROOT>\/skills\/implement\/references\/batched-mode\.md`/,
      "the pointer must be <ADEV_ROOT>-anchored — a bare skills/ path does not " +
        "resolve at any install surface",
    );
  });

  it("documents all three batch advisories in the base skill or its companion", () => {
    const combined = skillBody + "\n" + readFileSync(join(ROOT, "skills", "implement", "references", "batched-mode.md"), "utf8");
    for (const advisory of ["BATCH_DISPATCHED", "BATCH_SOLO_FORCED", "BATCH_ABORTED"]) {
      assert.match(combined, new RegExp(advisory));
    }
  });

  it("checks the --no-batch/--parallel conflict as an unconditional Prerequisite, not only inside Step 2's batch-resolution paragraph", () => {
    // Step 2's own "Batch resolution" paragraph (and Step 2.5) are reached
    // conditionally — Step 2.5 takes over entirely when --parallel routes
    // there, bypassing Step 2's paragraph where `adev implement batches` is
    // invoked. If CONFLICTING_BATCH_FLAGS were only checked from inside that
    // paragraph, a run with both --no-batch and --parallel would never hit
    // it. The check must therefore also live in Prerequisites, which every
    // invocation passes through before Step 1/2/2.5 are reached at all.
    // Sliced from the BODY, not readSkillSurface(). Two reasons: the property is
    // that the check lives in the body's unconditional Prerequisites, which the
    // surface cannot distinguish; and if "## Process" ever moved to a companion
    // this slice would silently widen from ~4 KB to the whole ~84 KB surface and
    // keep passing on a match from anywhere in it.
    const body = readFileSync(join(ROOT, "skills", "implement", "SKILL.md"), "utf8");
    const start = body.indexOf("## Prerequisites");
    const end = body.indexOf("## Process", start);
    assert.ok(start !== -1 && end > start, "Prerequisites must precede Process in the body");
    const prereqSection = body.slice(start, end);
    assert.match(prereqSection, /CONFLICTING_BATCH_FLAGS/);
    assert.match(prereqSection, /stop immediately/i);
  });
});
