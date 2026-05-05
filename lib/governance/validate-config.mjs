/**
 * Configurable validate check registry loader.
 *
 * Contract: .context-index/specs/features/validation/configurable-checks.spec.md rev 3.
 *
 * Zero external deps. Consumes lib/profiles/ for profile resolution.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { parseYaml } from "../profiles/yaml.mjs";
import {
  loadProfiles,
  getEffectivePosture,
  getPluginRoot,
} from "../profiles/index.mjs";

const VALID_KINDS = new Set([
  "quality-gate",
  "subagent-review",
  "deterministic-check",
  "observational",
]);
const VALID_SEVERITY = new Set(["error", "warning", "info"]);
const DEFAULT_SEVERITY_BY_KIND = {
  "quality-gate": "error",
  "subagent-review": "error",
  "deterministic-check": "error",
  observational: "info",
};
const INTERPOLATION_RE = /\{\{|\$\{|\$[A-Z_]|%[A-Z_][A-Z0-9_]*%/;
const BUNDLED_DETERMINISTIC_IDS = new Set([
  "validate.check-1.5-source-manifest",
]);

/**
 * @param {string} repoRoot
 * @param {{ pluginRoot?: string }} [opts]
 */
export function loadValidateConfig(repoRoot, opts = {}) {
  const pluginRoot = opts.pluginRoot ?? getPluginRoot();
  const warnings = [];
  const errors = [];
  const notes = [];

  // Profiles first
  const profilesResult = loadProfiles(repoRoot, { pluginRoot });
  warnings.push(...profilesResult.warnings);
  errors.push(...profilesResult.errors);
  const profiles = profilesResult.profiles;

  const bundledPath = join(pluginRoot, "templates", "validate", "defaults.yaml");
  if (!existsSync(bundledPath)) {
    errors.push({
      code: "VALIDATE_DEFAULTS_MISSING",
      message: `Bundled validate defaults not found at ${bundledPath}.`,
    });
    return { checks: [], profiles, warnings, errors, notes };
  }
  const bundled = loadYaml(bundledPath, errors);

  const overlayPath = join(repoRoot, ".context-index", "governance", "validate.yaml");
  const project = existsSync(overlayPath) ? loadYaml(overlayPath, errors) : {};

  const bundledChecks = Array.isArray(bundled.checks) ? bundled.checks : [];
  const projectChecks = Array.isArray(project.checks) ? project.checks : [];
  const merged = mergeChecks(bundledChecks, projectChecks);

  const validated = [];
  for (const raw of merged) {
    const isBundled = bundledChecks.some((c) => c?.id === raw.id);
    const check = validateCheck(raw, { isBundled, profiles }, warnings, errors, notes);
    if (check) validated.push(check);
  }

  const sorted = topologicalSort(validated, warnings, errors);

  return { checks: sorted, profiles, warnings, errors, notes };
}

function loadYaml(path, errors) {
  try {
    return parseYaml(readFileSync(path, "utf8")) ?? {};
  } catch (e) {
    errors.push({ code: "VALIDATE_YAML", message: `${path}: ${e.message}` });
    return {};
  }
}

function mergeChecks(bundled, project) {
  const byId = new Map();
  for (const c of bundled) {
    if (c?.id) byId.set(c.id, { ...c, __bundled: true });
  }
  for (const c of project) {
    if (!c?.id) continue;
    if (byId.has(c.id)) {
      byId.set(c.id, { ...byId.get(c.id), ...c, __bundled: byId.get(c.id).__bundled });
    } else {
      byId.set(c.id, { ...c, __bundled: false });
    }
  }
  return [...byId.values()];
}

