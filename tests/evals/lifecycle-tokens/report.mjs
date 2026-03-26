import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function escapeCell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function sumKnownTokens(events, predicate = () => true) {
  return events.reduce((total, event) => {
    if (!predicate(event)) {
      return total;
    }
    if (event.total_tokens_availability === "known") {
      return total + event.total_tokens;
    }
    return total;
  }, 0);
}

function countUnknowns(events) {
  return events.filter(
    (event) =>
      event.input_tokens_availability === "unknown" ||
      event.output_tokens_availability === "unknown" ||
      event.total_tokens_availability === "unknown",
  ).length;
}

function getDeclaredPath(scenario) {
  const nextByPhase = new Map(
    scenario.branches
      .filter((branch) => branch.trigger_type === "on_success" || branch.trigger_type === "on_fanout_complete")
      .map((branch) => [branch.from_phase_id, branch.to_phase_id]),
  );

  const path = [];
  const visited = new Set();
  let current = scenario.start_phase_id;

  while (current && !visited.has(current)) {
    path.push(current);
    if (scenario.terminal_phase_ids.includes(current)) {
      break;
    }
    visited.add(current);
    current = nextByPhase.get(current);
  }

  return path;
}

function getPhaseRows(events) {
  const rows = [];
  for (const event of events.filter((entry) => entry.actor_type === "main")) {
    rows.push(
      `| ${escapeCell(event.phase_id)} | ${event.attempt} | ${escapeCell(event.status)} | ${formatToken(event.total_tokens, event.total_tokens_availability)} |`,
    );
  }
  return rows;
}

function formatToken(value, availability) {
  return availability === "known" ? String(value) : "unknown";
}

function buildScenarioMetrics(events) {
  const mainEvents = events.filter((event) => event.actor_type === "main");
  const subagentEvents = events.filter((event) => event.actor_type === "subagent");
  const totalTokens = sumKnownTokens(events);
  const mainTokens = sumKnownTokens(mainEvents);
  const subagentTokens = sumKnownTokens(subagentEvents);
  const repeatedPhaseOverhead = mainEvents
    .filter((event) => event.attempt > 1 && event.total_tokens_availability === "known")
    .reduce((total, event) => total + event.total_tokens, 0);

  return {
    totalTokens,
    mainTokens,
    subagentTokens,
    repeatedPhaseOverhead,
    subagentShare: totalTokens > 0 ? ((subagentTokens / totalTokens) * 100).toFixed(1) : "0.0",
    unknownCount: countUnknowns(events),
  };
}

