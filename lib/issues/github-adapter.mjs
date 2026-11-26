/**
 * GitHub Projects v2 adapter for issue management.
 *
 * The project board is the system of record: every read goes through one
 * paged board read (lib/issues/github/board-read.mjs), cached on the adapter
 * instance until a write invalidates it. Construction validates
 * `tasks.github` synchronously and performs no I/O; every public method runs
 * the network preflight first.
 *
 * @module lib/issues/github-adapter
 */

import { normalizeClaimTtlMinutes, resolveNotes } from "./interface.mjs";
import { encodeGithubId, normalizeGithubIdInput, parseId } from "./id-utils.mjs";
import { normalizeGithubConfig } from "./github/config.mjs";
import { createTransport } from "./github/transport.mjs";
import { createPreflight } from "./github/preflight.mjs";
import { readBoard, readItem } from "./github/board-read.mjs";
import { FIELD_PREDICATES } from "./github/decode.mjs";
import { GITHUB_ERROR_CODES as CODES, githubError } from "./github/errors.mjs";
import { REPO_LABELS_QUERY, REPO_ISSUE_TYPES_QUERY, REPO_MILESTONES_QUERY } from "./github/queries.mjs";
import {
  CREATE_ISSUE,
  ADD_TO_PROJECT,
  setFieldsDocument,
  SET_TEXT_FIELD,
  ADD_SUB_ISSUE,
  ADD_BLOCKED_BY,
  ADD_LABELS,
  SET_ISSUE_TYPE,
  SET_MILESTONE,
} from "./github/mutations.mjs";

const byCanonicalId = (a, b) => a.id.localeCompare(b.id, "en", { numeric: true });

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// One refused item fails a whole-board read, and the error names every refused item
// so a maintainer can fix the board in one pass. The code is the first refusal's.
function boardRefusal(failed) {
  const ids = failed.map((e) => e.id);
  const detail = failed.map((e) => e.error.message).join(" ");
  const noun = failed.length === 1 ? "item" : "items";
  return githubError(failed[0].error.code, `${failed.length} GitHub board ${noun} cannot be read (${ids.join(", ")}): ${detail}`, { ids });
}

const GRANULARITY_MESSAGE =
  "Board granularity violation: plan tasks belong in the lifecycle event log, " +
  "not on the issue board. See `lib/lifecycle-state.mjs::reportPlanTask`.";

const SETUP_REMEDY = "then run `adev issues github setup`.";

// Project text fields create() writes, in the order its SetFields request writes them.
const CREATE_TEXT_FIELDS = ["next_action", "spec_ref", "planRef", "branch", "pr", "legacy_id"];

// Written only by claim(), owner after claimed_at, so adev never leaves an owner without
// a claimed_at (a lease that never expires); create() refuses them rather than write either.
const CLAIM_FIELDS = ["owner", "claimed_at"];

// `closed` is reached only through close(): creating straight into it would skip the closure guards.
const CREATE_STATUSES = ["open", "in_progress", "deferred"];

const DEFAULT_PRIORITY_FIELD = "Priority";

// Fields adev assigns itself on other backends; a GitHub issue's ID is its number.
const ADEV_ASSIGNED_FIELDS = ["id", "tier_prefix"];

const EPIC_KEYS = ["title", "notes", "description", "body", "status", "planRef", "milestone", "planTask"];
const UPDATE_EPIC_KEYS = ["planRef", "milestone"];

function codedError(code, message, extra = {}) {
  return Object.assign(new Error(message), extra, { code });
}

function invalidValue(field) {
  return githubError(CODES.GITHUB_INVALID_FIELD_VALUE, `Invalid ${field} value; nothing was sent to GitHub.`, { field });
}

function check(field, value) {
  if (value !== undefined && !FIELD_PREDICATES[field](value)) throw invalidValue(field);
}

function rejectPlanTask(data) {
  const pt = data?.planTask;
  if (pt !== undefined && pt !== null && pt !== "") throw codedError("BOARD_GRANULARITY_VIOLATION", GRANULARITY_MESSAGE);
}

