import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { normalizeTokenEvent, writeRawEventLog } from "./capture.mjs";
import { normalizePhaseExecutionResult } from "./providers/normalize-result.mjs";

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

function getSequentialNextPhaseId(scenario, phaseId) {
  const index = scenario.phases.findIndex((phase) => phase.id === phaseId);
  if (index === -1 || index === scenario.phases.length - 1) {
    return null;
  }
  return scenario.phases[index + 1].id;
}

function getMatchingBranches(branches, phaseId, triggerType) {
  return branches.filter((branch) => branch.from_phase_id === phaseId && branch.trigger_type === triggerType);
}

function getNextTrigger(status, explicitTriggerType) {
  if (typeof explicitTriggerType === "string" && explicitTriggerType.trim() !== "") {
    return explicitTriggerType;
  }
  if (status === "passed") {
    return "on_success";
  }
  if (status === "failed") {
    return "on_failure";
  }
  return null;
}

function createFallbackEvent({ scenario, phaseMap, runId, status, timestamp, providerId = null, modelId = null, reasonCode = null }) {
  const startPhase = phaseMap.get(scenario.start_phase_id);
  return normalizeTokenEvent({
    runId,
    providerId,
    modelId,
    scenarioId: scenario.scenario_id,
    eventId: `${scenario.start_phase_id}-attempt-1`,
    eventIndex: 0,
    actorType: "phase",
    phaseId: scenario.start_phase_id,
    phaseName: startPhase?.name ?? "Unknown",
    skillName: startPhase?.skill_name ?? "unknown",
    attempt: 1,
    status,
    reasonCode,
    timestamp,
    tokenUsage: {},
  });
}

async function runScenario({
  scenario,
  executePhase,
  eventsDir,
  makeRunId,
  now,
  artifactRoot = eventsDir,
  providerId = null,
}) {
  const phaseMap = getPhaseMap(scenario);
  const runId = makeRunId(scenario.scenario_id, providerId);
  const visitCounts = new Map();
  const events = [];
  const realizedPhasePath = [];
  const transitions = [];
  const artifactPaths = [];
  let steps = 0;
  let nextEventIndex = 0;
  let currentPhaseId = scenario.start_phase_id;
  let status = "incomplete";
  let reasonCode = null;
  let modelId = null;
  let fixtureProfileId = null;
  let fixtureComplexity = null;

  if (!phaseMap.has(currentPhaseId)) {
    status = "failed";
    reasonCode = "invalid_start_phase";
    currentPhaseId = null;
  }

  while (currentPhaseId) {
    if (steps >= scenario.max_total_steps) {
      status = "failed";
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
      status = "failed";
      reasonCode = "max_phase_visits_exceeded";
      break;
    }
    visitCounts.set(currentPhaseId, attempt);
    steps += 1;
    realizedPhasePath.push(currentPhaseId);

    let rawResult;
    try {
      rawResult = await executePhase({ scenario, phase, attempt, runId, artifactRoot, providerId });
    } catch (error) {
      status = error.runStatus ?? "incomplete";
      reasonCode = error.code ?? "phase_execution_error";
      break;
    }

    let normalized;
    try {
      normalized = normalizePhaseExecutionResult({
        providerId,
        scenario,
        phase,
        runId,
        attempt,
        timestamp: now(),
        eventIndexStart: nextEventIndex,
        artifactRoot,
        result: rawResult,
      });
    } catch (error) {
      status = "failed";
      reasonCode = error.code ?? "normalization_failed";
      break;
    }

    const phaseEvents = normalized.events;
    const subagentCount = phaseEvents.filter((event) => event.actor_type === "subagent").length;
    if (subagentCount > scenario.max_subagent_events_per_phase) {
      status = "failed";
      reasonCode = "max_subagent_events_exceeded";
      break;
    }

    events.push(...phaseEvents);
    nextEventIndex += phaseEvents.length;
    if (normalized.runMetadata.model_id && !modelId) {
      modelId = normalized.runMetadata.model_id;
    }
    if (normalized.runMetadata.fixture_profile_id && !fixtureProfileId) {
      fixtureProfileId = normalized.runMetadata.fixture_profile_id;
    }
    if (normalized.runMetadata.fixture_complexity && !fixtureComplexity) {
      fixtureComplexity = normalized.runMetadata.fixture_complexity;
    }
    for (const artifactPath of normalized.runMetadata.artifact_paths) {
      if (!artifactPaths.includes(artifactPath)) {
        artifactPaths.push(artifactPath);
      }
    }

    const triggerType = getNextTrigger(normalized.status, normalized.triggerType);
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

    if (normalized.status === "passed") {
      if (scenario.terminal_phase_ids.includes(phase.id)) {
        status = "passed";
        reasonCode = normalized.reasonCode;
        currentPhaseId = null;
        continue;
      }

      const sequentialNext = getSequentialNextPhaseId(scenario, phase.id);
      if (sequentialNext) {
        currentPhaseId = sequentialNext;
        continue;
      }
    }

    if (normalized.status === "incomplete") {
      status = "incomplete";
      reasonCode = normalized.reasonCode ?? "phase_incomplete";
      break;
    }

    status = "failed";
    reasonCode = normalized.reasonCode ?? "unhandled_transition";
    break;
  }

  mkdirSync(eventsDir, { recursive: true });
  let eventLogPath = null;
  try {
    eventLogPath = writeRawEventLog({
      outputDir: join(eventsDir, "raw"),
      scenarioId: scenario.scenario_id,
      runId,
      events:
        events.length > 0
          ? events
          : [
              createFallbackEvent({
                scenario,
                phaseMap,
                runId,
                status,
                timestamp: now(),
                providerId,
                modelId,
                reasonCode,
              }),
            ],
    });
  } catch (error) {
    status = "incomplete";
    reasonCode = "raw_event_write_failed";
  }

  return {
    run_id: runId,
    provider_id: providerId,
    model_id: modelId,
    fixture_profile_id: fixtureProfileId,
    fixture_complexity: fixtureComplexity,
    scenario_id: scenario.scenario_id,
    scenario_name: scenario.scenario_name,
    status,
    reason_code: reasonCode,
    realized_phase_path: realizedPhasePath,
    transitions,
    artifact_paths: artifactPaths,
    event_log_path: eventLogPath,
  };
}

export async function runScenarioMatrix({
  scenarios,
  executePhase,
  eventsDir,
  makeRunId = defaultRunId,
  now = () => new Date().toISOString(),
  artifactRoot = eventsDir,
  providerId = null,
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
      await runScenario({
        scenario,
        executePhase,
        eventsDir,
        makeRunId,
        now,
        artifactRoot,
        providerId,
      }),
    );
  }

  return { scenarioRuns };
}
