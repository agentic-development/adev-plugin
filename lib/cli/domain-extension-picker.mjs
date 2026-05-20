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
  PICKER_USER_ABORTED,
} from './picker-errors.mjs';
import { stripCredentials } from '../extensions/resolve-source.mjs';

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

/**
 * Detect an existing domain-profile install by inspecting manifest stamps.
 * The picker treats the `installed_extensions` array as authoritative
 * (per the Stamp-trust note in the spec). An entry counts as a
 * domain-profile install when:
 *   - its `kind` field is exactly `"domain-profile"`, OR
 *   - its `name` matches a known catalog entry (forward-compat for stamps
 *     that don't carry a `kind` field yet)
 *
 * @param {Array<object>} stamps - installed_extensions array.
 * @param {Array<{ name: string }>} validCatalogEntries
 * @returns {string|null} The installed domain name, or null if none.
 */
function detectInstalledDomain(stamps, validCatalogEntries) {
  if (!Array.isArray(stamps)) return null;
  const catalogNames = new Set(validCatalogEntries.map(e => e.name));
  for (const stamp of stamps) {
    if (!stamp || typeof stamp.name !== 'string') continue;
    if (stamp.kind === 'domain-profile' || catalogNames.has(stamp.name)) {
      return stamp.name;
    }
  }
  return null;
}

/**
 * Run the init-time domain-extension picker.
 *
 * Orchestrates: load + validate catalog → detect existing install →
 * build prompt → read user input → dispatch install (if non-software).
 *
 * @param {object} deps
 * @param {string} deps.projectRoot
 * @param {string} deps.pluginRoot
 * @param {(question: string) => Promise<string|null>} deps.ask - Prompt helper. Returns `null` on Ctrl+C / EOF.
 * @param {(path: string, root: string, opts: object) => Promise<object>} deps.installFn - installExtension callee.
 * @param {(root: string) => Array<object>} deps.readStamps - readManifestStamps callee.
 * @returns {Promise<{ action: 'software' | 'skip' | 'install' | 'already-installed', domainName: string, sourcePath: string|null, advisories?: object[], installError?: Error }>}
 * @throws {Error} with `code === PICKER_USER_ABORTED` on Ctrl+C / EOF.
 */
export async function runPicker({ projectRoot, pluginRoot, ask, installFn, readStamps }) {
  // 1. Skip if a domain-profile is already installed (read manifest stamps).
  const catalog = loadCatalog(pluginRoot);
  const { valid: validEntries, advisories } = validateEntries(catalog, pluginRoot);

  const stamps = readStamps(projectRoot) || [];
  const existing = detectInstalledDomain(stamps, validEntries);
  if (existing) {
    return {
      action: 'already-installed',
      domainName: existing,
      sourcePath: null,
      advisories,
    };
  }

  // 2. Build the prompt.
  // Options: 1 = software (default), 2..N = catalog entries, N+1 = skip
  const options = [
    { kind: 'software', name: 'software', label: 'software (bundled, default)' },
    ...validEntries.map(e => ({ kind: 'install', name: e.name, label: `${e.label} (${e.name})`, entry: e })),
    { kind: 'skip', name: 'skip', label: 'skip — pick a domain later via `adev extension install <source>`' },
  ];

  // 3. Read user input.
  const answer = await ask(`Pick a domain (1-${options.length}) [1]:`);
  if (answer === null || answer === undefined) {
    const err = new Error('Picker aborted by user.');
    err.code = PICKER_USER_ABORTED;
    throw err;
  }

  const trimmed = String(answer).trim();
  const choice = trimmed === '' ? 1 : parseInt(trimmed, 10);
  if (!Number.isInteger(choice) || choice < 1 || choice > options.length) {
    // Invalid input — fall back to software default rather than crash init.
    return { action: 'software', domainName: 'software', sourcePath: null, advisories };
  }

  const picked = options[choice - 1];

  if (picked.kind === 'software') {
    return { action: 'software', domainName: 'software', sourcePath: null, advisories };
  }
  if (picked.kind === 'skip') {
    return { action: 'skip', domainName: 'software', sourcePath: null, advisories };
  }

  // 4. Non-software entry — dispatch to installExtension.
  const dispatch = await dispatchInstall(picked.entry, projectRoot, { installFn, pluginRoot });
  if (!dispatch.installed) {
    return {
      action: 'install-failed',
      domainName: 'software',  // no domain written on failure
      sourcePath: null,
      advisories,
      installError: dispatch.err,
    };
  }
  return {
    action: 'install',
    domainName: picked.entry.name,
    sourcePath: picked.entry.resolvedPath,
    advisories,
  };
}

/**
 * Dispatch installExtension for a chosen catalog entry.
 *
 * On success, returns `{ installed: true, report }`.
 * On failure, returns `{ installed: false, err }` with credentials stripped
 * from the error message. Does NOT throw — caller-decides keeps CLI
 * control-flow clean.
 *
 * @param {{ name: string, resolvedPath: string }} entry
 * @param {string} projectRoot
 * @param {{ installFn: Function, pluginRoot?: string, stripCreds?: Function }} deps
 * @returns {Promise<{ installed: boolean, report?: object, err?: Error }>}
 */
export async function dispatchInstall(entry, projectRoot, deps) {
  const installFn = deps.installFn;
  const stripCreds = deps.stripCreds || stripCredentials;
  try {
    const report = await installFn(entry.resolvedPath, projectRoot, {
      pluginRoot: deps.pluginRoot,
      sourceUri: entry.resolvedPath,
    });
    return { installed: true, report };
  } catch (err) {
    // Sanitize any URI substrings in the error message before re-surfacing.
    const sanitizedMessage = sanitizeErrorMessage(err && err.message ? err.message : String(err), stripCreds);
    const wrapped = new Error(sanitizedMessage);
    wrapped.code = err && err.code ? err.code : 'SOURCE_RESOLUTION';
    return { installed: false, err: wrapped };
  }
}

/**
 * Sanitize a free-form error message by stripping credentials from any
 * URL-looking substrings. Conservative: matches `scheme://user:pass@host/...`
 * tokens and rewrites them via `stripCreds`.
 */
function sanitizeErrorMessage(message, stripCreds) {
  // Match URI tokens (no whitespace, has scheme://, optional userinfo).
  return message.replace(/[a-z][a-z0-9+.-]*:\/\/\S+/gi, (match) => stripCreds(match));
}
