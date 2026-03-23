import { existsSync } from "fs";
import { join } from "path";

/**
 * Detect the current AI coding provider based on environment and filesystem.
 * Priority: OpenCode > Claude Code (default)
 * 
 * @returns {"claude-code"|"opencode"}
 */
export function detectProvider() {
  if (process.env.CLAUDE === "true") {
    return "claude-code";
  }

  if (existsSync(".claude")) {
    return "claude-code";
  }

  if (process.env.OPENCODE === "true") {
    return "opencode";
  }

  if (existsSync(".opencode")) {
    return "opencode";
  }

  return "claude-code";
}

export default detectProvider;
