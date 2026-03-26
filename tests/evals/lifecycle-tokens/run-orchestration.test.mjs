import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

import { loadScenarioRegistry } from "./registry.mjs";
import { runScenarioMatrix } from "./run-orchestration.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCENARIOS_DIR = join(__dirname, "scenarios");

describe("runScenarioMatrix", () => {
  let tempDir;
  let scenarios;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "lifecycle-runner-"));
    scenarios = loadScenarioRegistry(SCENARIOS_DIR);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("runs the happy path to a passed terminal state and writes a raw event log", async () => {
    const phaseCalls = [];
    const executePhase = async ({ phase, attempt }) => {
      phaseCalls.push(`${phase.id}:${attempt}`);
      return {
        status: "passed",
        tokenUsage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      };
    };

    const result = await runScenarioMatrix({
      scenarios: scenarios.filter((scenario) => scenario.scenario_id === "happy-path"),
      executePhase,
      eventsDir: tempDir,
      makeRunId: (scenarioId) => `${scenarioId}-run-1`,
      now: () => "2026-03-25T12:00:00.000Z",
    });

    assert.equal(result.scenarioRuns.length, 1);
    assert.equal(result.scenarioRuns[0].status, "passed");
    assert.equal(result.scenarioRuns[0].reason_code, null);
    assert.deepEqual(result.scenarioRuns[0].realized_phase_path, [
      "brainstorm",
      "specify",
      "review-specs",
      "plan",
      "implement",
      "validate",
    ]);
    assert.deepEqual(phaseCalls, [
      "brainstorm:1",
      "specify:1",
      "review-specs:1",
      "plan:1",
      "implement:1",
      "validate:1",
    ]);

    const eventLines = readFileSync(result.scenarioRuns[0].event_log_path, "utf8").trim().split("\n");
    assert.equal(eventLines.length, 6);
  });

  it("follows declared review-reject branches and records repeated phase attempts", async () => {
    const outcomes = {
      brainstorm: [{ status: "passed" }],
      specify: [
        { status: "passed" },
        { status: "passed" },
      ],
      "review-specs": [
        {
          status: "failed",
          triggerType: "on_review_reject",
          tokenUsage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 },
        },
        {
          status: "passed",
          tokenUsage: { input_tokens: 15, output_tokens: 10, total_tokens: 25 },
        },
      ],
      plan: [{ status: "passed" }],
      implement: [{ status: "passed" }],
      validate: [{ status: "passed" }],
    };

    const executePhase = async ({ phase }) => {
      const next = outcomes[phase.id].shift();
      return {
        tokenUsage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
        ...next,
      };
    };

    const [run] = (
      await runScenarioMatrix({
        scenarios: scenarios.filter((scenario) => scenario.scenario_id === "review-fails-once"),
        executePhase,
        eventsDir: tempDir,
        makeRunId: () => "review-fails-once-run-1",
        now: () => "2026-03-25T12:05:00.000Z",
      })
    ).scenarioRuns;

    assert.equal(run.status, "passed");
    assert.deepEqual(run.realized_phase_path, [
      "brainstorm",
      "specify",
      "review-specs",
      "specify",
      "review-specs",
      "plan",
      "implement",
      "validate",
    ]);
  });

  it("records subagent fan-out as separate events linked to the parent phase", async () => {
    const executePhase = async ({ phase }) => {
      if (phase.id === "review-specs") {
        return {
          status: "passed",
          triggerType: "on_fanout_complete",
          tokenUsage: { input_tokens: 30, output_tokens: 20, total_tokens: 50 },
          subagentRuns: [
            {
              actorId: "reviewer-security",
              actorRole: "security",
              status: "passed",
              tokenUsage: { input_tokens: 10, output_tokens: 4, total_tokens: 14 },
            },
            {
              actorId: "reviewer-architecture",
              actorRole: "architecture",
              status: "passed",
              tokenUsage: { input_tokens: 11, output_tokens: 5, total_tokens: 16 },
            },
          ],
        };
      }

      return {
        status: "passed",
        tokenUsage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      };
    };

    const [run] = (
      await runScenarioMatrix({
        scenarios: scenarios.filter((scenario) => scenario.scenario_id === "subagent-heavy-review"),
        executePhase,
        eventsDir: tempDir,
        makeRunId: () => "subagent-heavy-review-run-1",
        now: () => "2026-03-25T12:10:00.000Z",
      })
    ).scenarioRuns;

    const events = readFileSync(run.event_log_path, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const subagentEvents = events.filter((event) => event.actor_type === "subagent");

    assert.equal(run.status, "passed");
    assert.equal(subagentEvents.length, 2);
    assert.deepEqual(
      subagentEvents.map((event) => [event.parent_phase_id, event.actor_role]),
      [
        ["review-specs", "security"],
        ["review-specs", "architecture"],
      ],
    );
  });

  it("fails only the affected scenario on an unhandled transition and continues the matrix", async () => {
    const executePhase = async ({ scenario, phase }) => {
      if (scenario.scenario_id === "review-fails-once" && phase.id === "review-specs") {
        return {
          status: "failed",
          tokenUsage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
        };
      }
      return {
        status: "passed",
        tokenUsage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      };
    };

    const result = await runScenarioMatrix({
      scenarios: scenarios.filter((scenario) =>
        ["review-fails-once", "happy-path"].includes(scenario.scenario_id),
      ),
      executePhase,
      eventsDir: tempDir,
      makeRunId: (scenarioId) => `${scenarioId}-run-1`,
      now: () => "2026-03-25T12:15:00.000Z",
    });

    assert.deepEqual(
      result.scenarioRuns.map((run) => [run.scenario_id, run.status, run.reason_code]),
      [
        ["happy-path", "passed", null],
        ["review-fails-once", "failed", "unhandled_transition"],
      ],
    );
  });
});
