import { ClaudeCodeAdapter } from "../../providers/claude-code/adapter.mjs";
import { OpenCodeAdapter } from "../../providers/opencode/adapter.mjs";
import { CodexAdapter } from "../../providers/codex/adapter.mjs";
import { CursorAdapter } from "../../providers/cursor/adapter.mjs";

/**
 * Provider registry mapping provider names to their adapters.
 *
 * Note: `cursor` is registered here for loadability per the cursor-adapter
 * spec (Task Map row 6 — "Spec B just makes the adapter loadable"). Full
 * `adev install cursor` verb plumbing (install/uninstall dispatch in
 * cli/index.mjs::installProviders) is deferred to Spec D.
 *
 * @type {Record<string, object>}
 */
export const providers = {
  "claude-code": ClaudeCodeAdapter,
  "opencode": OpenCodeAdapter,
  "codex": new CodexAdapter(),
  "cursor": CursorAdapter,
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
