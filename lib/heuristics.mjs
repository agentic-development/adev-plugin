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

import { access, mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join } from "node:path";
import { createHash, randomBytes } from "node:crypto";

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
 * @property {string[]} [tags] - Optional classification tags ([a-z0-9-], max 64 chars each, max 20)
 * @property {string} [signature] - Optional cross-scope recurrence key ([a-z0-9][a-z0-9-]*, max 64 chars). Never rewritten once assigned.
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
 * Pattern an optional `signature` must match: lowercase alphanumerics and
 * hyphens, no leading hyphen, at most 64 characters. Narrower than
 * {@link SAFE_SLUG_PATTERN} on purpose — a signature is always machine-composed
 * as `<origin-slug>-<8 hex>`, so underscores never legitimately appear.
 *
 * Accepts the same language as `TAG_PATTERN` today. Kept as its own constant
 * because tags are a human-authored vocabulary and signatures are a
 * machine-composed identity — the two are free to diverge, and collapsing them
 * would couple a schema change on one to the other.
 */
const SIGNATURE_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * Directory (relative to projectRoot) where heuristic markdown files live.
 */
export const HEURISTICS_DIR = ".context-index/memory/heuristics";

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

// ── Shared digest primitive ───────────────────────────────────────────────
//
// Spec: .context-index/specs/features/heuristics/failure-signature-key.spec.md
//
// Two derivation rules — `signature` and `id` — share ONE digest function but
// must never share a normalizer. `deriveDigest` therefore takes the normalizer
// as a parameter and never chooses one itself; within this module the only two
// composition sites are `deriveSignature` and `deriveHeuristicId` below. (Other
// private copies still exist elsewhere in the repo — removing them is owned by
// `failure-capture.spec.md`, not this spec.) That parameterisation is
// what keeps "exactly one implementation" true per-rule without merging the two
// rules into one (which would destroy either the punctuation-collapse property
// signatures need, or the separator-preservation property ids need).

/**
 * Number of hex characters taken from the front of the SHA-256 digest.
 */
const DIGEST_HEX_LENGTH = 8;

/**
 * Normalizer for **derived-mode signature** hash inputs (Behavior 2).
 *
 * Lowercase → strip punctuation except `-` and `_` → collapse consecutive
 * whitespace to a single space → trim. Operation order matters: this is
 * byte-compatible with `normalizeRootCause` in
 * `tests/skills/recover-extract-heuristic-harness.mjs`, which is the
 * implementation that produced every `/adev:recover` id currently in the
 * store, so those ids are unchanged by the convergence onto this function.
 * (The prose rule in `skills/recover/SKILL.md` states a different operation
 * order and diverges on standalone punctuation tokens; correcting that prose
 * belongs to `failure-capture.spec.md`, which performs the removal.)
 *
 * This normalizer is never applied to an `id` hash input: it strips `/`, `.`
 * and `|`, which are the separators that carry an id input's meaning.
 *
 * @param {string} text
 * @returns {string}
 */
