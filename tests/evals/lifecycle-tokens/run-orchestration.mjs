import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { normalizeTokenEvent, writeRawEventLog } from "./capture.mjs";

function fail(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
}

function defaultRunId(scenarioId) {
  return `${scenarioId}-${Date.now()}`;
}

function getPhaseMap(scenario) {
  return new Map(scenario.phases.map((phase) => [phase.id, phase]));
}

function getMatchingBranches(branches, phaseId, triggerType) {
  return branches.filter((branch) => branch.from_phase_id === phaseId && branch.trigger_type === triggerType);
}

function getNextTrigger(result) {
  if (typeof result.triggerType === "string" && result.triggerType.trim() !== "") {
    return result.triggerType;
  }
  if (result.status === "passed") {
    return "on_success";
  }
  if (result.status === "failed") {
    return "on_failure";
  }
  return null;
}

async function runScenario({ scenario, executePhase, eventsDir, makeRunId, now }) {
  const phaseMap = getPhaseMap(scenario);
  const runId = makeRunId(scenario.scenario_id);
  const visitCounts = new Map();
  const events = [];
  const realizedPhasePath = [];
  const transitions = [];
  let steps = 0;
  let currentPhaseId = scenario.start_phase_id;
  let status = "incomplete";
  let reasonCode = null;

  while (currentPhaseId) {
    if (steps >= scenario.max_total_steps) {
      reasonCode = "max_total_steps_exceeded";
      break;
    }

    const phase = phaseMap.get(currentPhaseId);
    if (!phase) {
      status = "failed";
      reasonCode = "unknown_phase";
      break;
    }

    const attempt = (visitCounts.get(currentPhaseId) ?? 0) + 1;
    if (attempt > scenario.max_phase_visits) {
      reasonCode = "max_phase_visits_exceeded";
      break;
    }
    visitCounts.set(currentPhaseId, attempt);
    steps += 1;
    realizedPhasePath.push(currentPhaseId);

    let result;
    try {
      result = await executePhase({ scenario, phase, attempt, runId });
    } catch (error) {
      reasonCode = "execution_error";
      break;
    }

    if (!result || typeof result !== "object" || typeof result.status !== "string") {
      status = "failed";
      reasonCode = "invalid_phase_result";
      break;
    }

    events.push(
      normalizeTokenEvent({
        runId,
        scenarioId: scenario.scenario_id,
        phaseId: phase.id,
        phaseName: phase.name,
        skillName: phase.skill_name,
        attempt,
        actorType: "main",
        actorId: `${phase.id}-attempt-${attempt}`,
        status: result.status,
        timestamp: now(),
        tokenUsage: result.tokenUsage,
      }),
    );

    const subagentRuns = result.subagentRuns ?? [];
    if (!Array.isArray(subagentRuns)) {
      status = "failed";
      reasonCode = "invalid_subagent_payload";
      break;
    }
    if (subagentRuns.length > scenario.max_subagent_events_per_phase) {
      reasonCode = "max_subagent_events_exceeded";
      break;
    }

    for (const [index, subagentRun] of subagentRuns.entries()) {
      events.push(
        normalizeTokenEvent({
          runId,
          scenarioId: scenario.scenario_id,
          phaseId: phase.id,
          phaseName: phase.name,
          skillName: phase.skill_name,
          attempt,
          actorType: "subagent",
          actorId: subagentRun.actorId ?? `${phase.id}-subagent-${index + 1}`,
          actorRole: subagentRun.actorRole ?? null,
          parentPhaseId: phase.id,
          status: subagentRun.status ?? "incomplete",
          timestamp: now(),
          tokenUsage: subagentRun.tokenUsage,
        }),
      );
    }

    const triggerType = getNextTrigger(result);
    const matchingBranches = triggerType ? getMatchingBranches(scenario.branches, phase.id, triggerType) : [];

    if (matchingBranches.length > 1) {
      status = "failed";
      reasonCode = "ambiguous_branch";
      break;
    }

    if (matchingBranches.length === 1) {
      const [branch] = matchingBranches;
      transitions.push({
        branch_id: branch.branch_id,
        from_phase_id: branch.from_phase_id,
        to_phase_id: branch.to_phase_id,
        trigger_type: branch.trigger_type,
      });
      currentPhaseId = branch.to_phase_id;
      continue;
    }

    if (result.status === "passed" && scenario.terminal_phase_ids.includes(phase.id)) {
      status = "passed";
      reasonCode = null;
      currentPhaseId = null;
      continue;
    }

    if (result.status === "incomplete") {
      reasonCode = "phase_incomplete";
      break;
    }

    status = "failed";
    reasonCode = "unhandled_transition";
    break;
  }

  mkdirSync(eventsDir, { recursive: true });
  const eventLogPath = writeRawEventLog({
    outputDir: join(eventsDir, "raw"),
    scenarioId: scenario.scenario_id,
    runId,
    events: events.length > 0
      ? events
      : [
          normalizeTokenEvent({
            runId,
            scenarioId: scenario.scenario_id,
            phaseId: scenario.start_phase_id,
            phaseName: phaseMap.get(scenario.start_phase_id)?.name ?? "Unknown",
            skillName: phaseMap.get(scenario.start_phase_id)?.skill_name ?? "unknown",
            attempt: 1,
            actorType: "main",
            actorId: `${scenario.start_phase_id}-attempt-1`,
            status,
            timestamp: now(),
            tokenUsage: {},
          }),
        ],
  });

  return {
    run_id: runId,
    scenario_id: scenario.scenario_id,
    scenario_name: scenario.scenario_name,
    status,
    reason_code: reasonCode,
    realized_phase_path: realizedPhasePath,
    transitions,
    event_log_path: eventLogPath,
  };
}

export async function runScenarioMatrix({
  scenarios,
  executePhase,
  eventsDir,
  makeRunId = defaultRunId,
  now = () => new Date().toISOString(),
}) {
  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    fail("missing_required_field", "scenarios must be a non-empty array");
  }
  if (typeof executePhase !== "function") {
    fail("missing_required_field", "executePhase must be a function");
  }
  if (typeof eventsDir !== "string" || eventsDir.trim() === "") {
    fail("missing_required_field", "eventsDir is required");
  }

  const orderedScenarios = [...scenarios].sort((left, right) =>
    left.scenario_id.localeCompare(right.scenario_id),
  );
  const scenarioRuns = [];

  for (const scenario of orderedScenarios) {
    scenarioRuns.push(
      await runScenario({ scenario, executePhase, eventsDir, makeRunId, now }),
    );
  }

  return { scenarioRuns };
}
