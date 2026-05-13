/**
 * JSON-backed issue board adapter (`tasks.json`).
 *
 * Implements `IssueManagerInterface` (the same contract as `FileAdapter` and
 * `BeadsAdapter`), but stores the board in a single JSON document:
 *
 *   {
 *     "version": 2,
 *     "epics":   [...],
 *     "issues":  [...]
 *   }
 *
 * Writes are atomic via temp-file-then-rename (mirroring
 * `lib/build-state.mjs::atomicWriteJson`). Reads tolerate the absence of
 * `tasks.json` and may fall back to `tasks.md` via the shared
 * `lib/issues/markdown-parser.mjs` helper when `tasks.legacy_read` is enabled.
 *
 * Board-granularity invariant: `create`/`update` reject any payload that
 * would land an issue with `planTask` set. Plan-task state belongs in the
 * lifecycle event log (`lib/lifecycle-state.mjs::reportPlanTask`), not on
 * the board. Legacy issues with both fields populated are tolerated on
 * read (CON-3) and may be updated without touching those fields.
 *
 * Uses only Node.js built-ins: fs, path, crypto.
 */

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { join, resolve, sep } from "node:path";
import { randomBytes } from "node:crypto";
import {
  validateIssue,
  validateStatusTransition,
  validateEpic,
  detectCycle,
  checkCloseGuard,
} from "./interface.mjs";
import { parseId, getTierConfig, nextChildId } from "./id-utils.mjs";
import { parseTasksMd } from "./markdown-parser.mjs";

const DEFAULT_ROOT_PREFIX = "e";
const CANONICAL_VERSION = 2;
const STORAGE_REL_DIR = join(".context-index", "tasks");
const STORAGE_REL_FILE = join(STORAGE_REL_DIR, "tasks.json");
const LEGACY_REL_FILE = join(STORAGE_REL_DIR, "tasks.md");
const MANIFEST_REL = join(".context-index", "manifest.yaml");

const GRANULARITY_MESSAGE =
  "Board granularity violation: plan tasks belong in the lifecycle event log, " +
  "not on the issue board. See `lib/lifecycle-state.mjs::reportPlanTask`.";

export const UNSUPPORTED_VERSION_FALLBACK =
  "tasks.json version field is not a valid integer >= 2. Run `adev migrate` to upgrade.";

// ---------------------------------------------------------------------------
// Path-safety helpers
// ---------------------------------------------------------------------------

/**
 * Enforce path containment: `target` must resolve under `baseDir`.
 * Both arguments are absolute paths.
 */
function assertWithin(baseDir, target, errCode = "INVALID_STORAGE_PATH") {
  const resolvedBase = resolve(baseDir);
  const resolvedTarget = resolve(target);
  const prefix = resolvedBase.endsWith(sep) ? resolvedBase : resolvedBase + sep;
  if (!(resolvedTarget === resolvedBase || resolvedTarget.startsWith(prefix))) {
    const err = new Error(
      `Resolved path "${resolvedTarget}" escapes storage root "${resolvedBase}"`
    );
    err.code = errCode;
    throw err;
  }
  return resolvedTarget;
}

/**
 * Validate that `projectRoot` is a directory containing `.context-index/manifest.yaml`.
 * Throws `INVALID_PROJECT_ROOT` if it is missing.
 */
