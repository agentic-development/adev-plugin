/**
 * OpenCode harness adapter for execution profiles (v1 partial).
 *
 * Implements: filesystem-read, search, agent, web-fetch.
 * Unsupported in v1: filesystem-write, shell.
 *
 * Profiles referencing unsupported categories cause `prepareForDispatch` to
 * surface them via `unresolvedCategories`; the caller MUST refuse to dispatch.
 */

const CATEGORY_MAP = {
  "filesystem-read": ["read", "list"],
  search: ["grep"],
  agent: ["task"],
  "web-fetch": ["web_fetch", "web_search"],
};

export const HARNESS = "opencode";

export const IMPLEMENTED = Object.freeze(Object.keys(CATEGORY_MAP));

export const UNSUPPORTED = Object.freeze(["filesystem-write", "shell"]);

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
      if (UNSUPPORTED.includes(entry.category)) {
        unresolvedCategories.push(entry.category);
        continue;
      }
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