function rejectClaimFields(data) {
  for (const field of CLAIM_FIELDS) {
    if (data?.[field] !== undefined && data[field] !== null) {
      throw codedError("VALIDATION", `${field} cannot be set on create; claim the issue with claim() after it exists. Nothing was sent to GitHub.`, { field });
    }
  }
}

function rejectAssignedFields(data) {
  for (const field of ADEV_ASSIGNED_FIELDS) {
    if (data?.[field] !== undefined && data[field] !== null) {
      throw codedError("VALIDATION", `${field} cannot be set on create on the github backend; GitHub assigns the issue number and the ID is derived from it. Nothing was sent to GitHub.`, { field });
    }
  }
}

function missingOnGithub(kind, name, repo) {
  return githubError(
    CODES.GITHUB_WRITE_FAILED,
    `${kind} ${JSON.stringify(name)} does not exist for ${repo}; nothing was written, and adev never creates labels, issue types or milestones. Create it on GitHub, ${SETUP_REMEDY}`,
    { missing: name },
  );
}

/**
 * A failed mutation's error. GitHub rejecting the mutation (the transport's
 * catch-all GITHUB_REQUEST_FAILED) becomes GITHUB_WRITE_FAILED with GitHub's
 * reason; every more specific code (rate limit, unreachable, permission) is kept.
 */
function writeFailed(err, operation) {
  if (err?.code !== CODES.GITHUB_REQUEST_FAILED) return err;
  const reasons = Array.isArray(err.graphqlErrors) && err.graphqlErrors.length > 0
    ? err.graphqlErrors.map((e) => e.message).join("; ")
    : err.message;
  return githubError(CODES.GITHUB_WRITE_FAILED, `GitHub rejected ${operation}: ${reasons}`, { operation });
}

/**
 * Once the issue exists every failure is a partial create, whatever its cause,
 * so the caller learns the new ID and finishes the item instead of creating a
 * duplicate. The issue is never deleted or closed. `project` leads `unwritten`
 * when AddToProject did not land: board reads cannot resolve an off-project
 * issue, so it must be added to the project before any field can be finished.
 * The cause's code is `causeCode`, leaving the standard Error.cause unshadowed.
 */
function partialCreate(id, unwritten, cause, projectUrl) {
  const fields = unwritten.filter((f) => f !== "project");
  const offProject = fields.length !== unwritten.length;
  const what = fields.length > 0 ? `these fields were not written: ${fields.join(", ")}` : "every field was written but reading it back failed";
  const finish = offProject
    ? `It is not on the project, so adev cannot see it: add ${id} to the project (${projectUrl}) on GitHub, then finish ${id} instead of creating it again.`
    : `Finish ${id} instead of creating it again.`;
  const extra = { id, unwritten, causeCode: cause?.code ?? null };
  if (cause && "resetAt" in cause) extra.resetAt = cause.resetAt;
  return githubError(
    CODES.GITHUB_PARTIAL_CREATE,
    `GitHub issue ${id} was created and kept, but ${offProject ? "it was not added to the project and " : ""}${what}. Cause: ${cause?.message ?? String(cause)} ${finish}`,
    { ...extra, ...(offProject ? { project: projectUrl } : {}) },
  );
}

// Labels added to an issue, each in an adev-owned family, and the field each carries.
function labelField(name) {
  if (name === "epic" || name.startsWith("type:")) return "type";
  if (name.startsWith("priority:")) return "priority";
  return "affected_modules";
}

/**
 * Validate a create payload before any request: every value must pass its
 * BEH-39 predicate exactly as given, since GitHub is written verbatim.
 */
