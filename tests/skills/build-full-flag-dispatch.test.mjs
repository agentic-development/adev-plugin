// tests/skills/build-full-flag-dispatch.test.mjs
//
// Behavioral smoke test for the `/adev:build --full` dispatch path.
//
// The companion file `build-dispatch-availability.test.mjs` is a prose lint —
// it asserts that warning text exists in `skills/build/SKILL.md`. That test
// passes even when the orchestrator ignores the warning at runtime, which is
// exactly the regression the user kept hitting: the orchestrator self-aborts
// with "Agent dispatcher is not present in this session's tool surface"
// before any `Agent({...})` call is attempted.
//
// This file is a real behavioral test. It boots a temp project with a
// minimal but realistic `.context-index/`, sends a live Claude session the
// user-typed invocation `/adev:build --spec <path> --full`, and provides the
// surface of tools the orchestrator expects (Skill, Agent, Bash, Read,
// Write). It then asserts that the orchestrator emits a real `Agent({...})`
// tool_use rather than refusing to dispatch.
//
// Opt-in: live LLM access is opt-in via the `ADEV_LIVE=1` env var (matches
// the Tier-3-live precedent in tests/evals/configurable-governance/). When
// `ADEV_LIVE` is not set, the suite registers a single placeholder
// assertion documenting how to enable it — `npm test` stays green for
// contributors without API access.
//
// Failure-hard policy (per project feedback): when `ADEV_LIVE=1` IS set but
// `@anthropic-ai/sdk` or `ANTHROPIC_API_KEY` is unavailable, the test fails
// hard with a remediation message. It MUST NOT silently skip in that mode —
// the user asked for a live run and the infrastructure is offline.

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { PLUGIN_ROOT, readSkillSurface } from "../helpers.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const MODEL = process.env.ADEV_BUILD_TEST_MODEL ?? "claude-opus-4-7";
const MAX_TURNS = Number(process.env.ADEV_BUILD_TEST_MAX_TURNS ?? 12);

const FORBIDDEN_TEXT_PATTERNS = [
  /agent[^.\n]{0,40}\b(not present|not available)\b/i,
  /tool surface/i,
  /dispatcher[^.\n]{0,40}\b(not present|missing|unavailable)\b/i,
  /orchestrator[-_ ]blocked/i,
];

// ── Fixture content (inlined for self-containment) ──────────────────────────

const CONSTITUTION = `# Project Constitution

## Identity
demo-build-fixture is a throwaway fixture used by the build dispatch smoke test.

## Non-Negotiable Principles
1. Skills are primarily markdown.
2. Pure ESM.

## Coding Standards
Test fixture; standards do not apply.

## Architecture Boundaries
### Autonomous (Agent May Decide)
- Anything required by the test harness.

## Quality Gates
\`\`\`bash
echo "no real gates in fixture"
\`\`\`
`;

const MANIFEST = `project:
  name: "demo-build-fixture"
  adev_version: "0.0.0-test"
  description: "fixture for build dispatch smoke test"
  type: cli

sync:
  targets:
    - path: CLAUDE.md
      format: claude

modules:
  - slug: demo
    name: Demo
    paths:
      - "src/demo/**"

lifecycle:
  gate_mode: advisory
`;

const CHARTER = `---
charter: demo
kind: feature
status: ready
---

# Charter: Demo

## Identity
A throwaway charter used by the build dispatch smoke test.

## Capability Map
| Capability | Status |
|---|---|
| Hello capability | specified |
`;

const SPEC = `---
charter: demo
kind: behavioral
status: review-passed
risk_level: low
created: 2026-05-14
---

# Behavioral Spec: Hello

## Preconditions
None.

## Behavior
Returns the string "hello" when invoked.

## Acceptance Criteria
- [ ] Function returns "hello"

## System Constitution Reference
- Test fixture only.
`;

