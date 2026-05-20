// Tests for scripts/build-copilot-hooks.mjs (pure transform path).
// Spec: .context-index/specs/features/copilot-provider/copilot-hook-generator.spec.md
//       — Per-Field Source Mapping, Behaviors §1/§5/§6/§7, Postconditions,
//         Error Cases (UNKNOWN_EVENT).

import test from "node:test";
import assert from "node:assert/strict";
import { buildCopilotHooks } from "../scripts/build-copilot-hooks.mjs";

test("emitted entry has type:'command', cwd:'.', default timeoutSec:30", () => {
  const canonical = {
    hooks: {
      PreToolUse: [
        {
          matcher: "^Bash$",
          hooks: [{ type: "command", command: "hooks/foo.sh" }],
        },
      ],
    },
  };
  const out = buildCopilotHooks(canonical);
  const entry = out.hooks.preToolUse[0];
  assert.equal(entry.type, "command");
  assert.equal(entry.cwd, ".");
  assert.equal(entry.timeoutSec, 30);
  assert.equal(entry.bash, "hooks/foo.sh");
});

test("top-level shape: { version: 1, hooks: {...} }", () => {
  const out = buildCopilotHooks({ hooks: {} });
  assert.equal(out.version, 1);
  assert.deepEqual(out.hooks, {});
});

test("matcher is rewritten via tool-name mapping", () => {
  const canonical = {
    hooks: {
      PreToolUse: [
        {
          matcher: "^Bash$",
          hooks: [{ type: "command", command: "hooks/foo.sh" }],
        },
      ],
    },
  };
  const out = buildCopilotHooks(canonical);
  assert.equal(out.hooks.preToolUse[0].matcher, "^bash$");
});

test("MultiEdit matcher rewrites to edit (not Multiedit)", () => {
  const canonical = {
    hooks: {
      PreToolUse: [
        {
          matcher: "MultiEdit",
          hooks: [{ type: "command", command: "hooks/foo.sh" }],
        },
      ],
    },
  };
  const out = buildCopilotHooks(canonical);
  assert.equal(out.hooks.preToolUse[0].matcher, "edit");
});

test("cloudAgentSafe:false events are dropped from output", () => {
  const canonical = {
    hooks: {
      Notification: [
        { matcher: "", hooks: [{ type: "command", command: "hooks/n.sh" }] },
      ],
      PreToolUse: [
        {
          matcher: "^Bash$",
          hooks: [{ type: "command", command: "hooks/foo.sh" }],
        },
      ],
    },
  };
  const out = buildCopilotHooks(canonical);
  assert.equal(out.hooks.notification, undefined);
  assert.equal(out.hooks.permissionRequest, undefined);
  assert.equal(out.hooks.errorOccurred, undefined);
  assert.ok(out.hooks.preToolUse);
});

test("env is carried through verbatim when present", () => {
  const canonical = {
    hooks: {
      PreToolUse: [
        {
          matcher: "^Bash$",
          hooks: [
            {
              type: "command",
              command: "hooks/foo.sh",
              env: { ADEV_FOO: "1" },
            },
          ],
        },
      ],
    },
  };
  const out = buildCopilotHooks(canonical);
  assert.deepEqual(out.hooks.preToolUse[0].env, { ADEV_FOO: "1" });
});

test("env is omitted when absent in canonical", () => {
  const canonical = {
    hooks: {
      PreToolUse: [
        {
          matcher: "^Bash$",
          hooks: [{ type: "command", command: "hooks/foo.sh" }],
        },
      ],
    },
  };
  const out = buildCopilotHooks(canonical);
  assert.equal(Object.prototype.hasOwnProperty.call(out.hooks.preToolUse[0], "env"), false);
});

test("output is byte-deterministic across repeated runs", () => {
  const canonical = {
    hooks: {
      PostToolUse: [
        {
          matcher: "Read",
          hooks: [{ type: "command", command: "hooks/r.sh" }],
        },
      ],
      PreToolUse: [
        {
          matcher: "^Bash$",
          hooks: [{ type: "command", command: "hooks/b.sh" }],
        },
      ],
    },
  };
  const out1 = JSON.stringify(buildCopilotHooks(canonical), null, 2);
  const out2 = JSON.stringify(buildCopilotHooks(canonical), null, 2);
  assert.equal(out1, out2);
});

test("output object keys are sorted at every object level (deterministic)", () => {
  // Swap input order; output object should serialize identically because
  // keys are sorted alphabetically at every level.
  const a = {
    hooks: {
      Stop: [
        { matcher: ".*", hooks: [{ type: "command", command: "hooks/s.sh" }] },
      ],
      SessionStart: [
        {
          matcher: "startup|resume|clear|compact",
          hooks: [{ type: "command", command: "hooks/ss.sh" }],
        },
      ],
    },
  };
  const b = {
    hooks: {
      SessionStart: [
        {
          matcher: "startup|resume|clear|compact",
          hooks: [{ type: "command", command: "hooks/ss.sh" }],
        },
      ],
      Stop: [
        { matcher: ".*", hooks: [{ type: "command", command: "hooks/s.sh" }] },
      ],
    },
  };
  const outA = JSON.stringify(buildCopilotHooks(a), null, 2);
  const outB = JSON.stringify(buildCopilotHooks(b), null, 2);
  assert.equal(outA, outB);
});

test("throws UNKNOWN_EVENT for unmapped Claude event", () => {
  const canonical = { hooks: { Bogus: [] } };
  assert.throws(() => buildCopilotHooks(canonical), /UNKNOWN_EVENT: Bogus/);
});

test("multiple hooks inside a single canonical entry each become an output entry", () => {
  const canonical = {
    hooks: {
      PreToolUse: [
        {
          matcher: "^Bash$",
          hooks: [
            { type: "command", command: "hooks/a.sh" },
            { type: "command", command: "hooks/b.sh" },
          ],
        },
      ],
    },
  };
  const out = buildCopilotHooks(canonical);
  assert.equal(out.hooks.preToolUse.length, 2);
  assert.equal(out.hooks.preToolUse[0].bash, "hooks/a.sh");
  assert.equal(out.hooks.preToolUse[1].bash, "hooks/b.sh");
});

test("DUPLICATE_EVENT_MAPPING from validate() propagates on eager import", async () => {
  // The entrypoint eager-imports event-table.mjs and calls validate() on
  // module init. Construct a synthetic table and feed it through validate()
  // to confirm the documented error code surfaces.
  const { validate } = await import("../lib/providers/copilot/event-table.mjs");
  assert.throws(
    () =>
      validate([
        { claudeEvent: "PreToolUse", copilotEvent: "preToolUse", cloudAgentSafe: true },
        { claudeEvent: "PreToolUse", copilotEvent: "preToolUse", cloudAgentSafe: true },
      ]),
    /DUPLICATE_EVENT_MAPPING: PreToolUse/,
  );
});
