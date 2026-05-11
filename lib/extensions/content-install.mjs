/**
 * Content installation for extensions.
 *
 * Handles domain profile installation, governance config merging,
 * sample installation with path containment, and skill conflict detection.
 *
 * Spec: .context-index/specs/features/extensions/content-installation.spec.md
 *
 * @module lib/extensions/content-install
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUNDLED_DOMAIN_NAMES, DOMAIN_NAME_PATTERN, DOMAIN_CONFIG_FILENAMES } from '../domains/constants.mjs';
import { parseYaml } from '../profiles/yaml.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Plugin root — two levels up from lib/extensions/ */
const PLUGIN_ROOT = resolve(__dirname, '..', '..');

/** Recognized domain profile filenames (from DOMAIN_CONFIG_FILENAMES). */
const RECOGNIZED_DOMAIN_FILES = new Set(DOMAIN_CONFIG_FILENAMES.values());

// ── Domain Profile Installation ────────────────────────────────────────

/**
 * Install a domain profile from an extension source directory.
 *
 * Copies recognized domain profile files to `.context-index/domains/<name>/`
 * and generates a `domain.yaml` with `extends: <parent>`.
 *
 * @param {string} projectRoot - Project root directory.
 * @param {string} extSourceDir - Extension source directory containing profile files.
 * @param {{ name: string, extends: string }} opts - Domain profile options.
 * @returns {{ filesWritten: string[] }}
 */
export function installDomainProfile(projectRoot, extSourceDir, opts) {
  const { name } = opts;
  const parent = opts.extends;

  // Validate name against bundled domain names
  if (BUNDLED_DOMAIN_NAMES.has(name)) {
    const err = new Error(
      `Domain profile name '${name}' collides with a bundled domain name. ` +
      `Bundled domain names (${[...BUNDLED_DOMAIN_NAMES].join(', ')}) cannot be overridden.`
    );
    err.code = 'BUNDLED_COLLISION';
    throw err;
  }

  // Validate name against kebab-case pattern
  if (!DOMAIN_NAME_PATTERN.test(name)) {
    const err = new Error(
      `Domain profile name '${name}' is not valid. ` +
      `Expected pattern: ${DOMAIN_NAME_PATTERN.source}`
    );
    err.code = 'INVALID_DOMAIN_NAME';
    throw err;
  }

  const domainDir = join(projectRoot, '.context-index', 'domains', name);
  mkdirSync(domainDir, { recursive: true });

  const filesWritten = [];

  // Copy recognized domain profile files from extension source
  const sourceFiles = existsSync(extSourceDir) ? readdirSync(extSourceDir) : [];
  for (const file of sourceFiles) {
    if (RECOGNIZED_DOMAIN_FILES.has(file)) {
      const src = join(extSourceDir, file);
      const dest = join(domainDir, file);
      copyFileSync(src, dest);
      filesWritten.push(dest);
    }
  }

  // Generate domain.yaml with extends
  const domainYamlPath = join(domainDir, 'domain.yaml');
  writeFileSync(domainYamlPath, `extends: ${parent}\n`);
  filesWritten.push(domainYamlPath);

  return { filesWritten };
}

// ── Governance Entry Validation and Merge ──────────────────────────────

/**
 * Validate a governance entry against the schema.
 *
 * Rules:
 * - `id` must be a non-empty string, max 128 characters
 * - All field values must be strings, numbers, booleans, or arrays of strings
 * - No nested objects
 *
 * @param {object} entry - Governance entry to validate.
 * @throws {{ code: 'GOVERNANCE_SCHEMA' }} on validation failure.
 */
export function validateGovernanceEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    const err = new Error('Governance entry must be an object.');
    err.code = 'GOVERNANCE_SCHEMA';
    throw err;
  }

  // id: non-empty string, max 128 chars
  if (!entry.id || typeof entry.id !== 'string' || entry.id.length === 0) {
    const err = new Error('Governance entry must have a non-empty string `id` field.');
    err.code = 'GOVERNANCE_SCHEMA';
    throw err;
  }

  if (entry.id.length > 128) {
    const err = new Error(`Governance entry id '${entry.id.slice(0, 20)}...' exceeds maximum length of 128 characters.`);
    err.code = 'GOVERNANCE_SCHEMA';
    throw err;
  }

  // Validate all field values (except id)
  for (const [key, value] of Object.entries(entry)) {
    if (key === 'id') continue;
    if (!isValidGovernanceValue(value)) {
      const err = new Error(
        `Governance entry '${entry.id}': field '${key}' has an invalid value. ` +
        `Values must be strings, numbers, booleans, or arrays of strings. No nested objects.`
      );
      err.code = 'GOVERNANCE_SCHEMA';
      throw err;
    }
  }
}

