/**
 * Domain config loading function.
 *
 * Reads domain config files from a resolved domain directory following the
 * resolution order: custom (.context-index/domains/) -> bundled (templates/domains/)
 * -> parent via extends chain.
 *
 * Pure read operation — never mutates any file.
 *
 * @module lib/domains/domain-config
 */

import { readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, isAbsolute } from 'node:path';

import { parseYaml, YamlParseError } from '../profiles/yaml.mjs';
import { safeRealpath } from '../path-safety.mjs';
import {
  DOMAIN_CONFIG_TYPES,
  DOMAIN_CONFIG_FILENAMES,
  STRUCTURED_CONFIG_TYPES,
  BUNDLED_DOMAIN_NAMES,
  DOMAIN_NAME_PATTERN,
  MAX_DOMAIN_CONFIG_SIZE,
  DEPRECATED_CONFIG_TYPES,
} from './constants.mjs';

/**
 * Load a domain config file for a given domain.
 *
 * @param {string} domain - Resolved domain name
 * @param {string} configType - One of the DOMAIN_CONFIG_TYPES constants
 * @param {string} repoRoot - Repository root (where .context-index/ lives)
 * @param {string} pluginRoot - Plugin installation root (where templates/ lives)
 * @returns {string|object|null} String for markdown, parsed object for structured, null if not found
 */
export function loadDomainConfig(domain, configType, repoRoot, pluginRoot) {
  // Validate domain argument against allowed pattern (Behavior 7a / SEC-2).
  // This guard runs BEFORE any path construction or configType resolution so it
  // applies uniformly to every configType — the path-safety guarantee is
  // implementation-enforced rather than caller-discipline-enforced.
  if (typeof domain !== 'string' || !DOMAIN_NAME_PATTERN.test(domain)) {
    // Redact: strip everything not in the allowlist before placing the value
    // in the diagnostic. Truncate to bound diagnostic size.
    const stripped = typeof domain === 'string'
      ? domain.replace(/[^a-z0-9-]/g, '').slice(0, 32)
      : '';
    const err = new Error(
      `INVALID_DOMAIN_ARG: domain argument "${stripped}" (redacted to allowlist chars) does not match ${DOMAIN_NAME_PATTERN}.`
    );
    err.code = 'INVALID_DOMAIN_ARG';
    throw err;
  }

  // Deprecation handling for old config type names (Behavior 7)
  if (DEPRECATED_CONFIG_TYPES.has(configType)) {
    const newType = DEPRECATED_CONFIG_TYPES.get(configType);
    console.warn(`DOMAIN_CONFIG_TYPE_DEPRECATED: "${configType}" has been renamed to "${newType}". Update your domain profile files.`);
    return null;
  }

  // Validate config type against closed set (Behavior 6)
  if (!DOMAIN_CONFIG_TYPES.has(configType)) {
    return null;
  }

  const filename = DOMAIN_CONFIG_FILENAMES.get(configType);
  const isStructured = STRUCTURED_CONFIG_TYPES.has(configType);

  // Resolve roots to real paths
  const realRepoRoot = safeRealpath(repoRoot);
  const realPluginRoot = safeRealpath(pluginRoot);

  // Bundled override guard (Behavior 9) — check before any file reads
  const customDomainDir = join(realRepoRoot, '.context-index', 'domains', domain);
  if (BUNDLED_DOMAIN_NAMES.has(domain) && existsSync(customDomainDir)) {
    const err = new Error(
      `Cannot override bundled domain '${domain}'. Create a custom domain with 'extends: ${domain}' instead.`
    );
    err.code = 'BUNDLED_OVERRIDE_BLOCKED';
    throw err;
  }

  // Resolution order:
  // 1. Custom: .context-index/domains/<domain>/<file>
  // 2. Bundled: <pluginRoot>/templates/domains/<domain>/<file>
  // 3. Extends parent: <pluginRoot>/templates/domains/<extends>/<file>

  // Step 1: Check custom domain directory
  const customPath = join(realRepoRoot, '.context-index', 'domains', domain, filename);
  const customResult = tryReadDomainFile(customPath, realRepoRoot, repoRoot, isStructured);
  if (customResult !== undefined) {
    return customResult;
  }

  // Step 2: Check bundled domain directory
  const bundledPath = join(realPluginRoot, 'templates', 'domains', domain, filename);
  const bundledResult = tryReadDomainFile(bundledPath, realPluginRoot, repoRoot, isStructured);
  if (bundledResult !== undefined) {
    return bundledResult;
  }

  // Step 3: Check extends chain (one level deep)
  const extendsParent = resolveExtends(domain, realRepoRoot, repoRoot, realPluginRoot);
  if (extendsParent) {
    const parentPath = join(realPluginRoot, 'templates', 'domains', extendsParent, filename);
    const parentResult = tryReadDomainFile(parentPath, realPluginRoot, repoRoot, isStructured);
    if (parentResult !== undefined) {
      return parentResult;
    }
  }

  // Not found at any level (Behavior 8)
  return null;
}

