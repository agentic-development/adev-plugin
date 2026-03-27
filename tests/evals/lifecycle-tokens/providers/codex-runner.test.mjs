import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { extractTokenUsageFromEvents, runPhase } from "./codex-runner.mjs";

const scenario = {
  scenario_id: "happy-path",
  scenario_name: "Happy Path",
};

const phase = {
  id: "brainstorm",
  name: "Brainstorm",
  skill_name: "adev-brainstorm",
};

const hasRealCodexEnv =
  process.env.ADEV_RUN_REAL_CODEX_TESTS === "true" &&
  typeof process.env.ADEV_LIFECYCLE_PROVIDER_CODEX_RUNNER === "string" &&
  process.env.ADEV_LIFECYCLE_PROVIDER_CODEX_RUNNER.length > 0;

describe("runPhase", () => {
  let tempDir;
  let artifactRoot;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "codex-runner-"));
    artifactRoot = join(tempDir, "artifacts");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("rejects unsafe run ids before any artifact write", async () => {
    await assert.rejects(
      () =>
        runPhase({
          scenario,
          phase,
          attempt: 1,
          runId: "../escape",
          artifactRoot,
        }),
      /invalid_runner_context/,
    );

    assert.equal(existsSync(join(tempDir, "escape")), false);
  });

  it("fails fast for unknown fixture profiles", async () => {
    await assert.rejects(
      () =>
        runPhase(
          {
            scenario,
            phase,
            attempt: 1,
            runId: "codex-happy-path-run-bad-fixture",
            artifactRoot,
          },
          {
            fixtureProfileId: "missing-fixture",
          },
        ),
      /unknown_fixture_profile/,
    );
  });

  it("executes codex from a fixture-backed workspace and excludes git metadata and nested worktrees", async () => {
    const observed = {};
    const spawnFn = (_executable, args, options) => {
      observed.args = args;
      observed.cwd = options.cwd;

      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.stdin = {
        end() {
          const outputPath = args[args.indexOf("--output-last-message") + 1];
          writeFileSync(
            outputPath,
            JSON.stringify({
              status: "passed",
              modelId: "gpt-5.4",
              tokenUsage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 },
            }),
            "utf8",
          );
          child.stdout.end('{"type":"turn.completed","token_usage":{"input_tokens":3,"output_tokens":2,"total_tokens":5}}\n');
          process.nextTick(() => child.emit("close", 0));
        },
      };
      return child;
    };

    const result = await runPhase(
      {
        scenario,
        phase,
        attempt: 1,
        runId: "codex-happy-path-run-1",
        artifactRoot,
      },
      {
        fixtureProfileId: "sample-project-small",
        spawnFn,
      },
    );

    assert.equal(result.status, "passed");
    assert.match(observed.cwd, /provider-artifacts\/codex-happy-path-run-1\/workspace\/repo$/);
    assert.equal(existsSync(join(observed.cwd, "README.md")), true);
    assert.equal(existsSync(join(observed.cwd, "src", "services", "task-service.ts")), true);
    assert.equal(existsSync(join(observed.cwd, ".git")), false);
    assert.equal(existsSync(join(observed.cwd, ".claude", "worktrees")), false);
    assert.equal(observed.args.includes("-C"), true);
    assert.equal(result.fixtureProfileId, "sample-project-small");
    assert.equal(result.fixtureComplexity, "small");
  });

  it("reuses the same run workspace across phases so feature state can carry forward", async () => {
    const workspaceCwds = [];
    const statefulSpawnFn = (_executable, args, options) => {
      workspaceCwds.push(options.cwd);
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.stdin = {
        end() {
          writeFileSync(join(options.cwd, ".phase-marker"), `seen-${workspaceCwds.length}\n`, "utf8");
          const outputPath = args[args.indexOf("--output-last-message") + 1];
          writeFileSync(
            outputPath,
            JSON.stringify({
              status: "passed",
              modelId: "gpt-5.4",
              tokenUsage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 },
            }),
            "utf8",
          );
          child.stdout.end('{"type":"turn.completed","token_usage":{"input_tokens":3,"output_tokens":2,"total_tokens":5}}\n');
          process.nextTick(() => child.emit("close", 0));
        },
      };
      return child;
    };

    await runPhase(
      {
        scenario,
        phase,
        attempt: 1,
        runId: "codex-happy-path-run-2",
        artifactRoot,
      },
      {
        fixtureProfileId: "sample-project-small",
        spawnFn: statefulSpawnFn,
      },
    );

    await runPhase(
      {
        scenario,
        phase: { ...phase, id: "specify", name: "Specify", skill_name: "adev-specify" },
        attempt: 1,
        runId: "codex-happy-path-run-2",
        artifactRoot,
      },
      {
        fixtureProfileId: "sample-project-small",
        spawnFn: statefulSpawnFn,
      },
    );

    assert.equal(workspaceCwds.length, 2);
    assert.equal(workspaceCwds[0], workspaceCwds[1]);
    assert.equal(existsSync(join(workspaceCwds[1], ".phase-marker")), true);
  });

  it("maps sandbox-denied codex failures to an incomplete result and preserves stderr artifacts", async () => {
    const spawnFn = () => {
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.stdin = {
        end() {
          child.stderr.end("fatal: Unable to create '.git/index.lock': Operation not permitted\n");
          process.nextTick(() => child.emit("close", 1));
        },
      };
      return child;
    };

    const result = await runPhase(
      {
        scenario,
        phase,
        attempt: 1,
        runId: "codex-happy-path-run-3",
        artifactRoot,
      },
      {
        fixtureProfileId: "sample-project-small",
        spawnFn,
      },
    );

    assert.equal(result.status, "incomplete");
    assert.equal(result.reasonCode, "codex_sandbox_denied");
    assert.ok(result.artifactPaths.some((entry) => entry.endsWith("codex-stderr.txt")));

    const stderrPath = join(artifactRoot, result.artifactPaths.find((entry) => entry.endsWith("codex-stderr.txt")));
    assert.match(readFileSync(stderrPath, "utf8"), /Operation not permitted/);
  });

  it("writes fixture-specific prompts and returns fixture metadata for alternate complexities", async () => {
    const spawnFn = (_executable, args) => {
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.stdin = {
        end() {
          const outputPath = args[args.indexOf("--output-last-message") + 1];
          writeFileSync(
            outputPath,
            JSON.stringify({
              status: "passed",
              modelId: "gpt-5.4",
              tokenUsage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 },
            }),
            "utf8",
          );
          child.stdout.end('{"type":"turn.completed","token_usage":{"input_tokens":3,"output_tokens":2,"total_tokens":5}}\n');
          process.nextTick(() => child.emit("close", 0));
        },
      };
      return child;
    };

    const result = await runPhase(
      {
        scenario,
        phase: { ...phase, id: "implement", name: "Implement", skill_name: "adev-implement" },
        attempt: 1,
        runId: "codex-happy-path-run-4",
        artifactRoot,
      },
      {
        fixtureProfileId: "sample-project-large",
        spawnFn,
      },
    );

    const promptPath = join(
      artifactRoot,
      result.artifactPaths.find((entry) => entry.endsWith("codex-prompt.txt")),
    );
    const prompt = readFileSync(promptPath, "utf8");

    assert.equal(result.fixtureProfileId, "sample-project-large");
    assert.equal(result.fixtureComplexity, "large");
    assert.match(prompt, /Fixture Profile: Sample Project \(Large\)/);
    assert.match(prompt, /Fixture Feature: fixture-reporting-summary/);
    assert.match(prompt, /Perform the implement phase/);
  });

  it(
    "executes against the real codex CLI and produces parseable artifacts",
    { skip: !hasRealCodexEnv },
    async () => {
      const result = await runPhase({
        scenario,
        phase,
        attempt: 1,
        runId: "codex-happy-path-run-1",
        artifactRoot,
      });

      assert.ok(["passed", "failed", "incomplete"].includes(result.status));
      assert.ok(Array.isArray(result.artifactPaths));
      assert.ok(result.artifactPaths.length >= 4);
      assert.ok(result.artifactPaths.every((artifactPath) => !artifactPath.startsWith("/")));

      const eventsPath = join(artifactRoot, result.artifactPaths.find((entry) => entry.endsWith("codex-events.jsonl")));
      const lastMessagePath = join(artifactRoot, result.artifactPaths.find((entry) => entry.endsWith("codex-last-message.json")));
      const promptPath = join(artifactRoot, result.artifactPaths.find((entry) => entry.endsWith("codex-prompt.txt")));

      assert.match(readFileSync(promptPath, "utf8"), /Objective:/);
      assert.match(readFileSync(promptPath, "utf8"), /Fixture Profile:/);
      assert.doesNotThrow(() => JSON.parse(readFileSync(lastMessagePath, "utf8")));
      assert.match(readFileSync(eventsPath, "utf8"), /thread\.started|turn\.started|error/);
    },
  );

  it("extracts token usage from events logs", () => {
    const events = [
      '{"type":"thread.started"}',
      '{"type":"turn.started"}',
      '{"type":"turn.completed","token_usage":{"input_tokens":5,"output_tokens":3,"total_tokens":8}}',
    ].join("\n");

    assert.deepEqual(extractTokenUsageFromEvents(events), {
      input_tokens: 5,
      output_tokens: 3,
      total_tokens: 8,
    });
  });

  it("extracts token usage from real codex usage summaries", () => {
    const events = [
      '{"type":"thread.started"}',
      '{"type":"turn.completed","usage":{"input_tokens":21,"cached_input_tokens":13,"output_tokens":8}}',
    ].join("\n");

    assert.deepEqual(extractTokenUsageFromEvents(events), {
      input_tokens: 21,
      output_tokens: 8,
      total_tokens: 29,
    });
  });

  it("ignores malformed events when scanning for token usage", () => {
    const events = [
      '{"type":"turn.started"}',
      "not json",
      '{"type":"turn.completed","token_usage":{"input_tokens":null,"output_tokens":null,"total_tokens":null}}',
    ].join("\n");

    assert.equal(extractTokenUsageFromEvents(events), null);
  });
});
