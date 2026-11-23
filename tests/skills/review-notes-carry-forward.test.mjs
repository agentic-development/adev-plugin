// PASS_WITH_NOTES warnings do not converge to zero under re-review, so the
// skills must route a passing spec to /adev:plan and carry the warnings into
// the plan rather than inviting another revise-and-review round.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PLUGIN_ROOT } from "../helpers.mjs";

const REVIEW_SKILL = readFileSync(join(PLUGIN_ROOT, "skills", "review-specs", "SKILL.md"), "utf8");
const PLAN_GATE = readFileSync(
  join(PLUGIN_ROOT, "skills", "plan", "references", "steps", "step-1-review-gate.md"),
  "utf8",
);
const PLAN_WRITE = readFileSync(
  join(PLUGIN_ROOT, "skills", "plan", "references", "steps", "step-5-write-the-plan.md"),
  "utf8",
);

function section(text, startRe, endRe) {
  const start = text.search(startRe);
  assert.ok(start >= 0, `section ${startRe} not found`);
  const rest = text.slice(start);
  const end = rest.slice(1).search(endRe);
  return end < 0 ? rest : rest.slice(0, end + 1);
}

describe("review-specs Step 8 — PASS_WITH_NOTES report", () => {
  const step8 = section(REVIEW_SKILL, /^## Step 8: Report to User/m, /^## /m);
  const pwn = section(step8, /^\*\*If PASS_WITH_NOTES:\*\*/m, /^\*\*If BLOCK:\*\*/m);

  it("no longer offers to address the warnings before planning", () => {
    assert.doesNotMatch(pwn, /address the warnings first/i);
  });

  it("recommends /adev:plan and says the warnings carry forward into the plan", () => {
    assert.match(pwn, /\/adev:plan --spec <path>/);
    assert.match(pwn, /carr(y|ies) forward/i);
    assert.match(pwn, /Review Notes/);
  });

  it("states why: warning counts do not converge and re-review risks regressions", () => {
    assert.match(pwn, /converge/i);
    assert.match(pwn, /regress/i);
  });
});

describe("review-specs Step 1 — re-review advisory for an unchanged passing spec", () => {
  const step1 = section(REVIEW_SKILL, /^## Step 1: Identify Target Specs/m, /^## /m);

  it("checks the last verdict and file-sha through the review-notes verb", () => {
    assert.match(step1, /adev review-notes show --spec <path> --json/);
    assert.match(step1, /unchangedSinceReview/);
  });

  it("is advisory: the requested re-review still runs", () => {
    assert.match(step1, /does not block|non-blocking|advisory/i);
  });
});

describe("/adev:plan carries PASS_WITH_NOTES warnings forward", () => {
  it("Step 1 reads the warnings through the CLI verb instead of only printing them", () => {
    assert.match(PLAN_GATE, /adev review-notes show --spec <spec-path> --json/);
    assert.doesNotMatch(PLAN_GATE, /print them for the user but do not block/);
  });

  it("Step 5 adds a ## Review Notes section to the plan template", () => {
    assert.match(PLAN_WRITE, /^### Review Notes Section/m);
    assert.match(PLAN_WRITE, /^## Review Notes$/m);
    assert.match(PLAN_WRITE, /unassigned — address in Task 1/);
  });

  it("assigns each warning to the first task touching its cited section", () => {
    const notes = section(PLAN_WRITE, /^### Review Notes Section/m, /^### /m);
    assert.match(notes, /first task/i);
    assert.match(notes, /section/i);
  });

  it("lists Review Notes in the incremental append order so it lands before plan_task events", () => {
    assert.match(PLAN_WRITE, /Task Summary → Review Notes → Task Structure/);
  });
});
