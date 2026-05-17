/**
 * lib/partial-artifact.mjs
 *
 * Pure helpers implementing the `.partial` + atomic-rename pattern
 * for agent-authored artifacts.
 *
 * Spec: .context-index/specs/cross-cutting/incremental-artifact-writes.spec.md (rev 2)
 *
 * Public surface (extended across Tasks 2-5, 7):
 *   - partialPath(finalPath)         → '<finalPath>.partial'
 *   - lockPath(finalPath)            → '<finalPath>.partial.lock'
 *   - commitPartial(finalPath)       → atomic rename `.partial` → final
 *   - assertWithin(baseDir, target, errCode?) → containment check
 *
 * Constitution alignment:
 *   - Principle 1 (no external deps): uses only `node:fs` + `node:path`.
 *   - Principle 3 (pure ESM): `.mjs`, named exports.
 *
 * Path-containment discipline mirrors `lib/issues/json-adapter.mjs::assertWithin`
 * (lines 97-109 in that file at the time of authoring). The default error
 * code on rejection is `INVALID_PARTIAL_PATH` per spec error-codes table.
 */

import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve, sep } from "node:path";

/** Default lock-staleness threshold (lock-steal trigger). */
const DEFAULT_STALE_SECONDS = 30;
/** Default retry count for "dead pid but young lock" contention. */
const DEFAULT_RETRY_COUNT = 3;
/** Default backoff between retries in milliseconds. */
const DEFAULT_BACKOFF_MS = 50;
/** Upper bound on accepted pid values — well above any real OS PID. */
const PID_UPPER_BOUND = 2 ** 22;

// ---------------------------------------------------------------------------
// Schema-marker grammar + allowlist (Task 3 — closes SEC-6, CON-12)
// ---------------------------------------------------------------------------

/**
 * Schema-marker grammar per spec Preconditions and CON-12:
 *   `<skill>@<version>`
 *   - <skill>: lowercase letter, then up to 31 of [a-z0-9-]
 *   - <version>: 1–3 digits
 *
 * Total cap: skill ≤ 32 chars, version ≤ 999 — fits comfortably in the
 * first 64 bytes of a `.partial` chunk so the resume-path can read it
 * without parsing the full file.
 */
const SCHEMA_MARKER_RE = /^[a-z][a-z0-9-]{0,31}@[0-9]{1,3}$/;

/**
 * Allowlist of `{skill, version}` markers permitted to dispatch a resume
 * parser. CON-12: the grammar is permissive (any future adopting skill
 * can mint a marker), but the dispatcher MUST consult the allowlist
 * before invoking a parser to prevent unknown schemas from being
 * silently treated as recoverable.
 *
 * Values are sentinel `true` placeholders for v1 — the actual parser
 * callables live in the adopting skill's helper code. Future revisions
 * may swap the value type for a callable signature without touching
 * callers that only do `.has()` / `isAllowedSchema()` checks.
 */
export const SCHEMA_ALLOWLIST = new Map([
  ["plan@1", true],
  ["spec@1", true],
  ["validate@1", true],
  ["implement@1", true],
]);

/**
 * Parse a `partial_schema` marker into its `{skill, version}` parts.
 * Throws `PARTIAL_ARTIFACT_SCHEMA_MISMATCH` on shape failure per the
 * spec's error-codes table.
 *
 * @param {string} raw - Candidate marker text.
 * @returns {{skill: string, version: number}}
 * @throws {Error} `err.code === "PARTIAL_ARTIFACT_SCHEMA_MISMATCH"`
 */
export function validateSchemaMarker(raw) {
  if (typeof raw !== "string" || raw.length === 0 || !SCHEMA_MARKER_RE.test(raw)) {
    const err = new Error(
      `Invalid partial_schema marker: ${JSON.stringify(raw)} ` +
        `(expected /^[a-z][a-z0-9-]{0,31}@[0-9]{1,3}$/)`
    );
    err.code = "PARTIAL_ARTIFACT_SCHEMA_MISMATCH";
    throw err;
  }
  const atIndex = raw.indexOf("@");
  const skill = raw.slice(0, atIndex);
  const version = Number(raw.slice(atIndex + 1));
  return { skill, version };
}

