/**
 * ID utilities for tiered hierarchy support.
 *
 * Provides parseId, nextChildId, getTierConfig for the tiered
 * Epic → Feature → Task (or custom) hierarchy.
 *
 * Uses only Node.js built-ins.
 */

import { randomBytes } from "node:crypto";

// Default tier prefix → tier label mapping.
// Overridable via manifest tasks.tier_prefixes.
export const DEFAULT_TIER_PREFIXES = Object.freeze({ e: "Epic", f: "Feature", t: "Task" });

// Legacy ID patterns that must not conflict with tier prefixes.
// These are prefix strings (before the "-") for legacy IDs.
const LEGACY_PATTERNS = ["epic", "issue", "bd"];

// Regex for a single tiered segment: one or more lowercase letters + one or more digits.
const SEGMENT_RE = /^([a-z]+)(\d+)$/;

// Regex for flat (non-tiered) IDs:
//   epic-N / issue-N        — sequential, minted before issue-613
//   epic-7k3f9a / issue-…   — merge-safe, minted now (see mintFlatId)
//   bd-XXXXXX               — beads-era ids
//
// Both numeric and base36 suffixes are accepted by the SAME arm on purpose:
// every caller of parseId branches on `legacy`, never on the suffix shape, so
// a merge-safe id must be recognized exactly as its sequential predecessor is
// or it silently becomes an "unrecognized id shape" — which
// lib/retro/issue-id-validation.mjs turns into a refused board lookup.
const LEGACY_RE = /^(epic-[a-z0-9]+|issue-[a-z0-9]+|bd-[a-z0-9]+)$/i;

/**
 * Length of the random suffix in a merge-safe flat id. 6 base36 characters is
 * ~2.2e9 values — with boards in the low thousands the birthday probability is
 * negligible, and `mintFlatId` re-rolls against the current board anyway.
 */
export const FLAT_ID_SUFFIX_LENGTH = 6;

/**
 * Mint a collision-free flat id such as `issue-7k3f9a` (issue-613).
 *
 * Sequential `max(existing) + 1` allocation is safe against concurrent writers
 * of ONE file (the CAS lock) and across worktrees (resolveStorageRoot), but not
 * across git BRANCHES: two sessions branching from the same baseline both mint
 * the same number, both are valid locally, and the collision only surfaces at
 * merge. That happened — two different `issue-589`s — and renumbering at merge
 * time only repairs the instance, not the mechanism.
 *
 * Randomness rather than a counter is what removes the coordination: no shared
 * state has to be consulted to know an id is unique, which is exactly the
 * property a branch cannot get. beads reached the same answer independently
 * (`bt-i6s`), and on that backend br's uniqueness constraint on `external_ref`
 * turns a residual collision into a rejected write rather than a silent
 * duplicate.
 *
 * Existing sequential ids are NEVER rewritten — they are quoted in merged
 * commits, specs, and prose. The two forms coexist permanently.
 *
 * @param {string} prefix - "issue" or "epic"
 * @param {Array<{id?: string}>} [existing] - current items, to re-roll against
 * @param {() => string} [randomFn] - injectable generator (tests)
 * @returns {string}
 */
export function mintFlatId(prefix, existing = [], randomFn = randomSuffix) {
  const taken = new Set((existing || []).map((i) => String(i?.id ?? "")));
  // Bounded re-roll. A collision here is already vanishingly unlikely; looping
  // forever on a pathological randomFn would be worse than surfacing it.
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = `${prefix}-${randomFn()}`;
    if (!taken.has(candidate)) return candidate;
  }
  const err = new Error(
    `Could not mint a unique ${prefix} id after 8 attempts — this indicates a ` +
      `degenerate id generator, not board size.`
  );
  err.code = "ID_MINT_EXHAUSTED";
  throw err;
}

/** Cryptographically-random base36 suffix. */
function randomSuffix() {
  // rejection-free: read more entropy than needed and map into base36.
  const bytes = randomBytes(FLAT_ID_SUFFIX_LENGTH);
  let out = "";
  for (const b of bytes) out += (b % 36).toString(36);
  return out;
}

/**
 * Validate and return the effective tier config.
 *
 * @param {Object|null|undefined} overrides - Map of { prefix: "TierLabel" } from manifest
 * @returns {Object} Validated tier config map
 * @throws {Error} with code INVALID_TIER_CONFIG if invalid
 */
