/**
 * Heuristics store and helpers.
 *
 * Manages `.context-index/memory/heuristics/` — a collection of per-scope
 * markdown files containing project heuristics (learned patterns, anti-patterns,
 * and their evidence trail). Supports read, write, promote, demote, archive,
 * and contradiction tracking.
 *
 * @module lib/heuristics
 */

import { access, mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { randomBytes } from "node:crypto";

/**
 * @typedef {Object} EvidenceRef
 * @property {string} path - Relative path to the evidence artifact (session, spec, etc.)
 * @property {string} date - ISO date string when the evidence was recorded
 * @property {string} [source] - Optional free-form source label
 */

/**
 * @typedef {Object} Heuristic
 * @property {string} id - Unique identifier (safe-slug)
 * @property {string} scope - Scope name (module, area, or "global")
 * @property {string} title - Short human-readable title
 * @property {string} pattern - Pattern or rule description
 * @property {string} [antiPattern] - Optional anti-pattern description
 * @property {'low'|'medium'|'high'} confidence - Confidence level
 * @property {EvidenceRef[]} evidence - Supporting evidence references
 * @property {EvidenceRef[]} contradictedBy - Contradicting evidence references
 * @property {string} created - ISO date string of creation
 * @property {string} updated - ISO date string of last update
 */

/**
 * @typedef {Heuristic & { archived: string, archivedReason: string }} ArchivedHeuristic
 */

/**
 * @typedef {Object} ReadOptions
 * @property {string} [module] - Filter to a specific module/scope
 * @property {'low'|'medium'|'high'} [minConfidence] - Minimum confidence threshold
 * @property {number} [limit] - Maximum number of heuristics to return
 */

/**
 * Safe-slug pattern used to validate heuristic ids and scope names.
 * Allows lowercase alphanumerics, underscores, and hyphens (up to 64 chars),
 * and disallows a leading hyphen.
 */
const SAFE_SLUG_PATTERN = /^[_a-z0-9][_a-z0-9-]{0,63}$/;

/**
 * Directory (relative to projectRoot) where heuristic markdown files live.
 */
const HEURISTICS_DIR = ".context-index/memory/heuristics";

/**
 * Allowed confidence levels for a heuristic entry.
 */
const CONFIDENCE_LEVELS = new Set(["low", "medium", "high"]);

/**
 * Length caps (in characters) for free-text fields.
 */
const FIELD_LENGTH_CAPS = {
  title: 120,
  pattern: 500,
  antiPattern: 500,
};

/**
 * Validate that projectRoot is an absolute path.
 *
 * Mirrors the pattern in `lib/execution-state.mjs`.
 *
 * @internal Used by store mutators/readers before touching the filesystem.
 * @param {string} projectRoot
 * @throws {Error} with `code = "INVALID_PROJECT_ROOT"` if not absolute.
 */
export function validateProjectRoot(projectRoot) {
  if (!isAbsolute(projectRoot)) {
    const err = new Error("projectRoot must be an absolute path");
    err.code = "INVALID_PROJECT_ROOT";
    throw err;
  }
}

/**
 * Validate a {@link Heuristic} entry against the schema: required fields,
 * safe-slug `id` / `scope`, allowed `confidence`, and length caps on free-text
 * fields.
 *
 * @internal Used by writeHeuristic and related store mutators.
 * @param {Heuristic|ArchivedHeuristic} entry
 * @throws {Error} with `code = "HEURISTICS_SCHEMA_ERROR"` on any violation.
 */
export function validateEntry(entry) {
  const requiredFields = ["id", "scope", "title", "pattern", "confidence"];
  for (const field of requiredFields) {
    const value = entry?.[field];
    if (value === undefined || value === null || value === "") {
      const err = new Error(`heuristics: missing required field '${field}'`);
      err.code = "HEURISTICS_SCHEMA_ERROR";
      throw err;
    }
  }

  if (!CONFIDENCE_LEVELS.has(entry.confidence)) {
    const err = new Error(`heuristics: invalid confidence '${entry.confidence}'`);
    err.code = "HEURISTICS_SCHEMA_ERROR";
    throw err;
  }

  if (!SAFE_SLUG_PATTERN.test(entry.scope)) {
    const err = new Error(`heuristics: invalid scope '${entry.scope}'`);
    err.code = "HEURISTICS_SCHEMA_ERROR";
    throw err;
  }

  if (!SAFE_SLUG_PATTERN.test(entry.id)) {
    const err = new Error(`heuristics: invalid id '${entry.id}'`);
    err.code = "HEURISTICS_SCHEMA_ERROR";
    throw err;
  }

  for (const [field, cap] of Object.entries(FIELD_LENGTH_CAPS)) {
    const value = entry[field];
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.length > cap) {
      const err = new Error(`heuristics: field '${field}' exceeds length cap`);
      err.code = "HEURISTICS_SCHEMA_ERROR";
      throw err;
    }
  }
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
 * Convert a camelCase key to kebab-case.
 * @param {string} key
 * @returns {string}
 */
function toKebab(key) {
  return key.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

/**
 * Deterministic field order for serialized heuristic entries. Fields missing
 * from the entry are skipped. Archived-only fields are emitted only when
 * present on the entry.
 */
const FIELD_ORDER = [
  "id",
  "scope",
  "title",
  "pattern",
  "antiPattern",
  "confidence",
  "evidence",
  "contradictedBy",
  "archived",
  "archivedReason",
  "created",
  "updated",
];

/**
 * Serialize a single heuristic entry to an on-disk markdown frontmatter block.
 *
 * Emits camelCase keys as kebab-case, uses deterministic field ordering, and
 * formats `evidence` / `contradictedBy` arrays as YAML block-form sequences
 * (non-empty) or flow form (`[]`) when empty. The output is wrapped in
 * `---` delimiters on its own lines and is round-trip safe with
 * {@link parseHeuristicsFile}.
 *
 * @internal Used by writeHeuristic and related store mutators.
 * @param {Heuristic|ArchivedHeuristic} entry
 * @returns {string}
 */
export function serializeHeuristic(entry) {
  const lines = ["---"];

  for (const key of FIELD_ORDER) {
    if (!(key in entry)) continue;
    const value = entry[key];
    if (value === undefined) continue;
    // Optional string fields with an empty value are treated as absent so
    // they round-trip cleanly (serializer + parser would otherwise emit an
    // empty `key: ` line that the parser interprets as a block-form array).
    if (key === "antiPattern" && value === "") continue;

    const kebabKey = toKebab(key);

    if (key === "evidence" || key === "contradictedBy") {
      const arr = Array.isArray(value) ? value : [];
      if (arr.length === 0) {
        lines.push(`${kebabKey}: []`);
        continue;
      }
      lines.push(`${kebabKey}:`);
      for (const item of arr) {
        // First sub-key uses the `- ` marker; remaining keys are indented
        // to align underneath. parseYamlBlock requires the same 2-space
        // indent on continuation lines as on the `- ` marker.
        const itemKeys = Object.keys(item);
        if (itemKeys.length === 0) {
          lines.push("  -");
          continue;
        }
        const [firstKey, ...restKeys] = itemKeys;
        lines.push(`  - ${toKebab(firstKey)}: ${item[firstKey]}`);
        for (const ik of restKeys) {
          lines.push(`    ${toKebab(ik)}: ${item[ik]}`);
        }
      }
      continue;
    }

    lines.push(`${kebabKey}: ${value}`);
  }

  lines.push("---");
  return lines.join("\n");
}

/**
 * Parse a YAML flow sequence like `[a, b, c]` or `[]`.
 * Returns null if not a flow sequence.
 * @param {string} value
 * @returns {string[]|null}
 */
function parseFlowSequence(value) {
  if (!value.startsWith("[") || !value.endsWith("]")) return null;
  const inner = value.slice(1, -1).trim();
  if (inner.length === 0) return [];
  return inner.split(",").map((s) => s.trim());
}

/**
 * Parse a single YAML frontmatter block body into an entry object.
 *
 * Recognizes simple `key: value` lines, YAML flow sequences for empty
 * or scalar arrays, and block-form arrays for `evidence` / `contradicted-by`
 * whose items are objects with indented `key: value` children.
 *
 * Kebab-case keys are converted to camelCase.
 *
 * Returns `null` if the block is empty or fundamentally broken (e.g.,
 * produces no `id`).
 *
 * @param {string} yamlBlock - The text between `---` delimiters (no delimiters).
 * @returns {object|null}
 */
function parseYamlBlock(yamlBlock) {
  if (!yamlBlock || !yamlBlock.trim()) return null;

  const entry = {};
  const lines = yamlBlock.split("\n");

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      i += 1;
      continue;
    }

    // Only treat top-level (un-indented) lines as key starts.
    const indent = line.length - line.trimStart().length;
    if (indent !== 0) {
      // Stray indented line at top level — skip.
      i += 1;
      continue;
    }

    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) {
      // Malformed line — skip.
      i += 1;
      continue;
    }

    const key = line.slice(0, colonIdx).trim();
    if (key.length === 0) {
      i += 1;
      continue;
    }
    const rawValue = line.slice(colonIdx + 1).trim();
    const camelKey = toCamel(key);

    if (rawValue.length === 0) {
      // Possible block-form array or mapping on subsequent indented lines.
      const items = [];
      let j = i + 1;
      let currentItem = null;
      while (j < lines.length) {
        const subLine = lines[j];
        const subTrimmed = subLine.trim();
        if (subTrimmed.length === 0) {
          j += 1;
          continue;
        }
        const subIndent = subLine.length - subLine.trimStart().length;
        if (subIndent === 0) break; // back to top-level key

        if (subTrimmed.startsWith("- ")) {
          // New list item. Start a new object.
          currentItem = {};
          items.push(currentItem);
          // The rest of the line after `- ` may be `key: value`.
          const rest = subTrimmed.slice(2).trim();
          if (rest.length > 0) {
            const subColon = rest.indexOf(":");
            if (subColon !== -1) {
              const subKey = rest.slice(0, subColon).trim();
              const subVal = rest.slice(subColon + 1).trim();
              if (subKey.length > 0) {
                currentItem[toCamel(subKey)] = subVal;
              }
            }
          }
        } else if (currentItem) {
          // Continuation of the current list item: key: value
          const subColon = subTrimmed.indexOf(":");
          if (subColon !== -1) {
            const subKey = subTrimmed.slice(0, subColon).trim();
            const subVal = subTrimmed.slice(subColon + 1).trim();
            if (subKey.length > 0) {
              currentItem[toCamel(subKey)] = subVal;
            }
          }
        }
        j += 1;
      }
      entry[camelKey] = items;
      i = j;
      continue;
    }

    const flow = parseFlowSequence(rawValue);
    if (flow !== null) {
      entry[camelKey] = flow;
    } else {
      entry[camelKey] = rawValue;
    }
    i += 1;
  }

  if (!entry.id || typeof entry.id !== "string" || entry.id.length === 0) {
    return null;
  }

  return entry;
}