function assertProjectRoot(projectRoot) {
  if (!projectRoot || typeof projectRoot !== "string") {
    const err = new Error("projectRoot must be a non-empty string path");
    err.code = "INVALID_PROJECT_ROOT";
    throw err;
  }
  const resolved = resolve(projectRoot);
  const manifestPath = join(resolved, MANIFEST_REL);
  if (!existsSync(manifestPath)) {
    const err = new Error(
      `projectRoot "${resolved}" does not contain ${MANIFEST_REL}`
    );
    err.code = "INVALID_PROJECT_ROOT";
    throw err;
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// MALFORMED_BOARD message helpers (SEC-1)
// ---------------------------------------------------------------------------

/**
 * Strip non-printable characters and truncate to <= 200 chars. Used to
 * build a safe context prefix for MALFORMED_BOARD messages so we never
 * embed raw file content directly into an error.
 */
function safePrefix(raw) {
  if (typeof raw !== "string") return "";
  // Drop ASCII control characters except space and tab; truncate to 200.
  const stripped = raw.replace(/[\x00-\x08\x0B-\x1F\x7F]/g, "");
  return stripped.slice(0, 200);
}

/**
 * Extract a `line N, column M` pair from a `JSON.parse` error message,
 * which on modern Node.js looks like:
 *   "Unexpected token ... in JSON at position N"
 *   or "... at line X column Y"
 * Falls back to scanning the source for position-N to compute (line, col).
 */
function locateJsonError(rawError, source) {
  const msg = rawError && rawError.message ? rawError.message : "";
  let line = null;
  let column = null;
  const lcMatch = /line\s+(\d+)\s+column\s+(\d+)/i.exec(msg);
  if (lcMatch) {
    line = Number(lcMatch[1]);
    column = Number(lcMatch[2]);
  } else {
    const posMatch = /at position\s+(\d+)/i.exec(msg);
    if (posMatch && typeof source === "string") {
      const pos = Math.max(0, Math.min(source.length, Number(posMatch[1])));
      const upTo = source.slice(0, pos);
      line = upTo.split("\n").length;
      const lastNl = upTo.lastIndexOf("\n");
      column = lastNl === -1 ? pos + 1 : pos - lastNl;
    }
  }
  return { line: line ?? 1, column: column ?? 1 };
}

// ---------------------------------------------------------------------------
// JsonAdapter
// ---------------------------------------------------------------------------

export class JsonAdapter {
  /**
   * @param {string} projectRoot Absolute path containing `.context-index/manifest.yaml`
   * @param {object} [opts]
   * @param {Object|null} [opts.tierPrefixes]   Override tier prefix map from manifest
   * @param {string}      [opts.legacyRead]    "enabled" (default) | "disabled"
   */
  constructor(projectRoot, opts = {}) {
    this.name = "json";

    // SEC-2: validate projectRoot (must contain .context-index/manifest.yaml).
    this.projectRoot = assertProjectRoot(projectRoot);

    // Storage root (callers may have already resolved via `resolveStorageRoot`).
    this.storageRoot = this.projectRoot;

    // SEC-2 / CWE-22: compute storage paths once, assert containment.
    this.storageDir = join(this.storageRoot, STORAGE_REL_DIR);
    this.filePath = join(this.storageRoot, STORAGE_REL_FILE);
    this.legacyFilePath = join(this.storageRoot, LEGACY_REL_FILE);
    assertWithin(this.storageDir, this.filePath, "INVALID_STORAGE_PATH");
    assertWithin(this.storageDir, this.legacyFilePath, "INVALID_STORAGE_PATH");

    // Validate and store tier config (parity with FileAdapter).
    this.tierConfig = getTierConfig(opts.tierPrefixes || null);

    // Legacy-read knob. Default: enabled.
    this.legacyRead = opts.legacyRead === "disabled" ? "disabled" : "enabled";

    // One-time advisory state (SA-4).
    this._legacyAdvisoryEmitted = false;
  }

  // ---------------------------------------------------------------------------
  // Internal primitives
  // ---------------------------------------------------------------------------

  /**
   * Validate an arbitrary payload against the board-granularity invariant.
   * Throws `BOARD_GRANULARITY_VIOLATION` if the payload would land an issue
   * with a non-null `planTask`. `planRef` alone is permitted.
   *
   * @param {Partial<import('./interface.mjs').Issue>} payload
   */
  static _validateBoardGranularity(payload) {
    if (!payload || typeof payload !== "object") return;
    const pt = payload.planTask;
    if (pt !== undefined && pt !== null && pt !== "") {
      const err = new Error(GRANULARITY_MESSAGE);
      err.code = "BOARD_GRANULARITY_VIOLATION";
      throw err;
    }
  }

  /**
   * Validate the parsed top-level shape and version. Throws:
   *   INVALID_BOARD_SHAPE   - shape isn't { version, epics, issues }
   *   UNSUPPORTED_BOARD_VERSION - version coerces to < 2 or isn't an integer
   */
  static _validateBoardDocument(parsed) {
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      const err = new Error(
        "tasks.json: top-level shape must be { version, epics: [], issues: [] }"
      );
      err.code = "INVALID_BOARD_SHAPE";
      throw err;
    }
    if (!Array.isArray(parsed.epics) || !Array.isArray(parsed.issues)) {
      const err = new Error(
        "tasks.json: `epics` and `issues` must both be arrays"
      );
      err.code = "INVALID_BOARD_SHAPE";
      throw err;
    }

    const v = parsed.version;
    // Coerce only number-like values; reject everything else with the fixed message.
    const coerced =
      typeof v === "number"
        ? v
        : typeof v === "string" && /^-?\d+$/.test(v.trim())
        ? Number(v)
        : NaN;

    if (!Number.isFinite(coerced) || !Number.isInteger(coerced)) {
      const err = new Error(UNSUPPORTED_VERSION_FALLBACK);
      err.code = "UNSUPPORTED_BOARD_VERSION";
      throw err;
    }
    if (coerced < CANONICAL_VERSION) {
      const err = new Error(
        `tasks.json version ${coerced} is not supported. Run \`adev migrate\` to upgrade.`
      );
      err.code = "UNSUPPORTED_BOARD_VERSION";
      throw err;
    }
  }

  /**
   * Read the board from disk.
   *
   * Order:
   *   1. If `tasks.json` exists → parse + validate.
   *   2. Else if `tasks.md` exists AND legacyRead enabled → parse via
   *      `parseTasksMd`. Emit one-time LEGACY_FORMAT_DETECTED advisory.
   *   3. Else → empty board.
   *
   * @returns {{ version: number, epics: object[], issues: object[] }}
   */
  _read() {
    if (existsSync(this.filePath)) {
      const raw = readFileSync(this.filePath, "utf8");
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (parseErr) {
        const { line, column } = locateJsonError(parseErr, raw);
        const prefix = safePrefix(raw);
        const err = new Error(
          `tasks.json: malformed JSON at line ${line}, column ${column}. ` +
          `Context prefix (<=200 chars, control chars stripped): "${prefix}"`
        );
        err.code = "MALFORMED_BOARD";
        throw err;
      }
      JsonAdapter._validateBoardDocument(parsed);
      return parsed;
    }

    // Legacy fallback (SA-3, SA-4)
    if (this.legacyRead !== "disabled" && existsSync(this.legacyFilePath)) {
      const md = readFileSync(this.legacyFilePath, "utf8");
      const board = parseTasksMd(md);
      if (!this._legacyAdvisoryEmitted) {
        this._legacyAdvisoryEmitted = true;
        // SA-4: one-time advisory on legacy detection.
        process.stderr.write(
          "[adev] LEGACY_FORMAT_DETECTED: reading tasks.md via the JSON adapter's " +
          "legacy fallback. Run `adev migrate` for an explicit conversion. " +
          "(This message appears once per process.)\n"
        );
      }
      // Normalize to canonical version on read (write will emit version 2).
      return { version: CANONICAL_VERSION, epics: board.epics, issues: board.issues };
    }

    return { version: CANONICAL_VERSION, epics: [], issues: [] };
  }

  /**
   * Atomically persist a board document via temp-file-then-rename. Mirrors
   * `lib/build-state.mjs::atomicWriteJson`. On failure between write and
   * rename, best-effort `unlinkSync` cleans up the temp file (CON-6).
   *
   * Always emits `version: 2` regardless of input (SA-5).
   *
   * @param {{ version?: number, epics: object[], issues: object[] }} data
   */
  _write(data) {
    // Make sure the directory exists.
    mkdirSync(this.storageDir, { recursive: true });

    // Compose the canonical document (always emit version 2 — SA-5).
    const document = {
      version: CANONICAL_VERSION,
      epics: Array.isArray(data.epics) ? data.epics : [],
      issues: Array.isArray(data.issues) ? data.issues : [],
    };

    const tmpName = this.filePath + "." + randomBytes(4).toString("hex") + ".tmp";

    // SEC-2: assert the temp path is inside the storage directory too.
    assertWithin(this.storageDir, tmpName, "INVALID_STORAGE_PATH");

    let renamed = false;
    try {
      writeFileSync(tmpName, JSON.stringify(document, null, 2) + "\n");
      renameSync(tmpName, this.filePath);
      renamed = true;
    } finally {
      if (!renamed) {
        // Best-effort cleanup of orphan temp file (CON-6). Swallow errors.
        try { unlinkSync(tmpName); } catch { /* ignore */ }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // ID generation helpers (parity with FileAdapter)
  // ---------------------------------------------------------------------------

  _nextIssueId(issues) {
    let max = 0;
    for (const issue of issues) {
      const m = /^issue-(\d+)$/.exec(issue.id || "");
      if (m) {
        const num = parseInt(m[1], 10);
        if (num > max) max = num;
      }
    }
    return `issue-${max + 1}`;
  }

  _nextEpicId(epics) {
    let max = 0;
    for (const epic of epics) {
      const m = /^epic-(\d+)$/.exec(epic.id || "");
      if (m) {
        const num = parseInt(m[1], 10);
        if (num > max) max = num;
      }
    }
    return `epic-${max + 1}`;
  }

  _tierPrefixOrder() {
    return Object.keys(this.tierConfig);
  }

  // ---------------------------------------------------------------------------
  // IssueManagerInterface
  // ---------------------------------------------------------------------------

  async init() {
    mkdirSync(this.storageDir, { recursive: true });
    if (!existsSync(this.filePath)) {
      this._write({ version: CANONICAL_VERSION, epics: [], issues: [] });
    }
    // Idempotent: file already exists → no-op.
  }

  async create(issueData) {
    // Granularity invariant first — reject before any board mutation. (SA-2)
    JsonAdapter._validateBoardGranularity(issueData);

    const issue = validateIssue(issueData);
    const board = this._read();
    const { epics, issues } = board;

    const hasTierIntent = issueData.parent_id || issueData.tier_prefix;

    if (!hasTierIntent) {
      // Legacy path: assign a flat "issue-N" ID.
      issue.id = this._nextIssueId(issues);
      issues.push(issue);
      this._write({ ...board, epics, issues });
      return issue;
    }

    // Tiered path
    const prefixOrder = this._tierPrefixOrder();
    const maxDepth = prefixOrder.length;

    let resolvedPrefix;
    let resolvedParentId = issueData.parent_id || null;

    if (resolvedParentId) {
      const parentItem = issues.find((i) => i.id === resolvedParentId);
      if (!parentItem) {
        const err = new Error(`Parent not found: ${resolvedParentId}`);
        err.code = "PARENT_NOT_FOUND";
        throw err;
      }
      const parsed = parseId(resolvedParentId, this.tierConfig);
      if (!parsed || parsed.legacy) {
        if (!issueData.tier_prefix) {
          const err = new Error(
            `Cannot infer tier prefix for child of legacy ID "${resolvedParentId}". ` +
            `Provide explicit tier_prefix.`
          );
          err.code = "INVALID_TIER_PREFIX";
          throw err;
        }
        resolvedPrefix = issueData.tier_prefix;
      } else {
        const parentDepth = parsed.depth;
        if (parentDepth >= maxDepth) {
          const err = new Error(
            `Cannot create child of ${resolvedParentId}: parent is already at max ` +
            `tier depth (${parentDepth}) per TierConfig.`
          );
          err.code = "MAX_DEPTH_EXCEEDED";
          throw err;
        }
        resolvedPrefix = issueData.tier_prefix || prefixOrder[parentDepth];
      }
    } else {
      resolvedPrefix = issueData.tier_prefix || DEFAULT_ROOT_PREFIX;
    }

    if (issueData.tier_prefix && !this.tierConfig[issueData.tier_prefix]) {
      const err = new Error(
        `tier_prefix "${issueData.tier_prefix}" is not in TierConfig. Valid: ` +
        Object.keys(this.tierConfig).join(", ")
      );
      err.code = "INVALID_TIER_PREFIX";
      throw err;
    }

    const newId = nextChildId(resolvedParentId, resolvedPrefix, issues);

    if (issueData.id && issueData.id !== newId) {
      const explicitParsed = parseId(issueData.id, this.tierConfig);
      if (!explicitParsed || explicitParsed.legacy || explicitParsed.prefix !== resolvedPrefix) {
        const err = new Error(
          `ID mismatch: explicit id "${issueData.id}" is inconsistent with inferred ` +
          `prefix "${resolvedPrefix}" for parent_id "${resolvedParentId}"`
        );
        err.code = "ID_MISMATCH";
        throw err;
      }
    }

    issue.id = newId;
    if (resolvedParentId) issue.parent_id = resolvedParentId;

    issues.push(issue);
    this._write({ ...board, epics, issues });
    return issue;
  }

  async update(id, changes) {
    const board = this._read();
    const { epics, issues } = board;
    const idx = issues.findIndex((i) => i.id === id);
    if (idx === -1) {
      const err = new Error(`Issue not found: ${id}`);
      err.code = "NOT_FOUND";
      throw err;
    }

    validateStatusTransition(issues[idx].status, changes);

    // Granularity guard: if the merged result would carry a non-null planTask
    // AND the planTask field is being modified by this call, reject (SA-2).
    // Updates that don't touch planTask on a legacy issue are tolerated (CON-3).
    if (Object.prototype.hasOwnProperty.call(changes, "planTask")) {
      JsonAdapter._validateBoardGranularity({ planTask: changes.planTask });
    }

    const updated = { ...issues[idx], ...changes, updated: new Date().toISOString() };
    updated.id = issues[idx].id;
    updated.created = issues[idx].created;
    issues[idx] = updated;
    this._write({ ...board, epics, issues });
    return updated;
  }

  async close(id, reason) {
    const board = this._read();
    const { epics, issues } = board;
    const idx = issues.findIndex((i) => i.id === id);
    if (idx === -1) {
      const err = new Error(`Issue not found: ${id}`);
      err.code = "NOT_FOUND";
      throw err;
    }

    // Cascade guard for tiered IDs.
    const parsed = parseId(id, this.tierConfig);
    if (parsed && !parsed.legacy) {
      const prefix = `${id}.`;
      const unclosedChildren = issues.filter(
        (i) => i.id.startsWith(prefix) && i.status !== "closed"
      );
      if (unclosedChildren.length > 0) {
        const childIds = unclosedChildren.map((c) => c.id).join(", ");
        const err = new Error(
          `Cannot close ${id}: blocked by unclosed children: ${childIds}. Close children first.`
        );
        err.code = "CASCADE_BLOCKED";
        err.blockers = unclosedChildren.map((c) => c.id);
        throw err;
      }
    }

    // Dependency guard.
    checkCloseGuard(id, issues);

    const now = new Date().toISOString();
    const notes = issues[idx].notes
      ? `${issues[idx].notes}; Closed: ${reason}`
      : `Closed: ${reason}`;

    issues[idx] = { ...issues[idx], status: "closed", notes, updated: now };
    this._write({ ...board, epics, issues });
    return issues[idx];
  }

  async list(filters = {}) {
    const { issues } = this._read();
    let result = issues;

    if (filters.status) result = result.filter((i) => i.status === filters.status);
    if (filters.type) result = result.filter((i) => i.type === filters.type);
    if (filters.epicId) result = result.filter((i) => i.epicId === filters.epicId);
    if (filters.planRef) result = result.filter((i) => i.planRef === filters.planRef);

    result = [...result].sort(
      (a, b) =>
        (a.priority ?? 2) - (b.priority ?? 2) ||
        (a.created || "").localeCompare(b.created || "")
    );
    return result;
  }

  async get(id) {
    const { issues } = this._read();
    return issues.find((i) => i.id === id) || null;
  }

  async listEpics(filters = {}) {
    const { epics } = this._read();
    let result = epics;
    if (filters.status) result = result.filter((e) => e.status === filters.status);
    if (filters.milestone) result = result.filter((e) => e.milestone === filters.milestone);
    return result;
  }

  async createEpic(epicData) {
    if (process.env.ADEV_DEPRECATION_WARN === "1") {
      console.warn("createEpic is deprecated; use create() instead.");
    }
    const epic = validateEpic(epicData);
    const board = this._read();
    epic.id = this._nextEpicId(board.epics);
    const epics = [...board.epics, epic];
    this._write({ ...board, epics });
    return epic;
  }

  async updateEpic(id, changes) {
    if (process.env.ADEV_DEPRECATION_WARN === "1") {
      console.warn("updateEpic is deprecated; use update() instead.");
    }
    const board = this._read();
    const idx = board.epics.findIndex((e) => e.id === id);
    if (idx === -1) {
      const err = new Error(`Epic not found: ${id}`);
      err.code = "NOT_FOUND";
      throw err;
    }
    const epics = [...board.epics];
    const updated = { ...epics[idx], ...changes, updated: new Date().toISOString() };
    updated.id = epics[idx].id;
    updated.created = epics[idx].created;
    epics[idx] = updated;
    this._write({ ...board, epics });
    return updated;
  }

  async addDependency(issueId, dependsOnId) {
    const board = this._read();
    const issues = [...board.issues];
    const idx = issues.findIndex((i) => i.id === issueId);
    if (idx === -1) {
      const err = new Error(`Issue not found: ${issueId}`);
      err.code = "NOT_FOUND";
      throw err;
    }

    const depsMap = {};
    for (const issue of issues) {
      depsMap[issue.id] = issue.dependencies || [];
    }
    detectCycle(issueId, dependsOnId, depsMap);

    issues[idx] = { ...issues[idx], dependencies: [...(issues[idx].dependencies || [])] };
    if (!issues[idx].dependencies.includes(dependsOnId)) {
      issues[idx].dependencies.push(dependsOnId);
      issues[idx].updated = new Date().toISOString();
    }
    this._write({ ...board, issues });
  }

  async walkTree(parentId) {
    const parsed = parseId(parentId, this.tierConfig);
    if (!parsed || parsed.legacy) return [];

    const { issues } = this._read();
    const prefix = `${parentId}.`;
    return issues
      .filter((i) => i.id.startsWith(prefix))
      .sort((a, b) => a.id.localeCompare(b.id));
  }
}

export default JsonAdapter;
