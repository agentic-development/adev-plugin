/**
 * Domain profile constants.
 *
 * Central registry of overlay types, filenames, bundled domain names,
 * and the domain name validation pattern.
 *
 * @module lib/domains/constants
 */

/** Valid domain config type identifiers (closed set). */
export const DOMAIN_CONFIG_TYPES = new Set([
  'charter-template',
  'spec-template',
  'reviewers',
  'gates',
  'verification',
  'gate-config',
  'test-config',
]);

/** Map domain config type -> filename on disk. */
export const DOMAIN_CONFIG_FILENAMES = new Map([
  ['charter-template', 'charter-template.md'],
  ['spec-template', 'spec-template.md'],
  ['reviewers', 'reviewers.yaml'],
  ['gates', 'gates.yaml'],
  ['verification', 'verification.yaml'],
  ['gate-config', 'gate-config.yaml'],
  ['test-config', 'test-config.yaml'],
]);

/** Config types that return parsed objects (YAML). */
export const STRUCTURED_CONFIG_TYPES = new Set([
  'reviewers',
  'gates',
  'verification',
  'gate-config',
  'test-config',
]);

/** Deprecated config type names mapped to their replacements. */
export const DEPRECATED_CONFIG_TYPES = new Map([
  ['charter-overlay', 'charter-template'],
  ['spec-overlay', 'spec-template'],
]);

/** Bundled domain names — immutable, cannot be overridden in .context-index/domains/. */
export const BUNDLED_DOMAIN_NAMES = new Set([
  'software',
  'data-engineering',
  'process-automation',
]);

/** Domain name validation pattern: lowercase alphanumeric + hyphens, no path chars. */
export const DOMAIN_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/** Default domain when none is declared. */
export const DEFAULT_DOMAIN = 'software';

/** Max domain config file size in bytes. */
export const MAX_DOMAIN_CONFIG_SIZE = 512 * 1024;
