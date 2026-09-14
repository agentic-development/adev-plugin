/**
 * Implementation mode resolution functions.
 *
 * Resolves the active implementation mode from an explicit override, the
 * `implementation_mode` key in manifest.yaml, or the default. Orthogonal to
 * risk tier (lib/risk-tiers/resolve.mjs), whose validate-then-return shape
 * this mirrors.
 *
 * `resolveImplementationMode` is pure — deterministic, no side effects, no
 * file I/O. `resolveImplementationModeFromProjectRoot` is the file-I/O
 * wrapper CLI callers use.
 *
 * @module lib/implementation-modes/resolve
 */

import { loadManifest } from '../manifest.mjs';
import { refuse } from '../errors.mjs';
import { IMPLEMENTATION_MODE_NAMES, DEFAULT_IMPLEMENTATION_MODE, IMPLEMENTATION_MODE_CONFIGS } from './constants.mjs';

/**
 * @param {object|null} manifest - Pre-parsed manifest.yaml object
 * @param {string|null|undefined} explicitMode - CLI-supplied `--mode` override, if any
 * @returns {{ mode: string, config: object, source: "explicit"|"manifest"|"default" }}
 */
export function resolveImplementationMode(manifest, explicitMode) {
  if (explicitMode !== undefined && explicitMode !== null) {
    validateModeName(explicitMode);
    return { mode: explicitMode, config: IMPLEMENTATION_MODE_CONFIGS.get(explicitMode), source: 'explicit' };
  }

  const value = manifest?.implementation_mode;
  if (value === undefined || value === null) {
    return { mode: DEFAULT_IMPLEMENTATION_MODE, config: IMPLEMENTATION_MODE_CONFIGS.get(DEFAULT_IMPLEMENTATION_MODE), source: 'default' };
  }

  validateModeName(value);
  return { mode: value, config: IMPLEMENTATION_MODE_CONFIGS.get(value), source: 'manifest' };
}

/**
 * Load manifest.yaml from `projectRoot` and resolve the implementation mode.
 * `loadManifest`'s YAML parse has no surrounding try/catch, so a malformed
 * manifest.yaml surfaces as an uncoded `YamlParseError`; this re-codes that
 * as `MANIFEST_PARSE_ERROR` so callers can branch on `.code` uniformly.
 *
 * @param {string} projectRoot
 * @param {string|null|undefined} [explicitMode]
 * @returns {{ mode: string, config: object, source: "explicit"|"manifest"|"default" }}
 */
export function resolveImplementationModeFromProjectRoot(projectRoot, explicitMode) {
  let manifest;
  try {
    manifest = loadManifest(projectRoot);
  } catch (err) {
    if (err.code) {
      throw err;
    }
    refuse(`Failed to parse manifest.yaml in "${projectRoot}": ${err.message}`, 'MANIFEST_PARSE_ERROR');
  }

  return resolveImplementationMode(manifest, explicitMode);
}

/**
 * @param {string} name
 * @throws {Error} With code UNKNOWN_IMPLEMENTATION_MODE
 */
function validateModeName(name) {
  if (typeof name !== 'string' || !IMPLEMENTATION_MODE_NAMES.has(name)) {
    refuse(
      `UNKNOWN_IMPLEMENTATION_MODE: "${name}" is not one of: ${[...IMPLEMENTATION_MODE_NAMES].join(', ')}.`,
      'UNKNOWN_IMPLEMENTATION_MODE'
    );
  }
}
