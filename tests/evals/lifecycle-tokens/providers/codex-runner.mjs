import { spawn } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

import { getDefaultCodexFixtureProfileId, resolveCodexFixtureProfile } from "./codex-fixtures.mjs";

const STATUS_TYPES = new Set(["passed", "failed", "incomplete"]);
const SENSITIVE_ENV_RE = /(token|secret|password|credential|api[_-]?key)/i;
const SAFE_SEGMENT_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["status", "triggerType", "modelId", "reasonCode", "tokenUsage", "subagentRuns"],
  properties: {
    status: { type: "string", enum: ["passed", "failed", "incomplete"] },
    triggerType: { type: ["string", "null"] },
    modelId: { type: ["string", "null"] },
    reasonCode: { type: ["string", "null"] },
    tokenUsage: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["input_tokens", "output_tokens", "total_tokens"],
      properties: {
        input_tokens: { type: ["integer", "null"] },
        output_tokens: { type: ["integer", "null"] },
        total_tokens: { type: ["integer", "null"] },
      },
    },
    subagentRuns: {
      type: ["array", "null"],
      items: {
        type: "object",
        additionalProperties: false,
        required: ["actorRole", "status", "tokenUsage"],
        properties: {
          actorRole: { type: "string" },
          status: { type: "string", enum: ["passed", "failed", "incomplete"] },
          tokenUsage: {
            type: ["object", "null"],
            additionalProperties: false,
            required: ["input_tokens", "output_tokens", "total_tokens"],
            properties: {
              input_tokens: { type: ["integer", "null"] },
              output_tokens: { type: ["integer", "null"] },
              total_tokens: { type: ["integer", "null"] },
            },
          },
        },
      },
    },
  },
};

function fail(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
}

function validateRequiredString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    fail("invalid_runner_context", `${field} is required`);
  }
}

function validateContext(context) {
  if (!context || typeof context !== "object") {
    fail("invalid_runner_context", "context must be an object");
  }
  if (!context.scenario || typeof context.scenario !== "object") {
    fail("invalid_runner_context", "scenario is required");
  }
  if (!context.phase || typeof context.phase !== "object") {
    fail("invalid_runner_context", "phase is required");
  }
  validateRequiredString(context.scenario.scenario_id, "scenario.scenario_id");
  validateRequiredString(context.phase.id, "phase.id");
  validateRequiredString(context.phase.name, "phase.name");
  validateRequiredString(context.phase.skill_name, "phase.skill_name");
  validateRequiredString(context.runId, "runId");
  validateRequiredString(context.artifactRoot, "artifactRoot");
  if (!SAFE_SEGMENT_RE.test(context.phase.id)) {
    fail("invalid_runner_context", "phase.id must be a safe kebab-case segment");
  }
  if (!SAFE_SEGMENT_RE.test(context.runId)) {
    fail("invalid_runner_context", "runId must be a safe kebab-case segment");
  }
  if (!Number.isInteger(context.attempt) || context.attempt <= 0) {
    fail("invalid_runner_context", "attempt must be a positive integer");
  }
}

function parseExecutableArgs(value) {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== "string")) {
      fail("invalid_runner_configuration", "ADEV_LIFECYCLE_PROVIDER_CODEX_ARGS must be a JSON string array");
    }
    return parsed;
  } catch (error) {
    fail("invalid_runner_configuration", error.message);
  }
}

function getSensitiveValues(env) {
  return Object.entries(env)
    .filter(([key, value]) => SENSITIVE_ENV_RE.test(key) && typeof value === "string" && value.length >= 4)
    .map(([, value]) => value)
    .sort((left, right) => right.length - left.length);
}

function redactSensitiveText(text, env) {
  let redacted = String(text);
  for (const value of getSensitiveValues(env)) {
    redacted = redacted.split(value).join("[REDACTED]");
  }
  return redacted;
}

