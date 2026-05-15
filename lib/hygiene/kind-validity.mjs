/**
 * Kind-validity audit pass for `/adev:hygiene`.
 *
 * Walks every `*.spec.md` and `charter.md` artifact under
 * `<projectRoot>/.context-index/`, inspects the frontmatter discriminator
 * (`kind`, `kindValid`, `kindResolved`) projected by `parseSpecFrontmatter`
 * from `lib/meta-tools.mjs`, and emits findings per the contract documented
 * in `hygiene-kind-validity.spec.md`.
 *
 * Layer 1 posture: **entirely non-blocking**. The pass never throws and never
 * sets `process.exitCode`. The returned `findings` array is the sole signal.
 * Severity (`error` / `warn` / `info`) conveys human-triage priority only.
 *
 * @module lib/hygiene/kind-validity
 * @see .context-index/specs/features/lifecycle-artifacts/hygiene-kind-validity.spec.md
 */

import { readdirSync, existsSync } from "node:fs";
import { join, relative, basename } from "node:path";

import { parseSpecFrontmatter } from "../meta-tools.mjs";
import { getCreationTimestamp } from "../git-timestamp.mjs";
import { loadManifest } from "../manifest.mjs";

/**
 * @typedef {Object} KindValidityFinding
 * @property {string} path - Project-root-relative path to the artifact.
 * @property {'spec'|'charter'} layer - Artifact layer.
 * @property {string|null} kind - The frontmatter kind value (or `null` when missing).
 * @property {'error'|'warn'|'info'} severity - Triage priority (does NOT gate exit).
 * @property {string} code - Finding code (see spec table).
 * @property {string} reason - Short human-readable explanation.
 * @property {string|null} timestampWarning - Non-null when the creation timestamp
 *   used for cutover classification came from mtime rather than git.
 */

/**
 * @typedef {Object} KindValidityResult
 * @property {KindValidityFinding[]} findings
 * @property {string[]} headerNotes - Pass-level advisories (e.g., manifest missing).
 */

/**
 * Default cutover ISO timestamp. Artifacts with a creation timestamp ≥ this
 * value and no explicit `kind:` field surface `MISSING_KIND` (warn); artifacts
 * created before this value surface `LEGACY_DEFAULTED` (info).
 *
 * The cutover defaults to the date this audit landed (2026-05-14T00:00:00Z).
 * Callers can override via `options.cutover`.
 */
const DEFAULT_CUTOVER = "2026-05-14T00:00:00.000Z";

/**
 * Run the kind-validity audit pass.
 *
 * @param {string} projectRoot - Absolute path to the project root.
 * @param {Object} [options]
 * @param {string} [options.cutover] - ISO 8601 cutover for MISSING_KIND vs LEGACY_DEFAULTED.
 * @param {string} [options.moduleFilter] - If set, restricts the audit to the
 *   given module slug (matches `features/<slug>/...` paths).
 * @returns {Promise<KindValidityResult>}
 */
