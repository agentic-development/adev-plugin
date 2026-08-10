// rigor-mode.mjs — Graduated rigor tiers for the gate skills.
//
// Resolves the effective "rigor mode" (full | quick) for /adev:review-specs and
// /adev:validate. `quick` never means "skip" — the gate still runs and emits its
// lifecycle event; it only narrows reviewer/check breadth. See
// .context-index/specs/cross-cutting/graduated-rigor-tiers.spec.md.
//
// Zero external deps (Node built-ins + the in-repo YAML parser).

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseYaml } from "../profiles/yaml.mjs";

export const RIGOR_MODES = Object.freeze(["full", "quick"]);
export const RISK_LEVELS = Object.freeze(["high", "medium", "low"]);

export class InvalidTierError extends Error {
  constructor(value) {
    super(
      `INVALID_TIER: '${value}' is not a valid rigor tier. Valid: ${RIGOR_MODES.join(", ")}.`,
    );
    this.name = "InvalidTierError";
    this.code = "INVALID_TIER";
    this.value = value;
  }
}

export function isValidTier(value) {
  return typeof value === "string" && RIGOR_MODES.includes(value);
}

// Read .context-index/governance/risk-policies.yaml and return its `policies`
// map, or null when the file is absent/unreadable (callers fall back to "full").
export function loadRigorPolicies(projectRoot) {
  const path = join(
    projectRoot,
    ".context-index",
    "governance",
    "risk-policies.yaml",
  );
  if (!existsSync(path)) return null;
  try {
    const parsed = parseYaml(readFileSync(path, "utf8")) ?? {};
    return parsed.policies ?? null;
  } catch {
    return null;
  }
}

// Resolve the effective rigor mode for a gate skill.
//
// Precedence (highest first):
//   1. tierOverride  — explicit `--tier full|quick`
//   2. routingEasy   — /adev:route or /adev:work marked the work "easy"
//   3. policy        — spec risk_level → risk-policies.yaml (review_mode|validate_mode)
//   4. "full"        — safe default
//
// `skill` is "validate" for the validate gate; anything else resolves against
// review_mode. Throws InvalidTierError on a malformed tierOverride.
export function resolveRigorMode({
  skill,
  riskLevel,
  policies,
  tierOverride,
  routingEasy,
} = {}) {
  if (tierOverride != null && tierOverride !== "") {
    if (!isValidTier(tierOverride)) throw new InvalidTierError(tierOverride);
    return tierOverride;
  }

  if (routingEasy === true) return "quick";

  const key = skill === "validate" ? "validate_mode" : "review_mode";
  const level = RISK_LEVELS.includes(riskLevel) ? riskLevel : "medium";
  const modeFromPolicy = policies?.[level]?.[key];
  if (isValidTier(modeFromPolicy)) return modeFromPolicy;

  return "full";
}
