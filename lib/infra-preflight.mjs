/**
 * Infrastructure preflight verification runner.
 *
 * Parses infra_requirements from YAML frontmatter, checks env vars,
 * CLI tools, and probes, then aggregates into a structured report.
 *
 * Uses only Node.js built-ins + the project's own parseDotenv.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, relative, sep } from "node:path";
import { execFileSync } from "node:child_process";
import { parseDotenv } from "./profiles/env.mjs";

// ---------------------------------------------------------------------------
// Minimal YAML frontmatter parser
// ---------------------------------------------------------------------------

/**
 * Parse infra_requirements from YAML frontmatter of a markdown file.
 *
 * @param {string} filePath - Absolute path to a markdown file.
 * @returns {object|null} Parsed infra_requirements block, or null if absent.
 */
export function parseInfraRequirements(filePath) {
  let content;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch (err) {
    if (err.code === "ENOENT") {
      const e = new Error(`File not found: ${filePath}`);
      e.code = "PREFLIGHT_FILE_NOT_FOUND";
      throw e;
    }
    throw err;
  }

  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return null;

  const fm = fmMatch[1];

  // Find infra_requirements key at the top level of the frontmatter.
  const irMatch = fm.match(/^infra_requirements:\s*$/m);
  if (!irMatch) return null;

  // Extract the indented block below infra_requirements:
  const startIdx = irMatch.index + irMatch[0].length;
  const rest = fm.slice(startIdx);
  const lines = rest.split(/\r?\n/);
  const blockLines = [];
  for (const line of lines) {
    if (line.trim() === "") {
      blockLines.push(line);
      continue;
    }
    // Top-level keys are not indented; stop when we hit one.
    if (/^\S/.test(line)) break;
    blockLines.push(line);
  }

  if (blockLines.length === 0) return null;

  try {
    return parseInfraBlock(blockLines);
  } catch (err) {
    const e = new Error(`Failed to parse infra_requirements in ${filePath}: ${err.message}`);
    e.code = "PREFLIGHT_PARSE_ERROR";
    throw e;
  }
}

/**
 * Minimal YAML-subset parser for the infra_requirements block.
 * Handles: scalars, arrays (flow and block), objects with nested keys.
 */
function parseInfraBlock(lines) {
  const result = {};

  // Determine the base indentation from the first non-empty line.
  let baseIndent = Infinity;
  for (const l of lines) {
    if (l.trim() === "") continue;
    const m = l.match(/^(\s*)/);
    if (m && m[1].length < baseIndent) baseIndent = m[1].length;
  }
  if (baseIndent === Infinity) baseIndent = 0;

  // Strip base indent and parse top-level keys.
  const stripped = lines.map((l) => (l.trim() === "" ? "" : l.slice(baseIndent)));

  // Group into top-level entries.
  const topLevel = groupByIndent(stripped, 0);

  for (const { key, value, children } of topLevel) {
    if (key === "systems") {
      result.systems = parseSystems(children);
    } else if (key === "env_file") {
      result.env_file = parseScalar(value);
    } else if (key === "ci_tag") {
      result.ci_tag = parseScalar(value);
    } else if (key === "on_fail") {
      result.on_fail = parseScalar(value);
    } else {
      result[key] = value ? parseScalar(value) : parseValue(children);
    }
  }

  return result;
}

function parseSystems(lines) {
  if (!lines || lines.length === 0) return [];

  const systems = [];
  let current = null;
  let currentLines = [];

  for (const line of lines) {
    if (line.trim() === "") continue;
    const dashMatch = line.match(/^- (.+)$/);
    const dashOnlyMatch = line.match(/^-\s*$/);
    const dashKeyMatch = line.match(/^- (\w[\w_]*):\s*(.*)$/);

    if (dashMatch || dashOnlyMatch) {
      if (current !== null) {
        systems.push(parseSystemEntry(currentLines));
      }
      currentLines = [];
      if (dashKeyMatch) {
        // "- name: foo" form
        currentLines.push(`${dashKeyMatch[1]}: ${dashKeyMatch[2]}`);
      } else if (dashMatch) {
        currentLines.push(dashMatch[1]);
      }
      current = systems.length;
    } else {
      // Continuation line — strip 2 extra spaces of indent.
      const stripped = line.replace(/^\s{2}/, "");
      currentLines.push(stripped);
    }
  }
  if (currentLines.length > 0) {
    systems.push(parseSystemEntry(currentLines));
  }

  return systems;
}

