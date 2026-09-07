/**
 * Session summary persistence — write and read structured markdown
 * session summaries with YAML frontmatter.
 *
 * Uses only Node.js built-ins (fs/promises, fs, path, os, crypto).
 * Pure ESM, named exports.
 */

import { mkdir, writeFile, readFile, access } from "fs/promises";
import { existsSync } from "fs";
import { homedir } from "os";
import { dirname, isAbsolute, join, resolve, sep } from "path";
import { createHash } from "crypto";

// ─────────────────────────────────────────────────────────────────────────────
// redactSecrets — SEC-1, SEC-9: scrub secrets before they are rendered into
// the session summary markdown body. Order matters: PEM blocks are processed
// first because they are multiline containers that may include narrower
// secret patterns inside.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Out-of-repo absolute-path redaction (issue adev-plugin-3v2i).
//
// Transcripts routinely name absolute paths belonging to OTHER checkouts
// (`/Users/<user>/Development/<other-client-repo>/...`) and to scratchpads
// (`/private/tmp/...`). Those summaries are committed, so an unrelated
// organisation's name can reach a public repository through a path alone —
// which is exactly what happened on 2026-08-13.
//
// Policy:
//   - Paths that resolve INSIDE the project root are preserved verbatim: they
//     are the useful signal of the summary, and they contain nothing the repo
//     does not already publish.
//   - Paths outside the project root are redacted to `[REDACTED:path]` ONLY
//     when they start with a high-risk prefix (below). This is deliberately a
//     prefix-scoped deny-list rather than "redact every absolute path":
//     `/usr/bin/node`, `/etc/hosts` and friends carry no tenant identity and
//     are preserved by construction, with no allow-list to maintain.
//   - `~/...` is expanded against the running user's home directory and then
//     put through the same containment test, so `~/dev/this-repo/lib/x.mjs`
//     survives while `~/Development/AcmeCorp/...` does not.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Absolute-path prefixes that can carry tenant/organisation identity. Every
 * entry ends with a separator so that `/varnish-notes` is not treated as
 * `/var`. The running user's home directory is appended dynamically — it is
 * the highest-risk prefix and is not always under `/Users` or `/home`.
 */
const SENSITIVE_PATH_PREFIXES = [
  "/Users/", // macOS home dirs
  "/home/", // Linux home dirs
  "/root/", // Linux root home
  "/var/", // /var/folders/... (macOS temp), /var/tmp
  "/private/", // macOS realpath of /tmp and /var
  "/tmp/", // scratchpads
  "/Volumes/", // mounted external / secondary checkouts
  "/mnt/", // Linux + WSL mounts
  "/media/", // removable media
  "/srv/", // service checkouts
  "/workspace/", // CI container checkouts
  "/workspaces/", // devcontainers / Codespaces
];

/** Characters accepted inside a single path segment. */
const PATH_SEGMENT = "[A-Za-z0-9._+@%$~-]+";

/**
 * POSIX absolute paths and `~`-rooted paths.
 *
 * The lookbehind rejects a `/` that is preceded by a word character, another
 * separator, `:`, `.`, `~` or `@`, so URLs (`https://host/Users/x`), relative
 * paths (`../Users/x`) and date-like `2026/08/14` runs are never treated as
 * the start of an absolute path.
 */
const POSIX_PATH_RE = new RegExp(
  `(?<![A-Za-z0-9_:/.~@\\\\-])(?:~|(?=/))(?:/${PATH_SEGMENT})+/?`,
  "g",
);

/**
 * Windows user-data paths: `<drive>:\Users\...` and UNC `\\server\share\...`.
 * Deliberately narrow — `C:\Windows\System32` is the Windows analogue of
 * `/usr/bin` and carries no identity, so it is left alone.
 */
const WINDOWS_PATH_RE = new RegExp(
  `(?<![A-Za-z0-9_:/.\\\\-])(?:[A-Za-z]:\\\\Users\\\\|\\\\\\\\${PATH_SEGMENT}\\\\)(?:${PATH_SEGMENT}\\\\)*(?:${PATH_SEGMENT})?`,
  "gi",
);

/** Memoised `os.homedir()` — never throws. */
let homedirCache;
function safeHomedir() {
  if (homedirCache === undefined) {
    try {
      const h = homedir();
      homedirCache = typeof h === "string" && h.length > 0 ? h : null;
    } catch {
      homedirCache = null;
    }
  }
  return homedirCache;
}

/** Memoised default project root, keyed on the input it was derived from. */
let defaultRootCache = null;

