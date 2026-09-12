/**
 * Risk tier config loading function.
 *
 * Reads a risk tier's bundle files from `<pluginRoot>/templates/risk-tiers/<tier>/`,
 * with one exception: the "standard" tier's `risk-policies` config resolves to
 * the legacy fixed path `<pluginRoot>/templates/risk-policies-template.yaml`
 * (see constants.mjs), and "standard" has no overlay files at all — an
 * unmodified bundled default IS the standard tier.
 *
 * Pure read operation — never mutates any file. No custom-override or
 * extends-chain resolution (unlike lib/domains/domain-config.mjs) — risk
 * tier bundles are bundled-only for now.
 *
 * @module lib/risk-tiers/tier-config
 */

import { readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

import { parseYaml, YamlParseError } from '../profiles/yaml.mjs';
import { safeRealpath, isContained } from '../path-safety.mjs';
import {
  RISK_TIER_CONFIG_TYPES,
  RISK_TIER_CONFIG_FILENAMES,
  RISK_TIER_NAMES,
  RISK_TIER_NAME_PATTERN,
  STANDARD_TIER_LEGACY_RISK_POLICIES_PATH,
  MAX_RISK_TIER_CONFIG_SIZE,
} from './constants.mjs';

/**
 * Load a risk tier config file for a given tier.
 *
 * @param {string} tier - Risk tier name ("prototype" | "standard" | "strict")
 * @param {string} configType - One of the RISK_TIER_CONFIG_TYPES constants
 * @param {string} pluginRoot - Plugin installation root (where templates/ lives)
 * @returns {object|null} Parsed YAML object, or null if not found / standard-with-no-overlay
 */
export function loadRiskTierConfig(tier, configType, pluginRoot) {
  if (typeof tier !== 'string' || !RISK_TIER_NAME_PATTERN.test(tier) || !RISK_TIER_NAMES.has(tier)) {
    const stripped = typeof tier === 'string' ? tier.replace(/[^a-z0-9-]/g, '').slice(0, 32) : '';
    const err = new Error(
      `INVALID_RISK_TIER_ARG: risk tier argument "${stripped}" (redacted to allowlist chars) is not a recognized tier.`
    );
    err.code = 'INVALID_RISK_TIER_ARG';
    throw err;
  }

  if (!RISK_TIER_CONFIG_TYPES.has(configType)) {
    return null;
  }

  const realPluginRoot = safeRealpath(pluginRoot);

  if (tier === 'standard') {
    if (configType !== 'risk-policies') {
      // Standard has no overlay files — an unmodified bundled default IS
      // the standard tier.
      return null;
    }
    const legacyPath = join(realPluginRoot, ...STANDARD_TIER_LEGACY_RISK_POLICIES_PATH);
    return tryReadTierFile(legacyPath, join(realPluginRoot, 'templates'), realPluginRoot);
  }

  const filename = RISK_TIER_CONFIG_FILENAMES.get(configType);
  const tierDir = join(realPluginRoot, 'templates', 'risk-tiers', tier);
  const filePath = join(tierDir, filename);
  return tryReadTierFile(filePath, tierDir, realPluginRoot);
}

/**
 * Try to read a risk tier config file at a given path.
 *
 * @returns {object|null} Parsed YAML object, or null if the file doesn't exist
 */
function tryReadTierFile(filePath, rootDir, pluginRoot) {
  if (!existsSync(filePath)) {
    return null;
  }

  const realPath = safeRealpath(filePath);
  assertPathContained(realPath, rootDir, pluginRoot);

  const stat = statSync(realPath);
  if (stat.size > MAX_RISK_TIER_CONFIG_SIZE) {
    const relPath = relative(pluginRoot, realPath);
    const err = new Error(
      `RISK_TIER_CONFIG_TOO_LARGE: risk tier config file "${relPath}" is ${stat.size} bytes, exceeding the ${MAX_RISK_TIER_CONFIG_SIZE} byte limit.`
    );
    err.code = 'RISK_TIER_CONFIG_TOO_LARGE';
    throw err;
  }

  const content = readFileSync(realPath, 'utf8');
  if (content.trim() === '') {
    return {};
  }

  try {
    return parseYaml(content);
  } catch (e) {
    const relPath = relative(pluginRoot, realPath);
    if (e instanceof YamlParseError) {
      const err = new Error(
        `RISK_TIER_CONFIG_PARSE_ERROR: malformed YAML in "${relPath}"${e.line ? ` (line ${e.line})` : ''}.`
      );
      err.code = 'RISK_TIER_CONFIG_PARSE_ERROR';
      throw err;
    }
    throw e;
  }
}

/**
 * Assert that a resolved path stays within its root directory.
 */
function assertPathContained(resolvedPath, rootDir, pluginRoot) {
  if (!isContained(resolvedPath, rootDir)) {
    const displayPath = relative(pluginRoot, resolvedPath);
    const err = new Error(
      `PATH_ESCAPE: risk tier config path "${displayPath}" escapes its root directory "${rootDir}".`
    );
    err.code = 'PATH_ESCAPE';
    throw err;
  }
}
