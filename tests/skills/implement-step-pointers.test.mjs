// Every implement step must be reachable from the SKILL.md body under its own
// heading. Steps 1.5 through 4 used to sit inside the companion for the
// "Repo-Mode-Inside-Workspace Advisory", behind a body summary describing only
// a one-line workspace advisory, so an agent outside a workspace had every
// reason to skip the pointer that led to the per-task loop.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const body = readFileSync(join(ROOT, "skills/implement/SKILL.md"), "utf8");
const advisory = readFileSync(join(ROOT, "skills/implement/references/repo-mode-advisory.md"), "utf8");

const STEPS = [
  ["Step 1.5: Infrastructure Preflight", "steps/step-1.5-infra-preflight.md"],
  ["Step 1.6: Progress Tracking (Claude Code)", "steps/step-1.6-progress-tracking.md"],
  ["Step 2: Per-Task Execution Loop", "steps/step-2-per-task-loop.md"],
  ["Step 2.5: Parallel Group Execution", "parallel-mode.md"],
  ["Step 2-post: Integration Gate", "integration-gate.md"],
  ["Step 3: Final Review", "steps/step-3-final-review.md"],
  ["Step 4: Completion", "steps/step-4-completion.md"],
];

function section(text, heading) {
  const start = text.indexOf(`### ${heading}\n`);
  if (start === -1) return null;
  const rest = text.slice(start + heading.length + 5);
  const next = rest.search(/^#{2,3} /m);
  return next === -1 ? rest : rest.slice(0, next);
}

for (const [heading, companion] of STEPS) {
  test(`SKILL.md body has its own "${heading}" heading with a pointer to ${companion}`, () => {
    const s = section(body, heading);
    assert.ok(s !== null, `missing "### ${heading}" in the SKILL.md body`);
    assert.ok(
      s.includes(`> **Conditional loading:** Read \`<ADEV_ROOT>/skills/implement/references/${companion}\``),
      `"${heading}" must point at ${companion} directly from the body`,
    );
  });
}

test("the repo-mode advisory companion holds only the advisory", () => {
  const headings = advisory.split("\n").filter((l) => /^#{1,4} /.test(l));
  assert.equal(headings.length, 1, `expected one heading, got: ${headings.join(" | ")}`);
  assert.match(headings[0], /Repo-Mode-Inside-Workspace Advisory/);
  assert.ok(!/<ADEV_ROOT>\/skills\/implement\/references\/steps\//.test(advisory),
    "the advisory companion must not route to step files");
});

test("steps appear in execution order in the body", () => {
  const positions = STEPS.map(([h]) => body.indexOf(`### ${h}\n`));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  assert.ok(positions[0] > body.indexOf("### Step 1: Load Context"));
  assert.ok(positions.at(-1) < body.indexOf("## Step 5:"));
});