// Existing PASS review so the Full Pipeline's Step 0 skip condition COULD fire
// — but we want Step 0/1 to be the first non-skipped step the orchestrator
// considers, so we deliberately do NOT pre-create a `.review.md`. The
// orchestrator should dispatch /adev:specify or /adev:review-specs as the
// first real Agent() call.

// ── Tool definitions exposed to the model ───────────────────────────────────

function toolDefinitions() {
  return [
    {
      name: "Skill",
      description:
        "Load and execute a skill by name (e.g. 'adev:build'). The harness returns the skill's SKILL.md content as the tool result.",
      input_schema: {
        type: "object",
        properties: {
          skill: { type: "string" },
          args: { type: "string" },
        },
        required: ["skill"],
      },
    },
    {
      name: "Agent",
      description:
        "Dispatch a fresh subagent with a self-contained prompt. The build orchestrator MUST use this to dispatch every pipeline step (specify, review, plan, route, implement, validate). The subagent runs in its own context and returns a STEP_RESULT block.",
      input_schema: {
        type: "object",
        properties: {
          description: { type: "string" },
          prompt: { type: "string" },
          subagent_type: { type: "string" },
        },
        required: ["description", "prompt"],
      },
    },
    {
      name: "Bash",
      description:
        "Run a shell command in the project working directory. Use for `node --input-type=module -e \"...\"` calls into lib/build-state.mjs and lib/lifecycle-state.mjs helpers.",
      input_schema: {
        type: "object",
        properties: { command: { type: "string" } },
        required: ["command"],
      },
    },
    {
      name: "Read",
      description: "Read a file from disk.",
      input_schema: {
        type: "object",
        properties: { file_path: { type: "string" } },
        required: ["file_path"],
      },
    },
    {
      name: "Write",
      description: "Write contents to a file (overwriting if it exists).",
      input_schema: {
        type: "object",
        properties: {
          file_path: { type: "string" },
          content: { type: "string" },
        },
        required: ["file_path", "content"],
      },
    },
  ];
}

// ── Tool execution stubs ────────────────────────────────────────────────────

function execSkill(input, ctx) {
  const name = (input.skill ?? "").trim();
  if (name === "adev:build" || name === "build") {
    return {
      ok: true,
      content: readSkillSurface("build"),
    };
  }
  // Unknown skills return empty content; the orchestrator should not need
  // any other skill at the dispatch point we're testing.
  return { ok: true, content: `# Skill ${name}\n(stub — not provided in this test)\n` };
}

function execAgent(input, ctx) {
  ctx.agentCalls.push({
    description: input.description ?? "",
    prompt: input.prompt ?? "",
    subagent_type: input.subagent_type ?? null,
  });
  // Return a synthetic STEP_RESULT that looks like a clean completion. The
  // orchestrator will then write build state and re-invoke for the next step.
  // We do not need to drive the full pipeline — a single successful Agent
  // call is enough to prove the dispatch path works.
  return {
    ok: true,
    content: `STEP_RESULT:
  status: COMPLETED
  verdict: PASS
  artifacts: []
  summary: "Synthetic STEP_RESULT from build-full-flag-dispatch test harness."
  error: ""
`,
  };
}

