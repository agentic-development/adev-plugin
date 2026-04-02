import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";

/**
 * Ensure a directory exists, creating it recursively if needed.
 * @param {string} path
 */
export function ensureDir(path) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

/**
 * Read and parse a JSON file. Returns null if the file is missing or malformed.
 * @param {string} path
 * @returns {any|null}
 */
export function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Write data as pretty-printed JSON with a trailing newline.
 * @param {string} path
 * @param {any} data
 */
export function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}
