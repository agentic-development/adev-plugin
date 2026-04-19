/**
 * Claude Code harness adapter for execution profiles.
 *
 * Contract: Behaviors 15-18, 36, 37 of the cross-cutting spec.
 *
 * Implements all six v1 seed categories. Declares its audited channels so the
 * cross-cutting redaction-coverage test can enumerate them.
 */

/** Abstract category → Claude Code concrete tool name(s). */
const CATEGORY_MAP = {
  "filesystem-read": ["Read", "Glob"],
  search: ["Grep"],
  agent: ["Agent"],
  "web-fetch": ["WebFetch", "WebSearch"],
  "filesystem-write": ["Write", "Edit", "NotebookEdit"],
  shell: ["Bash"],
};

export const HARNESS = "claude-code";

/** Categories this adapter implements. */
export const IMPLEMENTED = Object.freeze(Object.keys(CATEGORY_MAP));

/** Categories this adapter explicitly does not implement. */
export const UNSUPPORTED = Object.freeze([]);

/** Audited channels routed through the redaction pipeline. */
export const AUDITED_CHANNELS = Object.freeze([
  "tool-stdout",
  "tool-stderr",
  "harness-error",
  "adapter-diagnostic",
  "tool-argument-echo",
  "pre-adapter-transcript",
  "subprocess-spawn-error",
]);

export const capabilities = Object.freeze({
  envTrustBoundary: { version: 1 },
});

/**
 * Translate an effective profile into the dispatch struct for Claude Code.
 *
 * @param {any} effectiveProfile
 * @param {{ env?: Record<string,string>, redactionSet?: Set<string>, mcpAvailable?: Set<string>, modelIdFromTier?: (tier: string) => string|undefined }} ctx
 * @returns {{ allowedTools: string[], modelId?: string, thinkingBudget?: string, maxOutputTokens?: number, timeoutSeconds?: number, env: Record<string,string>, redactionSet: Set<string>, unresolvedCategories: string[], unresolvedMcp: string[] }}
 */
export function prepareForDispatch(effectiveProfile, ctx = {}) {
  const allowedTools = [];
  const unresolvedCategories = [];
  const unresolvedMcp = [];
  const seen = new Set();
  const add = (name) => {
    if (!seen.has(name)) {
      seen.add(name);
      allowedTools.push(name);
    }
  };

  const entries = effectiveProfile?.permissions?.tools?.allow ?? [];
  for (const entry of entries) {
    if (entry.category !== undefined) {
      const names = CATEGORY_MAP[entry.category];
      if (!names) {
        unresolvedCategories.push(entry.category);
        continue;
      }
      for (const n of names) add(n);
    } else if (entry.mcp_server !== undefined) {
      const server = entry.mcp_server;
      if (ctx.mcpAvailable && !ctx.mcpAvailable.has(server)) {
        unresolvedMcp.push(server);
        continue;
      }
      add(`mcp__${server}__*`);
    } else if (entry.tool !== undefined) {
      add(entry.tool);
    }
  }

  const tier = effectiveProfile?.model?.tier;
  const modelId = tier && ctx.modelIdFromTier ? ctx.modelIdFromTier(tier) : undefined;

  return {
    allowedTools,
    modelId,
    thinkingBudget: effectiveProfile?.model?.thinking_budget,
    maxOutputTokens: effectiveProfile?.limits?.max_output_tokens,
    timeoutSeconds: effectiveProfile?.limits?.timeout_seconds,
    env: ctx.env ?? {},
    redactionSet: ctx.redactionSet ?? new Set(),
    unresolvedCategories,
    unresolvedMcp,
  };
}
