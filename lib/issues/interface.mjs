/**
 * Issue Manager interface and shared utilities.
 *
 * Defines the contract that backend adapters (file, beads) must implement.
 * Follows the lib/provider/interface.mjs pattern.
 *
 * Uses only Node.js built-ins.
 */

/**
 * @typedef {Object} Issue
 * @property {string} id - Unique identifier (format depends on backend)
 * @property {string} title - Issue title
 * @property {string} status - open | in_progress | closed | deferred
 * @property {number} priority - 0 (critical) to 4 (backlog)
 * @property {string} type - Free-text type string; legacy values (bug, feature, task) remain valid; defaults to "task"
 * @property {string} [epicId] - Parent epic ID (legacy; for tiered IDs use parent_id)
 * @property {string} [parent_id] - Parent work item ID for tiered hierarchy (e.g. "e1", "e1.f2")
 * @property {string} [planRef] - Path to associated plan file
 * @property {number} [planTask] - Task number within the plan
 * @property {string} [spec_ref] - Path to associated Live Spec file (distinct from planRef; set by /adev:specify)
 * @property {string} [branch] - Git branch carrying the work for this issue (1:1 with the issue)
 * @property {string} [pr] - Pull-request reference (number, "#123", or URL) for this issue (1:1)
 * @property {string} [owner] - Current claimant of this issue; set atomically by `claim()`
 * @property {string} [claimed_at] - ISO 8601 timestamp of the claim that set `owner`
 * @property {string[]} dependencies - IDs of blocking issues
 * @property {string} [notes] - Free-text notes
 * @property {string|null} [next_action] - Optional agent guidance for the next skill invocation (e.g. "/adev:plan --spec foo.md")
 * @property {string} created - ISO 8601 timestamp
 * @property {string} updated - ISO 8601 timestamp
 */

/**
 * @typedef {Object} Epic
 * @property {string} id - Unique identifier
 * @property {string} title - Epic title
 * @property {string} status - open | in_progress | closed | deferred
 * @property {string} [planRef] - Path to associated plan file
 * @property {string} [milestone] - Milestone name
 * @property {string} created - ISO 8601 timestamp
 * @property {string} updated - ISO 8601 timestamp
 */

/**
 * @typedef {Object} IssueFilter
 * @property {string} [status] - Filter by status
 * @property {string} [type] - Filter by type
 * @property {string} [epicId] - Filter by epic
 * @property {string} [planRef] - Filter by plan reference
 * @property {string} [milestone] - Filter by milestone
 */

/**
 * Issue-scoped ref/claim fields threaded through every backend adapter, each
 * paired with the error code `validateIssue` raises when it is not a string.
 *
 * These four fields are 1:1 with the issue — an issue has at most one branch,
 * one PR, one owner, and one claim timestamp — which is what makes them board
 * state rather than lifecycle-event state. `spec_ref` is the standing
 * precedent for a ref field living on the board.
 *
 * NOTE for anyone threading a FIFTH field: `validateIssue` returns a FIXED
 * WHITELIST object. A field absent from that return literal is silently
 * dropped, not rejected — the create path appears to succeed and persists
 * nothing. Threading a field requires the typedef, this table, the return
 * literal, both beads metadata-map sites, the markdown parser's column
 * layout, and the markdown renderer.
 */
export const REF_FIELD_CODES = Object.freeze([
  ["branch", "INVALID_BRANCH"],
  ["pr", "INVALID_PR"],
  ["owner", "INVALID_OWNER"],
  ["claimed_at", "INVALID_CLAIMED_AT"],
]);

/** Field names from {@link REF_FIELD_CODES}, in canonical column order. */
export const REF_FIELDS = Object.freeze(REF_FIELD_CODES.map(([f]) => f));

export const VALID_STATUSES = ["open", "in_progress", "closed", "deferred"];
export const VALID_TYPES = ["bug", "feature", "task"];
export const VALID_PRIORITIES = [0, 1, 2, 3, 4];

// NOTE: VALID_TYPES is kept for backward compatibility (exports / consumers).
// The type field now accepts any non-empty string — the enum is NOT enforced in validateIssue.

