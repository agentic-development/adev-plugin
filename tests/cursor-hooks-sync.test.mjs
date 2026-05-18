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
  buildCursorHooks,
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

// ─── Task 2: buildCursorHooks in-memory transform ──────────────────────────

const sampleCanonical = {
  hooks: {
    SessionStart: [
      {
        matcher: "startup|resume|clear|compact",
        hooks: [
          {
            type: "command",
            command: 'bash "${CLAUDE_PLUGIN_ROOT}/hooks/session-start.sh"',
          },
        ],
      },
    ],
    PreToolUse: [
      {
        matcher: "Edit",
        hooks: [
          {
            type: "command",
            command: 'bash "${CLAUDE_PLUGIN_ROOT}/hooks/context-preflight.sh"',
          },
        ],
      },
    ],
  },
};

const allScriptsExist = () => true;
const noScriptsExist = () => false;

test("buildCursorHooks produces canonical JSON shape with version + hooks map", () => {
  const out = buildCursorHooks(sampleCanonical, allScriptsExist);
  assert.equal(out.version, 1);
  assert.ok(out.hooks.sessionStart);
  assert.ok(out.hooks.preToolUse);
});

test("buildCursorHooks rewrites command and strips bash wrapper", () => {
  const out = buildCursorHooks(sampleCanonical, allScriptsExist);
  assert.equal(out.hooks.sessionStart[0].command, "./hooks/session-start.sh");
  assert.equal(out.hooks.preToolUse[0].command, "./hooks/context-preflight.sh");
});

test("buildCursorHooks stamps failClosed=true and timeout=30 for PreToolUse, false/60 otherwise", () => {
  const out = buildCursorHooks(sampleCanonical, allScriptsExist);
  assert.equal(out.hooks.preToolUse[0].failClosed, true);
  assert.equal(out.hooks.preToolUse[0].timeout, 30);
  assert.equal(out.hooks.preToolUse[0].matcher, "Edit");
  assert.equal(out.hooks.sessionStart[0].failClosed, false);
  assert.equal(out.hooks.sessionStart[0].timeout, 60);
});

test("buildCursorHooks throws on unknown Claude event", () => {
  const bad = {
    hooks: {
      UnknownEvent: [
        {
          matcher: "*",
          hooks: [
            { type: "command", command: 'bash "${CLAUDE_PLUGIN_ROOT}/hooks/x.sh"' },
          ],
        },
      ],
    },
  };
  assert.throws(
    () => buildCursorHooks(bad, allScriptsExist),
    /Unknown Claude event: UnknownEvent\. Add an entry to TRANSLATION_TABLE/,
  );
});

test("buildCursorHooks throws on unknown matcher under known event", () => {
  const bad = {
    hooks: {
      PreToolUse: [
        {
          matcher: "Glob",
          hooks: [
            { type: "command", command: 'bash "${CLAUDE_PLUGIN_ROOT}/hooks/x.sh"' },
          ],
        },
      ],
    },
  };
  assert.throws(
    () => buildCursorHooks(bad, allScriptsExist),
    /Unknown Claude matcher: PreToolUse\/Glob\. Add an entry to TRANSLATION_TABLE/,
  );
});

test("buildCursorHooks throws on non-canonical hook command (SEC-1)", () => {
  const bad = {
    hooks: {
      SessionStart: [
        {
          matcher: "startup|resume|clear|compact",
          hooks: [{ type: "command", command: "python my-hook.py" }],
        },
      ],
    },
  };
  assert.throws(
    () => buildCursorHooks(bad, allScriptsExist),
    /Non-canonical hook command at SessionStart\/startup\|resume\|clear\|compact: python my-hook\.py\. Translation only supports the canonical bash-script form/,
  );
});

test("buildCursorHooks throws when canonical-shaped command references missing script", () => {
  assert.throws(
    () => buildCursorHooks(sampleCanonical, noScriptsExist),
    /Hook script not found: hooks\/session-start\.sh referenced from SessionStart\/startup\|resume\|clear\|compact/,
  );
});
