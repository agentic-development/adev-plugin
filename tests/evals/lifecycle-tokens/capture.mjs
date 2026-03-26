import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const KNOWN = "known";
const UNKNOWN = "unknown";
const ACTOR_TYPES = new Set(["phase", "subagent"]);
const STATUS_TYPES = new Set(["passed", "failed", "incomplete"]);
const SAFE_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function fail(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
}

function validateRequiredString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    fail("missing_required_field", `${field} is required`);
  }
}

function normalizeTokenField(value) {
  if (value === undefined || value === null) {
    return { value: null, availability: UNKNOWN };
  }
  if (!Number.isInteger(value) || value < 0) {
    fail("invalid_token_payload", "token fields must be non-negative integers");
  }
  return { value, availability: KNOWN };
}

function normalizeOptionalString(value, field) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    fail("invalid_field_type", `${field} must be a string when provided`);
  }
  return value;
}

function normalizeArtifactPaths(artifactPaths) {
  if (artifactPaths === undefined || artifactPaths === null) {
    return [];
  }
  if (!Array.isArray(artifactPaths) || artifactPaths.some((entry) => typeof entry !== "string")) {
    fail("invalid_artifact_paths", "artifactPaths must be an array of strings");
  }
  return [...artifactPaths];
}

export function normalizeTokenEvent(input) {
  validateRequiredString(input.runId, "runId");
  validateRequiredString(input.scenarioId, "scenarioId");
  validateRequiredString(input.eventId, "eventId");
  validateRequiredString(input.phaseId, "phaseId");
  validateRequiredString(input.phaseName, "phaseName");
  validateRequiredString(input.skillName, "skillName");
  validateRequiredString(input.status, "status");
  validateRequiredString(input.timestamp, "timestamp");

  if (!SAFE_ID_RE.test(input.scenarioId)) {
    fail("invalid_scenario_id", `unsafe scenario id ${input.scenarioId}`);
  }
  if (!Number.isInteger(input.eventIndex) || input.eventIndex < 0) {
    fail("invalid_event_index", "eventIndex must be a non-negative integer");
  }
  if (!Number.isInteger(input.attempt) || input.attempt <= 0) {
    fail("invalid_attempt", "attempt must be a positive integer");
  }
  if (!ACTOR_TYPES.has(input.actorType)) {
    fail("invalid_actor_type", `unsupported actor type ${input.actorType}`);
  }
  if (!STATUS_TYPES.has(input.status)) {
    fail("invalid_status", `unsupported status ${input.status}`);
  }
  if (input.actorType === "subagent") {
    validateRequiredString(input.parentPhaseEventId, "parentPhaseEventId");
  }

  const usage = input.tokenUsage ?? {};
  const inputTokens = normalizeTokenField(usage.input_tokens);
  const outputTokens = normalizeTokenField(usage.output_tokens);
  const totalTokens = normalizeTokenField(usage.total_tokens);

  if (
    inputTokens.availability === KNOWN &&
    outputTokens.availability === KNOWN &&
    totalTokens.availability === KNOWN &&
    inputTokens.value + outputTokens.value !== totalTokens.value
  ) {
    fail("invalid_token_payload", "total_tokens must equal input_tokens + output_tokens");
  }

  return {
    run_id: input.runId,
    provider_id: normalizeOptionalString(input.providerId, "providerId"),
    model_id: normalizeOptionalString(input.modelId, "modelId"),
    scenario_id: input.scenarioId,
    event_id: input.eventId,
    event_index: input.eventIndex,
    actor_type: input.actorType,
    phase_id: input.phaseId,
    phase_name: input.phaseName,
    skill_name: input.skillName,
    attempt: input.attempt,
    status: input.status,
    trigger_type: normalizeOptionalString(input.triggerType, "triggerType"),
    reason_code: normalizeOptionalString(input.reasonCode, "reasonCode"),
    artifact_paths: normalizeArtifactPaths(input.artifactPaths),
    timestamp: input.timestamp,
    subagent_role: input.actorType === "subagent" ? normalizeOptionalString(input.subagentRole, "subagentRole") : null,
    parent_phase_event_id:
      input.actorType === "subagent"
        ? input.parentPhaseEventId
        : null,
    input_tokens: inputTokens.value,
    input_tokens_availability: inputTokens.availability,
    output_tokens: outputTokens.value,
    output_tokens_availability: outputTokens.availability,
    total_tokens: totalTokens.value,
    total_tokens_availability: totalTokens.availability,
  };
}

export function writeRawEventLog({ outputDir, scenarioId, runId, events }) {
  validateRequiredString(outputDir, "outputDir");
  validateRequiredString(scenarioId, "scenarioId");
  validateRequiredString(runId, "runId");
  if (!SAFE_ID_RE.test(scenarioId)) {
    fail("invalid_scenario_id", `unsafe scenario id ${scenarioId}`);
  }
  if (!Array.isArray(events) || events.length === 0) {
    fail("missing_required_field", "events must be a non-empty array");
  }

  mkdirSync(outputDir, { recursive: true });
  const filePath = join(outputDir, `${scenarioId}--${runId}.jsonl`);
  const body = events.map((event) => JSON.stringify(event)).join("\n") + "\n";
  writeFileSync(filePath, body, "utf8");
  return filePath;
}
