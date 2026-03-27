import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function escapeCell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function formatToken(value, availability) {
  return availability === "known" ? String(value) : "unknown";
}

function readEventsSafely(run) {
  if (!run.event_log_path || !existsSync(run.event_log_path)) {
    return [];
  }
  return readEventLog(run.event_log_path);
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

function sortRowsWithUnknowns(rows, selector, fallbackSelector) {
  rows.sort((left, right) => {
    const leftValue = selector(left);
    const rightValue = selector(right);
    const leftKnown = leftValue !== null;
    const rightKnown = rightValue !== null;

    if (leftKnown !== rightKnown) {
      return leftKnown ? -1 : 1;
    }
    if (leftKnown && rightKnown && leftValue !== rightValue) {
      return rightValue - leftValue;
    }
    return fallbackSelector(left).localeCompare(fallbackSelector(right));
  });
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
  return events
    .filter((entry) => entry.actor_type === "phase")
    .map(
      (event) =>
        `| ${escapeCell(event.phase_id)} | ${event.attempt} | ${escapeCell(event.status)} | ${formatToken(event.total_tokens, event.total_tokens_availability)} |`,
    );
}

function buildScenarioMetrics(events) {
  const phaseEvents = events.filter((event) => event.actor_type === "phase");
  const subagentEvents = events.filter((event) => event.actor_type === "subagent");
  const totalTokens = sumKnownTokens(events);
  const phaseTokens = sumKnownTokens(phaseEvents);
  const subagentTokens = sumKnownTokens(subagentEvents);
  const repeatedPhaseOverhead = phaseEvents
    .filter((event) => event.attempt > 1 && event.total_tokens_availability === "known")
    .reduce((total, event) => total + event.total_tokens, 0);
  const uniquePhaseCount = new Set(phaseEvents.map((event) => event.phase_id)).size;
  const retryMultiplier =
    uniquePhaseCount > 0 ? (phaseEvents.length / uniquePhaseCount).toFixed(2) : "1.00";

  return {
    totalTokens,
    phaseTokens,
    subagentTokens,
    repeatedPhaseOverhead,
    retryMultiplier,
    subagentShare: totalTokens > 0 ? ((subagentTokens / totalTokens) * 100).toFixed(1) : "0.0",
    unknownCount: countUnknowns(events),
  };
}

function aggregatePhaseRankings(eventsByRun) {
  const phaseTotals = new Map();

  for (const events of Object.values(eventsByRun)) {
    for (const event of events.filter((entry) => entry.actor_type === "phase")) {
      const key = `${event.phase_id}|${event.phase_name}`;
      const existing = phaseTotals.get(key) ?? {
        phase_id: event.phase_id,
        phase_name: event.phase_name,
        total_tokens: 0,
        has_known_tokens: false,
      };
      if (event.total_tokens_availability === "known") {
        existing.total_tokens += event.total_tokens;
        existing.has_known_tokens = true;
      }
      phaseTotals.set(key, existing);
    }
  }

  const rows = [...phaseTotals.values()].map((entry) => ({
    ...entry,
    rank_value: entry.has_known_tokens ? entry.total_tokens : null,
  }));
  sortRowsWithUnknowns(rows, (row) => row.rank_value, (row) => row.phase_id);
  return rows;
}

function buildProviderTotals(scenarioRuns, eventsByRun) {
  const providerTotals = new Map();

  for (const run of scenarioRuns) {
    const key = run.provider_id;
    if (!key) {
      continue;
    }
    const metrics = buildScenarioMetrics(eventsByRun[run.run_id] ?? []);
    const existing = providerTotals.get(key) ?? {
      provider_id: key,
      known_total_tokens: 0,
      unknown_runs: 0,
      incomplete_runs: 0,
      failed_runs: 0,
    };
    existing.known_total_tokens += metrics.totalTokens;
    if (metrics.unknownCount > 0) {
      existing.unknown_runs += 1;
    }
    if (run.status === "incomplete") {
      existing.incomplete_runs += 1;
    }
    if (run.status === "failed") {
      existing.failed_runs += 1;
    }
    providerTotals.set(key, existing);
  }

  return [...providerTotals.values()].sort((left, right) =>
    left.provider_id.localeCompare(right.provider_id),
  );
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

  lines.push(`# Scenario Report: ${escapeCell(scenario.scenario_name)}`);
  lines.push("");
  lines.push(`- Scenario ID: ${escapeCell(scenario.scenario_id)}`);
  lines.push(`- Run ID: ${escapeCell(run.run_id)}`);
  if (run.provider_id) {
    lines.push(`- Provider ID: ${escapeCell(run.provider_id)}`);
  }
  if (run.fixture_profile_id) {
    lines.push(`- Fixture Profile: ${escapeCell(run.fixture_profile_id)}`);
  }
  if (run.fixture_complexity) {
    lines.push(`- Fixture Complexity: ${escapeCell(run.fixture_complexity)}`);
  }
  if (run.model_id) {
    lines.push(`- Model ID: ${escapeCell(run.model_id)}`);
  }
  lines.push(`- Status: ${escapeCell(run.status)}`);
  if (run.reason_code) {
    lines.push(`- Reason Code: ${escapeCell(run.reason_code)}`);
  }
  lines.push(`- Total lifecycle tokens: ${metrics.totalTokens}`);
  lines.push("");
  lines.push("## Declared Path");
  lines.push("");
  lines.push(getDeclaredPath(scenario).join(" -> "));
  lines.push("");
  lines.push("## Realized Path");
  lines.push("");
  lines.push(run.realized_phase_path.length > 0 ? run.realized_phase_path.join(" -> ") : "(none)");
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
  lines.push(`- Retry multiplier: ${metrics.retryMultiplier}x`);
  lines.push(`- Subagent share: ${metrics.subagentShare}%`);
  if (metrics.unknownCount > 0) {
    lines.push(`- Unknown token events: ${metrics.unknownCount}`);
  }
  lines.push("");

  return lines.join("\n");
}

export function generateRollupReport({ scenarios, scenarioRuns, eventsByRun, invocation = { mode: "fixture" } }) {
  const scenarioMap = new Map(scenarios.map((scenario) => [scenario.scenario_id, scenario]));
  const rows = scenarioRuns.map((run) => {
    const events = eventsByRun[run.run_id] ?? [];
    return {
      run,
      scenario: scenarioMap.get(run.scenario_id),
      metrics: buildScenarioMetrics(events),
    };
  });

  rows.sort((left, right) => {
    if (left.metrics.totalTokens !== right.metrics.totalTokens) {
      return right.metrics.totalTokens - left.metrics.totalTokens;
    }
    return left.run.scenario_id.localeCompare(right.run.scenario_id);
  });

  const phaseRankings = aggregatePhaseRankings(eventsByRun);

  const lines = [];
  lines.push("# Lifecycle Token Rollup");
  lines.push("");
  if (invocation.fixtureProfileId) {
    lines.push(`- Fixture Profile: ${escapeCell(invocation.fixtureProfileId)}`);
    lines.push("");
  }
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
  lines.push("## Phase Rankings");
  lines.push("");
  lines.push("| Phase | Total Tokens |");
  lines.push("|---|---:|");
  for (const phaseRow of phaseRankings) {
    lines.push(
      `| ${escapeCell(phaseRow.phase_name)} | ${phaseRow.rank_value === null ? "unknown" : phaseRow.rank_value} |`,
    );
  }
  lines.push("");
  lines.push("## Retry Multipliers");
  lines.push("");
  for (const row of rows) {
    lines.push(`- ${row.run.scenario_id}: ${row.metrics.retryMultiplier}x`);
  }
  lines.push("");
  lines.push("## Subagent Cost Share");
  lines.push("");
  for (const row of rows) {
    lines.push(`- ${row.run.scenario_id}: ${row.metrics.subagentShare}%`);
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

export function generateCrossProviderReport({
  scenarios,
  scenarioRuns,
  eventsByRun,
  scenarioReportPathsByRun = {},
  invocation = { mode: "live" },
}) {
  const scenarioMap = new Map(scenarios.map((scenario) => [scenario.scenario_id, scenario]));
  const providerTotals = buildProviderTotals(scenarioRuns, eventsByRun);
  const findings = [];
  const lines = [];

  lines.push("# Cross-Provider Rollup");
  lines.push("");
  if (invocation.fixtureProfileId) {
    lines.push(`- Fixture Profile: ${escapeCell(invocation.fixtureProfileId)}`);
    lines.push("");
  }
  lines.push("## Provider Totals");
  lines.push("");
  lines.push("| Provider | Known Total Tokens | Unknown Runs | Failed Runs | Incomplete Runs |");
  lines.push("|---|---:|---:|---:|---:|");
  for (const providerTotal of providerTotals) {
    lines.push(
      `| ${escapeCell(providerTotal.provider_id)} | ${providerTotal.known_total_tokens} | ${providerTotal.unknown_runs} | ${providerTotal.failed_runs} | ${providerTotal.incomplete_runs} |`,
    );
    if (providerTotal.unknown_runs > 0) {
      findings.push(`${providerTotal.provider_id} reported unknown token fields in ${providerTotal.unknown_runs} run(s).`);
    }
    if (providerTotal.incomplete_runs > 0) {
      findings.push(`${providerTotal.provider_id} produced ${providerTotal.incomplete_runs} incomplete run(s).`);
    }
  }
  lines.push("");

  for (const scenario of scenarios) {
    const rows = scenarioRuns
      .filter((run) => run.scenario_id === scenario.scenario_id && run.provider_id)
      .map((run) => {
        const events = eventsByRun[run.run_id] ?? [];
        const metrics = buildScenarioMetrics(events);
        return {
          run,
          modelLabel: run.model_id ?? "unknown",
          totalTokens: metrics.unknownCount > 0 ? null : metrics.totalTokens,
          retryOverhead: metrics.repeatedPhaseOverhead,
          fanoutOverhead: metrics.subagentTokens,
          unknownCount: metrics.unknownCount,
        };
      });

    sortRowsWithUnknowns(rows, (row) => row.totalTokens, (row) => row.run.provider_id);

    lines.push(`## Scenario: ${escapeCell(scenarioMap.get(scenario.scenario_id)?.scenario_name ?? scenario.scenario_id)}`);
    lines.push("");
    lines.push("| Provider | Model | Status | Reason | Total Tokens | Retry Overhead | Fan-Out Overhead | Unknown Events |");
    lines.push("|---|---|---|---|---:|---:|---:|---:|");

    for (const row of rows) {
      lines.push(
        `| ${escapeCell(row.run.provider_id)} | ${escapeCell(row.modelLabel)} | ${escapeCell(row.run.status)} | ${escapeCell(row.run.reason_code ?? "")} | ${row.totalTokens === null ? "unknown" : row.totalTokens} | ${row.retryOverhead} | ${row.fanoutOverhead} | ${row.unknownCount} |`,
      );

      const reportPath = scenarioReportPathsByRun[row.run.run_id];
      if (!reportPath || !existsSync(reportPath)) {
        findings.push(`Missing provider-scoped report for ${row.run.run_id} at ${reportPath ?? join("tests/evals/lifecycle-tokens/reports", `${row.run.run_id}.md`)}.`);
      }
    }

    lines.push("");
  }

  lines.push("## Incomplete And Failed Runs");
  lines.push("");
  for (const run of scenarioRuns.filter((entry) => entry.status !== "passed" && entry.provider_id)) {
    lines.push(`- ${escapeCell(run.provider_id)} / ${escapeCell(run.scenario_id)}: ${escapeCell(run.status)} (${escapeCell(run.reason_code ?? "unknown_reason")})`);
  }
  if (!scenarioRuns.some((entry) => entry.status !== "passed" && entry.provider_id)) {
    lines.push("- None");
  }
  lines.push("");
  lines.push("## Integration Findings");
  lines.push("");
  if (findings.length === 0) {
    lines.push("- None");
  } else {
    for (const finding of [...new Set(findings)].sort((left, right) => left.localeCompare(right))) {
      lines.push(`- ${escapeCell(finding)}`);
    }
  }
  lines.push("");

  return lines.join("\n");
}

export function writeReports({
  scenarios,
  scenarioRuns,
  reportsDir,
  invocation = { mode: "fixture" },
}) {
  mkdirSync(reportsDir, { recursive: true });

  const scenarioReportPaths = [];
  const scenarioReportPathsByRun = {};
  const eventsByRun = {};

  for (const run of scenarioRuns) {
    const scenario = scenarios.find((entry) => entry.scenario_id === run.scenario_id);
    const events = readEventsSafely(run);
    eventsByRun[run.run_id] = events;
    const scenarioReport = generateScenarioReport({ scenario, run, events });
    const scenarioReportPath = join(reportsDir, `${run.run_id}.md`);
    writeFileSync(scenarioReportPath, scenarioReport, "utf8");
    scenarioReportPaths.push(scenarioReportPath);
    scenarioReportPathsByRun[run.run_id] = scenarioReportPath;
  }

  const rollupReportPath = join(reportsDir, "ROLLUP.md");
  writeFileSync(
    rollupReportPath,
    generateRollupReport({ scenarios, scenarioRuns, eventsByRun, invocation }),
    "utf8",
  );

  let crossProviderReportPath = null;
  if (invocation.mode === "live") {
    crossProviderReportPath = join(reportsDir, "CROSS_PROVIDER.md");
    writeFileSync(
      crossProviderReportPath,
      generateCrossProviderReport({
        scenarios,
        scenarioRuns,
        eventsByRun,
        scenarioReportPathsByRun,
        invocation,
      }),
      "utf8",
    );
  }

  return {
    scenarioReportPaths,
    scenarioReportPathsByRun,
    rollupReportPath,
    crossProviderReportPath,
  };
}
