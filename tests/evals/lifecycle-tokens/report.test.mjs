import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { loadScenarioRegistry } from "./registry.mjs";
import { runScenarioMatrix } from "./run-orchestration.mjs";
import {
  generateCrossProviderReport,
  generateRollupReport,
  generateScenarioReport,
  readEventLog,
  writeReports,
} from "./report.mjs";

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
        artifactRoot: tempDir,
        makeRunId: () => "codex-subagent-heavy-review-run-1",
        now: () => "2026-03-25T12:20:00.000Z",
        providerId: "codex",
      })
    ).scenarioRuns;
    run.fixture_profile_id = "sample-project-medium";
    run.fixture_complexity = "medium";

    const report = generateScenarioReport({
      scenario: scenarios.find((scenario) => scenario.scenario_id === "subagent-heavy-review"),
      run,
      events: readEventLog(run.event_log_path),
    });

    assert.match(report, /# Scenario Report: Subagent Heavy Review/);
    assert.match(report, /Provider ID: codex/);
    assert.match(report, /Fixture Profile: sample-project-medium/);
    assert.match(report, /Fixture Complexity: medium/);
    assert.match(report, /## Declared Path/);
    assert.match(report, /brainstorm -> specify -> review-specs -> plan -> implement -> validate/);
    assert.match(report, /## Realized Path/);
    assert.match(report, /## Retry And Fan-Out Overhead/);
    assert.match(report, /Retry multiplier/);
    assert.match(report, /Subagent share/);
  });

  it("generates rollup and cross-provider reports with deterministic report paths", async () => {
    const executePhase = async ({ scenario, phase, providerId }) => {
      if (scenario.scenario_id === "review-fails-once" && phase.id === "review-specs") {
        return {
          status: providerId === "claude-code" ? "failed" : "passed",
          triggerType: providerId === "claude-code" ? "on_review_reject" : "on_success",
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
              actorRole: "security",
              status: "passed",
              tokenUsage: { input_tokens: 18, output_tokens: 6, total_tokens: 24 },
            },
            {
              actorRole: "architecture",
              status: "passed",
              tokenUsage: providerId === "opencode" ? {} : { input_tokens: 9, output_tokens: 3, total_tokens: 12 },
            },
          ],
        };
      }
      return {
        status: "passed",
        tokenUsage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      };
    };

    const codexRuns = (
      await runScenarioMatrix({
        scenarios,
        providerId: "codex",
        executePhase,
        eventsDir: tempDir,
        artifactRoot: tempDir,
        makeRunId: (scenarioId) => `codex-${scenarioId}-run-1`,
        now: () => "2026-03-25T12:25:00.000Z",
      })
    ).scenarioRuns;
    const claudeRuns = (
      await runScenarioMatrix({
        scenarios,
        providerId: "claude-code",
        executePhase,
        eventsDir: tempDir,
        artifactRoot: tempDir,
        makeRunId: (scenarioId) => `claude-code-${scenarioId}-run-1`,
        now: () => "2026-03-25T12:25:00.000Z",
      })
    ).scenarioRuns;
    const opencodeRuns = (
      await runScenarioMatrix({
        scenarios,
        providerId: "opencode",
        executePhase,
        eventsDir: tempDir,
        artifactRoot: tempDir,
        makeRunId: (scenarioId) => `opencode-${scenarioId}-run-1`,
        now: () => "2026-03-25T12:25:00.000Z",
      })
    ).scenarioRuns;

    const scenarioRuns = [...claudeRuns, ...codexRuns, ...opencodeRuns];
    for (const run of scenarioRuns) {
      run.fixture_profile_id = "sample-project-small";
      run.fixture_complexity = "small";
    }
    const reports = writeReports({
      scenarios,
      scenarioRuns,
      reportsDir: join(tempDir, "reports"),
      invocation: { mode: "live", fixtureProfileId: "sample-project-small" },
    });

    assert.equal(reports.scenarioReportPaths.length, 9);
    assert.equal(existsSync(join(tempDir, "reports", "codex-happy-path-run-1.md")), true);
    assert.equal(existsSync(reports.crossProviderReportPath), true);

    const rollup = generateRollupReport({
      scenarios,
      scenarioRuns,
      eventsByRun: Object.fromEntries(
        scenarioRuns.map((run) => [run.run_id, readEventLog(run.event_log_path)]),
      ),
      invocation: { mode: "live", fixtureProfileId: "sample-project-small" },
    });

    assert.match(rollup, /## Phase Rankings/);
    assert.match(rollup, /Fixture Profile: sample-project-small/);
    assert.match(rollup, /## Retry Multipliers/);
    assert.match(rollup, /## Subagent Cost Share/);
    assert.match(rollup, /Unknown token data remains in this run/);

    unlinkSync(reports.scenarioReportPathsByRun["codex-happy-path-run-1"]);
    const crossProvider = generateCrossProviderReport({
      scenarios,
      scenarioRuns,
      eventsByRun: Object.fromEntries(
        scenarioRuns.map((run) => [run.run_id, readEventLog(run.event_log_path)]),
      ),
      scenarioReportPathsByRun: reports.scenarioReportPathsByRun,
      invocation: { mode: "live", fixtureProfileId: "sample-project-small" },
    });

    assert.match(crossProvider, /# Cross-Provider Rollup/);
    assert.match(crossProvider, /Fixture Profile: sample-project-small/);
    assert.match(crossProvider, /## Provider Totals/);
    assert.match(crossProvider, /## Scenario: Happy Path/);
    assert.match(crossProvider, /\| codex \|/);
    assert.match(crossProvider, /Missing provider-scoped report for codex-happy-path-run-1/);
  });
});
