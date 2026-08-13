/**
 * Session capture — shared module backing the SessionEnd and PreCompact
 * Claude Code hooks. Provides validators (SEC-2, SEC-3, SEC-10) and
 * the `detectExistingCapture()` helper used by the init-time prompt.
 *
 * Pure ESM, Node.js built-ins only (Principle 1). Named exports.
 *
 * The hook-helper entry point (`runCapture()`) and `emitDiagnostic()` land
 * in later tasks; this file initially only exposes the validators that the
 * hook scripts and the init-prompt verb depend on.
 */

import {
  realpathSync,
  existsSync,
  statSync,
  readFileSync,
  readdirSync,
  mkdirSync,
  writeFileSync,
  appendFileSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { isAbsolute, dirname, join, relative, sep } from "node:path";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";

// ─────────────────────────────────────────────────────────────────────────────
// validateSessionId  — SEC-2: Claude session IDs are uuid-like; reject anything
// that could be a path-injection vector.
// ─────────────────────────────────────────────────────────────────────────────

const SESSION_ID_RE = /^[A-Za-z0-9_-]+$/;

/**
 * @param {unknown} id
 * @returns {boolean}
 */
export function validateSessionId(id) {
  if (typeof id !== "string") return false;
  if (id.length === 0) return false;
  return SESSION_ID_RE.test(id);
}

// ─────────────────────────────────────────────────────────────────────────────
// validateCwd  — SEC-10: cwd must be absolute AND must, after realpath
// resolution, sit inside (or be) a directory whose `.context-index/manifest.yaml`
// exists when walking upward. The walk starts from the *resolved* path; raw
// input never seeds the walk.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {unknown} cwd
 * @returns {boolean}
 */
export function validateCwd(cwd) {
  if (typeof cwd !== "string" || cwd.length === 0) return false;
  if (!isAbsolute(cwd)) return false;

  let resolved;
  try {
    resolved = realpathSync(cwd);
  } catch {
    return false;
  }

  // Walk upward from the realpath-resolved starting point.
  let current = resolved;
  while (true) {
    const manifestPath = join(current, ".context-index", "manifest.yaml");
    if (existsSync(manifestPath)) return true;
    const parent = dirname(current);
    if (parent === current) return false; // hit filesystem root
    current = parent;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// validateTranscriptPath  — SEC-3, SEC-10: transcript_path must end in `.jsonl`
// and, after realpath, be a path-prefix child of the (also-realpath-resolved)
// Claude Code transcripts root `~/.claude/projects/<cwd-encoded>/`.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Encode an absolute cwd to the Claude Code transcripts-root segment.
 * Claude Code joins the absolute path with `/` → `-` substitution.
 * @param {string} cwdReal
 * @returns {string}
 */
function encodeCwd(cwdReal) {
  return cwdReal.replace(/\//g, "-");
}

/**
 * Check that `child` is a path-prefix descendant of `parent`. Both arguments
 * must already be normalised absolute paths (realpath-resolved by the caller).
 *
 * @param {string} child
 * @param {string} parent
 * @returns {boolean}
 */
function isContained(child, parent) {
  if (child === parent) return true;
  const withSep = parent.endsWith(sep) ? parent : parent + sep;
  return child.startsWith(withSep);
}

/**
 * @param {unknown} path
 * @param {unknown} cwd
 * @returns {boolean}
 */
export function validateTranscriptPath(path, cwd) {
  if (typeof path !== "string" || path.length === 0) return false;
  if (!path.endsWith(".jsonl")) return false;
  if (typeof cwd !== "string" || cwd.length === 0) return false;
  if (!isAbsolute(cwd)) return false;

  let cwdReal;
  let pathReal;
  try {
    cwdReal = realpathSync(cwd);
  } catch {
    return false;
  }
  try {
    pathReal = realpathSync(path);
  } catch {
    return false;
  }

  const home = process.env.HOME;
  if (!home) return false;
  const rawRoot = join(home, ".claude", "projects", encodeCwd(cwdReal));
  let rootReal;
  try {
    rootReal = realpathSync(rawRoot);
  } catch {
    return false;
  }

  return isContained(pathReal, rootReal);
}

// ─────────────────────────────────────────────────────────────────────────────
// detectExistingCapture  — pure read-only scan for prior session-capture
// installation. Used by the init-time prompt to compute defaults:
//   - new project (no signals)        → existing: false → defaults to hook, true
//   - existing project (any signal)  → existing: true  → defaults to post-commit, false
// ─────────────────────────────────────────────────────────────────────────────

const SENTINEL_OPEN_RE = /^[ \t]*#[ \t]*>>>[ \t]+adev:session-capture[ \t]+>>>[ \t]*$/m;
const SENTINEL_CLOSE_RE = /^[ \t]*#[ \t]*<<<[ \t]+adev:session-capture[ \t]+<<<[ \t]*$/m;
// Loose heuristic matching the legacy capture block's distinctive lines.
// Reads as: a comment referencing `session-capture` AND a write target under
// `.context-index/sessions` AND a node invocation. Two of three is enough.
function looksLikeLegacyCaptureBlock(content) {
  const signals = [
    /session[\s_-]?capture/i.test(content),
    /\.context-index\/sessions/.test(content),
    /node\s+.*lib\/session-summary/.test(content) ||
      /session-tracking/.test(content),
  ];
  return signals.filter(Boolean).length >= 2;
}

/**
 * Scan `projectRoot` for evidence of any prior session-capture installation.
 * Pure: never writes, never throws on missing files.
 *
 * @param {string} projectRoot
 * @returns {Promise<{ existing: boolean, signals: string[] }>}
 */
export async function detectExistingCapture(projectRoot) {
  const signals = [];

  // Signal A: paired sentinel block in .githooks/post-commit
  const postCommit = join(projectRoot, ".githooks", "post-commit");
  let postCommitContent = null;
  try {
    if (existsSync(postCommit)) {
      postCommitContent = readFileSync(postCommit, "utf8");
    }
  } catch {
    // ignore — pure read
  }

  if (postCommitContent !== null) {
    if (
      SENTINEL_OPEN_RE.test(postCommitContent) &&
      SENTINEL_CLOSE_RE.test(postCommitContent)
    ) {
      signals.push("post-commit-sentinel-block");
    } else if (looksLikeLegacyCaptureBlock(postCommitContent)) {
      signals.push("post-commit-legacy-signature");
    }
  }

  // Signal B: any tracked sessions/*.md
  const sessionsDir = join(projectRoot, ".context-index", "sessions");
  try {
    if (existsSync(sessionsDir)) {
      const entries = readdirSync(sessionsDir);
      const hasMd = entries.some((name) => name.endsWith(".md"));
      if (hasMd) signals.push("tracked-sessions");
    }
  } catch {
    // ignore
  }

  return { existing: signals.length > 0, signals };
}

// ─────────────────────────────────────────────────────────────────────────────
// Stderr diagnostic helper — SEC-7 (stable format) + CON-10 (optional subject
// token). Centralises emission so every call site speaks the documented shape:
//
//   [adev:session-capture] <reason-code>[ <subject>][ <project-relative-path>]
//
// `reason-code` is one of `parse-error`, `path-error`, `permission-error`,
// `payload-error`, `validation-error`, or `disabled`.
// `subject` is the field/value identifier (e.g., `session-id`, `cwd`,
// `transcript`, or the per-field subjects from SEC-12/SEC-13 such as
// `cost-usd`, `model`, `issue-id`).
// `path` is an optional project-relative path (never absolute, never user
// content).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a stderr diagnostic line per SEC-7 + CON-10.
 * Pure function — caller is responsible for emission.
 *
 * @param {string} reasonCode
 * @param {{ subject?: string, path?: string }} [opts]
 * @returns {string}
 */
export function formatDiagnostic(reasonCode, opts = {}) {
  const { subject, path } = opts;
  const parts = ["[adev:session-capture]", String(reasonCode)];
  if (subject) parts.push(String(subject));
  if (path) parts.push(String(path));
  return parts.join(" ");
}

/**
 * Write a diagnostic line to stderr. Sink is swappable for tests via the
 * optional `sink` parameter (default: `process.stderr.write`).
 *
 * @param {string} reasonCode
 * @param {{ subject?: string, path?: string, sink?: (line: string) => void }} [opts]
 */
export function emitDiagnostic(reasonCode, opts = {}) {
  const { sink, ...rest } = opts;
  const line = formatDiagnostic(reasonCode, rest) + "\n";
  if (typeof sink === "function") {
    sink(line);
  } else {
    process.stderr.write(line);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// runCapture — shared hook helper composing validation → fromTranscript →
// frontmatter assembly → atomic write. Used by both `hooks/session-end.sh`
// and `hooks/pre-compact.sh` via the wrapper `bin/session-capture-helper.mjs`.
//
// Spec invariants:
//   - Atomic writes (SEC-4) via `<path>.tmp-<pid>-<8hex>` → rename.
//   - One file per session per day; PreCompact MUST NOT overwrite a file with
//     existing frontmatter `kind: session-end` (SA-2).
//   - Optional SessionEnd frontmatter from execution-state (rev 4 — issue/epic).
//   - Per-field validation rejection OMITS the field (rev 5 — SEC-12/SEC-13)
//     and emits one stderr line each via `emitDiagnostic`.
//   - Always exits 0; diagnostics go to stderr only.
// ─────────────────────────────────────────────────────────────────────────────

const ISSUE_ID_RE = /^[a-z0-9][a-z0-9.-]{0,63}$/;

function isoDate(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function quoteYamlString(v) {
  // Conservative quoting: wrap in double quotes if the value has special chars,
  // otherwise leave bare. Session_id is already charset-bounded; model passed
  // validateModel(); issue/epic passed parseId(). We still wrap in quotes for
  // any string that could trip the simple YAML reader (colons, leading dashes).
  const s = String(v);
  if (/^[A-Za-z0-9._-]+$/.test(s)) return s;
  return JSON.stringify(s);
}

function renderFrontmatter(fields) {
  const lines = ["---"];
  for (const [k, v] of fields) {
    if (v === undefined || v === null) continue;
    if (typeof v === "number") {
      lines.push(`${k}: ${v}`);
    } else {
      lines.push(`${k}: ${quoteYamlString(v)}`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}

/**
 * Read existing frontmatter `kind` from a file path, if present.
 * Returns the `kind` value or null. Never throws.
 *
 * @param {string} filePath
 * @returns {string|null}
 */
function readExistingKind(filePath) {
  try {
    const raw = readFileSync(filePath, "utf8");
    const m = raw.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!m) return null;
    const km = m[1].match(/^kind:\s*(.+?)\s*$/m);
    if (!km) return null;
    return km[1].trim();
  } catch {
    return null;
  }
}

/**
 * Best-effort parser for `parseId`-equivalent semantics on issue/epic ids.
 * Returns true if the value passes the charset regex AND `lib/issues/id-utils
 * .mjs::parseId` returns non-null (when available; degrades to charset-only
 * when the module cannot be loaded).
 *
 * @param {string} value
 * @returns {boolean}
 */
async function isValidIssueId(value) {
  if (typeof value !== "string" || !ISSUE_ID_RE.test(value)) return false;
  try {
    const mod = await import("./issues/id-utils.mjs");
    if (typeof mod.parseId === "function") {
      return mod.parseId(value) !== null;
    }
  } catch {
    // Module not present — fall back to charset-only validation.
  }
  return true;
}

/**
 * Read execution state through `lib/execution-state.mjs` so this module lands
 * on the same storage root the writer used.
 *
 * That library resolves its root the way the issue board does — shared across
 * every worktree of a repo. Hand-building
 * `<projectRoot>/.context-index/.execution-state.json` here would read a
 * worktree-local file the writer never touches, so a session in a linked
 * worktree would silently record a stale or missing issue/epic binding. Same
 * shadow-file failure the board already fixed.
 *
 * Never throws — a capture hook must not break the tool call it observes.
 *
 * @param {string} projectRoot
 * @returns {Promise<object|null>} parsed state, or null when unreadable
 */
async function readSharedExecutionState(projectRoot) {
  try {
    const mod = await import("./execution-state.mjs");
    return mod.readExecutionState(projectRoot);
  } catch {
    return null;
  }
}

/**
 * Resolve the issue/epic pair from the shared execution state.
 * Returns `{ issue, epic }` where either or both may be undefined.
 * Never throws. Validates each field per SEC-13.
 *
 * @param {string} projectRoot
 * @param {(reasonCode: string, opts?: object) => void} emit
 * @returns {Promise<{ issue?: string, epic?: string }>}
 */
async function resolveExecutionStateBinding(projectRoot, emit) {
  const out = {};
  const state = await readSharedExecutionState(projectRoot);
  if (!state || state.status !== "active") return out;

  const rawIssue = state.issueBinding;
  if (!rawIssue) return out;

  const issueOk = await isValidIssueId(rawIssue);
  if (!issueOk) {
    emit("validation-error", { subject: "issue-id" });
    return out;
  }
  out.issue = String(rawIssue);

  // Resolve epic via issue board (file backend). Best-effort; absence is not
  // a validation error — only invalid epic ids are rejected.
  let epicRaw = null;
  try {
    const boardPath = join(projectRoot, ".context-index", "tasks", "tasks.md");
    if (existsSync(boardPath)) {
      const board = readFileSync(boardPath, "utf8");
      const block = board.match(
        new RegExp(`###\\s+${out.issue}[\\s\\S]*?(?=\\n### |$)`),
      );
      if (block) {
        const em = block[0].match(/epicId:\s*(\S+)/);
        if (em) epicRaw = em[1];
      }
    }
  } catch {
    // ignore
  }
  if (epicRaw) {
    const epicOk = await isValidIssueId(epicRaw);
    if (!epicOk) {
      emit("validation-error", { subject: "epic-id" });
    } else {
      out.epic = String(epicRaw);
    }
  }
  return out;
}

/**
 * Build the atomic temp filename per SEC-4: `<path>.tmp-<pid>-<8hex>`.
 *
 * @param {string} finalPath
 * @returns {string}
 */
function tempFilename(finalPath) {
  const pid = String(process.pid);
  const hex = randomBytes(4).toString("hex");
  return `${finalPath}.tmp-${pid}-${hex}`;
}

/**
 * Compose the helper entry point. The bash wrappers exec a thin Node script
 * which calls `runCapture({ event, payload, projectRoot, emit })`. This
 * function is testable in isolation: caller injects `emit` and `payload`.
 *
 * @param {object} args
 * @param {'session-end'|'pre-compact'} args.event
 * @param {object} args.payload  — { session_id, transcript_path, cwd, reason? }
 * @param {string} args.projectRoot - absolute path to project root
 * @param {(reasonCode: string, opts?: object) => void} [args.emit] - diagnostic sink
 * @returns {Promise<{ ok: boolean, written: string|null, kind: string|null }>}
 */
export async function runCapture({ event, payload, projectRoot, emit }) {
  const diag = typeof emit === "function" ? emit : (rc, o) => emitDiagnostic(rc, o);

  if (event !== "session-end" && event !== "pre-compact") {
    diag("payload-error", { subject: "event" });
    return { ok: false, written: null, kind: null };
  }

  if (!payload || typeof payload !== "object") {
    diag("payload-error", { subject: "payload" });
    return { ok: false, written: null, kind: null };
  }

  // Payload field presence checks.
  if (!payload.session_id) {
    diag("payload-error", { subject: "session-id-missing" });
    return { ok: false, written: null, kind: null };
  }
  if (!payload.transcript_path) {
    diag("payload-error", { subject: "transcript-path-missing" });
    return { ok: false, written: null, kind: null };
  }
  if (!payload.cwd) {
    diag("payload-error", { subject: "cwd-missing" });
    return { ok: false, written: null, kind: null };
  }

  // Validate fields.
  if (!validateSessionId(payload.session_id)) {
    diag("validation-error", { subject: "session-id" });
    return { ok: false, written: null, kind: null };
  }
  if (!validateCwd(payload.cwd)) {
    diag("validation-error", { subject: "cwd" });
    return { ok: false, written: null, kind: null };
  }
  if (!validateTranscriptPath(payload.transcript_path, payload.cwd)) {
    diag("path-error", { subject: "transcript" });
    return { ok: false, written: null, kind: null };
  }

  // Compute target path.
  const sessionsDir = join(projectRoot, ".context-index", "sessions");
  const date = isoDate();
  const targetPath = join(sessionsDir, `${date}-${payload.session_id}.md`);
  const relTarget = relative(projectRoot, targetPath);

  // PreCompact skip-if-session-end (SA-2).
  if (event === "pre-compact" && existsSync(targetPath)) {
    const existing = readExistingKind(targetPath);
    if (existing === "session-end") {
      diag("disabled", { path: relTarget });
      return { ok: false, written: null, kind: null };
    }
  }

  // Ensure sessions/ exists.
  try {
    mkdirSync(sessionsDir, { recursive: true });
  } catch {
    diag("permission-error", { subject: "sessions-dir" });
    return { ok: false, written: null, kind: null };
  }

  // Lazy import fromTranscript so this module is import-safe before
  // session-summary is loaded (avoids cycles during tests).
  let fromTranscript;
  try {
    ({ fromTranscript } = await import("./session-summary.mjs"));
  } catch (err) {
    diag("parse-error", { path: relTarget });
    return { ok: false, written: null, kind: null };
  }

  let result;
  try {
    result = await fromTranscript(payload.transcript_path);
  } catch {
    // fromTranscript is contracted never to throw, but be defensive.
    result = { kind: "placeholder", body: "_Transcript unavailable._\n" };
    diag("parse-error", { path: relTarget });
  }

  let kind;
  if (result.kind === "placeholder") {
    kind = "placeholder";
    diag("parse-error", { path: relTarget });
  } else {
    kind = event === "session-end" ? "session-end" : "pre-compact";
  }

  // Assemble frontmatter fields.
  const fields = [
    ["kind", kind],
    ["session_id", payload.session_id],
    ["date", date],
  ];

  // Optional metadata (only for session-end + non-placeholder).
  if (kind === "session-end" && result.metadata) {
    const md = result.metadata;
    if (typeof md.costUsd === "number") {
      fields.push(["cost_usd", md.costUsd.toFixed(4)]);
    }
    if (typeof md.inputTokens === "number") {
      fields.push(["input_tokens", md.inputTokens]);
    }
    if (typeof md.outputTokens === "number") {
      fields.push(["output_tokens", md.outputTokens]);
    }
    if (typeof md.model === "string") {
      fields.push(["model", md.model]);
    }

    const binding = await resolveExecutionStateBinding(projectRoot, diag);
    if (binding.issue) fields.push(["issue", binding.issue]);
    if (binding.epic) fields.push(["epic", binding.epic]);
  }

  const frontmatter = renderFrontmatter(fields);
  const content = `${frontmatter}\n\n${result.body || ""}`;

  // Atomic write.
  const tmpPath = tempFilename(targetPath);
  try {
    writeFileSync(tmpPath, content, "utf8");
  } catch {
    diag("permission-error", { path: relTarget });
    return { ok: false, written: null, kind };
  }
  try {
    renameSync(tmpPath, targetPath);
  } catch {
    // Cleanup the temp file on rename failure.
    try { unlinkSync(tmpPath); } catch {}
    diag("permission-error", { path: relTarget });
    return { ok: false, written: null, kind };
  }
  return { ok: true, written: targetPath, kind };
}

// ─────────────────────────────────────────────────────────────────────────────
// runToolUseCapture — the `tool-use` capture path (spec Migration Path step
// 5a). Ports the ~180-line inline-Node program formerly living in
// hooks/session-capture.sh verbatim: appends one JSONL line to
// `.context-index/.session-tracking.jsonl` when the resolved provider is
// "native". Entry schema and key INSERTION ORDER are byte-compatible with
// the pre-refactor shell writer (verified by unit tests against fixtures
// captured from the real shell writer's output):
//   tool, files, timestamp, session_id? (conditional), operator,
//   issue? (conditional), epic? (conditional), usage? (conditional; nested
//   object ordered input_tokens, output_tokens, cache_read_tokens,
//   cache_creation_tokens, cost_usd).
//
// This is a deliberate byte-for-byte port, not a rewrite: it intentionally
// keeps the pre-existing loose regexes (`/provider:\s*(\S+)/`,
// `/backend:\s*(\S+)/`), the unescaped interpolation of `entry.issue` into
// the epic-lookup RegExp, and the unvalidated
// `entry.issue = String(state.issueBinding)` assignment. This is NOT the
// same resolver as `resolveExecutionStateBinding()` above — that function
// serves the session-end/pre-compact path only, uses a different lookahead
// (`(?=\n### |$)` vs this function's `(?=###|$)`), validates issue/epic ids,
// and has no beads/`.beads-map.json` branch. Do not conflate the two.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} args
 * @param {object} args.payload - Parsed PostToolUse stdin JSON (tool_name, tool_input, session_id, provider?).
 * @param {string} args.projectRoot - Absolute path to the project root (the hook's cwd).
 * @returns {Promise<{ written: boolean, entry: object|null }>}
 */
export async function runToolUseCapture({ payload, projectRoot }) {
  const input = payload && typeof payload === "object" ? payload : {};

  // Resolve provider: prefer payload, fall back to manifest.yaml.
  let provider = input.provider || "";
  if (!provider) {
    try {
      const manifest = readFileSync(join(projectRoot, ".context-index", "manifest.yaml"), "utf8");
      const m = manifest.match(/provider:\s*(\S+)/);
      if (m) provider = m[1];
    } catch {}
  }

  if (provider !== "native") {
    return { written: false, entry: null };
  }

  // Extract fields from stdin JSON (PostToolUse protocol)
  const toolName = input.tool_name || "";
  if (!toolName) {
    return { written: false, entry: null };
  }
  const filePath = (input.tool_input && input.tool_input.file_path) || "";
  const sessionId = input.session_id || "";

  const entry = {
    tool: toolName,
    files: filePath ? [filePath] : [],
    timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  };
  if (sessionId) entry.session_id = sessionId;

  // Build operator identity: $USER/local or $USER/remote
  const osUser = process.env.USER || process.env.USERNAME || "unknown";
  const isRemote = process.env.CLAUDE_CODE_REMOTE === "true";
  entry.operator = osUser + "/" + (isRemote ? "remote" : "local");

  // Enrich with issue/epic from execution state (if active). Goes through
  // readSharedExecutionState so a linked worktree reads the same file the
  // writer wrote, not a worktree-local shadow copy.
  try {
    const state = await readSharedExecutionState(projectRoot);
    if (state && state.status === "active") {
      if (state.issueBinding) entry.issue = String(state.issueBinding);
      {
        // Extract epic from issue board if issue is bound
        // Supports both file and beads backends
        if (entry.issue) {
          try {
            let backend = "file";
            try {
              const manifest = readFileSync(join(projectRoot, ".context-index", "manifest.yaml"), "utf8");
              const bm = manifest.match(/backend:\s*(\S+)/);
              if (bm) backend = bm[1];
            } catch {}

            if (backend === "beads") {
              // beads backend: the board lives entirely in beads, so the
              // issue→epic link comes from br itself. The `.beads-map.json`
              // sidecar this used to read no longer exists — it was the second
              // source of truth that let the claim gate fail open.
              //
              // Read-only and best-effort by construction: `checkBr: false`
              // skips the `br --version` spawn, `autoMigrate: false` keeps a
              // hook from ever writing, and any failure (br absent, no
              // workspace) falls through to the tasks.md fallback below —
              // exactly the degradation the sidecar read had.
              try {
                const { BeadsAdapter } = await import("./issues/beads-adapter.mjs");
                const adapter = new BeadsAdapter(projectRoot, {
                  checkBr: false,
                  autoMigrate: false,
                });
                const issue = await adapter.get(entry.issue);
                if (issue && issue.epicId) entry.epic = issue.epicId;
              } catch {}
              // Fallback: check the legacy local board if beads has no answer
              if (!entry.epic) {
                try {
                  const boardPath = join(projectRoot, ".context-index", "tasks", "tasks.md");
                  const board = readFileSync(boardPath, "utf8");
                  const issueBlock = board.match(new RegExp("###\\s+" + entry.issue + "[\\s\\S]*?(?=###|$)"));
                  if (issueBlock) {
                    const epicM = issueBlock[0].match(/epicId:\s*(\S+)/);
                    if (epicM && epicM[1]) entry.epic = epicM[1];
                  }
                } catch {}
              }
            } else {
              // file backend: read tasks.md directly
              const boardPath = join(projectRoot, ".context-index", "tasks", "tasks.md");
              const board = readFileSync(boardPath, "utf8");
              const issueBlock = board.match(new RegExp("###\\s+" + entry.issue + "[\\s\\S]*?(?=###|$)"));
              if (issueBlock) {
                const epicM = issueBlock[0].match(/epicId:\s*(\S+)/);
                if (epicM && epicM[1]) entry.epic = epicM[1];
              }
            }
          } catch {}
        }
      }
    }
  } catch {}

  // ── Token usage enrichment (graceful degradation) ──
  try {
    const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || "";
    if (pluginRoot && sessionId) {
      const [{ resolveSessionUsage }, { readCursor, writeCursor, resetCursor }, { computeCost }] = await Promise.all([
        import("./session-file-reader.mjs"),
        import("./token-cursor.mjs"),
        import("./token-pricing.mjs"),
      ]);

      const cwd = projectRoot;
      const encoded = cwd.replace(/\//g, "-");
      const sessionFile = join(homedir(), ".claude", "projects", encoded, sessionId + ".jsonl");

      let fileSize = 0;
      try { fileSize = statSync(sessionFile).size; } catch {}

      const cursor = readCursor(cwd);
      const needsReset = !cursor
        || cursor.session_id !== sessionId
        || cursor.last_offset > fileSize;

      if (needsReset) {
        resetCursor(cwd, sessionId, fileSize);
        // No usage for this entry — no prior baseline to compute delta from
      } else {
        const usage = resolveSessionUsage({
          sessionId,
          projectDir: cwd,
          fromOffset: cursor.last_offset,
        });

        if (usage) {
          const costUsd = computeCost(usage.model, {
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            cacheReadTokens: usage.cacheReadTokens,
            cacheCreationTokens: usage.cacheCreationTokens,
          });

          entry.usage = {
            input_tokens: usage.inputTokens,
            output_tokens: usage.outputTokens,
            cache_read_tokens: usage.cacheReadTokens,
            cache_creation_tokens: usage.cacheCreationTokens,
            cost_usd: costUsd,
          };

          const newCum = {
            input_tokens: (cursor.cumulative?.input_tokens || 0) + usage.inputTokens,
            output_tokens: (cursor.cumulative?.output_tokens || 0) + usage.outputTokens,
            cache_read_tokens: (cursor.cumulative?.cache_read_tokens || 0) + usage.cacheReadTokens,
            cache_creation_tokens: (cursor.cumulative?.cache_creation_tokens || 0) + usage.cacheCreationTokens,
          };

          writeCursor(cwd, {
            session_id: sessionId,
            last_offset: fileSize,
            cumulative: newCum,
            format_warning_emitted: cursor.format_warning_emitted || false,
          });
        }
      }
    }
  } catch {
    // Graceful degradation — entry is written without usage
  }

  // Ensure directory and append
  const dir = join(projectRoot, ".context-index");
  const file = join(dir, ".session-tracking.jsonl");
  mkdirSync(dir, { recursive: true });
  appendFileSync(file, JSON.stringify(entry) + "\n");

  return { written: true, entry };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI entry point — invoked directly by bash wrappers (`hooks/session-end.sh`
// and `hooks/pre-compact.sh`). Reads JSON payload from stdin, dispatches to
// `runCapture()`. Always exits 0 (Principle 4 / fail-safe).
//
//   node lib/session-capture.mjs --event session-end < payload.json
//   node lib/session-capture.mjs --event pre-compact < payload.json
// ─────────────────────────────────────────────────────────────────────────────

function parseEventArg(argv) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--event" && i + 1 < argv.length) {
      return argv[i + 1];
    }
  }
  return null;
}

async function readStdin() {
  return new Promise((resolve) => {
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      buf += chunk;
    });
    process.stdin.on("end", () => resolve(buf));
    process.stdin.on("error", () => resolve(buf));
  });
}

// Detect direct invocation (vs. `import` from another module).
// Use the resolved path comparison to avoid false positives in tests.
const isMain = (() => {
  try {
    const url = new URL(import.meta.url);
    return process.argv[1] && url.pathname === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
})();

if (isMain) {
  const event = parseEventArg(process.argv.slice(2));
  if (!event) {
    emitDiagnostic("payload-error", { subject: "event" });
    process.exit(0);
  }
  const raw = await readStdin();
  let payload = null;
  let parseFailed = false;
  if (raw && raw.trim().length > 0) {
    try {
      payload = JSON.parse(raw);
    } catch {
      parseFailed = true;
    }
  }

  if (event === "tool-use") {
    // Matches the pre-refactor inline program's
    // `try { input = JSON.parse(d); } catch {}` — malformed/absent stdin
    // degrades to an empty payload rather than a fatal parse-error, and the
    // hook protocol's '{}' stdout is always emitted (PostToolUse contract),
    // even if the helper throws.
    try {
      await runToolUseCapture({ payload: payload || {}, projectRoot: process.cwd() });
    } catch {
      // Defensive — runToolUseCapture is contracted to never throw, but be safe.
    }
    process.stdout.write("{}\n");
    process.exit(0);
  }

  if (parseFailed) {
    emitDiagnostic("parse-error", { subject: "stdin" });
    process.exit(0);
  }

  // Resolve projectRoot: prefer CLAUDE_PROJECT_DIR, fall back to payload.cwd,
  // then process.cwd().
  const projectRoot =
    process.env.CLAUDE_PROJECT_DIR ||
    (payload && typeof payload.cwd === "string" ? payload.cwd : process.cwd());
  try {
    await runCapture({ event, payload, projectRoot });
  } catch {
    // Defensive — runCapture is contracted to never throw, but be safe.
  }
  process.exit(0);
}
