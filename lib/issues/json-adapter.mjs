/**
 * JSON-backed issue board adapter (`tasks.json`).
 *
 * Implements `IssueManagerInterface` (the same contract as `FileAdapter` and
 * `BeadsAdapter`), but stores the board in a single JSON document:
 *
 *   {
 *     "version": 2,
 *     "seq":     0,
 *     "epics":   [...],
 *     "issues":  [...]
 *   }
 *
 * Writes are atomic via temp-file-then-rename (mirroring
 * `lib/build-state.mjs::atomicWriteJson`). Reads tolerate the absence of
 * `tasks.json` and may fall back to `tasks.md` via the shared
 * `lib/issues/markdown-parser.mjs` helper when `tasks.legacy_read` is enabled.
 *
 * Concurrent-write protection (CAS over atomic rename): mutating operations
 * (`create`/`update`/`close`/`addDependency`/`createEpic`/`updateEpic`/
 * `claim`/`release`) are wrapped in a bounded CAS retry loop. Each captures the on-disk `seq` via
 * `_readWithSeq`, stages the mutation, and commits via `_write(data, seq)`.
 * `_write` acquires an exclusive lock (`tasks.json.lock` via `O_EXCL`),
 * re-reads the disk `seq` under the lock, and refuses to commit when the
 * disk value has advanced — throwing `STALE_BOARD_WRITE_RETRY` so the
 * wrapper re-reads and retries. After `MAX_CAS_RETRIES` (default 3,
 * override via `manifest.tasks.cas_max_retries`) attempts, the wrapper
 * throws `STALE_BOARD_WRITE`. Contractual guarantee: every mutation has an
 * observable outcome (commit or `STALE_BOARD_WRITE`); no mutation is
 * silently lost. Legacy `tasks.json` files without `seq` are upgraded
 * transparently on first mutation (no `adev migrate` invocation needed).
 *
 * Orphan-lock recovery: if a writer is killed (SIGKILL, OOM, container
 * crash) between lock acquisition and release, the `tasks.json.lock`
 * persists and would otherwise wedge the board read-only. `_acquireLock`
 * transparently recovers — on EEXIST, it stats the lock; if mtime is
 * older than `cas_lock_stale_seconds` (default 30, configurable via
 * `manifest.tasks.cas_lock_stale_seconds`; floor 5), it unlinks the
 * orphan and retries `openSync(wx)` exactly once. A single stderr
 * warning is emitted per process lifetime per adapter instance on
 * successful recovery. Unlink failure surfaces
 * `BOARD_ORPHAN_LOCK_UNLINK_FAILED`; invalid manifest values surface
 * `BOARD_INVALID_LOCK_STALE_SECONDS` at construction time. Recovery is
 * sub-step of one acquire attempt and does NOT consume the outer
 * `MAX_CAS_RETRIES` budget.
 *
 * Read-only methods (`list`/`get`/`listEpics`/`walkTree`) call the
 * unchanged `_read()` and pay no CAS overhead.
 *
 * Board-granularity invariant: `create`/`update` reject any payload that
 * would land an issue with `planTask` set. Plan-task state belongs in the
 * lifecycle event log (`lib/lifecycle-state.mjs::reportPlanTask`), not on
 * the board. Legacy issues with both fields populated are tolerated on
 * read (CON-3) and may be updated without touching those fields.
 *
 * The invariant is about GRANULARITY, not about "refs don't belong on the
 * board": `planTask` is sub-issue state (one issue has many plan tasks, each
 * churning per execution step), which is why it belongs in the append-only
 * event log. `spec_ref`/`branch`/`pr`/`owner` are 1:1 with the issue and are
 * board state — see the note above `_validateBoardGranularity`.
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
  openSync,
  closeSync,
  statSync,
} from "node:fs";
import { join, resolve, sep } from "node:path";
import { randomBytes } from "node:crypto";
import {
  validateIssue,
  validateStatusTransition,
  normalizeNotesAliases,
  validateEpic,
  detectCycle,
  checkCloseGuard,
  normalizeOwner,
  requireClaimable,
  requireReleasable,
  isClaimStale,
  normalizeClaimTtlMinutes,
} from "./interface.mjs";
import { parseId, getTierConfig, nextChildId, mintFlatId } from "./id-utils.mjs";
import { parseTasksMd } from "./markdown-parser.mjs";
import { assertProjectRoot } from "../manifest.mjs";

const DEFAULT_ROOT_PREFIX = "e";
const CANONICAL_VERSION = 2;
const STORAGE_REL_DIR = join(".context-index", "tasks");
const STORAGE_REL_FILE = join(STORAGE_REL_DIR, "tasks.json");
const LEGACY_REL_FILE = join(STORAGE_REL_DIR, "tasks.md");
const MANIFEST_REL = join(".context-index", "manifest.yaml");

/**
 * Default upper bound on CAS retry attempts per mutating operation. After
 * this many `STALE_BOARD_WRITE_RETRY` cycles, the operation throws
 * `STALE_BOARD_WRITE` rather than continuing to spin. Override per project
 * via `manifest.tasks.cas_max_retries`.
 */