export function getTierConfig(overrides) {
  if (!overrides) return { ...DEFAULT_TIER_PREFIXES };

  // Check for conflicting prefixes (matching legacy ID patterns)
  const prefixes = Object.keys(overrides);
  for (const prefix of prefixes) {
    if (LEGACY_PATTERNS.includes(prefix)) {
      const err = new Error(
        `INVALID_TIER_CONFIG: prefix "${prefix}" conflicts with a legacy ID pattern (${LEGACY_PATTERNS.join(", ")})`
      );
      err.code = "INVALID_TIER_CONFIG";
      err.offendingEntries = [prefix];
      throw err;
    }
  }

  // Check for duplicate labels (two different prefixes → same tier name)
  const labels = Object.values(overrides);
  const labelSet = new Set(labels);
  if (labelSet.size !== labels.length) {
    const seen = new Set();
    const duplicates = [];
    for (const label of labels) {
      if (seen.has(label)) duplicates.push(label);
      seen.add(label);
    }
    const err = new Error(
      `INVALID_TIER_CONFIG: duplicate tier labels detected: ${duplicates.join(", ")}`
    );
    err.code = "INVALID_TIER_CONFIG";
    err.offendingEntries = duplicates;
    throw err;
  }

  return { ...overrides };
}

/**
 * Parse a work item ID into its structural components.
 *
 * Supports:
 * - Tiered dotted IDs: "e1", "e1.f2", "e1.f2.t3", etc.
 * - Legacy flat IDs: "epic-N", "issue-N", "bd-XXXXXX"
 * - Returns null for unrecognized formats
 *
 * @param {string} id - The ID to parse
 * @param {Object} [tierConfig] - Override tier prefix map (default: DEFAULT_TIER_PREFIXES)
 * @returns {{ tier: string|null, depth: number, parent_id: string|null, prefix: string|null, counter: number|null, legacy: boolean }|null}
 */
export function parseId(id, tierConfig = null) {
  if (!id || typeof id !== "string" || id.trim() === "") return null;

  const config = tierConfig || DEFAULT_TIER_PREFIXES;

  // Check legacy first
  if (LEGACY_RE.test(id)) {
    return { tier: null, depth: 1, parent_id: null, prefix: null, counter: null, legacy: true };
  }

  // Try tiered dotted ID
  const segments = id.split(".");
  if (segments.length === 0) return null;

  // Validate each segment
  for (const seg of segments) {
    if (!seg) return null; // empty segment (e.g. "e1..t2")
    if (!SEGMENT_RE.test(seg)) return null;
  }

  // Validate all prefixes against config
  for (const seg of segments) {
    const m = seg.match(SEGMENT_RE);
    const segPrefix = m[1];
    if (!config[segPrefix]) return null;
  }

  // All valid — extract final segment info
  const lastSeg = segments[segments.length - 1];
  const match = lastSeg.match(SEGMENT_RE);
  const prefix = match[1];
  const counter = parseInt(match[2], 10);
  const tier = config[prefix];
  const depth = segments.length;
  const parent_id = depth > 1 ? segments.slice(0, -1).join(".") : null;

  return { tier, depth, parent_id, prefix, counter, legacy: false };
}

/**
 * Generate the next child ID for a parent, scanning existing items for monotonicity.
 *
 * Rules:
 * - If parentId is non-null: next child ID is "<parentId>.<tierPrefix><N+1>"
 *   where N is the max counter among items matching "<parentId>.<tierPrefix><digit>"
 * - If parentId is null (root tier): scans items matching "<tierPrefix><digit>" at root
 * - Closed/deleted children do NOT free their counter (monotonic)
 *
 * @param {string|null} parentId - Parent item ID, or null for root-level items
 * @param {string} tierPrefix - Single-char (or multi-char) prefix for the new tier
 * @param {Array<{id: string}>} allItems - All known work items to scan
 * @returns {string} The next child ID
 */
export function nextChildId(parentId, tierPrefix, allItems) {
  let max = 0;

  if (parentId === null || parentId === undefined) {
    // Root-level: match "<tierPrefix><digits>" with no dots
    const pattern = new RegExp(`^${escapeRegex(tierPrefix)}(\\d+)$`);
    for (const item of allItems) {
      const m = item.id.match(pattern);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > max) max = n;
      }
    }
    return `${tierPrefix}${max + 1}`;
  }

  // Child: match "<parentId>.<tierPrefix><digits>" — exactly one more segment
  // We do NOT want to match deeper descendants like e1.f1.t1 when scanning for e1.f children
  const directPattern = new RegExp(
    `^${escapeRegex(parentId)}\\.${escapeRegex(tierPrefix)}(\\d+)$`
  );
  for (const item of allItems) {
    const m = item.id.match(directPattern);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }

  return `${parentId}.${tierPrefix}${max + 1}`;
}

/**
 * Escape special regex characters in a string.
 * @param {string} str
 * @returns {string}
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
