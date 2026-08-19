// tests/skills/implement-synthesized-prompt.test.mjs
//
// synthesized-reviewer-prompt.md is the companion prompt handed to the
// single reviewer subagent in /adev:implement's Stage 1+2 synthesized review
// mode. It must union Stage 1's spec-compliance lens with Stage 2's
// code-quality lens (referenced by path, not duplicated), preserve stable
// cq-<n> finding ids for lib/loop-convergence.mjs, and instruct the reviewer
// to verify by reading code — not by trusting the implementer's report.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const PROMPT_PATH = "skills/implement/synthesized-reviewer-prompt.md";

test("synthesized-reviewer-prompt.md exists and unions both lenses", () => {
  const md = readFileSync(PROMPT_PATH, "utf8");
  assert.match(md, /Stage 1/i);
  assert.match(md, /code-quality-checklist\.md/);
  assert.match(md, /cq-<n>|cq-\d/);
});

test("synthesized-reviewer-prompt.md instructs verifying by reading code, not trusting the report", () => {
  const md = readFileSync(PROMPT_PATH, "utf8");
  assert.match(md, /read(ing)? code/i);
});
