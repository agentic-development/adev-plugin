/**
 * Session summary persistence — write and read structured markdown
 * session summaries with YAML frontmatter.
 *
 * Uses only Node.js built-ins (fs/promises, path, crypto).
 * Pure ESM, named exports.
 */

import { mkdir, writeFile, readFile, access } from "fs/promises";
import { join } from "path";
import { createHash } from "crypto";

/**
 * Convert a camelCase key to kebab-case.
 * @param {string} key
 * @returns {string}
 */
function toKebab(key) {
  return key.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

/**
 * Convert a kebab-case key to camelCase.
 * @param {string} key
 * @returns {string}
 */
function toCamel(key) {
  return key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * Serialize a metadata value for YAML frontmatter.
 * Arrays become YAML flow sequences; everything else is a plain scalar.
 * @param {*} value
 * @returns {string}
 */
function yamlValue(value) {
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return `[${value.join(", ")}]`;
  }
  return String(value);
}

/**
 * Build the markdown content for a session summary.
 * @param {string} condensed - The condensed transcript / content body.
 * @param {object} metadata - Metadata fields (camelCase keys).
 * @returns {string}
 */
function buildMarkdown(condensed, metadata) {
  const frontmatterLines = ["---"];
  for (const [key, value] of Object.entries(metadata)) {
    frontmatterLines.push(`${toKebab(key)}: ${yamlValue(value)}`);
  }
  frontmatterLines.push("---");

  return `${frontmatterLines.join("\n")}\n\n${condensed}\n`;
}

/**
 * Generate a short hash from the condensed content + timestamp.
 * @param {string} condensed
 * @returns {string} 7-char hex hash
 */
function shortHash(condensed) {
  return createHash("sha256")
    .update(condensed + Date.now())
    .digest("hex")
    .slice(0, 7);
}

/**
 * Check if a file exists.
 * @param {string} filePath
 * @returns {Promise<boolean>}
 */
async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Write a session summary to disk.
 *
 * File naming: `<date>-<short-hash>.md`
 * Duplicate names get a counter suffix (e.g., `-2.md`).
 * Creates outputDir if missing. Never throws — logs a warning on failure.
 *
 * @param {string} condensed - The condensed session content.
 * @param {object} metadata - Session metadata (camelCase keys: date, type, mode, agent, specsTouched, commits).
 * @param {string} outputDir - Directory to write the summary file into.
 * @returns {Promise<string|null>} The written file path, or null on failure.
 */
export async function writeSummary(condensed, metadata, outputDir) {
  try {
    await mkdir(outputDir, { recursive: true });

    const date = metadata.date || new Date().toISOString().slice(0, 10);
    const hash = shortHash(condensed);
    const baseName = `${date}-${hash}`;

    let fileName = `${baseName}.md`;
    let filePath = join(outputDir, fileName);
    let counter = 1;

    while (await fileExists(filePath)) {
      counter += 1;
      fileName = `${baseName}-${counter}.md`;
      filePath = join(outputDir, fileName);
    }

    const markdown = buildMarkdown(condensed, metadata);
    await writeFile(filePath, markdown, "utf8");
    return filePath;
  } catch (err) {
    console.warn(`[session-summary] writeSummary failed: ${err.message}`);
    return null;
  }
}

/**
 * Parse simple YAML frontmatter from a markdown string.
 * Returns an object with kebab-case keys converted to camelCase.
 * @param {string} raw
 * @returns {{ metadata: object, body: string } | null}
 */
function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return null;

  const [, yamlBlock, body] = match;
  const metadata = {};

  for (const line of yamlBlock.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();

    // Parse YAML flow sequences
    if (value.startsWith("[") && value.endsWith("]")) {
      const inner = value.slice(1, -1).trim();
      value = inner.length === 0 ? [] : inner.split(",").map((s) => s.trim());
    }

    metadata[toCamel(key)] = value;
  }

  return { metadata, body: body.trim() };
}

/**
 * Parse content sections from the markdown body.
 * Looks for ## headings matching the known section names.
 * @param {string} body
 * @returns {object}
 */
function parseSections(body) {
  const sectionMap = {
    intent: "intent",
    outcome: "outcome",
    learnings: "learnings",
    friction: "friction",
    open_items: "openItems",
    "open items": "openItems",
  };

  const sections = {
    intent: null,
    outcome: null,
    learnings: null,
    friction: null,
    openItems: null,
  };

  // Split body by ## headings
  const parts = body.split(/^## /m);
  for (const part of parts) {
    if (!part.trim()) continue;
    const newlineIdx = part.indexOf("\n");
    if (newlineIdx === -1) continue;
    const heading = part.slice(0, newlineIdx).trim().toLowerCase();
    const content = part.slice(newlineIdx + 1).trim();

    const key = sectionMap[heading];
    if (key) {
      sections[key] = content || null;
    }
  }

  return sections;
}

/**
 * Read and parse a session summary file.
 *
 * Returns a structured object with metadata and content sections.
 * Returns null for non-existent files.
 * Returns a partial object for malformed files.
 *
 * @param {string} summaryPath - Absolute path to the summary markdown file.
 * @returns {Promise<{ metadata: object, content: object } | null>}
 */
export async function readSummary(summaryPath) {
  let raw;
  try {
    raw = await readFile(summaryPath, "utf8");
  } catch {
    return null;
  }

  const parsed = parseFrontmatter(raw);

  if (!parsed) {
    // Malformed — no valid frontmatter. Return partial object.
    return {
      metadata: {},
      content: parseSections(raw),
    };
  }

  return {
    metadata: parsed.metadata,
    content: parseSections(parsed.body),
  };
}