export const MAX_CAS_RETRIES = 3;

/**
 * Default age threshold (in seconds) for treating an existing
 * `tasks.json.lock` as orphaned. Locks older than this on EEXIST are
 * cleaned up automatically by `_acquireLock`. Override per project via
 * `manifest.tasks.cas_lock_stale_seconds`. Floor: 5 seconds (anything
 * lower risks false-positive orphan detection under load).
 */
export const DEFAULT_CAS_LOCK_STALE_SECONDS = 30;
const CAS_LOCK_STALE_SECONDS_FLOOR = 5;

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
   * @param {number|string} [opts.claimTtlMinutes] Claim lease window in minutes;
   *   overrides `manifest.tasks.claim_ttl_minutes`. 0 disables claim expiry.
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

    // One-time-per-process orphan-recovery warning flag (Behavior 3 of
    // orphan-lock-cleanup.spec.md). First successful recovery emits one
    // stderr line; subsequent recoveries on the SAME adapter instance
    // emit nothing.
    this._orphanRecoveryWarningEmitted = false;

    // CAS retry budget. Resolved from `manifest.tasks.cas_max_retries` when
    // present and valid; falls back to `MAX_CAS_RETRIES`. Manifest read is
    // best-effort — a missing or malformed manifest yields the default and
    // does NOT throw (the manifest's existence was already enforced by
    // `assertProjectRoot` above).
    this.casMaxRetries = MAX_CAS_RETRIES;
    try {
      const raw = readFileSync(join(this.projectRoot, MANIFEST_REL), "utf8");
      const m = /^\s*cas_max_retries:\s*(\d+)\s*$/m.exec(raw);
      if (m) {
        const n = parseInt(m[1], 10);
        if (Number.isInteger(n) && n > 0) this.casMaxRetries = n;
      }
    } catch {
      // Manifest read failed — keep default.
    }

    // CAS lock-stale threshold (orphan-lock recovery). Resolved from
    // `manifest.tasks.cas_lock_stale_seconds` when present; absence yields
    // the default. Invalid values (non-integer, < floor, NaN, string, null,
    // boolean, array, float) reject with BOARD_INVALID_LOCK_STALE_SECONDS
    // per orphan-lock-cleanup.spec.md Behavior 7 + review note SEC-2
    // (explicit rejection contract). Error message does NOT echo the
    // offending value (mirrors INVALID_BOARD_SEQ sanitization precedent).
    this.casLockStaleSeconds = DEFAULT_CAS_LOCK_STALE_SECONDS;
    try {
      const raw = readFileSync(join(this.projectRoot, MANIFEST_REL), "utf8");
      const m = /^\s*cas_lock_stale_seconds:\s*(.+?)\s*$/m.exec(raw);
      if (m) {
        const rawValue = m[1].trim();
        // Strict integer-only match. Rejects NaN, floats, quoted strings,
        // null, booleans, arrays, objects, empty literal.
        const isIntegerLiteral = /^-?\d+$/.test(rawValue);
        if (!isIntegerLiteral) {
          const err = new Error(
            `manifest.tasks.cas_lock_stale_seconds must be an integer >= ${CAS_LOCK_STALE_SECONDS_FLOOR} ` +
            `(received non-integer literal; floor=${CAS_LOCK_STALE_SECONDS_FLOOR})`,
          );
          err.code = "BOARD_INVALID_LOCK_STALE_SECONDS";
          throw err;
        }
        const n = parseInt(rawValue, 10);
        if (!Number.isInteger(n) || n < CAS_LOCK_STALE_SECONDS_FLOOR) {
          const err = new Error(
            `manifest.tasks.cas_lock_stale_seconds must be an integer >= ${CAS_LOCK_STALE_SECONDS_FLOOR} ` +
            `(floor=${CAS_LOCK_STALE_SECONDS_FLOOR})`,
          );
          err.code = "BOARD_INVALID_LOCK_STALE_SECONDS";
          throw err;
        }
        this.casLockStaleSeconds = n;
      }
    } catch (err) {
      // Re-throw our own validation error; swallow filesystem read errors so
      // missing/unreadable manifest falls back to default (parity with the
      // cas_max_retries pattern above).
      if (err && err.code === "BOARD_INVALID_LOCK_STALE_SECONDS") throw err;
      // Manifest read failed for another reason — keep default.
    }

    // Claim lease TTL (issue-610). Resolution order:
    //   1. `opts.claimTtlMinutes`  — explicit, for programmatic callers/tests
    //   2. `manifest.tasks.claim_ttl_minutes` — read from the manifest FILE,
    //      exactly as the two CAS knobs above are, so every construction path
    //      (including `new JsonAdapter(dir)` with no manifest object in hand)
    //      resolves the SAME value. One resolution path is the point: a report
    //      that calls a claim "stale" while `claim()` still refuses it would be
    //      worse than no report at all.
    //   3. DEFAULT_CLAIM_TTL_MINUTES
    // Invalid values reject at construction (BOARD_INVALID_CLAIM_TTL_MINUTES),
    // matching the cas_lock_stale_seconds rejection contract.
    if (opts.claimTtlMinutes !== undefined && opts.claimTtlMinutes !== null) {
      this.claimTtlMinutes = normalizeClaimTtlMinutes(opts.claimTtlMinutes);
    } else {
      this.claimTtlMinutes = normalizeClaimTtlMinutes(undefined);
      let rawTtl = null;
      try {
        const raw = readFileSync(join(this.projectRoot, MANIFEST_REL), "utf8");
        const m = /^\s*claim_ttl_minutes:\s*(.+?)\s*$/m.exec(raw);
        if (m) rawTtl = m[1].trim();
      } catch {
        // Manifest read failed — keep default (parity with the knobs above).
      }
      if (rawTtl !== null) this.claimTtlMinutes = normalizeClaimTtlMinutes(rawTtl);
    }
    // 0 minutes = expiry disabled; isClaimStale treats a non-positive window
    // as "claims never go stale".
    this.claimTtlMs = this.claimTtlMinutes * 60_000;
  }

  // ---------------------------------------------------------------------------
  // CAS retry helper
  // ---------------------------------------------------------------------------

  /**
   * Wrap a read-modify-write cycle in a bounded CAS retry loop. The
   * `operation` callback receives `(board, seq)` from a fresh snapshot and
   * MUST end by calling `this._write(updatedBoard, seq)`. On
   * `STALE_BOARD_WRITE_RETRY`, the helper re-reads a fresh snapshot and
   * invokes `operation` again — IDs, timestamps, and any other derived
   * fields are re-computed against the new snapshot. After
   * `this.casMaxRetries` failed attempts, throws `STALE_BOARD_WRITE`.
   *
   * @param {string} opName  one of the mutator names — used only in the
   *                         final error message; never logged or persisted
   * @param {(board: object, seq: number) => any} operation
   * @returns whatever `operation` returns
   */
  _withCas(opName, operation) {
    let lastCurrentSeq = null;
    let lastCapturedSeq = null;
    for (let attempt = 0; attempt < this.casMaxRetries; attempt++) {
      const { board, seq } = this._readWithSeq();
      try {
        return operation(board, seq);
      } catch (err) {
        if (err && err.code === "STALE_BOARD_WRITE_RETRY") {
          lastCapturedSeq = seq;
          // Best-effort: parse current seq from the conflict message for
          // diagnostic surfacing on final failure. Falls back to "?" if the
          // message shape changes.
          const m = /current seq=(\d+)/.exec(err.message || "");
          if (m) lastCurrentSeq = parseInt(m[1], 10);
          continue;
        }
        throw err;
      }
    }
    const final = new Error(
      `tasks.json: stale write on ${opName} after ${this.casMaxRetries} retries ` +
        `(captured seq=${lastCapturedSeq}, current seq=${lastCurrentSeq ?? "?"})`
    );
    final.code = "STALE_BOARD_WRITE";
    throw final;
  }

  // ---------------------------------------------------------------------------
  // Internal primitives
  // ---------------------------------------------------------------------------

  /**
   * Validate an arbitrary payload against the board-granularity invariant.
   * Throws `BOARD_GRANULARITY_VIOLATION` if the payload would land an issue
   * with a non-null `planTask`. `planRef` alone is permitted.
   *
   * Scope note (read this before extending the guard to another field): the
   * rejected quantity is SUB-ISSUE state. `planTask` is 1:many with the issue
   * and advances once per execution step, so the board would become an
   * execution log. Fields that are 1:1 with the issue — `spec_ref` (the
   * standing precedent), `branch`, `pr`, `owner`, `claimed_at` — are board
   * state and are NOT covered by this guard. They also have no home in
   * `lib/lifecycle-state.mjs`, which is spec-scoped (`report*(projectRoot,
   * specPath, …)`), not issue-scoped, and defines no branch/PR/owner event
   * kind. The board is the only worktree-spanning store we have
   * (`lib/issues/resolve-root.mjs`).
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

    // CAS sequence field — present only on CAS-aware writes. Legacy v2
    // documents without `seq` are accepted (treated as seq:0 by _readWithSeq).
    // When present, must be a non-negative safe integer. Error message MUST
    // NOT echo the offending value (route attacker-controlled input through
    // sanitization analogous to MALFORMED_BOARD).
    if (Object.prototype.hasOwnProperty.call(parsed, "seq")) {
      const seq = parsed.seq;
      const seqValid =
        typeof seq === "number" &&
        Number.isInteger(seq) &&
        seq >= 0 &&
        seq <= Number.MAX_SAFE_INTEGER;
      if (!seqValid) {
        const err = new Error(
          "tasks.json: `seq` must be a non-negative integer <= Number.MAX_SAFE_INTEGER"
        );
        err.code = "INVALID_BOARD_SEQ";
        throw err;
      }
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
   * Read the board AND its current CAS sequence. Used only by mutators
   * (`create`/`update`/`close`/`addDependency`/`createEpic`/`updateEpic`/
   * `claim`/`release`) via the retry wrapper. Read-only methods (`list`/`get`/`listEpics`/
   * `walkTree`) keep calling `_read()` and pay no CAS overhead.
   *
   * Legacy documents that pre-date the CAS field yield `seq: 0`; the next
   * successful write stamps `seq: 1` — no `adev migrate` invocation needed.
   *
   * @returns {{ board: object, seq: number }}
   */
  _readWithSeq() {
    const board = this._read();
    const seq = typeof board.seq === "number" ? board.seq : 0;
    return { board, seq };
  }

  /**
   * Acquire the exclusive write lock on `lockPath` via `openSync(O_EXCL)`.
   * Returns the file descriptor on success.
   *
   * Happy path: byte-for-byte identical to `openSync(lockPath, "wx")` — no
   * stat, no extra syscalls. Only diverges on EEXIST.
   *
   * EEXIST path (orphan-lock-cleanup.spec.md):
   *   1. `statSync(lockPath)` to read mtime.
   *   2. If `(now - mtime) > casLockStaleSeconds` → unlink + retry openSync
   *      once. On retry success emit a one-time-per-process stderr warning.
   *      On retry EEXIST → STALE_BOARD_WRITE_RETRY (do NOT loop).
   *   3. Else → STALE_BOARD_WRITE_RETRY (today's behavior; live writer).
   *   4. If `statSync` itself throws ENOENT (lock released between failed
   *      open and stat — Behavior 6) → retry openSync once. If retry hits
   *      EEXIST, fall through to STALE_BOARD_WRITE_RETRY (review note SA-1:
   *      this is NOT orphan recovery, so it does not re-enter recovery).
   *   5. `unlinkSync` failure → BOARD_ORPHAN_LOCK_UNLINK_FAILED (with the
   *      original error on `.cause`).
   *
   * Invariant #2 (one recovery per acquire attempt): exactly one orphan
   * recovery may fire per call. The post-recovery retry never re-enters
   * orphan-recovery — racing writers surface as STALE_BOARD_WRITE_RETRY
   * for the outer CAS wrapper.
   *
   * Error and warning messages use the literal string `tasks.json.lock`
   * (review note SEC-1) — `lockPath` is never interpolated.
   *
   * @param {string} lockPath  absolute path to the sidecar lock file
   * @returns {number}  the open file descriptor
   */
  _acquireLock(lockPath) {
    // Attempt 1: normal acquire. Happy path: byte-for-byte identical to today.
    try {
      return openSync(lockPath, "wx");
    } catch (err) {
      if (!err || err.code !== "EEXIST") throw err;
    }

    // EEXIST path: probe the existing lock's age.
    let mtimeMs;
    try {
      mtimeMs = statSync(lockPath).mtimeMs;
    } catch (statErr) {
      if (statErr && statErr.code === "ENOENT") {
        // Behavior 6 — lock disappeared between failed openSync and statSync
        // (the "naturally released" race). Retry openSync once. Per review
        // note SA-1, this is a SEPARATE path from orphan recovery; if the
        // retry also hits EEXIST, fall through to STALE_BOARD_WRITE_RETRY
        // (does NOT re-enter orphan recovery). Invariant #2 ("one recovery
        // per acquire attempt") is unaffected because this is not an orphan
        // recovery.
        try {
          return openSync(lockPath, "wx");
        } catch (retryErr) {
          if (retryErr && retryErr.code === "EEXIST") {
            const e = new Error(
              `tasks.json: lock contention (another writer holds tasks.json.lock)`,
            );
            e.code = "STALE_BOARD_WRITE_RETRY";
            throw e;
          }
          throw retryErr;
        }
      }
      throw statErr;
    }

    const ageSeconds = (Date.now() - mtimeMs) / 1000;
    if (ageSeconds <= this.casLockStaleSeconds) {
      // Behavior 5: live writer holds the lock; today's behavior.
      const e = new Error(
        `tasks.json: lock contention (another writer holds tasks.json.lock)`,
      );
      e.code = "STALE_BOARD_WRITE_RETRY";
      throw e;
    }

    // Behavior 2: orphan recovery — unlink + retry openSync exactly once.
    try {
      unlinkSync(lockPath);
    } catch (unlinkErr) {
      // EACCES / EPERM / EBUSY — unable to clear the orphan. Surface a
      // dedicated error so operators can distinguish from live contention.
      // Error message uses literal 'tasks.json.lock' (SEC-1) — no lockPath
      // interpolation.
      const e = new Error(
        `tasks.json.lock: orphan-recovery unlink failed ` +
        `(age: ${Math.floor(ageSeconds)}s, threshold: ${this.casLockStaleSeconds}s)`,
      );
      e.code = "BOARD_ORPHAN_LOCK_UNLINK_FAILED";
      e.cause = unlinkErr;
      throw e;
    }

    // Retry openSync exactly once. Invariant #2: if THIS retry hits EEXIST,
    // fall through to STALE_BOARD_WRITE_RETRY. Do NOT re-enter orphan
    // recovery (Behavior 4: a new writer raced into the slot between unlink
    // and retry — live contention, not orphan state).
    let fd;
    try {
      fd = openSync(lockPath, "wx");
    } catch (retryErr) {
      if (retryErr && retryErr.code === "EEXIST") {
        const e = new Error(
          `tasks.json: lock contention (another writer holds tasks.json.lock)`,
        );
        e.code = "STALE_BOARD_WRITE_RETRY";
        throw e;
      }
      throw retryErr;
    }

    // Behavior 3: emit exactly one warning per process lifetime per adapter
    // instance. Warning string uses the literal 'tasks.json.lock' and never
    // interpolates the absolute lockPath (SEC-1).
    if (!this._orphanRecoveryWarningEmitted) {
      this._orphanRecoveryWarningEmitted = true;
      process.stderr.write(
        `[adev] recovered orphaned tasks.json.lock ` +
        `(age: ${Math.floor(ageSeconds)}s, threshold: ${this.casLockStaleSeconds}s)\n`,
      );
    }

    return fd;
  }

  /**
   * Atomically persist a board document via temp-file-then-rename. Mirrors
   * `lib/build-state.mjs::atomicWriteJson`. On failure between write and
   * rename, best-effort `unlinkSync` cleans up the temp file (CON-6).
   *
   * CAS layer: when `expectedSeq` is a number, re-reads the on-disk `seq`
   * immediately before `renameSync` and compares against the captured value.
   * Mismatch throws `STALE_BOARD_WRITE_RETRY` (internal control-flow signal
   * consumed by the retry wrapper in the six mutators). Successful CAS write
   * stamps `seq: expectedSeq + 1`. When `expectedSeq` is `null`, CAS is
   * bypassed — used for the init path and for `update`-style callers that
   * preserve an explicit `data.seq` value.
   *
   * Always emits `version: 2` regardless of input (SA-5). `seq` is preserved
   * through the reconstructor as a documented exception to the
   * "drop unknown top-level keys" rule in `json-issue-board-adapter.spec.md`
   * (cross-spec amendment, see concurrent-write-protection.spec.md SA-5).
   *
   * @param {{ version?: number, seq?: number, epics: object[], issues: object[] }} data
   * @param {number|null} [expectedSeq]
   */
  _write(data, expectedSeq = null) {
    // Make sure the directory exists.
    mkdirSync(this.storageDir, { recursive: true });

    // Acquire an exclusive write lock via O_EXCL on a sidecar lock file.
    // POSIX `open(O_EXCL|O_CREAT)` is atomic across processes on the same
    // filesystem — exactly one writer wins; others get EEXIST. This closes
    // the TOCTOU window between the CAS re-read and the rename: under the
    // lock, no other process can mutate tasks.json. Lock is released in the
    // finally block whether or not the write succeeds.
    const lockPath = this.filePath + ".lock";
    assertWithin(this.storageDir, lockPath, "INVALID_STORAGE_PATH");
    const lockFd = this._acquireLock(lockPath);

    try {
      // CAS check: re-read disk seq UNDER THE LOCK. Now atomic with the
      // rename because no other writer can intervene.
      if (expectedSeq !== null && existsSync(this.filePath)) {
        let currentSeq = 0;
        try {
          const currentRaw = readFileSync(this.filePath, "utf8");
          const current = JSON.parse(currentRaw);
          currentSeq = typeof current.seq === "number" ? current.seq : 0;
        } catch {
          // Malformed disk content is treated as seq:0 for CAS comparison;
          // a subsequent _read() would fail loudly with MALFORMED_BOARD.
          currentSeq = 0;
        }
        if (currentSeq !== expectedSeq) {
          const err = new Error(
            `tasks.json: stale write detected (captured seq=${expectedSeq}, current seq=${currentSeq})`
          );
          err.code = "STALE_BOARD_WRITE_RETRY";
          throw err;
        }
      }

      // Determine the seq to stamp:
      //  - CAS write (expectedSeq !== null): stamp expectedSeq + 1
      //  - non-CAS write (expectedSeq === null): preserve data.seq, default 0
      const nextSeq =
        expectedSeq !== null
          ? expectedSeq + 1
          : typeof data.seq === "number" && Number.isInteger(data.seq) && data.seq >= 0
          ? data.seq
          : 0;

      // Compose the canonical document (always emit version 2 — SA-5;
      // preserve seq per SA-5 cross-spec amendment).
      const document = {
        version: CANONICAL_VERSION,
        seq: nextSeq,
        epics: Array.isArray(data.epics) ? data.epics : [],
        issues: Array.isArray(data.issues) ? data.issues : [],
      };

      const tmpName = this.filePath + "." + randomBytes(4).toString("hex") + ".tmp";
      assertWithin(this.storageDir, tmpName, "INVALID_STORAGE_PATH");

      let renamed = false;
      try {
        writeFileSync(tmpName, JSON.stringify(document, null, 2) + "\n");
        renameSync(tmpName, this.filePath);
        renamed = true;
      } finally {
        if (!renamed) {
          try { unlinkSync(tmpName); } catch { /* ignore */ }
        }
      }
    } finally {
      // Release the lock. Best-effort — never throw from cleanup.
      try { closeSync(lockFd); } catch { /* ignore */ }
      try { unlinkSync(lockPath); } catch { /* ignore */ }
    }
  }

  // ---------------------------------------------------------------------------
  // ID generation helpers (parity with FileAdapter)
  // ---------------------------------------------------------------------------

  /**
   * Mint an issue id (issue-613).
   *
   * Was `max(existing) + 1`, which is branch-unsafe: two sessions off the same
   * baseline mint the same number and only find out at merge. `mintFlatId`
   * needs no shared counter, so a branch cannot disagree with another branch.
   * Existing sequential ids are left exactly as they are.
   */
  _nextIssueId(issues) {
    return mintFlatId("issue", issues);
  }

  /** Epics collide across branches the same way issues do — epic-108 was
   *  referenced on main while a branch had already taken 105-107. */
  _nextEpicId(epics) {
    return mintFlatId("epic", epics);
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

    return this._withCas("create", (board, seq) => {
      const issue = validateIssue(issueData);
      const { epics, issues } = board;

      const hasTierIntent = issueData.parent_id || issueData.tier_prefix;

      if (!hasTierIntent) {
        // Legacy path: assign a flat "issue-N" ID against the freshly-read
        // snapshot — retries re-derive ID from a fresh _nextIssueId scan.
        issue.id = this._nextIssueId(issues);
        issues.push(issue);
        this._write({ ...board, epics, issues }, seq);
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
      this._write({ ...board, epics, issues }, seq);
      return issue;
    });
  }

  async update(id, changes) {
    return this._withCas("update", (board, seq) => {
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

      // Fold a `description`/`body` change into the canonical `notes` field
      // (issue-484). update() does not run validateIssue, so without this the
      // alias persists as a stray key beside `notes` rather than updating the
      // body the caller meant to edit.
      const merged = normalizeNotesAliases(changes);

      const updated = { ...issues[idx], ...merged, updated: new Date().toISOString() };
      updated.id = issues[idx].id;
      updated.created = issues[idx].created;
      issues[idx] = updated;
      this._write({ ...board, epics, issues }, seq);
      return updated;
    });
  }

  /**
   * Atomic check-and-set claim (`adev issues claim`).
   *
   * The precondition (`requireClaimable`) is evaluated INSIDE the CAS
   * operation, against the snapshot that the write is validated against. That
   * ordering is what makes the claim atomic: a concurrent writer that lands
   * between our read and our rename bumps `seq`, `_write` refuses the commit
   * with STALE_BOARD_WRITE_RETRY, and the wrapper re-reads and re-evaluates
   * the precondition against the newer board. Two agents racing to claim the
   * same issue therefore cannot both win — the loser sees either
   * ISSUE_ALREADY_CLAIMED or, in the worst case, STALE_BOARD_WRITE. It never
   * silently proceeds.
   *
   * Re-claiming as the SAME owner is idempotent: `claimed_at` is preserved
   * (a re-claim is not a new claim) and the board is only rewritten if
   * `branch`/`pr` actually change.
   *
   * Claims are LEASES (issue-610). Past `tasks.claim_ttl_minutes` the claim is
   * stale and any claimant — including the original holder — takes a FRESH
   * claim: `claimed_at` advances, because the point of expiry is that nobody
   * can prove the old holder is still alive. The staleness test runs inside the
   * CAS callback against the same snapshot the write is validated against, so
   * a concurrent refresh by the live holder bumps `seq`, the commit is refused,
   * and the takeover is re-evaluated against the newer board.
   *
   * The displaced owner is NOT persisted. It is returned as an ephemeral
   * `takeover` property on the result. Adding a `previous_owner` column would
   * mean threading a fifth field through the fixed whitelist documented above
   * REF_FIELD_CODES (six sites, silent-drop failure mode) to store what is
   * history, not board state: the board holds 1:1 present facts about an issue,
   * and "who used to hold this" is an event. Callers that need it read it off
   * the claim result (the CLI prints it and emits it under `--json`).
   *
   * @param {string} id
   * @param {string} owner
   * @param {{ branch?: string, pr?: string }} [opts]
   * @returns {Promise<import('./interface.mjs').Issue & { takeover?: object }>}
   */
  async claim(id, owner, opts = {}) {
    const claimant = normalizeOwner(owner);
    // Reuse the shared field validation (string-or-absent) for branch/pr.
    for (const field of ["branch", "pr"]) {
      if (opts[field] !== undefined && opts[field] !== null && typeof opts[field] !== "string") {
        const err = new Error(`${field} must be a string when provided`);
        err.code = field === "branch" ? "INVALID_BRANCH" : "INVALID_PR";
        throw err;
      }
    }

    return this._withCas("claim", (board, seq) => {
      const { epics, issues } = board;
      const idx = issues.findIndex((i) => i.id === id);
      if (idx === -1) {
        const err = new Error(`Issue not found: ${id}`);
        err.code = "NOT_FOUND";
        throw err;
      }

      const current = issues[idx];
      // One instant for the whole check-and-set: the staleness verdict the
      // precondition acts on is the verdict the write records.
      const lease = { ttlMs: this.claimTtlMs, now: Date.now() };
      const stale = isClaimStale(current, lease);
      requireClaimable(current, claimant, lease);

      const nextBranch = opts.branch ?? current.branch;
      const nextPr = opts.pr ?? current.pr;

      // An expired lease is not a re-claim, even for the original holder —
      // it is a new claim and must get a new clock.
      const alreadyHeld = current.owner === claimant && !stale;
      if (alreadyHeld && nextBranch === current.branch && nextPr === current.pr) {
        // Fully idempotent re-claim: nothing to persist, no seq churn.
        return current;
      }

      // Captured before the overwrite; returned, never written (see JSDoc).
      const takeover = stale
        ? {
            previous_owner: current.owner,
            previous_claimed_at: current.claimed_at ?? null,
            ttl_minutes: this.claimTtlMinutes,
          }
        : null;

      const now = new Date(lease.now).toISOString();
      issues[idx] = {
        ...current,
        owner: claimant,
        // A re-claim by the holder keeps the original claim timestamp.
        claimed_at: alreadyHeld && current.claimed_at ? current.claimed_at : now,
        branch: nextBranch || undefined,
        pr: nextPr || undefined,
        updated: now,
      };
      this._write({ ...board, epics, issues }, seq);
      return takeover ? { ...issues[idx], takeover } : issues[idx];
    });
  }

  /**
   * Release a claim (`adev issues release`). Clears `owner`/`claimed_at`;
   * leaves `branch`/`pr` in place as a record of where the work went.
   * Releasing an unclaimed issue is an idempotent no-op.
   *
   * Lease-age blind: releasing a STALE claim is not an error and takes the
   * same path as any other release (the holder always may; a non-holder still
   * needs `--force`). Reclaiming a dead session's issue is `claim`'s job.
   *
   * @param {string} id
   * @param {string} owner
   * @param {{ force?: boolean }} [opts]
   * @returns {Promise<import('./interface.mjs').Issue>}
   */
  async release(id, owner, opts = {}) {
    const claimant = normalizeOwner(owner);

    return this._withCas("release", (board, seq) => {
      const { epics, issues } = board;
      const idx = issues.findIndex((i) => i.id === id);
      if (idx === -1) {
        const err = new Error(`Issue not found: ${id}`);
        err.code = "NOT_FOUND";
        throw err;
      }

      const current = issues[idx];
      requireReleasable(current, claimant, { force: opts.force === true });

      if (!current.owner && !current.claimed_at) {
        // Nothing held — idempotent no-op, no seq churn.
        return current;
      }

      const now = new Date().toISOString();
      issues[idx] = {
        ...current,
        owner: undefined,
        claimed_at: undefined,
        updated: now,
      };
      this._write({ ...board, epics, issues }, seq);
      return issues[idx];
    });
  }

  async close(id, reason) {
    return this._withCas("close", (board, seq) => {
      const { epics, issues } = board;
      const idx = issues.findIndex((i) => i.id === id);
      if (idx === -1) {
        const epicIdx = epics.findIndex((e) => e.id === id);
        if (epicIdx === -1) {
          const err = new Error(`Issue not found: ${id}`);
          err.code = "NOT_FOUND";
          throw err;
        }

        // Cascade guard: an epic's children link via issue.epicId, not id-prefixing.
        const unclosedChildren = issues.filter(
          (i) => i.epicId === id && i.status !== "closed"
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

        const now = new Date().toISOString();
        const updatedEpics = [...epics];
        const currentEpic = updatedEpics[epicIdx];
        const epicNotes = currentEpic.notes
          ? `${currentEpic.notes}; Closed: ${reason}`
          : `Closed: ${reason}`;
        updatedEpics[epicIdx] = {
          ...currentEpic,
          status: "closed",
          notes: epicNotes,
          updated: now,
        };
        this._write({ ...board, epics: updatedEpics, issues }, seq);
        return updatedEpics[epicIdx];
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
      this._write({ ...board, epics, issues }, seq);
      return issues[idx];
    });
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
    return this._withCas("createEpic", (board, seq) => {
      epic.id = this._nextEpicId(board.epics);
      const epics = [...board.epics, epic];
      this._write({ ...board, epics }, seq);
      return epic;
    });
  }

  async updateEpic(id, changes) {
    if (process.env.ADEV_DEPRECATION_WARN === "1") {
      console.warn("updateEpic is deprecated; use update() instead.");
    }
    return this._withCas("updateEpic", (board, seq) => {
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
      this._write({ ...board, epics }, seq);
      return updated;
    });
  }

  async addDependency(issueId, dependsOnId) {
    return this._withCas("addDependency", (board, seq) => {
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
      this._write({ ...board, issues }, seq);
    });
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