function validateCreate(data) {
  rejectPlanTask(data);
  rejectClaimFields(data);
  rejectAssignedFields(data);
  if (typeof data?.title !== "string" || data.title.trim() === "") throw codedError("MISSING_REQUIRED_FIELD", "Issue title is required");
  const notes = resolveNotes(data);
  if (typeof notes !== "string") throw codedError("INVALID_NOTES", "notes must be a string when provided");

  const status = data.status ?? "open";
  if (!CREATE_STATUSES.includes(status)) {
    throw codedError("VALIDATION", `Invalid status for create: ${status}. Valid: ${CREATE_STATUSES.join(", ")} (close an issue with close()).`);
  }
  const type = data.type ?? undefined;
  check("type", type);
  check("priority", data.priority);
  for (const field of CREATE_TEXT_FIELDS) check(field, data[field] ?? undefined);
  check("affected_modules", data.affected_modules ?? undefined);
  check("milestone", data.milestone ?? undefined);

  const parent = data.parent_id ?? data.epicId ?? undefined;
  const dependencies = data.dependencies ?? [];
  if (!Array.isArray(dependencies)) throw codedError("VALIDATION", "dependencies must be a list of issue IDs");

  const text = {};
  for (const field of CREATE_TEXT_FIELDS) {
    const value = data[field] ?? undefined;
    if (value !== undefined) text[field] = String(value);
  }
  return {
    title: data.title,
    notes,
    status,
    type,
    priority: data.priority,
    text,
    affected_modules: data.affected_modules ?? [],
    milestone: data.milestone ?? undefined,
    parent,
    dependencies,
  };
}

export class GithubAdapter {
  /**
   * @param {string} storageRoot
   * @param {object} manifest
   * @param {{ exec?: Function, now?: () => number, sleep?: (ms: number) => Promise<void> }} [options]
   *   `exec` is an `execFileSync`-compatible spawn (replayed in tests); `now` and `sleep`
   *   make claim timestamps and the claim settle wait deterministic.
   * @throws {Error & { code: "GITHUB_INVALID_CONFIG", key: string }}
   */
  constructor(storageRoot, manifest, { exec, now = Date.now, sleep = defaultSleep } = {}) {
    this.name = "github";
    this.storageRoot = storageRoot;
    this.config = normalizeGithubConfig(manifest?.tasks?.github);
    this.claimTtlMinutes = normalizeClaimTtlMinutes(manifest?.tasks?.claim_ttl_minutes);
    const [owner, repo] = this.config.repo.split("/");
    this.home = { owner, repo };
    this.moduleSlugs = (manifest?.modules ?? []).map((m) => m?.slug).filter((s) => typeof s === "string");
    this._now = now;
    this._sleep = sleep;
    this._transport = createTransport({ exec });
    this._preflight = createPreflight({ transport: this._transport, config: this.config });
    this._board = null;
  }

  // ---------------------------------------------------------------------------
  // Internal: board cache, shared with the write path
  // ---------------------------------------------------------------------------

  _ensure() {
    return this._preflight.ensure();
  }

  /** Drop the cached board read; every write calls this before returning. */
  _invalidateBoard() {
    this._board = null;
  }

  _readBoard() {
    if (!this._board) {
      const { projectId } = this._ensure();
      const { entries, drift } = readBoard(this._transport, this.config, { projectId, moduleSlugs: this.moduleSlugs });
      this._board = { entries, drift, byId: new Map(entries.map((e) => [e.id, e])) };
    }
    return this._board;
  }

  /** Project-item and Issue node IDs for a canonical ID, or null when it is not on the project. */
  _nodeIdsFor(id) {
    return this._readBoard().byId.get(id)?.nodeIds ?? null;
  }

  /** Every decoded issue and epic, or a refusal naming every item that failed to decode. */
  _decodedBoard() {
    const { entries } = this._readBoard();
    const failed = entries.filter((e) => e.error);
    if (failed.length > 0) throw boardRefusal(failed);
    return entries.map((e) => e.issue);
  }

