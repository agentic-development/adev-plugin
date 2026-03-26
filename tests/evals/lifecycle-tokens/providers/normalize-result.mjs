import { relative, resolve, sep } from "node:path";

import { normalizeTokenEvent } from "../capture.mjs";

const STATUS_TYPES = new Set(["passed", "failed", "incomplete"]);
const TRIGGER_TYPES = new Set([
  "on_success",
  "on_failure",
  "on_review_reject",
  "on_validation_retry",
  "on_recovery_required",
  "on_fanout_complete",
]);
const ALLOWED_TOP_LEVEL_FIELDS = new Set([
  "status",
  "triggerType",
  "trigger_type",
  "tokenUsage",
  "token_usage",
  "subagentRuns",
  "subagents",
  "reasonCode",
  "reason_code",
  "modelId",
  "model_id",
  "artifactPaths",
  "artifact_paths",
  "phaseId",
  "phase_id",
  "providerId",
  "provider_id",
]);

function fail(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
}

function normalizeStatus(status) {
  if (typeof status !== "string" || !STATUS_TYPES.has(status)) {
    fail("invalid_status", `unsupported status ${status}`);
  }
  return status;
}

function normalizeTriggerType(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string" || !TRIGGER_TYPES.has(value)) {
    fail("invalid_trigger_type", `unsupported trigger type ${value}`);
  }
  return value;
}

function normalizeOptionalString(value, field) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    fail("invalid_field_type", `${field} must be a string`);
  }
  return value;
}

function isContainedPath(rootPath, candidatePath) {
  const resolvedRoot = resolve(rootPath);
  const resolvedCandidate = resolve(rootPath, candidatePath);
  return (
    resolvedCandidate === resolvedRoot ||
    resolvedCandidate.startsWith(`${resolvedRoot}${sep}`)
  );
}

function normalizeArtifactPaths(artifactPaths, artifactRoot) {
  if (artifactPaths === undefined || artifactPaths === null) {
    return [];
  }
  if (!Array.isArray(artifactPaths)) {
    fail("invalid_artifact_paths", "artifact paths must be an array");
  }

  return artifactPaths.map((artifactPath) => {
    if (typeof artifactPath !== "string" || artifactPath.trim() === "") {
      fail("invalid_artifact_paths", "artifact paths must be non-empty strings");
    }
    if (!artifactRoot || !isContainedPath(artifactRoot, artifactPath)) {
      fail("unsafe_artifact_path", `artifact path escapes root: ${artifactPath}`);
    }
    return relative(resolve(artifactRoot), resolve(artifactRoot, artifactPath)) || ".";
  });
}

function normalizeSubagents(rawSubagents) {
  if (rawSubagents === undefined || rawSubagents === null) {
    return [];
  }
  if (!Array.isArray(rawSubagents)) {
    fail("invalid_subagent_payload", "subagent payload must be an array");
  }
  return rawSubagents;
}

function getEventId({ phaseId, attempt, subagentIndex = null }) {
  return subagentIndex === null
    ? `${phaseId}-attempt-${attempt}`
    : `${phaseId}-attempt-${attempt}-subagent-${subagentIndex + 1}`;
}

export function normalizePhaseExecutionResult({
  providerId = null,
  scenario,
  phase,
  runId,
  attempt,
  timestamp,
  eventIndexStart,
  artifactRoot,
  result,
}) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    fail("invalid_phase_result", "phase result must be an object");
  }

  for (const key of Object.keys(result)) {
    if (!ALLOWED_TOP_LEVEL_FIELDS.has(key)) {
      continue;
    }
  }

  const declaredProviderId = normalizeOptionalString(result.provider_id ?? result.providerId, "providerId");
  if (declaredProviderId && providerId && declaredProviderId !== providerId) {
    fail("invalid_provider_mapping", `expected provider ${providerId} but received ${declaredProviderId}`);
  }

  const declaredPhaseId = normalizeOptionalString(result.phase_id ?? result.phaseId, "phaseId");
  if (declaredPhaseId && declaredPhaseId !== phase.id) {
    fail("invalid_phase_mapping", `expected phase ${phase.id} but received ${declaredPhaseId}`);
  }

  const status = normalizeStatus(result.status);
  const triggerType = normalizeTriggerType(result.trigger_type ?? result.triggerType);
  const reasonCode = normalizeOptionalString(result.reason_code ?? result.reasonCode, "reasonCode");
  const modelId = normalizeOptionalString(result.model_id ?? result.modelId, "modelId");
  const artifactPaths = normalizeArtifactPaths(result.artifact_paths ?? result.artifactPaths, artifactRoot);
  const tokenUsage = result.token_usage ?? result.tokenUsage ?? {};
  const rawSubagents = normalizeSubagents(result.subagents ?? result.subagentRuns);
  const phaseEventId = getEventId({ phaseId: phase.id, attempt });

  const mainEvent = normalizeTokenEvent({
    runId,
    providerId,
    modelId,
    scenarioId: scenario.scenario_id,
    eventId: phaseEventId,
    eventIndex: eventIndexStart,
    actorType: "phase",
    phaseId: phase.id,
    phaseName: phase.name,
    skillName: phase.skill_name,
    attempt,
    status,
    triggerType,
    reasonCode,
    artifactPaths,
    timestamp,
    tokenUsage,
  });

  const subagentEvents = rawSubagents.map((subagent, index) => {
    if (!subagent || typeof subagent !== "object" || Array.isArray(subagent)) {
      fail("invalid_subagent_payload", `subagent at index ${index} must be an object`);
    }
    const subagentStatus = normalizeStatus(subagent.status ?? "incomplete");
    return normalizeTokenEvent({
      runId,
      scenarioId: scenario.scenario_id,
      eventId: getEventId({ phaseId: phase.id, attempt, subagentIndex: index }),
      eventIndex: eventIndexStart + index + 1,
      actorType: "subagent",
      phaseId: phase.id,
      phaseName: phase.name,
      skillName: phase.skill_name,
      attempt,
      status: subagentStatus,
      timestamp,
      parentPhaseEventId: phaseEventId,
      subagentRole: normalizeOptionalString(subagent.subagent_role ?? subagent.actorRole, "subagentRole"),
      tokenUsage: subagent.token_usage ?? subagent.tokenUsage ?? {},
    });
  });

  return {
    status,
    triggerType,
    reasonCode,
    runMetadata: {
      provider_id: providerId,
      model_id: modelId,
      artifact_paths: artifactPaths,
      reason_code: reasonCode,
    },
    events: [mainEvent, ...subagentEvents],
  };
}
