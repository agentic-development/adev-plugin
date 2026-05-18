import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

// Closed enumeration for the verbosity axis. Re-validated at parse time
// (parseUserConfig) and at resolve time (resolvePersona) — defense in depth.
const VERBOSITY_ENUM = ["terse", "normal", "deep"];

// Per-persona verbosity defaults (Spec Behavior 2).
const VERBOSITY_DEFAULTS = {
  architect: "normal",
  developer: "normal",
  product: "terse",
};

/**
 * Validate a verbosity value against the closed enum AND the path-traversal denylist.
 * Mirrors the persona validation contract at persona-resolution-and-injection.spec.md:48.
 *
 * @param {*} value - The candidate verbosity value
 * @returns {{ ok: boolean, reason?: string }}
 */
function validateVerbosity(value) {
  if (typeof value !== "string" || !value) {
    return { ok: false, reason: "missing or non-string verbosity value" };
  }
  if (/[/\\]|\.\./.test(value)) {
    return {
      ok: false,
      reason: `verbosity value '${value}' contains path separators; rejected`,
    };
  }
  if (!VERBOSITY_ENUM.includes(value)) {
    return {
      ok: false,
      reason: `verbosity value '${value}' is not one of {terse, normal, deep}`,
    };
  }
  return { ok: true };
}

/**
 * Parse a flat key=value config file.
 * Ignores blank lines and lines starting with #.
 * Values are everything after the first = on each line.
 * For the `verbosity` key, applies enum + path-traversal validation at parse time
 * (defense in depth). Invalid verbosity values are discarded silently — the
 * verbositySource layer in resolvePersona drops to per-persona default.
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
      if (!key) continue;
      // Verbosity-specific parse-time validation (enum + path-traversal denylist)
      if (key === "verbosity") {
        const v = validateVerbosity(value);
        if (!v.ok) continue; // discard invalid verbosity; per-persona default applies
      }
      config[key] = value;
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
 * Resolve persona AND verbosity from config hierarchy: flag > local > global > fallback.
 * Validates persona name against actual directory listing.
 * Rejects names containing path separators.
 *
 * Return shape is additive over the original {name, source, warnings} — extending
 * callers must not rely on absence of {verbosity, verbositySource}.
 *
 * @param {object} options
 * @param {string} options.localConfigPath - Path to local user-config
 * @param {string} options.globalConfigPath - Path to global user-config
 * @param {string} options.templatesDir - Path to templates/personas/
 * @param {string} [options.verbosityDir] - Path to templates/verbosity/ (optional for back-compat)
 * @param {string} [options.verbosityFlag] - --verbosity CLI flag override
 * @returns {{ name: string, source: string, verbosity: string, verbositySource: string, warnings: string[] }}
 */
export function resolvePersona({
  localConfigPath,
  globalConfigPath,
  templatesDir,
  verbosityDir,
  verbosityFlag,
}) {
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
    persona = "developer";
    source = "fallback";
  } else if (/[/\\]|\.\./.test(persona)) {
    // Reject path separators and ..
    warnings.push(
      `Persona name '${persona}' contains path separators, falling back to developer`
    );
    persona = "developer";
    source = "fallback";
  } else {
    // Validate against actual directory listing
    try {
      const available = readdirSync(templatesDir)
        .filter((f) => f.endsWith(".md"))
        .map((f) => f.slice(0, -3));
      if (!available.includes(persona)) {
        warnings.push(
          `Unknown persona '${persona}', falling back to developer`
        );
        persona = "developer";
        source = "fallback";
      }
    } catch {
      warnings.push(
        "Could not read persona templates directory, falling back to developer"
      );
      persona = "developer";
      source = "fallback";
    }
  }

  // ----- Verbosity resolution (additive) -----
  // Hierarchy: flag → local → global → per-persona default.
  // Each candidate is re-validated at resolve time (defense in depth).
  let verbosity = null;
  let verbositySource = "default";

  const candidates = [
    { value: verbosityFlag, layer: "flag" },
    { value: localConfig.verbosity, layer: "local" },
    { value: globalConfig.verbosity, layer: "global" },
  ];

  for (const { value, layer } of candidates) {
    if (value === undefined || value === null || value === "") continue;
    const check = validateVerbosity(value);
    if (!check.ok) {
      warnings.push(check.reason);
      continue;
    }
    verbosity = value;
    verbositySource = layer;
    break;
  }

  if (!verbosity) {
    verbosity = VERBOSITY_DEFAULTS[persona] || "normal";
    verbositySource = "default";
  }

  return { name: persona, source, verbosity, verbositySource, warnings };
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

/**
 * Load verbosity overlay template by validated name.
 *
 * Validation order (defense in depth, per Spec Behavior 5):
 *   1. Enum check against {terse, normal, deep}
 *   2. Path-traversal denylist (/, \, ..)
 * Only after BOTH validations pass is the file path constructed.
 *
 * Fallback chain (Spec Behavior 5 + SEC-4):
 *   - Valid name, file missing → warn, load normal.md
 *   - normal.md also missing → warn, return empty string (degrade-and-continue)
 *   - Verbosity dir entirely missing → warn, return empty string
 *
 * @param {string} name - Verbosity name (will be validated)
 * @param {string} verbosityDir - Path to templates/verbosity/
 * @returns {{ content: string|null, warnings: string[] }}
 *   content is "" when degrading, null when name validation fails
 */
export function loadVerbosityOverlay(name, verbosityDir) {
  const warnings = [];

  // Validate name BEFORE path construction (Spec Behavior 5)
  const check = validateVerbosity(name);
  if (!check.ok) {
    warnings.push(check.reason);
    return { content: null, warnings };
  }

  if (!existsSync(verbosityDir)) {
    warnings.push(
      "Verbosity overlay directory not found, no overlay injected"
    );
    return { content: "", warnings };
  }

  const targetPath = join(verbosityDir, `${name}.md`);
  if (existsSync(targetPath)) {
    try {
      return { content: readFileSync(targetPath, "utf-8"), warnings };
    } catch {
      warnings.push(
        `Could not read verbosity overlay '${name}', falling back to normal`
      );
    }
  } else {
    warnings.push(
      `Verbosity overlay '${name}' not found, falling back to normal`
    );
  }

  // Fallback to normal.md (Spec Behavior 5)
  if (name !== "normal") {
    const fallbackPath = join(verbosityDir, "normal.md");
    if (existsSync(fallbackPath)) {
      try {
        return { content: readFileSync(fallbackPath, "utf-8"), warnings };
      } catch {
        // fall through to degrade-and-continue
      }
    }
  }

  // Degrade-and-continue: return empty string, hook still exits 0 (SEC-4)
  warnings.push(
    "Verbosity overlay fallback 'normal.md' also unavailable, degrading to persona-only directive"
  );
  return { content: "", warnings };
}