/**
 * Predicate form: returns true iff `raw` parses AND is present in
 * `SCHEMA_ALLOWLIST`. Never throws — invalid shape returns false.
 *
 * The resume path uses this to decide between "dispatch parser" and
 * "discard partial". The mutating verb that actually deletes a partial
 * should call `validateSchemaMarker` first to record a structured
 * error (rather than silently falling back to discard).
 *
 * @param {string} raw
 * @returns {boolean}
 */
export function isAllowedSchema(raw) {
  if (typeof raw !== "string" || raw.length === 0) return false;
  if (!SCHEMA_MARKER_RE.test(raw)) return false;
  return SCHEMA_ALLOWLIST.has(raw);
}

/**
 * Append `.partial` to a path. Pure function; does not touch the filesystem.
 *
 * @param {string} finalPath - The canonical (post-commit) artifact path.
 * @returns {string} `<finalPath>.partial`
 */
export function partialPath(finalPath) {
  if (typeof finalPath !== "string" || finalPath.length === 0) {
    throw new TypeError("finalPath must be a non-empty string");
  }
  return `${finalPath}.partial`;
}

/**
 * Compute the sidecar lock path for a `.partial` artifact.
 * Pure function; does not touch the filesystem.
 *
 * @param {string} finalPath - The canonical (post-commit) artifact path.
 * @returns {string} `<finalPath>.partial.lock`
 */
export function lockPath(finalPath) {
  if (typeof finalPath !== "string" || finalPath.length === 0) {
    throw new TypeError("finalPath must be a non-empty string");
  }
  return `${finalPath}.partial.lock`;
}

/**
 * Atomically rename `<finalPath>.partial` to `<finalPath>`. This is the
 * artifact's "commit" signal per Behavior 2 of the spec.
 *
 * Atomicity: POSIX guarantees same-filesystem `rename(2)` is atomic.
 * Windows: `fs.renameSync` uses `MoveFileExW(MOVEFILE_REPLACE_EXISTING)`,
 * also atomic. Any reader sees either the prior `<finalPath>` content,
 * the new content, or both filenames briefly (during the rename window) —
 * never a half-written final file.
 *
 * The caller is responsible for unlinking `<finalPath>.partial.lock` after
 * a successful commit (Behavior 2). This function does not touch the lock.
 *
 * @param {string} finalPath - The canonical artifact path.
 * @returns {string} `finalPath` (for chaining).
 * @throws {Error} `ENOENT` if `<finalPath>.partial` does not exist.
 * @throws {Error} Other `fs` errors (`EACCES`, `EXDEV`, ...) surface unchanged.
 */
export function commitPartial(finalPath) {
  if (typeof finalPath !== "string" || finalPath.length === 0) {
    throw new TypeError("finalPath must be a non-empty string");
  }
  renameSync(partialPath(finalPath), finalPath);
  return finalPath;
}

/**
 * Enforce path containment: `target` must resolve under `baseDir`. Both
 * arguments may be relative; both are resolved via `path.resolve()` before
 * comparison. Mirrors `lib/issues/json-adapter.mjs::assertWithin` (the
 * canonical pattern in this codebase) and uses `INVALID_PARTIAL_PATH`
 * by default per the spec's error-codes table.
 *
 * Containment rule: `resolvedTarget === resolvedBase`, OR
 * `resolvedTarget` starts with `resolvedBase + path.sep`. This defeats
 * naive `startsWith` aliasing where `/foo/barbaz` would otherwise match
 * `/foo/bar` as a "containment".
 *
 * @param {string} baseDir   - The containment root.
 * @param {string} target    - The path to validate.
 * @param {string} [errCode] - Override the default error code.
 * @returns {string} The resolved (absolute) target path.
 * @throws {Error} `err.code = errCode` when `target` escapes `baseDir`.
 */
