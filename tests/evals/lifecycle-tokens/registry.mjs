import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SCENARIO_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TRIGGER_TYPES = new Set([
  "on_success",
  "on_failure",
  "on_review_reject",
  "on_validation_retry",
  "on_recovery_required",
  "on_fanout_complete",
]);

function fail(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
}

function requirePositiveInteger(value, field, filePath) {
  if (!Number.isInteger(value) || value <= 0) {
    fail("invalid_execution_limit", `${filePath}: ${field} must be a positive integer`);
  }
}

function validatePhase(phase, index, filePath, phaseIds) {
  if (!phase || typeof phase !== "object") {
    fail("missing_required_field", `${filePath}: phases[${index}] must be an object`);
  }

  for (const field of ["id", "name", "skill_name"]) {
    if (typeof phase[field] !== "string" || phase[field].trim() === "") {
      fail("missing_required_field", `${filePath}: phases[${index}].${field} is required`);
    }
  }

  if (phaseIds.has(phase.id)) {
    fail("duplicate_phase_id", `${filePath}: duplicate phase id ${phase.id}`);
  }
  phaseIds.add(phase.id);
}

function validateScenario(scenario, filePath, seenScenarioIds) {
  if (!scenario || typeof scenario !== "object") {
    fail("invalid_json", `${filePath}: scenario must be an object`);
  }

  for (const field of ["scenario_id", "scenario_name"]) {
    if (typeof scenario[field] !== "string" || scenario[field].trim() === "") {
      fail("missing_required_field", `${filePath}: ${field} is required`);
    }
  }

  if (typeof scenario.start_phase_id !== "string" || scenario.start_phase_id.trim() === "") {
    fail("missing_lifecycle_anchor", `${filePath}: start_phase_id is required`);
  }

  if (!SCENARIO_ID_RE.test(scenario.scenario_id)) {
    fail("invalid_scenario_id", `${filePath}: invalid scenario id ${scenario.scenario_id}`);
  }

  if (seenScenarioIds.has(scenario.scenario_id)) {
    fail("duplicate_scenario_id", `${filePath}: duplicate scenario id ${scenario.scenario_id}`);
  }
  seenScenarioIds.add(scenario.scenario_id);

  if (!Array.isArray(scenario.terminal_phase_ids) || scenario.terminal_phase_ids.length === 0) {
    fail("missing_lifecycle_anchor", `${filePath}: terminal_phase_ids is required`);
  }
  if (!Array.isArray(scenario.phases) || scenario.phases.length === 0) {
    fail("missing_required_field", `${filePath}: phases is required`);
  }
  if (!Array.isArray(scenario.branches)) {
    fail("missing_required_field", `${filePath}: branches is required`);
  }
  if (!Array.isArray(scenario.complexity_tags)) {
    fail("missing_required_field", `${filePath}: complexity_tags is required`);
  }

  for (const field of ["max_total_steps", "max_phase_visits", "max_subagent_events_per_phase"]) {
    requirePositiveInteger(scenario[field], field, filePath);
  }

  const phaseIds = new Set();
  scenario.phases.forEach((phase, index) => validatePhase(phase, index, filePath, phaseIds));

  if (!phaseIds.has(scenario.start_phase_id)) {
    fail("missing_lifecycle_anchor", `${filePath}: start_phase_id ${scenario.start_phase_id} is not a valid phase`);
  }

  for (const terminalPhaseId of scenario.terminal_phase_ids) {
    if (!phaseIds.has(terminalPhaseId)) {
      fail("missing_lifecycle_anchor", `${filePath}: terminal phase ${terminalPhaseId} is not a valid phase`);
    }
  }

  const branchIds = new Set();
  for (const [index, branch] of scenario.branches.entries()) {
    if (!branch || typeof branch !== "object") {
      fail("missing_required_field", `${filePath}: branches[${index}] must be an object`);
    }
    for (const field of ["branch_id", "from_phase_id", "to_phase_id", "trigger_type"]) {
      if (typeof branch[field] !== "string" || branch[field].trim() === "") {
        fail("missing_required_field", `${filePath}: branches[${index}].${field} is required`);
      }
    }
    if (branchIds.has(branch.branch_id)) {
      fail("missing_required_field", `${filePath}: duplicate branch id ${branch.branch_id}`);
    }
    branchIds.add(branch.branch_id);
    if (!phaseIds.has(branch.from_phase_id) || !phaseIds.has(branch.to_phase_id)) {
      fail("unknown_phase_reference", `${filePath}: branch ${branch.branch_id} references unknown phase`);
    }
    if (!TRIGGER_TYPES.has(branch.trigger_type)) {
      fail("invalid_branch_trigger", `${filePath}: invalid trigger ${branch.trigger_type}`);
    }
  }
}

export function loadScenarioRegistry(scenariosDir) {
  const resolvedScenariosDir = scenariosDir instanceof URL ? fileURLToPath(scenariosDir) : scenariosDir;
  const fileNames = readdirSync(resolvedScenariosDir).filter((name) => name.endsWith(".json")).sort();

  if (fileNames.length === 0) {
    fail("empty_registry", `${resolvedScenariosDir}: no scenarios found`);
  }

  const seenScenarioIds = new Set();

  return fileNames.map((fileName) => {
    const filePath = join(resolvedScenariosDir, fileName);
    let scenario;
    try {
      scenario = JSON.parse(readFileSync(filePath, "utf8"));
    } catch (error) {
      fail("invalid_json", `${filePath}: ${error.message}`);
    }
    validateScenario(scenario, filePath, seenScenarioIds);
    return scenario;
  });
}

export { SCENARIO_ID_RE, TRIGGER_TYPES };
