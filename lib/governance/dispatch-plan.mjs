/**
 * The full reviewer dispatch plan for one target spec: registry → selection →
 * per-reviewer `buildReviewerDispatches` → Agent-ready dispatch records.
 *
 * `adev governance dispatch` is a thin wrapper over `buildDispatchPlan`. It
 * exists so `/adev:review-specs` Step 4 never assembles a reviewer prompt
 * itself: every prompt block `buildReviewerDispatches` owns (provenance
 * preamble, manifest read contract, heuristics, truncated-context rule,
 * prior-round review, fenced target spec) reaches the reviewer only if the
 * orchestrator passes the prompt this module returns through unchanged.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { loadReviewConfig, shouldDispatch } from "./review-config.mjs";
import { buildReviewerDispatches } from "./dispatch-shape.mjs";
import { loadPriorReview } from "./prior-review.mjs";
import { resolveDiffScope } from "./diff-scope-decision.mjs";
import { modelIdFromTierFor } from "../model-tiers.mjs";
import { getPluginRoot } from "../profiles/index.mjs";
import * as claudeCodeAdapter from "../profiles/adapters/claude-code.mjs";
import * as openCodeAdapter from "../profiles/adapters/opencode.mjs";

export const HARNESS_ADAPTERS = Object.freeze({
  "claude-code": claudeCodeAdapter,
  opencode: openCodeAdapter,
});

export const QUICK_REVIEWER_ID = "quick-synthesized-reviewer";
const QUICK_PROMPT_REL = join("skills", "review-specs", "quick-synthesized-reviewer-prompt.md");

/**
 * @param {string} absRoot   absolute project root
 * @param {{
 *   specPath: string,          project-relative, already validated (.spec.md, inside root, exists)
 *   absSpec: string,
 *   tier?: "full"|"quick",
 *   harness?: string,
 *   heuristics?: string,       pre-rendered heuristics text; empty for none
 *   notes?: string[],          orchestrator notes (e.g. cross-repo dependency warnings)
 *   pluginRoot?: string,
 * }} opts
 * @returns {{
 *   spec: string,
 *   tier: "full"|"quick",
 *   harness: string,
 *   diff_scope: { scoped: boolean, reason: string, changed_anchors: string[] },
 *   prior_review: { path: string, verdict: string|null, revision: number|null } | null,
 *   reviewers: Array<{ id: string, name: string, dispatched: boolean, reason: string, severity_cap: string }>,
 *   dispatches: Array<{
 *     reviewer_id: string,
 *     stage: "subagent"|"runner"|"adapter",
 *     description: string,
 *     prompt: string,
 *     model: string|null,
 *     allowed_tools: string[],
 *     env_keys: string[],
 *     prompt_source: string,
 *     append_runner_output: boolean,
 *   }>,
 *   warnings: {code: string, message: string}[],
 *   errors: {code: string, message: string}[],
 * }}
 */
