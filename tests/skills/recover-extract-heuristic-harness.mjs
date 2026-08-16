/**
 * Step 7 "Extract Heuristic" harness.
 *
 * Implements the derivation logic documented in
 * `skills/recover/SKILL.md` Step 7 as a reusable JavaScript function so
 * the contract can be exercised from tests. The harness is NOT wired into
 * `/adev:recover` at runtime — the skill documents the logic in markdown
 * and expects an inline Node invocation. This module exists to give the
 * test suite a single, assertable implementation of the same derivation
 * rules.
 *
 * Responsibilities:
 * 1. Validate the recovery context.
 * 2. Derive `scope` from the active plan path (with `_global` fallback).
 * 3. Derive `title` as "<Category label>: <short summary>" (≤120 chars).
 * 4. Derive `id` as `<category-slug>-<sha256-prefix-8>` using the
 *    documented normalization.
 * 5. Enforce distillation discipline — pattern/antiPattern/title must
 *    NOT contain any of the caller-supplied guard strings (e.g., raw
 *    credentials, API keys, env-specific literals). Violations THROW.
 * 6. Invoke `writeHeuristic(projectRoot, entry)` and return its result.
 *
 * @module tests/skills/recover-extract-heuristic-harness
 */

import {
  writeHeuristic,
  deriveDigest,
  normalizeFailureText,
} from "../../lib/heuristics.mjs";

/**
 * Map of diagnosis category to human-readable label used as the title prefix.
 * @type {Record<string, string>}
 */
export const CATEGORY_LABELS = {
  MISSING_CONTEXT: "Missing context",
  AMBIGUOUS_SPEC: "Ambiguous spec",
  CONSTRAINT_CONFLICT: "Constraint conflict",
  NOVEL_PROBLEM: "Novel problem",
  TOOL_FAILURE: "Tool failure",
  BUDGET_EXHAUSTION: "Budget exhaustion",
};

/**
 * Map of diagnosis category to kebab id-slug (used as `<category-slug>` in
 * the generated heuristic id).
 * @type {Record<string, string>}
 */
export const CATEGORY_ID_SLUGS = {
  MISSING_CONTEXT: "missing-context",
  AMBIGUOUS_SPEC: "ambiguous-spec",
  CONSTRAINT_CONFLICT: "constraint-conflict",
  NOVEL_PROBLEM: "novel-problem",
  TOOL_FAILURE: "tool-failure",
  BUDGET_EXHAUSTION: "budget-exhaustion",
};

/**
 * Hard cap on the total title length (matches the heuristics schema).
 */
const TITLE_MAX_LENGTH = 120;

/**
 * Default distillation guards. These are common secret/credential patterns
 * that must never appear verbatim in a heuristic entry. Callers may extend
 * this list via `context.distillationGuards`.
 *
 * The patterns here match the LITERAL text — the harness scans
 * `title`/`pattern`/`antiPattern` for each one. Regex guards can be
 * supplied as strings and will be compiled as regexes when they start
 * with `re:`.
 * @type {string[]}
 */
const DEFAULT_DISTILLATION_GUARDS = [
  "re:AKIA[0-9A-Z]{16}", // AWS access key id
  "re:api[_-]?key\\s*=", // bare `api_key=` / `api-key=` assignments
  "re:secret\\s*=", // bare `secret=` assignments
  "re:password\\s*=", // bare `password=` assignments
  "re:token\\s*=", // bare `token=` assignments
  "re:Bearer\\s+[A-Za-z0-9._-]{16,}", // Bearer <token>
];

/**
 * Normalize a root-cause text string.
 *
 * Re-exported from `lib/heuristics.mjs` — the harness no longer holds a
 * private copy. The name is kept because it is the vocabulary Step 7's prose
 * uses; the rule (lowercase → strip punctuation except `-`/`_` → collapse
 * whitespace → trim) is identical, so ids are byte-identical across the
 * convergence.
 *
 * @param {string} text
 * @returns {string}
 */
export const normalizeRootCause = normalizeFailureText;

