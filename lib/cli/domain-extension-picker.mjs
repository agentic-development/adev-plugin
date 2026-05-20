/**
 * Init-time domain-extension picker helper.
 *
 * Owns:
 *   - Catalog load and validation (templates/extensions-catalog.json)
 *   - Picker prompt + dispatch to installExtension()
 *   - Workspace-mode guard (per ADR-0005)
 *   - manifest.yaml top-level `domain:` writer
 *
 * Consumed by cli/index.mjs::cmdInstall() and cli/index.mjs::cmdUpgrade().
 *
 * @module lib/cli/domain-extension-picker
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import {
  PICKER_CATALOG_ENTRY_MISSING,
  PICKER_CATALOG_PARSE_FAILED,
} from './picker-errors.mjs';

/**
 * Canonical extension-name regex. Lifted from
 * lib/extensions/manifest-schema.mjs's NAME_PATTERN — kept locally so the
 * picker has no import-time coupling to the install-pipeline internals.
 * Update both when the canonical pattern changes.
 */
const NAME_REGEX = /^[a-z][a-z0-9-]*$/;

/**
 * Load and parse the first-party catalog JSON from the plugin root.
 *
 * @param {string} pluginRoot - Absolute path to the plugin install root.
 * @returns {{ version: number, entries: object[] }} Parsed catalog.
 * @throws {Error} With `code === PICKER_CATALOG_PARSE_FAILED` on
 *   file-missing or JSON-syntax error.
 */
export function loadCatalog(pluginRoot) {
  const catalogPath = join(pluginRoot, 'templates', 'extensions-catalog.json');
  let raw;
  try {
    raw = readFileSync(catalogPath, 'utf8');
  } catch (err) {
    const wrapped = new Error(`Failed to read catalog at ${catalogPath}: ${err.message}`);
    wrapped.code = PICKER_CATALOG_PARSE_FAILED;
    throw wrapped;
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    const wrapped = new Error(`Failed to parse catalog JSON at ${catalogPath}: ${err.message}`);
    wrapped.code = PICKER_CATALOG_PARSE_FAILED;
    throw wrapped;
  }
}

/**
 * Validate catalog entries against the v1 schema rules:
 *  - `name` matches the canonical extension-name regex
 *  - `path` resolves under `pluginRoot` (no traversal escape)
 *  - resolved path exists on disk
 *
 * Entries failing any rule are dropped from the picker. Each drop produces a
 * `{ code: PICKER_CATALOG_ENTRY_MISSING, name, reason }` advisory.
 *
 * Valid entries are returned with an additional `resolvedPath` field for
 * downstream dispatch to installExtension().
 *
 * @param {{ entries: object[] }} catalog - Parsed catalog object.
 * @param {string} pluginRoot - Absolute path to the plugin install root.
 * @returns {{ valid: object[], advisories: { code: string, name: string, reason: string }[] }}
 */
export function validateEntries(catalog, pluginRoot) {
  const valid = [];
  const advisories = [];
  const root = resolve(pluginRoot);
  const entries = Array.isArray(catalog && catalog.entries) ? catalog.entries : [];

  for (const entry of entries) {
    const name = entry && typeof entry.name === 'string' ? entry.name : '<unnamed>';

    if (!NAME_REGEX.test(name)) {
      advisories.push({
        code: PICKER_CATALOG_ENTRY_MISSING,
        name,
        reason: `name "${name}" does not match required pattern ${NAME_REGEX}`,
      });
      continue;
    }

    if (typeof entry.path !== 'string' || entry.path.length === 0) {
      advisories.push({
        code: PICKER_CATALOG_ENTRY_MISSING,
        name,
        reason: 'path is missing or empty',
      });
      continue;
    }

    const resolvedPath = resolve(pluginRoot, entry.path);
    if (resolvedPath !== root && !resolvedPath.startsWith(root + sep)) {
      advisories.push({
        code: PICKER_CATALOG_ENTRY_MISSING,
        name,
        reason: `resolved path escapes plugin root (path-traversal): ${entry.path}`,
      });
      continue;
    }

    if (!existsSync(resolvedPath)) {
      advisories.push({
        code: PICKER_CATALOG_ENTRY_MISSING,
        name,
        reason: `resolved path does not exist on disk: ${resolvedPath}`,
      });
      continue;
    }

    valid.push({
      name,
      label: typeof entry.label === 'string' ? entry.label : name,
      description: typeof entry.description === 'string' ? entry.description : '',
      path: entry.path,
      resolvedPath,
    });
  }

  return { valid, advisories };
}
