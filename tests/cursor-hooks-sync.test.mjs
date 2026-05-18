// Drift test for the cursor hook config generator.
// Spec: .context-index/specs/features/cursor-provider/hook-config-generator.spec.md
//
// Task 1 (this commit): assert the translation table is shaped correctly and
// covers every Claude event/matcher pair currently in hooks/hooks.json.
// Tasks 2/3/5 extend this file with generator behaviour, package.json wiring,
// and the file-on-disk drift gate.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TRANSLATION_TABLE,
  FAIL_CLOSED_TIMEOUT,
  ADVISORY_TIMEOUT,
} from "../scripts/build-cursor-hooks.mjs";

test("TRANSLATION_TABLE covers all 7 Claude event/matcher pairs in hooks.json", () => {
  // Expected pairs from hooks/hooks.json:
  //   SessionStart / startup|resume|clear|compact
  //   PreToolUse / Edit
  //   PreToolUse / Bash
  //   PostToolUse / Read
  //   PostToolUse / Edit
  //   PostToolUse / .*
  //   Stop / .*
  const pairs = TRANSLATION_TABLE.map((e) => `${e.claudeEvent}/${e.claudeMatcher}`).sort();
  assert.deepEqual(pairs, [
    "PostToolUse/.*",
    "PostToolUse/Edit",
    "PostToolUse/Read",
    "PreToolUse/Bash",
    "PreToolUse/Edit",
    "SessionStart/startup|resume|clear|compact",
    "Stop/.*",
  ]);
});

test("fail-closed entries have correct intent and timeout constants", () => {
  assert.equal(FAIL_CLOSED_TIMEOUT, 30);
  assert.equal(ADVISORY_TIMEOUT, 60);
  const failClosed = TRANSLATION_TABLE.filter((e) => e.intent === "fail-closed");
  const failClosedPairs = failClosed
    .map((e) => `${e.claudeEvent}/${e.claudeMatcher}`)
    .sort();
  assert.deepEqual(failClosedPairs, ["PreToolUse/Bash", "PreToolUse/Edit"]);
  // Semantic invariant: every fail-closed entry maps to a pre-action Cursor event.
  for (const e of failClosed) {
    assert.ok(
      ["preToolUse", "beforeShellExecution"].includes(e.cursorEvent),
      `fail-closed entry ${e.claudeEvent}/${e.claudeMatcher} maps to non-pre-action cursor event ${e.cursorEvent}`,
    );
  }
});