function ensureContained(rootPath, candidatePath) {
  const resolvedRoot = realpathSync(rootPath);
  const relativeFromRoot = relative(resolve(rootPath), resolve(candidatePath));
  const canonicalCandidatePath = resolve(resolvedRoot, relativeFromRoot);

  if (
    canonicalCandidatePath !== resolvedRoot &&
    !canonicalCandidatePath.startsWith(`${resolvedRoot}${sep}`)
  ) {
    fail("unsafe_artifact_path", `artifact path escapes root: ${candidatePath}`);
  }

  let currentPath = resolvedRoot;
  for (const segment of relative(resolvedRoot, dirname(canonicalCandidatePath)).split(sep).filter(Boolean)) {
    currentPath = join(currentPath, segment);
    if (existsSync(currentPath) && lstatSync(currentPath).isSymbolicLink()) {
      fail("unsafe_artifact_path", `artifact path uses symlink: ${currentPath}`);
    }
  }

  if (existsSync(canonicalCandidatePath) && lstatSync(canonicalCandidatePath).isSymbolicLink()) {
    fail("unsafe_artifact_path", `artifact path uses symlink: ${canonicalCandidatePath}`);
  }
}

function writeArtifact({ rootPath, relativePath, content, env }) {
  mkdirSync(rootPath, { recursive: true });
  const artifactPath = resolve(rootPath, relativePath);
  ensureContained(rootPath, artifactPath);
  mkdirSync(dirname(artifactPath), { recursive: true });
  ensureContained(rootPath, artifactPath);
  writeFileSync(artifactPath, redactSensitiveText(content, env), "utf8");
  return relative(resolve(rootPath), artifactPath).split("\\").join("/");
}

function normalizeTokenUsageFields(tokenUsage) {
  if (tokenUsage === undefined || tokenUsage === null) {
    return undefined;
  }
  if (!tokenUsage || typeof tokenUsage !== "object" || Array.isArray(tokenUsage)) {
    fail("provider_result_unmappable", "tokenUsage must be an object");
  }

  const normalized = {
    input_tokens: null,
    output_tokens: null,
    total_tokens: null,
  };
  let sawValue = false;
  for (const field of ["input_tokens", "output_tokens", "total_tokens"]) {
    const value = tokenUsage[field];
    if (value === undefined || value === null) {
      continue;
    }
    if (!Number.isInteger(value) || value < 0) {
      fail("provider_result_unmappable", `${field} must be a non-negative integer`);
    }
    normalized[field] = value;
    sawValue = true;
  }
  return sawValue ? normalized : null;
}

function normalizeUsageSummary(usage) {
  if (usage === undefined || usage === null) {
    return undefined;
  }
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) {
    fail("provider_result_unmappable", "usage must be an object");
  }

  const inputTokens = usage.input_tokens;
  const outputTokens = usage.output_tokens;
  if (
    !Number.isInteger(inputTokens) ||
    inputTokens < 0 ||
    !Number.isInteger(outputTokens) ||
    outputTokens < 0
  ) {
    return null;
  }

  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: inputTokens + outputTokens,
  };
}

function normalizeSubagentRuns(subagentRuns) {
  if (subagentRuns === undefined || subagentRuns === null) {
    return undefined;
  }
  if (!Array.isArray(subagentRuns)) {
    fail("provider_result_unmappable", "subagentRuns must be an array");
  }

  const normalized = [];
  for (const subagentRun of subagentRuns) {
    if (!subagentRun || typeof subagentRun !== "object" || Array.isArray(subagentRun)) {
      continue;
    }

    const actorRole = subagentRun.actorRole ?? subagentRun.subagent_role;
    if (typeof actorRole !== "string" || actorRole.trim() === "") {
      continue;
    }
    if (!STATUS_TYPES.has(subagentRun.status)) {
      continue;
    }

    normalized.push({
      actorRole,
      status: subagentRun.status,
      ...(normalizeTokenUsageFields(subagentRun.tokenUsage ?? subagentRun.token_usage)
        ? { tokenUsage: normalizeTokenUsageFields(subagentRun.tokenUsage ?? subagentRun.token_usage) }
        : {}),
    });
  }

  return normalized;
}

function hasTokenUsageStats(tokenUsage) {
  if (!tokenUsage || typeof tokenUsage !== "object") {
    return false;
  }
  return ["input_tokens", "output_tokens", "total_tokens"].some((field) => {
    const value = tokenUsage[field];
    return typeof value === "number" && Number.isInteger(value) && value >= 0;
  });
}

function normalizeRunnerPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    fail("provider_output_unparseable", "Codex output must be a JSON object");
  }
  if (!STATUS_TYPES.has(payload.status)) {
    fail("provider_result_unmappable", `unsupported status ${payload.status}`);
  }

  const normalized = {
    status: payload.status,
  };

  if (payload.triggerType !== undefined && payload.triggerType !== null) {
    if (typeof payload.triggerType !== "string") {
      fail("provider_result_unmappable", "triggerType must be a string");
    }
    normalized.triggerType = payload.triggerType;
  }
  if (payload.modelId !== undefined && payload.modelId !== null) {
    if (typeof payload.modelId !== "string") {
      fail("provider_result_unmappable", "modelId must be a string");
    }
    normalized.modelId = payload.modelId;
  }
  if (payload.reasonCode !== undefined) {
    if (!(payload.reasonCode === null || typeof payload.reasonCode === "string")) {
      fail("provider_result_unmappable", "reasonCode must be a string or null");
    }
    normalized.reasonCode = payload.reasonCode;
  }

  const tokenUsage = normalizeTokenUsageFields(payload.tokenUsage ?? payload.token_usage);
  if (tokenUsage && Object.keys(tokenUsage).length > 0) {
    normalized.tokenUsage = tokenUsage;
  }

  const subagentRuns = normalizeSubagentRuns(payload.subagentRuns ?? payload.subagent_runs);
  if (subagentRuns && subagentRuns.length > 0) {
    normalized.subagentRuns = subagentRuns;
  }

  return normalized;
}

export function extractTokenUsageFromEvents(eventsText) {
  if (!eventsText) {
    return null;
  }

  const lines = eventsText.split(/\r?\n/);
  for (let idx = lines.length - 1; idx >= 0; idx -= 1) {
    const line = lines[idx].trim();
    if (!line) {
      continue;
    }

    try {
      const event = JSON.parse(line);
      const candidate =
        normalizeTokenUsageFields(event.token_usage ?? event.tokenUsage) ??
        normalizeTokenUsageFields(event.item?.token_usage ?? event.item?.tokenUsage) ??
        normalizeUsageSummary(event.usage) ??
        normalizeUsageSummary(event.item?.usage);
      if (candidate) {
        return candidate;
      }
    } catch (error) {
      // ignore invalid JSON and continue scanning
    }
  }

  return null;
}

function buildPrompt(context) {
  const featureSlug = context.fixtureProfile?.feature_slug ?? "fixture-feature";
  const fixtureSummary = context.fixtureProfile
    ? `Fixture Profile: ${context.fixtureProfile.fixture_name} (${context.fixtureProfile.fixture_id}, complexity: ${context.fixtureProfile.complexity})`
    : null;
  const featureSummary = context.fixtureProfile
    ? `Fixture Feature: ${context.fixtureProfile.feature_slug} - ${context.fixtureProfile.feature_task}`
    : null;
  const phaseInstructionById = {
    brainstorm:
      `Perform the brainstorm phase for the fixture feature. Create or update a feature charter under .context-index/specs/features/${featureSlug}/charter.md.`,
    specify:
      `Perform the specify phase for the same fixture feature. Author or update the live spec under .context-index/specs/features/${featureSlug}/.`,
    "review-specs":
      `Perform the review-specs phase for the same feature. Review the authored spec, use reviewer fan-out if useful, and write review artifacts under .context-index/specs/features/${featureSlug}/.`,
    plan:
      `Perform the plan phase for the same feature. Produce the implementation plan artifact under .context-index/specs/features/${featureSlug}/.`,
    implement:
      "Perform the implement phase for the same feature. Modify the fixture workspace and tests to implement the planned behavior.",
    validate:
      "Perform the validate phase for the same feature. Run the relevant checks in the fixture workspace and record validation evidence under the artifact directory.",
  };

  return [
    "Execute one deterministic lifecycle eval phase for the current fixture workspace.",
    "Return a final JSON object matching the provided schema.",
    "Do not include Markdown fences in the final answer.",
    "This is an observability eval, not a normal coding session.",
    "The fixture workspace is disposable for this run; you may modify files inside it.",
    "Do not run git write operations or mutate the source repository outside the provided fixture workspace.",
    "Write any extra artifacts only inside the provided artifact directory.",
    "Do not ask the user any questions and do not wait for interaction.",
    "Continue the same feature across phases by reusing the existing workspace state from earlier phases in this run.",
    "Do not restart from scratch if earlier phase artifacts already exist in the workspace.",
    "TODO: split this runner into classification and behavioral modes so runner verification can stay deterministic without losing realistic review-specs fan-out costs in behavioral runs.",
    "Prefer completing the actual phase work for this fixture feature instead of classifying repo state.",
    "Keep the work bounded to the named fixture feature and stop after this phase reaches a terminal outcome.",
    phaseInstructionById[context.phase.id] ?? "Perform the requested lifecycle phase for the fixture feature and return the phase result.",
    ...(fixtureSummary ? ["", fixtureSummary] : []),
    ...(featureSummary ? [featureSummary] : []),
    "",
    `Objective: Run the lifecycle phase ${context.phase.name} (${context.phase.skill_name}) for the selected fixture feature and report its terminal outcome.`,
    `Scenario ID: ${context.scenario.scenario_id}`,
    `Scenario Name: ${context.scenario.scenario_name ?? context.scenario.scenario_id}`,
    `Phase ID: ${context.phase.id}`,
    `Phase Name: ${context.phase.name}`,
    `Skill Name: ${context.phase.skill_name}`,
    `Attempt: ${context.attempt}`,
    `Run ID: ${context.runId}`,
  ].join("\n");
}

