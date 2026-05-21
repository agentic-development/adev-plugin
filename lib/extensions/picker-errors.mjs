/**
 * Error codes for the init-time domain-extension picker.
 *
 * New codes (PICKER_* prefix) declared here; reused pipeline codes
 * (SOURCE_RESOLUTION, INVALID_SCHEMA, BUNDLED_COLLISION) come from
 * lib/extensions/install.mjs and lib/extensions/resolve-source.mjs.
 *
 * @module lib/cli/picker-errors
 */

export const PICKER_CATALOG_ENTRY_MISSING = 'PICKER_CATALOG_ENTRY_MISSING';
export const PICKER_USER_ABORTED = 'PICKER_USER_ABORTED';
export const PICKER_MANIFEST_WRITE_FAILED = 'PICKER_MANIFEST_WRITE_FAILED';
export const PICKER_CATALOG_PARSE_FAILED = 'PICKER_CATALOG_PARSE_FAILED';
