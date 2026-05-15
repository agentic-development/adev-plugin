/**
 * Template resolution for the lifecycle-artifacts taxonomy.
 *
 * Exports `resolveTemplate(layer, kind, domain)` — resolves the most-specific
 * template file available for the requested (artifact_layer, kind, domain)
 * tuple, falling through domain override → bundled `software` default.
 *
 * Resolution order:
 *   1. Domain override (when `domain` is a non-null string):
 *      <extensionRoot>/spec-template.<kind>.md   (for layer='spec')
 *      <extensionRoot>/charter-template.<kind>.md (for layer='charter')
 *      where <extensionRoot> is the `domain/` directory of a registered
 *      domain extension (e.g. `extensions/<domain>/domain/`).
 *   2. Bundled software default:
 *      <pluginRoot>/templates/spec-template.<kind>.md
 *      <pluginRoot>/templates/charter-template.<kind>.md
 *
 * Security: every resolved candidate goes through `fs.realpathSync` and must
 * be a descendant of one of the allowed path-containment roots (the plugin
 * `templates/` dir + each registered extension's `domain/` dir). Trailing-slash
 * boundaries are enforced so `templates-evil/` cannot escape via `templates/`
 * prefix overlap.
 *
 * Pure read operation — never creates, modifies, or deletes any file.
 *
 * @module lib/template-resolution
 * @see .context-index/specs/features/lifecycle-artifacts/template-resolution.spec.md
 * @see .context-index/specs/features/lifecycle-artifacts/charter.md
 * @see .context-index/adrs/0009-lifecycle-artifact-taxonomy.md
 */

import { existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { isValidKind } from "./kinds.mjs";

/**
 * Resolve plugin root from this file's location: `<pluginRoot>/lib/template-resolution.mjs`.
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DEFAULT_PLUGIN_ROOT = resolve(__dirname, "..");
const DEFAULT_EXTENSIONS_DIR = resolve(DEFAULT_PLUGIN_ROOT, "extensions");

/**
 * Test-mode override for allowed-roots discovery. When set, `resolveTemplate`
 * uses these roots instead of probing the live filesystem. Reset via
 * `__resetAllowedRootsForTest()`.
 *
 * Shape:
 *   { pluginRoot: string,
 *     extensionRoots: { [domainName]: extDomainDir } | [extDomainDir, ...] }
 */
let __testRoots = null;

/**
 * @internal Test-only: inject allowed roots so tests don't have to mutate the
 * real plugin filesystem. Production code never sets this.
 */
export function __setAllowedRootsForTest(roots) {
  __testRoots = roots;
}

/**
 * @internal Test-only: clear the test override.
 */
export function __resetAllowedRootsForTest() {
  __testRoots = null;
}

/**
 * Discover all registered domain extensions by scanning `<pluginRoot>/extensions/`
 * for subdirectories that contain a `domain/` directory.
 *
 * Returns a map of `domainName → absolute path to extension's domain/ dir`.
 * The extension's directory name is treated as the domain identifier.
 *
 * Best-effort: if the extensions root doesn't exist or isn't readable, returns
 * an empty map. We never throw on discovery; missing extensions just mean no
 * domain overrides are available.
 *
 * @param {string} pluginRoot
 * @returns {Record<string, string>}
 */
function discoverExtensionRoots(pluginRoot) {
  const extDir = resolve(pluginRoot, "extensions");
  if (!existsSync(extDir)) return {};
  let entries;
  try {
    entries = readdirSync(extDir, { withFileTypes: true });
  } catch {
    return {};
  }
  const out = {};
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const domainDir = join(extDir, ent.name, "domain");
    if (existsSync(domainDir)) {
      out[ent.name] = domainDir;
    }
  }
  return out;
}

/**
 * Compute the set of allowed containment roots (real-pathed, absolute).
 *
 * Order matters only for the diagnostic message; containment is a set check.
 *
 * @param {string} pluginRoot
 * @param {Record<string, string> | string[]} extensionRoots
 * @returns {{ allowedRoots: string[], extensionRootByDomain: Record<string, string>, pluginTemplatesRoot: string }}
 */
function computeAllowedRoots(pluginRoot, extensionRoots) {
  const pluginTemplatesRoot = safeRealpath(resolve(pluginRoot, "templates"));
  const allowedRoots = [pluginTemplatesRoot];
  const byDomain = {};

  if (Array.isArray(extensionRoots)) {
    for (const dir of extensionRoots) {
      const real = safeRealpath(dir);
      allowedRoots.push(real);
    }
  } else if (extensionRoots && typeof extensionRoots === "object") {
    for (const [domain, dir] of Object.entries(extensionRoots)) {
      const real = safeRealpath(dir);
      byDomain[domain] = real;
      allowedRoots.push(real);
    }
  }

  return {
    allowedRoots,
    extensionRootByDomain: byDomain,
    pluginTemplatesRoot,
  };
}

/**
 * Resolve `p` to its real path. Returns the input unchanged if realpath fails
 * (e.g., the path doesn't exist) — callers must handle non-existence separately.
 *
 * @param {string} p
 * @returns {string}
 */