export function assertWithin(baseDir, target, errCode = "INVALID_PARTIAL_PATH") {
  if (typeof baseDir !== "string" || baseDir.length === 0) {
    const err = new Error("baseDir must be a non-empty string path");
    err.code = errCode;
    throw err;
  }
  if (typeof target !== "string" || target.length === 0) {
    const err = new Error("target must be a non-empty string path");
    err.code = errCode;
    throw err;
  }
  const resolvedBase = resolve(baseDir);
  const resolvedTarget = resolve(target);
  const prefix = resolvedBase.endsWith(sep) ? resolvedBase : resolvedBase + sep;
  if (!(resolvedTarget === resolvedBase || resolvedTarget.startsWith(prefix))) {
    const err = new Error(
      `Resolved path "${resolvedTarget}" escapes containment root "${resolvedBase}"`
    );
    err.code = errCode;
    throw err;
  }
  return resolvedTarget;
}

// ---------------------------------------------------------------------------
// Lock payload validation (Task 4 — SEC-7)
// ---------------------------------------------------------------------------

/**
 * Validate a `.partial.lock` payload. Per the spec (SEC-7), strict
 * validation guards against acting on garbage lock files: a malformed
 * payload routes the caller to the orphan-steal path WITHOUT invoking
 * `process.kill(maybePid, 0)` on an untrusted integer.
 *
 * Accepts either a parsed object or a raw JSON string.
 *
 * @param {object|string} raw - Parsed payload or JSON string.
 * @returns {{pid: number, started_at: string}} The validated payload.
 * @throws {Error} on any validation failure (caller treats as orphan).
 */
export function validateLockPayload(raw) {
  let payload = raw;
  if (typeof raw === "string") {
    payload = JSON.parse(raw); // throws SyntaxError on garbage → caller catches
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TypeError("lock payload must be an object");
  }
  const { pid, started_at } = payload;
  if (
    typeof pid !== "number" ||
    !Number.isInteger(pid) ||
    pid <= 0 ||
    pid > PID_UPPER_BOUND
  ) {
    throw new RangeError(
      `lock payload.pid must be a positive integer ≤ ${PID_UPPER_BOUND}; got ${JSON.stringify(pid)}`
    );
  }
  if (typeof started_at !== "string" || started_at.length === 0) {
    throw new TypeError("lock payload.started_at must be a non-empty string");
  }
  const parsed = Date.parse(started_at);
  if (Number.isNaN(parsed)) {
    throw new TypeError(
      `lock payload.started_at must be a parseable ISO-8601 timestamp; got ${JSON.stringify(started_at)}`
    );
  }
  if (parsed > Date.now() + 1000) {
    // 1s slack for clock skew. Future timestamps indicate a corrupted lock
    // or system clock issue — refuse to honor.
    throw new RangeError(
      `lock payload.started_at is in the future: ${started_at}`
    );
  }
  return { pid, started_at };
}

// ---------------------------------------------------------------------------
// Lock acquisition + steal-on-stale (Task 4 — SA-10, SA-11)
// ---------------------------------------------------------------------------

/**
 * Probe whether a given pid is alive via `process.kill(pid, 0)`.
 * Returns true on success (alive or "exists but no permission"), false on
 * ESRCH. Defensive against unexpected errors by treating them as "alive"
 * (better to refuse the lock than steal it on a probe error).
 *
 * @param {number} pid
 * @returns {boolean}
 */
function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if (err && err.code === "ESRCH") return false;
    // EPERM: process exists but we lack permission to signal it — treat as
    // alive (the owner is real).
    if (err && err.code === "EPERM") return true;
    // Any other error: be conservative and treat as alive.
    return true;
  }
}