/**
 * Check if a value is valid for a governance entry field.
 * Allowed: string, number, boolean, or array of strings.
 */
function isValidGovernanceValue(value) {
  if (typeof value === 'string') return true;
  if (typeof value === 'number') return true;
  if (typeof value === 'boolean') return true;
  if (Array.isArray(value)) {
    return value.every(item => typeof item === 'string');
  }
  return false;
}

/**
 * Merge governance entries into a target governance file.
 *
 * Uses merge-by-id semantics per ADR-0003:
 * - Entries with matching `id`: project values win (extension fills gaps)
 * - Entries with new `id`: appended
 *
 * Auto-creates the governance file if it does not exist.
 *
 * @param {string} projectRoot - Project root directory.
 * @param {string} targetFile - Governance filename (e.g., 'review.yaml').
 * @param {Array<object>} entries - Extension governance entries to merge.
 * @returns {{ mergesApplied: string[] }}
 */
export function mergeGovernanceEntries(projectRoot, targetFile, entries) {
  // Validate all entries first
  for (const entry of entries) {
    validateGovernanceEntry(entry);
  }

  const govDir = join(projectRoot, '.context-index', 'governance');
  mkdirSync(govDir, { recursive: true });

  const targetPath = join(govDir, targetFile);
  const mergesApplied = [];

  // Determine the root key from the file name (e.g., review.yaml -> reviewers)
  const rootKey = inferRootKey(targetFile);

  // Read existing entries (or start empty)
  let existingEntries = [];
  if (existsSync(targetPath)) {
    const raw = readFileSync(targetPath, 'utf8');
    try {
      const parsed = parseYaml(raw);
      if (parsed && Array.isArray(parsed[rootKey])) {
        existingEntries = parsed[rootKey];
      }
    } catch {
      // If parsing fails, start fresh
    }
  }

  // Build a map of existing entries by id (project entries)
  const byId = new Map();
  for (const entry of existingEntries) {
    if (entry && entry.id) {
      byId.set(entry.id, entry);
    }
  }

  // Merge extension entries: project wins on collision, append new
  for (const extEntry of entries) {
    if (byId.has(extEntry.id)) {
      // Project wins: only fill in fields not already set
      const projectEntry = byId.get(extEntry.id);
      for (const [key, value] of Object.entries(extEntry)) {
        if (!(key in projectEntry)) {
          projectEntry[key] = value;
        }
      }
      mergesApplied.push(`merged (project-wins): ${extEntry.id}`);
    } else {
      byId.set(extEntry.id, { ...extEntry });
      mergesApplied.push(`appended: ${extEntry.id}`);
    }
  }

  // Write the merged result
  const merged = [...byId.values()];
  const yaml = serializeGovernanceYaml(rootKey, merged);
  writeFileSync(targetPath, yaml);

  return { mergesApplied };
}

/**
 * Infer the root YAML key from a governance filename.
 *
 * review.yaml -> reviewers
 * gates.yaml -> gates
 * validate.yaml -> validators
 */
function inferRootKey(filename) {
  const base = filename.replace(/\.yaml$/, '');
  if (base === 'review') return 'reviewers';
  if (base === 'validate') return 'validators';
  return base; // gates -> gates
}

/**
 * Serialize a governance entries array to YAML format.
 */
function serializeGovernanceYaml(rootKey, entries) {
  if (entries.length === 0) {
    return `${rootKey}: []\n`;
  }
  const lines = [`${rootKey}:`];
  for (const entry of entries) {
    let first = true;
    for (const [key, value] of Object.entries(entry)) {
      const prefix = first ? '  - ' : '    ';
      first = false;
      lines.push(`${prefix}${key}: ${serializeYamlValue(value)}`);
    }
  }
  return lines.join('\n') + '\n';
}

