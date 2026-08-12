/**
 * Lifecycle gate configuration module.
 *
 * Resolves enforcement level, file exclusion patterns, and bash passthrough
 * patterns from a flat user-config object.
 *
 * @module lib/lifecycle-gate-config
 */

const VALID_LEVELS = new Set(["off", "warn", "confirm", "block"]);

// File exclusion and bash passthrough defaults removed — now provided by domain profile
// via lib/domains/merge-gate-config.mjs. When no domain config is provided, empty arrays
// are used (strictest mode — Behavior 18).

// Structural bash passthrough: the gate must never gate its own escape hatch.
// These prefixes are appended unconditionally — they survive an absent domain
// profile (strictest mode) AND `bash_passthrough.replace_defaults=true` —
// because a `lifecycle.gate=block` project would otherwise lock out the
// documented escape (`/adev:standalone` → `adev execution-state write
// --status standalone`) and the read-only extension loader every skill runs
// as its first step. Keep this set minimal and exact-prefix; never add bare
// `adev` (other verbs stay gated).
const STRUCTURAL_BASH_PASSTHROUGH = [
  "adev execution-state write",
  "adev skill-ext load",
];

/**
 * Resolve lifecycle gate config from a flat user-config object.
 * @param {Record<string, string>} userConfig - Flat key=value config
 * @param {{ file_exclusions?: string[], bash_passthrough?: string[] }} [domainConfig] - Domain-provided defaults from merge-gate-config.mjs
 * @returns {{ level: string, fileExclusions: string[], bashPassthrough: string[] }}
 */
export function resolveGateConfig(userConfig, domainConfig) {
  let level = userConfig["lifecycle.gate"] || "off";
  if (!VALID_LEVELS.has(level)) {
    level = "warn";
  }

  // Domain-provided defaults (empty arrays when no domain profile)
  const domainFileExclusions = domainConfig?.file_exclusions ?? [];
  const domainBashPassthrough = domainConfig?.bash_passthrough ?? [];

  // File exclusions
  const replaceFileDefaults = userConfig["lifecycle.gate.file_exclusions.replace_defaults"] === "true";
  const projectFileExclusions = userConfig["lifecycle.gate.file_exclusions"]
    ? userConfig["lifecycle.gate.file_exclusions"].split(",").map(p => p.trim()).filter(Boolean)
    : [];

  const fileExclusions = replaceFileDefaults
    ? projectFileExclusions
    : [...domainFileExclusions, ...projectFileExclusions];

  // Bash passthrough
  const replaceBashDefaults = userConfig["lifecycle.gate.bash_passthrough.replace_defaults"] === "true";
  const projectBashPassthrough = userConfig["lifecycle.gate.bash_passthrough"]
    ? userConfig["lifecycle.gate.bash_passthrough"].split(",").map(p => p.trim()).filter(Boolean)
    : [];

  const bashPassthrough = replaceBashDefaults
    ? [...projectBashPassthrough, ...STRUCTURAL_BASH_PASSTHROUGH]
    : [...domainBashPassthrough, ...projectBashPassthrough, ...STRUCTURAL_BASH_PASSTHROUGH];

  return { level, fileExclusions, bashPassthrough };
}

/**
 * Check if a file path matches any exclusion pattern.
 * Supports glob-like patterns: **, *, and prefix matching.
 * Patterns without path separators are matched against the basename too.
 * @param {string} filePath - Relative file path
 * @param {{ fileExclusions: string[] }} config
 * @returns {boolean}
 */
export function matchesFileExclusion(filePath, config) {
  const basename = filePath.split("/").pop() || filePath;
  for (const pattern of config.fileExclusions) {
    if (globMatch(filePath, pattern)) return true;
    // If pattern has no path separator, also match against basename
    if (!pattern.includes("/") && globMatch(basename, pattern)) return true;
  }
  return false;
}

/**
 * Check if a bash command matches any passthrough pattern.
 * Handles pipe chains (each segment checked) and &&/; chains (first command determines).
 * @param {string} command - Full command string
 * @param {{ bashPassthrough: string[] }} config
 * @returns {boolean}
 */
export function matchesBashPassthrough(command, config) {
  // Handle && and ; chains: first command determines
  const chainSplit = command.split(/\s*(?:&&|;)\s*/);
  const firstCommand = chainSplit[0].trim();

  // Handle pipe chains: each segment must match
  const pipeSegments = firstCommand.split(/\s*\|\s*/);

  for (const segment of pipeSegments) {
    const trimmed = segment.trim();
    if (!matchesSingleCommand(trimmed, config.bashPassthrough)) {
      return false;
    }
  }
  return true;
}

/**
 * Check if a single command matches any passthrough pattern (prefix match).
 * @param {string} command
 * @param {string[]} patterns
 * @returns {boolean}
 */
function matchesSingleCommand(command, patterns) {
  for (const pattern of patterns) {
    // Prefix match: command starts with pattern, followed by end or space
    if (command === pattern || command.startsWith(pattern + " ") || command.startsWith(pattern + "\t")) {
      return true;
    }
    // Glob pattern support (e.g., "npm run test*")
    if (pattern.includes("*") && globMatch(command, pattern)) {
      return true;
    }
  }
  return false;
}

/**
 * Simple glob matching supporting * and **.
 * @param {string} str - String to test
 * @param {string} pattern - Glob pattern
 * @returns {boolean}
 */
function globMatch(str, pattern) {
  // Convert glob to regex
  let regex = "^";
  let i = 0;
  while (i < pattern.length) {
    if (pattern[i] === "*" && pattern[i + 1] === "*") {
      // ** matches anything including path separators
      regex += ".*";
      i += 2;
      // Skip trailing slash after **
      if (pattern[i] === "/") i++;
    } else if (pattern[i] === "*") {
      // * matches anything except path separators
      regex += "[^/]*";
      i++;
    } else if (pattern[i] === "?") {
      regex += "[^/]";
      i++;
    } else {
      // Escape regex special chars
      regex += pattern[i].replace(/[.+^${}()|[\]\\]/g, "\\$&");
      i++;
    }
  }
  regex += "$";
  return new RegExp(regex).test(str);
}