/**
 * Try to acquire the `.partial.lock` for `finalPath`. Implements Behavior 6
 * of the spec — `O_EXCL` create, dead-owner detection via `kill -0`,
 * steal-on-stale with the **stolen → discarded** contract (the partial's
 * content is removed alongside the lock, so the next writer starts fresh
 * and there is no TOCTOU window per SA-10's resolution).
 *
 * Failure modes per spec:
 *   - live owner            → returns `{acquired:false, code:"PARTIAL_ARTIFACT_LOCKED"}`
 *   - dead owner + young    → retry-with-backoff; LOCKED after budget
 *   - dead owner + old      → steal (unlink lock+partial, re-acquire)
 *   - malformed payload     → treat as orphan, steal (do NOT call kill)
 *
 * Options:
 *   - retries        — retry budget for dead-owner-within-window (default 3)
 *   - stale_seconds  — lock-steal threshold (default 30; strict >)
 *   - backoff_ms     — sleep between retries (default 50)
 *   - now            — clock seam, returns Date (default `() => new Date()`)
 *   - sleep          — sleep seam, takes (ms) (default real sleep)
 *   - onRecovery     — callback invoked with `{action, artifact_path,
 *                       prior_partial_ts}` on steal events; the caller is
 *                       responsible for emitting the `partial_recovery`
 *                       lifecycle event (this module stays pure).
 *
 * @param {string} finalPath - Canonical artifact path.
 * @param {object} [opts]
 * @returns {{acquired: true, lockPath: string} |
 *           {acquired: false, code: string, payload?: object|null}}
 */
export function tryAcquireLock(finalPath, opts = {}) {
  const {
    retries = DEFAULT_RETRY_COUNT,
    stale_seconds = DEFAULT_STALE_SECONDS,
    backoff_ms = DEFAULT_BACKOFF_MS,
    now = () => new Date(),
    sleep,
    onRecovery,
  } = opts;
  if (typeof finalPath !== "string" || finalPath.length === 0) {
    throw new TypeError("finalPath must be a non-empty string");
  }
  const lock = lockPath(finalPath);
  const partial = partialPath(finalPath);

  let attempt = 0;
  while (true) {
    // Try the optimistic O_EXCL create first.
    const writeResult = tryCreateLock(lock);
    if (writeResult.acquired) return writeResult;

    // EEXIST: inspect the existing lock.
    let existing;
    let payload = null;
    let validationFailed = false;
    try {
      existing = readFileSync(lock, "utf8");
      payload = validateLockPayload(existing);
    } catch {
      validationFailed = true;
    }

    if (validationFailed) {
      // Malformed payload → orphan-steal path (SEC-7 + SA-10): unlink
      // lock + partial, do NOT call `process.kill` on garbage.
      stealAndDiscard(lock, partial, finalPath, "stolen", onRecovery, null);
      // Retry the O_EXCL once.
      const r = tryCreateLock(lock);
      if (r.acquired) return r;
      return { acquired: false, code: "PARTIAL_ARTIFACT_LOCKED", payload };
    }

    const alive = isPidAlive(payload.pid);
    if (alive) {
      return { acquired: false, code: "PARTIAL_ARTIFACT_LOCKED", payload };
    }

    // Dead owner. Compute age.
    const ageSec = (now().getTime() - Date.parse(payload.started_at)) / 1000;
    if (ageSec > stale_seconds) {
      // SA-10: steal. Unlink partial + lock; do NOT preserve partial content
      // (the stolen→discarded contract means the next writer starts fresh).
      stealAndDiscard(
        lock,
        partial,
        finalPath,
        "stolen",
        onRecovery,
        payload.started_at
      );
      const r = tryCreateLock(lock);
      if (r.acquired) return r;
      // Lost a race with another stealing process; fall through to retry.
    }

    // Within window: retry-with-backoff per Behavior 6.
    if (attempt >= retries) {
      return { acquired: false, code: "PARTIAL_ARTIFACT_LOCKED", payload };
    }
    attempt += 1;
    if (typeof sleep === "function") {
      sleep(backoff_ms);
    } else {
      // No real sleep on the hot path — we keep callers in control.
      // Production callers should pass a real sleep seam (e.g., setTimeout
      // wrapped in a Promise) and await tryAcquireLock in an async wrapper.
      // For sync use, this loop simply re-checks immediately.
    }
  }
}