function shouldCopyWorkspacePath(sourceRoot, candidatePath) {
  const relativePath = relative(sourceRoot, candidatePath).split("\\").join("/");
  if (!relativePath || relativePath === ".") {
    return true;
  }

  const segments = relativePath.split("/").filter(Boolean);
  if (segments.includes(".git")) {
    return false;
  }

  if (relativePath === ".claude/worktrees" || relativePath.startsWith(".claude/worktrees/")) {
    return false;
  }

  if (
    relativePath === "tests/evals/lifecycle-tokens/reports" ||
    relativePath.startsWith("tests/evals/lifecycle-tokens/reports/")
  ) {
    return false;
  }

  return true;
}

function ensureRunWorkspace({ sourceRoot, runWorkspaceRoot }) {
  const workspacePath = join(runWorkspaceRoot, "repo");
  if (existsSync(workspacePath)) {
    return workspacePath;
  }

  mkdirSync(runWorkspaceRoot, { recursive: true });
  cpSync(sourceRoot, workspacePath, {
    recursive: true,
    filter: (src) => shouldCopyWorkspacePath(sourceRoot, src),
  });
  return workspacePath;
}

function executeCodex({ executable, executableArgs, args, prompt, cwd, env, spawnFn }) {
  return new Promise((resolveExecution, rejectExecution) => {
    const child = spawnFn(executable, [...executableArgs, ...args], {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      error.code = error.code ?? "provider_not_installed";
      rejectExecution(error);
    });
    child.on("close", (code) => {
      resolveExecution({ code, stdout, stderr });
    });

    child.stdin.end(prompt);
  });
}

function createFailureResult({ status, reasonCode, modelId = null, artifactPaths, fixtureProfile = null }) {
  return {
    status,
    triggerType: null,
    modelId,
    reasonCode,
    tokenUsage: null,
    subagentRuns: null,
    ...(fixtureProfile
      ? {
          fixtureProfileId: fixtureProfile.fixture_id,
          fixtureComplexity: fixtureProfile.complexity,
        }
      : {}),
    artifactPaths,
  };
}

function classifyCodexFailure({ stderr, exitCode, parseError }) {
  const stderrText = String(stderr ?? "").toLowerCase();
  if (
    stderrText.includes("operation not permitted") ||
    stderrText.includes("permission denied") ||
    stderrText.includes("sandbox")
  ) {
    return { status: "incomplete", reasonCode: "codex_sandbox_denied" };
  }
  if (parseError?.code === "ENOENT") {
    return {
      status: exitCode === 0 ? "failed" : "incomplete",
      reasonCode: "codex_output_missing",
    };
  }
  if (parseError instanceof SyntaxError) {
    return { status: "failed", reasonCode: "codex_output_invalid_json" };
  }
  if (exitCode !== 0) {
    return { status: "incomplete", reasonCode: `codex_exit_${exitCode}` };
  }
  return { status: "failed", reasonCode: "provider_output_unparseable" };
}

