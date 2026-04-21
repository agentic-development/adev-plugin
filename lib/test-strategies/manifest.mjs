/**
 * Manifest schema extension for test_strategies.
 *
 * Parses and validates the `test_strategies` section of a manifest object,
 * returning an array of validated strategy entries and any warnings.
 */

import { getStrategy } from './registry.mjs';

const VALID_TIERS = Object.freeze(['fast', 'integration', 'e2e']);

/**
 * Minimal glob matcher that handles `**` and `*` patterns.
 * Does not shell-expand — pure string matching.
 *
 * @param {string} pattern - Glob pattern (e.g. "src/**\/*.mjs")
 * @param {string} filePath - File path to test (e.g. "src/lib/foo.mjs")
 * @returns {boolean}
 */
export function matchGlob(pattern, filePath) {
  // Normalize separators to forward slash
  const p = pattern.replace(/\\/g, '/');
  const f = filePath.replace(/\\/g, '/');

  // Convert glob pattern to a regex
  // Escape all regex special chars except * and ?
  let regexStr = '';
  let i = 0;
  while (i < p.length) {
    if (p[i] === '*' && p[i + 1] === '*') {
      // ** matches any path segment including slashes
      regexStr += '.*';
      i += 2;
      // Consume an optional trailing slash after **
      if (p[i] === '/') i++;
    } else if (p[i] === '*') {
      // * matches anything except /
      regexStr += '[^/]*';
      i++;
    } else if (p[i] === '?') {
      // ? matches a single char except /
      regexStr += '[^/]';
      i++;
    } else {
      // Escape regex metacharacters
      regexStr += p[i].replace(/[.+^${}()|[\]\\]/g, '\\$&');
      i++;
    }
  }

  const regex = new RegExp(`^${regexStr}$`);
  return regex.test(f);
}

/**
 * Check whether any of the strategy's path globs matches the given file path.
 *
 * @param {string} filePath
 * @param {object[]} strategies - Validated strategies from parseTestStrategies
 * @returns {object|null} First matching strategy, or null
 */
export function matchStrategy(filePath, strategies) {
  for (const strategy of strategies) {
    for (const glob of strategy.paths) {
      if (matchGlob(glob, filePath)) {
        return strategy;
      }
    }
  }
  return null;
}

/**
 * Parse and validate the test_strategies section of a manifest.
 *
 * @param {object} manifest - Parsed manifest object (already parsed YAML)
 * @returns {{ strategies: object[], warnings: string[] }}
 */
export function parseTestStrategies(manifest) {
  const raw = manifest?.test_strategies;

  if (!raw || (Array.isArray(raw) && raw.length === 0)) {
    return { strategies: [], warnings: [] };
  }

  if (!Array.isArray(raw)) {
    return {
      strategies: [],
      warnings: ['test_strategies must be an array — skipping all entries'],
    };
  }

  const strategies = [];
  const warnings = [];

  for (const entry of raw) {
    const id = entry?.strategy_id;

    // Validate strategy_id exists in the registry
    if (!id || !getStrategy(id)) {
      warnings.push(`Unknown strategy_id '${id}' — skipping entry`);
      continue;
    }

    // Validate paths
    const paths = entry.paths;
    if (!paths || !Array.isArray(paths) || paths.length === 0) {
      warnings.push(`Missing paths for strategy '${id}' — skipping entry`);
      continue;
    }

    // Validate each path glob for traversal or absolute paths
    let pathsValid = true;
    for (const glob of paths) {
      if (glob.includes('../') || glob.startsWith('/')) {
        warnings.push(
          `Path glob '${glob}' contains traversal or absolute path — skipping entry`
        );
        pathsValid = false;
        break;
      }
    }
    if (!pathsValid) continue;

    // Validate command (optional but must be array if present)
    let command = null;
    if (entry.command !== undefined && entry.command !== null) {
      if (!Array.isArray(entry.command)) {
        warnings.push(
          `command for strategy '${id}' must be an array — skipping entry`
        );
        continue;
      }
      command = entry.command;
    }

    // Validate tier (defaults to 'fast')
    const tier = entry.tier ?? 'fast';

    strategies.push({
      strategy_id: id,
      command,
      tier,
      paths,
    });
  }

  return { strategies, warnings };
}
