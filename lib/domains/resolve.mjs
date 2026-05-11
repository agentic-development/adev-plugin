/**
 * Domain resolution function.
 *
 * Resolves the active domain for a given context via 4-level precedence:
 * charter > module > project > default ("software").
 *
 * Pure function — deterministic, no side effects, no file I/O.
 *
 * @module lib/domains/resolve
 */

import { DOMAIN_NAME_PATTERN, DEFAULT_DOMAIN } from './constants.mjs';

/**
 * @param {object|null} manifest - Pre-parsed manifest.yaml object
 * @param {object|null} charterFrontmatter - Pre-parsed charter frontmatter or null
 * @param {string|null} moduleSlug - Module slug for module-level lookup
 * @returns {{ resolved_domain: string, source_level: "charter"|"module"|"project"|"default" }}
 */
export function resolveDomain(manifest, charterFrontmatter, moduleSlug) {
  // Level 1: Charter frontmatter
  if (charterFrontmatter?.domain) {
    validateDomainName(charterFrontmatter.domain, 'charter');
    return { resolved_domain: charterFrontmatter.domain, source_level: 'charter' };
  }

  // Level 2: Module-level in manifest
  if (moduleSlug && manifest?.modules) {
    const mod = manifest.modules.find(m => m.slug === moduleSlug);
    if (mod?.domain) {
      validateDomainName(mod.domain, 'module');
      return { resolved_domain: mod.domain, source_level: 'module' };
    }
  }

  // Level 3: Project-level in manifest
  if (manifest?.project?.domain) {
    validateDomainName(manifest.project.domain, 'project');
    return { resolved_domain: manifest.project.domain, source_level: 'project' };
  }

  // Level 4: Default
  return { resolved_domain: DEFAULT_DOMAIN, source_level: 'default' };
}

/**
 * Validate a domain name against the allowed pattern.
 * @param {string} name
 * @param {string} sourceLevel - For error message context
 * @throws {Error} With code INVALID_DOMAIN_NAME
 */
function validateDomainName(name, sourceLevel) {
  if (!DOMAIN_NAME_PATTERN.test(name)) {
    const err = new Error(
      `INVALID_DOMAIN_NAME: domain value "${name}" (from ${sourceLevel}) ` +
      `does not match pattern ${DOMAIN_NAME_PATTERN}. ` +
      `Domain names must be lowercase alphanumeric with hyphens, no path separators or ".." sequences.`
    );
    err.code = 'INVALID_DOMAIN_NAME';
    throw err;
  }
}