export function buildDispatchPlan(absRoot, opts) {
  const tier = opts.tier ?? "full";
  const harness = opts.harness ?? "claude-code";
  const pluginRoot = opts.pluginRoot ?? getPluginRoot();
  const warnings = [];
  const errors = [];

  const envelope = {
    spec: opts.specPath,
    tier,
    harness,
    diff_scope: { scoped: false, reason: "first-review", changed_anchors: [] },
    prior_review: null,
    reviewers: [],
    dispatches: [],
    warnings,
    errors,
  };

  const adapter = HARNESS_ADAPTERS[harness];
  if (!adapter) {
    errors.push({
      code: "UNKNOWN_HARNESS",
      message: `Unknown harness '${harness}'. Known: ${Object.keys(HARNESS_ADAPTERS).join(", ")}.`,
    });
    return envelope;
  }

  // Throws REGISTRY_NOT_MATERIALIZED; the caller reports it.
  const cfg = loadReviewConfig(absRoot, { pluginRoot });
  warnings.push(...cfg.warnings);
  errors.push(...cfg.errors);
  if (cfg.errors.length > 0) return envelope;

  const fullText = readFileSync(opts.absSpec, "utf8");
  const scope = resolveDiffScope(absRoot, opts.specPath, opts.absSpec);
  envelope.diff_scope = {
    scoped: scope.scoped,
    reason: scope.reason,
    changed_anchors: scope.changed_anchors,
  };
  const specContent = scope.scoped ? scope.content : fullText;

  // Read once and shared by every reviewer, so the whole panel sees the same
  // prior round even if the file changes mid-plan.
  const priorReview = loadPriorReview(absRoot, opts.specPath);
  if (priorReview) {
    envelope.prior_review = {
      path: priorReview.path,
      verdict: priorReview.verdict,
      revision: priorReview.revision,
    };
  }

  let selected;
  if (tier === "quick") {
    const quick = quickReviewer(cfg, pluginRoot);
    if (!quick) {
      errors.push({
        code: "QUICK_PROMPT_MISSING",
        message: `Quick-tier prompt not found at ${join(pluginRoot, QUICK_PROMPT_REL)}; refusing to fall back to a weaker review.`,
      });
      return envelope;
    }
    selected = [quick];
    envelope.reviewers.push(selectionRow(quick, true, "quick-tier"));
  } else {
    selected = [];
    for (const reviewer of cfg.reviewers ?? []) {
      // The quick-tier entry is declared `dispatch: never` only so severity
      // resolution can find it; a full-tier run never selects it.
      const decision = shouldDispatch(reviewer, { targetSpecPath: opts.specPath, specContent });
      envelope.reviewers.push(selectionRow(reviewer, decision.dispatch, decision.reason));
      if (decision.dispatch) selected.push(reviewer);
    }
  }

  const modelIdFromTier = modelIdFromTierFor(absRoot);
  for (const reviewer of selected) {
    const built = buildReviewerDispatches(reviewer, {
      profiles: cfg.profiles,
      contextPacks: cfg.contextPacks,
      consumerRepoRoot: absRoot,
      adapter,
      targetSpecPath: opts.specPath,
      targetSpecContent: specContent,
      modelIdFromTier,
      priorReview,
      heuristics: opts.heuristics ?? "",
      notes: opts.notes ?? [],
    });
    for (const w of built.warnings) warnings.push(tagged(w, reviewer.id));
    for (const e of built.errors) errors.push(tagged(e, reviewer.id));
    for (const d of built.dispatches) {
      envelope.dispatches.push({
        reviewer_id: d.reviewerId,
        stage: d.stage,
        description: d.description,
        prompt: d.prompt,
        model: d.modelId ?? null,
        allowed_tools: d.allowedTools ?? [],
        // Values are withheld: env may carry secrets, and an Agent dispatch
        // cannot set env anyway.
        env_keys: Object.keys(d.env ?? {}),
        prompt_source: d.promptSource ?? "",
        append_runner_output: d.stage === "adapter",
      });
    }
  }

  return envelope;
}

/**
 * The quick-tier synthesized reviewer. A registry entry with this id (the
 * domain template declares one, `dispatch: never`) supplies its fields; the
 * bundled prompt and `reviewer-capable` profile fill the rest. Its pack is the
 * entry's own, else `review-base` (charter + sibling specs) when the project
 * declares it, else `base`.
 */
function quickReviewer(cfg, pluginRoot) {
  const entry = (cfg.reviewers ?? []).find((r) => r.id === QUICK_REVIEWER_ID) ?? {};
  const promptPath = entry.promptPath ?? join(pluginRoot, QUICK_PROMPT_REL);
  if (!existsSync(promptPath)) return null;
  const contextPack =
    entry.context_pack ?? (cfg.contextPacks?.["review-base"] ? "review-base" : "base");
  return {
    id: QUICK_REVIEWER_ID,
    name: entry.name ?? "Quick Synthesized Reviewer",
    mode: "subagent",
    promptPath,
    promptDisplay: entry.promptDisplay ?? "plugin:review-specs/quick-synthesized-reviewer-prompt.md",
    profile: entry.profile ?? "reviewer-capable",
    context_pack: contextPack,
    severity_cap: entry.severity_cap ?? "blocker",
  };
}

function selectionRow(reviewer, dispatched, reason) {
  return {
    id: reviewer.id,
    name: reviewer.name ?? reviewer.id,
    dispatched,
    reason,
    severity_cap: reviewer.severity_cap ?? "blocker",
  };
}

function tagged(diag, reviewerId) {
  return { ...diag, reviewer: reviewerId };
}