/**
 * Derive the heuristic id from the category and normalized root-cause text.
 *
 * Only the hashing moved to the shared digest function — the harness keeps its
 * `CATEGORY_ID_SLUGS` prefix composition, because the prefix is caller-supplied
 * and is never determined by the origin (spec Behavior 7a).
 *
 * `deriveDigest` applies `normalizeFailureText` internally, and that normalizer
 * is idempotent, so the argument may be raw or already-normalized root-cause
 * text and the digest is the same either way.
 *
 * @param {string} category
 * @param {string} rootCauseText - Root-cause text; normalization is applied internally.
 * @returns {string}
 */
export function deriveId(category, rootCauseText) {
  const slug = CATEGORY_ID_SLUGS[category];
  if (!slug) {
    throw new Error(`extract-heuristic: unknown category '${category}'`);
  }
  return `${slug}-${deriveDigest(rootCauseText, normalizeFailureText)}`;
}

/**
 * Derive the heuristic title from the category label and a short summary,
 * enforcing the 120-character cap by truncating the summary (not the label).
 *
 * @param {string} category
 * @param {string} shortSummary
 * @returns {string}
 */
export function deriveTitle(category, shortSummary) {
  const label = CATEGORY_LABELS[category];
  if (!label) {
    throw new Error(`extract-heuristic: unknown category '${category}'`);
  }
  const prefix = `${label}: `;
  const available = TITLE_MAX_LENGTH - prefix.length;
  let summary = (shortSummary || "").trim();
  if (summary.length > available) {
    summary = summary.slice(0, available).trimEnd();
  }
  return `${prefix}${summary}`;
}

/**
 * Derive the heuristic scope from the active plan path.
 *
 * Walks the plan path segments to find the one immediately after
 * `features/`, runs it through a basename-style strip, and checks it
 * against the supplied module slug list. Falls back to `_global` if no
 * match is found.
 *
 * @param {string} planPath - e.g. `.context-index/specs/features/hooks/foo.plan.md`
 * @param {string[]} knownModules - module slugs from manifest.yaml
 * @returns {string}
 */
export function deriveScope(planPath, knownModules) {
  if (typeof planPath !== "string" || planPath.length === 0) {
    return "_global";
  }
  const parts = planPath.split("/").filter((p) => p.length > 0);
  const featuresIdx = parts.indexOf("features");
  if (featuresIdx === -1 || featuresIdx + 1 >= parts.length) {
    return "_global";
  }
  let segment = parts[featuresIdx + 1];
  // path.basename-style strip (defence-in-depth; parts are already split).
  segment = segment.replace(/\\/g, "/").split("/").pop() || "";
  // Strip any traversal prefixes.
  segment = segment.replace(/^\.+/, "");
  if (!segment) return "_global";
  if (Array.isArray(knownModules) && knownModules.includes(segment)) {
    return segment;
  }
  return "_global";
}

/**
 * Compile a guard string into a test function.
 * A guard starting with `re:` is compiled as a regex (case-insensitive);
 * anything else is treated as a literal substring match.
 * @param {string} guard
 * @returns {(text: string) => boolean}
 */
function compileGuard(guard) {
  if (typeof guard !== "string" || guard.length === 0) {
    return () => false;
  }
  if (guard.startsWith("re:")) {
    const re = new RegExp(guard.slice(3), "i");
    return (text) => re.test(text);
  }
  return (text) => text.includes(guard);
}

/**
 * Scan produced fields for guard violations. Throws a detailed Error if any
 * guard is present in `title`, `pattern`, or `antiPattern`.
 *
 * @param {{title: string, pattern: string, antiPattern?: string}} fields
 * @param {string[]} guards
 */
export function assertDistilled(fields, guards) {
  const targets = [
    ["title", fields.title || ""],
    ["pattern", fields.pattern || ""],
    ["antiPattern", fields.antiPattern || ""],
  ];
  const compiledGuards = guards.map((g) => ({ guard: g, test: compileGuard(g) }));
  for (const [name, text] of targets) {
    for (const { guard, test } of compiledGuards) {
      if (test(text)) {
        const err = new Error(
          `extract-heuristic: distillation guard violated — '${guard}' matched field '${name}'`,
        );
        err.code = "DISTILLATION_GUARD_VIOLATION";
        throw err;
      }
    }
  }
}