function parseSystemEntry(lines) {
  const entry = {};
  const groups = groupByIndent(lines, 0);

  for (const { key, value, children } of groups) {
    if (!key) continue;
    switch (key) {
      case "name":
      case "probe":
      case "check_level":
      case "notes":
        entry[key] = parseScalar(value);
        break;
      case "timeout":
        entry[key] = Number(parseScalar(value));
        break;
      case "env_vars":
        entry.env_vars = value ? parseFlowArray(value) : parseBlockArray(children);
        break;
      case "cli_tools":
        entry.cli_tools = value ? parseFlowArray(value) : parseCliToolsBlock(children);
        break;
      default:
        entry[key] = value ? parseScalar(value) : parseValue(children);
    }
  }

  return entry;
}

function parseCliToolsBlock(lines) {
  if (!lines || lines.length === 0) return [];

  const tools = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (line === "") { i++; continue; }

    const dashMatch = line.match(/^-\s+(.+)$/);
    if (dashMatch) {
      const rest = dashMatch[1];
      // Check if it's a mapping start: "- name: foo"
      const kvMatch = rest.match(/^(\w[\w_]*):\s*(.*)$/);
      if (kvMatch && kvMatch[1] === "name") {
        // Object form — collect sub-keys.
        const obj = { name: parseScalar(kvMatch[2]) };
        i++;
        while (i < lines.length) {
          const sub = lines[i];
          if (sub.trim() === "") { i++; continue; }
          // Must be more indented than the dash level.
          const subKv = sub.trim().match(/^(\w[\w_]*):\s*(.*)$/);
          if (subKv && !sub.match(/^-/)) {
            obj[subKv[1]] = parseScalar(subKv[2]);
            i++;
          } else {
            break;
          }
        }
        tools.push(obj);
      } else {
        // Simple string form: "- docker"
        tools.push(parseScalar(rest));
        i++;
      }
    } else {
      i++;
    }
  }

  return tools;
}

function groupByIndent(lines, baseIndent) {
  const groups = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") { i++; continue; }

    const indent = line.match(/^(\s*)/)[1].length;
    if (indent < baseIndent) { i++; continue; }

    const kvMatch = line.trim().match(/^(\w[\w_]*):\s*(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1];
      const value = kvMatch[2] || null;
      const childLines = [];
      i++;
      while (i < lines.length) {
        const next = lines[i];
        if (next.trim() === "") { childLines.push(next); i++; continue; }
        const nextIndent = next.match(/^(\s*)/)[1].length;
        if (nextIndent > indent) {
          childLines.push(next.slice(indent + 2)); // Strip parent indent + 2.
          i++;
        } else {
          break;
        }
      }
      groups.push({ key, value: value || null, children: childLines.length > 0 ? childLines : null });
    } else {
      i++;
    }
  }

  return groups;
}

function parseScalar(str) {
  if (!str) return null;
  let s = str.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1);
  }
  return s;
}

function parseFlowArray(str) {
  const s = str.trim();
  if (s.startsWith("[") && s.endsWith("]")) {
    return s.slice(1, -1).split(",").map((item) => parseScalar(item.trim())).filter(Boolean);
  }
  // Single value.
  return [parseScalar(s)];
}

function parseBlockArray(lines) {
  if (!lines) return [];
  const items = [];
  for (const line of lines) {
    const m = line.trim().match(/^-\s+(.+)$/);
    if (m) {
      items.push(parseScalar(m[1]));
    }
  }
  return items;
}

