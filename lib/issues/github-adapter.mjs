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

import { normalizeClaimTtlMinutes } from "./interface.mjs";
import { normalizeGithubIdInput, parseId } from "./id-utils.mjs";
import { normalizeGithubConfig } from "./github/config.mjs";
import { createTransport } from "./github/transport.mjs";
import { createPreflight } from "./github/preflight.mjs";
import { readBoard } from "./github/board-read.mjs";
import { FIELD_PREDICATES } from "./github/decode.mjs";
import { GITHUB_ERROR_CODES as CODES, githubError } from "./github/errors.mjs";

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
}

export default GithubAdapter;
