/**
 * Session File Reader
 *
 * Locates and parses Claude Code session JSONL files to compute cumulative
 * token usage for a given session ID.
 *
 * Session files live at:
 *   ~/.claude/projects/<encoded-path>/<session-id>.jsonl
 *
 * where <encoded-path> is the absolute project path with every `/` replaced by `-`.
 */

import { statSync, openSync, readSync, closeSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

/** Maximum session file size we are willing to parse (50 MB). */
const MAX_FILE_SIZE = 50 * 1024 * 1024;

/** Emit the parse-warning at most once per process invocation. */
let warningEmitted = false;

/**
 * Encode a project directory path into the directory name used by Claude Code.
 * Each `/` is replaced with `-`.
 *
 * @param {string} projectDir - Absolute path to the project.
 * @returns {string} Full path to the session directory under ~/.claude/projects/.
 */
export function resolveSessionDir(projectDir) {
  const encoded = projectDir.replace(/\//g, "-");
  return join(homedir(), ".claude", "projects", encoded);
}

/**
 * Resolve cumulative token usage for a Claude Code session.
 *
 * @param {object} opts
 * @param {string} opts.sessionId    - The Claude Code session UUID.
 * @param {string} opts.projectDir   - Absolute path to the project directory.
 * @param {number} [opts.fromOffset] - Byte offset to start reading from (default 0).
 * @returns {{ model: string, inputTokens: number, outputTokens: number,
 *             cacheReadTokens: number, cacheCreationTokens: number } | null}
 */
export function resolveSessionUsage({ sessionId, projectDir, fromOffset = 0 }) {
  try {
    const sessionDir = resolveSessionDir(projectDir);
    const filePath = join(sessionDir, `${sessionId}.jsonl`);

    // ── existence + size check ───────────────────────────────────────────────
    let stat;
    try {
      stat = statSync(filePath);
    } catch {
      // File does not exist or cannot be stated — graceful null
      return null;
    }

    if (stat.size > MAX_FILE_SIZE) {
      return null;
    }

    // ── read content from offset ─────────────────────────────────────────────
    const readLength = stat.size - fromOffset;
    if (readLength <= 0) {
      return null;
    }

    const buffer = Buffer.allocUnsafe(readLength);
    const fd = openSync(filePath, "r");
    let bytesRead = 0;
    try {
      bytesRead = readSync(fd, buffer, 0, readLength, fromOffset);
    } finally {
      closeSync(fd);
    }

    const content = buffer.slice(0, bytesRead).toString("utf8");

    // ── parse JSONL and accumulate ───────────────────────────────────────────
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheReadTokens = 0;
    let cacheCreationTokens = 0;
    let model = "";
    let hasAssistantEntry = false;

    for (const rawLine of content.split("\n")) {
      const line = rawLine.trim();
      if (!line) continue;

      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        // Skip malformed lines
        continue;
      }

      if (
        entry.type === "assistant" &&
        entry.message &&
        entry.message.usage
      ) {
        const usage = entry.message.usage;
        inputTokens += usage.input_tokens ?? 0;
        outputTokens += usage.output_tokens ?? 0;
        cacheReadTokens += usage.cache_read_input_tokens ?? 0;
        cacheCreationTokens += usage.cache_creation_input_tokens ?? 0;

        if (entry.message.model) {
          model = entry.message.model;
        }
        hasAssistantEntry = true;
      }
    }

    if (!hasAssistantEntry) {
      return null;
    }

    return { model, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens };
  } catch {
    if (!warningEmitted) {
      warningEmitted = true;
      process.stderr.write(
        "adev: token-usage parser could not read session data (format may have changed)\n"
      );
    }
    return null;
  }
}
