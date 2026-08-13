/**
 * beads_rust (br) CLI adapter for issue management.
 *
 * Wraps the `br` CLI using execFileSync with array arguments
 * (never string interpolation) to prevent shell injection.
 *
 * SINGLE SOURCE OF TRUTH: on this backend, beads holds the entire board.
 * There is no `.beads-map.json` sidecar and no local epic store. Everything
 * adev needs lives in br columns:
 *
 *   adev id (`issue-N` / `epic-N`) → br `external_ref`
 *   owner (claim holder)           → br `assignee`
 *   status / title / priority/type → br's own columns
 *   epics                          → br issues with `issue_type: epic`
 *   parent/child                   → br `--parent` (a native parent-child dep)
 *   everything else adev tracks    → br `agent_context`, namespaced under "adev"
 *
 * The reason this matters is not tidiness. The sidecar produced a real
 * fail-open in the claim gate: `requireClaimable` read sidecar state while
 * exclusivity actually lived in br's `assignee`, so a human running
 * `br update --claim` directly left adev seeing "unclaimed". Two stores that
 * can disagree will eventually disagree at the worst moment.
 *
 * Uses only Node.js built-ins: child_process, fs, path.
 */

import { execFileSync } from "node:child_process";
import {
  readFileSync,
  renameSync,
  existsSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { join } from "node:path";
import {
  validateIssue,
  validateEpic,
  normalizeOwner,
  requireClaimable,
  requireReleasable,
  DEFAULT_CLAIM_TTL_MS,
} from "./interface.mjs";
import { parseId, mintFlatId } from "./id-utils.mjs";

/**
 * Oldest `br` this adapter speaks to. 0.2.x moved `--db` from "the workspace
 * directory" to "the database file" and added the atomic `update --claim`;
 * both are load-bearing here, and against 0.1.x the failure is a raw
 * "Is a directory (os error 21)" rather than anything actionable.
 */
export const MIN_BR_VERSION = "0.2.0";

/**
 * Top-level key inside br's `agent_context` that adev owns.
 *
 * `agent_context` is br's own feature — "governing-instructions JSON",
 * inherited by descendants when `inherited_context.enabled` is set — so a
 * human or another tool may legitimately write sibling keys there. adev
 * confines itself to this one key and preserves every foreign key it finds
 * on read-modify-write.
 */
export const ADEV_CONTEXT_KEY = "adev";

/** Fields adev stores inside `agent_context.adev`. */
const CONTEXT_FIELDS = [
  "epicId",
  "parent_id",
  "planRef",
  "planTask",
  "spec_ref",
  "next_action",
  "branch",
  "pr",
  "claimed_at",
  "milestone",
];

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

/**
 * Parse br's `agent_context` into an object. TOLERANT BY CONTRACT: the field
 * is user-writable and br stores it as an opaque string, so malformed or
 * non-object content degrades to `{}` rather than throwing. A board must
 * never become unreadable because one issue carries hand-edited JSON.
 *
 * @param {object} item - a raw `br list --json` record
 * @returns {object} the full context object (adev's key plus foreign keys)
 */
function readContext(item) {
  const raw = item?.agent_context;
  if (!raw) return {};
  let obj = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
  return obj;
}

/** The adev-owned slice of an item's `agent_context`. Never throws. */
function readMeta(item) {
  const meta = readContext(item)[ADEV_CONTEXT_KEY];
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return {};
  return meta;
}

/**
 * Read-modify-write the adev slice of an item's context, returning the JSON
 * string to hand to `--agent-context`.
 *
 * Whole-object replacement is br's semantics for this flag, so a partial
 * write would silently drop every other field — including a live claim's
 * `claimed_at`. Foreign top-level keys are preserved verbatim.
 *
 * `undefined` deletes a field; `null` is stored (it is a meaningful value for
 * `next_action`).
 *
 * @param {object} item - the raw br record the change is based on
 * @param {object} changes - adev fields to set/clear
 * @returns {string} serialized context
 */
function mergeContext(item, changes) {
  const ctx = readContext(item);
  const meta = { ...readMeta(item) };
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) delete meta[key];
    else meta[key] = value;
  }
  return JSON.stringify({ ...ctx, [ADEV_CONTEXT_KEY]: meta });
}

