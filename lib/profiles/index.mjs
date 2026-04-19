/**
 * Public API for execution profiles.
 *
 * Contract: .context-index/specs/cross-cutting/execution-profiles.md Behaviors 1-4.
 *
 * Zero external dependencies.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { parseYaml, YamlParseError } from "./yaml.mjs";
import { validateProfile, validateAll } from "./schema.mjs";
import { resolveEffective } from "./extends.mjs";
import { resolveEnv } from "./env.mjs";
import { createRedactor } from "./redaction.mjs";
import { loadCategories } from "./tool-categories.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Derive the plugin root from this module's location.
 *
 * This file lives at `lib/profiles/index.mjs`; the plugin root is two levels up.
 */
export function getPluginRoot() {
  return join(__dirname, "..", "..");
}

/**
 * Load the merged set of profiles for a repo.
 *
 * Reads bundled defaults first (templates/governance/profiles.yaml), then
 * overlays `.context-index/profiles.yaml` if present. Project entries merge
 * by `name`: same name → project wins (full replacement); new name → appended.
 *
 * @param {string} repoRoot  consumer repo root (the repo owning the spec being processed)
 * @param {{ pluginRoot?: string }} [opts]
 * @returns {{
 *   profiles: Record<string, any>,
 *   categories: Map<string, any>,
 *   warnings: {code: string, message: string}[],
 *   errors: {code: string, message: string}[],
 *   notes: string[],
 * }}
 */
export function loadProfiles(repoRoot, opts = {}) {
  const pluginRoot = opts.pluginRoot ?? getPluginRoot();
  const warnings = [];
  const errors = [];
  const notes = [];

  // Categories
  const cats = loadCategories(pluginRoot, repoRoot);
  warnings.push(...cats.warnings);
  errors.push(...cats.errors);

  // Bundled profiles
  const bundledPath = join(pluginRoot, "templates", "governance", "profiles.yaml");
  if (!existsSync(bundledPath)) {
    errors.push({ code: "PROFILES_BUNDLED_MISSING", message: `Bundled profiles.yaml not found at ${bundledPath}.` });
    return { profiles: {}, categories: cats.categories, warnings, errors, notes };
  }
  const bundled = loadProfilesFile(bundledPath, errors);

  // Project overlay
  const overlayPath = repoRoot ? join(repoRoot, ".context-index", "profiles.yaml") : null;
  let project = {};
  if (overlayPath && existsSync(overlayPath)) {
    project = loadProfilesFile(overlayPath, errors);
    if (Object.keys(project).length === 0) {
      notes.push(`profiles.yaml found but no profiles declared — using bundled defaults.`);
    }
  }

  // Workspace-level profiles.yaml: ignored in v1 (Behavior 33). Informational.
  if (repoRoot) {
    const wsParent = findWorkspaceProfilesYaml(repoRoot);
    if (wsParent) {
      notes.push(`Workspace-level profiles.yaml found at ${wsParent} but ignored in v1.`);
    }
  }

  // Merge: project wins per name (full replacement).
  const profiles = { ...bundled };
  for (const [name, entry] of Object.entries(project)) {
    if (profiles[name]) {
      notes.push(`Profile '${name}' overrides bundled default.`);
    }
    profiles[name] = entry;
  }

  // Validate each entry.
  const v = validateAll(profiles);
  warnings.push(...v.warnings);
  errors.push(...v.errors);

  // Validate that every `extends` parent exists; cycles and depth are checked
  // lazily in `resolveEffective`. We do a quick eager pass for clearer errors.
  for (const [name, entry] of Object.entries(profiles)) {
    if (entry?.extends && !profiles[entry.extends]) {
      errors.push({
        code: "EXTENDS_UNKNOWN",
        message: `Profile '${name}': extends unknown profile '${entry.extends}'.`,
      });
    }
  }

  // Validate category references against the registry; unknown → WARN.
  for (const [name, entry] of Object.entries(profiles)) {
    const tools = [
      ...(entry?.permissions?.tools?.allow ?? []),
      ...(entry?.permissions?.tools?.allow_add ?? []),
    ];
    for (const t of tools) {
      if (t && typeof t === "object" && typeof t.category === "string" && !cats.categories.has(t.category)) {
        warnings.push({
          code: "UNKNOWN_CATEGORY",
          message: `Profile '${name}': unknown tool category '${t.category}'. To propose a new category, add a markdown file under .context-index/specs/cross-cutting/tool-categories/${t.category}.md and ensure your harness adapter implements it.`,
        });
      }
    }
  }

  return { profiles, categories: cats.categories, warnings, errors, notes };
}

