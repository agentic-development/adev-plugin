// rigor-mode.mjs — Graduated rigor tiers for the gate skills and /adev:implement.
//
// Resolves the effective rigor mode (full | quick | lite). `quick` and `lite`
// never mean "skip": the gate still runs and emits its lifecycle event; they only
// narrow reviewer/check breadth. `lite` is meaningful to /adev:implement alone and
// every other skill receives it as `quick`. See
// .context-index/specs/cross-cutting/graduated-rigor-tiers.spec.md.
//
// Zero external deps (Node built-ins + the in-repo YAML parser).

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseYaml } from "../profiles/yaml.mjs";

export const RIGOR_MODES = Object.freeze(["full", "quick", "lite"]);
export const RISK_LEVELS = Object.freeze(["high", "medium", "low"]);
export const TEST_DEPTHS = Object.freeze(["minimal", "standard", "thorough"]);

const POLICY_MODE_FIELDS = Object.freeze(["review_mode", "validate_mode", "implement_mode"]);

function describeLocation({ file, level, field }) {
  const where = level && field ? `${level}.${field}` : (level ?? field);
  return [where, file].filter(Boolean).join(" in ");
}

export class InvalidTierError extends Error {
  // `context` names where a policy value came from, so an operator can find it;
  // `context.detail` replaces the value sentence for a file that does not parse.
  constructor(value, context = {}) {
    const { file, level, field, detail } = context;
    const location = describeLocation({ file, level, field });
    const head = detail ?? `'${value}' is not a valid rigor tier`;
    super(
      `INVALID_TIER: ${head}${location ? ` (${location})` : ""}. Valid: ${RIGOR_MODES.join(", ")}.`,
    );
    this.name = "InvalidTierError";
    this.code = "INVALID_TIER";
    this.value = value;
    if (file !== undefined) this.file = file;
    if (level !== undefined) this.level = level;
    if (field !== undefined) this.field = field;
  }
}

export function isValidTier(value) {
  return typeof value === "string" && RIGOR_MODES.includes(value);
}

// Parse and validate risk-policies YAML text; `label` names its origin (a file
// path, or a commit-qualified path for text read from git) in every error.
// Returns the `policies` map, or null when the document declares none.
// Throws:
//   - InvalidTierError (INVALID_TIER) when the text does not parse, `policies`
//     is not a mapping, or a review_mode / validate_mode / implement_mode value
//     is outside RIGOR_MODES (exact, case-sensitive match);
//   - LITE_NOT_ALLOWED_FOR_HIGH when high.implement_mode is `lite`, because
//     high-risk specs are never implemented without per-task review;
//   - INVALID_TEST_DEPTH when a test_depth value is outside TEST_DEPTHS.
export function parseRigorPolicies(text, label) {
  let parsed;
  try {
    parsed = parseYaml(text) ?? {};
  } catch (err) {
    throw new InvalidTierError(undefined, {
      file: label,
      detail: `risk-policies file does not parse (${err?.message ?? String(err)})`,
    });
  }
  const policies = parsed?.policies ?? null;
  if (policies === null) return null;
  if (typeof policies !== "object" || Array.isArray(policies)) {
    throw new InvalidTierError(undefined, {
      file: label,
      detail: "risk-policies file does not parse (`policies` is not a mapping)",
    });
  }
  for (const [level, entry] of Object.entries(policies)) {
    for (const field of POLICY_MODE_FIELDS) {
      const value = entry?.[field];
      if (value != null && !isValidTier(value)) {
        throw new InvalidTierError(value, { file: label, level, field });
      }
    }
    const depth = entry?.test_depth;
    if (depth != null && !TEST_DEPTHS.includes(depth)) {
      throw new Error(
        `INVALID_TEST_DEPTH: '${depth}' (${label}) — legal set: ${TEST_DEPTHS.join(", ")}`,
      );
    }
  }
  if (policies.high?.implement_mode === "lite") {
    const err = new Error(
      `LITE_NOT_ALLOWED_FOR_HIGH: high.implement_mode is 'lite' in ${label}; ` +
        "set it to 'quick' or 'full'.",
    );
    err.code = "LITE_NOT_ALLOWED_FOR_HIGH";
    err.file = label;
    throw err;
  }
  return policies;
}

// Read .context-index/governance/risk-policies.yaml and return its validated
// `policies` map, or null when the file is absent. A present file goes through
// parseRigorPolicies, so a malformed one throws rather than silently degrading.
export function loadRigorPolicies(projectRoot) {
  const path = join(
    projectRoot,
    ".context-index",
    "governance",
    "risk-policies.yaml",
  );
  if (!existsSync(path)) return null;
  return parseRigorPolicies(readFileSync(path, "utf8"), path);
}

// Resolve the effective rigor mode for a gate skill or /adev:implement.
//
// Precedence (highest first):
//   1. tierOverride  — explicit `--tier full|quick|lite`
//   2. routingEasy   — /adev:route or /adev:work marked the work "easy"
//                      (never consulted for skill === "implement")
//   3. policy        — spec risk_level → risk-policies.yaml
//                      (review_mode | validate_mode | implement_mode)
//   4. fallback      — "quick" for implement; "full" for every other skill
//
// `skill` is "validate" -> validate_mode, "implement" -> implement_mode,
// anything else resolves against review_mode. Only implement can return
// "lite"; for every other skill a resolved "lite" is returned as "quick".
// Throws InvalidTierError on a malformed tierOverride.
export function resolveRigorMode({
  skill,
  riskLevel,
  policies,
  tierOverride,
  routingEasy,
} = {}) {
  const mode = resolveRawMode({ skill, riskLevel, policies, tierOverride, routingEasy });
  return mode === "lite" && skill !== "implement" ? "quick" : mode;
}

function resolveRawMode({ skill, riskLevel, policies, tierOverride, routingEasy }) {
  if (tierOverride != null && tierOverride !== "") {
    if (!isValidTier(tierOverride)) throw new InvalidTierError(tierOverride);
    return tierOverride;
  }

  if (routingEasy === true && skill !== "implement") return "quick";

  const key =
    skill === "validate" ? "validate_mode" :
    skill === "implement" ? "implement_mode" :
    "review_mode";
  const level = RISK_LEVELS.includes(riskLevel) ? riskLevel : "medium";
  const modeFromPolicy = policies?.[level]?.[key];
  if (isValidTier(modeFromPolicy)) return modeFromPolicy;

  return skill === "implement" ? "quick" : "full";
}