/**
 * Best-effort project-root discovery for callers that do not pass one.
 *
 * Precedence mirrors `hooks/session-end.sh`: `CLAUDE_PROJECT_DIR` when it is
 * absolute, otherwise `process.cwd()`; from that starting point we walk up to
 * the nearest `.git` so that being invoked from a subdirectory still yields
 * the repository root. Returns null when nothing can be resolved.
 *
 * @returns {string|null}
 */
function resolveDefaultProjectRoot() {
  let start;
  try {
    const envDir = process.env.CLAUDE_PROJECT_DIR;
    start =
      typeof envDir === "string" && envDir.length > 0 && isAbsolute(envDir)
        ? envDir
        : process.cwd();
  } catch {
    return null; // cwd can throw when the directory has been removed
  }
  if (defaultRootCache && defaultRootCache.key === start) {
    return defaultRootCache.value;
  }

  let dir;
  try {
    dir = resolve(start);
  } catch {
    return null;
  }
  let found = null;
  for (let i = 0; i < 64; i++) {
    try {
      if (existsSync(join(dir, ".git"))) {
        found = dir;
        break;
      }
    } catch {
      // Unreadable ancestor — keep walking rather than failing the capture.
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  const value = found || resolve(start);
  defaultRootCache = { key: start, value };
  return value;
}

/**
 * Validate a project root before it is used to EXEMPT paths from redaction.
 *
 * A root that is the user's home directory — or any ancestor of it, including
 * `/` — would mark every path under the home directory as "in repo" and turn
 * this redactor into a no-op. That is the one failure mode that leaks, so such
 * roots are rejected: with a null root nothing is exempt and every high-risk
 * path is redacted (fail closed).
 *
 * @param {*} root
 * @returns {string|null}
 */
function sanitizeProjectRoot(root) {
  if (typeof root !== "string" || root.length === 0) return null;
  let resolved;
  try {
    resolved = resolve(root);
  } catch {
    return null;
  }
  if (!isAbsolute(resolved) && !/^[A-Za-z]:/.test(resolved)) return null;
  if (resolved === sep || resolved === "/") return null;
  const home = safeHomedir();
  if (home) {
    const homeResolved = resolve(home);
    if (homeResolved === resolved || homeResolved.startsWith(resolved + sep)) {
      return null;
    }
  }
  return resolved;
}

/**
 * True when `candidate` is the project root or lives beneath it.
 * `..` segments are collapsed first, so `<root>/../elsewhere/x` is correctly
 * treated as OUTSIDE the root.
 *
 * @param {string} candidate
 * @param {string|null} projectRoot
 * @returns {boolean}
 */
function isInsideRoot(candidate, projectRoot) {
  if (!projectRoot) return false;
  const windowsShaped = /^[A-Za-z]:[\\/]/.test(candidate) || candidate.startsWith("\\\\");
  if (windowsShaped) {
    // Windows paths are compared as case-insensitive strings: `path.resolve`
    // on a POSIX host would mangle them.
    const a = candidate.toLowerCase().replace(/\//g, "\\");
    const b = projectRoot.toLowerCase().replace(/\//g, "\\");
    return a === b || a.startsWith(b.endsWith("\\") ? b : `${b}\\`);
  }
  let target;
  try {
    target = resolve(candidate);
  } catch {
    return false;
  }
  return target === projectRoot || target.startsWith(projectRoot + sep);
}

/**
 * True when `candidate` starts with one of the high-risk prefixes (or the
 * running user's home directory).
 * @param {string} candidate
 * @returns {boolean}
 */
function isSensitivePath(candidate) {
  for (const prefix of SENSITIVE_PATH_PREFIXES) {
    if (candidate.startsWith(prefix)) return true;
  }
  const home = safeHomedir();
  if (home && (candidate === home || candidate.startsWith(home + sep))) {
    return true;
  }
  return false;
}

/**
 * Build the replacer used by the POSIX path pattern.
 * @param {string|null} projectRoot
 * @returns {(match: string) => string}
 */
function makePosixPathRedactor(projectRoot) {
  return (match) => {
    // `.` is a legal segment character, so a trailing sentence period ends up
    // inside the match. Split it off and re-append it after the placeholder.
    const stripped = match.replace(/\.+$/, "");
    if (stripped.length === 0 || stripped === "~") return match;
    const trailing = match.slice(stripped.length);

    let candidate = stripped;
    if (candidate.startsWith("~")) {
      const home = safeHomedir();
      // Unknown home directory → cannot prove the path is in-repo → redact.
      if (!home) return `[REDACTED:path]${trailing}`;
      candidate = home + candidate.slice(1);
    }

    if (isInsideRoot(candidate, projectRoot)) return match;
    if (!isSensitivePath(candidate)) return match;
    return `[REDACTED:path]${trailing}`;
  };
}

/**
 * Build the replacer used by the Windows path pattern.
 * @param {string|null} projectRoot
 * @returns {(match: string) => string}
 */
function makeWindowsPathRedactor(projectRoot) {
  return (match) => {
    const stripped = match.replace(/\.+$/, "");
    if (stripped.length === 0) return match;
    const trailing = match.slice(stripped.length);
    if (isInsideRoot(stripped, projectRoot)) return match;
    return `[REDACTED:path]${trailing}`;
  };
}

const REDACTION_PATTERNS = [
  // PEM private-key blocks (multiline). Process first.
  {
    re: /-----BEGIN (RSA |EC |OPENSSH |DSA |PGP |ENCRYPTED )?PRIVATE KEY-----[\s\S]*?-----END \1?PRIVATE KEY-----/g,
    replacement: "[REDACTED:private-key]",
  },
  // AWS access keys
  { re: /AKIA[A-Z0-9]{16}/g, replacement: "[REDACTED:aws-access-key]" },
  // GitHub tokens (ghp_, gho_, ghs_, ghr_, ghu_)
  {
    re: /gh[pousr]_[A-Za-z0-9]{36,}/g,
    replacement: "[REDACTED:github-token]",
  },
  // OpenAI / Anthropic sk- keys (hyphen separator; sk-ant-… included)
  {
    re: /sk-(?:ant-)?[A-Za-z0-9_-]{20,}/g,
    replacement: "[REDACTED:llm-key]",
  },
  // Stripe sk_live_ / sk_test_ keys (underscore separator; do NOT collapse
  // with the LLM-key pattern)
  {
    re: /sk_(?:live|test)_[0-9A-Za-z]{24,}/g,
    replacement: "[REDACTED:stripe-key]",
  },
  // Slack tokens (xoxa, xoxb, xoxp, xoxr, xoxs)
  {
    re: /xox[abprs]-[0-9A-Za-z-]+/g,
    replacement: "[REDACTED:slack-token]",
  },
  // Google API keys
  { re: /AIza[0-9A-Za-z_-]{35}/g, replacement: "[REDACTED:google-api-key]" },
  // Generic JWTs (three dot-separated base64-ish parts)
  {
    re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    replacement: "[REDACTED:jwt]",
  },
  // Authorization: Bearer headers (per spec SEC-1, the replacement collapses
  // both the "Bearer" keyword and the token into [REDACTED:bearer])
  {
    re: /Authorization:\s*Bearer\s+[A-Za-z0-9._-]+/gi,
    replacement: "Authorization: [REDACTED:bearer]",
  },
  // env-style KEY=VALUE secrets (api_key, token, secret, password, auth,
  // private_key — case-insensitive, hyphen or underscore separator).
  // Order: this runs LAST. We exclude `[REDACTED:...]` placeholders so that
  // values already redacted by an earlier (more specific) pattern are not
  // re-mangled into the generic env-secret token.
  {
    re: /(?<head>(?:^|[^A-Za-z0-9_])(?:api[_-]?key|token|secret|password|auth|private[_-]?key)\s*=\s*)(?!\[REDACTED:)\S+/gi,
    replacement: "$<head>[REDACTED:env-secret]",
  },
  // Out-of-repo absolute paths. These run AFTER every secret pattern, for two
  // reasons:
  //   1. A secret embedded in a path (`/Users/x/proj/token=abc123`) must be
  //      collapsed by the env-secret pattern FIRST. If the path pattern ran
  //      first it would consume `/Users/x/proj/token` (`=` is not a segment
  //      character), destroying the `token=` anchor and leaving `abc123` in
  //      the clear.
  //   2. PEM and JWT bodies contain `/`; by the time these run, those payloads
  //      are already `[REDACTED:…]` placeholders and cannot be re-matched.
  // The `[REDACTED:…]` placeholders themselves contain no separator, so
  // (unlike the env-secret pattern) no explicit placeholder guard is required.
  {
    re: POSIX_PATH_RE,
    replacementFor: makePosixPathRedactor,
  },
  {
    re: WINDOWS_PATH_RE,
    replacementFor: makeWindowsPathRedactor,
  },
];

/**
 * Redact secrets in arbitrary text. Applies a fixed ordered list of regexes
 * matching common secret shapes, then redacts absolute paths that fall outside
 * the project root. Returns the input unchanged when no pattern matches.
 * Non-string input becomes the empty string (graceful degradation; the caller
 * is responsible for invariant preservation upstream).
 *
 * The second parameter is optional and additive — the one-argument call used
 * by every existing caller keeps working and resolves the project root itself.
 *
 * @param {string} text
 * @param {object} [opts]
 * @param {string} [opts.projectRoot] - Containment root for path redaction.
 *   Defaults to `CLAUDE_PROJECT_DIR` / nearest `.git` ancestor of `cwd`.
 * @returns {string}
 */
export function redactSecrets(text, opts = {}) {
  if (typeof text !== "string") return "";
  const requested =
    typeof opts?.projectRoot === "string" && opts.projectRoot.length > 0
      ? opts.projectRoot
      : resolveDefaultProjectRoot();
  const projectRoot = sanitizeProjectRoot(requested);

  let out = text;
  for (const { re, replacement, replacementFor } of REDACTION_PATTERNS) {
    const value = replacementFor ? replacementFor(projectRoot) : replacement;
    out = out.replace(re, value);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// fromTranscript — read a Claude Code transcript JSONL and render the
// session-summary markdown body. Applies redactSecrets unconditionally.
// Returns kind: 'session-end' on success; kind: 'placeholder' on any failure
// (filesystem, parse, empty). Never throws.
//
// Optional metadata fields extracted from the transcript:
//   - inputTokens  (Number.isInteger, 0 ≤ v < 1e9)
//   - outputTokens (Number.isInteger, 0 ≤ v < 1e9)
//   - costUsd      (Number.isFinite, 0 ≤ v < 1e6, 4 decimals)
//   - model        (^[A-Za-z0-9._-]{1,64}$)
// Validation failures OMIT the field from metadata; required keys
// (kind, session_id, date) are unaffected.
// ─────────────────────────────────────────────────────────────────────────────

function validateInputTokens(v) {
  return Number.isInteger(v) && v >= 0 && v < 1e9 ? v : undefined;
}
function validateOutputTokens(v) {
  return Number.isInteger(v) && v >= 0 && v < 1e9 ? v : undefined;
}
function validateCostUsd(v) {
  return Number.isFinite(v) && v >= 0 && v < 1e6 ? Number(v.toFixed(4)) : undefined;
}
const MODEL_RE = /^[A-Za-z0-9._-]{1,64}$/;
function validateModel(v) {
  return typeof v === "string" && MODEL_RE.test(v) ? v : undefined;
}

function extractMessageText(line) {
  // Claude Code transcript JSONL has multiple shapes. Try common ones; missing
  // shapes contribute nothing (silent skip).
  if (!line || typeof line !== "object") return null;
  // Shape A: { role, message: { content } }
  const msg = line.message;
  if (msg && typeof msg.content === "string") return msg.content;
  if (msg && Array.isArray(msg.content)) {
    // content blocks — string-block items have a `text` field
    return msg.content
      .map((b) => (typeof b === "string" ? b : b?.text))
      .filter(Boolean)
      .join("\n");
  }
  // Shape B: top-level { role, content }
  if (typeof line.content === "string") return line.content;
  return null;
}

function extractRole(line) {
  if (!line || typeof line !== "object") return null;
  if (typeof line.role === "string") return line.role;
  if (line.message && typeof line.message.role === "string") return line.message.role;
  if (line.type === "user" || line.type === "assistant") return line.type;
  return null;
}

function extractUsage(line) {
  const usage = line?.message?.usage || line?.usage;
  if (!usage || typeof usage !== "object") return null;
  return usage;
}

function extractModel(line) {
  return line?.message?.model || line?.model || null;
}

/**
 * Parse a transcript JSONL file and render a session-summary markdown body.
 * Always returns a result object — never throws.
 *
 * @param {string} transcriptPath
 * @param {object} [opts]
 * @param {string} [opts.projectRoot] - Containment root for path redaction.
 *   When omitted, `redactSecrets` resolves one itself. Callers that already
 *   know the project root (e.g. the validated `payload.cwd` in
 *   `lib/session-capture.mjs`) should pass it — it is authoritative, whereas
 *   the fallback is inferred.
 * @returns {Promise<{ kind: 'session-end' | 'placeholder', body: string, metadata?: object }>}
 */
export async function fromTranscript(transcriptPath, opts = {}) {
  let raw;
  try {
    raw = await readFile(transcriptPath, "utf8");
  } catch {
    return {
      kind: "placeholder",
      body: "_Transcript unavailable — placeholder summary._\n",
    };
  }

  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) {
    return {
      kind: "placeholder",
      body: "_Transcript empty — placeholder summary._\n",
    };
  }

  // Parse each line; collect role+text and usage metadata. Tolerate parse
  // failures per line (skip silently) so a single bad line does not poison
  // the whole transcript.
  const turns = [];
  const modelCounts = new Map();
  let lastModel = null;
  let inputTokens = 0;
  let outputTokens = 0;
  let costUsd = 0;
  let anyParsed = false;

  for (const lineText of lines) {
    let parsed;
    try {
      parsed = JSON.parse(lineText);
    } catch {
      continue; // tolerate malformed line
    }
    anyParsed = true;

    const role = extractRole(parsed);
    const text = extractMessageText(parsed);
    if (role && text) turns.push({ role, text });

    const usage = extractUsage(parsed);
    if (usage) {
      if (typeof usage.input_tokens === "number") {
        inputTokens += usage.input_tokens;
      }
      if (typeof usage.output_tokens === "number") {
        outputTokens += usage.output_tokens;
      }
      if (typeof usage.cost_usd === "number") {
        costUsd += usage.cost_usd;
      }
    }

    const model = extractModel(parsed);
    if (model && typeof model === "string") {
      modelCounts.set(model, (modelCounts.get(model) || 0) + 1);
      lastModel = model;
    }
  }

  if (!anyParsed) {
    return {
      kind: "placeholder",
      body: "_Transcript could not be parsed — placeholder summary._\n",
    };
  }

  // Render the markdown body with redaction applied per turn.
  const redactOpts = { projectRoot: opts?.projectRoot };
  const bodyLines = ["## Conversation", ""];
  for (const t of turns) {
    const redacted = redactSecrets(t.text, redactOpts);
    bodyLines.push(`### ${t.role}`, "", redacted, "");
  }
  const body = bodyLines.join("\n");

  // Resolve most-frequent model (ties broken by last-used).
  let bestModel = null;
  let bestCount = -1;
  for (const [m, c] of modelCounts) {
    if (c > bestCount || (c === bestCount && m === lastModel)) {
      bestModel = m;
      bestCount = c;
    }
  }

  // Validate optional metadata fields per SEC-12/SEC-13.
  const metadata = {};
  const it = validateInputTokens(inputTokens);
  if (it !== undefined && it > 0) metadata.inputTokens = it;
  const ot = validateOutputTokens(outputTokens);
  if (ot !== undefined && ot > 0) metadata.outputTokens = ot;
  const cu = validateCostUsd(costUsd);
  if (cu !== undefined && cu > 0) metadata.costUsd = cu;
  const mv = validateModel(bestModel);
  if (mv !== undefined) metadata.model = mv;

  return {
    kind: "session-end",
    body,
    metadata,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// deriveSpecsTouched — issue-564.
//
// `specs-touched` is the union of
//   (a) `.context-index/specs/**/*.spec.md` paths changed by the commit, and
//   (b) `Spec:` trailer values,
// de-duplicated and order-stable (changed paths first, then trailers).
//
// SEC — both inputs are UNTRUSTED. A commit (and therefore its trailers and its
// changed paths) can originate from a fetched, attacker-authored ref. Filtering
// is therefore an ALLOW-list, not a deny-list: a candidate must match a positive
// spec-path shape AND resolve inside `<projectRoot>/.context-index/specs/`.
// Rejecting only `..` and leading `/` would let e.g. `.git/hooks/x` through for
// downstream consumers to resolve. Rejected entries are silently dropped —
// this runs on the post-commit path and a capture failure must never fail
// someone's commit, nor emit noise for the (correct, common) empty result.
// ─────────────────────────────────────────────────────────────────────────────

/** Repo-relative containment root for spec files. */
const SPECS_SUBDIR = join(".context-index", "specs");

/**
 * Positive shape match. Deliberately narrow: only `.spec.md` leaves count.
 * Sibling lifecycle artifacts under the same tree (`.plan.md`, `.review.md`,
 * `.validate.md`, `.routing.json`) are NOT specs and must not be reported.
 */
const SPEC_PATH_RE =
  /^\.context-index\/specs\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.spec\.md$/;

/** Upper bound on entries. Precedent: MAX_NOTES_BYTES in lib/lifecycle-state.mjs. */
const MAX_SPECS_TOUCHED = 64;

/**
 * Upper bound on a single entry, in bytes. Over-length entries are REJECTED,
 * never truncated — a truncated path is a *wrong* path, which is worse than
 * an absent one.
 */
const MAX_SPEC_PATH_BYTES = 512;

/**
 * True when `value` contains any C0 control character or DEL — NUL, CR/LF, and
 * the unit separator used as the `Spec:` trailer delimiter among them. Written
 * as an explicit scan rather than a regex so the source carries no literal
 * control bytes.
 * @param {string} value
 * @returns {boolean}
 */
function hasControlChar(value) {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * Normalise and validate one spec-path candidate.
 * Returns the cleaned repo-relative path, or `null` when the candidate is
 * rejected. Never throws.
 *
 * @param {*} raw
 * @param {string} projectRoot
 * @returns {string|null}
 */
function normalizeSpecCandidate(raw, projectRoot) {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (Buffer.byteLength(trimmed, "utf8") > MAX_SPEC_PATH_BYTES) return null;
  // Control characters (NUL, newline, the unit separator used as the trailer
  // delimiter, …) cannot occur in a legitimate spec path and would corrupt
  // downstream consumers that re-split the value.
  if (hasControlChar(trimmed)) return null;
  // `specs-touched` is repo-relative by contract; absolute paths (POSIX and
  // Windows drive/UNC forms) are dropped rather than resolved.
  if (isAbsolute(trimmed) || /^[A-Za-z]:/.test(trimmed)) return null;
  // Backslashes are rejected outright rather than folded to `/`: git reports
  // separators as `/` on every platform, and folding would let a POSIX file
  // genuinely named `a\b.spec.md` be reported under the *wrong* path `a/b.spec.md`.
  if (trimmed.includes("\\")) return null;

  // Normalise: strip any leading `./` segments.
  const cleaned = trimmed.replace(/^(?:\.\/)+/, "");
  if (!SPEC_PATH_RE.test(cleaned)) return null;
  // `..` matches the shape regex's segment class, so reject it explicitly in
  // addition to the resolution check below.
  if (cleaned.split("/").includes("..")) return null;

  // Resolution-based containment. Mirrors `lib/partial-artifact.mjs::assertWithin`
  // (the canonical pattern in this codebase), inlined rather than imported:
  // this module is loaded by `.githooks/post-commit`, whose node block discards
  // stderr, so a load-time throw from a transitive import would make every
  // capture vanish silently. Keeping the dependency surface to Node built-ins
  // (see the module header) is load-bearing here.
  const base = resolve(projectRoot, SPECS_SUBDIR);
  const target = resolve(projectRoot, cleaned);
  if (target !== base && !target.startsWith(base + sep)) return null;

  return cleaned;
}

/**
 * Coerce a candidate list input into an array of strings.
 * Accepts an array, or a newline-delimited string. (The caller is responsible
 * for splitting a `Spec:` trailer batch on its own delimiter — see
 * `.githooks/post-commit`.)
 * @param {*} input
 * @returns {string[]}
 */
function toCandidateList(input) {
  if (Array.isArray(input)) return input;
  if (typeof input === "string") return input.split(String.fromCharCode(10));
  return [];
}

/**
 * Derive the `specs-touched` metadata value for a commit.
 *
 * @param {object} [opts]
 * @param {string[]|string} [opts.changedFiles] - Paths changed by the commit.
 * @param {string[]|string} [opts.trailers]     - `Spec:` trailer values.
 * @param {string} [opts.projectRoot]           - Containment root (repo root).
 * @returns {string[]} De-duplicated repo-relative `*.spec.md` paths.
 */
export function deriveSpecsTouched({
  changedFiles = [],
  trailers = [],
  projectRoot = process.cwd(),
} = {}) {
  const out = [];
  const seen = new Set();

  const push = (raw) => {
    // Over-count → truncate to the first N deterministically (rather than
    // dropping the whole list, which would lose real signal).
    if (out.length >= MAX_SPECS_TOUCHED) return;
    const value = normalizeSpecCandidate(raw, projectRoot);
    if (value === null || seen.has(value)) return;
    seen.add(value);
    out.push(value);
  };

  for (const candidate of toCandidateList(changedFiles)) push(candidate);
  for (const candidate of toCandidateList(trailers)) push(candidate);

  return out;
}

/**
 * Convert a camelCase key to kebab-case.
 * @param {string} key
 * @returns {string}
 */
function toKebab(key) {
  return key.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

/**
 * Convert a kebab-case key to camelCase.
 * @param {string} key
 * @returns {string}
 */
function toCamel(key) {
  return key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * Escape a string for YAML double-quoted scalar style.
 * Order matters: backslashes must be doubled first, otherwise the
 * backslashes introduced by the later replacements would themselves be
 * re-escaped. @see unescapeYamlDoubleQuoted for the inverse.
 * @param {string} value
 * @returns {string}
 */
function escapeYamlDoubleQuoted(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

/**
 * Quote a single YAML flow-sequence item using double-quoted scalar style.
 * Array items (e.g. `specsTouched`) can carry attacker-influenced content
 * (a `Spec:` git trailer value) — quoting + escaping prevents that content
 * from breaking the flow-sequence syntax (via `,`/`]`) or the frontmatter
 * fence (via a literal newline), and keeps the value inert as data.
 * @param {*} value
 * @returns {string}
 */
function yamlQuoteScalar(value) {
  return `"${escapeYamlDoubleQuoted(value)}"`;
}

/**
 * Serialize a metadata value for YAML frontmatter.
 * Arrays become YAML flow sequences of double-quoted scalars (SEC: array
 * items may carry attacker-influenced content and must not be emitted raw);
 * everything else is a plain scalar (existing fields — date/type/mode/agent/
 * numeric metrics — are hook-controlled constants, not attacker input).
 * @param {*} value
 * @returns {string}
 */
function yamlValue(value) {
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return `[${value.map(yamlQuoteScalar).join(", ")}]`;
  }
  return String(value);
}

/**
 * Build the markdown content for a session summary.
 * @param {string} condensed - The condensed transcript / content body.
 * @param {object} metadata - Metadata fields (camelCase keys).
 * @returns {string}
 */
function buildMarkdown(condensed, metadata) {
  const frontmatterLines = ["---"];
  for (const [key, value] of Object.entries(metadata)) {
    frontmatterLines.push(`${toKebab(key)}: ${yamlValue(value)}`);
  }
  frontmatterLines.push("---");

  return `${frontmatterLines.join("\n")}\n\n${condensed}\n`;
}

/**
 * Generate a short hash from the condensed content + timestamp.
 * @param {string} condensed
 * @returns {string} 7-char hex hash
 */
function shortHash(condensed) {
  return createHash("sha256")
    .update(condensed + Date.now())
    .digest("hex")
    .slice(0, 7);
}

/**
 * Check if a file exists.
 * @param {string} filePath
 * @returns {Promise<boolean>}
 */
async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Write a session summary to disk.
 *
 * File naming: `<date>-<short-hash>.md`
 * Duplicate names get a counter suffix (e.g., `-2.md`).
 * Creates outputDir if missing. Never throws — logs a warning on failure.
 *
 * SEC (issue adev-plugin-3v2i): the body is passed through `redactSecrets`
 * here, at the persistence chokepoint, not only in `fromTranscript`. The
 * git-derived capture path (`.githooks/post-commit`) assembles its own
 * `condensed` body — including the `Files touched:` line that carried the
 * 2026-08-13 leak — and calls this function directly, never touching
 * `fromTranscript`. Redacting on the way out covers every writer.
 * `redactSecrets` is idempotent (`[REDACTED:…]` placeholders are not
 * re-matched), so already-redacted bodies pass through unchanged.
 *
 * @param {string} condensed - The condensed session content.
 * @param {object} metadata - Session metadata (camelCase keys: date, type, mode, agent, specsTouched, commits).
 * @param {string} outputDir - Directory to write the summary file into.
 * @param {object} [opts]
 * @param {string} [opts.projectRoot] - Containment root for path redaction.
 * @returns {Promise<string|null>} The written file path, or null on failure.
 */
export async function writeSummary(condensed, metadata, outputDir, opts = {}) {
  try {
    await mkdir(outputDir, { recursive: true });

    const safeCondensed = redactSecrets(condensed, {
      projectRoot: opts?.projectRoot,
    });

    const date = metadata.date || new Date().toISOString().slice(0, 10);
    const hash = shortHash(safeCondensed);
    const baseName = `${date}-${hash}`;

    let fileName = `${baseName}.md`;
    let filePath = join(outputDir, fileName);
    let counter = 1;

    while (await fileExists(filePath)) {
      counter += 1;
      fileName = `${baseName}-${counter}.md`;
      filePath = join(outputDir, fileName);
    }

    const markdown = buildMarkdown(safeCondensed, metadata);
    await writeFile(filePath, markdown, "utf8");
    return filePath;
  } catch (err) {
    console.warn(`[session-summary] writeSummary failed: ${err.message}`);
    return null;
  }
}

/**
 * Inverse of escapeYamlDoubleQuoted. Order matters: this must undo the
 * escapes in the REVERSE order they were applied, so that a doubled
 * backslash from an originally-literal backslash is restored last (any
 * `\\` remaining after the other unescapes are genuine escaped backslashes).
 * @param {string} inner - Content between the double quotes.
 * @returns {string}
 */
function unescapeYamlDoubleQuoted(inner) {
  return inner
    .replace(/\\t/g, "\t")
    .replace(/\\r/g, "\r")
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

/**
 * Unquote a single YAML flow-sequence item. Double-quoted items (the
 * current writer's output) are unescaped; bare/unquoted items (legacy
 * writer output, or hand-authored fixtures) pass through trimmed —
 * preserves backward compatibility with pre-existing summary files.
 * @param {string} token
 * @returns {string}
 */
function unquoteYamlScalar(token) {
  const t = token.trim();
  if (t.length >= 2 && t[0] === '"' && t[t.length - 1] === '"') {
    return unescapeYamlDoubleQuoted(t.slice(1, -1));
  }
  return t;
}

/**
 * Split a YAML flow-sequence's inner content into items, respecting
 * double-quoted items so an escaped `,` or `]` inside a quoted item does
 * not prematurely split/terminate the sequence.
 * @param {string} inner - Content between `[` and `]`.
 * @returns {string[]}
 */
function splitYamlFlowSequence(inner) {
  const items = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === '"' && current[current.length - 1] !== "\\") {
      inQuotes = !inQuotes;
      current += c;
      continue;
    }
    if (c === "," && !inQuotes) {
      items.push(unquoteYamlScalar(current));
      current = "";
      continue;
    }
    current += c;
  }
  items.push(unquoteYamlScalar(current));
  return items;
}

/**
 * Parse simple YAML frontmatter from a markdown string.
 * Returns an object with kebab-case keys converted to camelCase.
 * @param {string} raw
 * @returns {{ metadata: object, body: string } | null}
 */
function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return null;

  const [, yamlBlock, body] = match;
  const metadata = {};

  for (const line of yamlBlock.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();

    // Parse YAML flow sequences
    if (value.startsWith("[") && value.endsWith("]")) {
      const inner = value.slice(1, -1).trim();
      value = inner.length === 0 ? [] : splitYamlFlowSequence(inner);
    }

    metadata[toCamel(key)] = value;
  }

  return { metadata, body: body.trim() };
}

/**
 * Parse content sections from the markdown body.
 * Looks for ## headings matching the known section names.
 * @param {string} body
 * @returns {object}
 */
function parseSections(body) {
  const sectionMap = {
    intent: "intent",
    outcome: "outcome",
    learnings: "learnings",
    friction: "friction",
    open_items: "openItems",
    "open items": "openItems",
  };

  const sections = {
    intent: null,
    outcome: null,
    learnings: null,
    friction: null,
    openItems: null,
  };

  // Split body by ## headings
  const parts = body.split(/^## /m);
  for (const part of parts) {
    if (!part.trim()) continue;
    const newlineIdx = part.indexOf("\n");
    if (newlineIdx === -1) continue;
    const heading = part.slice(0, newlineIdx).trim().toLowerCase();
    const content = part.slice(newlineIdx + 1).trim();

    const key = sectionMap[heading];
    if (key) {
      sections[key] = content || null;
    }
  }

  return sections;
}

/**
 * Read and parse a session summary file.
 *
 * Returns a structured object with metadata and content sections.
 * Returns null for non-existent files.
 * Returns a partial object for malformed files.
 *
 * @param {string} summaryPath - Absolute path to the summary markdown file.
 * @returns {Promise<{ metadata: object, content: object } | null>}
 */
export async function readSummary(summaryPath) {
  let raw;
  try {
    raw = await readFile(summaryPath, "utf8");
  } catch {
    return null;
  }

  const parsed = parseFrontmatter(raw);

  if (!parsed) {
    // Malformed — no valid frontmatter. Return partial object.
    return {
      metadata: {},
      content: parseSections(raw),
    };
  }

  return {
    metadata: parsed.metadata,
    content: parseSections(parsed.body),
  };
}
