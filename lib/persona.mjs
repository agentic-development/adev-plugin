import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

/**
 * Parse a flat key=value config file.
 * Ignores blank lines and lines starting with #.
 * Values are everything after the first = on each line.
 * Returns { config, warnings } where config is {} on error or missing file.
 */
export function parseUserConfig(filePath) {
  const warnings = [];
  try {
    const content = readFileSync(filePath, "utf-8");
    const config = {};
    let hasValidLine = false;
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      hasValidLine = true;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      if (key) config[key] = value;
    }
    if (!hasValidLine && content.trim().length > 0) {
      warnings.push("user-config has no valid key=value lines, ignoring");
    }
    return hasValidLine ? config : {};
  } catch (err) {
    if (err.code !== "ENOENT") {
      warnings.push("Could not read user-config, using defaults");
    }
    return {};
  }
}

/**
 * Resolve persona from config hierarchy: local > global > fallback.
 * Validates persona name against actual directory listing.
 * Rejects names containing path separators.
 *
 * @param {object} options
 * @param {string} options.localConfigPath - Path to local user-config
 * @param {string} options.globalConfigPath - Path to global user-config
 * @param {string} options.templatesDir - Path to templates/personas/
 * @returns {{ name: string, source: string, warnings: string[] }}
 */
export function resolvePersona({ localConfigPath, globalConfigPath, templatesDir }) {
  const warnings = [];
  const localConfig = parseUserConfig(localConfigPath);
  const globalConfig = parseUserConfig(globalConfigPath);

  let persona = null;
  let source = "fallback";

  if (localConfig.persona) {
    persona = localConfig.persona;
    source = "local";
  } else if (globalConfig.persona) {
    persona = globalConfig.persona;
    source = "global";
  }

  if (!persona) {
    return { name: "developer", source: "fallback", warnings };
  }

  // Reject path separators and ..
  if (/[/\\]|\.\./.test(persona)) {
    warnings.push(`Persona name '${persona}' contains path separators, falling back to developer`);
    return { name: "developer", source: "fallback", warnings };
  }

  // Validate against actual directory listing
  try {
    const available = readdirSync(templatesDir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.slice(0, -3));
    if (!available.includes(persona)) {
      warnings.push(`Unknown persona '${persona}', falling back to developer`);
      return { name: "developer", source: "fallback", warnings };
    }
  } catch {
    warnings.push("Could not read persona templates directory, falling back to developer");
    return { name: "developer", source: "fallback", warnings };
  }

  return { name: persona, source, warnings };
}

/**
 * Load persona directive template by validated name.
 * Falls back to developer.md if the named template is missing.
 * Returns { content, warnings } where content is null if templates dir is missing.
 *
 * @param {string} name - Persona name (already validated)
 * @param {string} templatesDir - Path to templates/personas/
 * @returns {{ content: string|null, warnings: string[] }}
 */
export function loadPersonaDirective(name, templatesDir) {
  const warnings = [];

  if (!existsSync(templatesDir)) {
    warnings.push("Persona templates directory not found, no directive injected");
    return { content: null, warnings };
  }

  const targetPath = join(templatesDir, `${name}.md`);
  if (existsSync(targetPath)) {
    try {
      return { content: readFileSync(targetPath, "utf-8"), warnings };
    } catch {
      warnings.push(`Could not read persona template '${name}', falling back to developer`);
    }
  } else {
    warnings.push(`Persona template '${name}' not found, falling back to developer`);
  }

  // Fallback to developer
  const fallbackPath = join(templatesDir, "developer.md");
  if (existsSync(fallbackPath)) {
    try {
      return { content: readFileSync(fallbackPath, "utf-8"), warnings };
    } catch {
      return { content: null, warnings };
    }
  }

  return { content: null, warnings };
}