/**
 * Abstract issue manager interface.
 * Each backend adapter must implement these methods.
 *
 * ## Unified create() API (issue-78)
 *
 * `create(item)` is the primary method for creating any work item (epic, feature, task).
 * It infers the tier prefix from `parent_id` depth, or uses `defaultRootPrefix` ("e") for root items.
 * Explicit `tier_prefix` overrides inference. The `spec_ref` field is a distinct optional field
 * (separate from `planRef`) for associating Live Spec files with work items.
 *
 * ## Unified close() API (issue-78)
 *
 * `close(id, reason)` applies cascade guard for tiered IDs (CASCADE_BLOCKED if unclosed children)
 * and dependency guard for all IDs. Legacy flat IDs skip the cascade guard.
 *
 * ## Error codes
 * - PARENT_NOT_FOUND       — create() with non-existent parent_id
 * - INVALID_TIER_PREFIX    — create() with tier_prefix not in TierConfig
 * - ID_MISMATCH            — create() with both parent_id and explicit id that mismatch
 * - MAX_DEPTH_EXCEEDED     — create() with parent at max tier depth
 * - CASCADE_BLOCKED        — close() on tiered parent with unclosed children
 * - BLOCKED_BY_DEPENDENCIES — close() with unresolved dependency blockers
 * - INVALID_TIER_CONFIG    — adapter constructed with invalid tierPrefixes manifest override
 * - ISSUE_ALREADY_CLAIMED  — claim() on an issue held by a different owner
 * - CLAIM_OWNER_MISMATCH   — release() by someone other than the holder (without force)
 * - ISSUE_CLOSED           — claim() on a closed issue
 * - CLAIM_UNSUPPORTED_BACKEND — claim()/release() on a backend with no atomic write
 */
export const IssueManagerInterface = {
  /** @type {string} */
  name: "",

  /** @param {string} projectRoot */
  async init(projectRoot) {
    throw new Error("Not implemented");
  },

  /**
   * Unified create: infers tier from parent_id depth, or uses defaultRootPrefix for root items.
   * @param {Partial<Issue>} issue
   * @returns {Promise<Issue>}
   */
  async create(issue) {
    throw new Error("Not implemented");
  },

  /** @param {string} id @param {Partial<Issue>} changes @returns {Promise<Issue>} */
  async update(id, changes) {
    throw new Error("Not implemented");
  },

  /**
   * Unified close: applies cascade guard for tiered IDs, dependency guard for all IDs.
   * @param {string} id @param {string} reason @returns {Promise<Issue>}
   */
  async close(id, reason) {
    throw new Error("Not implemented");
  },

  /**
   * Atomic check-and-set claim. Sets `owner` + `claimed_at` (and optionally
   * `branch` / `pr`) only if the issue is unclaimed or already held by the
   * same owner; otherwise throws ISSUE_ALREADY_CLAIMED. Backends without an
   * atomic write primitive omit this method — callers must treat a missing
   * `claim` as "unsupported by this backend" rather than falling back to a
   * non-atomic read-modify-write.
   *
   * @param {string} id
   * @param {string} owner
   * @param {{ branch?: string, pr?: string }} [opts]
   * @returns {Promise<Issue>}
   */
  async claim(id, owner, opts) {
    throw new Error("Not implemented");
  },

  /**
   * Release a claim: clears `owner` + `claimed_at`. `branch`/`pr` are left in
   * place — they record where the work went, not who is holding it.
   *
   * @param {string} id
   * @param {string} owner
   * @param {{ force?: boolean }} [opts]
   * @returns {Promise<Issue>}
   */
  async release(id, owner, opts) {
    throw new Error("Not implemented");
  },

  /** @param {IssueFilter} [filters] @returns {Promise<Issue[]>} */
  async list(filters) {
    throw new Error("Not implemented");
  },

  /** @param {string} id @returns {Promise<Issue|null>} */
  async get(id) {
    throw new Error("Not implemented");
  },

  /** @param {IssueFilter} [filters] @returns {Promise<Epic[]>} */
  async listEpics(filters) {
    throw new Error("Not implemented");
  },

  /** @param {Partial<Epic>} epic @returns {Promise<Epic>} */
  async createEpic(epic) {
    throw new Error("Not implemented");
  },

  /** @param {string} id @param {Partial<Epic>} changes @returns {Promise<Epic>} */
  async updateEpic(id, changes) {
    throw new Error("Not implemented");
  },

  /** @param {string} issueId @param {string} dependsOnId */
  async addDependency(issueId, dependsOnId) {
    throw new Error("Not implemented");
  },

  /**
   * Return all descendants of parentId via prefix match (tiered IDs only).
   * Returns empty list for legacy IDs and invalid IDs.
   * @param {string} parentId
   * @returns {Promise<Issue[]>}
   */
  async walkTree(parentId) {
    throw new Error("Not implemented");
  },
};

/**
 * Validate and apply defaults to an issue object.
 * @param {Partial<Issue>} data
 * @returns {Issue}
 */