  /**
   * Resolve user input to the board entry it names, or null when nothing on the
   * project matches. Old (non-gh) IDs resolve through the raw Legacy ID text so
   * they still find an item whose decode was refused, but only text the decoder's
   * legacy_id predicate accepts can match: decode never trims or repairs a value,
   * so a value it refuses names no old ID.
   */
  _resolve(input) {
    const parsed = typeof input === "string" ? parseId(input) : null;
    const board = this._readBoard();
    if (parsed && !parsed.github) {
      const matches = board.entries.filter((e) => FIELD_PREDICATES.legacy_id(e.legacyText) && e.legacyText === input);
      if (matches.length > 1) {
        const ids = matches.map((e) => e.id);
        throw githubError(CODES.GITHUB_AMBIGUOUS_LEGACY_ID, `Old ID ${input} matches the legacy_id of more than one GitHub item (${ids.join(", ")}); use the gh ID instead.`, { ids });
      }
      return matches[0] ?? null;
    }
    return board.byId.get(normalizeGithubIdInput(input, this.home)) ?? null;
  }

  // ---------------------------------------------------------------------------
  // IssueManagerInterface: read path
  // ---------------------------------------------------------------------------

  async init() {
    this._ensure();
  }

  async get(id) {
    this._ensure();
    const entry = this._resolve(id);
    if (!entry) return null;
    if (entry.error) throw entry.error;
    return entry.issue;
  }

  async list(filters = {}) {
    this._ensure();
    let result = this._decodedBoard().filter((i) => i.type !== "epic");
    if (filters.status) result = result.filter((i) => i.status === filters.status);
    if (filters.type) result = result.filter((i) => i.type === filters.type);
    if (filters.epicId) {
      // Membership is the sub-issue parent link; an epic not on the project has no members.
      const epic = this._resolve(filters.epicId);
      result = epic ? result.filter((i) => i.parent_id === epic.id) : [];
    }
    if (filters.planRef) result = result.filter((i) => i.planRef === filters.planRef);
    return [...result].sort(
      (a, b) => (a.priority ?? 2) - (b.priority ?? 2) || (a.created || "").localeCompare(b.created || ""),
    );
  }

  async listEpics(filters = {}) {
    this._ensure();
    let result = this._decodedBoard().filter((i) => i.type === "epic");
    if (filters.status) result = result.filter((e) => e.status === filters.status);
    if (filters.milestone) result = result.filter((e) => e.milestone === filters.milestone);
    return result;
  }

  /**
   * Every transitive sub-issue of `parentId` that is on the project, sorted by
   * canonical ID. Children come from the items' parent links, so the walk is
   * bounded by the board read; revisiting an item is a cycle and returns nothing.
   *
   * @throws {Error & { code: "GITHUB_SUBISSUE_CYCLE", id: string }}
   */
  async walkTree(parentId) {
    this._ensure();
    const issues = this._decodedBoard();
    const root = this._resolve(parentId);
    if (!root) return [];

    const children = new Map();
    for (const issue of issues) {
      if (!issue.parent_id) continue;
      if (!children.has(issue.parent_id)) children.set(issue.parent_id, []);
      children.get(issue.parent_id).push(issue);
    }

    const visited = new Set([root.id]);
    const found = [];
    const queue = [root.id];
    while (queue.length > 0) {
      for (const child of children.get(queue.shift()) ?? []) {
        if (visited.has(child.id)) {
          throw githubError(CODES.GITHUB_SUBISSUE_CYCLE, `Sub-issue links of ${root.id} form a cycle through ${child.id}; fix the parent links on GitHub.`, { id: child.id });
        }
        visited.add(child.id);
        found.push(child);
        queue.push(child.id);
      }
    }
    return found.sort(byCanonicalId);
  }
  // ---------------------------------------------------------------------------
  // IssueManagerInterface: write path
  // ---------------------------------------------------------------------------