function parseValue(children) {
  if (!children || children.length === 0) return null;
  // Try block array.
  const hasItems = children.some((l) => l.trim().match(/^-\s/));
  if (hasItems) return parseBlockArray(children);
  // Try object.
  const hasKeys = children.some((l) => l.trim().match(/^\w[\w_]*:/));
  if (hasKeys) {
    const obj = {};
    const groups = groupByIndent(children, 0);
    for (const { key, value } of groups) {
      if (key) obj[key] = value ? parseScalar(value) : null;
    }
    return obj;
  }
  return children.map((l) => l.trim()).filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------
// Env file loading
// ---------------------------------------------------------------------------

/**
 * Load a .env file safely, with path containment check.
 *
 * @param {string} envFilePath - Relative path to env file.
 * @param {string} projectRoot - Absolute path to project root.
 * @param {object} [options] - Options (unused currently, reserved).
 * @returns {{ loaded: boolean, warning: string|null, env: object }}
 */
export function loadEnvFile(envFilePath, projectRoot, options = {}) {
  const resolved = resolve(projectRoot, envFilePath);
  const normalizedRoot = resolve(projectRoot);

  // Containment check.
  if (resolved !== normalizedRoot && !resolved.startsWith(normalizedRoot + sep)) {
    const e = new Error(
      `Env file path escapes project root: ${envFilePath} resolves to ${resolved}`
    );
    e.code = "PREFLIGHT_UNSAFE_ENV_FILE";
    throw e;
  }

  if (!existsSync(resolved)) {
    const relPath = relative(normalizedRoot, resolved);
    return { loaded: false, warning: `env file not found: ${relPath}`, env: {} };
  }

  const content = readFileSync(resolved, "utf-8");
  const env = parseDotenv(content, resolved);
  return { loaded: true, warning: null, env };
}

// ---------------------------------------------------------------------------
// Env var checking
// ---------------------------------------------------------------------------

/**
 * Check that all named env vars are defined and non-empty.
 *
 * @param {string[]} envVarNames - List of env var names to check.
 * @param {object} env - Environment object to check against.
 * @returns {{ env_vars_ok: boolean, missing_env_vars: string[] }}
 */
export function checkEnvVars(envVarNames, env) {
  const missing = [];
  for (const name of envVarNames) {
    const val = env[name];
    if (val === undefined || val === null || val === "") {
      missing.push(name);
    }
  }
  return { env_vars_ok: missing.length === 0, missing_env_vars: missing };
}

// ---------------------------------------------------------------------------
// CLI tool checking
// ---------------------------------------------------------------------------

const TOOL_NAME_RE = /^[a-zA-Z0-9._-]+$/;

/**
 * Check CLI tool availability and optionally version constraints.
 *
 * @param {Array<string|{name:string, version?:string}>} cliTools
 * @returns {{ cli_tools_ok: boolean, missing_tools: string[], version_mismatches: Array<{tool:string,required:string,found:string}>, warnings: Array<{code:string,message:string}> }}
 */
export function checkCliTools(cliTools) {
  const missing = [];
  const mismatches = [];
  const warnings = [];
  let allOk = true;

  for (const tool of cliTools) {
    if (typeof tool !== "string" && (typeof tool !== "object" || tool === null || typeof tool.name !== "string")) {
      warnings.push({
        code: "PREFLIGHT_INVALID_TOOL",
        message: `Invalid cli_tools entry: ${JSON.stringify(tool)}`,
      });
      allOk = false;
      continue;
    }
    const isObj = typeof tool === "object" && tool !== null;
    const name = isObj ? tool.name : tool;
    const versionConstraint = isObj ? tool.version : null;

    if (!TOOL_NAME_RE.test(name)) {
      warnings.push({
        code: "PREFLIGHT_INVALID_TOOL",
        message: `Invalid tool name: ${name}`,
      });
      allOk = false;
      continue;
    }

    let toolPath;
    try {
      toolPath = execFileSync("which", [name], { encoding: "utf-8" }).trim();
    } catch {
      missing.push(name);
      allOk = false;
      continue;
    }

    if (versionConstraint) {
      let versionOutput;
      try {
        versionOutput = execFileSync(toolPath, ["--version"], {
          encoding: "utf-8",
          timeout: 5000,
        }).trim();
      } catch {
        mismatches.push({ tool: name, required: versionConstraint, found: "unknown" });
        allOk = false;
        continue;
      }

      const semverMatch = versionOutput.match(/(\d+\.\d+(?:\.\d+)?)/);
      const foundVersion = semverMatch ? semverMatch[1] : null;

      if (!foundVersion) {
        mismatches.push({ tool: name, required: versionConstraint, found: "unknown" });
        allOk = false;
        continue;
      }

      if (!satisfiesConstraint(foundVersion, versionConstraint)) {
        mismatches.push({ tool: name, required: versionConstraint, found: foundVersion });
        allOk = false;
      }
    }
  }

  return { cli_tools_ok: allOk, missing_tools: missing, version_mismatches: mismatches, warnings };
}

/**
 * Minimal semver comparison for >=X.Y.Z constraints.
 */
function satisfiesConstraint(found, constraint) {
  const geMatch = constraint.match(/^>=\s*(\d+(?:\.\d+(?:\.\d+)?)?)$/);
  if (!geMatch) return true; // Unknown constraint form — pass.

  const required = geMatch[1];
  return compareSemver(found, required) >= 0;
}

function compareSemver(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);

  for (let i = 0; i < 3; i++) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Probe execution
// ---------------------------------------------------------------------------

/**
 * Execute a probe command string with variable substitution.
 *
 * @param {string} probeStr - Command string with optional $VAR references.
 * @param {object} env - Environment variables for substitution and execution.
 * @param {object} [options]
 * @param {number} [options.timeout=10] - Timeout in seconds.
 * @returns {{ probe_ok: boolean|null, probe_error: string|null, probe_duration_ms: number|null }}
 */
export function executeProbe(probeStr, env, options = {}) {
  const timeoutSec = options.timeout || 10;

  // Split on whitespace first, then substitute per-token.
  const tokens = probeStr.trim().split(/\s+/);
  const substituted = tokens.map((token) =>
    token.replace(/\$([A-Z_][A-Z0-9_]*)/g, (_, varName) => {
      return env[varName] !== undefined ? env[varName] : "";
    })
  );

  const command = substituted[0];
  const args = substituted.slice(1);

  const start = Date.now();

  try {
    execFileSync(command, args, {
      timeout: timeoutSec * 1000,
      env: { ...process.env, ...env },
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const duration = Date.now() - start;
    return { probe_ok: true, probe_error: null, probe_duration_ms: duration };
  } catch (err) {
    const duration = Date.now() - start;

    let errorMsg;
    if (err.code === "ETIMEDOUT" || (err.killed && err.signal === "SIGTERM")) {
      errorMsg = `Probe timed out after ${timeoutSec}s`;
    } else if (err.code === "ENOENT") {
      errorMsg = `Command not found: ${command}`;
    } else {
      // Capture and sanitize stderr.
      errorMsg = sanitizeStderr(err.stderr || err.message || "Unknown error");
    }

    return { probe_ok: false, probe_error: errorMsg, probe_duration_ms: duration };
  }
}

function sanitizeStderr(raw) {
  if (!raw || typeof raw !== "string") return "Unknown error";
  let s = raw;
  // Strip ANSI escape codes.
  s = s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
  // Strip control characters (except newline/tab).
  s = s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
  // Collapse whitespace and truncate.
  s = s.trim();
  if (s.length > 200) s = s.slice(0, 200) + "...";
  return s;
}

// ---------------------------------------------------------------------------
// Main runner
// ---------------------------------------------------------------------------

/**
 * Run the full infrastructure preflight check.
 *
 * @param {string|null} specPath - Path to the spec file (may be null).
 * @param {string|null} planPath - Path to the plan file (may be null).
 * @param {object} [options]
 * @param {boolean} [options.noInfra] - Skip all checks.
 * @param {number} [options.timeout] - Default timeout in seconds.
 * @param {string} [options.projectRoot] - Project root for env file resolution.
 * @returns {{ passed: boolean, systems: object[], skipped: boolean }}
 */
export function runPreflight(specPath, planPath, options = {}) {
  if (options.noInfra === true) {
    return { passed: true, systems: [], skipped: true };
  }

  const specReqs = specPath ? parseInfraRequirements(specPath) : null;
  const planReqs = planPath ? parseInfraRequirements(planPath) : null;

  if (!specReqs && !planReqs) {
    return { passed: true, systems: [], skipped: false };
  }

  // Merge systems: union by name, plan wins on conflict.
  const systemsMap = new Map();
  if (specReqs && Array.isArray(specReqs.systems)) {
    for (const sys of specReqs.systems) {
      if (sys.name) systemsMap.set(sys.name, sys);
    }
  }
  if (planReqs && Array.isArray(planReqs.systems)) {
    for (const sys of planReqs.systems) {
      if (sys.name) systemsMap.set(sys.name, sys);
    }
  }
  const systems = [...systemsMap.values()];

  // Determine env_file.
  const envFile = planReqs?.env_file || specReqs?.env_file || ".env.test";
  const projectRoot = options.projectRoot || process.cwd();

  // Load env file.
  let envResult;
  try {
    envResult = loadEnvFile(envFile, projectRoot, options);
  } catch (err) {
    if (err.code === "PREFLIGHT_UNSAFE_ENV_FILE") throw err;
    envResult = { loaded: false, warning: err.message, env: {} };
  }

  const env = { ...process.env, ...envResult.env };
  const defaultTimeout = options.timeout || 10;

  // Check each system.
  const results = [];
  let allPassed = true;

  for (const sys of systems) {
    const timeout = sys.timeout || defaultTimeout;

    if (sys.check_level === "skip") {
      results.push({
        name: sys.name,
        skipped: true,
        env_vars_ok: null,
        missing_env_vars: null,
        cli_tools_ok: null,
        missing_tools: null,
        version_mismatches: null,
        probe_ok: null,
        probe_error: null,
        probe_duration_ms: null,
        notes: sys.notes || null,
      });
      continue;
    }

    // Env vars check.
    let envCheck = null;
    if (sys.env_vars && sys.env_vars.length > 0) {
      envCheck = checkEnvVars(sys.env_vars, env);
    }

    // CLI tools check.
    let toolCheck = null;
    if (sys.cli_tools && sys.cli_tools.length > 0) {
      toolCheck = checkCliTools(sys.cli_tools);
    }

    // Determine if prerequisites passed.
    const envOk = envCheck ? envCheck.env_vars_ok : true;
    const toolsOk = toolCheck ? toolCheck.cli_tools_ok : true;
    const prereqsPassed = envOk && toolsOk;

    // Probe.
    let probeResult = { probe_ok: null, probe_error: null, probe_duration_ms: null };
    if (sys.probe) {
      if (sys.check_level === "presence-only") {
        // Skip probe for presence-only.
        probeResult = { probe_ok: null, probe_error: "skipped (presence-only)", probe_duration_ms: null };
      } else if (!prereqsPassed) {
        probeResult = { probe_ok: null, probe_error: "prerequisites failed", probe_duration_ms: null };
      } else {
        probeResult = executeProbe(sys.probe, env, { timeout });
      }
    }

    // Determine pass/fail for this system.
    const systemPassed = envOk && toolsOk && (probeResult.probe_ok !== false);
    if (!systemPassed) allPassed = false;

    results.push({
      name: sys.name,
      skipped: false,
      env_vars_ok: envCheck ? envCheck.env_vars_ok : null,
      missing_env_vars: envCheck ? envCheck.missing_env_vars : null,
      cli_tools_ok: toolCheck ? toolCheck.cli_tools_ok : null,
      missing_tools: toolCheck ? toolCheck.missing_tools : null,
      version_mismatches: toolCheck ? toolCheck.version_mismatches : null,
      warnings: toolCheck ? toolCheck.warnings : null,
      probe_ok: probeResult.probe_ok,
      probe_error: probeResult.probe_error,
      probe_duration_ms: probeResult.probe_duration_ms,
      notes: sys.notes || null,
    });
  }

  return {
    passed: allPassed,
    systems: results,
    skipped: false,
    env_file: envFile,
    env_loaded: envResult.loaded,
    env_warning: envResult.warning,
  };
}

// ---------------------------------------------------------------------------
// Report formatting
// ---------------------------------------------------------------------------

/**
 * Format a preflight report as markdown.
 *
 * @param {{ passed: boolean, systems: object[], skipped: boolean }} report
 * @returns {string}
 */
export function formatPreflightReport(report) {
  if (report.skipped) {
    return "Infrastructure preflight skipped (--no-infra).";
  }

  const lines = [];
  lines.push("## Infrastructure Preflight Report\n");

  if (report.env_warning) {
    lines.push(`> **Warning:** ${report.env_warning}\n`);
  }

  if (report.systems.length === 0) {
    lines.push("No infrastructure requirements declared.\n");
    lines.push("**Infrastructure Preflight: PASSED**");
    return lines.join("\n");
  }

  for (const sys of report.systems) {
    const icon = sys.skipped ? "\u2014" : (
      (sys.env_vars_ok !== false && sys.cli_tools_ok !== false && sys.probe_ok !== false) ? "\u2713" : "\u2717"
    );
    lines.push(`### ${icon} ${sys.name}\n`);

    if (sys.skipped) {
      lines.push("_Skipped (check_level: skip)_\n");
      continue;
    }

    // Env vars.
    if (sys.env_vars_ok !== null) {
      const envIcon = sys.env_vars_ok ? "\u2713" : "\u2717";
      lines.push(`- **Env vars:** ${envIcon}`);
      if (!sys.env_vars_ok && sys.missing_env_vars.length > 0) {
        lines.push(`  - Missing: ${sys.missing_env_vars.join(", ")}`);
      }
    }

    // CLI tools.
    if (sys.cli_tools_ok !== null) {
      const toolIcon = sys.cli_tools_ok ? "\u2713" : "\u2717";
      lines.push(`- **CLI tools:** ${toolIcon}`);
      if (sys.missing_tools && sys.missing_tools.length > 0) {
        lines.push(`  - Missing: ${sys.missing_tools.join(", ")}`);
      }
      if (sys.version_mismatches && sys.version_mismatches.length > 0) {
        for (const mm of sys.version_mismatches) {
          lines.push(`  - ${mm.tool}: requires ${mm.required}, found ${mm.found}`);
        }
      }
      if (sys.warnings && sys.warnings.length > 0) {
        for (const w of sys.warnings) {
          lines.push(`  - Warning: ${w.message}`);
        }
      }
    }

    // Probe.
    if (sys.probe_ok !== null || sys.probe_error) {
      if (sys.probe_ok === true) {
        const timing = sys.probe_duration_ms !== null ? ` (${sys.probe_duration_ms}ms)` : "";
        lines.push(`- **Probe:** \u2713${timing}`);
      } else if (sys.probe_ok === false) {
        const timing = sys.probe_duration_ms !== null ? ` (${sys.probe_duration_ms}ms)` : "";
        lines.push(`- **Probe:** \u2717${timing}`);
        if (sys.probe_error) lines.push(`  - Error: ${sys.probe_error}`);
      } else if (sys.probe_error) {
        lines.push(`- **Probe:** \u2014 ${sys.probe_error}`);
      }
    }

    if (sys.notes) {
      lines.push(`- _${sys.notes}_`);
    }

    lines.push("");
  }

  const verdict = report.passed ? "PASSED" : "FAILED";
  lines.push(`**Infrastructure Preflight: ${verdict}**`);

  return lines.join("\n");
}