/**
 * Atomically write `content` to `targetPath`.
 *
 * Writes to a sibling temp file (`<targetPath>.tmp-<hex12>`) in the same
 * directory, then renames it into place. Same-directory rename is atomic on
 * POSIX when both paths live on the same filesystem, which is guaranteed here
 * because the temp sits adjacent to the target. Parent directories are
 * created recursively if missing.
 *
 * On any failure during write or rename, the temp file is best-effort
 * removed (cleanup errors are swallowed) and the original error is rethrown.
 *
 * @internal Used by store mutators to persist heuristic files safely.
 * @param {string} targetPath - Absolute path of the file to write.
 * @param {string} content - File contents to write.
 * @returns {Promise<void>}
 */
export async function atomicWrite(targetPath, content) {
  await mkdir(dirname(targetPath), { recursive: true });
  const tempPath = `${targetPath}.tmp-${randomBytes(6).toString("hex")}`;
  try {
    await writeFile(tempPath, content);
    await rename(tempPath, targetPath);
  } catch (err) {
    try {
      await unlink(tempPath);
    } catch {
      // Swallow cleanup errors — the original error is what matters.
    }
    throw err;
  }
}

/**
 * Read a heuristics markdown file and parse all YAML frontmatter entries.
 *
 * Each entry is a `---`-delimited YAML block. Multiple entries may appear
 * in one file; body text between entries is ignored. Malformed blocks are
 * skipped with a single-line warning to stderr.
 *
 * Returns `[]` for non-existent files (ENOENT).
 *
 * @internal Used by readHeuristics; exported for direct testing.
 * @param {string} filePath - Absolute path to a heuristics markdown file.
 * @returns {Promise<object[]>}
 */