  /**
   * Create an issue in the home repo, add it to the project and write every
   * given field, then return it as read back.
   *
   * @throws {Error & { code: "VALIDATION"|"GITHUB_INVALID_FIELD_VALUE"|"GITHUB_FIELD_MISSING"|"PARENT_NOT_FOUND"|"NOT_FOUND"|"GITHUB_WRITE_FAILED" }}
   *   before any write; `owner` and `claimed_at` are refused (VALIDATION) because only claim() writes them,
   *   and `id` and `tier_prefix` because GitHub assigns the issue number
   * @throws {Error & { code: "GITHUB_PARTIAL_CREATE", id: string, unwritten: string[], causeCode: string|null, project?: string }}
   *   once the issue exists; `unwritten` starts with "project" (and `project` is set) when it is not on the project
   */
  async create(data) {
    return this._createItem(validateCreate(data));
  }

  /**
   * Create an epic: an issue typed `Epic` (issue types) or labelled `epic` (labels).
   *
   * @throws {Error & { code: "VALIDATION", field: string }} for a key outside EPIC_KEYS, before any request
   */
  async createEpic(data) {
    rejectPlanTask(data);
    rejectClaimFields(data);
    for (const [key, value] of Object.entries(data ?? {})) {
      if (value !== undefined && !EPIC_KEYS.includes(key)) {
        throw codedError("VALIDATION", `createEpic on the github backend writes ${EPIC_KEYS.join(", ")}; ${key} is not supported here. Nothing was sent to GitHub.`, { field: key });
      }
    }
    const picked = Object.fromEntries(EPIC_KEYS.filter((k) => data?.[k] !== undefined).map((k) => [k, data[k]]));
    return this._createItem(validateCreate({ ...picked, type: "epic" }));
  }

  /**
   * Write an epic's changed `planRef` and `milestone`; unchanged values are not sent.
   *
   * @throws {Error & { code: "NOT_FOUND" }} when `id` is not an epic on the project
   */
  async updateEpic(id, changes = {}) {
    for (const key of Object.keys(changes)) {
      if (!UPDATE_EPIC_KEYS.includes(key)) {
        throw codedError("VALIDATION", `updateEpic on the github backend writes ${UPDATE_EPIC_KEYS.join(" and ")}; ${key} is not supported here.`);
      }
    }
    check("planRef", changes.planRef);
    check("milestone", changes.milestone);

    const { projectId } = this._ensure();
    const entry = this._resolve(id);
    if (entry?.error) throw entry.error;
    if (!entry || entry.issue.type !== "epic") throw codedError("NOT_FOUND", `Epic not found: ${id}`);
    const current = entry.issue;
    const { itemId, contentId } = entry.nodeIds;

    const slots = changes.planRef !== undefined && changes.planRef !== current.planRef
      ? [this._textSlot("planRef", changes.planRef)]
      : [];
    const milestoneId = changes.milestone !== undefined && changes.milestone !== current.milestone
      ? this._lookupId(REPO_MILESTONES_QUERY, "milestones", "title", changes.milestone, "Milestone")
      : undefined;
    if (slots.length === 0 && milestoneId === undefined) return current;

    try {
      if (slots.length > 0) this._mutate("SetFields", SET_TEXT_FIELD, this._slotVariables(projectId, itemId, slots));
      if (milestoneId !== undefined) this._mutate("SetMilestone", SET_MILESTONE, { issueId: contentId, milestoneId });
      return readItem(this._transport, this.config, { itemId, moduleSlugs: this.moduleSlugs }).issue;
    } finally {
      this._invalidateBoard();
    }
  }

  // ---------------------------------------------------------------------------
  // Internal: write path
  // ---------------------------------------------------------------------------

  _mutate(operation, document, variables) {
    try {
      return this._transport.request(document, variables);
    } catch (err) {
      throw writeFailed(err, operation);
    }
  }

  _slotVariables(projectId, itemId, slots) {
    const variables = { projectId, itemId };
    slots.forEach((slot, i) => {
      variables[`f${i}Field`] = slot.fieldId;
      variables[`f${i}Value`] = slot.value;
    });
    return variables;
  }

  _setFields(projectId, itemId, slots) {
    return [setFieldsDocument(slots.map((slot) => slot.kind)), this._slotVariables(projectId, itemId, slots)];
  }

