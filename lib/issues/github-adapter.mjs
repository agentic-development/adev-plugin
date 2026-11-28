/**
 * GitHub Projects v2 adapter for issue management.
 *
 * The project board is the system of record. A gh-<n> ID resolves through a
 * direct read of that issue's project item, because GitHub's project items
 * listing is eventually consistent: an item added or changed seconds ago can be
 * missing from it, or show its old values. Whole-board reads (list, listEpics,
 * walkTree, the close and cycle guards, old-ID resolution) go through one paged
 * listing (lib/issues/github/board-read.mjs), cached on the adapter instance.
 * Write-through: every item this instance writes is merged into that snapshot
 * as last read back (or as last written, where a write has no read-back), and
 * overrides the listing's row for the same ID in every later listing this
 * instance reads, so the instance never loses or regresses its own writes.
 * Another process's list() can still lag a write by a few seconds.
 * Construction validates `tasks.github` synchronously and performs no I/O;
 * every public method runs the network preflight first.
 *
 * @module lib/issues/github-adapter
 */

import {
  normalizeClaimTtlMinutes,
  normalizeOwner,
  isClaimStale,
  requireClaimable,
  requireReleasable,
  resolveNotes,
  validateStatusTransition,
  detectCycle,
  NOTES_ALIASES,
} from "./interface.mjs";
import { encodeGithubId, normalizeGithubIdInput, parseId } from "./id-utils.mjs";
import { normalizeGithubConfig } from "./github/config.mjs";
import { createTransport } from "./github/transport.mjs";
import { createPreflight } from "./github/preflight.mjs";
import { readBoard, readItem, readIssueEntry } from "./github/board-read.mjs";
import { FIELD_PREDICATES } from "./github/decode.mjs";
import { GITHUB_ERROR_CODES as CODES, githubError } from "./github/errors.mjs";
import { REPO_LABELS_QUERY, REPO_ISSUE_TYPES_QUERY, REPO_MILESTONES_QUERY } from "./github/queries.mjs";
import {
  CREATE_ISSUE,
  ADD_TO_PROJECT,
  setFieldsDocument,
  ADD_SUB_ISSUE,
  ADD_BLOCKED_BY,
  ADD_LABELS,
  SET_ISSUE_TYPE,
  SET_MILESTONE,
  CLOSE_ISSUE,
  ADD_COMMENT,
  UPDATE_ISSUE,
  REMOVE_LABELS,
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

// Project text fields create() writes. Its SetFields request writes them in this
// order, except legacy_id, which _planCreate puts first (see there).
const CREATE_TEXT_FIELDS = ["next_action", "spec_ref", "planRef", "branch", "pr", "legacy_id"];

// Written only by claim(), owner after claimed_at, so adev never leaves an owner without
// a claimed_at (a lease that never expires); create() refuses them rather than write either.
const CLAIM_FIELDS = ["owner", "claimed_at"];
// The claim request's slot order: claimed_at first, so an owner is never written ahead of
// its lease clock. A field's alias in that request is `f<slot index>` (setFieldsDocument).
const CLAIM_WRITE_ORDER = ["claimed_at", "owner"];
const claimAlias = (field) => `f${CLAIM_WRITE_ORDER.indexOf(field)}`;

// `closed` is reached only through close(): creating straight into it would skip the closure guards.
const CREATE_STATUSES = ["open", "in_progress", "deferred"];

const DEFAULT_PRIORITY_FIELD = "Priority";

// Fields adev assigns itself on other backends; a GitHub issue's ID is its number.
const ADEV_ASSIGNED_FIELDS = ["id", "tier_prefix"];

const EPIC_KEYS = ["title", "notes", "description", "body", "status", "planRef", "milestone", "planTask"];

// Project text fields update() writes; legacy_id is set once, by create() during a migration.
const UPDATE_TEXT_FIELDS = ["next_action", "spec_ref", "planRef", "branch", "pr"];
const BODY_KEYS = ["notes", ...NOTES_ALIASES];
const UPDATE_KEYS = ["title", ...BODY_KEYS, "status", "priority", ...UPDATE_TEXT_FIELDS, "affected_modules", "planTask"];
const UPDATE_EPIC_KEYS = ["title", ...BODY_KEYS, "status", "planRef", "milestone", "planTask"];

// `closed` is accepted here only so validateStatusTransition() refuses it with its own code.
const UPDATE_STATUSES = [...CREATE_STATUSES, "closed"];

const PRIORITY_LABEL = /^priority:/;

const HOME_ID = /^gh-(\d+)$/;

/**
 * Every open transitive sub-issue of `entry` that is on the project, in walk
 * order. The walk follows the raw sub-issue links, so a closed child does not
 * hide an open grandchild; the visited set ends a sub-issue cycle.
 *
 * @throws the decode error of any sub-issue on the project that was refused
 */
function openDescendants(board, entry) {
  const visited = new Set([entry.id]);
  const open = [];
  const queue = [entry];
  while (queue.length > 0) {
    for (const childId of queue.shift().subIssueIds ?? []) {
      if (visited.has(childId)) continue;
      visited.add(childId);
      const child = board.byId.get(childId);
      if (!child) continue;
      if (child.error) throw child.error;
      if (child.issue.status !== "closed") open.push(childId);
      queue.push(child);
    }
  }
  return open;
}

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

function rejectClaimFields(data, verb = "create") {
  for (const field of CLAIM_FIELDS) {
    if (data?.[field] !== undefined && data[field] !== null) {
      const remedy = verb === "create" ? "claim the issue with claim() after it exists" : "claim the issue with claim()";
      throw codedError("VALIDATION", `${field} cannot be set on ${verb}; ${remedy}. Nothing was sent to GitHub.`, { field });
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

/**
 * Validate an update payload before any request, as validateCreate does. Text
 * fields given as "" or null are cleared; a value left undefined is not touched.
 */
function validateChanges(changes, keys, verb) {
  if (changes === null || typeof changes !== "object" || Array.isArray(changes)) {
    throw codedError("VALIDATION", `${verb} takes an object of changes`);
  }
  rejectPlanTask(changes);
  rejectClaimFields(changes, verb);
  for (const [key, value] of Object.entries(changes)) {
    if (value !== undefined && !CLAIM_FIELDS.includes(key) && !keys.includes(key)) {
      throw codedError("VALIDATION", `${verb} on the github backend writes ${keys.filter((k) => k !== "planTask").join(", ")}; ${key} is not supported here. Nothing was sent to GitHub.`, { field: key });
    }
  }

  const v = { text: {} };
  if (changes.title !== undefined) {
    if (typeof changes.title !== "string" || changes.title.trim() === "") throw codedError("MISSING_REQUIRED_FIELD", "Issue title cannot be empty");
    v.title = changes.title;
  }
  if (BODY_KEYS.some((k) => changes[k] !== undefined)) {
    const notes = resolveNotes(changes);
    if (typeof notes !== "string") throw codedError("INVALID_NOTES", "notes must be a string when provided");
    v.notes = notes;
  }
  if (changes.status !== undefined) {
    if (!UPDATE_STATUSES.includes(changes.status)) {
      throw codedError("VALIDATION", `Invalid status: ${changes.status}. Valid: ${CREATE_STATUSES.join(", ")} (close an issue with close()).`);
    }
    v.status = changes.status;
  }
  check("priority", changes.priority);
  v.priority = changes.priority;
  for (const field of UPDATE_TEXT_FIELDS) {
    const value = changes[field];
    if (value === undefined) continue;
    if (value === null || value === "") {
      v.text[field] = "";
    } else {
      check(field, value);
      v.text[field] = String(value);
    }
  }
  check("affected_modules", changes.affected_modules);
  v.affected_modules = changes.affected_modules;
  check("milestone", changes.milestone);
  v.milestone = changes.milestone;
  return v;
}

function notFound(id) {
  return codedError("NOT_FOUND", `Issue not found on the GitHub project: ${id}`);
}

/**
 * Did a rejected claim request land the `landed` field's write alone? Aliases of one
 * request run independently and GitHub reports each failure at its alias's path, so
 * `landed` ran exactly when every error is scoped to another of the request's aliases.
 * An error with no path is request-level: no alias is known to have run.
 */
function claimFieldLandedAlone(err, landed) {
  const errors = err?.code === CODES.GITHUB_REQUEST_FAILED ? err.graphqlErrors : null;
  if (!Array.isArray(errors) || errors.length === 0) return false;
  const others = CLAIM_WRITE_ORDER.filter((field) => field !== landed).map(claimAlias);
  return errors.every((e) => Array.isArray(e.path) && others.includes(e.path[0]));
}

/** The claim did not hold: a re-read shows another owner (or none). Nothing further is written. */
function lostClaim(issue, claimant) {
  const holder = issue.owner ?? null;
  const tail = `the claim for "${claimant}" did not hold, and nothing further was written.`;
  const message = holder
    ? `Issue ${issue.id} is already claimed by "${holder}"${issue.claimed_at ? ` (since ${issue.claimed_at})` : ""}; ${tail}`
    : `Claim lost: ${issue.id} no longer carries our claim; ${tail}`;
  return codedError("ISSUE_ALREADY_CLAIMED", message, { owner: holder, claimed_at: issue.claimed_at ?? null });
}

export class GithubAdapter {
  /**
   * @param {string} storageRoot
   * @param {object} manifest
   * @param {{ exec?: Function, env?: object, now?: () => number, sleep?: (ms: number) => Promise<void>, pace?: { minIntervalMs: number, maxSingleWaitMs: number, maxWaits: number, maxTotalWaitMs: number } }} [options]
   *   `exec` is an `execFileSync`-compatible spawn (replayed in tests); `env` is the base
   *   environment for `gh` (default `process.env`); `now` and `sleep` make claim timestamps,
   *   the claim settle wait and pacing deterministic. `pace` is the migration verb's fixed
   *   mutation policy (GitHub spec BEH-35: mutations spaced, a rate limit waited out within
   *   bounds); without it a rate limit is thrown at once, with no wait and no retry.
   * @throws {Error & { code: "GITHUB_INVALID_CONFIG", key: string }}
   */
  constructor(storageRoot, manifest, { exec, env, now = Date.now, sleep = defaultSleep, pace = null } = {}) {
    this.name = "github";
    this.storageRoot = storageRoot;
    this.config = normalizeGithubConfig(manifest?.tasks?.github);
    this.claimTtlMinutes = normalizeClaimTtlMinutes(manifest?.tasks?.claim_ttl_minutes);
    const [owner, repo] = this.config.repo.split("/");
    this.home = { owner, repo };
    this.moduleSlugs = (manifest?.modules ?? []).map((m) => m?.slug).filter((s) => typeof s === "string");
    this._now = now;
    this._sleep = sleep;
    this._pace = pace;
    this._lastMutationAt = null;
    this._rateWaits = 0;
    this._rateWaitedMs = 0;
    this._transport = createTransport({ exec, env });
    this._preflight = createPreflight({ transport: this._transport, config: this.config });
    this._board = null;
    this._written = new Map();
  }

  // ---------------------------------------------------------------------------
  // Internal: board cache, shared with the write path
  // ---------------------------------------------------------------------------

  _ensure() {
    return this._preflight.ensure();
  }

  /**
   * Drop the cached listing so the next board read fetches it again. Items this
   * instance wrote are kept and overlaid on that read (see `_wrote`).
   */
  _invalidateBoard() {
    this._board = null;
  }

  _readBoard() {
    if (!this._board) {
      const { projectId } = this._ensure();
      const { entries, drift } = readBoard(this._transport, this.config, { projectId, moduleSlugs: this.moduleSlugs });
      this._board = { entries, drift, byId: new Map(entries.map((e) => [e.id, e])) };
      for (const entry of this._written.values()) this._overlay(entry);
    }
    return this._board;
  }

  /** Put `entry` in the cached board in place of the row with its ID, or after the last row. */
  _overlay(entry) {
    const board = this._board;
    const at = board.entries.findIndex((e) => e.id === entry.id);
    if (at >= 0) board.entries[at] = entry;
    else board.entries.push(entry);
    board.byId.set(entry.id, entry);
  }

  /**
   * Write-through for a write that succeeded: `entry` (the item as read back, or
   * as written) overrides the listing's row for its ID in the cached board and in
   * every listing this instance reads later. The listing lags writes, so its row
   * for an item this instance wrote is never newer than this instance's own
   * last write and read-back.
   */
  _wrote(entry) {
    this._written.set(entry.id, entry);
    if (this._board) this._overlay(entry);
  }

  /**
   * A write to `id` failed part-way, so neither the cached board nor this
   * instance's last read-back is known to be current: drop both, and let the
   * next listing decide.
   */
  _writeFailed(id) {
    this._written.delete(id);
    this._invalidateBoard();
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
   * project matches. A home-repo gh-<n> ID resolves by a direct read of that
   * issue's item on this project (readIssueEntry), which is strongly consistent;
   * the listing may not show an item created seconds ago. Any other gh ID
   * resolves through the board read. Old (non-gh) IDs resolve through the raw
   * Legacy ID text of the board read, so they still find an item whose decode
   * was refused, but only text the decoder's legacy_id predicate accepts can
   * match: decode never trims or repairs a value, so a value it refuses names no
   * old ID.
   */
  _resolve(input) {
    const parsed = typeof input === "string" ? parseId(input) : null;
    if (parsed && !parsed.github) {
      const matches = this._readBoard().entries.filter((e) => FIELD_PREDICATES.legacy_id(e.legacyText) && e.legacyText === input);
      if (matches.length > 1) {
        const ids = matches.map((e) => e.id);
        throw githubError(CODES.GITHUB_AMBIGUOUS_LEGACY_ID, `Old ID ${input} matches the legacy_id of more than one GitHub item (${ids.join(", ")}); use the gh ID instead.`, { ids });
      }
      return matches[0] ?? null;
    }
    const id = normalizeGithubIdInput(input, this.home);
    const home = HOME_ID.exec(id);
    if (!home) return this._readBoard().byId.get(id) ?? null;
    const { projectId } = this._ensure();
    return readIssueEntry(this._transport, this.config, { projectId, number: Number(home[1]), moduleSlugs: this.moduleSlugs });
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
    return (await this._createItem(validateCreate(data))).issue;
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
    return (await this._createItem(validateCreate({ ...picked, type: "epic" }))).issue;
  }

  /**
   * Write an epic's changed title, notes, status, `planRef` and `milestone` through
   * the same rules as update(); unchanged values are not sent.
   *
   * @throws {Error & { code: "NOT_FOUND" }} when `id` is not an epic on the project
   * @throws {Error & { code: "ISSUE_CLOSED"|"USE_CLOSE_METHOD" }} from validateStatusTransition()
   */
  async updateEpic(id, changes = {}) {
    const v = validateChanges(changes, UPDATE_EPIC_KEYS, "updateEpic");
    this._ensure();
    const entry = this._resolve(id);
    if (entry?.error) throw entry.error;
    if (!entry || entry.issue.type !== "epic") throw codedError("NOT_FOUND", `Epic not found: ${id}`);
    return this._updateItem(entry, v, changes);
  }

  /**
   * Write the changed fields of an issue: Project fields, cleared text fields
   * among them, in one aliased request, then title and body, and adev-family label changes; then
   * return the item as read back. Nothing changed: no request after the board read.
   *
   * @throws {Error & { code: "VALIDATION"|"MISSING_REQUIRED_FIELD"|"INVALID_NOTES"|"GITHUB_INVALID_FIELD_VALUE"|"BOARD_GRANULARITY_VIOLATION" }}
   *   before any request; `owner` and `claimed_at` are refused because only claim() writes them
   * @throws {Error & { code: "NOT_FOUND"|"GITHUB_AMBIGUOUS_LEGACY_ID"|"ISSUE_CLOSED"|"USE_CLOSE_METHOD" }} before any write
   * @throws {Error & { code: "GITHUB_WRITE_FAILED" }} when GitHub rejects a write
   */
  async update(id, changes = {}) {
    const v = validateChanges(changes, UPDATE_KEYS, "update");
    this._ensure();
    const entry = this._resolve(id);
    if (!entry) throw notFound(id);
    if (entry.error) throw entry.error;
    return this._updateItem(entry, v, changes);
  }

  /**
   * Close an issue through the cascade and dependency guards: the `closed` status
   * option, then CloseIssue (state reason COMPLETED), then `reason` as a comment
   * when it is non-empty. Returns the item as it was before the close, with
   * status `closed`; nothing is read back.
   *
   * Both guards fail closed: a sub-issue on the project whose decode was refused
   * refuses the close with its own error, and a blocker off the project counts as
   * open unless GitHub reports it CLOSED.
   *
   * @throws {Error & { code: "CASCADE_BLOCKED"|"BLOCKED_BY_DEPENDENCIES", blockers: string[] }}
   *   naming the open transitive sub-issues on the project, or the blocked-by issues not known to be closed
   * @throws {Error & { code: "GITHUB_UNMAPPED_STATUS"|"GITHUB_INVALID_FIELD_VALUE", id: string }}
   *   when a sub-issue on the project or a blocker on the project cannot be decoded
   */
  async close(id, reason) {
    const { projectId } = this._ensure();
    const entry = this._resolve(id);
    if (!entry) throw notFound(id);
    if (entry.error) throw entry.error;
    const current = entry.issue;
    const board = this._readBoard();

    const openChildren = openDescendants(board, entry);
    if (openChildren.length > 0) {
      throw codedError("CASCADE_BLOCKED", `Cannot close ${current.id}: blocked by unclosed children: ${openChildren.join(", ")}. Close children first.`, { blockers: openChildren });
    }
    const blockers = [];
    for (const { id: depId, state } of entry.blockedBy ?? []) {
      const dep = board.byId.get(depId);
      if (dep?.error) throw dep.error;
      const open = dep ? dep.issue.status !== "closed" : state !== "CLOSED";
      if (open && !blockers.includes(depId)) blockers.push(depId);
    }
    if (blockers.length > 0) {
      throw codedError("BLOCKED_BY_DEPENDENCIES", `Cannot close ${current.id}: blocked by ${blockers.join(", ")}`, { blockers });
    }

    const { itemId, contentId } = entry.nodeIds;
    const statusSlot = this._statusSlot("closed");
    const comment = reason === undefined || reason === null ? "" : String(reason);
    try {
      await this._mutate("SetFields", ...this._setFields(projectId, itemId, [statusSlot]));
      await this._mutate("CloseIssue", CLOSE_ISSUE, { issueId: contentId });
      if (comment !== "") await this._mutate("AddComment", ADD_COMMENT, { subjectId: contentId, body: comment });
    } catch (err) {
      this._writeFailed(entry.id);
      throw err;
    }
    const closed = { ...current, status: "closed" };
    this._wrote({ ...entry, issue: closed });
    return closed;
  }

  /**
   * Record `issueId` as blocked by `dependsOnId`. An existing link is a no-op;
   * a link that would close a dependency cycle on the board is refused.
   *
   * @throws {Error & { code: "NOT_FOUND"|"CIRCULAR_DEPENDENCY" }} before any write
   * @throws {Error & { code: "GITHUB_WRITE_FAILED" }} when GitHub rejects the link
   */
  async addDependency(issueId, dependsOnId) {
    this._ensure();
    const from = this._resolve(issueId);
    if (!from) throw notFound(issueId);
    const to = this._resolve(dependsOnId);
    if (!to) throw notFound(dependsOnId);
    if (from.error) throw from.error;
    if (to.error) throw to.error;

    // The listing can lag, so both ends' links come from their direct reads.
    const depsMap = Object.fromEntries(this._decodedBoard().map((i) => [i.id, i.dependencies ?? []]));
    depsMap[from.id] = from.issue.dependencies ?? [];
    depsMap[to.id] = to.issue.dependencies ?? [];
    detectCycle(from.id, to.id, depsMap);
    if ((from.issue.dependencies ?? []).includes(to.id)) return;

    try {
      await this._mutate("AddBlockedBy", ADD_BLOCKED_BY, { issueId: from.nodeIds.contentId, blockingIssueId: to.nodeIds.contentId });
    } catch (err) {
      this._writeFailed(from.id);
      throw err;
    }
    this._wrote({
      ...from,
      issue: { ...from.issue, dependencies: [...(from.issue.dependencies ?? []), to.id] },
      blockedBy: [...(from.blockedBy ?? []), { id: to.id, state: to.issue.status === "closed" ? "CLOSED" : "OPEN" }],
    });
  }

  /**
   * Claim an issue for `owner` as a lease, by write and re-read: the precondition
   * runs on a fresh item read, then one request writes claimed_at then owner, then
   * the item is re-read, again after `claim_settle_ms`, and only once both re-reads
   * show this owner are `branch` / `pr` written and read back. A re-read showing
   * another owner throws and writes nothing further: rollback by abstention, so a
   * loser never restores the winner's claimed_at it may have overwritten.
   *
   * A takeover of an expired lease returns the json adapter's ephemeral `takeover`
   * object; it is never written to the board. Status is never written. A claim
   * request GitHub only partly applies is compensated as `_writeClaim` describes.
   *
   * @throws {Error & { code: "MISSING_OWNER"|"INVALID_OWNER"|"GITHUB_INVALID_FIELD_VALUE" }} before any request
   * @throws {Error & { code: "NOT_FOUND"|"GITHUB_AMBIGUOUS_LEGACY_ID"|"ISSUE_CLOSED" }} before any write
   * @throws {Error & { code: "ISSUE_ALREADY_CLAIMED", owner: string|null, claimed_at: string|null }}
   *   on a live lease held by another owner, or when a re-read shows the claim lost
   * @throws {Error & { code: "GITHUB_WRITE_FAILED", id?: string, owner?: string|null }} when GitHub
   *   rejects a write; `owner` is the holder a compensation re-read found and left alone
   */
  async claim(id, owner, opts = {}) {
    const claimant = normalizeOwner(owner);
    const work = {};
    for (const field of ["branch", "pr"]) {
      const value = opts[field] ?? undefined;
      check(field, value);
      if (value !== undefined) work[field] = value;
    }

    const { projectId } = this._ensure();
    const entry = this._resolve(id);
    if (!entry) throw notFound(id);
    if (entry.error) throw entry.error;
    const { itemId } = entry.nodeIds;

    const current = this._readItem(itemId).issue;
    // One instant for the check and the stamp: the staleness verdict acted on is the one recorded.
    const lease = { ttlMs: this.claimTtlMinutes * 60_000, now: this._now() };
    const stale = isClaimStale(current, lease);
    requireClaimable(current, claimant, lease);

    // A re-claim inside the holder's live lease keeps its clock; an expired one restarts it.
    const held = current.owner === claimant && !stale && current.claimed_at;
    const claimedAt = held ? current.claimed_at : new Date(lease.now).toISOString();
    const takeover = stale
      ? { previous_owner: current.owner, previous_claimed_at: current.claimed_at ?? null, ttl_minutes: this.claimTtlMinutes }
      : null;

    try {
      this._writeClaim(projectId, itemId, current.id, claimedAt, claimant, {
        previousOwner: stale ? current.owner ?? null : null,
        held: Boolean(held),
      });

      let read = this._readItem(itemId);
      if (read.issue.owner !== claimant) throw lostClaim(read.issue, claimant);
      await this._sleep(this.config.claim_settle_ms);
      read = this._readItem(itemId);
      if (read.issue.owner !== claimant) throw lostClaim(read.issue, claimant);

      const slots = Object.entries(work).map(([field, value]) => this._textSlot(field, value));
      if (slots.length > 0) {
        await this._mutate("SetFields", ...this._setFields(projectId, itemId, slots));
        read = this._readItem(itemId);
      }
      this._wrote(read);
      return takeover ? { ...read.issue, takeover } : read.issue;
    } catch (err) {
      this._writeFailed(entry.id);
      throw err;
    }
  }

  /**
   * Release a claim: clear owner, then claimed_at, as two clear slots of one
   * request, and return the item as read back; branch and pr stay. Lease-blind,
   * as on the json backend. Nothing held: a no-op with no write.
   *
   * @throws {Error & { code: "MISSING_OWNER"|"INVALID_OWNER" }} before any request
   * @throws {Error & { code: "NOT_FOUND"|"GITHUB_AMBIGUOUS_LEGACY_ID" }} before any write
   * @throws {Error & { code: "CLAIM_OWNER_MISMATCH", owner: string }} another owner's claim, without `force`
   * @throws {Error & { code: "GITHUB_WRITE_FAILED" }} when GitHub rejects the clear
   */
  async release(id, owner, opts = {}) {
    const claimant = normalizeOwner(owner);
    const { projectId } = this._ensure();
    const entry = this._resolve(id);
    if (!entry) throw notFound(id);
    if (entry.error) throw entry.error;
    const { itemId } = entry.nodeIds;

    const current = this._readItem(itemId).issue;
    requireReleasable(current, claimant, { force: opts.force === true });
    if (!current.owner && !current.claimed_at) return current;

    const slots = CLAIM_FIELDS.map((field) => ({ field, kind: "clear", fieldId: this._textSlot(field, "").fieldId }));
    let read;
    try {
      await this._mutate("SetFields", ...this._setFields(projectId, itemId, slots));
      read = this._readItem(itemId);
    } catch (err) {
      this._writeFailed(entry.id);
      throw err;
    }
    this._wrote(read);
    return read.issue;
  }

  // ---------------------------------------------------------------------------
  // Internal: write path
  // ---------------------------------------------------------------------------

  /** A fresh read of one item's entry, bypassing the board cache. */
  _readItem(itemId) {
    return readItem(this._transport, this.config, { itemId, moduleSlugs: this.moduleSlugs });
  }

  /**
   * The claim write: claimed_at then owner in one request, so an owner is never
   * written ahead of its lease clock. When GitHub applies only one alias, the item
   * is re-read and the partial claim cleared by one request, but only while the
   * re-read still shows exactly what this request left; any other state is another
   * writer's, so nothing more is written. Either way the claim throws.
   * - owner landed alone: an owner without claimed_at holds a lease that can never
   *   expire, so owner is cleared while it still reads as the claimant.
   * - claimed_at landed alone on a takeover (`previousOwner` set): the previous
   *   holder now has a fresh lease, so owner then claimed_at are cleared while the
   *   item still reads as that holder with this request's claimed_at.
   * On a re-claim inside the claimant's own live lease (`held`), neither direction is
   * compensated: either alias alone leaves that live lease as it was, so a clear
   * would only destroy a valid claim.
   */
  _writeClaim(projectId, itemId, id, claimedAt, claimant, { previousOwner, held }) {
    const values = { claimed_at: claimedAt, owner: claimant };
    const slots = CLAIM_WRITE_ORDER.map((field) => this._textSlot(field, values[field]));
    try {
      this._transport.request(...this._setFields(projectId, itemId, slots));
    } catch (err) {
      const failed = writeFailed(err, "SetFields");
      if (held) throw failed;
      if (claimFieldLandedAlone(err, "owner")) {
        this._compensateClaim(projectId, itemId, id, failed, {
          leftByUs: (issue) => issue.owner === claimant,
          fields: ["owner"],
          hazard: `owner may be set without claimed_at on ${id}: release it with \`adev issues release ${id} --owner ${claimant}\``,
          cleared: `The owner written to ${id} was cleared`,
        });
      }
      if (previousOwner && claimFieldLandedAlone(err, "claimed_at")) {
        this._compensateClaim(projectId, itemId, id, failed, {
          leftByUs: (issue) => issue.owner === previousOwner && issue.claimed_at === claimedAt,
          fields: ["owner", "claimed_at"],
          hazard: `the lease on ${id} may be extended: "${previousOwner}" may hold it from ${claimedAt}; ` +
            `release it with \`adev issues release ${id} --owner ${previousOwner}\``,
          cleared: `The lease this claim's claimed_at extended for "${previousOwner}" was cleared`,
        });
      }
      throw failed;
    }
  }

  /** Re-read, then clear `fields` in order only when `leftByUs(issue)`; always throws GITHUB_WRITE_FAILED. */
  _compensateClaim(projectId, itemId, id, failed, { leftByUs, fields, hazard, cleared }) {
    const extra = { id, operation: "SetFields" };
    let issue;
    try {
      issue = this._readItem(itemId).issue;
    } catch (readErr) {
      throw githubError(CODES.GITHUB_WRITE_FAILED, `${failed.message}. Re-reading ${id} then failed (${readErr.message}), so nothing more was written and ${hazard}.`, extra);
    }
    if (!leftByUs(issue)) {
      const holder = issue.owner ? `"${issue.owner}"` : "no owner";
      throw githubError(
        CODES.GITHUB_WRITE_FAILED,
        `${failed.message}. ${id} now reads ${holder}${issue.claimed_at ? ` (since ${issue.claimed_at})` : ""}, which another writer left, so nothing more was written.`,
        { ...extra, owner: issue.owner ?? null },
      );
    }
    const clears = fields.map((field) => ({ field, kind: "clear", fieldId: this._textSlot(field, "").fieldId }));
    try {
      this._transport.request(...this._setFields(projectId, itemId, clears));
    } catch (clearErr) {
      throw githubError(
        CODES.GITHUB_WRITE_FAILED,
        `${failed.message}. Clearing ${fields.join(" then ")} on ${id} then failed too (${writeFailed(clearErr, "SetFields").message}), so ${hazard}.`,
        extra,
      );
    }
    throw githubError(CODES.GITHUB_WRITE_FAILED, `${failed.message}. ${cleared}; ${id} is unclaimed.`, extra);
  }

  async _mutate(operation, document, variables) {
    const pace = this._pace;
    for (;;) {
      if (pace && this._lastMutationAt !== null) {
        // A sleep may wake early, so the gap is re-checked once; never more, so a
        // clock that does not advance cannot spin.
        for (let check = 0; check < 2; check += 1) {
          const gap = this._lastMutationAt + pace.minIntervalMs - this._now();
          if (gap <= 0) break;
          await this._sleep(gap);
        }
      }
      if (pace) this._lastMutationAt = this._now();
      try {
        return this._transport.request(document, variables);
      } catch (err) {
        const wait = pace ? this._rateLimitWait(err) : null;
        if (wait === null) throw writeFailed(err, operation);
        this._rateWaits += 1;
        this._rateWaitedMs += wait;
        if (wait > 0) await this._sleep(wait);
      }
    }
  }

  /** The wait before re-issuing a rate-limited request, or null when it is outside the pace bounds. */
  _rateLimitWait(err) {
    if (err?.code !== CODES.GITHUB_RATE_LIMITED) return null;
    const resetMs = typeof err.resetAt === "string" ? Date.parse(err.resetAt) : NaN;
    if (!Number.isFinite(resetMs)) return null;
    const { maxSingleWaitMs, maxWaits, maxTotalWaitMs } = this._pace;
    const wait = Math.max(0, resetMs - this._now());
    if (wait > maxSingleWaitMs || this._rateWaits >= maxWaits || this._rateWaitedMs + wait > maxTotalWaitMs) return null;
    return wait;
  }

  _slotVariables(projectId, itemId, slots) {
    const variables = { projectId, itemId };
    slots.forEach((slot, i) => {
      variables[`f${i}Field`] = slot.fieldId;
      if (slot.kind !== "clear") variables[`f${i}Value`] = slot.value;
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

  _statusSlot(status) {
    const statusField = this._ensure().fields[this.config.status_field];
    const option = this.config.status_map_write[status];
    return { field: "status", kind: "single_select", fieldId: statusField.id, value: statusField.options.find((o) => o.name === option).id };
  }

  /** The Priority slot for `priority`, or `{ label }` when an unconfigured board has no Priority field. */
  _priorityWrite(priority) {
    const config = this.config;
    const name = config.priority_field ?? DEFAULT_PRIORITY_FIELD;
    const node = this._ensure().fields[name];
    // A configured priority_field is the only priority home: the label fallback is for an unconfigured board.
    if (config.priority_field !== undefined && node?.dataType !== "NUMBER") {
      throw githubError(CODES.GITHUB_FIELD_MISSING, `Project field "${name}" (tasks.github.priority_field) is missing or is not a number field; nothing was written. Create it, ${SETUP_REMEDY}`, { field: name, expectedType: "NUMBER" });
    }
    if (node?.dataType === "SINGLE_SELECT") {
      const option = (node.options ?? []).find((o) => o?.name === `P${priority}`);
      if (!option) {
        throw githubError(CODES.GITHUB_WRITE_FAILED, `Project field "${name}" has no option "P${priority}"; nothing was written. Add the option, ${SETUP_REMEDY}`, { missing: `P${priority}` });
      }
      return { slot: { field: "priority", kind: "single_select", fieldId: node.id, value: option.id } };
    }
    if (node?.dataType === "NUMBER") return { slot: { field: "priority", kind: "number", fieldId: node.id, value: priority } };
    return { label: `priority:${priority}` };
  }

  _labelIds(names) {
    if (names.length === 0) return [];
    const byName = new Map(this._repoNodes(REPO_LABELS_QUERY, "labels").map((n) => [n?.name, n?.id]));
    return names.map((name) => {
      if (!byName.has(name)) throw missingOnGithub("Label", name, this.config.repo);
      return byName.get(name);
    });
  }

  /**
   * Resolve every write a validated change set needs against the current item,
   * then send them. Labels change only within adev's families: a replaced
   * `priority:` label (label fallback only) and the `module:` labels of decoded
   * affected_modules; every other label is left as it is.
   */
  async _updateItem(entry, v, changes) {
    const current = entry.issue;
    validateStatusTransition(current.status, changes);
    const { projectId } = this._ensure();
    const { itemId, contentId } = entry.nodeIds;
    const labels = entry.labels ?? [];

    const slots = [];
    const add = [];
    const remove = [];
    if (v.status !== undefined && v.status !== current.status) slots.push(this._statusSlot(v.status));
    if (v.priority !== undefined && v.priority !== current.priority) {
      const write = this._priorityWrite(v.priority);
      if (write.slot) {
        slots.push(write.slot);
      } else {
        if (!labels.includes(write.label)) add.push(write.label);
        remove.push(...labels.filter((l) => PRIORITY_LABEL.test(l) && l !== write.label));
      }
    }
    for (const field of UPDATE_TEXT_FIELDS) {
      const value = v.text[field];
      if (value === undefined || value === (current[field] ?? "")) continue;
      const textSlot = this._textSlot(field, value);
      slots.push(value === "" ? { field, kind: "clear", fieldId: textSlot.fieldId } : textSlot);
    }
    const issueText = {};
    if (v.title !== undefined && v.title !== current.title) issueText.title = v.title;
    if (v.notes !== undefined && v.notes !== (current.notes ?? "")) issueText.body = v.notes;
    if (v.affected_modules !== undefined) {
      const have = current.affected_modules ?? [];
      for (const slug of v.affected_modules) if (!labels.includes(`module:${slug}`)) add.push(`module:${slug}`);
      for (const slug of have) if (!v.affected_modules.includes(slug)) remove.push(`module:${slug}`);
    }
    const addIds = this._labelIds(add);
    const removeIds = this._labelIds(remove);
    const milestoneId = v.milestone !== undefined && v.milestone !== current.milestone
      ? this._lookupId(REPO_MILESTONES_QUERY, "milestones", "title", v.milestone, "Milestone")
      : undefined;

    const hasIssueText = Object.keys(issueText).length > 0;
    if (slots.length === 0 && !hasIssueText && addIds.length === 0 && removeIds.length === 0 && milestoneId === undefined) {
      return current;
    }

    let read;
    try {
      if (slots.length > 0) await this._mutate("SetFields", ...this._setFields(projectId, itemId, slots));
      if (hasIssueText) await this._mutate("UpdateIssue", UPDATE_ISSUE, { issueId: contentId, ...issueText });
      if (addIds.length > 0) await this._mutate("AddLabels", ADD_LABELS, { labelableId: contentId, labelIds: addIds });
      if (removeIds.length > 0) await this._mutate("RemoveLabels", REMOVE_LABELS, { labelableId: contentId, labelIds: removeIds });
      if (milestoneId !== undefined) await this._mutate("SetMilestone", SET_MILESTONE, { issueId: contentId, milestoneId });
      read = this._readItem(itemId);
    } catch (err) {
      this._writeFailed(entry.id);
      throw err;
    }
    this._wrote(read);
    return read.issue;
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

    const slots = [this._statusSlot(v.status)];

    if (v.priority !== undefined) {
      const write = this._priorityWrite(v.priority);
      if (write.slot) slots.push(write.slot);
      else labels.push(write.label);
    }
    for (const field of CREATE_TEXT_FIELDS) {
      if (field !== "legacy_id" && v.text[field] !== undefined) slots.push(this._textSlot(field, v.text[field]));
    }
    // GitHub runs a request's top-level mutations in order, so slot 0 lands
    // first: once Legacy ID is written, a later failure leaves an item a
    // migration re-run can find by legacy_id.
    if (v.text.legacy_id !== undefined) slots.unshift(this._textSlot("legacy_id", v.text.legacy_id));
    for (const slug of v.affected_modules) labels.push(`module:${slug}`);

    const labelIds = this._labelIds(labels);
    const milestoneId = v.milestone !== undefined
      ? this._lookupId(REPO_MILESTONES_QUERY, "milestones", "title", v.milestone, "Milestone")
      : undefined;

    return { pre, parentContentId, blockingIds, issueTypeId, slots, labels, labelIds, milestoneId };
  }

  async _createItem(v) {
    const plan = this._planCreate(v);
    const { pre } = plan;
    let created = null;
    let itemId;

    // Each step after CreateIssue, with the fields it carries; on failure the
    // failed step's fields and every later step's are the unwritten ones.
    const steps = [
      { fields: ["project"], run: async () => {
        itemId = (await this._mutate("AddToProject", ADD_TO_PROJECT, { projectId: pre.projectId, contentId: created.contentId }))?.addProjectV2ItemById?.item?.id;
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
      const issue = (await this._mutate("CreateIssue", CREATE_ISSUE, { repositoryId: pre.repositoryId, title: v.title, body: v.notes }))?.createIssue?.issue;
      if (typeof issue?.id !== "string" || !Number.isSafeInteger(issue?.number)) {
        throw githubError(CODES.GITHUB_WRITE_FAILED, "GitHub returned no issue for CreateIssue; check the repository before retrying.");
      }
      created = { contentId: issue.id, id: encodeGithubId({ owner: this.home.owner, repo: this.home.repo, number: issue.number }, this.home) };

      let at = 0;
      let read;
      try {
        for (; at < steps.length; at += 1) await steps[at].run();
        read = this._readItem(itemId);
      } catch (err) {
        const unwritten = [...new Set(steps.slice(at).flatMap((s) => s.fields))];
        throw partialCreate(created.id, unwritten, err, this.config.project);
      }
      this._wrote(read);
      return read;
    } catch (err) {
      if (created) this._writeFailed(created.id);
      else this._invalidateBoard();
      throw err;
    }
  }

  /**
   * create() for the migration path: the same requests, returning the read-back
   * with its node ids so the item can be closed or linked without a board read.
   *
   * @returns {Promise<{ id: string, issue: object, nodeIds: { itemId: string, contentId: string } }>}
   */
  async createMigrated(data) {
    return this._createItem(validateCreate(data));
  }

  /**
   * Close a migrated item by its node ids, as close() does (the closed status
   * option, then CloseIssue with state reason COMPLETED) but with no comment and
   * no board read: the migration closes an item it has just written, before any
   * link exists, so close()'s cascade and blocked-by guards have nothing to check.
   *
   * @param {{ itemId: string, contentId: string }} nodeIds
   */
  async closeMigrated({ itemId, contentId }) {
    const { projectId } = this._ensure();
    const written = [...this._written.values()].find((e) => e.nodeIds.itemId === itemId);
    try {
      await this._mutate("SetFields", ...this._setFields(projectId, itemId, [this._statusSlot("closed")]));
      await this._mutate("CloseIssue", CLOSE_ISSUE, { issueId: contentId });
    } catch (err) {
      if (written) this._writeFailed(written.id);
      else this._invalidateBoard();
      throw err;
    }
    if (written) this._wrote({ ...written, issue: { ...written.issue, status: "closed" } });
    else this._invalidateBoard();
  }

  /**
   * Finish an issue an earlier migration run created, writing only what create()
   * would have written and the issue still lacks, with Legacy ID first. `entry`
   * is its board entry when it is on the project; with `entry` null the issue is
   * off the project (an unanchored issue, known by `id` and `contentId`): it is
   * added to the project and every field is written. Parents and dependencies are
   * not written here: the migration replays them once every item exists.
   *
   * @param {object} data - a create() payload without parent_id or dependencies
   * @param {{ entry?: object|null, id: string, contentId: string, check?: boolean }} target - with
   *   `check`, nothing is sent: the result is the fields that would be written ([] when none).
   *   With `count`, nothing is sent either: the result is the number of mutation requests it would make.
   *   With `closed`, the source item is closed: its status is close()'s to write, never this method's
   * @returns {Promise<{ id: string, issue: object, nodeIds: { itemId: string, contentId: string } }|string[]>}
   *   the item as read back, or as decoded when nothing was missing
   * @throws {Error & { code: "GITHUB_PARTIAL_CREATE", id: string, unwritten: string[] }} when a write fails
   */
  async completeMigrated(data, { entry = null, id, contentId, check = false, count = false, closed = false }) {
    const v = validateCreate({ ...data, parent_id: undefined, dependencies: [] });
    const plan = this._planCreate(v);
    const { pre } = plan;
    const current = entry?.issue ?? {};
    const lacks = (slot) => {
      if (!entry) return true;
      if (slot.field === "legacy_id") return entry.legacyText !== v.text.legacy_id;
      if (slot.field === "status") return !closed && current.status !== v.status;
      if (slot.field === "priority") return current.priority !== v.priority;
      return current[slot.field] !== v.text[slot.field];
    };
    const slots = plan.slots.filter(lacks);
    const missingLabels = plan.labels.map((name, i) => [name, plan.labelIds[i]]).filter(([name]) => !entry || !entry.labels.includes(name));
    const typeMissing = plan.issueTypeId !== undefined && (!entry || current.type !== v.type);
    const milestoneMissing = plan.milestoneId !== undefined && (!entry || current.milestone !== v.milestone);

    let itemId = entry?.nodeIds.itemId;
    const steps = [];
    if (!entry) {
      steps.push({ fields: ["project"], run: async () => {
        itemId = (await this._mutate("AddToProject", ADD_TO_PROJECT, { projectId: pre.projectId, contentId }))?.addProjectV2ItemById?.item?.id;
        if (typeof itemId !== "string") throw githubError(CODES.GITHUB_WRITE_FAILED, "GitHub returned no project item for AddToProject.");
      } });
    }
    if (slots.length > 0) steps.push({ fields: slots.map((s) => s.field), run: () => this._mutate("SetFields", ...this._setFields(pre.projectId, itemId, slots)) });
    if (missingLabels.length > 0) {
      steps.push({ fields: [...new Set(missingLabels.map(([name]) => labelField(name)))], run: () => this._mutate("AddLabels", ADD_LABELS, { labelableId: contentId, labelIds: missingLabels.map(([, labelId]) => labelId) }) });
    }
    if (typeMissing) steps.push({ fields: ["type"], run: () => this._mutate("SetIssueType", SET_ISSUE_TYPE, { issueId: contentId, issueTypeId: plan.issueTypeId }) });
    if (milestoneMissing) steps.push({ fields: ["milestone"], run: () => this._mutate("SetMilestone", SET_MILESTONE, { issueId: contentId, milestoneId: plan.milestoneId }) });
    if (count) return steps.length;
    if (check) return steps.flatMap((s) => s.fields);
    if (steps.length === 0) return { id: entry.id, issue: entry.issue, nodeIds: entry.nodeIds };

    let at = 0;
    let read;
    try {
      for (; at < steps.length; at += 1) await steps[at].run();
      read = this._readItem(itemId);
    } catch (err) {
      this._writeFailed(id);
      const unwritten = [...new Set(steps.slice(at).flatMap((s) => s.fields))];
      throw partialCreate(id, unwritten, err, this.config.project);
    }
    this._wrote(read);
    return read;
  }
}

export default GithubAdapter;