/** Build the adev context slice from a plain issue/epic object. */
function contextFrom(source) {
  const meta = {};
  for (const field of CONTEXT_FIELDS) {
    const value = source?.[field];
    if (value !== undefined) meta[field] = value;
  }
  return meta;
}

export class BeadsAdapter {
  /**
   * @param {string} projectRoot
   * @param {object} [opts]
   * @param {boolean} [opts.checkBr=true] - Check if br is on PATH
   * @param {boolean} [opts.autoMigrate=true] - Fold legacy dual state into
   *   beads on first use. Set false for read-only consumers that must never
   *   write — notably the PostToolUse hook path in lib/session-capture.mjs.
   */
  constructor(projectRoot, opts = {}) {
    this.name = "beads";
    this.projectRoot = projectRoot;
    // `.beads/` is the workspace DIRECTORY; `--db` wants the database FILE
    // inside it. Resolved lazily because `br init` may not have run yet.
    this.workspaceDir = join(projectRoot, ".beads");
    this.dbPath = null;

    // Legacy dual-state artifacts, migrated into br on first use. `projectRoot`
    // is already the resolved storage root — registry.mjs calls
    // resolveStorageRoot() before constructing every adapter.
    this.legacyMapPath = join(projectRoot, ".context-index", "tasks", ".beads-map.json");
    this.legacyBoardPath = join(projectRoot, ".context-index", "tasks", "tasks.json");
    this.autoMigrate = opts.autoMigrate !== false;
    this._migrationDone = false;

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
    if (!this.brVersion) {
      // Fail closed. Skipping the floor on an unreadable version would let an
      // unsupported br through silently — the failure this check exists to
      // convert into one actionable line.
      const err = new Error(
        `Could not read a version from \`br --version\` (got: ${String(raw).trim().slice(0, 80)}). ` +
          `adev requires br >= ${MIN_BR_VERSION}.`
      );
      err.code = "BEADS_VERSION_UNSUPPORTED";
      throw err;
    }
    if (compareVersions(this.brVersion, MIN_BR_VERSION) < 0) {
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

  // ---------------------------------------------------------------------------
  // Derived index (NEVER persisted)
  // ---------------------------------------------------------------------------

  /**
   * Read the whole board from br.
   *
   * `-s all` is mandatory, not an optimization: `br list` hides closed issues
   * by default, and a closed-blind scan would (a) re-mint an `issue-N` that a
   * closed issue already owns and (b) make `get()` return null for anything
   * closed, which the json backend happily returns.
   *
   * The result is a DERIVED index rebuilt on every call. It is deliberately
   * never cached across calls and never written to disk — a cache that
   * outlives a call is just the sidecar again, with the same ability to
   * disagree with br about who holds a claim.
   *
   * @returns {object[]} raw br records
   */
  _scan() {
    this._ensureMigrated();
    return this._scanRaw();
  }

  /** Scan without the migration hook — used by the migration itself. */
  _scanRaw() {
    const output = this._runBr(["list", "-s", "all", "--json"]);
    let parsed;
    try {
      parsed = JSON.parse(output);
    } catch {
      return [];
    }
    // `br list --json` wraps results in { issues: [...] }.
    const items = Array.isArray(parsed) ? parsed : parsed?.issues;
    return Array.isArray(items) ? items : [];
  }

  /**
   * Resolve an adev id to its br record via `external_ref`.
   *
   * br cannot address an issue by external_ref (`br update issue-42` →
   * ISSUE_NOT_FOUND) and `br list` has no external-ref filter, so the scan is
   * the only route.
   *
   * @param {string} id - adev id (`issue-N`, `epic-N`, or a raw br id)
   * @param {object[]} [items] - a scan to reuse, avoiding a second `br list`
   * @returns {object} the raw br record
   */
  _resolve(id, items) {
    const all = items || this._scan();
    const found =
      all.find((i) => i.external_ref === id) ||
      // A raw br id still addresses its own issue, so board items created
      // directly through `br` (no external_ref) remain operable.
      all.find((i) => i.id === id && !i.external_ref);
    if (!found) {
      const err = new Error(`No beads issue for id: ${id}`);
      err.code = "NOT_FOUND";
      throw err;
    }
    return found;
  }

  /**
   * Mint the next `issue-N` / `epic-N` from the highest existing
   * `external_ref` on the board.
   *
   * NOT ATOMIC ACROSS CONCURRENT CREATORS. br exposes no sequence primitive,
   * so two creators scanning at the same moment compute the same number.
   * The saving grace is that this fails LOUDLY rather than silently: br
   * enforces uniqueness on `external_ref` and rejects the second create with
   * CONFIG_ERROR ("External reference 'issue-7' already exists on issue X")
   * at exit 7, which `_runBr` raises as BEADS_COMMAND_FAILED. The loser gets
   * an error, not a duplicate id.
   *
   * @param {string} prefix - "issue" or "epic"
   * @param {object[]} items - a scan to reuse
   */
  _nextId(prefix, items) {
    // Same merge-safe scheme as the json backend (issue-613). Here it composes
    // with br's uniqueness constraint on `external_ref`: randomness makes a
    // collision vanishingly unlikely, and br rejecting the duplicate makes the
    // residual case a failed create rather than a silent double-mint.
    return mintFlatId(
      prefix,
      items.map((item) => ({ id: item.external_ref || "" })),
    );
  }

  /** Map a raw br record onto the adev issue shape. */
  _toIssue(item) {
    const meta = readMeta(item);
    return {
      id: item.external_ref || item.id,
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
      // br's `assignee` is the SOLE home for the claim holder. It is the field
      // `br update --claim` actually guards, and `br` is a user-facing CLI, so
      // a human claiming an issue directly is ordinary usage. Keeping a second
      // copy anywhere is what let requireClaimable see "unclaimed" and open the
      // gate on exactly the case it exists to close.
      owner: item.assignee || undefined,
      claimed_at: meta.claimed_at || undefined,
      // br's list projection carries `dependency_count`, not the edges; the
      // edges need a per-issue `br dep list`. See the non-parity table.
      dependencies: [],
      notes: item.description || "",
      next_action: meta.next_action ?? null,
      created: item.created_at || new Date().toISOString(),
      updated: item.updated_at || new Date().toISOString(),
    };
  }

  /** Map a raw br record onto the adev epic shape. */
  _toEpic(item) {
    const meta = readMeta(item);
    return {
      id: item.external_ref || item.id,
      title: item.title,
      status: item.status,
      milestone: meta.milestone || undefined,
      notes: item.description || "",
      created: item.created_at || new Date().toISOString(),
      updated: item.updated_at || new Date().toISOString(),
    };
  }

  /**
   * True when a record belongs to the `epic-*` collection (the separate epics
   * array the json backend also keeps), whichever id scheme minted it:
   * sequential `epic-12` or merge-safe `epic-7k3f9a` (issue-613). A
   * digits-only test would silently drop every newly-minted epic out of
   * `listEpics()` while still creating it.
   */
  _isLegacyEpic(item) {
    return /^epic-[a-z0-9]+$/i.test(item.external_ref || "");
  }

  // ---------------------------------------------------------------------------
  // Legacy dual-state migration
  // ---------------------------------------------------------------------------

  /**
   * Fold pre-existing dual state into beads, once per adapter instance.
   *
   * Two legacy stores existed and BOTH would otherwise vanish from the board:
   *
   *   `.beads-map.json` — held the adev id ↔ br id map plus every field br had
   *     no column for. Its entries are replayed onto the br issues they name
   *     as `external_ref` + `agent_context`.
   *   `tasks.json` epics — epics used to be delegated to a local JsonAdapter,
   *     so on a beads project this file is the ONLY copy of them. They are
   *     re-created as native `br` epics.
   *
   * Automatic rather than detect-and-refuse, because the alternative leaves a
   * user staring at an empty board until they run a command nobody told them
   * about. It is safe to automate here because every step is idempotent and
   * keyed on `external_ref`: an issue that already carries its adev id is
   * skipped, so a re-run is a no-op, and a half-finished run resumes cleanly.
   *
   * Failures are LOUD. A sidecar that cannot be migrated throws rather than
   * being ignored, because "ignored" is indistinguishable from "board is
   * empty" — the exact outcome this must prevent.
   */
  _ensureMigrated() {
    if (this._migrationDone || !this.autoMigrate) return;
    // Set first: the migration calls _scanRaw/_runBr directly, and this also
    // makes a failed migration surface once per instance rather than looping.
    this._migrationDone = true;

    const hasMap = existsSync(this.legacyMapPath);
    const legacyEpics = this._readLegacyEpics();
    if (!hasMap && legacyEpics.length === 0) return;

    const items = this._scanRaw();
    const byBrId = new Map(items.map((i) => [i.id, i]));
    const externalRefs = new Set(items.map((i) => i.external_ref).filter(Boolean));
    const problems = [];

    if (hasMap) {
      let map = {};
      try {
        map = JSON.parse(readFileSync(this.legacyMapPath, "utf8")) || {};
      } catch (err) {
        const error = new Error(
          `Legacy ${this.legacyMapPath} is unreadable (${err.message}), so the issues it maps ` +
            `cannot be migrated into beads. Fix or remove the file — leaving it in place would ` +
            `hide those issues from the board.`
        );
        error.code = "BEADS_LEGACY_MIGRATION_FAILED";
        throw error;
      }

      for (const [adevId, entry] of Object.entries(map)) {
        if (externalRefs.has(adevId)) continue; // already migrated
        const meta = typeof entry === "string" ? { beadsId: entry } : entry || {};
        const brId = meta.beadsId;
        const item = brId ? byBrId.get(brId) : undefined;
        if (!item) {
          problems.push(`${adevId} → ${brId || "(no beads id)"} (no such issue in beads)`);
          continue;
        }
        const args = ["update", item.id, "--external-ref", adevId];
        // The sidecar's `owner` was only ever a copy of br's assignee. Replay
        // it when br has none, so migrating never silently releases a claim.
        if (!item.assignee && meta.owner) args.push("--assignee", String(meta.owner));
        args.push("--agent-context", mergeContext(item, contextFrom(meta)), "--json");
        this._runBr(args);
        externalRefs.add(adevId);
      }
    }

    for (const epic of legacyEpics) {
      if (!epic?.id || externalRefs.has(epic.id)) continue;
      const args = [
        "create",
        String(epic.title || epic.id),
        "--type",
        "epic",
        "--priority",
        String(epic.priority ?? 2),
        "--external-ref",
        epic.id,
        "--agent-context",
        JSON.stringify({ [ADEV_CONTEXT_KEY]: contextFrom(epic) }),
        "--json",
      ];
      if (epic.notes) args.splice(args.length - 1, 0, "--description", String(epic.notes));
      this._runBr(args);
      externalRefs.add(epic.id);
      if (epic.status && epic.status !== "open") {
        // `br create` has no status flag; closed states must go through
        // `br close` (br refuses terminal statuses on `update`).
        const created = this._scanRaw().find((i) => i.external_ref === epic.id);
        if (created && epic.status === "closed") {
          this._runBr(["close", created.id, "--reason", "migrated from tasks.json"]);
        } else if (created) {
          this._runBr(["update", created.id, "--status", String(epic.status), "--json"]);
        }
      }
    }

    if (problems.length > 0) {
      const error = new Error(
        `Legacy ${this.legacyMapPath} references beads issues that do not exist: ` +
          `${problems.join("; ")}. Those issues cannot be recovered automatically. ` +
          `Re-create them with \`adev issues create\`, or delete the file to accept the loss — ` +
          `it is left in place so nothing is lost silently.`
      );
      error.code = "BEADS_LEGACY_MIGRATION_FAILED";
      throw error;
    }

    if (hasMap) {
      // Renamed, not deleted: the migration is lossy-in-principle (a hand-
      // edited sidecar could hold something unmapped) and a rename is
      // recoverable while an unlink is not.
      this._retire(this.legacyMapPath);
    }
    if (legacyEpics.length > 0 && this._legacyBoardIsEpicsOnly) {
      // Retire tasks.json ONLY when it was purely the epic-delegation
      // artifact. If it also holds issues it is somebody's real json board and
      // must be left exactly where it is.
      this._retire(this.legacyBoardPath);
    }
  }

  /**
   * Epics stranded in a legacy `tasks.json`. Sets `_legacyBoardIsEpicsOnly` as
   * a side effect so the caller knows whether the file is safe to retire.
   */
  _readLegacyEpics() {
    this._legacyBoardIsEpicsOnly = false;
    if (!existsSync(this.legacyBoardPath)) return [];
    let board;
    try {
      board = JSON.parse(readFileSync(this.legacyBoardPath, "utf8"));
    } catch {
      return [];
    }
    const epics = Array.isArray(board?.epics) ? board.epics : [];
    const issues = Array.isArray(board?.issues) ? board.issues : [];
    this._legacyBoardIsEpicsOnly = epics.length > 0 && issues.length === 0;
    return epics;
  }

  /** Move a retired legacy file aside with a timestamp suffix. */
  _retire(path) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    try {
      renameSync(path, `${path}.migrated-${stamp}`);
    } catch {
      // Best effort. A rename failure must not fail the operation the caller
      // actually asked for; the migration itself is idempotent on a re-run.
    }
  }

  // ---------------------------------------------------------------------------
  // IssueManagerInterface
  // ---------------------------------------------------------------------------

  async init() {
    // beads owns the store; `br init` is the operator's step. All this does is
    // fold any legacy dual state in before the first read.
    this._ensureMigrated();
  }

  async create(issueData) {
    const issue = validateIssue(issueData);
    const items = this._scan();

    const args = [
      "create",
      issue.title,
      "--type",
      issue.type,
      "--priority",
      String(issue.priority),
    ];

    // Honour an explicitly supplied id; mint only when none is given
    // (issue-628). Minting is right for NEW work — issue-613 made ids
    // merge-safe so two branches cannot collide — but wrong for a MIGRATION,
    // whose entire job is to carry identity across. Overwriting
    // unconditionally gave every migrated item a new identity, breaking both
    // dependency replay (edges resolve by source id) and every human-readable
    // cross-reference in notes, commits, PRs and specs.
    //
    // br enforces uniqueness on `external_ref`, so a genuinely colliding
    // supplied id fails loudly at create rather than silently double-minting.
    issue.id = issue.id || this._nextId("issue", items);
    args.push("--external-ref", issue.id);
    if (issue.notes) args.push("--description", String(issue.notes));
    if (issue.parent_id) {
      // Native parent-child link, in addition to the adev-side `parent_id`
      // kept in context (br's hierarchy uses its OWN id namespace — the child
      // becomes e.g. `tst-aha.1` — which is not adev's tiered id scheme).
      args.push("--parent", this._resolve(issue.parent_id, items).id);
    }
    args.push("--agent-context", JSON.stringify({ [ADEV_CONTEXT_KEY]: contextFrom(issue) }));
    args.push("--json");

    this._runBr(args);
    return issue;
  }

  async update(id, changes) {
    const items = this._scan();
    const item = this._resolve(id, items);
    const args = ["update", item.id];

    if (changes.status) args.push("--status", changes.status);
    if (changes.title) args.push("--title", String(changes.title));
    if (changes.priority !== undefined) args.push("--priority", String(changes.priority));
    if (changes.type) args.push("--type", String(changes.type));
    if (changes.notes !== undefined) args.push("--description", String(changes.notes));

    // Everything br has no column for goes to `agent_context` — in the SAME
    // call as the column updates, so a crash cannot leave the two disagreeing.
    const contextChanges = {};
    for (const field of CONTEXT_FIELDS) {
      if (field in changes) {
        contextChanges[field] =
          field === "next_action" ? (changes[field] ?? null) : changes[field];
      }
    }
    // `owner` is br's `assignee` and nothing else. Writing it through update()
    // bypasses the claim gate deliberately only for release/clear paths.
    if ("owner" in changes) args.push("--assignee", changes.owner ? String(changes.owner) : "");
    if (Object.keys(contextChanges).length > 0) {
      args.push("--agent-context", mergeContext(item, contextChanges));
    }
    args.push("--json");

    this._runBr(args);
    return { ...this._toIssue(item), ...changes, updated: new Date().toISOString() };
  }

  /**
   * Atomic check-and-set claim, backed by `br update --claim`.
   *
   * br 0.2.x provides the exclusivity primitive natively: `--claim` sets
   * assignee=actor + status=in_progress and REFUSES (exit 4,
   * `claim: issue X already assigned to Y`) when the issue is already held.
   * That refusal is evaluated inside br's own transaction, so two racing
   * agents cannot both win.
   *
   * CLAIM AND LEASE STAMP ARE NOW ONE CALL. `--claim` and `--agent-context`
   * travel together, and br rolls the context write back when the claim is
   * refused (verified: a refused claimant's context does not land). So the
   * holder and the lease stamp can no longer disagree — previously the stamp
   * was a separate sidecar write with a crash window between them.
   *
   * KNOWN NON-PARITY — stale takeover is still not atomic, and cannot be made
   * so with br's current surface: `--claim` refuses ANY held issue, and
   * `--assignee` has no compare-and-set precondition. Expiring a lease
   * therefore takes two calls (clear the assignee, then claim). The
   * interleaving `A.clear → A.claim → B.clear → B.claim` silently displaces A.
   * The two-call form is kept over a blind single `--assignee` write precisely
   * because `--claim` still refuses the commoner `A.clear → B.clear → A.claim`
   * ordering. The window is bounded by TTL expiry rather than by contention,
   * so it is far narrower than the no-gate-at-all case this replaces — but it
   * is real, and `tasks.backend: json` is the backend with an atomic takeover.
   *
   * @param {string} id
   * @param {string} owner
   * @param {{ branch?: string, pr?: string, ttlMs?: number }} [opts]
   * @returns {Promise<object>}
   */
  async claim(id, owner, opts = {}) {
    const claimant = normalizeOwner(owner);
    // One scan serves both the id resolution and the precondition read.
    const item = this._resolve(id, this._scan());
    const current = this._toIssue(item);

    // Shared precondition — identical refusal semantics and error codes as the
    // json backend, so callers do not branch on backend.
    requireClaimable(current, claimant, { ttlMs: opts.ttlMs ?? DEFAULT_CLAIM_TTL_MS });

    const held = current.owner;
    const idempotent = held === claimant;
    const takingOver = Boolean(held) && !idempotent;

    const changes = {
      // An idempotent re-claim inside a live lease keeps its original stamp so
      // a resumed session is not penalised; a takeover starts a fresh lease.
      claimed_at: idempotent && current.claimed_at ? current.claimed_at : new Date().toISOString(),
    };
    if (opts.branch !== undefined) changes.branch = opts.branch;
    if (opts.pr !== undefined) changes.pr = opts.pr;
    // Read-modify-write: a bare {claimed_at} write would erase epicId,
    // planRef, spec_ref, branch and pr, since br replaces agent_context wholesale.
    const context = mergeContext(item, changes);

    if (takingOver) {
      // requireClaimable already established the lease is expired. br will not
      // reassign a held issue, so clear it first — the non-atomic step called
      // out above.
      this._runBr(["update", item.id, "--assignee", "", "--json"]);
    }

    if (idempotent) {
      // Already ours: no claim to take, just refresh branch/pr and keep the
      // status where a claim would put it.
      this._runBr(["update", item.id, "--status", "in_progress", "--agent-context", context, "--json"]);
    } else {
      try {
        this._runBr([
          "--actor",
          claimant,
          "update",
          item.id,
          "--claim",
          "--agent-context",
          context,
          "--json",
        ]);
      } catch (err) {
        // Backstop for the race requireClaimable cannot see: br's refusal is
        // evaluated inside its transaction, so a claimant that arrived between
        // our read and this write is refused HERE, not above. Re-raise under
        // the shared code so it reaches CLI exit 2 (halt) instead of exit 1
        // (warn and continue) — the preflight gate must not open on a refusal.
        if (/already assigned to/i.test(err.message)) {
          const conflict = new Error(
            `Issue ${id} is already claimed (beads refused the claim for "${claimant}"): ` +
              `${err.message.replace(/\s+/g, " ").slice(0, 200)}`
          );
          conflict.code = "ISSUE_ALREADY_CLAIMED";
          throw conflict;
        }
        throw err;
      }
    }

    const result = { ...current, ...changes, owner: claimant, status: "in_progress" };
    if (takingOver) {
      result.takeover = {
        previous_owner: held,
        previous_claimed_at: current.claimed_at ?? null,
      };
    }
    return result;
  }

  /**
   * Release a claim: clears br's `assignee` and the `claimed_at` stamp in ONE
   * call, so the two cannot disagree. `branch`/`pr` are deliberately left in
   * place — they record where the work went, not who is holding it. TTL-blind,
   * matching the json backend.
   *
   * @param {string} id
   * @param {string} owner
   * @param {{ force?: boolean }} [opts]
   */
  async release(id, owner, opts = {}) {
    const claimant = normalizeOwner(owner);
    const item = this._resolve(id, this._scan());
    const current = this._toIssue(item);

    requireReleasable(current, claimant, { force: opts.force === true });

    if (!current.owner) return current; // idempotent no-op

    this._runBr([
      "update",
      item.id,
      "--assignee",
      "",
      "--agent-context",
      mergeContext(item, { claimed_at: undefined }),
      "--json",
    ]);

    return { ...current, owner: undefined, claimed_at: undefined };
  }

  async close(id, reason) {
    const item = this._resolve(id, this._scan());
    this._runBr(["close", item.id, "--reason", reason]);
    return { id, status: "closed", notes: `Closed: ${reason}`, updated: new Date().toISOString() };
  }

  async list(filters = {}) {
    let result = this._scan()
      // Legacy `epic-N` items are the `listEpics()` collection, mirroring the
      // json backend's separate `epics` array.
      .filter((item) => !this._isLegacyEpic(item))
      .map((item) => this._toIssue(item));

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

  /**
   * Legacy `epic-N` epics — now native br issues of type `epic`, carrying
   * `external_ref: epic-N`. No local store is involved.
   */
  async listEpics(filters = {}) {
    let result = this._scan()
      .filter((item) => this._isLegacyEpic(item))
      .map((item) => this._toEpic(item));

    if (filters.status) result = result.filter((e) => e.status === filters.status);
    if (filters.milestone) result = result.filter((e) => e.milestone === filters.milestone);

    return result;
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
    const epic = validateEpic(epicData);
    const items = this._scan();
    // Honour a supplied id; mint only when absent (issue-628) — see create().
    epic.id = epic.id || this._nextId("epic", items);

    const args = ["create", epic.title, "--type", "epic", "--priority", String(epic.priority ?? 2)];
    if (epic.notes) args.push("--description", String(epic.notes));
    args.push("--external-ref", epic.id);
    args.push("--agent-context", JSON.stringify({ [ADEV_CONTEXT_KEY]: contextFrom(epic) }));
    args.push("--json");

    this._runBr(args);
    return epic;
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
    const items = this._scan();
    const item = items.find((i) => i.external_ref === id && this._isLegacyEpic(i));
    if (!item) {
      const err = new Error(`Epic not found: ${id}`);
      err.code = "NOT_FOUND";
      throw err;
    }

    const args = ["update", item.id];
    if (changes.status) args.push("--status", changes.status);
    if (changes.title) args.push("--title", String(changes.title));
    if (changes.notes !== undefined) args.push("--description", String(changes.notes));
    if ("milestone" in changes) args.push("--agent-context", mergeContext(item, { milestone: changes.milestone }));
    args.push("--json");

    this._runBr(args);
    return { ...this._toEpic(item), ...changes, id, updated: new Date().toISOString() };
  }

  async addDependency(issueId, dependsOnId) {
    const items = this._scan();
    const a = this._resolve(issueId, items);
    const b = this._resolve(dependsOnId, items);
    this._runBr(["dep", "add", a.id, b.id]);
  }

  /**
   * Return all descendants of parentId in ADEV's tiered id namespace.
   *
   * Deliberately prefix-matches adev ids rather than following br's native
   * parent-child edges: br's hierarchy has its own id shape (`tst-aha.1`) and
   * the two namespaces are not interchangeable. This keeps the json backend's
   * exact semantics.
   *
   * For legacy IDs and invalid IDs: returns empty list, WITHOUT calling br —
   * so the check stays cheap and works on an adapter built against a path
   * where no board exists.
   *
   * @param {string} parentId
   * @returns {Promise<Array>}
   */
  async walkTree(parentId) {
    const parsed = parseId(parentId);
    if (!parsed || parsed.legacy) return [];

    const prefix = `${parentId}.`;
    return (await this.list({}))
      .filter((i) => i.id.startsWith(prefix))
      .sort((a, b) => a.id.localeCompare(b.id));
  }
}

export default BeadsAdapter;
