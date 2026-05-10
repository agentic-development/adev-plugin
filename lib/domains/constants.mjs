/**
 * Domain profile constants.
 *
 * Central registry of overlay types, filenames, bundled domain names,
 * and the domain name validation pattern.
 *
 * @module lib/domains/constants
 */

/** Valid overlay type identifiers (closed set). */
export const OVERLAY_TYPES = new Set([
  'charter-template',
  'spec-template',
  'reviewers',
  'gates',
  'verification',
  'gate-config',
  'test-config',
]);

/** Map overlay type -> filename on disk. */
export const OVERLAY_FILENAMES = new Map([
  ['charter-template', 'charter-template.md'],
  ['spec-template', 'spec-template.md'],
  ['reviewers', 'reviewers.yaml'],
  ['gates', 'gates.yaml'],
  ['verification', 'verification.yaml'],
  ['gate-config', 'gate-config.yaml'],
  ['test-config', 'test-config.yaml'],
]);

/** Overlay types that return parsed objects (YAML). */
export const STRUCTURED_OVERLAY_TYPES = new Set([
  'reviewers',
  'gates',
  'verification',
  'gate-config',
  'test-config',
]);

/** Deprecated overlay type names mapped to their replacements. */
export const DEPRECATED_OVERLAY_TYPES = new Map([
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

/** Max overlay file size in bytes. */
export const MAX_OVERLAY_SIZE = 512 * 1024;
