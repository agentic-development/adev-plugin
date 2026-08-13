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
// documented escape (`adev execution-state write --status standalone`,
// surfaced directly in the gate's block message) and the read-only
// extension loader every skill runs
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
 * Split a command string into top-level segments on shell separators
 * (&&, ||, ;, |), respecting single-quote, double-quote, backslash-escape,
 * and command-substitution state so separators inside quotes (or a subshell,
 * or escaped) are not treated as splits.
 *
 * Walks the string character by character rather than using a single regex,
 * because regex alone cannot track "am I currently inside a quote" state.
 *
 * Conservative note on subshells/backticks: `$(...)` is tracked only as a
 * paren-depth counter once opened (any `(`/`)` seen while inside increments/
 * decrements depth) — it does NOT re-apply quote tracking inside the
 * subshell. Backtick substitution `` `...` `` is tracked as a simple open/
 * close toggle. Both are intentionally shallow (no nested quote-awareness
 * inside the substitution) — good enough to stop a pipe/semicolon inside
 * `$(...)` or backticks from being misread as a top-level separator, without
 * building a full recursive shell parser. A plain `(...)` subshell (no `$`
 * prefix) is NOT specially tracked; this is a known, accepted gap.
 *
 * Conservative note on malformed input: an unterminated quote (e.g. a
 * missing closing `"`) never toggles back out of quote state, so the rest
 * of the command — including any real separators — is swallowed into that
 * one quoted segment and never split. This fails open (relative to the
 * pre-fix regex splitter) but an unterminated quote is not a syntactically
 * valid shell command to begin with, so this is accepted rather than
 * specially handled.
 *
 * @param {string} command - Full command string
 * @returns {{ text: string, separator: string | null }[]} segments with the
 *   separator that terminated them (null for the final segment)
 */
function splitTopLevel(command) {
  const segments = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  let parenDepth = 0; // depth inside a $( ... ) command substitution
  let inBacktick = false; // inside a `...` command substitution
  let i = 0;

  while (i < command.length) {
    const ch = command[i];

    // Inside a $( ... ) subshell: track nesting depth and copy verbatim.
    // No separator splitting and no quote re-parsing happens in here — see
    // the conservative note above.
    if (parenDepth > 0) {
      if (ch === "(") parenDepth++;
      else if (ch === ")") parenDepth--;
      current += ch;
      i++;
      continue;
    }

    // Inside a `...` backtick subshell: copy verbatim until the closing backtick.
    if (inBacktick) {
      if (ch === "`") inBacktick = false;
      current += ch;
      i++;
      continue;
    }

    // Enter a $( ... ) subshell (valid inside or outside double quotes, but
    // not meaningful inside single quotes where $ has no special meaning).
    if (ch === "$" && command[i + 1] === "(" && !inSingle) {
      parenDepth = 1;
      current += "$(";
      i += 2;
      continue;
    }

    // Enter a `...` backtick subshell (same quoting rule as $( )).
    if (ch === "`" && !inSingle) {
      inBacktick = true;
      current += ch;
      i++;
      continue;
    }

    // Backslash escape: outside single quotes, a backslash escapes the next
    // char (including a separator char, which must then NOT be treated as
    // a splitter). Inside single quotes, backslash has no special meaning.
    if (ch === "\\" && !inSingle) {
      current += ch + (command[i + 1] ?? "");
      i += 2;
      continue;
    }

    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      current += ch;
      i++;
      continue;
    }

    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      current += ch;
      i++;
      continue;
    }

    if (!inSingle && !inDouble) {
      // Check multi-char separators first (&&, ||) before single-char (;, |)
      if ((ch === "&" && command[i + 1] === "&") || (ch === "|" && command[i + 1] === "|")) {
        segments.push({ text: current, separator: ch + ch });
        current = "";
        i += 2;
        continue;
      }
      if (ch === ";" || ch === "|") {
        segments.push({ text: current, separator: ch });
        current = "";
        i++;
        continue;
      }
    }

    current += ch;
    i++;
  }

  segments.push({ text: current, separator: null });
  return segments;
}

/**
 * Check if a bash command matches any passthrough pattern.
 * Handles pipe chains (each segment checked) and &&/;/|| chains (first
 * command determines). Quote-aware: separators inside single or double
 * quotes, or escaped with a backslash, are not treated as splits.
 * @param {string} command - Full command string
 * @param {{ bashPassthrough: string[] }} config
 * @returns {boolean}
 */
export function matchesBashPassthrough(command, config) {
  const segments = splitTopLevel(command);

  // Handle && / ; / || chains: first command determines. The first "chain
  // group" is every leading segment joined back together up to (but not
  // including) the first &&/;/|| separator — i.e. everything before the
  // first chain-level split is the pipe chain that must all match.
  let firstChainEnd = segments.findIndex(seg => seg.separator === "&&" || seg.separator === ";" || seg.separator === "||");
  const pipeGroup = firstChainEnd === -1 ? segments : segments.slice(0, firstChainEnd + 1);

  // Handle pipe chains: every segment in the first chain group must match.
  for (const seg of pipeGroup) {
    const trimmed = seg.text.trim();
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