export async function runPhase(context, options = {}) {
  validateContext(context);

  const env = options.env ?? process.env;
  const fixtureProfileId =
    options.fixtureProfileId ??
    context.fixtureProfileId ??
    env.ADEV_LIFECYCLE_PROVIDER_CODEX_FIXTURE ??
    getDefaultCodexFixtureProfileId();
  const fixtureProfile = resolveCodexFixtureProfile(fixtureProfileId);
  const executable = options.executable ?? env.ADEV_LIFECYCLE_PROVIDER_CODEX_BIN ?? "codex";
  const executableArgs = options.executableArgs ?? parseExecutableArgs(env.ADEV_LIFECYCLE_PROVIDER_CODEX_ARGS);
  const model = options.model ?? env.ADEV_LIFECYCLE_PROVIDER_CODEX_MODEL ?? null;
  const spawnFn = options.spawnFn ?? spawn;

  const attemptDir = join(
    context.artifactRoot,
    "provider-artifacts",
    context.runId,
    context.phase.id,
    `attempt-${context.attempt}`,
  );
  mkdirSync(attemptDir, { recursive: true });
  const runWorkspaceRoot = join(
    context.artifactRoot,
    "provider-artifacts",
    context.runId,
    "workspace",
  );
  const workspacePath = ensureRunWorkspace({
    sourceRoot: fixtureProfile.fixture_root,
    runWorkspaceRoot,
  });

  const prompt = buildPrompt({ ...context, fixtureProfile });
  const schemaPath = join(attemptDir, "codex-output-schema.json");
  const outputLastMessagePath = join(attemptDir, "codex-last-message.json");
  writeFileSync(schemaPath, JSON.stringify(OUTPUT_SCHEMA, null, 2), "utf8");

  const args = [
    "exec",
    "-",
    "--skip-git-repo-check",
    "--full-auto",
    "--sandbox",
    "workspace-write",
    "--json",
    "--output-schema",
    schemaPath,
    "--output-last-message",
    outputLastMessagePath,
    "-C",
    workspacePath,
    "--add-dir",
    context.artifactRoot,
  ];

  if (model) {
    args.push("-m", model);
  }

  let execution;
  try {
    execution = await executeCodex({
      executable,
      executableArgs,
      args,
      prompt,
      cwd: workspacePath,
      env,
      spawnFn,
    });
  } catch (error) {
    if (error.code === "ENOENT") {
      fail("provider_not_installed", `Codex executable not found: ${executable}`);
    }
    fail(error.code ?? "provider_execution_failed", error.message);
  }

  const artifactPaths = [];
  artifactPaths.push(
    writeArtifact({
      rootPath: context.artifactRoot,
      relativePath: relative(context.artifactRoot, join(attemptDir, "codex-prompt.txt")),
      content: prompt,
      env,
    }),
  );
  artifactPaths.push(
    writeArtifact({
      rootPath: context.artifactRoot,
      relativePath: relative(context.artifactRoot, join(attemptDir, "codex-events.jsonl")),
      content: execution.stdout,
      env,
    }),
  );
  artifactPaths.push(
    writeArtifact({
      rootPath: context.artifactRoot,
      relativePath: relative(context.artifactRoot, join(attemptDir, "codex-stderr.txt")),
      content: execution.stderr,
      env,
    }),
  );

  const eventTokenUsage = extractTokenUsageFromEvents(execution.stdout);

  let parsedPayload;
  try {
    parsedPayload = JSON.parse(readFileSync(outputLastMessagePath, "utf8"));
  } catch (error) {
    const failure = classifyCodexFailure({
      stderr: execution.stderr,
      exitCode: execution.code,
      parseError: error,
    });
    return createFailureResult({
      status: failure.status,
      reasonCode: failure.reasonCode,
      artifactPaths,
      fixtureProfile,
    });
  }

  if (
    eventTokenUsage &&
    !hasTokenUsageStats(parsedPayload.tokenUsage ?? parsedPayload.token_usage)
  ) {
    parsedPayload.tokenUsage = eventTokenUsage;
  }

  artifactPaths.push(
    writeArtifact({
      rootPath: context.artifactRoot,
      relativePath: relative(context.artifactRoot, join(attemptDir, "codex-last-message.json")),
      content: JSON.stringify(parsedPayload, null, 2),
      env,
    }),
  );

  const normalized = normalizeRunnerPayload(parsedPayload);
  if (execution.code !== 0) {
    if (normalized.status === "passed") {
      normalized.status = "failed";
    }
    if (normalized.reasonCode === undefined || normalized.reasonCode === null) {
      normalized.reasonCode = `codex_exit_${execution.code}`;
    }
  }

  normalized.fixtureProfileId = fixtureProfile.fixture_id;
  normalized.fixtureComplexity = fixtureProfile.complexity;
  normalized.artifactPaths = artifactPaths;
  return normalized;
}

export default { runPhase };