export async function parseHeuristicsFile(filePath) {
  let raw;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (err) {
    if (err && err.code === "ENOENT") return [];
    throw err;
  }

  // Split on lines that are exactly `---` (trimmed). This captures every
  // delimiter; YAML blocks are between opening/closing delimiter pairs.
  const lines = raw.split("\n");
  const delimiterIndexes = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim() === "---") delimiterIndexes.push(i);
  }

  const entries = [];

  // Walk delimiter pairs: (0,1), (2,3), (4,5) ...
  // Anything between a close and the next open is body text (ignored).
  let d = 0;
  while (d + 1 < delimiterIndexes.length) {
    const openIdx = delimiterIndexes[d];
    const closeIdx = delimiterIndexes[d + 1];
    const blockLines = lines.slice(openIdx + 1, closeIdx);
    const blockText = blockLines.join("\n");

    const entry = parseYamlBlock(blockText);
    if (entry) {
      entries.push(entry);
    } else {
      process.stderr.write(`heuristics: skipped malformed entry in '${filePath}'\n`);
    }
    d += 2;
  }

  return entries;
}

/**
 * Numeric rank for confidence levels (higher = stronger).
 */
const CONFIDENCE_RANK = { high: 3, medium: 2, low: 1 };

/**
 * Read heuristics from the store, optionally filtered by module or confidence.
 *
 * When `module` is provided, reads only `<projectRoot>/.context-index/memory/heuristics/<module>.md`.
 * Otherwise, reads every `*.md` scope file in the heuristics directory (excluding
 * `_format.md` and the `archive/` subdirectory) and combines their entries.
 * Missing files or directories yield `[]` rather than throwing.
 *
 * Results are filtered by `minConfidence` (low = all, medium = exclude low,
 * high = only high), sorted by confidence rank descending with `updated` date
 * as a tie-breaker (also descending), and finally truncated to `limit` entries.
 *
 * @param {string} projectRoot - Absolute path to the project root
 * @param {ReadOptions} [options] - Optional filters
 * @returns {Promise<Heuristic[]>}
 */