function validateCheck(raw, { isBundled, profiles }, warnings, errors, notes) {
  const id = raw?.id;
  if (!id || typeof id !== "string") {
    errors.push({ code: "CHECK_ID", message: `Check entry missing 'id'.` });
    return null;
  }
  if (raw.enabled === false) {
    // Keep the entry so the report can show SKIPPED-DISABLED; mark it
    return {
      id,
      kind: raw.kind,
      enabled: false,
      disabledNote: `Check '${id}' skipped — disabled by governance/validate.yaml.`,
      after: Array.isArray(raw.after) ? raw.after : [],
      __bundled: isBundled,
    };
  }
  const kind = raw.kind;
  if (!VALID_KINDS.has(kind)) {
    errors.push({
      code: "CHECK_KIND",
      message: `Check '${id}': kind must be one of ${[...VALID_KINDS].join("|")} (got '${kind}').`,
    });
    return null;
  }

  // deterministic-check restriction
  if (kind === "deterministic-check" && !isBundled && !BUNDLED_DETERMINISTIC_IDS.has(id)) {
    errors.push({
      code: "DETERMINISTIC_PROJECT",
      message: `Check '${id}': project entries may not register kind 'deterministic-check' in v1.`,
    });
    return null;
  }

  const severity = raw.severity ?? DEFAULT_SEVERITY_BY_KIND[kind];
  if (!VALID_SEVERITY.has(severity)) {
    errors.push({
      code: "CHECK_SEVERITY",
      message: `Check '${id}': severity must be error|warning|info (got '${severity}').`,
    });
    return null;
  }
  if (kind === "observational" && severity === "error") {
    errors.push({
      code: "OBSERVATIONAL_ERROR_SEVERITY",
      message: `Check '${id}': observational checks may not have severity 'error'.`,
    });
    return null;
  }

  const after = Array.isArray(raw.after) ? [...raw.after] : [];

  const check = {
    id,
    name: raw.name ?? id,
    kind,
    enabled: true,
    severity,
    fail_fast: raw.fail_fast === true,
    after,
    profile: raw.profile,
    prompt: raw.prompt,
    command: raw.command,
    context_pack: raw.context_pack,
    description: raw.description,
    internal: raw.internal === true,
    __bundled: isBundled,
  };

  // Per-kind validation
  if (kind === "quality-gate") {
    const gateIssue = validateQualityGate(check, profiles);
    if (gateIssue) {
      errors.push(gateIssue);
      return null;
    }
  } else if (kind === "subagent-review") {
    if (!check.profile) check.profile = "reviewer-capable";
    if (!check.prompt && !check.internal) {
      errors.push({
        code: "SUBAGENT_PROMPT_REQUIRED",
        message: `Check '${id}': subagent-review requires 'prompt' (unless marked 'internal: true' for bundled migration).`,
      });
      return null;
    }
    if (!profiles[check.profile]) {
      errors.push({
        code: "UNKNOWN_PROFILE",
        message: `Check '${id}': unknown profile '${check.profile}'. Available: ${Object.keys(profiles).sort().join(", ")}.`,
      });
      return null;
    }
  }

  return check;
}