/**
 * Serialize a single YAML value (scalar or simple array).
 */
function serializeYamlValue(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return `[${value.map(v => `"${v}"`).join(', ')}]`;
  }
  return String(value);
}

// ── Sample Installation ────────────────────────────────────────────────

/**
 * Install sample files from an extension source directory.
 *
 * Each path can be a string (filename) or an object `{ src, dest }`.
 * Source paths are verified to fall within extSourceDir.
 * Destination paths are verified to fall within `.context-index/samples/`.
 *
 * @param {string} projectRoot - Project root directory.
 * @param {string} extSourceDir - Extension source directory.
 * @param {Array<string|{src: string, dest: string}>} samplePaths - Sample file paths.
 * @returns {{ filesWritten: string[], warnings: string[] }}
 */
export function installSamples(projectRoot, extSourceDir, samplePaths) {
  const samplesDir = join(projectRoot, '.context-index', 'samples');
  mkdirSync(samplesDir, { recursive: true });

  const filesWritten = [];
  const warnings = [];

  const resolvedExtDir = resolve(extSourceDir);
  const resolvedSamplesDir = resolve(samplesDir);

  for (const pathEntry of samplePaths) {
    let srcRelative, destRelative;

    if (typeof pathEntry === 'string') {
      srcRelative = pathEntry;
      destRelative = pathEntry;
    } else {
      srcRelative = pathEntry.src;
      destRelative = pathEntry.dest;
    }

    // Canonicalize source path and check containment
    const srcFull = resolve(resolvedExtDir, srcRelative);
    if (!srcFull.startsWith(resolvedExtDir + '/') && srcFull !== resolvedExtDir) {
      const err = new Error(
        `Sample source path '${srcRelative}' escapes the extension source directory.`
      );
      err.code = 'PATH_TRAVERSAL';
      throw err;
    }

    // Canonicalize dest path and check containment
    const destFull = resolve(resolvedSamplesDir, destRelative);
    if (!destFull.startsWith(resolvedSamplesDir + '/') && destFull !== resolvedSamplesDir) {
      const err = new Error(
        `Sample destination path '${destRelative}' escapes the samples directory.`
      );
      err.code = 'PATH_TRAVERSAL';
      throw err;
    }

    // Check for overwrite
    if (existsSync(destFull)) {
      warnings.push(`Overwriting existing sample: ${destRelative}`);
    }

    // Ensure dest directory exists
    mkdirSync(dirname(destFull), { recursive: true });

    // Copy
    copyFileSync(srcFull, destFull);
    filesWritten.push(destFull);
  }

  return { filesWritten, warnings };
}

// ── Skill Conflict Detection ───────────────────────────────────────────

/**
 * Check extension skill names against bundled skill names.
 *
 * Reads the bundled skill names from the plugin's `skills/` directory.
 *
 * @param {string[]} skillNames - Extension skill names to check.
 * @param {{ pluginRoot?: string }} [opts] - Options.
 * @returns {{ conflicts: string[] }} - Empty conflicts array if no collisions.
 * @throws {{ code: 'SKILL_COLLISION', conflicts: string[] }} if any collision found.
 */
export function checkSkillConflicts(skillNames, opts = {}) {
  const pluginRoot = opts.pluginRoot || PLUGIN_ROOT;
  const skillsDir = join(pluginRoot, 'skills');

  // Read bundled skill names from directory listing
  let bundledSkillNames;
  try {
    bundledSkillNames = new Set(
      readdirSync(skillsDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name)
    );
  } catch {
    // If we can't read the skills directory, assume no bundled skills
    bundledSkillNames = new Set();
  }

  const conflicts = skillNames.filter(name => bundledSkillNames.has(name));

  if (conflicts.length > 0) {
    const err = new Error(
      `Extension skill names conflict with bundled skills: ${conflicts.join(', ')}. ` +
      `Bundled skill names cannot be overridden.`
    );
    err.code = 'SKILL_COLLISION';
    err.conflicts = conflicts;
    throw err;
  }

  return { conflicts: [] };
}
