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
 * (`create`/`update`/`close`/`addDependency`/`createEpic`/`updateEpic`) are
 * wrapped in a bounded CAS retry loop. Each captures the on-disk `seq` via
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
 * Read-only methods (`list`/`get`/`listEpics`/`walkTree`) call the
 * unchanged `_read()` and pay no CAS overhead.
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
  openSync,
  closeSync,
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
   * @param {string} opName  one of the six mutator names — used only in the
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
   * (`create`/`update`/`close`/`addDependency`/`createEpic`/`updateEpic`)
   * via the retry wrapper. Read-only methods (`list`/`get`/`listEpics`/
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
   * Returns the file descriptor on success. On EEXIST (lock held by another
   * writer), throws `STALE_BOARD_WRITE_RETRY` — today's behavior, unchanged.
   *
   * Extracted from `_write` in preparation for the orphan-recovery branch
   * (see orphan-lock-cleanup.spec.md). Pure refactor for plan-task 1; the
   * orphan-recovery branch lands in plan-task 2.
   *
   * Error message uses the literal string `tasks.json.lock` (review note
   * SEC-1) — `lockPath` is NOT interpolated.
   *
   * @param {string} lockPath  absolute path to the sidecar lock file
   * @returns {number}  the open file descriptor
   */
  _acquireLock(lockPath) {
    try {
      // 'wx' = O_WRONLY | O_CREAT | O_EXCL — fails with EEXIST if file exists.
      return openSync(lockPath, "wx");
    } catch (err) {
      if (err && err.code === "EEXIST") {
        const e = new Error(
          `tasks.json: lock contention (another writer holds tasks.json.lock)`
        );
        e.code = "STALE_BOARD_WRITE_RETRY";
        throw e;
      }
      throw err;
    }
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

      const updated = { ...issues[idx], ...changes, updated: new Date().toISOString() };
      updated.id = issues[idx].id;
      updated.created = issues[idx].created;
      issues[idx] = updated;
      this._write({ ...board, epics, issues }, seq);
      return updated;
    });
  }

  async close(id, reason) {
    return this._withCas("close", (board, seq) => {
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