export async function runKindValidityPass(projectRoot, options = {}) {
  const cutoverIso = options.cutover ?? DEFAULT_CUTOVER;
  const cutoverMs = Date.parse(cutoverIso);
  const findings = [];
  const headerNotes = [];

  // ── Load manifest (best-effort; missing/malformed downgrades to header note)
  let manifestModuleSlugs = null;
  try {
    const manifest = loadManifest(projectRoot);
    if (manifest && Array.isArray(manifest.modules)) {
      manifestModuleSlugs = new Set(
        manifest.modules.map((m) => m?.slug).filter(Boolean),
      );
    } else {
      headerNotes.push(
        "manifest.yaml is missing or has no modules[] — MODULE_KIND_NO_MANIFEST cross-reference skipped",
      );
    }
  } catch {
    headerNotes.push(
      "manifest.yaml could not be parsed — MODULE_KIND_NO_MANIFEST cross-reference skipped",
    );
  }

  // ── Discover artifacts
  const contextRoot = join(projectRoot, ".context-index");
  if (!existsSync(contextRoot)) {
    return { findings, headerNotes };
  }
  const artifacts = collectArtifacts(contextRoot, options.moduleFilter);

  // ── Emit findings per artifact
  for (const absPath of artifacts) {
    const relPath = relative(projectRoot, absPath);
    const layer = inferLayer(absPath);
    if (!layer) continue;

    let parsed;
    try {
      parsed = parseSpecFrontmatter(absPath);
    } catch (err) {
      // Per the spec's Failure Modes table, PARSE_ERROR fires when the
      // frontmatter parser *throws* (e.g., file is unreadable, malformed YAML
      // syntax error). The discriminator parser tolerates files without a
      // frontmatter fence by returning defaults — those surface downstream as
      // MISSING_KIND or LEGACY_DEFAULTED based on creation timestamp, not as
      // PARSE_ERROR. This matches the discriminator's read-time-defaulting
      // contract (see read-time-defaulting.spec.md).
      findings.push({
        path: relPath,
        layer,
        kind: null,
        severity: "error",
        code: "PARSE_ERROR",
        reason: `Frontmatter parse failed: ${err?.message ?? String(err)}`,
        timestampWarning: null,
      });
      continue;
    }

    // INVALID_KIND: kind: was present but value is outside the closed set.
    if (parsed.kindResolved === "explicit" && parsed.kindValid === false) {
      findings.push({
        path: relPath,
        layer,
        kind: parsed.kind,
        severity: "error",
        code: "INVALID_KIND",
        reason: `kind '${parsed.kind}' is not in the closed enumeration for layer '${layer}'`,
        timestampWarning: null,
      });
      continue;
    }

    // MISSING_KIND vs LEGACY_DEFAULTED: classify by creation timestamp.
    if (parsed.kindResolved === "default") {
      let createdAt;
      let timestampWarning = null;
      try {
        const ts = await getCreationTimestamp(absPath);
        createdAt = Date.parse(ts.timestamp);
        timestampWarning = ts.warning;
      } catch {
        // Should not happen — file is readable above — but fall back conservatively.
        createdAt = Date.now();
      }

      if (createdAt >= cutoverMs) {
        findings.push({
          path: relPath,
          layer,
          kind: null,
          severity: "warn",
          code: "MISSING_KIND",
          reason: "kind: field absent and artifact was created after the Layer 1 cutover",
          timestampWarning,
        });
      } else {
        findings.push({
          path: relPath,
          layer,
          kind: null,
          severity: "info",
          code: "LEGACY_DEFAULTED",
          reason: "kind: field absent and artifact predates the Layer 1 cutover (Layer 2 backfill)",
          timestampWarning,
        });
      }
      continue;
    }

    // MODULE_KIND_NO_MANIFEST: valid kind:module charter whose slug is not in manifest.
    if (
      layer === "charter" &&
      parsed.kindValid &&
      parsed.kind === "module" &&
      manifestModuleSlugs !== null
    ) {
      const slug = deriveModuleSlug(absPath);
      if (slug && !manifestModuleSlugs.has(slug)) {
        findings.push({
          path: relPath,
          layer,
          kind: parsed.kind,
          severity: "warn",
          code: "MODULE_KIND_NO_MANIFEST",
          reason: `charter declares kind:module but slug '${slug}' is not declared in manifest.yaml:modules[]`,
          timestampWarning: null,
        });
      }
    }
  }

  return { findings, headerNotes };
}

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Walk `.context-index/` and return absolute paths of every `*.spec.md` and
 * `charter.md` artifact. When `moduleFilter` is set, restricts to artifacts
 * under `features/<filter>/`.
 */
function collectArtifacts(contextRoot, moduleFilter) {
  const out = [];
  walk(contextRoot, out);
  if (moduleFilter) {
    const needle = `features/${moduleFilter}/`;
    return out.filter((p) => p.includes(needle));
  }
  return out;
}

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip vendored/build dirs defensively.
      if (entry.name === "node_modules" || entry.name.startsWith(".git")) continue;
      walk(full, out);
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      // Symlinks are included so broken-symlink artifacts surface as
      // PARSE_ERROR rather than being silently swallowed. Their readability is
      // the parser's responsibility.
      if (entry.name.endsWith(".spec.md") || entry.name === "charter.md") {
        out.push(full);
      }
    }
  }
}

function inferLayer(filePath) {
  if (filePath.endsWith(".spec.md")) return "spec";
  if (basename(filePath) === "charter.md") return "charter";
  return null;
}

/**
 * Derive the module slug from a charter path like
 * `.../specs/features/<slug>/charter.md`. Returns null if the shape does not match.
 */
function deriveModuleSlug(charterPath) {
  const parts = charterPath.split(/[\\/]/);
  const idx = parts.lastIndexOf("features");
  if (idx === -1 || idx + 1 >= parts.length - 1) return null;
  const candidate = parts[idx + 1];
  // Expect path to terminate in `<slug>/charter.md`.
  if (parts[parts.length - 1] !== "charter.md") return null;
  return candidate || null;
}

