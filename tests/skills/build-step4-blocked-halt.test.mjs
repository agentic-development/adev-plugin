// BEH-15 as a build step: an implement halt on an unconverged review loop returns
// STEP_RESULT BLOCKED, and its recorded terminal is the task's `plan_task` `blocked`.
// In a live build-mode run the orchestrator, having no BLOCKED branch, emitted its
// own implement `step_failed`, which BEH-15 forbids. These assertions pin the rule
// that the orchestrator never emits implement step events and how it records BLOCKED.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PLUGIN_ROOT } from "../helpers.mjs";

const STEP4 = ["skills", "providers/codex/skills", "providers/opencode/skills"].map((root) =>
  join(PLUGIN_ROOT, root, "build", "references", "pipeline", "step-4-implement.md"),
);

for (const path of STEP4) {
  const md = readFileSync(path, "utf8");
  const rel = path.slice(PLUGIN_ROOT.length + 1);

  test(`${rel}: the orchestrator never emits implement lifecycle step events`, () => {
    assert.match(md, /Implement owns its lifecycle step events/);
    assert.match(md, /never runs `adev report --type step --step implement`, with any status/);
  });

  test(`${rel}: a BLOCKED STEP_RESULT is recorded in build state only, with no step_failed`, () => {
    const after = md.slice(md.indexOf("**After subagent returns:**"));
    const blocked = after.split("\n").find((l) => l.includes("`STEP_RESULT` `status` is `BLOCKED`"));
    assert.ok(blocked, "Step 4 must have a BLOCKED branch");
    assert.match(blocked, /no implement `step_failed` exists or is emitted/);
    assert.match(blocked, /--status failed --verdict BLOCKED/);
    assert.match(blocked, /without waiting for input/);
    assert.ok(after.indexOf(blocked) < after.indexOf("quality gate or integration gate failure"), "BLOCKED is checked before the gate-failure branch");
  });
}
