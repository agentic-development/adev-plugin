/**
 * Token cursor file reader/writer.
 *
 * Maintains `.context-index/.token-cursor.json` — a persistent cursor that
 * tracks token usage across sessions, with session boundary resets.
 *
 * @module lib/token-cursor
 */

import { readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { randomBytes } from "node:crypto";

/** Relative path to the cursor file within a project root. */
export const CURSOR_FILE = ".context-index/.token-cursor.json";

/**
 * Read the token cursor from disk.
 * Returns the parsed object, or null on ANY error (missing file, corrupt JSON, etc.).
 *
 * @param {string} projectRoot - Absolute path to the project root.
 * @returns {object|null}
 */
export function readCursor(projectRoot) {
  try {
    const filePath = join(projectRoot, CURSOR_FILE);
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Write cursor data to disk using an atomic temp-file-then-rename pattern.
 * Creates the `.context-index/` directory if it does not exist.
 *
 * @param {string} projectRoot - Absolute path to the project root.
 * @param {object} data - Cursor data to serialize and write.
 */
export function writeCursor(projectRoot, data) {
  const filePath = join(projectRoot, CURSOR_FILE);
  const dir = dirname(filePath);

  mkdirSync(dir, { recursive: true });

  const content = JSON.stringify(data);
  const tmpPath = filePath + "." + randomBytes(6).toString("hex") + ".tmp";
  writeFileSync(tmpPath, content);
  renameSync(tmpPath, filePath);
}

/**
 * Reset the cursor to a fresh state for a new session.
 * Zeroes all cumulative token counters and clears format_warning_emitted.
 *
 * @param {string} projectRoot - Absolute path to the project root.
 * @param {string} sessionId - The new session identifier.
 * @param {number} offset - The starting byte offset for the new session.
 */
export function resetCursor(projectRoot, sessionId, offset) {
  writeCursor(projectRoot, {
    session_id: sessionId,
    last_offset: offset,
    cumulative: {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_creation_tokens: 0,
    },
    format_warning_emitted: false,
  });
}