function validateQualityGate(check, profiles) {
  // Explicit profile required — no silent default (SEC-3)
  if (!check.profile) {
    return {
      code: "QUALITY_GATE_PROFILE_MISSING",
      message: `Check '${check.id}': kind 'quality-gate' requires an explicit 'profile'. Profiles describe subagent tool permissions; they do NOT sandbox the subprocess spawned by a quality-gate. Declare the subprocess privilege posture explicitly (e.g. profile: read-only) to acknowledge the subprocess inherits OS-level privileges.`,
    };
  }
  if (!profiles[check.profile]) {
    return {
      code: "UNKNOWN_PROFILE",
      message: `Check '${check.id}': unknown profile '${check.profile}'.`,
    };
  }
  // Argv-only (SEC-1 / 6a)
  const cmd = check.command;
  if (cmd === undefined || cmd === null) {
    return {
      code: "QUALITY_GATE_COMMAND_MISSING",
      message: `Check '${check.id}': quality-gate requires 'command' (list form: [executable, arg, arg, ...]).`,
    };
  }
  if (!Array.isArray(cmd)) {
    return {
      code: "QUALITY_GATE_COMMAND_SHELL",
      message: `Check '${check.id}': quality-gate 'command' must be a YAML list of argv tokens (e.g. [npm, test, --, --silent]). Shell-form strings are rejected to prevent command injection.`,
    };
  }
  if (cmd.length === 0 || typeof cmd[0] !== "string" || cmd[0] === "") {
    return {
      code: "QUALITY_GATE_COMMAND_EMPTY",
      message: `Check '${check.id}': quality-gate 'command' must be a non-empty list with a string executable.`,
    };
  }
  // No interpolation (SEC-1 / 6b)
  for (const token of cmd) {
    if (typeof token !== "string") {
      return {
        code: "QUALITY_GATE_TOKEN_TYPE",
        message: `Check '${check.id}': quality-gate 'command' argv tokens must be strings (got ${JSON.stringify(token)}).`,
      };
    }
    if (INTERPOLATION_RE.test(token)) {
      return {
        code: "QUALITY_GATE_INTERPOLATION",
        message: `Check '${check.id}': quality-gate 'command' argv tokens may not interpolate spec-derived, env-derived, or templated values (found in '${token}'). Values the subprocess needs come from the profile's resolved env via the process environment, not from argv substitution.`,
      };
    }
  }
  // child_process options whitelist (6c)
  if (check.shell === true || check.shell === "true") {
    return {
      code: "QUALITY_GATE_SHELL_TRUE",
      message: `Check '${check.id}': quality-gate 'shell: true' is rejected. Quality gates always run with shell: false.`,
    };
  }
  if (check.cwd !== undefined) {
    return {
      code: "QUALITY_GATE_CWD",
      message: `Check '${check.id}': quality-gate 'cwd' is not a whitelisted option. Subprocess always runs at the consumer repo root.`,
    };
  }
  return null;
}

function topologicalSort(checks, warnings, errors) {
  const byId = new Map(checks.map((c) => [c.id, c]));
  // Validate `after` references
  for (const c of checks) {
    for (const ref of c.after ?? []) {
      if (!byId.has(ref)) {
        warnings.push({
          code: "AFTER_UNKNOWN",
          message: `Check '${c.id}': after references unknown id '${ref}' — treated as empty.`,
        });
      }
    }
  }
  const indeg = new Map(checks.map((c) => [c.id, 0]));
  const outs = new Map(checks.map((c) => [c.id, []]));
  for (const c of checks) {
    for (const ref of c.after ?? []) {
      if (!byId.has(ref)) continue;
      indeg.set(c.id, (indeg.get(c.id) ?? 0) + 1);
      outs.get(ref).push(c.id);
    }
  }
  // Kahn's algorithm with lex tie-break
  const ready = checks
    .filter((c) => (indeg.get(c.id) ?? 0) === 0)
    .map((c) => c.id)
    .sort();
  const out = [];
  while (ready.length) {
    const id = ready.shift();
    out.push(byId.get(id));
    const children = (outs.get(id) ?? []).slice().sort();
    for (const child of children) {
      indeg.set(child, indeg.get(child) - 1);
      if (indeg.get(child) === 0) {
        // Insert in sorted position
        const idx = ready.findIndex((x) => x > child);
        if (idx < 0) ready.push(child);
        else ready.splice(idx, 0, child);
      }
    }
  }
  if (out.length !== checks.length) {
    const remaining = checks.map((c) => c.id).filter((id) => !out.some((x) => x.id === id));
    errors.push({
      code: "AFTER_CYCLE",
      message: `Check ordering cycle detected among: ${remaining.join(", ")}.`,
    });
    return checks;
  }
  return out;
}

/**
 * Apply fail-fast / severity semantics to a result list after each check runs.
 */
export function shouldSkipDueToFailFast(check, prior) {
  for (const parent of check.after ?? []) {
    const parentResult = prior.find((r) => r.id === parent);
    if (!parentResult) continue;
    if (parentResult.fail_fast && parentResult.status === "FAIL" && parentResult.severity === "error") {
      return {
        skip: true,
        reason: `Skipped — prerequisite '${parent}' failed.`,
      };
    }
  }
  return { skip: false };
}
