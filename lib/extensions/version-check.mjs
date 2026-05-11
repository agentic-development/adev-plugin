/**
 * Version compatibility checking for extension installation.
 *
 * Implements a minimal semver range matcher using only Node.js built-ins.
 * Supports: exact match, ^, ~, >=, <=, >, <.
 *
 * @module lib/extensions/version-check
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Check whether the installed adev version satisfies the extension's
 * `requires.adev` semver range.
 *
 * @param {object|null|undefined} requires - The `requires` object from the extension manifest.
 * @param {string} installedVersion - The installed adev version (from package.json).
 * @returns {{ compatible: true } | { compatible: false, code: string, message: string }}
 */
export function checkVersionCompatibility(requires, installedVersion) {
  if (requires == null || !requires.adev) {
    return { compatible: true };
  }

  const range = requires.adev;
  const satisfied = satisfiesRange(range, installedVersion);

  if (satisfied) {
    return { compatible: true };
  }

  return {
    compatible: false,
    code: 'INCOMPATIBLE_VERSION',
    message: `Extension requires adev ${range}, but installed version is ${installedVersion}.`,
  };
}

/**
 * Read the installed adev version from the plugin's package.json.
 *
 * @param {string} pluginRoot - Absolute path to the plugin root directory.
 * @returns {string} The version string.
 */
export function getInstalledVersion(pluginRoot) {
  const pkg = JSON.parse(readFileSync(join(pluginRoot, 'package.json'), 'utf8'));
  return pkg.version;
}

/**
 * Parse a semver string into its components.
 *
 * @param {string} version - e.g. "1.2.3" or "0.22.5"
 * @returns {{ major: number, minor: number, patch: number } | null}
 */
function parseSemver(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

/**
 * Compare two parsed semver versions.
 * Returns -1 if a < b, 0 if equal, 1 if a > b.
 */
function compareSemver(a, b) {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
  return 0;
}

/**
 * Check if a version satisfies a semver range.
 *
 * Supported range formats:
 * - Exact: "1.2.3"
 * - Caret: "^1.2.3" (compatible with version)
 * - Tilde: "~1.2.3" (approximately equivalent)
 * - Comparison: ">=1.2.3", "<=1.2.3", ">1.2.3", "<1.2.3"
 *
 * @param {string} range
 * @param {string} version
 * @returns {boolean}
 */
function satisfiesRange(range, version) {
  const v = parseSemver(version);
  if (!v) return false;

  // Caret range: ^major.minor.patch
  if (range.startsWith('^')) {
    const r = parseSemver(range.slice(1));
    if (!r) return false;
    return satisfiesCaret(v, r);
  }

  // Tilde range: ~major.minor.patch
  if (range.startsWith('~')) {
    const r = parseSemver(range.slice(1));
    if (!r) return false;
    return satisfiesTilde(v, r);
  }

  // >= range
  if (range.startsWith('>=')) {
    const r = parseSemver(range.slice(2));
    if (!r) return false;
    return compareSemver(v, r) >= 0;
  }

  // <= range
  if (range.startsWith('<=')) {
    const r = parseSemver(range.slice(2));
    if (!r) return false;
    return compareSemver(v, r) <= 0;
  }

  // > range
  if (range.startsWith('>')) {
    const r = parseSemver(range.slice(1));
    if (!r) return false;
    return compareSemver(v, r) > 0;
  }

  // < range
  if (range.startsWith('<')) {
    const r = parseSemver(range.slice(1));
    if (!r) return false;
    return compareSemver(v, r) < 0;
  }

  // Exact match
  const r = parseSemver(range);
  if (!r) return false;
  return compareSemver(v, r) === 0;
}

/**
 * Caret range: allows changes that do not modify the left-most non-zero digit.
 * ^0.22.0 -> >=0.22.0 <0.23.0  (0.x: minor is the left-most non-zero)
 * ^1.2.3  -> >=1.2.3 <2.0.0    (1.x: major is the left-most non-zero)
 * ^0.0.3  -> >=0.0.3 <0.0.4    (0.0.x: patch is the left-most non-zero)
 */
function satisfiesCaret(version, range) {
  if (compareSemver(version, range) < 0) return false;

  if (range.major !== 0) {
    // ^X.Y.Z where X>0: same major
    return version.major === range.major;
  }
  if (range.minor !== 0) {
    // ^0.Y.Z where Y>0: same major.minor
    return version.major === range.major && version.minor === range.minor;
  }
  // ^0.0.Z: exact patch
  return version.major === 0 && version.minor === 0 && version.patch === range.patch;
}

/**
 * Tilde range: allows patch-level changes.
 * ~1.2.3 -> >=1.2.3 <1.3.0
 */
function satisfiesTilde(version, range) {
  if (compareSemver(version, range) < 0) return false;
  return version.major === range.major && version.minor === range.minor;
}