function execBash(input, ctx) {
  const command = String(input.command ?? "");
  try {
    const out = execSync(command, {
      cwd: ctx.projectRoot,
      encoding: "utf8",
      timeout: 15_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, content: out };
  } catch (e) {
    return {
      ok: false,
      content: `exit ${e.status ?? 1}\nstdout:\n${e.stdout ?? ""}\nstderr:\n${e.stderr ?? e.message}`,
    };
  }
}

function execRead(input, ctx) {
  try {
    const target = resolve(ctx.projectRoot, input.file_path);
    if (!existsSync(target)) return { ok: false, content: `Not found: ${input.file_path}` };
    return { ok: true, content: readFileSync(target, "utf8") };
  } catch (e) {
    return { ok: false, content: e.message };
  }
}

function execWrite(input, ctx) {
  try {
    const target = resolve(ctx.projectRoot, input.file_path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, String(input.content ?? ""));
    return { ok: true, content: `wrote ${input.file_path}` };
  } catch (e) {
    return { ok: false, content: e.message };
  }
}

const TOOL_HANDLERS = {
  Skill: execSkill,
  Agent: execAgent,
  Bash: execBash,
  Read: execRead,
  Write: execWrite,
};

// ── Fixture setup ───────────────────────────────────────────────────────────

function setupFixture() {
  const root = mkdtempSync(join(tmpdir(), "adev-build-dispatch-"));
  const ci = join(root, ".context-index");
  mkdirSync(join(ci, "specs/features/demo"), { recursive: true });
  mkdirSync(join(ci, "lifecycle-state"), { recursive: true });
  mkdirSync(join(ci, "build-state"), { recursive: true });
  writeFileSync(join(ci, "constitution.md"), CONSTITUTION);
  writeFileSync(join(ci, "manifest.yaml"), MANIFEST);
  writeFileSync(join(ci, "specs/features/demo/charter.md"), CHARTER);
  const specPath = join(ci, "specs/features/demo/hello.spec.md");
  writeFileSync(specPath, SPEC);
  return { root, specRelPath: ".context-index/specs/features/demo/hello.spec.md" };
}

// ── Live-LLM driver loop ────────────────────────────────────────────────────

async function loadAnthropic() {
  let mod;
  try {
    mod = await import("@anthropic-ai/sdk");
  } catch (e) {
    throw new Error(
      `@anthropic-ai/sdk is not installed in this workspace. This test exercises ` +
        `the live build orchestrator and requires the SDK. Install it with:\n\n` +
        `    npm install --no-save @anthropic-ai/sdk\n\n` +
        `(The plugin itself is zero-dependency by constitution; the SDK is a test-time-only requirement.)\n` +
        `Original: ${e.message}`
    );
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      `ANTHROPIC_API_KEY is not set. This test exercises the live build orchestrator. ` +
        `Export an API key before running, or skip this file explicitly.`
    );
  }
  return new mod.default({ apiKey: process.env.ANTHROPIC_API_KEY });
}

async function driveBuild({ client, projectRoot, specRelPath }) {
  const systemPrompt = [
    "You are Claude Code running in a user's terminal session.",
    "",
    "The user has just typed the slash command `/adev:build --spec <path> --full` ",
    "and the harness has translated it into a Skill tool invocation. You must ",
    "load and execute the adev:build skill using the Skill tool. Then follow ",
    "the skill's instructions exactly — including dispatching pipeline steps as ",
    "fresh subagents via the Agent tool.",
    "",
    `PROJECT_ROOT = ${projectRoot}`,
    `ADEV_ROOT (plugin root, for node imports) = ${PLUGIN_ROOT}`,
    `SPEC_PATH (relative to PROJECT_ROOT) = ${specRelPath}`,
    "",
    "When the skill prose says <ADEV_ROOT> or <PROJECT_ROOT> or <SPEC_PATH>, ",
    "substitute the values above. The fixture project is real on disk — Bash ",
    "commands and node helper invocations will execute for real.",
    "",
    "Available tools: Skill, Agent, Bash, Read, Write.",
  ].join("\n");

  const messages = [
    {
      role: "user",
      content: `/adev:build --spec ${specRelPath} --full`,
    },
  ];
  const tools = toolDefinitions();
  const ctx = {
    projectRoot,
    agentCalls: [],
    assistantText: [],
  };

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      tools,
      messages,
    });

    const assistantBlocks = res.content;
    const textBlocks = assistantBlocks.filter((b) => b.type === "text");
    for (const tb of textBlocks) ctx.assistantText.push(tb.text);

    messages.push({ role: "assistant", content: assistantBlocks });

    const toolUseBlocks = assistantBlocks.filter((b) => b.type === "tool_use");

    if (toolUseBlocks.length === 0) {
      // Model produced text only → it has stopped acting. Exit loop and let
      // assertions decide whether that was acceptable.
      break;
    }

    const toolResults = [];
    for (const tu of toolUseBlocks) {
      const handler = TOOL_HANDLERS[tu.name];
      let result;
      if (!handler) {
        result = { ok: false, content: `Unknown tool: ${tu.name}` };
      } else {
        result = handler(tu.input, ctx);
      }
      toolResults.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: result.content,
        is_error: !result.ok,
      });
      // Early exit: if Agent has been called at least once, we have the
      // evidence we need. Drain the remaining tool results in this turn,
      // then break.
    }
    messages.push({ role: "user", content: toolResults });

    if (ctx.agentCalls.length > 0 && res.stop_reason !== "tool_use") {
      break;
    }
    // If the model has dispatched Agent and is still asking for more tools,
    // continue — but cap by MAX_TURNS.
  }

  return ctx;
}

