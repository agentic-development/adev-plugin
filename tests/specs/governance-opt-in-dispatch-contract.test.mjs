import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SPEC = ".context-index/specs/cross-cutting/governance-opt-in-dispatch.spec.md";

test("the UI-placement Coverage Gap is closed, not left open", () => {
  const spec = readFileSync(SPEC, "utf8");
  assert.doesNotMatch(spec, /is undecided|not yet resolved by this spec/i);
  assert.match(spec, /enhance.*in place|Step 7c\.3\/7d\.1/i);
});

test("revision is bumped past 2", () => {
  const spec = readFileSync(SPEC, "utf8");
  const m = spec.match(/^revision:\s*(\d+)/m);
  assert.ok(m && Number(m[1]) > 2, "revision must be bumped");
});
