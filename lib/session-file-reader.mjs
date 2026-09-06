/**
 * Session File Reader
 *
 * Locates and parses Claude Code session JSONL files to compute cumulative
 * token usage for a given session ID.
 *
 * Session files live at:
 *   ~/.claude/projects/<encoded-path>/<session-id>.jsonl
 *
 * where <encoded-path> encodes a project cwd — but which cwd is not fixed:
 * Claude Code keys the directory by the session's STARTING cwd, not whatever
 * cwd is current when a hook fires. A session that changes directory (e.g.
 * entering a worktree) has a current cwd whose encoding names a directory
 * that was never created; only the session_id is authoritative. Encoding the
 * caller-supplied `projectDir` is therefore a best-effort first probe, not a
 * guarantee — resolution falls back to locating the file by session_id
 * across every directory under the projects root.
 *
 * <encoded-path> itself has two forms: every `/` and `.` replaced by `-`
 * (current), or only `/` replaced (legacy, preserved by transcripts written
 * before Claude Code changed the encoding). Both are probed.
 */

import { statSync, openSync, readSync, closeSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

/** Maximum session file size we are willing to parse (50 MB). */
const MAX_FILE_SIZE = 50 * 1024 * 1024;

/** Emit the parse-warning at most once per process invocation. */
let warningEmitted = false;

/**
 * Encode a project directory path the way current Claude Code does: every `/`
 * AND every `.` becomes `-`.
 *
 * @param {string} projectDir - Absolute path to the project.
 * @returns {string} The encoded directory-name segment.
 */
export function encodeProjectDir(projectDir) {
  return projectDir.replace(/[/.]/g, "-");
}

/**
 * Encode a project directory path the way Claude Code did before the encoding
 * change: only `/` becomes `-`, dots are preserved.
 *
 * @param {string} projectDir - Absolute path to the project.
 * @returns {string} The legacy-encoded directory-name segment.
 */
export function encodeProjectDirLegacy(projectDir) {
  return projectDir.replace(/\//g, "-");
}

/**
 * Candidate session directories for a project, in resolution priority order:
 * current encoding first, then the legacy dot-preserving encoding.
 *
 * Dot-free project paths encode identically under both rules, so the list is
 * de-duplicated and collapses to a single entry in the common case.
 *
 * @param {string} projectDir - Absolute path to the project.
 * @returns {string[]} Absolute candidate directories under ~/.claude/projects/.
 */
export function sessionDirCandidates(projectDir) {
  const root = join(homedir(), ".claude", "projects");
  const encodings = [
    encodeProjectDir(projectDir),
    encodeProjectDirLegacy(projectDir),
  ];
  return [...new Set(encodings)].map((e) => join(root, e));
}

/**
 * Resolve the session directory for a project.
 *
 * Returns the first candidate that exists on disk. When none exist the
 * current-encoding path is returned so callers still receive a well-formed
 * path and degrade per token-cost-logging.spec.md Behavior 2.
 *
 * @param {string} projectDir - Absolute path to the project.
 * @returns {string} Full path to the session directory under ~/.claude/projects/.
 */
export function resolveSessionDir(projectDir) {
  const candidates = sessionDirCandidates(projectDir);
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  return candidates[0];
}

/**
 * Locate a session's transcript file by session_id alone, scanning every
 * directory under `~/.claude/projects/`. Used when neither cwd-encoding
 * candidate names a directory holding the session's file — the session's
 * transcripts live under a cwd this process never had (see module docstring).
 *
 * @param {string} sessionId - The Claude Code session UUID.
 * @returns {string|null} absolute path to the matching `.jsonl` file, or null
 *          when the projects root is unreadable or no directory has a match.
 */
export function findSessionFileBySessionId(sessionId) {
  const root = join(homedir(), ".claude", "projects");
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = join(root, entry.name, `${sessionId}.jsonl`);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Resolve the absolute path to a session's transcript file.
 *
 * Probes the cwd-encoding candidates first (current encoding, then legacy —
 * see `sessionDirCandidates`). When neither holds the file, falls back to
 * `findSessionFileBySessionId` to join on session_id directly, covering a
 * session whose current cwd diverges from the cwd Claude Code started it in.
 *
 * When no candidate and no by-session-id match exist, returns the
 * current-encoding candidate path unchanged — callers still receive a
 * well-formed (if nonexistent) path and degrade per
 * token-cost-logging.spec.md Behavior 2.
 *
 * @param {object} opts
 * @param {string} opts.sessionId  - The Claude Code session UUID.
 * @param {string} opts.projectDir - Absolute path to the project directory.
 * @returns {string} absolute path to the session's `.jsonl` file.
 */
export function resolveSessionFilePath({ sessionId, projectDir }) {
  const candidates = sessionDirCandidates(projectDir).map((dir) =>
    join(dir, `${sessionId}.jsonl`),
  );
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  const bySessionId = findSessionFileBySessionId(sessionId);
  if (bySessionId) return bySessionId;
  return candidates[0];
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
    const filePath = resolveSessionFilePath({ sessionId, projectDir });

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