  _textSlot(field, value) {
    const name = this.config.fieldNames[field];
    const node = this._ensure().fields[name];
    if (!node || node.dataType !== "TEXT") {
      throw githubError(CODES.GITHUB_FIELD_MISSING, `Project field "${name}" is missing or is not a text field; nothing was written. Create it, ${SETUP_REMEDY}`, { field: name, expectedType: "TEXT" });
    }
    return { field, kind: "text", fieldId: node.id, value };
  }

  _repoNodes(document, key) {
    return this._transport.paginate(document, { owner: this.home.owner, name: this.home.repo }, { connectionPath: ["repository", key] });
  }

  _lookupId(document, key, nameKey, name, kind) {
    const node = this._repoNodes(document, key).find((n) => n?.[nameKey] === name);
    if (!node) throw missingOnGithub(kind, name, this.config.repo);
    return node.id;
  }

  /**
   * Everything create() will send, resolved before the issue exists: a parent,
   * dependency, label, issue type, milestone or option that does not resolve
   * refuses the create with nothing written.
   */
  _planCreate(v) {
    const pre = this._ensure();
    const config = this.config;

    let parentContentId;
    if (v.parent !== undefined) {
      const parent = this._resolve(v.parent);
      if (!parent) throw codedError("PARENT_NOT_FOUND", `Parent not found on the GitHub project: ${v.parent}`);
      parentContentId = parent.nodeIds.contentId;
    }
    const blockingIds = [];
    for (const dep of v.dependencies) {
      const entry = this._resolve(dep);
      if (!entry) throw codedError("NOT_FOUND", `Dependency not found on the GitHub project: ${dep}`);
      if (!blockingIds.includes(entry.nodeIds.contentId)) blockingIds.push(entry.nodeIds.contentId);
    }

    let issueTypeId;
    const labels = [];
    if (v.type !== undefined) {
      const types = config.type_source === "labels" ? [] : this._repoNodes(REPO_ISSUE_TYPES_QUERY, "issueTypes");
      const mode = config.type_source === "auto" ? (types.length > 0 ? "issue_types" : "labels") : config.type_source;
      if (mode === "issue_types") {
        const node = types.find((t) => typeof t?.name === "string" && t.name.toLowerCase() === v.type);
        if (!node) throw missingOnGithub("Issue type", v.type, config.repo);
        issueTypeId = node.id;
      } else {
        labels.push(v.type === "epic" ? "epic" : `type:${v.type}`);
      }
    }

    const statusField = pre.fields[config.status_field];
    const statusOption = config.status_map_write[v.status];
    const slots = [{ field: "status", kind: "single_select", fieldId: statusField.id, value: statusField.options.find((o) => o.name === statusOption).id }];

    if (v.priority !== undefined) {
      const name = config.priority_field ?? DEFAULT_PRIORITY_FIELD;
      const node = pre.fields[name];
      // A configured priority_field is the only priority home: the label fallback is for an unconfigured board.
      if (config.priority_field !== undefined && node?.dataType !== "NUMBER") {
        throw githubError(CODES.GITHUB_FIELD_MISSING, `Project field "${name}" (tasks.github.priority_field) is missing or is not a number field; nothing was written. Create it, ${SETUP_REMEDY}`, { field: name, expectedType: "NUMBER" });
      }
      if (node?.dataType === "SINGLE_SELECT") {
        const option = (node.options ?? []).find((o) => o?.name === `P${v.priority}`);
        if (!option) {
          throw githubError(CODES.GITHUB_WRITE_FAILED, `Project field "${name}" has no option "P${v.priority}"; nothing was written. Add the option, ${SETUP_REMEDY}`, { missing: `P${v.priority}` });
        }
        slots.push({ field: "priority", kind: "single_select", fieldId: node.id, value: option.id });
      } else if (node?.dataType === "NUMBER") {
        slots.push({ field: "priority", kind: "number", fieldId: node.id, value: v.priority });
      } else {
        labels.push(`priority:${v.priority}`);
      }
    }
    for (const field of CREATE_TEXT_FIELDS) {
      if (v.text[field] !== undefined) slots.push(this._textSlot(field, v.text[field]));
    }
    for (const slug of v.affected_modules) labels.push(`module:${slug}`);

    let labelIds = [];
    if (labels.length > 0) {
      const byName = new Map(this._repoNodes(REPO_LABELS_QUERY, "labels").map((n) => [n?.name, n?.id]));
      labelIds = labels.map((name) => {
        if (!byName.has(name)) throw missingOnGithub("Label", name, config.repo);
        return byName.get(name);
      });
    }
    const milestoneId = v.milestone !== undefined
      ? this._lookupId(REPO_MILESTONES_QUERY, "milestones", "title", v.milestone, "Milestone")
      : undefined;

    return { pre, parentContentId, blockingIds, issueTypeId, slots, labels, labelIds, milestoneId };
  }

