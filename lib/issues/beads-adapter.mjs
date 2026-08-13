/**
 * beads_rust (br) CLI adapter for issue management.
 *
 * Wraps the `br` CLI using execFileSync with array arguments
 * (never string interpolation) to prevent shell injection.
 *
 * Epic operations are delegated to a local JsonAdapter since beads_rust has no
 * epic adev can create — `br epic` exposes only `status` and `close-eligible`
 * (hybrid approach per SA-5).
 *
 * Uses only Node.js built-ins: child_process, fs, path.
 */

import { execFileSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { JsonAdapter } from "./json-adapter.mjs";
import {
  validateIssue,
  detectCycle,
  normalizeOwner,
  requireClaimable,
  requireReleasable,
  DEFAULT_CLAIM_TTL_MS,
} from "./interface.mjs";
import { parseId } from "./id-utils.mjs";

/**
 * Oldest `br` this adapter speaks to. 0.2.x moved `--db` from "the workspace
 * directory" to "the database file" and added the atomic `update --claim`;
 * both are load-bearing here, and against 0.1.x the failure is a raw
 * "Is a directory (os error 21)" rather than anything actionable.
 */
export const MIN_BR_VERSION = "0.2.0";

/** Compare dotted numeric versions. Returns <0, 0, or >0. */
function compareVersions(a, b) {
  const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export class BeadsAdapter {
  /**
   * @param {string} projectRoot
   * @param {object} [opts]
   * @param {boolean} [opts.checkBr=true] - Check if br is on PATH
   */
  constructor(projectRoot, opts = {}) {
    this.name = "beads";
    this.projectRoot = projectRoot;
    // `.beads/` is the workspace DIRECTORY; `--db` wants the database FILE
    // inside it. Resolved lazily because `br init` may not have run yet.
    this.workspaceDir = join(projectRoot, ".beads");
    this.dbPath = null;

    // The id map is the beads backend's half of the board: it is the only
    // place adev issue IDs, and the branch/pr fields beads has no column for,
    // are stored, so it must live where the board lives. `projectRoot` is
    // already the resolved storage root — registry.mjs calls
    // resolveStorageRoot() before constructing every adapter — so joining here
    // is correct and a second resolution would just re-spawn git.
    this.mapPath = join(projectRoot, ".context-index", "tasks", ".beads-map.json");

    // Epics are delegated to a local adapter because beads has no epic that
    // adev can create: `br epic` offers only `status` and `close-eligible`.
    //
    // That delegation used to target FileAdapter, which became read-only-
    // deprecated — so `createEpic` threw BACKEND_READ_ONLY_DEPRECATED and, since
    // /adev:implement creates an epic as its first board action, the entire
    // lifecycle was unusable on the beads backend. JsonAdapter is the maintained
    // local store and exposes the identical epic API.
    //
    // Constructed LAZILY: JsonAdapter validates its project root eagerly, while
    // BeadsAdapter is legitimately constructed against paths that do not exist
    // — the availability probe in lib/cli/issues-migrate.mjs and the interface
    // -shape tests both do it. Validation belongs at first epic use, not at
    // construction.
    this._epicAdapterInstance = null;

    if (opts.checkBr !== false) {
      this._detectBr();
    }
  }

  _detectBr() {
    let raw;
    try {
      raw = execFileSync("br", ["--version"], { encoding: "utf8", stdio: "pipe" });
    } catch {
      const err = new Error(
        "beads_rust (br) is not available. Install from: https://github.com/Dicklesworthstone/beads_rust"
      );
      err.code = "BEADS_NOT_AVAILABLE";
      throw err;
    }

    // `br --version` prints e.g. "br 0.2.22".
    const m = String(raw).match(/(\d+\.\d+\.\d+)/);
    this.brVersion = m ? m[1] : null;
    if (this.brVersion && compareVersions(this.brVersion, MIN_BR_VERSION) < 0) {
      const err = new Error(
        `beads_rust (br) ${this.brVersion} is too old — adev requires >= ${MIN_BR_VERSION}. ` +
          `Older releases take a workspace directory for --db and have no atomic ` +
          `\`update --claim\`. Upgrade with \`br upgrade\` or from ` +
          `https://github.com/Dicklesworthstone/beads_rust/releases`
      );
      err.code = "BEADS_VERSION_UNSUPPORTED";
      throw err;
    }
  }

  /**
   * Locate the SQLite file inside `.beads/`. Returns null when the workspace
   * has not been initialized, in which case `--db` is omitted and `br` applies
   * its own auto-discovery (and its own, clearer, error).
   */
  _resolveDbPath() {
    if (this.dbPath) return this.dbPath;
    if (!existsSync(this.workspaceDir)) return null;
    let entries;
    try {
      entries = readdirSync(this.workspaceDir);
    } catch {
      return null;
    }
    // `beads.db` is the default name; accept any single *.db so a workspace
    // configured with a different name still resolves.
    const dbs = entries.filter((f) => f.endsWith(".db"));
    const chosen = dbs.includes("beads.db") ? "beads.db" : dbs[0];
    if (!chosen) return null;

    // Canonicalize. br refuses a --db route with a symlinked parent component
    // ("Refusing configured database route with a symlinked parent"), and on
    // macOS the common temp and home paths are symlinks — /var → /private/var
    // is enough to break every call. git rev-parse already hands back
    // canonical paths, so only a directly-supplied root exposes this.
    let dir = this.workspaceDir;
    try {
      dir = realpathSync.native(this.workspaceDir);
    } catch {
      // Not yet resolvable — fall back to the literal path and let br report.
    }
    this.dbPath = join(dir, chosen);
    return this.dbPath;
  }

  _runBr(args) {
    try {
      const db = this._resolveDbPath();
      const fullArgs = db ? ["--db", db, ...args] : [...args];
      const result = execFileSync("br", fullArgs, {
        encoding: "utf8",
        cwd: this.projectRoot,
        stdio: "pipe",
      });
      return result;
    } catch (err) {
      // br reports structured failures as JSON on STDOUT and leaves stderr
      // empty, so a stderr-only message degrades to a bare "Command failed:
      // <the whole argv>" — which is what made the symlinked-db refusal take a
      // manual repro to diagnose. Prefer whichever stream actually spoke.
      const detail = String(err.stderr || "").trim() || String(err.stdout || "").trim() || err.message;
      const error = new Error(`br command failed: ${detail}`);
      error.code = "BEADS_COMMAND_FAILED";
      throw error;
    }
  }

  /** @returns {JsonAdapter} the local store backing epic operations */
  get _epicAdapter() {
    if (!this._epicAdapterInstance) {
      this._epicAdapterInstance = new JsonAdapter(this.projectRoot);
    }
    return this._epicAdapterInstance;
  }

  _readMap() {
    if (!existsSync(this.mapPath)) return {};
    try {
      return JSON.parse(readFileSync(this.mapPath, "utf8"));
    } catch {
      return {};
    }
  }

  _writeMap(map) {
    const dir = dirname(this.mapPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.mapPath, JSON.stringify(map, null, 2));
  }

  _getBeadsId(issueId) {
    const map = this._readMap();
    const entry = map[issueId];
    if (!entry) {
      const err = new Error(`No beads mapping for issue: ${issueId}`);
      err.code = "NOT_FOUND";
      throw err;
    }
    // Support both old format (plain string) and new format (object with beadsId)
    return typeof entry === "string" ? entry : entry.beadsId;
  }

  async init() {
    await this._epicAdapter.init();
  }

  async create(issueData) {
    const issue = validateIssue(issueData);

    const args = ["create", issue.title, "--type", issue.type, "--priority", String(issue.priority), "--json"];
    const output = this._runBr(args);
    const parsed = JSON.parse(output);

    const beadsId = parsed.id || parsed.issue_id;
    const map = this._readMap();
    const nextId = `issue-${Object.keys(map).filter(k => k.startsWith("issue-")).length + 1}`;

    issue.id = nextId;
    map[nextId] = {
      beadsId,
      epicId: issue.epicId,
      parent_id: issue.parent_id,
      planRef: issue.planRef,
      planTask: issue.planTask,
      spec_ref: issue.spec_ref,
      next_action: issue.next_action ?? null,
      branch: issue.branch,
      pr: issue.pr,
      owner: issue.owner,
      claimed_at: issue.claimed_at,
    };
    this._writeMap(map);

    return issue;
  }

  async update(id, changes) {
    const beadsId = this._getBeadsId(id);
    const args = ["update", beadsId];

    if (changes.status) args.push("--status", changes.status);
    args.push("--json");

    this._runBr(args);

    // Persist map-only metadata when it was updated. `br` has no column for
    // these fields, so the sidecar map is their only home — omitting a field
    // here means `update(id, { branch })` silently drops it on this backend.
    const mapOnlyFields = ["next_action", "branch", "pr", "owner", "claimed_at"];
    const touched = mapOnlyFields.filter((f) => f in changes);
    if (touched.length > 0) {
      const map = this._readMap();
      if (map[id]) {
        const entry = typeof map[id] === "string" ? { beadsId: map[id] } : { ...map[id] };
        for (const field of touched) {
          entry[field] =
            field === "next_action"
              ? (changes[field] ?? null)
              : (changes[field] ?? undefined);
        }
        map[id] = entry;
        this._writeMap(map);
      }
    }

    // Return updated issue shape
    return { id, ...changes, updated: new Date().toISOString() };
  }

  /**
   * Atomic check-and-set claim, backed by `br update --claim`.
   *
   * br 0.2.x provides the exclusivity primitive natively: `--claim` sets
   * assignee=actor + status=in_progress and REFUSES (exit 4,
   * `claim: issue X already assigned to Y`) when the issue is already held.
   * That refusal is evaluated inside br's own transaction, so two racing
   * agents cannot both win — which is the property `claim` exists to provide
   * and the reason this is not a read-then-write in JavaScript.
   *
   * adev's `owner` maps onto br's `assignee`, because assignee is the field
   * `--claim` actually guards. `claimed_at` has no br column and lives in the
   * sidecar map; it drives lease expiry only, never exclusivity.
   *
   * KNOWN NON-PARITY — stale takeover is not atomic here. br refuses to
   * reassign a held issue, so expiring a lease takes two calls (clear the
   * assignee, then claim). Two agents that both observe the same expired lease
   * can therefore both proceed. The window is bounded by TTL expiry rather
   * than by contention, so it is far narrower than the no-gate-at-all case
   * this replaces — but it is real, and `tasks.backend: json` is the backend
   * with an atomic takeover.
   *
   * @param {string} id
   * @param {string} owner
   * @param {{ branch?: string, pr?: string, ttlMs?: number }} [opts]
   * @returns {Promise<object>}
   */
  async claim(id, owner, opts = {}) {
    const claimant = normalizeOwner(owner);
    const beadsId = this._getBeadsId(id);

    const current = await this.get(id);
    // Shared precondition — identical refusal semantics and error codes as the
    // json backend, so callers do not branch on backend.
    requireClaimable(current, claimant, { ttlMs: opts.ttlMs ?? DEFAULT_CLAIM_TTL_MS });

    const held = current?.owner;
    const idempotent = held === claimant;
    const takingOver = Boolean(held) && !idempotent;

    if (takingOver) {
      // requireClaimable already established the lease is expired. br will not
      // reassign a held issue, so clear it first — the non-atomic step called
      // out above.
      this._runBr(["update", beadsId, "--assignee", "", "--json"]);
    }

    if (!idempotent) {
      this._runBr(["--actor", claimant, "update", beadsId, "--claim", "--json"]);
    }

    const changes = {
      owner: claimant,
      // An idempotent re-claim inside a live lease keeps its original stamp so
      // a resumed session is not penalised; a takeover starts a fresh lease.
      claimed_at: idempotent && current?.claimed_at ? current.claimed_at : new Date().toISOString(),
      status: "in_progress",
    };
    if (opts.branch !== undefined) changes.branch = opts.branch;
    if (opts.pr !== undefined) changes.pr = opts.pr;

    await this.update(id, changes);

    const result = { ...(current ?? { id }), ...changes };
    if (takingOver) {
      result.takeover = {
        previous_owner: held,
        previous_claimed_at: current?.claimed_at ?? null,
      };
    }
    return result;
  }

  /**
   * Release a claim: clears `owner`/`claimed_at` and br's `assignee`.
   * `branch`/`pr` are deliberately left in place — they record where the work
   * went, not who is holding it. TTL-blind, matching the json backend.
   *
   * @param {string} id
   * @param {string} owner
   * @param {{ force?: boolean }} [opts]
   */
  async release(id, owner, opts = {}) {
    const claimant = normalizeOwner(owner);
    const beadsId = this._getBeadsId(id);

    const current = await this.get(id);
    requireReleasable(current, claimant, { force: opts.force === true });

    if (!current?.owner) return current ?? { id }; // idempotent no-op

    this._runBr(["update", beadsId, "--assignee", "", "--json"]);
    await this.update(id, { owner: undefined, claimed_at: undefined });

    return { ...current, owner: undefined, claimed_at: undefined };
  }

  async close(id, reason) {
    const beadsId = this._getBeadsId(id);
    this._runBr(["close", beadsId, "--reason", reason]);
    return { id, status: "closed", notes: `Closed: ${reason}`, updated: new Date().toISOString() };
  }

  async list(filters = {}) {
    const output = this._runBr(["list", "--json"]);
    let items;
    try {
      const parsed = JSON.parse(output);
      // br list --json wraps results in { issues: [...] }
      items = Array.isArray(parsed) ? parsed : (parsed.issues || []);
    } catch {
      return [];
    }

    const map = this._readMap();
    const reverseMap = {};
    const metaMap = {};
    for (const [internalId, entry] of Object.entries(map)) {
      const beadsId = typeof entry === "string" ? entry : entry.beadsId;
      reverseMap[beadsId] = internalId;
      metaMap[internalId] = typeof entry === "string" ? {} : entry;
    }

    let result = items.map((item) => {
      const internalId = reverseMap[item.id] || item.id;
      const meta = metaMap[internalId] || {};
      return {
        id: internalId,
        title: item.title,
        status: item.status,
        priority: item.priority ?? 2,
        type: item.issue_type || item.type || "task",
        epicId: meta.epicId || undefined,
        parent_id: meta.parent_id || undefined,
        planRef: meta.planRef || undefined,
        planTask: meta.planTask || undefined,
        spec_ref: meta.spec_ref || undefined,
        branch: meta.branch || undefined,
        pr: meta.pr || undefined,
        owner: meta.owner || undefined,
        claimed_at: meta.claimed_at || undefined,
        dependencies: item.dependencies || [],
        notes: item.description || "",
        next_action: meta.next_action ?? null,
        created: item.created_at || new Date().toISOString(),
        updated: item.updated_at || new Date().toISOString(),
      };
    });

    if (filters.status) result = result.filter((i) => i.status === filters.status);
    if (filters.type) result = result.filter((i) => i.type === filters.type);
    if (filters.epicId) result = result.filter((i) => i.epicId === filters.epicId);
    if (filters.planRef) result = result.filter((i) => i.planRef === filters.planRef);

    return result;
  }

  async get(id) {
    const all = await this.list({});
    return all.find((i) => i.id === id) || null;
  }

  // Epic operations delegated to file adapter (hybrid approach)
  async listEpics(filters = {}) {
    return this._epicAdapter.listEpics(filters);
  }

  /**
   * Create a legacy epic.
   * @deprecated Use create({ type: "epic", ... }) instead.
   *             Set ADEV_DEPRECATION_WARN=1 to see a warning.
   */
  async createEpic(epicData) {
    if (process.env.ADEV_DEPRECATION_WARN === "1") {
      console.warn("createEpic is deprecated; use create() instead. See task-management charter rev 3.");
    }
    return this._epicAdapter.createEpic(epicData);
  }

  /**
   * Update a legacy epic.
   * @deprecated Use update(id, changes) instead.
   *             Set ADEV_DEPRECATION_WARN=1 to see a warning.
   */
  async updateEpic(id, changes) {
    if (process.env.ADEV_DEPRECATION_WARN === "1") {
      console.warn("updateEpic is deprecated; use update() instead. See task-management charter rev 3.");
    }
    return this._epicAdapter.updateEpic(id, changes);
  }

  async addDependency(issueId, dependsOnId) {
    const beadsId1 = this._getBeadsId(issueId);
    const beadsId2 = this._getBeadsId(dependsOnId);
    this._runBr(["dep", "add", beadsId1, beadsId2]);
  }

  /**
   * Return all descendants of parentId via prefix match.
   * Delegates to the file adapter (which stores tiered items in tasks.md).
   *
   * For legacy IDs and invalid IDs: returns empty list.
   * For tiered IDs: returns all items whose ID starts with "<parentId>.".
   *
   * @param {string} parentId
   * @returns {Promise<Array>}
   */
  async walkTree(parentId) {
    // Legacy IDs and invalid IDs → empty list (no round-trip to br needed)
    const parsed = parseId(parentId);
    if (!parsed || parsed.legacy) return [];

    // Tiered items are stored in the file adapter's tasks.md
    // (hybrid approach: epics and tiered items use file adapter)
    return this._epicAdapter.walkTree(parentId);
  }
}

export default BeadsAdapter;