/**
 * Internal helper — perform the O_EXCL create.
 * Returns `{acquired:true, lockPath}` on success, `{acquired:false}` on EEXIST.
 * Any other fs error propagates (e.g., EACCES, ENOSPC).
 */
function tryCreateLock(lockFilePath) {
  let fd;
  try {
    fd = openSync(lockFilePath, "wx"); // O_CREAT | O_EXCL
  } catch (err) {
    if (err && err.code === "EEXIST") return { acquired: false };
    throw err;
  }
  try {
    const payload = JSON.stringify({
      pid: process.pid,
      started_at: new Date().toISOString(),
    });
    writeFileSync(fd, payload);
  } finally {
    closeSync(fd);
  }
  return { acquired: true, lockPath: lockFilePath };
}

/**
 * Internal helper — unlink the lock + partial (stolen → discarded contract)
 * and invoke the optional `onRecovery` callback so the caller can record
 * a `partial_recovery` lifecycle event.
 */
function stealAndDiscard(
  lockFilePath,
  partialFilePath,
  finalPath,
  action,
  onRecovery,
  priorStartedAt
) {
  let priorPartialTs = priorStartedAt;
  try {
    if (priorPartialTs == null) {
      const st = statSync(partialFilePath);
      priorPartialTs = st.mtime.toISOString();
    }
  } catch {
    priorPartialTs = priorPartialTs || new Date(0).toISOString();
  }
  safeUnlink(partialFilePath);
  safeUnlink(lockFilePath);
  if (typeof onRecovery === "function") {
    onRecovery({
      action,
      artifact_path: finalPath,
      prior_partial_ts: priorPartialTs,
    });
  }
}

function safeUnlink(path) {
  try {
    unlinkSync(path);
  } catch (err) {
    if (err && err.code === "ENOENT") return; // already gone — fine
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Discovery + staleness (Task 5)
// ---------------------------------------------------------------------------

/**
 * Recursively find every `.partial` file under `rootDir`. Sidecar
 * `.partial.lock` files are excluded — the recovery flow needs only
 * the partials themselves; lock state is read separately.
 *
 * Behaves identically across platforms (uses POSIX `path.sep` in the
 * accumulator). Symlinks are NOT followed (defensive; recursive
 * symlinks would otherwise loop).
 *
 * @param {string} rootDir - Directory to walk.
 * @returns {string[]} Absolute paths of `.partial` files (may be empty).
 */
export function findPartials(rootDir) {
  if (typeof rootDir !== "string" || rootDir.length === 0) {
    throw new TypeError("rootDir must be a non-empty string");
  }
  if (!existsSync(rootDir)) return [];

  const out = [];
  walk(rootDir, out);
  return out;
}

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    if (err && (err.code === "ENOENT" || err.code === "ENOTDIR")) return;
    throw err;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isSymbolicLink()) continue; // defensive: do not follow symlinks
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (entry.isFile()) {
      // Match `.partial` exactly; exclude `.partial.lock`.
      if (entry.name.endsWith(".partial") && !entry.name.endsWith(".partial.lock")) {
        out.push(full);
      }
    }
  }
}

/**
 * Is the `.partial` file at `path` older than `thresholdHours`?
 *
 * @param {string} path - Absolute path to a `.partial` file.
 * @param {number} thresholdHours - Age threshold in hours.
 * @param {object} [opts]
 * @param {() => Date} [opts.now] - Clock seam for testing.
 * @returns {boolean} false if the file is missing or fresh, true if stale.
 */
export function isPartialStale(path, thresholdHours, opts = {}) {
  if (typeof path !== "string" || path.length === 0) {
    throw new TypeError("path must be a non-empty string");
  }
  if (typeof thresholdHours !== "number" || thresholdHours <= 0) {
    throw new TypeError("thresholdHours must be a positive number");
  }
  const now = opts.now ?? (() => new Date());
  let st;
  try {
    st = statSync(path);
  } catch (err) {
    if (err && err.code === "ENOENT") return false;
    throw err;
  }
  const ageMs = now().getTime() - st.mtime.getTime();
  return ageMs > thresholdHours * 60 * 60 * 1000;
}
