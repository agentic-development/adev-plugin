#!/usr/bin/env node

import { mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadScenarioRegistry } from "./registry.mjs";
import { runScenarioMatrix } from "./run-orchestration.mjs";
import { writeReports } from "./report.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const scenariosDir = join(__dirname, "scenarios");
const artifactsDir = join(__dirname, "reports");
const rawDir = join(artifactsDir, "raw");

function createFixtureExecutor() {
  const phaseAttempts = new Map();

  return async function executePhase({ scenario, phase }) {
    const key = `${scenario.scenario_id}:${phase.id}`;
    const attempt = (phaseAttempts.get(key) ?? 0) + 1;
    phaseAttempts.set(key, attempt);

    if (scenario.scenario_id === "review-fails-once" && phase.id === "review-specs" && attempt === 1) {
      return {
        status: "failed",
        triggerType: "on_review_reject",
        tokenUsage: { input_tokens: 38, output_tokens: 16, total_tokens: 54 },
      };
    }

    if (scenario.scenario_id === "subagent-heavy-review" && phase.id === "review-specs") {
      return {
        status: "passed",
        triggerType: "on_fanout_complete",
        tokenUsage: { input_tokens: 44, output_tokens: 18, total_tokens: 62 },
        subagentRuns: [
          {
            actorId: "reviewer-security",
            actorRole: "security",
            status: "passed",
            tokenUsage: { input_tokens: 16, output_tokens: 7, total_tokens: 23 },
          },
          {
            actorId: "reviewer-architecture",
            actorRole: "architecture",
            status: "passed",
            tokenUsage: { input_tokens: 14, output_tokens: 6, total_tokens: 20 },
          },
        ],
      };
    }

    return {
      status: "passed",
      tokenUsage: { input_tokens: 12, output_tokens: 6, total_tokens: 18 },
    };
  };
}

async function main() {
  const scenarios = loadScenarioRegistry(scenariosDir);
  rmSync(rawDir, { recursive: true, force: true });
  mkdirSync(artifactsDir, { recursive: true });

  const result = await runScenarioMatrix({
    scenarios,
    executePhase: createFixtureExecutor(),
    eventsDir: artifactsDir,
  });

  const reports = writeReports({
    scenarios,
    scenarioRuns: result.scenarioRuns,
    reportsDir: artifactsDir,
    invocation: { mode: "fixture" },
  });

  console.log("Lifecycle Token Eval");
  console.log("====================");
  for (const run of result.scenarioRuns) {
    console.log(`${run.scenario_id}: ${run.status}${run.reason_code ? ` (${run.reason_code})` : ""}`);
  }
  console.log(`Rollup: ${resolve(reports.rollupReportPath)}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