export function validateIssue(data) {
  if (!data.title || typeof data.title !== "string" || data.title.trim() === "") {
    const err = new Error("Issue title is required");
    err.code = "MISSING_REQUIRED_FIELD";
    throw err;
  }

  if (data.status && !VALID_STATUSES.includes(data.status)) {
    const err = new Error(`Invalid status: ${data.status}. Valid: ${VALID_STATUSES.join(", ")}`);
    err.code = "VALIDATION";
    throw err;
  }

  if (data.type !== undefined && data.type !== null) {
    if (typeof data.type !== "string") {
      const err = new Error("type must be a string");
      err.code = "INVALID_TYPE";
      throw err;
    }
    if (data.type === "") {
      const err = new Error("type must be a non-empty string when provided");
      err.code = "INVALID_TYPE";
      throw err;
    }
  }

  if (data.priority !== undefined && !VALID_PRIORITIES.includes(data.priority)) {
    const err = new Error(`Invalid priority: ${data.priority}. Valid: 0-4`);
    err.code = "VALIDATION";
    throw err;
  }

  // Validate next_action: must be string when provided (non-null, non-undefined)
  if (data.next_action !== undefined && data.next_action !== null) {
    if (typeof data.next_action !== "string") {
      const err = new Error("next_action must be a string when provided");
      err.code = "INVALID_NEXT_ACTION";
      throw err;
    }
  }

  // Validate spec_ref: must be string when provided
  if (data.spec_ref !== undefined && data.spec_ref !== null) {
    if (typeof data.spec_ref !== "string") {
      const err = new Error("spec_ref must be a string when provided");
      err.code = "INVALID_SPEC_REF";
      throw err;
    }
  }

  // Validate the issue-scoped ref/claim fields: each must be a string when
  // provided. These are 1:1 with the issue (exactly one branch, one PR, one
  // owner per issue) — unlike `planTask`, which is sub-issue granularity and
  // is rejected by the board (see json-adapter.mjs::_validateBoardGranularity).
  for (const [field, code] of REF_FIELD_CODES) {
    const value = data[field];
    if (value !== undefined && value !== null) {
      if (typeof value !== "string") {
        const err = new Error(`${field} must be a string when provided`);
        err.code = code;
        throw err;
      }
    }
  }

  // Normalize next_action: empty string → null
  const next_action =
    data.next_action === undefined || data.next_action === null || data.next_action === ""
      ? null
      : data.next_action;

  const now = new Date().toISOString();
  return {
    id: data.id || "",
    title: data.title.trim(),
    status: data.status || "open",
    priority: data.priority ?? 2,
    type: data.type || "task",
    epicId: data.epicId || undefined,
    parent_id: data.parent_id || undefined,
    planRef: data.planRef || undefined,
    planTask: data.planTask || undefined,
    spec_ref: data.spec_ref || undefined,
    branch: data.branch || undefined,
    pr: data.pr || undefined,
    owner: data.owner || undefined,
    claimed_at: data.claimed_at || undefined,
    dependencies: data.dependencies || [],
    notes: data.notes || "",
    next_action,
    created: data.created || now,
    updated: data.updated || now,
  };
}

/**
 * Validate a status transition for an issue update.
 * @param {string} currentStatus
 * @param {Partial<Issue>} changes
 */
export function validateStatusTransition(currentStatus, changes) {
  if (currentStatus === "closed") {
    const err = new Error("Cannot update a closed issue");
    err.code = "ISSUE_CLOSED";
    throw err;
  }

  if (changes.status === "closed") {
    const err = new Error("Use close() to close an issue — it enforces the dependency guard");
    err.code = "USE_CLOSE_METHOD";
    throw err;
  }
}

/**
 * Normalize and validate a claimant name.
 *
 * @param {unknown} owner
 * @returns {string} the trimmed owner
 * @throws {Error} MISSING_OWNER when absent/blank, INVALID_OWNER when non-string
 */
export function normalizeOwner(owner) {
  if (owner === undefined || owner === null || owner === "") {
    const err = new Error("owner is required (pass --owner <name>)");
    err.code = "MISSING_OWNER";
    throw err;
  }
  if (typeof owner !== "string") {
    const err = new Error("owner must be a string when provided");
    err.code = "INVALID_OWNER";
    throw err;
  }
  const trimmed = owner.trim();
  if (trimmed === "") {
    const err = new Error("owner is required (pass --owner <name>)");
    err.code = "MISSING_OWNER";
    throw err;
  }
  return trimmed;
}

/**
 * Precondition check for `claim()` — modelled on
 * `lib/lifecycle-state.mjs::requireGate`: a pure, code-enforced check over
 * observed state that refuses to proceed rather than a convention the caller
 * is trusted to honour. Returns `void` when the claim may proceed; throws
 * otherwise. Never mutates.
 *
 * Rules:
 *   - a closed issue cannot be claimed              → ISSUE_CLOSED
 *   - an issue held by a DIFFERENT live owner       → ISSUE_ALREADY_CLAIMED
 *   - an unowned issue, or one held by the SAME
 *     owner (re-claim is idempotent), proceeds      → void
 *
 * Claims do NOT expire here. Lease expiry/TTL is deliberately out of scope
 * (tracked separately); an owner string on the board is treated as live until
 * it is explicitly released.
 *
 * @param {Partial<Issue>|null|undefined} issue - board state for the issue
 * @param {string} owner - the normalized claimant
 * @throws {Error} with `code`, plus `owner`/`claimed_at` on ISSUE_ALREADY_CLAIMED
 */
