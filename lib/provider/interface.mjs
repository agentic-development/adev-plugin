import { existsSync } from "fs";
import { join } from "path";

/**
 * @typedef {Object} Provider
 * @property {string} name - Provider identifier ("claude-code" | "opencode")
 * @property {() => boolean} detect - Check if running in this provider
 * @property {() => string} getAgentFile - Primary agent file path (CLAUDE.md, AGENTS.md, etc.)
 * @property {(opts?: object) => Promise<{installed: boolean, path?: string}>} install - Install plugin
 * @property {(opts?: object) => Promise<void>} uninstall - Remove plugin
 */

/**
 * Abstract provider interface for AI coding assistant platforms.
 * Each provider adapter must implement these methods.
 */
export const ProviderInterface = {
  /**
   * Provider identifier
   * @type {string}
   */
  name: "",

  /**
   * Detect if running in this provider environment.
   * @returns {boolean}
   */
  detect() {
    return false;
  },

  /**
   * Get the primary agent file path for this provider.
   * @returns {string}
   */
  getAgentFile() {
    return "AGENTS.md";
  },

  /**
   * Install plugin to provider's directory.
   * @param {object} opts
   * @param {"user"|"project"} [opts.scope] - Installation scope
   * @returns {Promise<{installed: boolean, path?: string}>}
   */
  async install(opts = {}) {
    throw new Error("Not implemented");
  },

  /**
   * Uninstall plugin from provider.
   * @param {object} opts
   * @param {"user"|"project"} [opts.scope] - Uninstall scope
   * @returns {Promise<void>}
   */
  async uninstall(opts = {}) {
    throw new Error("Not implemented");
  },
};

export default ProviderInterface;
