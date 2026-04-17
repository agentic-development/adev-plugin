/**
 * ID utilities for tiered hierarchy support.
 *
 * Provides parseId, nextChildId, getTierConfig for the tiered
 * Epic → Feature → Task (or custom) hierarchy.
 *
 * Uses only Node.js built-ins.
 */

// Default tier prefix → tier label mapping.
// Overridable via manifest tasks.tier_prefixes.
export const DEFAULT_TIER_PREFIXES = Object.freeze({ e: "Epic", f: "Feature", t: "Task" });

// Legacy ID patterns that must not conflict with tier prefixes.
// These are prefix strings (before the "-") for legacy IDs.
const LEGACY_PATTERNS = ["epic", "issue", "bd"];

// Regex for a single tiered segment: one or more lowercase letters + one or more digits.
const SEGMENT_RE = /^([a-z]+)(\d+)$/;

// Regex for legacy IDs:
//   epic-N  (N = digits)
//   issue-N
//   bd-XXXXXX (hex or alphanumeric)
const LEGACY_RE = /^(epic-\d+|issue-\d+|bd-[a-z0-9]+)$/i;

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
