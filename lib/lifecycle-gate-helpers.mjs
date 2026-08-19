/**
 * Shared helpers for lifecycle gate hooks.
 *
 * Called by hooks/lifecycle-gate-*.sh via node inline scripts
 * to perform file exclusion checks and module resolution.
 *
 * @module lib/lifecycle-gate-helpers
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { resolveGateConfig, matchesFileExclusion, matchesBashPassthrough } from "./lifecycle-gate-config.mjs";
import { resolveDomain } from "./domains/resolve.mjs";
import { loadDomainConfig } from "./domains/domain-config.mjs";
import { mergeGateConfig } from "./domains/merge-gate-config.mjs";

/**
 * Parse a user-config file (key=value format) into a flat object.
 * @param {string} filePath
 * @returns {Record<string, string>}
 */
function parseUserConfig(filePath) {
  try {
    const content = readFileSync(filePath, "utf-8");
    const config = {};
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      config[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
    }
    return config;
  } catch {
    return {};
  }
}

/**
 * Load merged user-config (global + local).
 * @param {string} contextRoot - Project root with .context-index/
 * @param {string} pluginRoot - Plugin root directory
 * @returns {Record<string, string>}
 */
export function loadMergedConfig(contextRoot, pluginRoot) {
  const localConfig = parseUserConfig(join(contextRoot, ".context-index", "user-config"));
  const globalConfig = parseUserConfig(join(pluginRoot, "user-config"));
  return { ...globalConfig, ...localConfig };
}

/**
 * Load domain gate config for the resolved domain.
 * @param {string} contextRoot - Project root
 * @param {string} pluginRoot - Plugin root
 * @returns {{ file_exclusions: string[], bash_passthrough: string[] }}
 */
function loadDomainGateConfig(contextRoot, pluginRoot) {
  try {
    // Parse manifest for domain resolution
    const manifestPath = join(contextRoot, ".context-index", "manifest.yaml");
    let manifest = null;
    if (existsSync(manifestPath)) {
      const content = readFileSync(manifestPath, "utf-8");
      // Minimal YAML parsing for the top-level `domain:` key. resolveDomain()
      // reads `manifest.domain` directly (not a nested `project.domain`), so
      // no wrapping is needed here — see lib/domains/resolve.mjs.
      const domainMatch = content.match(/^\s*domain:\s*(\S+)/m);
      if (domainMatch) {
        manifest = { domain: domainMatch[1] };
      }
    }
    const { resolved_domain } = resolveDomain(manifest, null, null);
    const overlay = loadDomainConfig(resolved_domain, "gate-config", contextRoot, pluginRoot);
    const { config } = mergeGateConfig(overlay);
    return config;
  } catch {
    // If domain resolution fails, return empty config (strictest mode)
    return { file_exclusions: [], bash_passthrough: [] };
  }
}

/**
 * Check if a file path is excluded from lifecycle gating.
 * @param {string} filePath - Relative file path
 * @param {string} contextRoot
 * @param {string} pluginRoot
 * @returns {boolean}
 */
export function isFileExcluded(filePath, contextRoot, pluginRoot) {
  const merged = loadMergedConfig(contextRoot, pluginRoot);
  const domainConfig = loadDomainGateConfig(contextRoot, pluginRoot);
  const config = resolveGateConfig(merged, domainConfig);
  return matchesFileExclusion(filePath, config);
}

/**
 * Check if a bash command matches passthrough patterns.
 * @param {string} command
 * @param {string} contextRoot
 * @param {string} pluginRoot
 * @returns {boolean}
 */
export function isBashPassthrough(command, contextRoot, pluginRoot) {
  const merged = loadMergedConfig(contextRoot, pluginRoot);
  const domainConfig = loadDomainGateConfig(contextRoot, pluginRoot);
  const config = resolveGateConfig(merged, domainConfig);
  return matchesBashPassthrough(command, config);
}

