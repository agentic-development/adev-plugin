/**
 * Shared install-copy filter for provider adapters.
 *
 * Adapters that install by copying the plugin root previously used a three-item
 * denylist (`.git`, `node_modules`, `.DS_Store`). That copies everything else in
 * the repo root, which for a git checkout measured 358 MB across 25,191 files —
 * including `.claude/`, `.beads/`, `tests/` and `.context-index/` — against a
 * ~5 MB shipped plugin.
 *
 * The set of directories that ship is already declared once, in package.json's
 * `files` array, and npm is the authority on it. Deriving the copy filter from
 * that field keeps the two in step: adding a shipped directory to `files` is
 * enough, and no adapter needs its own list to fall out of date.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Files npm always includes regardless of the `files` array.
 * @see https://docs.npmjs.com/cli/configuring-npm/package-json#files
 */
const ALWAYS_SHIPPED = new Set([
  "package.json",
  "README.md",
  "README",
  "LICENSE",
  "LICENCE",
]);

/** Never copied, even when nested inside a shipped directory. */
const NEVER_COPIED = new Set([".git", "node_modules", ".DS_Store"]);

/**
 * Top-level entries that belong in an installed plugin, derived from
 * package.json `files` plus npm's implicit additions.
 *
 * @param {string} pluginRoot - Absolute path to the plugin root.
 * @returns {Set<string>} Top-level entry names (no trailing slashes).
 */
export function shippedTopLevel(pluginRoot) {
  let files = [];
  try {
    const pkg = JSON.parse(readFileSync(join(pluginRoot, "package.json"), "utf8"));
    files = Array.isArray(pkg.files) ? pkg.files : [];
  } catch {
    // A missing or malformed package.json must not silently produce an empty
    // allowlist — that would install nothing at all. Signal instead.
    throw new Error(
      `SHIP_MANIFEST_UNREADABLE: cannot read package.json 'files' from ${pluginRoot}`
    );
  }
  if (files.length === 0) {
    throw new Error(
      `SHIP_MANIFEST_EMPTY: package.json in ${pluginRoot} declares no 'files' array; ` +
        "refusing to guess what ships"
    );
  }
  // "lib/" -> "lib"; "providers/x/y.mjs" -> "providers"
  const tops = files.map((f) => f.replace(/^\.\//, "").split("/")[0]).filter(Boolean);
  return new Set([...tops, ...ALWAYS_SHIPPED]);
}

/**
 * Build a `cpSync` filter that copies only what ships.
 *
 * @param {string} pluginRoot - Absolute path to the plugin root being copied.
 * @returns {(src: string) => boolean} Filter for `cpSync`'s `filter` option.
 */
export function installCopyFilter(pluginRoot) {
  const ship = shippedTopLevel(pluginRoot);
  const rootPrefix = pluginRoot.endsWith("/") ? pluginRoot : pluginRoot + "/";

  return (src) => {
    const basename = src.split("/").pop();
    if (NEVER_COPIED.has(basename)) return false;
    // cpSync calls the filter on the root itself first.
    if (src === pluginRoot || src + "/" === rootPrefix) return true;
    if (!src.startsWith(rootPrefix)) return true;
    const top = src.slice(rootPrefix.length).split("/")[0];
    return ship.has(top);
  };
}

/**
 * Whether a top-level entry should be copied. For adapters that iterate
 * `readdirSync(pluginRoot)` rather than calling `cpSync` on the whole root.
 *
 * @param {string} pluginRoot - Absolute path to the plugin root.
 * @returns {(name: string) => boolean} Predicate over top-level entry names.
 */
export function shouldCopyTopLevel(pluginRoot) {
  const ship = shippedTopLevel(pluginRoot);
  return (name) => !NEVER_COPIED.has(name) && ship.has(name);
}

export default { shippedTopLevel, installCopyFilter, shouldCopyTopLevel };
