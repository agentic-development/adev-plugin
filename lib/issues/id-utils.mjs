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
 * - GitHub canonical IDs: "gh-<n>", "gh-<owner>.<repo>.<n>" (github: true)
 * - Returns null for unrecognized formats
 *
 * @param {string} id - The ID to parse
 * @param {Object} [tierConfig] - Override tier prefix map (default: DEFAULT_TIER_PREFIXES)
 * @returns {{ tier: string|null, depth: number, parent_id: string|null, prefix: string|null, counter: number|null, legacy: boolean, github?: true }|null}
 */
export function parseId(id, tierConfig = null) {
  if (!id || typeof id !== "string" || id.trim() === "") return null;

  const config = tierConfig || DEFAULT_TIER_PREFIXES;

  // Any `gh-` ID is decided here and never falls through: a repo named
  // `issue`, `epic` or `bd` must not be able to yield a legacy-shaped ID.
  if (id.startsWith("gh-")) {
    const cross = id.match(GH_CROSS_ID_RE);
    if (!GH_HOME_ID_RE.test(id) && !(cross && isGithubRepoName(cross[2]))) return null;
    return { tier: null, depth: 1, parent_id: null, prefix: "gh", counter: null, legacy: false, github: true };
  }

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

// GitHub canonical IDs. The cross-repo form is lossless only because an owner
// can never contain `.` and the number is all digits: the owner is everything
// before the first `.`, the number everything after the last, and the repo
// (which may itself contain `.`) everything between.
const GH_HOME_ID_RE = /^gh-(\d+)$/;
const GH_CROSS_ID_RE = /^gh-([a-z0-9-]+)\.([a-z0-9._-]+)\.(\d+)$/;
const GH_OWNER_RE = /^[a-z0-9-]+$/;
const GH_REPO_RE = /^[a-z0-9._-]+$/;
const GH_ISSUE_PATH_RE = /^\/([^/]+)\/([^/]+)\/issues\/(\d+)$/;

// `.` and `..` match the repo character class but are path segments, not
// repository names; GitHub refuses to create them.
function isGithubRepoName(repo) {
  return GH_REPO_RE.test(repo) && repo !== "." && repo !== "..";
}

function githubInvalidId(message) {
  const err = new Error(`GITHUB_INVALID_ID: ${message}`);
  err.code = "GITHUB_INVALID_ID";
  return err;
}

// Error messages name the refused input, but a URL's userinfo can carry a
// credential. Everything before the LAST `@` is dropped because that is where
// WHATWG URL ends userinfo, even when the password itself contains `@`.
function redactUserinfo(input) {
  if (typeof input !== "string" || !input.includes("@")) return input;
  return input.replace(/^([a-z][a-z0-9+.-]*:[\\/]*)?.*@/is, "$1***@");
}

function lowerHome(home) {
  return {
    owner: String(home?.owner ?? "").toLowerCase(),
    repo: String(home?.repo ?? "").toLowerCase(),
  };
}

/**
 * Encode a GitHub issue as its canonical adev ID: `gh-<n>` for the home repo,
 * `gh-<owner>.<repo>.<n>` (lowercased) for any other repo.
 *
 * @param {{ owner: string, repo: string, number: number }} issue
 * @param {{ owner: string, repo: string }} home - tasks.github home repo
 * @returns {string}
 * @throws {Error} code GITHUB_INVALID_ID when owner/repo/number cannot be encoded losslessly
 */
export function encodeGithubId({ owner, repo, number } = {}, home) {
  const o = String(owner ?? "").toLowerCase();
  const r = String(repo ?? "").toLowerCase();
  if (!GH_OWNER_RE.test(o) || !isGithubRepoName(r) || !Number.isSafeInteger(number) || number < 1) {
    throw githubInvalidId(`cannot encode ${JSON.stringify({ owner, repo, number })}`);
  }
  const h = lowerHome(home);
  if (o === h.owner && r === h.repo) return `gh-${number}`;
  return `gh-${o}.${r}.${number}`;
}

/**
 * Decode a canonical GitHub ID back to its repository coordinates.
 *
 * @param {string} id
 * @param {{ owner: string, repo: string }} home
 * @returns {{ owner: string, repo: string, number: number }}
 * @throws {Error} code GITHUB_INVALID_ID for anything that is not a canonical gh ID
 */
export function decodeGithubId(id, home) {
  const s = typeof id === "string" ? id : "";
  const homeMatch = s.match(GH_HOME_ID_RE);
  if (homeMatch) {
    const h = lowerHome(home);
    if (!h.owner || !h.repo) throw githubInvalidId(`no home repo to decode ${JSON.stringify(s)}`);
    return { owner: h.owner, repo: h.repo, number: Number(homeMatch[1]) };
  }
  const crossMatch = s.match(GH_CROSS_ID_RE);
  if (crossMatch && isGithubRepoName(crossMatch[2])) {
    return { owner: crossMatch[1], repo: crossMatch[2], number: Number(crossMatch[3]) };
  }
  throw githubInvalidId(`not a canonical GitHub ID: ${JSON.stringify(redactUserinfo(id))}`);
}

/**
 * Normalize user-supplied GitHub issue references to the canonical ID.
 *
 * Accepts `gh-…`, `#<n>`, `<n>`, `<owner>/<repo>#<n>`, and
 * `https://github.com/<owner>/<repo>/issues/<n>`. URLs carrying userinfo, a
 * port, a query or a fragment are refused, never stripped: stripping would
 * silently accept a URL whose authority or target differs from what it shows.
 *
 * @param {string} input
 * @param {{ owner: string, repo: string }} home
 * @returns {string}
 * @throws {Error} code GITHUB_INVALID_ID
 */
export function normalizeGithubIdInput(input, home) {
  const refuse = () => githubInvalidId(`not a GitHub issue reference: ${JSON.stringify(redactUserinfo(input))}`);
  if (typeof input !== "string" || input === "") throw refuse();

  const encode = (owner, repo, number) => {
    try {
      return encodeGithubId({ owner, repo, number }, home);
    } catch {
      throw refuse();
    }
  };

  if (input.startsWith("gh-")) {
    let decoded;
    try {
      decoded = decodeGithubId(input, home);
    } catch {
      throw refuse();
    }
    return encode(decoded.owner, decoded.repo, decoded.number);
  }

  const bare = input.match(/^#?(\d+)$/);
  if (bare) {
    const h = lowerHome(home);
    return encode(h.owner, h.repo, Number(bare[1]));
  }

  const display = input.match(/^([^/#\s]+)\/([^/#\s]+)#(\d+)$/);
  if (display) return encode(display[1], display[2], Number(display[3]));

  if (/^[a-z][a-z0-9+.-]*:/i.test(input)) {
    // The parser normalizes silently: it resolves `.`/`..` (also as `%2e`)
    // segments, drops a default port, tabs and newlines, and rewrites `\` and
    // `https:` without slashes. Requiring `href` to equal the input refuses all
    // of those. The raw-text check is the backstop for an empty `?` or `#`,
    // which `href` keeps while `search`/`hash` read as empty.
    if (!input.startsWith("https://github.com/") || /[@?#\s\\]/.test(input)) throw refuse();
    let url;
    try {
      url = new URL(input);
    } catch {
      throw refuse();
    }
    if (url.href !== input || url.protocol !== "https:" || url.hostname !== "github.com" || url.username || url.password ||
        url.port || url.search || url.hash) {
      throw refuse();
    }
    const path = url.pathname.match(GH_ISSUE_PATH_RE);
    if (!path) throw refuse();
    return encode(path[1], path[2], Number(path[3]));
  }

  throw refuse();
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