export function readEventLog(filePath) {
  return readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function generateScenarioReport({ scenario, run, events }) {
  const metrics = buildScenarioMetrics(events);
  const lines = [];

  lines.push(`# Scenario Report: ${scenario.scenario_name}`);
  lines.push("");
  lines.push(`- Scenario ID: ${scenario.scenario_id}`);
  lines.push(`- Run ID: ${run.run_id}`);
  lines.push(`- Status: ${run.status}`);
  lines.push(`- Total lifecycle tokens: ${metrics.totalTokens}`);
  lines.push("");
  lines.push("## Declared Path");
  lines.push("");
  lines.push(getDeclaredPath(scenario).join(" -> "));
  lines.push("");
  lines.push("## Realized Path");
  lines.push("");
  lines.push(run.realized_phase_path.join(" -> "));
  lines.push("");
  lines.push("## Phase Breakdown");
  lines.push("");
  lines.push("| Phase | Attempt | Status | Total Tokens |");
  lines.push("|---|---:|---|---:|");
  lines.push(...getPhaseRows(events));
  lines.push("");
  lines.push("## Retry And Fan-Out Overhead");
  lines.push("");
  lines.push(`- Retry/rework overhead: ${metrics.repeatedPhaseOverhead}`);
  lines.push(`- Fan-out overhead: ${metrics.subagentTokens}`);
  lines.push(`- Subagent share: ${metrics.subagentShare}%`);
  if (metrics.unknownCount > 0) {
    lines.push(`- Unknown token events: ${metrics.unknownCount}`);
  }
  lines.push("");

  return lines.join("\n");
}

export function generateRollupReport({ scenarios, scenarioRuns, eventsByRun }) {
  const scenarioMap = new Map(scenarios.map((scenario) => [scenario.scenario_id, scenario]));
  const rows = scenarioRuns.map((run) => {
    const events = eventsByRun[run.run_id] ?? [];
    const metrics = buildScenarioMetrics(events);
    return {
      run,
      scenario: scenarioMap.get(run.scenario_id),
      metrics,
    };
  });

  rows.sort((left, right) => right.metrics.totalTokens - left.metrics.totalTokens);

  const lines = [];
  lines.push("# Lifecycle Token Rollup");
  lines.push("");
  lines.push("## Scenario Rankings");
  lines.push("");
  lines.push("| Scenario | Status | Total Tokens | Retry Overhead | Fan-Out Overhead |");
  lines.push("|---|---|---:|---:|---:|");
  for (const row of rows) {
    lines.push(
      `| ${escapeCell(row.run.scenario_id)} | ${escapeCell(row.run.status)} | ${row.metrics.totalTokens} | ${row.metrics.repeatedPhaseOverhead} | ${row.metrics.subagentTokens} |`,
    );
  }
  lines.push("");
  lines.push("## Retry Overhead");
  lines.push("");
  for (const row of rows.filter((entry) => entry.metrics.repeatedPhaseOverhead > 0)) {
    lines.push(`- ${row.run.scenario_id}: ${row.metrics.repeatedPhaseOverhead}`);
  }
  if (!rows.some((entry) => entry.metrics.repeatedPhaseOverhead > 0)) {
    lines.push("- None");
  }
  lines.push("");
  lines.push("## Fan-Out Overhead");
  lines.push("");
  for (const row of rows.filter((entry) => entry.metrics.subagentTokens > 0)) {
    lines.push(`- ${row.run.scenario_id}: ${row.metrics.subagentTokens} (${row.metrics.subagentShare}% subagent share)`);
  }
  if (!rows.some((entry) => entry.metrics.subagentTokens > 0)) {
    lines.push("- None");
  }
  lines.push("");
  lines.push("## Top Optimization Candidates");
  lines.push("");
  if (rows[0]) {
    lines.push(`- Highest total scenario: ${rows[0].run.scenario_id} (${rows[0].metrics.totalTokens} tokens)`);
  }
  const retryLeader = rows.find((entry) => entry.metrics.repeatedPhaseOverhead > 0);
  if (retryLeader) {
    lines.push(`- Highest retry overhead: ${retryLeader.run.scenario_id} (${retryLeader.metrics.repeatedPhaseOverhead} tokens)`);
  }
  const fanoutLeader = rows.find((entry) => entry.metrics.subagentTokens > 0);
  if (fanoutLeader) {
    lines.push(`- Highest fan-out overhead: ${fanoutLeader.run.scenario_id} (${fanoutLeader.metrics.subagentTokens} tokens)`);
  }
  if (rows.some((entry) => entry.metrics.unknownCount > 0)) {
    lines.push("- Unknown token data remains in this run; prioritize instrumentation gaps before budget enforcement.");
  }
  lines.push("");

  return lines.join("\n");
}

export function writeReports({ scenarios, scenarioRuns, reportsDir }) {
  mkdirSync(reportsDir, { recursive: true });

  const scenarioReportPaths = [];
  const eventsByRun = {};

  for (const run of scenarioRuns) {
    const scenario = scenarios.find((entry) => entry.scenario_id === run.scenario_id);
    const events = readEventLog(run.event_log_path);
    eventsByRun[run.run_id] = events;
    const scenarioReport = generateScenarioReport({ scenario, run, events });
    const scenarioReportPath = join(reportsDir, `${run.scenario_id}.md`);
    writeFileSync(scenarioReportPath, scenarioReport, "utf8");
    scenarioReportPaths.push(scenarioReportPath);
  }

  const rollupReportPath = join(reportsDir, "ROLLUP.md");
  writeFileSync(
    rollupReportPath,
    generateRollupReport({ scenarios, scenarioRuns, eventsByRun }),
    "utf8",
  );

  return {
    scenarioReportPaths,
    rollupReportPath,
  };
}