function safeRealpath(p) {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

/**
 * True iff `child` is `root` itself or a strict descendant of `root`.
 *
 * Trailing-slash safety: appends `sep` to both paths before comparison so
 * `/foo/templates-evil/x` does NOT match the prefix `/foo/templates`.
 *
 * Both arguments must already be absolute and real-pathed.
 *
 * @param {string} child
 * @param {string} root
 * @returns {boolean}
 */
function isPathContained(child, root) {
  if (child === root) return true;
  const rootWithSep = root.endsWith(sep) ? root : root + sep;
  return child.startsWith(rootWithSep);
}

/**
 * Build the `TEMPLATE_NOT_FOUND` error.
 *
 * @param {string[]} attempted - All candidate paths probed, in order.
 * @returns {Error}
 */
function templateNotFoundError(attempted) {
  const msg =
    `TEMPLATE_NOT_FOUND: no template file exists at any of the attempted paths:\n  - ` +
    attempted.join("\n  - ");
  const err = new Error(msg);
  err.code = "TEMPLATE_NOT_FOUND";
  err.attempted = attempted;
  return err;
}

/**
 * Build the `UNSAFE_TEMPLATE_PATH` error.
 *
 * @param {string} offending
 * @returns {Error}
 */
function unsafeTemplatePathError(offending) {
  const err = new Error(
    `UNSAFE_TEMPLATE_PATH: resolved template path "${offending}" escapes the allowed containment roots (plugin templates/ + registered extension domain/ dirs).`,
  );
  err.code = "UNSAFE_TEMPLATE_PATH";
  err.offendingPath = offending;
  return err;
}

/**
 * Build the `INVALID_KIND` error.
 *
 * @param {string} layer
 * @param {unknown} kind
 * @returns {Error}
 */
function invalidKindError(layer, kind) {
  const rendered =
    typeof kind === "string" ? JSON.stringify(kind) : String(kind);
  const err = new Error(
    `INVALID_KIND: "${rendered}" is not a valid kind for layer "${layer}".`,
  );
  err.code = "INVALID_KIND";
  return err;
}

/**
 * Resolve the most-specific template path for `(layer, kind, domain)`.
 *
 * @param {'spec' | 'charter'} layer - Artifact layer.
 * @param {string} kind - Kind value valid for the given layer.
 * @param {string | null | undefined} domain - Optional domain extension name.
 * @returns {Promise<string>} Absolute, real-pathed template file.
 *
 * @throws {Error} `code: 'INVALID_LAYER'` if `layer` ∉ `{'spec','charter'}`.
 * @throws {Error} `code: 'INVALID_KIND'` if `kind` is not in the layer's enumeration.
 * @throws {Error} `code: 'TEMPLATE_NOT_FOUND'` if neither override nor bundled exists.
 * @throws {Error} `code: 'UNSAFE_TEMPLATE_PATH'` if resolved real-path escapes allowed roots.
 * @throws {Error} Underlying `fs` error (e.g. `EACCES`) if the file exists but cannot be read.
 */
export async function resolveTemplate(layer, kind, domain) {
  // Behavior 5: layer validation runs first and propagates INVALID_LAYER from kinds.mjs.
  // `isValidKind` throws INVALID_LAYER for any layer outside the closed set.
  const layerOk = isValidKind(layer, kind);

  // Behavior 6: layer is valid but kind is not in the layer's enumeration.
  if (!layerOk) {
    throw invalidKindError(layer, kind);
  }

  // Resolve plugin root + allowed roots. Test override wins when set.
  const pluginRoot = __testRoots?.pluginRoot ?? DEFAULT_PLUGIN_ROOT;
  const extensionRoots =
    __testRoots?.extensionRoots ?? discoverExtensionRoots(pluginRoot);

  const { allowedRoots, extensionRootByDomain, pluginTemplatesRoot } =
    computeAllowedRoots(pluginRoot, extensionRoots);

  const filename = `${layer}-template.${kind}.md`;
  const attempted = [];

  // Behavior 2: try domain override first (when domain is a non-null string).
  if (typeof domain === "string" && domain.length > 0) {
    const extRoot = extensionRootByDomain[domain];
    if (extRoot) {
      const candidate = join(extRoot, filename);
      attempted.push(candidate);
      const resolved = tryResolveContained(candidate, allowedRoots);
      if (resolved !== undefined) {
        return resolved;
      }
    } else {
      // Domain name not in registered extensions: record the conceptual path
      // we would have tried (under the discovered extensions dir) so the
      // diagnostic surfaces what was missing. This is best-effort context;
      // we do not stat or read it.
      attempted.push(
        join(DEFAULT_EXTENSIONS_DIR, domain, "domain", filename),
      );
    }
  }

  // Behavior 3 / 4: fall through to bundled software default.
  const bundled = join(pluginTemplatesRoot, filename);
  attempted.push(bundled);
  const resolved = tryResolveContained(bundled, allowedRoots);
  if (resolved !== undefined) {
    return resolved;
  }

  // Behavior 7: nothing resolved.
  throw templateNotFoundError(attempted);
}

/**
 * Attempt to resolve a candidate path: if it exists on disk, realpath it,
 * verify containment within `allowedRoots`, and return the real path.
 *
 * Returns `undefined` if the file does not exist (caller may try another
 * candidate). Throws `UNSAFE_TEMPLATE_PATH` if the file exists but its
 * real-path escapes the allowed roots.
 *
 * @param {string} candidate - Absolute candidate path (pre-realpath).
 * @param {string[]} allowedRoots - Real-pathed, absolute allowed roots.
 * @returns {string | undefined}
 */
function tryResolveContained(candidate, allowedRoots) {
  if (!existsSync(candidate)) {
    return undefined;
  }
  // Behavior 8: follow symlinks with realpath, then verify containment.
  const real = realpathSync(candidate);
  // Reject directories — only files are valid templates.
  if (statSync(real).isDirectory()) {
    // Treat as "not found" so resolution can try the next candidate.
    // (A symlink-to-directory would also land here; that is fine.)
    return undefined;
  }
  for (const root of allowedRoots) {
    if (isPathContained(real, root)) {
      return real;
    }
  }
  throw unsafeTemplatePathError(real);
}
