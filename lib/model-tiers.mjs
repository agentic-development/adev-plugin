/**
 * Resolve a reviewer/subagent execution tier to a concrete model id.
 *
 * WHY THIS EXISTS. `lib/governance/dispatch-shape.mjs` and both harness adapters
 * already thread a `modelIdFromTier` callback through to `dispatch.modelId` — but
 * until now NO production caller supplied that callback, only a test. The result:
 * `modelId` was always `undefined`, every reviewer inherited the orchestrator's
 * session model, and `platform-context.yaml:model_tiers` was documentation that
 * nothing read. Two full review rounds ran with four of five reviewers above their
 * assigned tier before this was noticed (adev-plugin-reviewer-tier-not-applied-wohx).
 *
 * Pure Node.js built-ins (constitution principle 1); YAML via the in-tree parser.
 *
 * @module lib/model-tiers
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseYaml } from "./profiles/yaml.mjs";

/** Tier names the profile layer may ask for. */
export const KNOWN_TIERS = ["fast", "capable", "reasoning"];

/**
 * Read `model_tiers` from `.context-index/platform-context.yaml`.
 *
 * Absent file or absent key is NOT an error — it means the project has not
 * configured tiers, and callers fall back to the session model exactly as before.
 * Returning an empty map rather than throwing keeps tier resolution non-blocking.
 *
 * @param {string} projectRoot
 * @returns {Record<string, string>} tier -> model id (possibly empty)
 */
export function loadModelTiers(projectRoot) {
  const p = join(projectRoot, ".context-index", "platform-context.yaml");
  if (!existsSync(p)) return {};
  let doc;
  try {
    doc = parseYaml(readFileSync(p, "utf8"));
  } catch {
    return {};
  }
  const tiers = doc?.model_tiers;
  if (!tiers || typeof tiers !== "object") return {};
  const out = {};
  for (const [tier, model] of Object.entries(tiers)) {
    // Values carry trailing `# comment` prose in the shipped file; the parser
    // hands them back raw, so take the first whitespace-delimited token.
    if (typeof model !== "string") continue;
    const id = model.trim().split(/\s+/)[0];
    if (id) out[tier] = id;
  }
  return out;
}

/**
 * Build the `modelIdFromTier` callback that `prepareForDispatch` expects.
 *
 * @param {string} projectRoot
 * @returns {(tier: string) => string|undefined}
 */
export function modelIdFromTierFor(projectRoot) {
  const tiers = loadModelTiers(projectRoot);
  return (tier) => (tier ? tiers[tier] : undefined);
}

/**
 * Resolve the model a reviewer should be dispatched on.
 *
 * Returns `undefined` when the project configures no tier for it — the caller
 * then inherits the session model, which is the pre-existing behaviour.
 *
 * @param {{profile?: any}} reviewer registry entry
 * @param {Record<string, any>} profiles resolved profile map
 * @param {Record<string, string>} tiers tier -> model id
 * @returns {{tier: string|undefined, model: string|undefined}}
 */
export function resolveReviewerModel(reviewer, profiles, tiers) {
  const profName = typeof reviewer?.profile === "string" ? reviewer.profile : reviewer?.profile?.name;
  const tier = profiles?.[profName]?.model?.tier;
  return { tier, model: tier ? tiers[tier] : undefined };
}
