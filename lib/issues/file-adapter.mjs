/**
 * File-based issue adapter.
 *
 * Stores epics and issues in a single markdown file at
 * .context-index/tasks/tasks.md with two tables (Epics, Issues).
 *
 * Uses only Node.js built-ins: fs, path, crypto.
 *
 * ## Unified create() API (issue-78)
 *
 * create({ title, parent_id, type, spec_ref, ... }) infers tier prefix
 * from parent_id depth + 1 in TierConfig. Root items default to "e" prefix.
 * Explicit tier_prefix overrides inference.
 *
 * ## Unified close() API (issue-78)
 *
 * close(id, reason) applies cascade guard for tiered IDs (CASCADE_BLOCKED if
 * unclosed children exist) and dependency guard for all IDs. Legacy flat IDs
 * skip the cascade guard.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseId, getTierConfig } from "./id-utils.mjs";
import { parseTasksMd } from "./markdown-parser.mjs";

// CON-5: canonical deprecation message for read-only-deprecated mode.
// `file` backend is read-only for one release cycle; writes throw with this message.
const DEPRECATION_MESSAGE =
  "The `file` (markdown) backend is read-only. Run `adev migrate` to upgrade to " +
  "JSON, or set `tasks.backend: json` in `manifest.yaml`.";

function deprecatedWrite() {
  const err = new Error(DEPRECATION_MESSAGE);
  err.code = "BACKEND_READ_ONLY_DEPRECATED";
  return err;
}

export class FileAdapter {
  /**
   * @param {string} projectRoot
   * @param {object} [opts]
   * @param {Object|null} [opts.tierPrefixes] - Override tier prefix map from manifest
   */
  constructor(projectRoot, opts = {}) {
    this.name = "file";
    this.projectRoot = projectRoot;
    this.filePath = join(projectRoot, ".context-index", "tasks", "tasks.md");
    // Validate and store tier config at construction time (throws INVALID_TIER_CONFIG if bad)
    this.tierConfig = getTierConfig(opts.tierPrefixes || null);
  }

  async init() {
    // CON-5: `file` backend is read-only-deprecated. init() is a no-op so the
    // registry can call it idempotently without producing markdown writes.
    // New scaffolds should use the `json` backend.
  }

  _read() {
    if (!existsSync(this.filePath)) {
      return { epics: [], issues: [] };
    }

    const content = readFileSync(this.filePath, "utf8");
    // Delegate to the shared markdown parser (SA-3). Drop the `version` field —
    // FileAdapter's callers operate on `{ epics, issues }` only.
    const { epics, issues } = parseTasksMd(content);
    return { epics, issues };
  }

  /**
   * Unified create() — write methods are read-only-deprecated in this backend.
   * @deprecated The `file` backend no longer permits writes. Use the `json` backend.
   */
  async create(_issueData) {
    throw deprecatedWrite();
  }

  async update(_id, _changes) {
    throw deprecatedWrite();
  }

  /**
   * Unified close(): applies cascade guard for tiered IDs, dependency guard for all IDs.
   *
   * - For tiered IDs: throws CASCADE_BLOCKED if unclosed descendants exist
   * - For legacy flat IDs: cascade guard NOT applied (only dependency guard)
   *
   * @param {string} id
   * @param {string} reason
   * @returns {Promise<import('./interface.mjs').Issue>}
   */
  async close(_id, _reason) {
    throw deprecatedWrite();
  }

  async list(filters = {}) {
    const { issues } = this._read();
    let result = issues;

    if (filters.status) result = result.filter((i) => i.status === filters.status);
    if (filters.type) result = result.filter((i) => i.type === filters.type);
    if (filters.epicId) result = result.filter((i) => i.epicId === filters.epicId);
    if (filters.planRef) result = result.filter((i) => i.planRef === filters.planRef);

    // Sort by priority (0 first) then creation date
    result.sort((a, b) => a.priority - b.priority || a.created.localeCompare(b.created));
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

  /**
   * Create a legacy epic.
   * @deprecated Use create({ type: "epic", ... }) instead.
   *             Set ADEV_DEPRECATION_WARN=1 to see a warning.
   * @param {Partial<import('./interface.mjs').Epic>} epicData
   * @returns {Promise<import('./interface.mjs').Epic>}
   */
  async createEpic(_epicData) {
    throw deprecatedWrite();
  }

  /**
   * Update a legacy epic.
   * @deprecated Use update(id, changes) instead.
   *             Set ADEV_DEPRECATION_WARN=1 to see a warning.
   * @param {string} id
   * @param {Partial<import('./interface.mjs').Epic>} changes
   * @returns {Promise<import('./interface.mjs').Epic>}
   */
  async updateEpic(_id, _changes) {
    throw deprecatedWrite();
  }

  async addDependency(_issueId, _dependsOnId) {
    throw deprecatedWrite();
  }

  /**
   * Create a tiered work item with a pre-specified dotted ID.
   * @deprecated This is a thin wrapper around create() for back-compat.
   *             Prefer create({ parent_id, ... }) for new code.
   *
   * Tiered items are stored in the Issues table alongside legacy issues.
   * The caller must supply the full ID (e.g. "e1", "e1.f2", "e1.f2.t3").
   *
   * @param {Object} itemData - Must include id and title; other fields optional
   * @returns {Promise<Object>} The created work item
   */
  async createTiered(_itemData) {
    throw deprecatedWrite();
  }

  /**
   * Return all work items (legacy + tiered) from the Issues table.
   * Unlike list(), no sorting or filtering is applied.
   *
   * @returns {Promise<Array>}
   */
  async listAll() {
    const { issues } = this._read();
    return issues;
  }

  /**
   * Return all descendants of parentId via prefix match on their IDs.
   * Results are sorted by ID for stable ordering.
   *
   * - For legacy IDs (epic-N, issue-N, bd-XXXXXX): returns empty list
   * - For invalid/unrecognized IDs: returns empty list
   * - For tiered IDs: returns all items whose ID starts with "<parentId>."
   *
   * @param {string} parentId
   * @returns {Promise<Array>}
   */
  async walkTree(parentId) {
    const parsed = parseId(parentId, this.tierConfig);

    // Legacy IDs and unrecognized IDs → empty list
    if (!parsed || parsed.legacy) return [];

    const { issues } = this._read();
    const prefix = `${parentId}.`;
    const descendants = issues.filter((i) => i.id.startsWith(prefix));
    descendants.sort((a, b) => a.id.localeCompare(b.id));
    return descendants;
  }

  /**
   * Close a tiered work item with cascade guard.
   * @deprecated This is a thin wrapper around close() for back-compat.
   *             The unified close() now handles cascade guard for all tiered IDs.
   *
   * @param {string} id - Tiered item ID
   * @param {string} reason - Reason for closing
   * @returns {Promise<Object>}
   */
  async closeTiered(id, reason) {
    // Delegate to unified close() — it already handles cascade guard for tiered IDs
    return this.close(id, reason);
  }
}

export default FileAdapter;
