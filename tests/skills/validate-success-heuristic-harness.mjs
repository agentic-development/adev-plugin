/**
 * Check 13 "Success Heuristic Extraction" harness.
 *
 * Implements the derivation logic documented in
 * `skills/validate/SKILL.md` Check 13 as a reusable JavaScript function
 * so the contract can be exercised from tests. The harness is NOT wired
 * into `/adev:validate` at runtime — the skill documents the logic in
 * markdown and expects an inline Node invocation. This module exists to
 * give the test suite a single, assertable implementation of the same
 * derivation rules.
 *
 * Responsibilities:
 * 1. Validate preconditions — non-PASS, missing charter scope, missing
 *    report path, invalid spec slug all return SKIP (never throw).
 * 2. Enforce first-run gate — the presence of a sibling
 *    `<spec-slug>-validation.md` file causes SKIP `"not first-run PASS"`.
 * 3. Derive spec-slug, scope, title, id, and pattern per the SKILL rules.
 * 4. Call `writeHeuristic(projectRoot, entry)` with a single
 *    `source: "validation"` evidence entry at `confidence: "medium"`.
 * 5. Translate any thrown error from `writeHeuristic` into a SKIP.
 *
 * The harness accepts a `simulateHelperUnavailable: boolean` flag so
 * tests can exercise the "helper unavailable" SKIP path without having
 * to fail a dynamic import (the real helper module is always available
 * in the test environment).
 *
 * @module tests/skills/validate-success-heuristic-harness
 */

import { existsSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";
import { writeHeuristic, deriveHeuristicId } from "../../lib/heuristics.mjs";

/**
 * Hard cap on the total title length (matches the heuristics schema).
 */
const TITLE_MAX_LENGTH = 120;

/**
 * Hard cap on the pattern length (matches the heuristics schema).
 */
const PATTERN_MAX_LENGTH = 500;

/**
 * @typedef {Object} Check12Context
 * @property {string} specPath - Absolute path to the target spec file.
 * @property {string} charter - Charter slug from the spec's frontmatter (empty string if absent).
 * @property {string} specTitle - The target spec's `# ...` heading with any leading `Live Spec: ` prefix stripped.
 * @property {string} reportPath - Absolute path to the validation report (may be `""` if unresolvable).
 * @property {Map<string, boolean>|Record<string, boolean>} checkResults - Map of check id → pass (e.g., `{"1": true, "2": true, ...}`).
 * @property {string[]} modules - Known module slugs from manifest.yaml.
 * @property {string} date - Today's date in YYYY-MM-DD format.
 * @property {string} [successFactor] - Optional explicit, distilled pattern text that overrides the default.
 * @property {boolean} [simulateHelperUnavailable] - If true, return SKIP `"helper unavailable"` immediately.
 */

/**
 * @typedef {Object} Check12Result
 * @property {'PASS'|'SKIP'} status
 * @property {import("../../lib/heuristics.mjs").Heuristic} [heuristic] - Only present when status is PASS.
 * @property {string} [reason] - Only present when status is SKIP.
 */

/**
 * Derive the spec-slug from an absolute spec path.
 *
 * basename(path, '.md') → lowercase → non-alphanumeric to `-` → collapse
 * consecutive `-` → strip leading/trailing `-`.
 *
 * @param {string} specPath
 * @returns {string}
 */
export function deriveSpecSlug(specPath) {
  if (typeof specPath !== "string" || specPath.length === 0) return "";
  const stem = basename(specPath, ".md");
  if (!stem) return "";
  let slug = stem.toLowerCase();
  slug = slug.replace(/[^a-z0-9]+/g, "-");
  slug = slug.replace(/-+/g, "-");
  slug = slug.replace(/^-+|-+$/g, "");
  return slug;
}

/**
 * Derive the heuristic scope from the charter slug and known module list.
 * Falls back to `"_global"` when charter is empty or unrecognized.
 *
 * @param {string} charter
 * @param {string[]} modules
 * @returns {string}
 */
export function deriveScope(charter, modules) {
  if (typeof charter !== "string" || charter.length === 0) return "_global";
  // Apply path.basename-style strip as a defence-in-depth.
  const cleaned = basename(charter.replace(/\\/g, "/"));
  if (!cleaned) return "_global";
  if (Array.isArray(modules) && modules.includes(cleaned)) {
    return cleaned;
  }
  return "_global";
}

/**
 * Derive the title `"First-run PASS: <spec-title>"`, capped at 120 chars.
 * If the full title is longer than 120 chars, the spec-title portion is
 * truncated to 117 chars and `"..."` is appended.
 *
 * @param {string} specTitle
 * @returns {string}
 */
export function deriveTitle(specTitle) {
  const prefix = "First-run PASS: ";
  const safeSpecTitle = typeof specTitle === "string" ? specTitle : "";
  const full = `${prefix}${safeSpecTitle}`;
  if (full.length <= TITLE_MAX_LENGTH) {
    return full;
  }
  // Truncate the spec-title portion to 117 chars total (prefix + 117
  // chars + "..." equals 120 when prefix is empty; when prefix exists
  // the composite is capped at 120).
  const available = TITLE_MAX_LENGTH - 3; // reserve for "..."
  return full.slice(0, available) + "...";
}

/**
 * Derive the heuristic id: `<spec-slug>-<8-char hex sha256>` over the hash
 * input `<repo-relative-spec-path>|<pattern>`.
 *
 * The path argument is **repo-relative**, not absolute. Hashing the absolute
 * path made the same spec produce a different id in every checkout, which made
 * `writeHeuristic` append a duplicate entry instead of a second evidence
 * reference. Delegates to the shared digest function rather than hashing here.
 *
 * @param {string} specSlug
 * @param {string} repoRelativePath
 * @param {string} pattern
 * @returns {string}
 */
export function deriveId(specSlug, repoRelativePath, pattern) {
  return deriveHeuristicId(specSlug, repoRelativePath, pattern);
}

/**
 * Convert a spec path to its repo-relative form, normalizing separators to
 * `/` so two checkouts on different platforms agree.
 *
 * @param {string} projectRoot - Absolute project root.
 * @param {string} specPath - Absolute or already-relative spec path.
 * @returns {string}
 */
function toRepoRelative(projectRoot, specPath) {
  if (!isAbsolute(specPath)) return specPath.split(sep).join("/");
  return relative(projectRoot, specPath).split(sep).join("/");
}

/**
 * Derive the default pattern text when no explicit successFactor was
 * provided. Caps the result at the pattern schema limit (500 chars).
 *
 * @param {string} specTitle
 * @returns {string}
 */
export function deriveDefaultPattern(specTitle) {
  const safeSpecTitle = typeof specTitle === "string" ? specTitle : "";
  const text = `First-run PASS for ${safeSpecTitle}: implementation matched all acceptance criteria without revision`;
  if (text.length <= PATTERN_MAX_LENGTH) return text;
  return text.slice(0, PATTERN_MAX_LENGTH);
}

/**
 * Check whether every value in `checkResults` is truthy.
 * Accepts either a Map or a plain object.
 *
 * @param {Map<string, boolean>|Record<string, boolean>|undefined|null} checkResults
 * @returns {boolean}
 */
function allChecksPassed(checkResults) {
  if (!checkResults) return false;
  const values =
    checkResults instanceof Map ? Array.from(checkResults.values()) : Object.values(checkResults);
  if (values.length === 0) return false;
  return values.every((v) => v === true);
}

/**
 * Detect whether a prior validation report exists next to the spec.
 * A validation is "first run" iff no sibling `<spec-slug>-validation.md`
 * exists.
 *
 * @param {string} specPath
 * @param {string} specSlug
 * @returns {boolean} true if a prior report exists (i.e., NOT first run).
 */
function priorValidationReportExists(specPath, specSlug) {
  const dir = dirname(specPath);
  const candidate = join(dir, `${specSlug}-validation.md`);
  return existsSync(candidate);
}

/**
 * Run Check 13 per `skills/validate/SKILL.md`.
 *
 * Returns a structured result rather than throwing, because Check 13 is
 * observational and must never affect the overall validation verdict.
 *
 * @param {string} projectRoot - Absolute project root.
 * @param {Check12Context} context
 * @returns {Promise<Check12Result>}
 */
export async function runCheck12(projectRoot, context) {
  if (!context || typeof context !== "object") {
    return { status: "SKIP", reason: "missing context" };
  }

  // 1. All checks must have passed.
  if (!allChecksPassed(context.checkResults)) {
    return { status: "SKIP", reason: "non-PASS result" };
  }

  // 2. Charter must be non-empty (regardless of whether it maps to a
  //    known module — scope fallback to `_global` is handled separately
  //    once we decide a scope is allowed).
  if (typeof context.charter !== "string" || context.charter.length === 0) {
    return { status: "SKIP", reason: "no charter scope" };
  }

  // 3. Validation report path must be non-empty.
  if (typeof context.reportPath !== "string" || context.reportPath.length === 0) {
    return { status: "SKIP", reason: "no report path" };
  }

  // 4. Spec path must be present and produce a non-empty slug.
  if (typeof context.specPath !== "string" || context.specPath.length === 0) {
    return { status: "SKIP", reason: "invalid spec slug" };
  }
  const specSlug = deriveSpecSlug(context.specPath);
  if (!specSlug) {
    return { status: "SKIP", reason: "invalid spec slug" };
  }

  // 5. First-run gate: sibling `<spec-slug>-validation.md` must NOT exist.
  if (priorValidationReportExists(context.specPath, specSlug)) {
    return { status: "SKIP", reason: "not first-run PASS" };
  }

  // 6. Simulated helper-unavailable path (used by tests to exercise the
  //    SKIP reason without having to fail a real dynamic import).
  if (context.simulateHelperUnavailable === true) {
    return { status: "SKIP", reason: "helper unavailable" };
  }

  // 7. Derive the remaining fields.
  const scope = deriveScope(context.charter, context.modules || []);
  const title = deriveTitle(context.specTitle || "");
  const pattern =
    typeof context.successFactor === "string" && context.successFactor.length > 0
      ? context.successFactor.slice(0, PATTERN_MAX_LENGTH)
      : deriveDefaultPattern(context.specTitle || "");
  const id = deriveId(specSlug, toRepoRelative(projectRoot, context.specPath), pattern);

  /** @type {import("../../lib/heuristics.mjs").Heuristic} */
  const entry = {
    id,
    scope,
    title,
    pattern,
    antiPattern: "",
    confidence: "medium",
    evidence: [
      {
        path: context.reportPath,
        date: context.date,
        source: "validation",
      },
    ],
  };

  // 8. Write. Any throw from writeHeuristic degrades to a SKIP with the
  //    error message (matches the inline Node invocation in SKILL.md).
  try {
    const heuristic = await writeHeuristic(projectRoot, entry);
    return { status: "PASS", heuristic };
  } catch (err) {
    return {
      status: "SKIP",
      reason: (err && err.message) || "writeHeuristic failed",
    };
  }
}