/**
 * Resolve a profile by name to its effective shape + env + redactor, ready for
 * handoff to an adapter's `prepareForDispatch`.
 *
 * @param {string} name
 * @param {{
 *   profiles: Record<string, any>,
 *   consumerRepoRoot: string,
 *   workspaceRoot?: string | null,
 *   mcpAvailable?: Set<string>,
 *   adapter?: { IMPLEMENTED: readonly string[], UNSUPPORTED: readonly string[], HARNESS: string, capabilities?: any },
 * }} ctx
 * @returns {{
 *   effective: any,
 *   env: Record<string,string>,
 *   contributing: Record<string,string>,
 *   redactor: ReturnType<typeof createRedactor>,
 *   redactionSet: Set<string>,
 *   warnings: {code:string,message:string}[],
 *   errors: {code:string,message:string}[],
 *   notes: string[],
 * }}
 */
export function resolveProfile(name, ctx) {
  const warnings = [];
  const errors = [];
  const notes = [];
  const profiles = ctx.profiles || {};

  if (!profiles[name]) {
    const available = Object.keys(profiles).sort().join(", ");
    errors.push({
      code: "UNKNOWN_PROFILE",
      message: `Unknown profile '${name}'. Available: ${available || "(none)"}.`,
    });
    return { effective: null, env: {}, contributing: {}, redactor: createRedactor({}), redactionSet: new Set(), warnings, errors, notes };
  }

  const resolved = resolveEffective(name, profiles);
  warnings.push(...resolved.warnings);
  errors.push(...resolved.errors);
  if (!resolved.effective) {
    return { effective: null, env: {}, contributing: {}, redactor: createRedactor({}), redactionSet: new Set(), warnings, errors, notes };
  }

  // Adapter contract checks: unsupported categories / missing MCP.
  if (ctx.adapter) {
    const toolList = resolved.effective.permissions?.tools?.allow ?? [];
    for (const entry of toolList) {
      if (entry?.category && ctx.adapter.UNSUPPORTED.includes(entry.category)) {
        errors.push({
          code: "UNSUPPORTED_CATEGORY",
          message: `Harness adapter '${ctx.adapter.HARNESS}' does not implement category '${entry.category}'. Profiles requiring this category cannot be dispatched.`,
        });
      }
      if (entry?.mcp_server && ctx.mcpAvailable && !ctx.mcpAvailable.has(entry.mcp_server)) {
        errors.push({
          code: "MCP_MISSING",
          message: `Profile '${name}' requires MCP server '${entry.mcp_server}' which is not configured. Add it to your harness MCP settings.`,
        });
      }
    }
    if (ctx.adapter.capabilities?.envTrustBoundary?.version == null &&
        (resolved.effective.env?.allow?.required?.length || resolved.effective.env?.allow?.optional?.length)) {
      errors.push({
        code: "ENV_TRUST_BOUNDARY",
        message: `Harness '${ctx.adapter.HARNESS}' does not implement env trust boundary; cannot use profiles with env.allow entries.`,
      });
    }
  }

  // Env resolution.
  const envResult = resolveEnv(resolved.effective, {
    profileName: name,
    consumerRepoRoot: ctx.consumerRepoRoot,
    workspaceRoot: ctx.workspaceRoot ?? null,
  });
  warnings.push(...envResult.warnings);
  errors.push(...envResult.errors);

  const redactionSet = new Set(Object.values(envResult.env).filter((v) => typeof v === "string" && v.length >= 8));
  const redactor = createRedactor(envResult.env);

  return {
    effective: resolved.effective,
    env: envResult.env,
    contributing: envResult.contributing,
    redactor,
    redactionSet,
    warnings,
    errors,
    notes,
  };
}

/**
 * Return the effective posture of a profile at load-time, usable for
 * contract-level checks that cannot go through a harness adapter
 * (e.g. configurable-reviewers Behavior 11a).
 *
 * @param {string} name
 * @param {Record<string, any>} profiles
 * @returns {{ posture: null | {
 *   allow: any[],
 *   fsWrite: "allow"|"deny",
 *   fsExecute: "allow"|"deny",
 *   network: "allow"|"read-only"|"deny",
 * }, errors: {code:string,message:string}[] }}
 */
export function getEffectivePosture(name, profiles) {
  const r = resolveEffective(name, profiles);
  if (!r.effective) return { posture: null, errors: r.errors };
  return {
    posture: {
      allow: r.effective.permissions.tools.allow,
      fsWrite: r.effective.permissions.filesystem.write,
      fsExecute: r.effective.permissions.filesystem.execute,
      network: r.effective.permissions.network,
    },
    errors: r.errors,
  };
}

function loadProfilesFile(path, errors) {
  let content;
  try {
    content = readFileSync(path, "utf8");
  } catch (e) {
    errors.push({ code: "PROFILES_READ", message: `${path}: ${e.message}` });
    return {};
  }
  let doc;
  try {
    doc = parseYaml(content);
  } catch (e) {
    errors.push({ code: "PROFILES_YAML", message: `${path}: ${e.message}` });
    return {};
  }
  return doc?.profiles ?? {};
}

function findWorkspaceProfilesYaml(startDir) {
  let dir = startDir;
  while (true) {
    const ws = join(dir, "adev-workspace.yaml");
    if (existsSync(ws)) {
      const candidate = join(dir, "profiles.yaml");
      return existsSync(candidate) ? candidate : null;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
