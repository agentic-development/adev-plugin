import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { loadScenarioRegistry } from "./registry.mjs";
import { runScenarioMatrix } from "./run-orchestration.mjs";
import { generateRollupReport, generateScenarioReport, readEventLog, writeReports } from "./report.mjs";

const SCENARIOS_DIR = new URL("./scenarios/", import.meta.url);

describe("scenario reporting", () => {
  let tempDir;
  let scenarios;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "lifecycle-report-"));
    scenarios = loadScenarioRegistry(SCENARIOS_DIR);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("generates a scenario report with declared and realized paths plus overhead sections", async () => {
    const executePhase = async ({ phase }) => {
      if (phase.id === "review-specs") {
        return {
          status: "passed",
          triggerType: "on_fanout_complete",
          tokenUsage: { input_tokens: 40, output_tokens: 20, total_tokens: 60 },
          subagentRuns: [
            {
              actorId: "reviewer-security",
              actorRole: "security",
              status: "passed",
              tokenUsage: { input_tokens: 12, output_tokens: 6, total_tokens: 18 },
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
        now: () => "2026-03-25T12:20:00.000Z",
      })
    ).scenarioRuns;

    const report = generateScenarioReport({
      scenario: scenarios.find((scenario) => scenario.scenario_id === "subagent-heavy-review"),
      run,
      events: readEventLog(run.event_log_path),
    });

    assert.match(report, /# Scenario Report: Subagent Heavy Review/);
    assert.match(report, /## Declared Path/);
    assert.match(report, /brainstorm -> specify -> review-specs -> plan -> implement -> validate/);
    assert.match(report, /## Realized Path/);
    assert.match(report, /## Retry And Fan-Out Overhead/);
    assert.match(report, /Subagent share/);
  });

  it("generates a rollup report ranked by total lifecycle tokens and flags optimization candidates", async () => {
    const executePhase = async ({ scenario, phase }) => {
      if (scenario.scenario_id === "review-fails-once" && phase.id === "review-specs") {
        return {
          status: "failed",
          triggerType: "on_review_reject",
          tokenUsage: { input_tokens: 35, output_tokens: 15, total_tokens: 50 },
        };
      }
      if (scenario.scenario_id === "subagent-heavy-review" && phase.id === "review-specs") {
        return {
          status: "passed",
          triggerType: "on_fanout_complete",
          tokenUsage: { input_tokens: 45, output_tokens: 20, total_tokens: 65 },
          subagentRuns: [
            {
              actorId: "reviewer-security",
              actorRole: "security",
              status: "passed",
              tokenUsage: { input_tokens: 18, output_tokens: 6, total_tokens: 24 },
            },
            {
              actorId: "reviewer-arch",
              actorRole: "architecture",
              status: "passed",
              tokenUsage: {},
            },
          ],
        };
      }
      return {
        status: "passed",
        tokenUsage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      };
    };

    const result = await runScenarioMatrix({
      scenarios,
      executePhase,
      eventsDir: tempDir,
      makeRunId: (scenarioId) => `${scenarioId}-run-1`,
      now: () => "2026-03-25T12:25:00.000Z",
    });

    const reports = writeReports({
      scenarios,
      scenarioRuns: result.scenarioRuns,
      reportsDir: join(tempDir, "reports"),
    });
    const rollup = generateRollupReport({
      scenarios,
      scenarioRuns: result.scenarioRuns,
      eventsByRun: Object.fromEntries(
        result.scenarioRuns.map((run) => [run.run_id, readEventLog(run.event_log_path)]),
      ),
    });

    assert.equal(reports.scenarioReportPaths.length, 3);
    assert.match(rollup, /# Lifecycle Token Rollup/);
    assert.match(rollup, /\| review-fails-once \|/);
    assert.match(rollup, /## Retry Overhead/);
    assert.match(rollup, /## Fan-Out Overhead/);
    assert.match(rollup, /## Top Optimization Candidates/);
    assert.match(rollup, /Unknown token data remains in this run/);
  });
});
