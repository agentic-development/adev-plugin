/**
 * Configurable validate check registry loader.
 *
 * Contract: .context-index/specs/features/validation/configurable-checks.spec.md rev 3.
 *
 * Zero external deps. Consumes lib/profiles/ for profile resolution.
 */

import { readFileSync, existsSync, realpathSync } from "node:fs";
import { join, resolve, relative, isAbsolute } from "node:path";

import { parseYaml } from "../profiles/yaml.mjs";
import {
  loadProfiles,
  getEffectivePosture,
  getPluginRoot,
} from "../profiles/index.mjs";
import { resolveEnablement } from "./enablement.mjs";

const VALID_KINDS = new Set([
  "quality-gate",
  "subagent-review",
  "deterministic-check",
  "observational",
]);
const VALID_SEVERITY = new Set(["error", "warning", "info"]);
// Allowlist for displaying prompt URIs in PROMPT_NOT_FOUND diagnostics (SEC-3 from rev 2).
// We allow only characters that can legitimately appear in plugin: URIs or relative paths.
const PROMPT_URI_ALLOWLIST_RE = /[^a-zA-Z0-9._\-:/]+/g;
const PROMPT_URI_MAX_DISPLAY = 128;
// Severity defaults removed — now provided by domain profile via domainSeverityDefaults parameter.
// Fallback defaults used when no domain profile provides severity:
const FALLBACK_SEVERITY_BY_KIND = {
  "quality-gate": "error",
  "subagent-review": "error",
  "deterministic-check": "error",
  observational: "info",
};
const INTERPOLATION_RE = /\{\{|\$\{|\$[A-Z_]|%[A-Z_][A-Z0-9_]*%/;
const BUNDLED_DETERMINISTIC_IDS = new Set([
  // Quality gates (explicit-governance-registries.spec.md). Deterministic: the
  // body runs the gate set resolved by `adev domain load-gates` and records
  // each gate's exit status — no subagent judgment. It must NOT be
  // subagent-review, or the registry dispatch loop would spawn a reviewer for a
  // check the skill already orchestrates itself.
  "validate.check-1-quality-gates",
  "validate.check-1.5-source-manifest",
  // Gate Doctor (unified-gates/gate-doctor.spec.md). Deterministic because it
  // is a thin wrapper over `adev gate doctor --json` — no subagent judgment.
  "validate.check-14-gate-executability",
  // Migration Step 2 (explicit-governance-registries.spec.md). Both bodies are
  // thin wrappers over a CLI verb whose evaluator ships in lib/governance/ —
  // `adev boundaries check` and `adev gate transitions`. Neither carries a
  // `profile` or `context_pack` any more, so leaving them subagent-review would
  // spawn a reviewer against a body that only tells it to run a command.
  "validate.check-8-boundaries",
  "validate.check-9-transition-gates",
]);

// Check IDs removed by check-set-restructure.spec.md (Behavior 11).
//
// Project-authored references in `.context-index/governance/validate.yaml` →
//   emit RESURRECTED_CHECK_ID WARN and skip the entry. A project may have
//   customized their override before migration; warning is informational.
// Plugin-supplied references (defensive — should not occur post-migration
//   but caught if a future starter regression reintroduces one) →
//   the REMOVED_CHECK_ID error code is reserved for a separate starter
//   validator pass; this loader path always treats removed IDs as project-
//   authored because `loadValidateConfig` only reads project files in the
//   single-source model.
//
// SEC-4 (rev-2): the WARN message must show only the check ID, not the full
// entry content — project names or labels may carry codenames that should
// not surface in hygiene output that may be shared in chat or PRs.
const REMOVED_CHECK_IDS = new Set([
  "validate.check-3-charter-consistency",
  "validate.check-5-adrs",
  "validate.check-6-cross-cutting",
  "validate.check-7-specialist-review",
  "validate.check-10-platform-drift",
  "validate.check-12-lifecycle-reconciliation",
  "validate.check-12-heuristic-extraction",
]);

/**
 * Load the validate check registry directly from `.context-index/governance/validate.yaml`.
 *
 * This is the single-source model: no bundled-defaults read, no overlay merge.
 * The project's `governance/validate.yaml` is the entire registry. The file
 * is scaffolded at `/adev:init` time from `templates/domains/<domain>/validate.yaml`.
 *
 * @param {string} repoRoot
 * @param {{ pluginRoot?: string, domainSeverityDefaults?: Record<string, string> }} [opts]
 * @throws {Error} with `code: 'MISSING_VALIDATE_CONFIG'` when the file is absent.
 */
export function loadValidateConfig(repoRoot, opts = {}) {
  const pluginRoot = opts.pluginRoot ?? getPluginRoot();
  // Domain severity defaults override the fallback constants when provided
  const severityByKind = opts.domainSeverityDefaults
    ? { ...FALLBACK_SEVERITY_BY_KIND, ...opts.domainSeverityDefaults }
    : FALLBACK_SEVERITY_BY_KIND;
  const warnings = [];
  const errors = [];
  const notes = [];

  // Profiles first
  const profilesResult = loadProfiles(repoRoot, { pluginRoot });
  warnings.push(...profilesResult.warnings);
  errors.push(...profilesResult.errors);
  const profiles = profilesResult.profiles;

  // Single-source: read .context-index/governance/validate.yaml directly. No
  // bundled defaults, no overlay merge. Missing file is a hard error pointing
  // at /adev:init.
  const governancePath = join(repoRoot, ".context-index", "governance", "validate.yaml");
  if (!existsSync(governancePath)) {
    const err = new Error(
      "No governance/validate.yaml found. Run /adev:init to scaffold the validate configuration for your domain."
    );
    err.code = "MISSING_VALIDATE_CONFIG";
    throw err;
  }
  const project = loadYaml(governancePath, errors);
  const projectChecks = Array.isArray(project.checks) ? project.checks : [];

  const validated = [];
  for (const raw of projectChecks) {
    // Enforce id allowlist BEFORE any further validation or URI construction
    // (Behavior 0 / SEC-1). This is independent of the path-containment guard
    // already in resolvePromptUri.
    if (!validateCheckIdAllowlist(raw, errors)) continue;

    // Removed-check guard (check-set-restructure.spec.md Behavior 11). The
    // single-source loader only sees project-authored content; references to
    // removed IDs are tolerated as RESURRECTED_CHECK_ID warnings (the entry
    // is skipped). The diagnostic deliberately shows only the check ID so it
    // can be surfaced in hygiene output without leaking other fields the
    // project may have attached to the entry (SEC-4).
    if (REMOVED_CHECK_IDS.has(raw.id)) {
      warnings.push({
        code: "RESURRECTED_CHECK_ID",
        message:
          `Check id '${raw.id}' was removed by check-set-restructure.spec.md — entry skipped. ` +
          `See /adev:hygiene Audit Pass 20, /adev:reconcile lifecycle-sync, /adev:review-specs, or hooks/post-validate-extract-heuristics for the relocated logic.`,
      });
      continue;
    }

    const check = validateCheck(
      raw,
      { profiles, severityByKind, repoRoot, pluginRoot },
      warnings,
      errors,
      notes,
    );
    if (check) validated.push(check);
  }

  const sorted = topologicalSort(validated, warnings, errors);

  // `disabled` holds the SAME objects that are in `checks` — one source of
  // truth, two access paths. A caller rendering the report reads it directly; a
  // caller that only wants what runs filters `checks` on `enabled !== false`.
  return {
    checks: sorted,
    disabled: sorted.filter((c) => c.enabled === false),
    profiles,
    warnings,
    errors,
    notes,
  };
}

/**
 * SEC-1 (Behavior 0): every entry's `id` field must match the allowlist pattern
 * BEFORE any plugin: URI construction. Non-conforming values are rejected with
 * `INVALID_CHECK_ID` and the offending value is stripped of non-allowlist chars
 * (preventing log injection) and truncated to 64 chars before display.
 *
 * Returns true when the id is conforming; false when the entry should be dropped.
 */
const CHECK_ID_ALLOWLIST = /^[a-z0-9][a-z0-9._-]*$/;
function validateCheckIdAllowlist(raw, errors) {
  const id = raw?.id;
  if (typeof id !== "string" || id === "") {
    errors.push({
      code: "CHECK_ID",
      message: `Check entry missing 'id'.`,
    });
    return false;
  }
  if (!CHECK_ID_ALLOWLIST.test(id)) {
    const stripped = id.replace(/[^a-z0-9._-]/g, "").slice(0, 64);
    errors.push({
      code: "INVALID_CHECK_ID",
      message: `Check id "${stripped}" (stripped/truncated) does not match ${CHECK_ID_ALLOWLIST}.`,
    });
    return false;
  }
  return true;
}

function loadYaml(path, errors) {
  try {
    return parseYaml(readFileSync(path, "utf8")) ?? {};
  } catch (e) {
    errors.push({ code: "VALIDATE_YAML", message: `${path}: ${e.message}` });
    return {};
  }
}

function validateCheck(raw, { profiles, severityByKind: severityDefaults, repoRoot, pluginRoot }, warnings, errors, notes) {
  // id has already been validated by validateCheckIdAllowlist before this is called.
  const id = raw.id;

  // Enablement, read through the shared rule (lib/governance/enablement.mjs).
  // The SKIP itself is long-standing behaviour and is unchanged; what the shared
  // reader adds is `disabled_reason` on the entry (nothing read it before, so a
  // disabled check could not say why it was off) plus the DISABLED_WITHOUT_REASON
  // and INVALID_ENABLED_VALUE warnings.
  const enablement = resolveEnablement(raw, { registryFile: "validate.yaml", id });
  warnings.push(...enablement.warnings);
  if (!enablement.enabled) {
    // Keep the entry so the report can show SKIPPED-DISABLED; mark it.
    return {
      id,
      kind: raw.kind,
      enabled: false,
      disabled_reason: enablement.disabled_reason,
      disabledNote: enablement.disabledNote,
      after: Array.isArray(raw.after) ? raw.after : [],
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

  // deterministic-check restriction (Invariant from spec): only IDs in
  // BUNDLED_DETERMINISTIC_IDS may be kind: deterministic-check. Single-source
  // model means everything is project-owned, but the *closed set of allowed
  // deterministic-check IDs* is still bundled here for v1.
  if (kind === "deterministic-check" && !BUNDLED_DETERMINISTIC_IDS.has(id)) {
    errors.push({
      code: "DETERMINISTIC_PROJECT",
      message: `Check '${id}': project entries may not register kind 'deterministic-check' in v1.`,
    });
    return null;
  }

  const severity = raw.severity ?? (severityDefaults ?? FALLBACK_SEVERITY_BY_KIND)[kind];
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
    if (!check.prompt) {
      errors.push({
        code: "SUBAGENT_PROMPT_REQUIRED",
        message: `Check '${id}': subagent-review requires 'prompt'.`,
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

  // Resolve the `prompt` URI to an absolute file path (Behavior 5/6 of spec rev 2).
  // Only resolved when `prompt` is a string (subagent-review entries require it; other
  // kinds may carry an optional prompt). Resolution is per the URI scheme:
  //   - plugin:validate/checks/<file> -> <pluginRoot>/skills/validate/checks/<file>
  //   - plugin:<skill>/<file>         -> deferred to existing review-specs scheme (not used here)
  //   - relative path                 -> resolved from .context-index/ with traversal guard
  //   - absolute path                 -> rejected
  //   - plugin:<other>:...            -> cross-plugin, rejected
  if (typeof check.prompt === "string" && check.prompt !== "") {
    const resolved = resolvePromptUri(check.id, check.prompt, { repoRoot, pluginRoot }, errors);
    if (!resolved) return null;
    check.resolvedPromptPath = resolved;
  }

  return check;
}

/**
 * Resolve a check's `prompt` URI to an absolute file path, applying SEC guards:
 *  - SEC-3: PROMPT_NOT_FOUND diagnostic emits URIs truncated to ≤128 chars and
 *    stripped of characters outside the allowlist used in legitimate URIs.
 *  - Behavior 22: `..` traversal rejected, absolute paths rejected, cross-plugin
 *    references rejected, symlink-escape rejected.
 */
function resolvePromptUri(checkId, promptUri, { repoRoot, pluginRoot }, errors) {
  // Cross-plugin reference (form: plugin:<other>:...) -> deferred to v2 (PROMPT_CROSS_PLUGIN).
  if (/^plugin:[^/]*:/.test(promptUri)) {
    errors.push({
      code: "PROMPT_CROSS_PLUGIN",
      message: `Check '${checkId}': cross-plugin prompt references (${sanitizeUriForDisplay(promptUri)}) are not supported.`,
    });
    return null;
  }

  if (promptUri.startsWith("plugin:")) {
    const rest = promptUri.slice("plugin:".length);
    // The plugin scheme is always <skill-name>/<file>; we resolve against <pluginRoot>/skills/.
    const pluginSkillsRoot = resolve(pluginRoot, "skills");
    const target = resolve(pluginSkillsRoot, rest);
    if (!isUnder(target, pluginSkillsRoot)) {
      errors.push({
        code: "PROMPT_PATH_ESCAPE",
        message: `Check '${checkId}': prompt URI '${sanitizeUriForDisplay(promptUri)}' resolves outside plugin 'skills/' tree.`,
      });
      return null;
    }
    if (!existsSync(target)) {
      errors.push({
        code: "PROMPT_NOT_FOUND",
        message: `Check '${checkId}': prompt file not found for URI '${sanitizeUriForDisplay(promptUri)}'.`,
      });
      return null;
    }
    return target;
  }

  if (isAbsolute(promptUri)) {
    errors.push({
      code: "PROMPT_ABSOLUTE_PATH",
      message: `Check '${checkId}': absolute prompt paths are not supported (got '${sanitizeUriForDisplay(promptUri)}').`,
    });
    return null;
  }

  // Reject '..' segments pre-resolution.
  if (promptUri.split("/").some((s) => s === "..")) {
    errors.push({
      code: "PROMPT_PATH_TRAVERSAL",
      message: `Check '${checkId}': prompt path '${sanitizeUriForDisplay(promptUri)}' contains '..' — path traversal rejected.`,
    });
    return null;
  }

  // Project-relative path: resolved from .context-index/ with traversal guard.
  const contextRoot = resolve(repoRoot, ".context-index");
  const target = resolve(contextRoot, promptUri);
  if (!isUnder(target, contextRoot)) {
    errors.push({
      code: "PROMPT_PATH_ESCAPE",
      message: `Check '${checkId}': prompt path '${sanitizeUriForDisplay(promptUri)}' resolves outside .context-index/.`,
    });
    return null;
  }
  if (!existsSync(target)) {
    errors.push({
      code: "PROMPT_NOT_FOUND",
      message: `Check '${checkId}': prompt file not found for path '${sanitizeUriForDisplay(promptUri)}'.`,
    });
    return null;
  }
  // Symlink-escape check.
  let real;
  try {
    real = realpathSync(target);
  } catch (e) {
    errors.push({
      code: "PROMPT_REALPATH",
      message: `Check '${checkId}': cannot resolve prompt path '${sanitizeUriForDisplay(promptUri)}': ${e.message}.`,
    });
    return null;
  }
  let realRoot;
  try {
    realRoot = realpathSync(contextRoot);
  } catch {
    realRoot = contextRoot;
  }
  if (!isUnder(real, realRoot)) {
    errors.push({
      code: "PROMPT_SYMLINK_ESCAPE",
      message: `Check '${checkId}': prompt path '${sanitizeUriForDisplay(promptUri)}' resolves outside .context-index/ via symlink.`,
    });
    return null;
  }
  return real;
}

function isUnder(abs, root) {
  const rel = relative(root, abs);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/**
 * SEC-3: Sanitize a URI for inclusion in diagnostic messages.
 *  - Strip characters outside the legitimate-URI allowlist (prevents log injection
 *    from accidentally-sensitive `id` or `prompt` values, e.g. ANSI escapes or
 *    newlines smuggled into operator-facing output).
 *  - Truncate to at most 128 characters to bound diagnostic size.
 */
function sanitizeUriForDisplay(uri) {
  const stripped = String(uri ?? "").replace(PROMPT_URI_ALLOWLIST_RE, "");
  if (stripped.length <= PROMPT_URI_MAX_DISPLAY) return stripped;
  return stripped.slice(0, PROMPT_URI_MAX_DISPLAY - 1) + "…";
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
