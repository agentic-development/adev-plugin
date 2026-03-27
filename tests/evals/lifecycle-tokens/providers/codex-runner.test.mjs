import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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
      assert.ok(result.artifactPaths.length >= 3);
      assert.ok(result.artifactPaths.every((artifactPath) => !artifactPath.startsWith("/")));

      const eventsPath = join(artifactRoot, result.artifactPaths.find((entry) => entry.endsWith("codex-events.jsonl")));
      const lastMessagePath = join(artifactRoot, result.artifactPaths.find((entry) => entry.endsWith("codex-last-message.json")));
      const promptPath = join(artifactRoot, result.artifactPaths.find((entry) => entry.endsWith("codex-prompt.txt")));

      assert.match(readFileSync(promptPath, "utf8"), /Objective:/);
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

  it("ignores malformed events when scanning for token usage", () => {
    const events = [
      '{"type":"turn.started"}',
      "not json",
      '{"type":"turn.completed","token_usage":{"input_tokens":null,"output_tokens":null,"total_tokens":null}}',
    ].join("\n");

    assert.equal(extractTokenUsageFromEvents(events), null);
  });
});