/**
 * Try to read an domain config file at a given path.
 *
 * @returns {string|object|undefined} The domain config content, or undefined if file doesn't exist
 */
function tryReadDomainFile(filePath, rootDir, repoRoot, isStructured) {
  if (!existsSync(filePath)) {
    return undefined;
  }

  // Path containment check
  const realPath = safeRealpath(filePath);
  assertPathContained(realPath, rootDir, repoRoot);

  // Size guard (Behavior 13)
  const stat = statSync(realPath);
  if (stat.size > MAX_DOMAIN_CONFIG_SIZE) {
    const relPath = relative(repoRoot, realPath);
    const err = new Error(
      `DOMAIN_CONFIG_TOO_LARGE: domain config file "${relPath}" is ${stat.size} bytes, exceeding the ${MAX_DOMAIN_CONFIG_SIZE} byte limit.`
    );
    err.code = 'DOMAIN_CONFIG_TOO_LARGE';
    throw err;
  }

  // Read file
  const content = readFileSync(realPath, 'utf8');

  // Return type depends on config type
  if (isStructured) {
    if (content.trim() === '') {
      return {};
    }
    try {
      return parseYaml(content);
    } catch (e) {
      const relPath = relative(repoRoot, realPath);
      if (e instanceof YamlParseError) {
        const err = new Error(
          `DOMAIN_CONFIG_PARSE_ERROR: malformed YAML in "${relPath}"${e.line ? ` (line ${e.line})` : ''}.`
        );
        err.code = 'DOMAIN_CONFIG_PARSE_ERROR';
        throw err;
      }
      throw e;
    }
  }

  // Markdown template — return as string (Behavior 10)
  return content;
}

/**
 * Resolve the extends parent for a custom domain.
 *
 * @returns {string|null} Parent domain name, or null if no extends
 */
function resolveExtends(domain, realRepoRoot, repoRoot, realPluginRoot) {
  const domainYamlPath = join(realRepoRoot, '.context-index', 'domains', domain, 'domain.yaml');

  if (!existsSync(domainYamlPath)) {
    return null;
  }

  const content = readFileSync(domainYamlPath, 'utf8');
  if (content.trim() === '') {
    return null;
  }

  const parsed = parseYaml(content);
  const extendsValue = parsed?.extends;

  if (!extendsValue || typeof extendsValue !== 'string') {
    return null;
  }

  // Validate extends value against domain name pattern (SEC-4)
  if (!DOMAIN_NAME_PATTERN.test(extendsValue)) {
    const err = new Error(
      `INVALID_DOMAIN_NAME: extends value "${extendsValue}" in domain "${domain}" does not match domain name pattern.`
    );
    err.code = 'INVALID_DOMAIN_NAME';
    throw err;
  }

  // Extends must point to a bundled domain (one-level depth limit)
  if (!BUNDLED_DOMAIN_NAMES.has(extendsValue)) {
    // Check if it's a custom domain (recursive extends) vs truly non-existent
    const customParentDir = join(realRepoRoot, '.context-index', 'domains', extendsValue);
    if (existsSync(customParentDir)) {
      const err = new Error(
        `EXTENDS_DEPTH_EXCEEDED: domain "${domain}" extends "${extendsValue}", which is not a bundled domain. ` +
        `The extends chain is limited to one level (custom -> bundled only).`
      );
      err.code = 'EXTENDS_DEPTH_EXCEEDED';
      throw err;
    }
    const err = new Error(
      `EXTENDS_NOT_FOUND: domain "${domain}" extends "${extendsValue}", but no domain "${extendsValue}" exists.`
    );
    err.code = 'EXTENDS_NOT_FOUND';
    throw err;
  }

  // Verify parent bundled directory exists
  const parentDir = join(realPluginRoot, 'templates', 'domains', extendsValue);
  if (!existsSync(parentDir)) {
    const err = new Error(
      `EXTENDS_NOT_FOUND: domain "${domain}" extends "${extendsValue}", but no bundled profile directory exists for "${extendsValue}".`
    );
    err.code = 'EXTENDS_NOT_FOUND';
    throw err;
  }

  return extendsValue;
}

/**
 * Assert that a resolved path stays within its root directory.
 */
function assertPathContained(resolvedPath, rootDir, repoRoot) {
  const rel = relative(rootDir, resolvedPath);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    const displayPath = relative(repoRoot, resolvedPath);
    const err = new Error(
      `PATH_ESCAPE: domain config path "${displayPath}" escapes its root directory "${rootDir}".`
    );
    err.code = 'PATH_ESCAPE';
    throw err;
  }
}