export async function readHeuristics(projectRoot, { module, minConfidence, limit } = {}) {
  validateProjectRoot(projectRoot);

  const dir = join(projectRoot, HEURISTICS_DIR);
  let entries = [];

  if (module) {
    entries = await parseHeuristicsFile(join(dir, `${module}.md`));
  } else {
    let dirents;
    try {
      dirents = await readdir(dir, { withFileTypes: true });
    } catch (err) {
      if (err && err.code === "ENOENT") return [];
      throw err;
    }

    for (const dirent of dirents) {
      if (!dirent.isFile()) continue;
      const name = dirent.name;
      if (!name.endsWith(".md")) continue;
      if (name === "_format.md") continue;
      const fileEntries = await parseHeuristicsFile(join(dir, name));
      entries.push(...fileEntries);
    }
  }

  // Filter by minConfidence.
  if (minConfidence && minConfidence !== "low") {
    const threshold = CONFIDENCE_RANK[minConfidence] ?? 0;
    entries = entries.filter(
      (e) => (CONFIDENCE_RANK[e.confidence] ?? 0) >= threshold,
    );
  }

  // Sort by confidence rank DESC, then updated DESC (lexical ISO compare).
  entries.sort((a, b) => {
    const rankDiff = (CONFIDENCE_RANK[b.confidence] ?? 0) - (CONFIDENCE_RANK[a.confidence] ?? 0);
    if (rankDiff !== 0) return rankDiff;
    const au = a.updated || "";
    const bu = b.updated || "";
    if (bu < au) return -1;
    if (bu > au) return 1;
    return 0;
  });

  if (typeof limit === "number") {
    if (limit <= 0) return [];
    entries = entries.slice(0, limit);
  }

  return entries;
}

/**
 * Today's date as a YYYY-MM-DD string.
 * @returns {string}
 */
function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Escape a string for use in a regular expression.
 * @param {string} s
 * @returns {string}
 */
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Detect whether the raw on-disk text of a heuristics file contains a
 * top-level `id: <targetId>` line that was NOT captured by
 * {@link parseHeuristicsFile}. This indicates the id appears inside a
 * malformed or unpaired block that the parser silently dropped, and a
 * writeHeuristic call is about to overwrite it.
 *
 * Implementation: counts lines matching `^id:\s*<targetId>\s*$` in the
 * raw text and compares against the number of parsed entries with the
 * same id.
 *
 * @internal
 * @param {string} rawText - Full file contents.
 * @param {string} targetId - The id being written.
 * @param {object[]} parsedEntries - Entries returned by parseHeuristicsFile.
 * @returns {boolean}
 */
function findMalformedIdInRaw(rawText, targetId, parsedEntries) {
  if (!rawText) return false;
  const pattern = new RegExp(`^id:\\s*${escapeRegex(targetId)}\\s*$`, "m");
  // Count all matching lines, not just the first.
  let rawCount = 0;
  const global = new RegExp(`^id:\\s*${escapeRegex(targetId)}\\s*$`, "gm");
  // eslint-disable-next-line no-unused-vars
  for (const _m of rawText.matchAll(global)) rawCount += 1;
  if (rawCount === 0) return false;
  const parsedCount = parsedEntries.filter((e) => e.id === targetId).length;
  return rawCount > parsedCount;
}

/**
 * Merge a new list of evidence refs into an existing list, deduplicating
 * by the `(path, date)` tuple. Existing entries are preserved; new items
 * whose `(path, date)` is already present are dropped (regardless of
 * `source` differences).
 *
 * @internal
 * @param {EvidenceRef[]} existing
 * @param {EvidenceRef[]} incoming
 * @returns {EvidenceRef[]}
 */
