/**
 * Extension manifest (`adev-extension.yaml`) parsing and validation.
 *
 * Validates the required `name` and `version` fields, plus optional
 * `description`, `author`, `requires`, and `provides`. Unknown fields
 * are silently ignored for forward compatibility.
 *
 * @module lib/extensions/manifest-schema
 */

import { parseYaml } from '../profiles/yaml.mjs';

/** Name must be lowercase kebab-case, starting with a letter. */
const NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

/** Maximum length for the extension name. */
const MAX_NAME_LENGTH = 64;

/** Maximum length for the version string. */
const MAX_VERSION_LENGTH = 32;

/**
 * Basic semver pattern: major.minor.patch with optional pre-release and build metadata.
 * Covers the subset needed for extension manifests without pulling in a semver library.
 */
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9]+(?:\.[a-zA-Z0-9]+)*)?(?:\+[a-zA-Z0-9]+(?:\.[a-zA-Z0-9]+)*)?$/;

/**
 * Parse a YAML string into a manifest object and validate it.
 *
 * @param {string} yamlString - Raw YAML content of adev-extension.yaml.
 * @returns {{ valid: true, manifest: object } | { valid: false, code: string, message: string, missingFields?: string[] }}
 */
export function parseExtensionManifest(yamlString) {
  let obj;
  try {
    obj = parseYaml(yamlString);
  } catch (err) {
    return {
      valid: false,
      code: 'INVALID_SCHEMA',
      message: `Failed to parse extension manifest YAML: ${err.message}`,
      missingFields: [],
    };
  }
  return validateExtensionManifest(obj);
}

/**
 * Validate an already-parsed manifest object against the extension schema.
 *
 * @param {any} obj - Parsed manifest object.
 * @returns {{ valid: true, manifest: object } | { valid: false, code: string, message: string, missingFields?: string[] }}
 */
export function validateExtensionManifest(obj) {
  if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) {
    return {
      valid: false,
      code: 'INVALID_SCHEMA',
      message: 'Extension manifest must be a YAML mapping (object).',
      missingFields: [],
    };
  }

  // Check required fields presence
  const missingFields = [];
  if (!obj.name && obj.name !== 0) missingFields.push('name');
  if (!obj.version && obj.version !== 0) missingFields.push('version');

  if (missingFields.length > 0) {
    return {
      valid: false,
      code: 'INVALID_SCHEMA',
      message: `Extension manifest is missing required fields: ${missingFields.join(', ')}.`,
      missingFields,
    };
  }

  // Validate name
  const name = String(obj.name);
  if (name.length === 0) {
    return {
      valid: false,
      code: 'INVALID_SCHEMA',
      message: 'Extension name must not be empty.',
      missingFields: [],
    };
  }
  if (name.length > MAX_NAME_LENGTH) {
    return {
      valid: false,
      code: 'INVALID_SCHEMA',
      message: `Extension name exceeds maximum length of ${MAX_NAME_LENGTH} characters.`,
      missingFields: [],
    };
  }
  if (!NAME_PATTERN.test(name)) {
    return {
      valid: false,
      code: 'INVALID_SCHEMA',
      message: `Extension name "${name}" must be kebab-case (lowercase letters, digits, and hyphens, starting with a letter). Pattern: ${NAME_PATTERN}.`,
      missingFields: [],
    };
  }

  // Validate version
  const version = String(obj.version);
  if (version.length > MAX_VERSION_LENGTH) {
    return {
      valid: false,
      code: 'INVALID_SCHEMA',
      message: `Extension version exceeds maximum length of ${MAX_VERSION_LENGTH} characters.`,
      missingFields: [],
    };
  }
  if (!SEMVER_PATTERN.test(version)) {
    return {
      valid: false,
      code: 'INVALID_SCHEMA',
      message: `Extension version "${version}" is not valid semver (expected major.minor.patch with optional pre-release).`,
      missingFields: [],
    };
  }

  // Build validated manifest (only recognized fields)
  const manifest = { name, version };
  if (typeof obj.description === 'string') manifest.description = obj.description;
  if (typeof obj.author === 'string') manifest.author = obj.author;
  if (obj.requires != null && typeof obj.requires === 'object') manifest.requires = obj.requires;
  if (obj.provides != null && typeof obj.provides === 'object') manifest.provides = obj.provides;

  return { valid: true, manifest };
}