/**
 * Parse modules from manifest.yaml.
 * @param {string} contextRoot
 * @returns {Array<{slug: string, paths: string[]}>}
 */
function parseModules(contextRoot) {
  const modules = [];
  try {
    const manifest = readFileSync(join(contextRoot, ".context-index", "manifest.yaml"), "utf-8");
    const lines = manifest.split("\n");
    let inModules = false;
    let currentSlug = null;
    let currentPaths = [];
    let inPaths = false;

    for (const line of lines) {
      // Detect modules: section
      if (/^modules:\s*$/.test(line)) {
        inModules = true;
        continue;
      }
      // End of modules section: a non-indented line that's not empty
      if (inModules && /^\S/.test(line) && line.trim()) {
        if (currentSlug) modules.push({ slug: currentSlug, paths: currentPaths });
        inModules = false;
        continue;
      }
      if (!inModules) continue;

      // Detect slug
      const slugMatch = line.match(/^\s+-\s+slug:\s*(\S+)/);
      if (slugMatch) {
        if (currentSlug) modules.push({ slug: currentSlug, paths: currentPaths });
        currentSlug = slugMatch[1];
        currentPaths = [];
        inPaths = false;
        continue;
      }

      // Detect paths: key
      if (/^\s+paths:\s*$/.test(line)) {
        inPaths = true;
        continue;
      }

      // Detect name: key (skip)
      if (/^\s+name:/.test(line)) {
        inPaths = false;
        continue;
      }

      // Collect path entries
      if (inPaths && currentSlug) {
        const pathMatch = line.match(/^\s+-\s+(.+)/);
        if (pathMatch) {
          const p = pathMatch[1].trim().replace(/^["']|["']$/g, "");
          if (p) currentPaths.push(p);
        } else if (/^\s+-\s+slug:/.test(line)) {
          inPaths = false;
        }
      }
    }
    if (currentSlug) modules.push({ slug: currentSlug, paths: currentPaths });
  } catch {
    // Malformed manifest — no modules
  }
  return modules;
}

/**
 * Resolve which module a file belongs to.
 * @param {string} filePath - Relative file path
 * @param {string} contextRoot
 * @returns {string|null}
 */
export function resolveModule(filePath, contextRoot) {
  const modules = parseModules(contextRoot);

  // Check against module paths
  for (const mod of modules) {
    for (const p of mod.paths) {
      const cleanPath = p.replace(/\/$/, "");
      if (filePath.startsWith(cleanPath + "/") || filePath === cleanPath) {
        return mod.slug;
      }
    }
  }

  // Fallback: directory heuristics
  const parts = filePath.split("/");
  if (parts[0] === "hooks") return "hooks";
  if (parts[0] === "cli") return "cli";
  if (parts[0] === "skills" && parts.length > 1) return parts[1];
  if (parts[0] === "lib") return "lib";
  if (parts[0] === "src" && parts.length > 1) return parts[1];

  return null;
}

/**
 * Check module's lifecycle status: does it have specs and/or plans?
 * @param {string} moduleSlug
 * @param {string} contextRoot
 * @returns {{ hasSpecs: boolean, hasPlan: boolean, specPath: string }}
 */
export function checkModuleLifecycle(moduleSlug, contextRoot) {
  const specsDir = join(contextRoot, ".context-index", "specs", "features", moduleSlug);
  let hasSpecs = false;
  let hasPlan = false;
  let specPath = "";

  if (!existsSync(specsDir)) {
    return { hasSpecs, hasPlan, specPath };
  }

  try {
    const files = readdirSync(specsDir);
    for (const f of files) {
      if (f.endsWith(".spec.md")) {
        hasSpecs = true;
        if (!specPath) specPath = join(".context-index", "specs", "features", moduleSlug, f);
      }
      if (f.endsWith(".plan.md")) {
        hasPlan = true;
      }
    }
  } catch {
    // Cannot read directory
  }

  return { hasSpecs, hasPlan, specPath };
}