/**
 * @typedef {Object} RecoveryContext
 * @property {string} category - MISSING_CONTEXT | AMBIGUOUS_SPEC | CONSTRAINT_CONFLICT | NOVEL_PROBLEM | TOOL_FAILURE | BUDGET_EXHAUSTION
 * @property {string} rootCauseText - Normalized-ish distilled description of the root cause (used for id hash and as short title summary).
 * @property {string} pattern - Distilled pattern guidance (caller-provided; harness does NOT read raw recovery text).
 * @property {string} [antiPattern] - Distilled anti-pattern guidance. Empty string for NOVEL_PROBLEM.
 * @property {string} planPath - Active plan path for scope derivation.
 * @property {string} recoveryRecordPath - Relative path to the Step 6 recovery record.
 * @property {string} date - Today's date in YYYY-MM-DD format.
 * @property {string[]} modules - Known module slugs from manifest.yaml.
 * @property {string[]} [distillationGuards] - Extra guards appended to the default list. Literal substrings or `re:<regex>`.
 */

/**
 * Run the Step 7 extraction against a temp project and return the
 * resulting heuristic entry.
 *
 * The caller is responsible for supplying already-distilled
 * `pattern`/`antiPattern` text — the harness never reads the raw
 * recovery document. Distillation discipline is enforced as an active
 * guard: any guard-string match in the derived fields throws before
 * `writeHeuristic` is called.
 *
 * @param {string} projectRoot - Absolute project root.
 * @param {RecoveryContext} context
 * @returns {Promise<import("../../../lib/heuristics.mjs").Heuristic>}
 */
export async function extractHeuristic(projectRoot, context) {
  if (!context || typeof context !== "object") {
    throw new Error("extract-heuristic: context is required");
  }
  const {
    category,
    rootCauseText,
    pattern,
    antiPattern = "",
    planPath,
    recoveryRecordPath,
    date,
    modules,
    distillationGuards = [],
  } = context;

  if (!CATEGORY_LABELS[category]) {
    throw new Error(`extract-heuristic: unknown category '${category}'`);
  }
  if (typeof rootCauseText !== "string" || rootCauseText.trim().length === 0) {
    throw new Error("extract-heuristic: rootCauseText is required");
  }
  if (typeof pattern !== "string" || pattern.length === 0) {
    throw new Error("extract-heuristic: pattern is required (must be distilled by caller)");
  }
  if (typeof recoveryRecordPath !== "string" || recoveryRecordPath.length === 0) {
    throw new Error("extract-heuristic: recoveryRecordPath is required");
  }
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("extract-heuristic: date must be YYYY-MM-DD");
  }
  if (category === "NOVEL_PROBLEM" && antiPattern !== "") {
    throw new Error("extract-heuristic: NOVEL_PROBLEM must have empty antiPattern");
  }

  const normalized = normalizeRootCause(rootCauseText);
  if (normalized.length === 0) {
    throw new Error("extract-heuristic: rootCauseText normalized to empty string");
  }

  const id = deriveId(category, normalized);
  const title = deriveTitle(category, rootCauseText);
  const scope = deriveScope(planPath, modules || []);

  // Active distillation enforcement — runs BEFORE writeHeuristic so that
  // guard violations cause the harness to throw, not silently persist.
  const guards = [...DEFAULT_DISTILLATION_GUARDS, ...distillationGuards];
  assertDistilled({ title, pattern, antiPattern }, guards);

  /** @type {import("../../../lib/heuristics.mjs").Heuristic} */
  const entry = {
    id,
    scope,
    title,
    pattern,
    confidence: "low",
    evidence: [
      {
        path: recoveryRecordPath,
        date,
        source: "recovery",
      },
    ],
  };

  if (antiPattern && antiPattern.length > 0) {
    entry.antiPattern = antiPattern;
  }

  return writeHeuristic(projectRoot, entry);
}