export function normalizeFailureText(text) {
  if (typeof text !== "string") return "";
  let s = text.toLowerCase();
  // Strip punctuation except hyphen, underscore, and whitespace.
  s = s.replace(/[^\p{L}\p{N}\s\-_]/gu, "");
  // Collapse whitespace to a single space.
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/**
 * Normalizer for **`id`** hash inputs (Behavior 7).
 *
 * Lowercase and fold `\` path separators to `/`. Deliberately strips **no**
 * punctuation: `/`, `.` and `|` are the separators that distinguish
 * `<repo-relative-spec-path>|<pattern>` inputs from one another, and removing
 * them would collide distinct specs onto one id.
 *
 * @param {string} text
 * @returns {string}
 */
export function normalizeIdInput(text) {
  if (typeof text !== "string") return "";
  return text.replace(/\\/g, "/").toLowerCase();
}

/**
 * The one shared digest function: `normalizer(input)` → SHA-256 → first 8
 * lowercase hex characters.
 *
 * Reads no clock, no filesystem path, no environment variable, and no run
 * identifier, so the same input yields a byte-identical digest on any machine,
 * in any worktree, at any time (Behavior 4).
 *
 * @param {string} input - Raw (un-normalized) hash input.
 * @param {(text: string) => string} normalizer - Either {@link normalizeFailureText}
 *   or {@link normalizeIdInput}. Required — this function never picks one.
 * @returns {string} 8 lowercase hex characters.
 * @throws {Error} with `code = "HEURISTICS_DIGEST_ERROR"` when `normalizer` is
 *   not a function.
 */
export function deriveDigest(input, normalizer) {
  if (typeof normalizer !== "function") {
    const err = new Error(
      "heuristics: deriveDigest requires an explicit normalizer function",
    );
    err.code = "HEURISTICS_DIGEST_ERROR";
    throw err;
  }
  return createHash("sha256")
    .update(normalizer(input))
    .digest("hex")
    .slice(0, DIGEST_HEX_LENGTH);
}

/**
 * Compose a derived-mode `signature`: `<origin>-<digest of normalized failure
 * text>` (Behavior 1).
 *
 * Inherited mode (origin `review-specs`) does NOT call this — it reuses the
 * hash component of an existing `blocker_id` and hashes nothing.
 *
 * @param {string} origin - Origin slug (`recover`, `validate`, `implement`).
 * @param {string} text - Raw failure text.
 * @returns {string}
 */
export function deriveSignature(origin, text) {
  return `${origin}-${deriveDigest(text, normalizeFailureText)}`;
}

/**
 * The ONE composition of the validate-failure lookup key.
 *
 * Both the capture side (`hooks/post-validate-extract-heuristics.mjs`) and the
 * read side call this function; neither reimplements it. That single home is
 * the point: if the two compositions drift, signature retrieval matches zero
 * entries while every ranking test still passes — a silent, test-green failure.
 *
 * The input is the **live** `checks[]` array from the in-flight verdict
 * payload. A `.context-index/lifecycle-state/*.jsonl` record carries
 * `validator` and `verdict` but **no `checks[]`**, so the key is underivable
 * from the lifecycle log (Behavior 0a) — the caller must hold the live verdict.
 *
 * Composition: keep checks with a non-empty string `id` and a string `outcome`
 * other than `PASS`, sanitize each id to the closed `[A-Za-z0-9._-]` charset,
 * drop empties, then hash the deduped, sorted, space-joined list through
 * {@link deriveSignature} under the `validate` origin.
 *
 * @param {Array<{id?: unknown, outcome?: unknown}>} checks - Live verdict checks.
 * @returns {string|null} The signature, or `null` when no check has a non-PASS
 *   outcome, when `checks` is not an array, or when every failing id sanitizes
 *   away to empty.
 */
export function deriveValidateFailureSignature(checks) {
  if (!Array.isArray(checks)) return null;
  const failed = checks
    .filter((c) => c && typeof c.id === "string" && c.id
      && typeof c.outcome === "string" && c.outcome !== "PASS")
    .map((c) => c.id.replace(/[^A-Za-z0-9._-]/g, ""))
    .filter(Boolean);
  if (failed.length === 0) return null;
  return deriveSignature("validate", [...new Set(failed)].sort().join(" "));
}

/**
 * Compose a location-independent heuristic `id`:
 * `<prefix>-<digest of "<repo-relative-spec-path>|<pattern>">` (Behavior 7).
 *
 * The prefix is supplied by the caller and is never derived from an origin
 * (Behavior 7a): `/adev:validate` passes a spec slug, `/adev:recover` passes a
 * diagnosis-category slug.
 *
 * The path must be **repo-relative**. Passing an absolute path reintroduces the
 * cross-worktree divergence this function exists to remove.
 *
 * @param {string} prefix - Caller-supplied id prefix.
 * @param {string} repoRelativeSpecPath - Spec path relative to the project root.
 * @param {string} pattern - The entry's pattern text.
 * @returns {string}
 */
export function deriveHeuristicId(prefix, repoRelativeSpecPath, pattern) {
  const hashInput = `${repoRelativeSpecPath}|${pattern}`;
  return `${prefix}-${deriveDigest(hashInput, normalizeIdInput)}`;
}

/**
 * The canonical id prefix for a spec path: the basename with both the `.md`
 * extension and the `.spec` stem stripped, then slugified.
 *
 * `foo.spec.md` yields `foo`, not `foo-spec`. This is the single home for the
 * rule — the validate Stop hook and the store migration both call it, so the
 * two legacy conventions in the store converge on one form.
 *
 * @param {string} specPath - A spec path, relative or absolute.
 * @returns {string} The slug, or `""` for a pathological filename.
 */
export function canonicalSpecSlug(specPath) {
  return basename(String(specPath ?? ""), ".md")
    .replace(/\.spec$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

  // Validate the optional `signature` field if present. A signature is the
  // cross-scope recurrence key; `id` answers "same entry in this scope",
  // `signature` answers "same underlying failure, anywhere in the store".
  // Entries written before Phase 3, and success-derived entries, carry none.
  if (entry.signature !== undefined) {
    if (typeof entry.signature !== "string" || !SIGNATURE_PATTERN.test(entry.signature)) {
      const err = new Error(
        `heuristics: invalid signature '${entry.signature}' — must match [a-z0-9][a-z0-9-]*, max 64 chars`,
      );
      err.code = "HEURISTICS_SCHEMA_ERROR";
      throw err;
    }
  }

  // Validate tags field if present.
  if (entry.tags !== undefined) {
    if (!Array.isArray(entry.tags)) {
      const err = new Error("heuristics: 'tags' must be an array");
      err.code = "INVALID_TAGS";
      throw err;
    }
    if (entry.tags.length > 20) {
      const err = new Error("heuristics: 'tags' exceeds maximum of 20 tags");
      err.code = "INVALID_TAGS";
      throw err;
    }
    for (const tag of entry.tags) {
      if (typeof tag !== "string" || tag.length === 0 || tag.length > 64 || !/^[a-z0-9][a-z0-9-]*$/.test(tag)) {
        const err = new Error(`heuristics: invalid tag '${tag}' — must match [a-z0-9][a-z0-9-]*, max 64 chars`);
        err.code = "INVALID_TAGS";
        throw err;
      }
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
  "tags",
  "signature",
  "confidence",
  "evidence",
  "contradictedBy",
  "archived",
  "archivedReason",
  "created",
  "updated",
];

/**
 * Pattern that tags must match: lowercase alphanumerics and hyphens only.
 */
const TAG_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$|^[a-z0-9]$/;

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
    if ((key === "antiPattern" || key === "signature") && value === "") continue;

    const kebabKey = toKebab(key);

    if (key === "tags") {
      const arr = Array.isArray(value) ? value : [];
      if (arr.length === 0) continue; // Omit line when empty/absent
      lines.push(`${kebabKey}: [${arr.join(", ")}]`);
      continue;
    }

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
 * List the scope files that make up the store: every `*.md` directly inside
 * the heuristics directory except `_format.md`. `archive/` is out of reach
 * because the listing is non-recursive.
 *
 * Symlinked scope files are followed: a dirent for a symlink reports
 * `isFile() === false`, so filtering on that alone would silently drop a
 * legitimate scope file — and silent under-coverage is worse than an error
 * for a one-shot migration.
 *
 * This is the single source of truth for "which files are the store". Both
 * {@link readHeuristics} and the CLI's `migrate-keys` walk consume it, so the
 * migration can never walk a different set than the reader.
 *
 * @param {string} projectRoot - Absolute path to the project root.
 * @returns {Promise<string[]>} Absolute paths, sorted for a deterministic walk.
 */
export async function listScopeFiles(projectRoot) {
  const dir = join(projectRoot, HEURISTICS_DIR);
  let dirents;
  try {
    dirents = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err && err.code === "ENOENT") return [];
    throw err;
  }

  const files = [];
  for (const dirent of dirents) {
    const name = dirent.name;
    if (!name.endsWith(".md")) continue;
    if (name === "_format.md") continue;
    const full = join(dir, name);
    if (dirent.isFile()) {
      files.push(full);
      continue;
    }
    if (dirent.isSymbolicLink()) {
      try {
        if ((await stat(full)).isFile()) files.push(full);
      } catch {
        // A broken symlink is not a scope file.
      }
    }
  }
  return files.sort();
}

/**
 * Numeric rank for confidence levels (higher = stronger).
 */
export const CONFIDENCE_RANK = { high: 3, medium: 2, low: 1 };

/**
 * The charter's contradiction invariant, as a pure function of an entry's
 * confidence and its contradiction count.
 *
 * This is the single implementation of the rule. `addContradiction` applies it
 * when a contradiction arrives, and the store migration applies it to a merged
 * result — a merge can reach two contradictions without ever passing through
 * the demotion the first one would have caused, so the rule has to be
 * re-checkable rather than only incremental.
 *
 * - Two or more contradictions archive the entry regardless of prior
 *   confidence, and such an entry cannot remain at `high`.
 * - The first contradiction archives a `low` entry outright and otherwise
 *   drops confidence one level.
 *
 * @param {'low'|'medium'|'high'} confidence
 * @param {EvidenceRef[]} contradictedBy
 * @returns {{confidence: 'low'|'medium'|'high', archive: boolean}}
 */
export function applyContradictionInvariant(confidence, contradictedBy) {
  const count = Array.isArray(contradictedBy) ? contradictedBy.length : 0;

  if (count >= 2) {
    return { confidence: confidence === "high" ? "medium" : confidence, archive: true };
  }

  if (count === 1) {
    if (confidence === "low") return { confidence, archive: true };
    return { confidence: confidence === "high" ? "medium" : "low", archive: false };
  }

  return { confidence, archive: false };
}

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
    for (const file of await listScopeFiles(projectRoot)) {
      entries.push(...(await parseHeuristicsFile(file)));
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
export function mergeEvidence(existing, incoming) {
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

    // Preserve or refine tags (incoming wins when provided).
    if (Array.isArray(entry.tags) && entry.tags.length > 0) {
      finalEntry.tags = entry.tags;
    } else if (Array.isArray(existing.tags) && existing.tags.length > 0) {
      finalEntry.tags = existing.tags;
    }

    // `signature` is EXISTING-wins — deliberately the opposite of the
    // antiPattern/tags rule immediately above. Those are refinements; a
    // signature is an identity, and the charter states unconditionally that
    // it is never rewritten once assigned. First assignment sticks.
    //
    // The stored value is re-validated first. `validateEntry` only runs on the
    // incoming entry, and `parseHeuristicsFile` does not check the pattern, so
    // a hand-edited `signature: Bad Value` would otherwise be preferred over
    // every incoming value forever — existing-wins makes bad on-disk data
    // permanently unfixable in a way the incoming-wins fields are not.
    if (existing.signature !== undefined && SIGNATURE_PATTERN.test(existing.signature)) {
      finalEntry.signature = existing.signature;
      if (entry.signature !== undefined && entry.signature !== existing.signature) {
        // Reachable and informative rather than invalid: `id` and `signature`
        // key on different inputs, so one id can legitimately be reached by
        // two failure texts. Surfacing it is a real signal about id/signature
        // granularity; silently discarding it would hide that.
        process.stderr.write(
          `heuristics: signature divergence on '${finalEntry.id}' — kept stored '${existing.signature}', ignored incoming '${entry.signature}'\n`,
        );
      }
    } else if (entry.signature !== undefined) {
      if (existing.signature !== undefined) {
        process.stderr.write(
          `heuristics: discarded malformed stored signature '${existing.signature}' on '${finalEntry.id}'\n`,
        );
      }
      finalEntry.signature = entry.signature;
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

    if (Array.isArray(entry.tags) && entry.tags.length > 0) {
      finalEntry.tags = entry.tags;
    }

    if (entry.signature !== undefined) {
      finalEntry.signature = entry.signature;
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
export function serializeEntries(entries) {
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
  for (const file of await listScopeFiles(projectRoot)) {
    const fileEntries = await parseHeuristicsFile(file);
    const match = fileEntries.find((e) => e.id === id);
    if (match) {
      const scope = basename(file, ".md");
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
/**
 * @typedef {Object} RetrieveOptions
 * @property {number} [injectionLimit] - Total budget (default 8). 0 disables injection.
 * @property {string[]} [keywords] - Optional keywords for boosting matching entries. Capped at 10 keywords / 200 total chars.
 * @property {'index'|'summary'|'full'} [tier] - Rendering tier (passed through; not applied in retrieval).
 */

/**
 * Retrieve heuristics for injection into a context packet.
 *
 * Implements the dual-read protocol: reads module-scoped and _global heuristics,
 * merges, deduplicates by id (module-scoped wins), sorts by confidence then
 * keyword boost then scope-priority then recency, and applies the budget cap.
 *
 * @param {string} projectRoot - Absolute path to project root
 * @param {string} module - Module slug to retrieve heuristics for
 * @param {RetrieveOptions} [options]
 * @returns {Promise<Heuristic[]>} Budget-capped array of heuristics
 */
export async function retrieveHeuristics(projectRoot, module, { injectionLimit, keywords, tier } = {}) {
  // Parse and validate injectionLimit
  let limit = 8;
  if (injectionLimit !== undefined) {
    const parsed = Number(injectionLimit);
    if (Number.isInteger(parsed) && parsed >= 0) {
      limit = parsed;
    }
  }
  if (limit === 0) return [];

  // Dual-read: module + _global
  let moduleEntries, globalEntries;
  try {
    moduleEntries = module && module !== "_global"
      ? await readHeuristics(projectRoot, { module })
      : [];
  } catch { moduleEntries = []; }

  try {
    globalEntries = await readHeuristics(projectRoot, { module: "_global" });
  } catch { globalEntries = []; }

  // Normalize keywords: cap at 10, each capped at 200 chars total combined,
  // lowercase for case-insensitive matching.
  let normalizedKeywords = [];
  if (Array.isArray(keywords) && keywords.length > 0) {
    const capped = keywords.slice(0, 10);
    let totalLen = 0;
    normalizedKeywords = [];
    for (const kw of capped) {
      const s = String(kw).toLowerCase();
      totalLen += s.length;
      if (totalLen > 200) break;
      normalizedKeywords.push(s);
    }
  }

  // Tag entries with scope priority for sorting
  const tagged = [
    ...moduleEntries.map((e) => ({ ...e, _scopePriority: 0 })),
    ...globalEntries.map((e) => ({ ...e, _scopePriority: 1 })),
  ];

  // Dedup by id (module-scoped wins via order)
  const seen = new Set();
  const deduped = [];
  for (const entry of tagged) {
    if (!seen.has(entry.id)) {
      seen.add(entry.id);
      deduped.push(entry);
    }
  }

  // Compute keyword match flag per entry.
  if (normalizedKeywords.length > 0) {
    for (const entry of deduped) {
      const tagsStr = Array.isArray(entry.tags) ? entry.tags.join(" ").toLowerCase() : "";
      const titleStr = (entry.title || "").toLowerCase();
      const patternStr = (entry.pattern || "").toLowerCase();
      const searchTarget = `${tagsStr} ${titleStr} ${patternStr}`;
      entry._keywordMatch = normalizedKeywords.some((kw) => searchTarget.includes(kw));
    }
  } else {
    for (const entry of deduped) {
      entry._keywordMatch = false;
    }
  }

  // Sort: confidence DESC, keyword match DESC (boosted), scope priority ASC, updated DESC
  deduped.sort((a, b) => {
    const rankDiff = (CONFIDENCE_RANK[b.confidence] ?? 0) - (CONFIDENCE_RANK[a.confidence] ?? 0);
    if (rankDiff !== 0) return rankDiff;
    // Keyword match boost: matched entries come before unmatched at same confidence
    const kwA = a._keywordMatch ? 1 : 0;
    const kwB = b._keywordMatch ? 1 : 0;
    if (kwB !== kwA) return kwB - kwA;
    if (a._scopePriority !== b._scopePriority) return a._scopePriority - b._scopePriority;
    const au = a.updated || "";
    const bu = b.updated || "";
    if (bu < au) return -1;
    if (bu > au) return 1;
    return 0;
  });

  // Budget cap: exclude low, split high/medium
  const highMax = Math.ceil(limit * 5 / 8);
  const mediumMax = limit - highMax;
  let highCount = 0, mediumCount = 0;
  const result = [];

  for (const entry of deduped) {
    if (entry.confidence === "low") continue;
    if (entry.confidence === "high" && highCount < highMax) {
      highCount++;
      result.push(entry);
    } else if (entry.confidence === "medium" && mediumCount < mediumMax) {
      mediumCount++;
      result.push(entry);
    }
  }

  // Strip internal _scopePriority and _keywordMatch tags
  return result.map(({ _scopePriority, _keywordMatch, ...rest }) => rest);
}

/**
 * Truncate a string to `len` characters, appending "..." if truncated.
 * @param {string} str
 * @param {number} len
 * @returns {string}
 */
function truncate(str, len) {
  if (!str || str.length <= len) return str;
  return str.slice(0, len) + "...";
}

/**
 * Render a heuristic as a markdown block for injection into a context packet.
 *
 * @param {Heuristic} heuristic
 * @param {'index'|'summary'|'full'} [tier='summary'] - Rendering tier
 * @returns {string} Markdown block
 */
export function renderHeuristic(heuristic, tier = "summary") {
  // Validate tier; fall back to summary with a warning if invalid.
  const validTiers = new Set(["index", "summary", "full"]);
  if (!validTiers.has(tier)) {
    process.stderr.write(
      `heuristics: unknown render tier '${tier}', falling back to 'summary'\n`
    );
    tier = "summary";
  }

  if (tier === "index") {
    return `- ${heuristic.title} (${heuristic.scope}) — ${truncate(heuristic.pattern, 80)}`;
  }

  // summary and full share a base format
  const lines = [
    `### Heuristic: ${heuristic.title} (confidence: ${heuristic.confidence})`,
    `- **Pattern:** ${heuristic.pattern}`,
  ];
  if (heuristic.antiPattern) {
    lines.push(`- **Anti-pattern:** ${heuristic.antiPattern}`);
  }
  const count = Array.isArray(heuristic.evidence) ? heuristic.evidence.length : 0;
  lines.push(`- **Evidence:** ${count} observations`);

  if (tier === "full") {
    lines.push(`- **Scope:** ${heuristic.scope}`);
    const tags = Array.isArray(heuristic.tags) && heuristic.tags.length > 0
      ? heuristic.tags.join(", ")
      : "(none)";
    lines.push(`- **Tags:** ${tags}`);
  }

  return lines.join("\n");
}

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

  // The rules live in `applyContradictionInvariant` so the store migration
  // re-applies exactly this logic to a merged result rather than restating it.
  const { confidence: nextConfidence, archive: shouldArchive } =
    applyContradictionInvariant(entry.confidence, nextContradictedBy);

  if (shouldArchive) {
    // Write the updated entry (with the new contradictedBy) back to
    // the scope file first, so archiveHeuristic's read sees the full
    // contradictedBy history when it builds the archive copy.
    const persistedEntry = {
      ...entry,
      contradictedBy: nextContradictedBy,
      confidence: nextConfidence,
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

  // Non-archive path: the invariant dropped confidence one level.
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
