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
 * @property {string} type - bug | feature | task
 * @property {string} [epicId] - Parent epic ID (legacy; for tiered IDs use parent_id)
 * @property {string} [parent_id] - Parent work item ID for tiered hierarchy (e.g. "e1", "e1.f2")
 * @property {string} [planRef] - Path to associated plan file
 * @property {number} [planTask] - Task number within the plan
 * @property {string[]} dependencies - IDs of blocking issues
 * @property {string} [notes] - Free-text notes
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

export const VALID_STATUSES = ["open", "in_progress", "closed", "deferred"];
export const VALID_TYPES = ["bug", "feature", "task"];
export const VALID_PRIORITIES = [0, 1, 2, 3, 4];

/**
 * Abstract issue manager interface.
 * Each backend adapter must implement these methods.
 */
export const IssueManagerInterface = {
  /** @type {string} */
  name: "",

  /** @param {string} projectRoot */
  async init(projectRoot) {
    throw new Error("Not implemented");
  },

  /** @param {Partial<Issue>} issue @returns {Promise<Issue>} */
  async create(issue) {
    throw new Error("Not implemented");
  },

  /** @param {string} id @param {Partial<Issue>} changes @returns {Promise<Issue>} */
  async update(id, changes) {
    throw new Error("Not implemented");
  },

  /** @param {string} id @param {string} reason @returns {Promise<Issue>} */
  async close(id, reason) {
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

  if (data.type && !VALID_TYPES.includes(data.type)) {
    const err = new Error(`Invalid type: ${data.type}. Valid: ${VALID_TYPES.join(", ")}`);
    err.code = "VALIDATION";
    throw err;
  }

  if (data.priority !== undefined && !VALID_PRIORITIES.includes(data.priority)) {
    const err = new Error(`Invalid priority: ${data.priority}. Valid: 0-4`);
    err.code = "VALIDATION";
    throw err;
  }

  const now = new Date().toISOString();
  return {
    id: data.id || "",
    title: data.title.trim(),
    status: data.status || "open",
    priority: data.priority ?? 2,
    type: data.type || "task",
    epicId: data.epicId || undefined,
    planRef: data.planRef || undefined,
    planTask: data.planTask || undefined,
    dependencies: data.dependencies || [],
    notes: data.notes || "",
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
