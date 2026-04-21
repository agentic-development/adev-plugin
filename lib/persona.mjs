import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

/**
 * Parse a flat key=value config file.
 * Ignores blank lines and lines starting with #.
 * Values are everything after the first = on each line.
 * Returns {} on error or missing file.
 */
export function parseUserConfig(filePath) {
  try {
    const content = readFileSync(filePath, "utf-8");
    const config = {};
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      if (key) config[key] = value;
    }
    return config;
  } catch {
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
 * @returns {{ name: string, source: string }}
 */
export function resolvePersona({ localConfigPath, globalConfigPath, templatesDir }) {
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
    return { name: "developer", source: "fallback" };
  }

  // Reject path separators and ..
  if (/[/\\]|\.\./.test(persona)) {
    return { name: "developer", source: "fallback" };
  }

  // Validate against actual directory listing
  try {
    const available = readdirSync(templatesDir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.slice(0, -3));
    if (!available.includes(persona)) {
      return { name: "developer", source: "fallback" };
    }
  } catch {
    return { name: "developer", source: "fallback" };
  }

  return { name: persona, source };
}

/**
 * Load persona directive template by validated name.
 * Falls back to developer.md if the named template is missing.
 * Returns null if the templates directory is missing entirely.
 *
 * @param {string} name - Persona name (already validated)
 * @param {string} templatesDir - Path to templates/personas/
 * @returns {string|null}
 */
export function loadPersonaDirective(name, templatesDir) {
  if (!existsSync(templatesDir)) {
    return null;
  }

  const targetPath = join(templatesDir, `${name}.md`);
  if (existsSync(targetPath)) {
    try {
      return readFileSync(targetPath, "utf-8");
    } catch {
      // Fall through to developer fallback
    }
  }

  // Fallback to developer
  const fallbackPath = join(templatesDir, "developer.md");
  if (existsSync(fallbackPath)) {
    try {
      return readFileSync(fallbackPath, "utf-8");
    } catch {
      return null;
    }
  }

  return null;
}
