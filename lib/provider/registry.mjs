import { ClaudeCodeAdapter } from "../../providers/claude-code/adapter.mjs";
import { OpenCodeAdapter } from "../../providers/opencode/adapter.mjs";

/**
 * Provider registry mapping provider names to their adapters.
 * @type {Record<string, object>}
 */
export const providers = {
  "claude-code": ClaudeCodeAdapter,
  "opencode": OpenCodeAdapter,
};

/**
 * Get the provider adapter by name.
 * Falls back to claude-code if not found.
 * 
 * @param {string} name - Provider name
 * @returns {object} Provider adapter
 */
export function getProvider(name) {
  return providers[name] || providers["claude-code"];
}

/**
 * Get all available provider names.
 * @returns {string[]}
 */
export function getProviderNames() {
  return Object.keys(providers);
}

export default { providers, getProvider, getProviderNames };