  _createItem(v) {
    const plan = this._planCreate(v);
    const { pre } = plan;
    let created = null;
    let itemId;

    // Each step after CreateIssue, with the fields it carries; on failure the
    // failed step's fields and every later step's are the unwritten ones.
    const steps = [
      { fields: ["project"], run: () => {
        itemId = this._mutate("AddToProject", ADD_TO_PROJECT, { projectId: pre.projectId, contentId: created.contentId })?.addProjectV2ItemById?.item?.id;
        if (typeof itemId !== "string") throw githubError(CODES.GITHUB_WRITE_FAILED, "GitHub returned no project item for AddToProject.");
      } },
      { fields: plan.slots.map((s) => s.field), run: () => this._mutate("SetFields", ...this._setFields(pre.projectId, itemId, plan.slots)) },
    ];
    if (plan.parentContentId !== undefined) {
      steps.push({ fields: ["parent_id"], run: () => this._mutate("AddSubIssue", ADD_SUB_ISSUE, { issueId: plan.parentContentId, subIssueId: created.contentId }) });
    }
    for (const blockingIssueId of plan.blockingIds) {
      steps.push({ fields: ["dependencies"], run: () => this._mutate("AddBlockedBy", ADD_BLOCKED_BY, { issueId: created.contentId, blockingIssueId }) });
    }
    if (plan.labelIds.length > 0) {
      steps.push({ fields: [...new Set(plan.labels.map(labelField))], run: () => this._mutate("AddLabels", ADD_LABELS, { labelableId: created.contentId, labelIds: plan.labelIds }) });
    }
    if (plan.issueTypeId !== undefined) {
      steps.push({ fields: ["type"], run: () => this._mutate("SetIssueType", SET_ISSUE_TYPE, { issueId: created.contentId, issueTypeId: plan.issueTypeId }) });
    }
    if (plan.milestoneId !== undefined) {
      steps.push({ fields: ["milestone"], run: () => this._mutate("SetMilestone", SET_MILESTONE, { issueId: created.contentId, milestoneId: plan.milestoneId }) });
    }

    try {
      const issue = this._mutate("CreateIssue", CREATE_ISSUE, { repositoryId: pre.repositoryId, title: v.title, body: v.notes })?.createIssue?.issue;
      if (typeof issue?.id !== "string" || !Number.isSafeInteger(issue?.number)) {
        throw githubError(CODES.GITHUB_WRITE_FAILED, "GitHub returned no issue for CreateIssue; check the repository before retrying.");
      }
      created = { contentId: issue.id, id: encodeGithubId({ owner: this.home.owner, repo: this.home.repo, number: issue.number }, this.home) };

      let at = 0;
      try {
        for (; at < steps.length; at += 1) steps[at].run();
        return readItem(this._transport, this.config, { itemId, moduleSlugs: this.moduleSlugs }).issue;
      } catch (err) {
        const unwritten = [...new Set(steps.slice(at).flatMap((s) => s.fields))];
        throw partialCreate(created.id, unwritten, err, this.config.project);
      }
    } finally {
      this._invalidateBoard();
    }
  }
}

export default GithubAdapter;