export function requireClaimable(issue, owner) {
  if (!issue) return;

  if (issue.status === "closed") {
    const err = new Error(
      `Cannot claim ${issue.id}: issue is closed.`
    );
    err.code = "ISSUE_CLOSED";
    throw err;
  }

  const current = issue.owner;
  if (!current || current === owner) return; // unowned, or idempotent re-claim

  const err = new Error(
    `Issue ${issue.id} is already claimed by "${current}"` +
      (issue.claimed_at ? ` (since ${issue.claimed_at})` : "") +
      `; refusing to reassign it to "${owner}". ` +
      `Run \`adev issues release ${issue.id} --owner ${current}\` first.`
  );
  err.code = "ISSUE_ALREADY_CLAIMED";
  err.owner = current;
  err.claimed_at = issue.claimed_at ?? null;
  throw err;
}

/**
 * Precondition check for `release()`. Releasing an unclaimed issue is a
 * no-op (idempotent); releasing one held by a different owner is refused
 * unless `force` is set.
 *
 * @param {Partial<Issue>|null|undefined} issue
 * @param {string} owner
 * @param {{ force?: boolean }} [opts]
 * @throws {Error} CLAIM_OWNER_MISMATCH
 */
export function requireReleasable(issue, owner, { force = false } = {}) {
  if (!issue || !issue.owner) return; // nothing held — idempotent no-op
  if (force || issue.owner === owner) return;

  const err = new Error(
    `Issue ${issue.id} is claimed by "${issue.owner}", not "${owner}". ` +
      `Pass --force to release another owner's claim.`
  );
  err.code = "CLAIM_OWNER_MISMATCH";
  err.owner = issue.owner;
  throw err;
}

/**
 * Validate and apply defaults to an epic object.
 * @param {Partial<Epic>} data
 * @returns {Epic}
 */
export function validateEpic(data) {
  if (!data.title || typeof data.title !== "string" || data.title.trim() === "") {
    const err = new Error("Epic title is required");
    err.code = "MISSING_REQUIRED_FIELD";
    throw err;
  }

  const now = new Date().toISOString();
  const milestone = data.milestone
    ? (typeof data.milestone === "string" ? data.milestone : String(data.milestone))
    : undefined;
  return {
    id: data.id || "",
    title: data.title.trim(),
    status: data.status || "open",
    planRef: data.planRef || undefined,
    milestone: milestone || undefined,
    created: data.created || now,
    updated: data.updated || now,
  };
}

/**
 * Detect if adding a dependency would create a cycle.
 * Covers both direct (A→A) and transitive (A→B→...→A) cycles.
 *
 * @param {string} issueId - The issue that would gain a new dependency
 * @param {string} dependsOnId - The issue it would depend on
 * @param {Record<string, string[]>} depsMap - Map of issueId → dependency IDs
 * @throws {Error} with code CIRCULAR_DEPENDENCY if a cycle would be created
 */
export function detectCycle(issueId, dependsOnId, depsMap) {
  if (issueId === dependsOnId) {
    const err = new Error(`Circular dependency: ${issueId} cannot depend on itself`);
    err.code = "CIRCULAR_DEPENDENCY";
    throw err;
  }

  // BFS from dependsOnId through existing deps — if we reach issueId, it's a cycle
  const visited = new Set();
  const queue = [dependsOnId];

  while (queue.length > 0) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);

    const deps = depsMap[current] || [];
    for (const dep of deps) {
      if (dep === issueId) {
        const err = new Error(`Circular dependency: ${issueId} → ${dependsOnId} → ... → ${issueId}`);
        err.code = "CIRCULAR_DEPENDENCY";
        throw err;
      }
      queue.push(dep);
    }
  }
}

/**
 * Check if an issue can be closed (all blocking dependencies must be closed).
 * @param {string} issueId
 * @param {Issue[]} allIssues
 * @throws {Error} with code BLOCKED_BY_DEPENDENCIES
 */
export function checkCloseGuard(issueId, allIssues) {
  const issue = allIssues.find((i) => i.id === issueId);
  if (!issue) return;

  const blockers = [];
  for (const depId of issue.dependencies) {
    const dep = allIssues.find((i) => i.id === depId);
    if (dep && dep.status !== "closed") {
      blockers.push(depId);
    }
  }

  if (blockers.length > 0) {
    const err = new Error(`Cannot close ${issueId}: blocked by ${blockers.join(", ")}`);
    err.code = "BLOCKED_BY_DEPENDENCIES";
    err.blockers = blockers;
    throw err;
  }
}

export default IssueManagerInterface;
