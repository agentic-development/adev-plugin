// tests/skills/implement-batched-mode.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const skill = readFileSync(join(ROOT, "skills", "implement", "batched-mode.md"), "utf8");

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