// ── The test ────────────────────────────────────────────────────────────────

const LIVE = process.env.ADEV_LIVE === "1";

if (!LIVE) {
  describe("adev:build --full — live dispatch smoke (opt-in)", () => {
    it("is opt-in; re-run with ADEV_LIVE=1 to actually drive the build orchestrator", () => {
      assert.equal(LIVE, false);
    });
  });
}

if (LIVE)
describe("adev:build --full — orchestrator dispatches a real Agent() call (no self-abort)", () => {
  let fixture;
  let ctx;
  let client;

  before(async () => {
    client = await loadAnthropic();
    fixture = setupFixture();
    ctx = await driveBuild({
      client,
      projectRoot: fixture.root,
      specRelPath: fixture.specRelPath,
    });
  });

  after(() => {
    if (fixture?.root && existsSync(fixture.root)) {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("the orchestrator emits at least one Agent() tool_use", () => {
    assert.ok(
      ctx.agentCalls.length >= 1,
      `Expected the orchestrator to dispatch at least one Agent() call. ` +
        `Got 0 Agent calls. Assistant text so far:\n\n${ctx.assistantText.join("\n---\n")}`
    );
  });

  it("the orchestrator never claims Agent / dispatcher / tool surface is unavailable in text output", () => {
    const combined = ctx.assistantText.join("\n");
    for (const pattern of FORBIDDEN_TEXT_PATTERNS) {
      assert.ok(
        !pattern.test(combined),
        `Orchestrator text matched a forbidden self-abort pattern (${pattern}).\n\n` +
          `Full assistant text:\n${combined}`
      );
    }
  });

  it("the lifecycle log contains no step_failed event with an orchestrator-blocked verdict", () => {
    const logPath = join(fixture.root, ".context-index/lifecycle-state/hello.jsonl");
    if (!existsSync(logPath)) {
      // No log means the orchestrator never wrote one — acceptable as long
      // as the Agent assertion above passed.
      return;
    }
    const lines = readFileSync(logPath, "utf8").split("\n").filter(Boolean);
    for (const line of lines) {
      let evt;
      try {
        evt = JSON.parse(line);
      } catch {
        continue;
      }
      if (evt.event !== "step_failed") continue;
      assert.notMatch(
        String(evt.verdict ?? ""),
        /orchestrator[-_ ]blocked/i,
        `Lifecycle log recorded a forbidden orchestrator-blocked failure: ${line}`
      );
      assert.notMatch(
        String(evt.error ?? "") + " " + String(evt.notes ?? ""),
        /agent[^.\n]{0,40}\b(not present|not available)\b|tool surface|dispatcher[^.\n]{0,40}\b(not present|missing|unavailable)\b/i,
        `Lifecycle log recorded a forbidden self-abort error string: ${line}`
      );
    }
  });
});
