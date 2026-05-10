/**
 * Session log parser for Claude Code JSONL session files.
 *
 * Extracts structured metadata from session logs without ever
 * capturing message content or tool output content.
 *
 * Uses only Node.js built-ins: fs/promises, path, crypto, os.
 */

import { readFile, readdir, stat } from "fs/promises";
import { join, resolve, isAbsolute } from "path";
import { createHash } from "crypto";
import { homedir } from "os";

/**
 * Compute the deterministic project hash used by Claude Code
 * to derive the session log directory.
 *
 * Claude Code hashes the absolute project root path with SHA-256
 * and takes the first 16 hex characters.
 *
 * @param {string} projectRoot - Absolute path to the project root.
 * @returns {string} 16-char hex hash.
 */
export function computeProjectHash(projectRoot) {
  return createHash("sha256").update(projectRoot).digest("hex").slice(0, 16);
}

/**
 * Resolve the path to the most recent JSONL session log for a given agent.
 *
 * Currently only supports 'claude-code'. Returns null for unknown agents
 * or when the sessions directory does not exist / is empty.
 *
 * @param {"claude-code"|string} agent - The agent identifier.
 * @param {object} [options]
 * @param {string} [options.projectRoot] - Override project root (defaults to cwd).
 * @returns {Promise<string|null>} Absolute path to the most recent JSONL file, or null.
 */
export async function resolveLogPath(agent, options = {}) {
  if (agent !== "claude-code") {
    return null;
  }

  const projectRoot = options.projectRoot || process.cwd();
  const hash = computeProjectHash(projectRoot);
  const claudeBase = join(homedir(), ".claude", "projects");
  const sessionsDir = join(claudeBase, hash, "sessions");

  // Validate the resolved path is a child of ~/.claude/projects/
  const resolvedSessions = resolve(sessionsDir);
  const resolvedBase = resolve(claudeBase);
  if (!resolvedSessions.startsWith(resolvedBase + "/") && resolvedSessions !== resolvedBase) {
    return null;
  }

  let entries;
  try {
    entries = await readdir(sessionsDir);
  } catch {
    return null;
  }

  const jsonlFiles = entries.filter((f) => f.endsWith(".jsonl"));
  if (jsonlFiles.length === 0) {
    return null;
  }

  // Find the most recently modified JSONL file.
  let latest = null;
  let latestMtime = 0;

  for (const file of jsonlFiles) {
    const fullPath = join(sessionsDir, file);
    try {
      const st = await stat(fullPath);
      if (st.mtimeMs > latestMtime) {
        latestMtime = st.mtimeMs;
        latest = fullPath;
      }
    } catch {
      // Skip unreadable files.
    }
  }

  return latest;
}

/**
 * Providers that should be rejected (no real session data).
 */
const REJECTED_PROVIDERS = new Set(["none"]);

/**
 * Extract file path from a tool_use input object, if present.
 *
 * @param {string} toolName
 * @param {object} input
 * @returns {string|undefined}
 */
function extractFilePath(toolName, input) {
  if (!input || typeof input !== "object") return undefined;
  // Common Claude Code tool input fields that contain file paths.
  return input.file_path || input.path || input.filePath || undefined;
}

/**
 * Parse a Claude Code JSONL session log and return a condensed transcript.
 *
 * Message content and tool output content are NEVER included in the result.
 *
 * @param {string} logPath - Absolute path to the JSONL session file.
 * @param {"claude-code"|string} agent - The agent identifier.
 * @param {object} [options]
 * @param {string} [options.provider] - If 'none', returns null.
 * @returns {Promise<{messages: Array, filesModified: string[], toolCalls: Array, tokenUsage: {input: number, output: number}}|null>}
 */
export async function parseSession(logPath, agent, options = {}) {
  if (options.provider && REJECTED_PROVIDERS.has(options.provider)) {
    return null;
  }

  let raw;
  try {
    raw = await readFile(logPath, "utf8");
  } catch {
    return null;
  }

  const lines = raw.split("\n").filter((l) => l.trim().length > 0);

  const messages = [];
  const filesModifiedSet = new Set();
  const toolCalls = [];
  const tokenUsage = { input: 0, output: 0 };

  let turnIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    let entry;
    try {
      entry = JSON.parse(lines[i]);
    } catch {
      // Skip malformed lines with a warning to stderr.
      process.stderr.write(
        `[session-parser] warning: skipping malformed line ${i + 1}\n`
      );
      continue;
    }

    const type = entry.type;

    // Handle user and assistant message entries.
    if (type === "user" || type === "assistant") {
      const role = entry.message?.role || type;
      const timestamp = entry.timestamp || null;

      messages.push({ role, turnIndex, timestamp });
      turnIndex++;

      // Accumulate token usage from assistant messages.
      if (type === "assistant") {
        if (typeof entry.inputTokens === "number") {
          tokenUsage.input += entry.inputTokens;
        }
        if (typeof entry.outputTokens === "number") {
          tokenUsage.output += entry.outputTokens;
        }
      }

      // Extract tool_use blocks embedded in assistant content.
      if (type === "assistant" && Array.isArray(entry.message?.content)) {
        for (const block of entry.message.content) {
          if (block.type === "tool_use") {
            const filePath = extractFilePath(block.name, block.input);
            const toolCall = { name: block.name };
            if (filePath) {
              toolCall.file = filePath;
              filesModifiedSet.add(filePath);
            }
            toolCalls.push(toolCall);
          }
        }
      }
    }

    // tool_result entries are recorded but content is never captured.
    // We skip them for metadata purposes (already handled via tool_use).
  }

  return {
    messages,
    filesModified: [...filesModifiedSet],
    toolCalls,
    tokenUsage,
  };
}