function mergeEvidence(existing, incoming) {
  const merged = [...(existing || [])];
  const seen = new Set(merged.map((e) => `${e.path}\u0000${e.date}`));
  for (const ref of incoming || []) {
    const key = `${ref.path}\u0000${ref.date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(ref);
  }
  return merged;
}

/**
 * Apply absolute-threshold auto-promotion rules based on the number of
 * distinct evidence paths.
 *
 * - low + >= 2 distinct paths → medium
 * - low|medium + >= 3 distinct paths → high
 * - Auto-promotion never decreases confidence.
 *
 * @internal
 * @param {'low'|'medium'|'high'} currentConfidence
 * @param {EvidenceRef[]} evidence
 * @returns {'low'|'medium'|'high'}
 */
function autoPromote(currentConfidence, evidence) {
  const distinctPathCount = new Set((evidence || []).map((e) => e.path)).size;
  let conf = currentConfidence;
  if (conf === "low" && distinctPathCount >= 2) conf = "medium";
  if ((conf === "low" || conf === "medium") && distinctPathCount >= 3) {
    conf = "high";
  }
  return conf;
}

/**
 * Write (create or update) a heuristic entry.
 *
 * Append-or-update semantics:
 * - **New entry:** The caller-supplied `confidence` is authoritative; missing
 *   `created`/`updated` default to today. Missing `evidence` and
 *   `contradictedBy` arrays are normalized to `[]`.
 * - **Update (same id exists):** Preserves the original `created`, refreshes
 *   `updated` to today, merges `evidence[]` and `contradictedBy[]` dedup'd by
 *   `(path, date)`, preserves the stored `confidence` (caller's value is
 *   ignored), and allows the caller to refine `title` / `pattern` /
 *   `antiPattern`.
 * - **Malformed existing:** If the raw file contains `id: <id>` in a block
 *   that `parseHeuristicsFile` dropped (unpaired delimiter, unparseable
 *   body), the write completes as a new-entry write, logs a single-line
 *   stderr warning, and the rewritten file no longer contains the malformed
 *   block.
 *
 * After merging, absolute-threshold auto-promotion applies: `low` → `medium`
 * at ≥2 distinct evidence paths; `low`/`medium` → `high` at ≥3. Promotion
 * never decreases confidence.
 *
 * The scope file is rewritten atomically via {@link atomicWrite}.
 *
 * @param {string} projectRoot - Absolute path to the project root
 * @param {Heuristic} entry - Heuristic to write
 * @returns {Promise<Heuristic>} The final stored entry.
 * @throws {Error} `INVALID_PROJECT_ROOT` if projectRoot is not absolute.
 * @throws {Error} `HEURISTICS_SCHEMA_ERROR` if the entry fails validation.
 */
export async function writeHeuristic(projectRoot, entry) {
  validateProjectRoot(projectRoot);
  validateEntry(entry);

  const scopeDir = join(projectRoot, HEURISTICS_DIR);
  const scopeFile = join(scopeDir, `${entry.scope}.md`);

  // Read raw file (if it exists) for malformed-id detection.
  let rawText = "";
  try {
    rawText = await readFile(scopeFile, "utf8");
  } catch (err) {
    if (!err || err.code !== "ENOENT") throw err;
    rawText = "";
  }

  // Parse the well-formed entries. parseHeuristicsFile returns [] for ENOENT
  // and writes a stderr warning for any dropped blocks.
  const existingEntries = await parseHeuristicsFile(scopeFile);
  const existingIndex = existingEntries.findIndex((e) => e.id === entry.id);
  const existing = existingIndex >= 0 ? existingEntries[existingIndex] : null;

  // Detect malformed overwrite: raw text has `id: <target>` lines that the
  // parser did not capture into an entry.
  const isMalformedOverwrite =
    !existing && findMalformedIdInRaw(rawText, entry.id, existingEntries);
  if (isMalformedOverwrite) {
    process.stderr.write(
      `heuristics: overwrote malformed entry '${entry.id}' in '${entry.scope}.md'\n`,
    );
  }

  /** @type {Heuristic} */
  let finalEntry;
  const now = today();

  if (existing) {
    // Update path. Preserve stored confidence; merge evidence; refresh updated.
    const mergedEvidence = mergeEvidence(existing.evidence || [], entry.evidence || []);
    const mergedContradictedBy = mergeEvidence(
      existing.contradictedBy || [],
      entry.contradictedBy || [],
    );
    const baseConfidence = existing.confidence;
    const promotedConfidence = autoPromote(baseConfidence, mergedEvidence);

    finalEntry = {
      id: existing.id,
      scope: existing.scope,
      title: entry.title ?? existing.title,
      pattern: entry.pattern ?? existing.pattern,
      confidence: promotedConfidence,
      evidence: mergedEvidence,
      contradictedBy: mergedContradictedBy,
      created: existing.created || now,
      updated: now,
    };

    // Preserve or refine antiPattern (incoming wins when provided).
    if (entry.antiPattern !== undefined) {
      finalEntry.antiPattern = entry.antiPattern;
    } else if (existing.antiPattern !== undefined) {
      finalEntry.antiPattern = existing.antiPattern;
    }
  } else {
    // New entry path (or malformed overwrite — handled as a fresh new entry).
    const evidence = Array.isArray(entry.evidence) ? [...entry.evidence] : [];
    const contradictedBy = Array.isArray(entry.contradictedBy)
      ? [...entry.contradictedBy]
      : [];
    const callerConfidence = entry.confidence;
    const promotedConfidence = autoPromote(callerConfidence, evidence);

    finalEntry = {
      id: entry.id,
      scope: entry.scope,
      title: entry.title,
      pattern: entry.pattern,
      confidence: promotedConfidence,
      evidence,
      contradictedBy,
      created: entry.created || now,
      updated: now,
    };

    if (entry.antiPattern !== undefined) {
      finalEntry.antiPattern = entry.antiPattern;
    }
  }

  // Build the final list: all existing well-formed entries with a different
  // id, followed by the new/updated entry in place (if it was an update) or
  // appended to the end (if it was a new entry). For stable ordering we
  // preserve the original slot when updating.
  const finalEntries = [...existingEntries];
  if (existingIndex >= 0) {
    finalEntries[existingIndex] = finalEntry;
  } else {
    finalEntries.push(finalEntry);
  }

  // Serialize and write atomically. Blocks are separated with a blank line.
  const body = finalEntries.map((e) => serializeHeuristic(e)).join("\n\n") + "\n";
  await atomicWrite(scopeFile, body);

  return finalEntry;
}

/**
 * Serialize a list of entries into a single scope-file body, matching the
 * format used by {@link writeHeuristic}: entries joined by a blank line and
 * terminated with a trailing newline. An empty list yields an empty string.
 *
 * @internal
 * @param {(Heuristic|ArchivedHeuristic)[]} entries
 * @returns {string}
 */
function serializeEntries(entries) {
  if (entries.length === 0) return "";
  return entries.map((e) => serializeHeuristic(e)).join("\n\n") + "\n";
}

/**
 * Locate a heuristic by id across all scope files in the heuristics
 * directory. Scans every `.md` file except `_format.md` and excludes the
 * `archive/` subdirectory. Returns the first matching entry along with the
 * scope name (derived from the file's basename) for later write-back.
 *
 * Returns `null` if no scope file contains a matching id, or if the
 * heuristics directory does not exist.
 *
 * @internal
 * @param {string} projectRoot - Absolute path to the project root.
 * @param {string} id - Heuristic id to find.
 * @returns {Promise<{ entry: Heuristic, scope: string }|null>}
 */
async function findEntryById(projectRoot, id) {
  const dir = join(projectRoot, HEURISTICS_DIR);
  let dirents;
  try {
    dirents = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err && err.code === "ENOENT") return null;
    throw err;
  }

  for (const dirent of dirents) {
    if (!dirent.isFile()) continue;
    const name = dirent.name;
    if (!name.endsWith(".md")) continue;
    if (name === "_format.md") continue;
    const fileEntries = await parseHeuristicsFile(join(dir, name));
    const match = fileEntries.find((e) => e.id === id);
    if (match) {
      const scope = name.slice(0, -3);
      return { entry: match, scope };
    }
  }

  return null;
}

/**
 * Promote a heuristic one confidence level (low -> medium -> high).
 *
 * If the entry is already at `high`, this is a no-op and the stored entry
 * is returned unchanged (no write). Otherwise, the confidence is bumped
 * one level, `updated` is refreshed to today, and the scope file is
 * rewritten atomically.
 *
 * @param {string} projectRoot - Absolute path to the project root
 * @param {string} id - Heuristic id
 * @returns {Promise<Heuristic>} The updated (or unchanged) entry.
 * @throws {Error} `INVALID_PROJECT_ROOT` if projectRoot is not absolute.
 * @throws {Error} `HEURISTICS_NOT_FOUND` if no scope file contains the id.
 */
export async function promoteHeuristic(projectRoot, id) {
  validateProjectRoot(projectRoot);

  const found = await findEntryById(projectRoot, id);
  if (!found) {
    const err = new Error(`heuristics: id '${id}' not found in any scope`);
    err.code = "HEURISTICS_NOT_FOUND";
    throw err;
  }

  const { entry, scope } = found;

  // No-op when already at the ceiling.
  if (entry.confidence === "high") {
    return entry;
  }

  const nextConfidence = entry.confidence === "low" ? "medium" : "high";
  const updatedEntry = {
    ...entry,
    confidence: nextConfidence,
    updated: today(),
  };

  const scopeFile = join(projectRoot, HEURISTICS_DIR, `${scope}.md`);
  const existingEntries = await parseHeuristicsFile(scopeFile);
  const idx = existingEntries.findIndex((e) => e.id === id);
  if (idx >= 0) {
    existingEntries[idx] = updatedEntry;
  } else {
    existingEntries.push(updatedEntry);
  }

  await atomicWrite(scopeFile, serializeEntries(existingEntries));
  return updatedEntry;
}

/**
 * Demote a heuristic one confidence level (high -> medium -> low).
 *
 * If the entry is already at `low`, calling this archives the entry with
 * reason `"demoted-below-low"` and returns the archived entry. Otherwise,
 * the confidence is lowered one level, `updated` is refreshed to today,
 * and the scope file is rewritten atomically.
 *
 * @param {string} projectRoot - Absolute path to the project root
 * @param {string} id - Heuristic id
 * @returns {Promise<Heuristic|ArchivedHeuristic>} The updated or archived entry.
 * @throws {Error} `INVALID_PROJECT_ROOT` if projectRoot is not absolute.
 * @throws {Error} `HEURISTICS_NOT_FOUND` if no scope file contains the id.
 */
export async function demoteHeuristic(projectRoot, id) {
  validateProjectRoot(projectRoot);

  const found = await findEntryById(projectRoot, id);
  if (!found) {
    const err = new Error(`heuristics: id '${id}' not found in any scope`);
    err.code = "HEURISTICS_NOT_FOUND";
    throw err;
  }

  const { entry, scope } = found;

  // Demoting below low archives the entry.
  if (entry.confidence === "low") {
    return archiveHeuristic(projectRoot, id, "demoted-below-low");
  }

  const nextConfidence = entry.confidence === "high" ? "medium" : "low";
  const updatedEntry = {
    ...entry,
    confidence: nextConfidence,
    updated: today(),
  };

  const scopeFile = join(projectRoot, HEURISTICS_DIR, `${scope}.md`);
  const existingEntries = await parseHeuristicsFile(scopeFile);
  const idx = existingEntries.findIndex((e) => e.id === id);
  if (idx >= 0) {
    existingEntries[idx] = updatedEntry;
  } else {
    existingEntries.push(updatedEntry);
  }

  await atomicWrite(scopeFile, serializeEntries(existingEntries));
  return updatedEntry;
}

/**
 * Archive a heuristic with a reason.
 *
 * Writes an archived copy of the entry to
 * `<projectRoot>/.context-index/memory/heuristics/archive/<scope>-<id>.md`
 * with two additional fields (`archived = today`, `archivedReason = reason`)
 * and removes the entry from its source scope file. Archived entries are
 * excluded from {@link readHeuristics}.
 *
 * If the archive target path already exists, the call fails without
 * touching the source scope file.
 *
 * @param {string} projectRoot - Absolute path to the project root
 * @param {string} id - Heuristic id
 * @param {string} reason - Why the heuristic is being archived
 * @returns {Promise<ArchivedHeuristic>} The archived entry.
 * @throws {Error} `INVALID_PROJECT_ROOT` if projectRoot is not absolute.
 * @throws {Error} `HEURISTICS_NOT_FOUND` if no scope file contains the id.
 * @throws {Error} `HEURISTICS_ARCHIVE_CONFLICT` if an archive file already exists at the target path.
 */
export async function archiveHeuristic(projectRoot, id, reason) {
  validateProjectRoot(projectRoot);

  const found = await findEntryById(projectRoot, id);
  if (!found) {
    const err = new Error(`heuristics: id '${id}' not found in any scope`);
    err.code = "HEURISTICS_NOT_FOUND";
    throw err;
  }

  const { entry, scope } = found;

  const archiveDir = join(projectRoot, HEURISTICS_DIR, "archive");
  const archivePath = join(archiveDir, `${scope}-${id}.md`);

  // Fail fast if the archive target already exists. Use access; treat
  // ENOENT as "does not exist" and rethrow anything else.
  let archiveExists = true;
  try {
    await access(archivePath);
  } catch (err) {
    if (err && err.code === "ENOENT") {
      archiveExists = false;
    } else {
      throw err;
    }
  }
  if (archiveExists) {
    const err = new Error(`heuristics: archive conflict for '${id}'`);
    err.code = "HEURISTICS_ARCHIVE_CONFLICT";
    throw err;
  }

  /** @type {ArchivedHeuristic} */
  const archivedEntry = {
    ...entry,
    archived: today(),
    archivedReason: reason,
  };

  // Write the archive copy first.
  await atomicWrite(archivePath, serializeEntries([archivedEntry]));

  // Remove the entry from the source scope file. If the file becomes
  // empty, write an empty file rather than deleting it — this keeps
  // the spec's "absent from its scope file" contract simple.
  const scopeFile = join(projectRoot, HEURISTICS_DIR, `${scope}.md`);
  const existingEntries = await parseHeuristicsFile(scopeFile);
  const remaining = existingEntries.filter((e) => e.id !== id);
  await atomicWrite(scopeFile, serializeEntries(remaining));

  return archivedEntry;
}

/**
 * Add a contradicting evidence reference to an existing heuristic.
 *
 * Behavior:
 * - Appends `evidenceRef` to the entry's `contradictedBy[]` (no dedup —
 *   each contradiction is a distinct event).
 * - **Rule 1 (auto-archive on 2nd contradiction):** If the resulting
 *   `contradictedBy.length >= 2`, the entry is archived with reason
 *   `"contradicted"` and the archived entry is returned. This fires
 *   regardless of the entry's current confidence.
 * - **Rule 2 (first contradiction):**
 *   - If the entry is currently `low`, it is archived with reason
 *     `"contradicted"` (NOT `"demoted-below-low"`) — contradictions on
 *     a low entry always take the contradicted pathway.
 *   - Otherwise, confidence is dropped one level (`high → medium`,
 *     `medium → low`), `updated` is refreshed to today, and the scope
 *     file is rewritten atomically.
 *
 * The archive copy always reflects the full contradictedBy history by
 * first writing the appended entry back to the scope file before
 * delegating to {@link archiveHeuristic}.
 *
 * @param {string} projectRoot - Absolute path to the project root
 * @param {string} id - Heuristic id
 * @param {EvidenceRef} evidenceRef - Contradicting evidence reference
 * @returns {Promise<Heuristic|ArchivedHeuristic>} The updated or archived entry.
 * @throws {Error} `INVALID_PROJECT_ROOT` if projectRoot is not absolute.
 * @throws {Error} `HEURISTICS_NOT_FOUND` if no scope file contains the id.
 */
export async function addContradiction(projectRoot, id, evidenceRef) {
  validateProjectRoot(projectRoot);

  const found = await findEntryById(projectRoot, id);
  if (!found) {
    const err = new Error(`heuristics: id '${id}' not found in any scope`);
    err.code = "HEURISTICS_NOT_FOUND";
    throw err;
  }

  const { entry, scope } = found;

  // Append the new contradiction (no dedup — each is a distinct event).
  const nextContradictedBy = [...(entry.contradictedBy || []), evidenceRef];

  const scopeFile = join(projectRoot, HEURISTICS_DIR, `${scope}.md`);

  // Rule 1: 2nd+ contradiction → archive with reason "contradicted".
  // Rule 2 (low path): 1st contradiction on a low entry → also archive
  //   with reason "contradicted" (trumps the demoted-below-low pathway).
  const shouldArchive =
    nextContradictedBy.length >= 2 || entry.confidence === "low";

  if (shouldArchive) {
    // Write the updated entry (with the new contradictedBy) back to
    // the scope file first, so archiveHeuristic's read sees the full
    // contradictedBy history when it builds the archive copy.
    const persistedEntry = {
      ...entry,
      contradictedBy: nextContradictedBy,
      updated: today(),
    };
    const existingEntries = await parseHeuristicsFile(scopeFile);
    const idx = existingEntries.findIndex((e) => e.id === id);
    if (idx >= 0) {
      existingEntries[idx] = persistedEntry;
    } else {
      existingEntries.push(persistedEntry);
    }
    await atomicWrite(scopeFile, serializeEntries(existingEntries));

    return archiveHeuristic(projectRoot, id, "contradicted");
  }

  // Rule 2 (non-low path): first contradiction drops confidence one level.
  const nextConfidence = entry.confidence === "high" ? "medium" : "low";
  const updatedEntry = {
    ...entry,
    confidence: nextConfidence,
    contradictedBy: nextContradictedBy,
    updated: today(),
  };

  const existingEntries = await parseHeuristicsFile(scopeFile);
  const idx = existingEntries.findIndex((e) => e.id === id);
  if (idx >= 0) {
    existingEntries[idx] = updatedEntry;
  } else {
    existingEntries.push(updatedEntry);
  }

  await atomicWrite(scopeFile, serializeEntries(existingEntries));
  return updatedEntry;
}
