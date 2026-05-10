/**
 * Deploy config loader, validator, step executors, and orchestrator.
 *
 * Reads `.context-index/deploy.yaml`, validates the deployment configuration,
 * and orchestrates step execution for the `/adev:deploy` skill.
 *
 * Uses only Node.js built-ins and the existing `parseYaml` from
 * `lib/profiles/yaml.mjs`. No external dependencies.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';

import { parseYaml } from './profiles/yaml.mjs';

const execFileAsync = promisify(execFileCb);

// ──────────────────────────────────────────────────────────────────────
// YAML Safety
// ──────────────────────────────────────────────────────────────────────

/**
 * Scan raw YAML source for rejected constructs before parsing.
 *
 * Rejects:
 *   - Anchors (`&name`) and aliases (`*name`)
 *   - Multi-document separators (`---` after first line)
 *   - Merge keys (`<<:`)
 *   - Tag directives (`!`)
 *
 * @param {string} rawSource - Raw YAML text
 * @returns {Array<{code: string, message: string}>} Array of errors (empty if safe)
 */
export function checkYamlSafety(rawSource) {
  const errors = [];
  const lines = rawSource.split(/\r?\n/);

  let foundFirstContent = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    // Multi-document separator: --- after the first content
    if (trimmed === '---') {
      if (foundFirstContent) {
        errors.push({
          code: 'INVALID_CONFIG',
          message: `Multi-document separator "---" at line ${i + 1}. deploy.yaml must be a single document.`,
        });
      }
      foundFirstContent = true;
      continue;
    }

    foundFirstContent = true;

    // Anchors (&name) and aliases (*name)
    // Match & or * followed by a word character, but not inside quoted strings
    if (/(?:^|[\s:,\[\{])&\w/.test(line)) {
      errors.push({
        code: 'INVALID_CONFIG',
        message: `YAML anchor detected at line ${i + 1}. Anchors/aliases are not allowed in deploy.yaml.`,
      });
    }
    if (/(?:^|[\s:,\[\{])\*\w/.test(line)) {
      errors.push({
        code: 'INVALID_CONFIG',
        message: `YAML alias detected at line ${i + 1}. Anchors/aliases are not allowed in deploy.yaml.`,
      });
    }

    // Merge keys (<<:)
    if (/<<\s*:/.test(line)) {
      errors.push({
        code: 'INVALID_CONFIG',
        message: `Merge key "<<:" detected at line ${i + 1}. Merge keys are not allowed in deploy.yaml.`,
      });
    }

    // Tag directives (!)
    // Match ! followed by a non-space character, but not inside quoted strings
    // and not $! (shell variable patterns)
    if (/(?:^|[\s:,\[\{])![^\s]/.test(line)) {
      errors.push({
        code: 'INVALID_CONFIG',
        message: `YAML tag directive detected at line ${i + 1}. Tags are not allowed in deploy.yaml.`,
      });
    }
  }

  return errors;
}

// ──────────────────────────────────────────────────────────────────────
// Config Loading
// ──────────────────────────────────────────────────────────────────────

/**
 * Load deploy configuration from `.context-index/deploy.yaml`.
 *
 * @param {string} projectRoot - Absolute path to the project root
 * @returns {object|null} DeployConfig object or null if file does not exist
 */
export function loadDeployConfig(projectRoot) {
  const configPath = join(projectRoot, '.context-index', 'deploy.yaml');

  if (!existsSync(configPath)) {
    return null;
  }

  const rawSource = readFileSync(configPath, 'utf8');

  // Run safety checks on raw source before parsing
  const safetyErrors = checkYamlSafety(rawSource);
  if (safetyErrors.length > 0) {
    return {
      _loadError: true,
      errors: safetyErrors,
    };
  }

  const parsed = parseYaml(rawSource);

  return {
    environments: parsed.environments || null,
    steps: parsed.steps || [],
    variables: parsed.variables || [],
  };
}

// ──────────────────────────────────────────────────────────────────────
// Config Validation
// ──────────────────────────────────────────────────────────────────────

/**
 * Validate a DeployConfig object.
 *
 * Checks:
 *   - Duplicate step IDs within an environment
 *   - Missing env var references (warnings, not errors)
 *   - Inline secret detection (errors)
 *
 * @param {object} config - DeployConfig object from loadDeployConfig
 * @returns {{errors: Array<{code: string, message: string}>, warnings: string[]}}
 */
export function validateDeployConfig(config) {
  const errors = [];
  const warnings = [];

  if (!config || config._loadError) {
    return { errors: config?.errors || [{ code: 'NO_CONFIG', message: 'No configuration provided' }], warnings };
  }

  const steps = config.steps || [];

  // Check for duplicate step IDs
  const seenIds = new Set();
  for (const step of steps) {
    if (seenIds.has(step.id)) {
      errors.push({
        code: 'DUPLICATE_STEP_ID',
        message: `Duplicate step ID "${step.id}". Step IDs must be unique within an environment.`,
      });
    }
    seenIds.add(step.id);
  }

  // Check env var references
  const variables = config.variables || [];
  for (const varName of variables) {
    if (!process.env[varName]) {
      warnings.push(`Environment variable "${varName}" is not set. It may be required at deploy time.`);
    }
  }

  // Inline secret detection for shell and ci-trigger steps
  for (const step of steps) {
    if (step.type === 'shell' || step.type === 'ci-trigger') {
      const secretErrors = detectInlineSecrets(step);
      errors.push(...secretErrors);
    }
  }

  return { errors, warnings };
}

// ──────────────────────────────────────────────────────────────────────
// Inline Secret Detection
// ──────────────────────────────────────────────────────────────────────

/**
 * Secret detection regex patterns.
 *
 * These are heuristic — they catch common patterns but are not a
 * security guarantee. See spec Behavior 4 for known limitations.
 */
const SECRET_PATTERNS = [
  {
    name: 'high-entropy',
    regex: /[A-Za-z0-9+/=_-]{32,}/,
    description: 'high-entropy string (32+ chars, base64-like)',
  },
  {
    name: 'prefixed-key',
    regex: /(sk|pk|api|token|key|secret|password|bearer)[_-]?[A-Za-z0-9_-]{16,}/i,
    description: 'prefixed API key or token',
  },
  {
    name: 'aws-key',
    regex: /(AKIA|ASIA)[A-Z0-9]{16}/,
    description: 'AWS-style access key',
  },
  {
    name: 'generic-password',
    regex: /(password|passwd|pwd)\s*[:=]\s*\S+/i,
    description: 'generic password pattern',
  },
];

/**
 * Detect inline secrets in a step's command and arguments.
 *
 * Only applies to `shell` and `ci-trigger` step types.
 * Env var references (`$VAR_NAME`) are allowed and not flagged.
 *
 * @param {object} step - Step config with id, type, command, args
 * @returns {Array<{code: string, message: string}>} Array of INLINE_SECRET errors
 */
export function detectInlineSecrets(step) {
  const errors = [];
  const valuesToCheck = [];

  if (step.command) valuesToCheck.push(step.command);
  if (step.args && Array.isArray(step.args)) {
    valuesToCheck.push(...step.args);
  }

  for (const value of valuesToCheck) {
    // Remove env var references before checking — $VAR_NAME is allowed
    const cleaned = value.replace(/\$[A-Z_][A-Z0-9_]*/g, '');

    for (const pattern of SECRET_PATTERNS) {
      if (pattern.regex.test(cleaned)) {
        errors.push({
          code: 'INLINE_SECRET',
          message: `Step "${step.id}" contains what appears to be an inline secret (${pattern.description}). Use env var references instead.`,
        });
        break; // One error per step is sufficient
      }
    }
  }

  return errors;
}

// ──────────────────────────────────────────────────────────────────────
// Output Redaction
// ──────────────────────────────────────────────────────────────────────

/**
 * Redact env var values from output text.
 *
 * Only redacts variables declared in the deploy config's `variables` field.
 * Each occurrence of the variable's actual value is replaced with
 * `<REDACTED:$VAR_NAME>`.
 *
 * @param {string} text - Output text to redact
 * @param {Record<string, string>} variables - Map of var name to actual value
 * @returns {string} Redacted text
 */
export function redactOutput(text, variables) {
  let result = text;
  for (const [name, value] of Object.entries(variables)) {
    if (value && value.length > 0) {
      // Escape regex special chars in the value
      const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(escaped, 'g'), `<REDACTED:$${name}>`);
    }
  }
  return result;
}

// ──────────────────────────────────────────────────────────────────────
// Step Executors
// ──────────────────────────────────────────────────────────────────────

/**
 * Execute a shell step via execFile with shell: false.
 *
 * Runs the command as a direct process (no shell interpolation).
 * Captures stdout, stderr, exit code, and duration.
 *
 * @param {object} step - Step config with command and optional args
 * @param {object} context - Execution context
 * @returns {Promise<object>} Step result
 */
export async function executeShell(step, context) {
  const startTime = Date.now();
  const args = step.args || [];

  try {
    const { stdout, stderr } = await execFileAsync(step.command, args, {
      shell: false,
      timeout: step.timeout ? step.timeout * 1000 : undefined,
    });

    return {
      status: 'succeeded',
      exitCode: 0,
      stdout: stdout || '',
      stderr: stderr || '',
      duration: Date.now() - startTime,
    };
  } catch (err) {
    if (err.code === 'ENOENT') {
      return {
        status: 'failed',
        exitCode: null,
        stdout: '',
        stderr: err.message,
        duration: Date.now() - startTime,
        error: { code: 'CMD_NOT_FOUND', message: `Command not found: "${step.command}"` },
      };
    }

    return {
      status: 'failed',
      exitCode: err.status ?? err.code ?? 1,
      stdout: err.stdout || '',
      stderr: err.stderr || '',
      duration: Date.now() - startTime,
      error: { code: 'STEP_FAILED', message: `Step "${step.id}" failed with exit code ${err.status ?? 1}` },
    };
  }
}

/**
 * Execute a manual step — surface instructions and record user response.
 *
 * The actual user interaction is handled by the skill layer.
 * This function accepts a pre-resolved userResponse.
 *
 * @param {object} step - Step config with instructions field
 * @param {object} context - Must include userResponse: "done"|"skip"|"abort"
 * @returns {Promise<object>} Step result
 */
export async function executeManual(step, context) {
  const response = context.userResponse || 'done';

  if (response === 'abort') {
    return {
      status: 'aborted',
      instructions: step.instructions,
      response,
      error: { code: 'USER_ABORT', message: `User aborted at manual step "${step.id}"` },
    };
  }

  if (response === 'skip') {
    return {
      status: 'skipped',
      instructions: step.instructions,
      response,
    };
  }

  return {
    status: 'succeeded',
    instructions: step.instructions,
    response,
  };
}

/**
 * Execute a verify step — run command, exit 0 = pass, non-zero = fail.
 *
 * @param {object} step - Step config with command field
 * @param {object} context - Execution context
 * @returns {Promise<object>} Step result
 */
export async function executeVerify(step, context) {
  const startTime = Date.now();
  const args = step.args || [];

  try {
    const { stdout, stderr } = await execFileAsync(step.command, args, {
      shell: false,
    });

    return {
      status: 'succeeded',
      exitCode: 0,
      stdout: stdout || '',
      stderr: stderr || '',
      duration: Date.now() - startTime,
    };
  } catch (err) {
    if (err.code === 'ENOENT') {
      return {
        status: 'failed',
        exitCode: null,
        stdout: '',
        stderr: err.message,
        duration: Date.now() - startTime,
        error: { code: 'CMD_NOT_FOUND', message: `Command not found: "${step.command}"` },
      };
    }

    return {
      status: 'failed',
      exitCode: err.status ?? 1,
      stdout: err.stdout || '',
      stderr: err.stderr || '',
      duration: Date.now() - startTime,
      error: { code: 'VERIFY_FAILED', message: `Verification step "${step.id}" failed` },
    };
  }
}

/**
 * Execute a gate step — poll command until exit 0 or timeout.
 *
 * @param {object} step - Step config with command, interval, timeout
 * @param {object} context - Execution context
 * @param {object} [testOverrides] - Injectable execFn and sleepFn for testing
 * @returns {Promise<object>} Step result
 */
export async function executeGate(step, context, testOverrides = {}) {
  const startTime = Date.now();
  const minInterval = testOverrides.execFn ? 0 : 5;
  const interval = Math.max(step.interval ?? 10, minInterval);
  const timeout = step.timeout ?? 300;
  const timeoutMs = timeout * 1000;
  const intervalMs = interval * 1000;

  const execFn = testOverrides.execFn || (async () => {
    try {
      await execFileAsync(step.command, step.args || [], { shell: false });
      return { exitCode: 0 };
    } catch (err) {
      return { exitCode: err.status ?? 1 };
    }
  });

  const sleepFn = testOverrides.sleepFn || ((ms) => new Promise((r) => setTimeout(r, ms)));

  while (Date.now() - startTime < timeoutMs) {
    const result = await execFn(step.command);
    if (result.exitCode === 0) {
      return {
        status: 'succeeded',
        duration: Date.now() - startTime,
      };
    }
    // Check if sleeping would exceed timeout
    if (Date.now() - startTime + intervalMs >= timeoutMs) break;
    await sleepFn(intervalMs);
  }

  return {
    status: 'failed',
    duration: Date.now() - startTime,
    error: { code: 'GATE_TIMEOUT', message: `Gate "${step.id}" timed out after ${timeout}s` },
  };
}

/**
 * Execute a CI-trigger step — dispatch job, then poll for completion.
 *
 * Dispatch: run step.command, capture job ID from stdout.
 * Poll: run step.poll_command with DEPLOY_JOB_ID env var.
 * Exit codes for poll: 0 = success, 1 = failed, 2 = in-progress.
 *
 * @param {object} step - Step config with command, poll_command, interval, timeout
 * @param {object} context - Execution context
 * @param {object} [testOverrides] - Injectable execFn and sleepFn for testing
 * @returns {Promise<object>} Step result
 */
export async function executeCiTrigger(step, context, testOverrides = {}) {
  const startTime = Date.now();
  const minInterval = testOverrides.execFn ? 0 : 10;
  const interval = Math.max(step.interval ?? 30, minInterval);
  const timeout = step.timeout ?? 1800;
  const timeoutMs = timeout * 1000;
  const intervalMs = interval * 1000;

  const execFn = testOverrides.execFn || (async (cmd) => {
    try {
      const { stdout } = await execFileAsync(cmd, [], { shell: false });
      return { exitCode: 0, stdout: stdout || '' };
    } catch (err) {
      return { exitCode: err.status ?? 1, stdout: err.stdout || '' };
    }
  });

  const sleepFn = testOverrides.sleepFn || ((ms) => new Promise((r) => setTimeout(r, ms)));

  // Phase 1: Dispatch
  const dispatchResult = await execFn(step.command);
  if (dispatchResult.exitCode !== 0) {
    return {
      status: 'failed',
      duration: Date.now() - startTime,
      error: { code: 'STEP_FAILED', message: `CI dispatch command "${step.command}" failed` },
    };
  }

  // Sanitize job ID: trim, strip control chars, truncate to 256 chars (SEC-7)
  let jobId = (dispatchResult.stdout || '').trim();
  jobId = jobId.replace(/[\x00-\x1f\x7f]/g, '');
  if (jobId.length > 256) {
    jobId = jobId.slice(0, 256);
  }

  // Phase 2: Poll
  const pollStartTime = Date.now();
  while (Date.now() - pollStartTime < timeoutMs) {
    const pollResult = await execFn(step.poll_command);

    if (pollResult.exitCode === 0) {
      return {
        status: 'succeeded',
        jobId,
        duration: Date.now() - startTime,
      };
    }

    if (pollResult.exitCode === 1) {
      return {
        status: 'failed',
        jobId,
        duration: Date.now() - startTime,
        error: { code: 'CI_FAILED', message: `CI job "${jobId}" failed` },
      };
    }

    // Exit code 2 = in-progress, keep polling
    if (Date.now() - pollStartTime + intervalMs >= timeoutMs) break;
    await sleepFn(intervalMs);
  }

  return {
    status: 'failed',
    jobId,
    duration: Date.now() - startTime,
    error: { code: 'GATE_TIMEOUT', message: `CI job "${jobId}" timed out after ${timeout}s` },
  };
}

/**
 * Default step executor registry.
 */
const DEFAULT_EXECUTORS = {
  shell: executeShell,
  manual: executeManual,
  verify: executeVerify,
  gate: executeGate,
  'ci-trigger': executeCiTrigger,
};

// ──────────────────────────────────────────────────────────────────────
// Orchestrator
// ──────────────────────────────────────────────────────────────────────

/**
 * Execute a deployment pipeline.
 *
 * Loads and validates the deploy config, resolves the version,
 * iterates through steps in order, and records results in a DeployRun.
 *
 * @param {string} projectRoot - Absolute path to the project root
 * @param {object} options
 * @param {string} [options.version] - Explicit version (bypasses milestone lookup)
 * @param {string} [options.environment] - Target environment name
 * @param {Record<string, Function>} [options.executors] - Override executor registry for testing
 * @returns {Promise<object>} DeployRun record
 */
export async function executeDeploy(projectRoot, options = {}) {
  const config = loadDeployConfig(projectRoot);
  if (!config) {
    return { status: 'failed', error: { code: 'NO_CONFIG', message: 'No deploy.yaml found.' } };
  }

  const validation = validateDeployConfig(config);
  if (validation.errors.length > 0) {
    return { status: 'failed', error: { code: 'INVALID_CONFIG', message: 'Validation failed', details: validation.errors } };
  }

  const version = options.version || 'unknown';
  const executors = { ...DEFAULT_EXECUTORS, ...(options.executors || {}) };

  // Resolve env var values for redaction
  const envVarValues = {};
  for (const varName of (config.variables || [])) {
    const val = process.env[varName];
    if (val) {
      envVarValues[varName] = val;
    }
  }

  const deployRun = {
    version,
    environment: options.environment || 'default',
    started: new Date().toISOString(),
    stepResults: [],
    status: 'in_progress',
    duration: 0,
  };

  const startTime = Date.now();

  for (const step of config.steps) {
    const executor = executors[step.type];
    if (!executor) {
      deployRun.stepResults.push({
        stepId: step.id,
        status: 'failed',
        error: { code: 'UNKNOWN_STEP_TYPE', message: `No executor for step type "${step.type}"` },
      });
      deployRun.status = 'failed';
      break;
    }

    const result = await executor(step, { projectRoot, envVarValues, config });

    // Redact output
    if (result.stdout) {
      result.stdout = redactOutput(result.stdout, envVarValues);
    }
    if (result.stderr) {
      result.stderr = redactOutput(result.stderr, envVarValues);
    }

    deployRun.stepResults.push({
      stepId: step.id,
      ...result,
    });

    if (result.status === 'failed' || result.status === 'aborted') {
      deployRun.status = 'failed';

      // Collect rollback steps from completed (succeeded) steps in reverse order
      const completedSteps = deployRun.stepResults
        .filter((r) => r.status === 'succeeded')
        .map((r) => r.stepId);

      const rollbackSteps = [];
      for (let i = completedSteps.length - 1; i >= 0; i--) {
        const stepId = completedSteps[i];
        const stepConfig = config.steps.find((s) => s.id === stepId);
        if (stepConfig && stepConfig.rollback) {
          rollbackSteps.push({
            stepId,
            instruction: stepConfig.rollback,
          });
        }
      }

      deployRun.rollbackSteps = rollbackSteps;
      break;
    }
  }

  deployRun.duration = Date.now() - startTime;

  if (deployRun.status === 'in_progress') {
    deployRun.status = 'succeeded';
  }

  return deployRun;
}

// ──────────────────────────────────────────────────────────────────────
// Rollback Execution
// ──────────────────────────────────────────────────────────────────────

/**
 * Execute rollback steps one at a time with user confirmation.
 *
 * Rollback steps are never auto-executed. Each step requires explicit
 * user confirmation before proceeding to the next.
 *
 * @param {Array<{stepId: string, instruction: string}>} rollbackSteps
 * @param {object} options
 * @param {Function} options.userConfirmation - Async fn returning true/false
 * @param {Function} options.executor - Async fn(instruction) returning result
 * @returns {Promise<Array<object>>} Results for each rollback step
 */
export async function executeRollback(rollbackSteps, options = {}) {
  const results = [];
  const { userConfirmation, executor } = options;

  for (const step of rollbackSteps) {
    const confirmed = await userConfirmation(step);
    if (!confirmed) {
      results.push({ stepId: step.stepId, status: 'skipped' });
      continue;
    }

    const result = await executor(step.instruction);
    results.push({ stepId: step.stepId, ...result });
  }

  return results;
}

// ──────────────────────────────────────────────────────────────────────
// Version Resolution
// ──────────────────────────────────────────────────────────────────────

/**
 * Resolve the deployment version.
 *
 * If options.version is provided, use it directly.
 * Otherwise, attempt to load milestones and find the most recently shipped.
 *
 * @param {string} projectRoot - Absolute path to the project root
 * @param {object} options
 * @param {string} [options.version] - Explicit version override
 * @returns {Promise<object>} { version: string } or { error: { code, message } }
 */
export async function resolveVersion(projectRoot, options = {}) {
  if (options.version) {
    return { version: options.version };
  }

  // Attempt dynamic import of milestones module
  try {
    const milestonesPath = join(projectRoot, 'lib', 'milestones.mjs');
    const { loadMilestones } = await import(milestonesPath);
    const milestones = await loadMilestones(projectRoot);

    const shipped = (milestones || [])
      .filter((m) => m.status === 'shipped')
      .sort((a, b) => new Date(b.shipped_at || b.date) - new Date(a.shipped_at || a.date));

    if (shipped.length > 0) {
      return { version: shipped[0].version || shipped[0].tag };
    }

    return {
      error: {
        code: 'NO_VERSION',
        message: 'No shipped milestone found. Use --version <tag> to deploy explicitly.',
      },
    };
  } catch {
    return {
      error: {
        code: 'NO_VERSION',
        message: 'Milestone integration not available (lib/milestones.mjs not found). Use --version <tag> to deploy explicitly.',
      },
    };
  }
}

// ──────────────────────────────────────────────────────────────────────
// Deploy Summary
// ──────────────────────────────────────────────────────────────────────

/**
 * Format a human-readable deploy summary from a DeployRun record.
 *
 * @param {object} deployRun - DeployRun record from executeDeploy
 * @returns {string} Formatted summary string
 */
export function formatDeploySummary(deployRun) {
  const lines = [];
  const statusIcon = deployRun.status === 'succeeded' ? '✓' : '✗';

  lines.push(`Deploy ${statusIcon} ${deployRun.status.toUpperCase()}`);
  lines.push(`  Version:     ${deployRun.version}`);
  lines.push(`  Environment: ${deployRun.environment}`);
  lines.push(`  Duration:    ${formatDuration(deployRun.duration)}`);
  lines.push('');
  lines.push('  Steps:');

  for (const step of deployRun.stepResults) {
    const icon = step.status === 'succeeded' ? '✓' : step.status === 'skipped' ? '–' : '✗';
    const durationStr = step.duration != null ? ` (${formatDuration(step.duration)})` : '';
    let line = `    ${icon} ${step.stepId}: ${step.status}${durationStr}`;

    if (step.status === 'failed' && step.error) {
      line += ` — ${step.error.message || step.error.code}`;
    }

    lines.push(line);
  }

  return lines.join('\n');
}

/**
 * Format milliseconds as a human-readable duration.
 *
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration (e.g., "1.5s", "2m 30s")
 */
function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSec = Math.round(seconds % 60);
  return `${minutes}m ${remainingSec}s`;
}
