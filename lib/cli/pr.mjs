// lib/cli/pr.mjs
//
// `adev pr body` — compose the PR review brief that lives between the
// `<!-- adev:pr-brief -->` markers in a pull request body.
//
// Spec: .context-index/specs/features/pr-review-brief/pr-body-composition.spec.md
//
// Subverbs:
//   adev pr body [--base <ref>] [--head <ref>]   print the brief to stdout
//
// The brief is five sections in a fixed order. Each section is produced by a
// renderer registered in SLOT_REGISTRY. A renderer takes the resolved context
// and returns `{ body, bytes }` — its own markdown (heading included, marker
// excluded) plus its own utf8 size. Assembly is the only component that sees
// every slot: it emits the marker pair, concatenates the bodies, and enforces
// the total-size ceiling. No renderer may check the total size.
//
// Two of the five slots (Size advisory, Reading order) are owned by the
// sibling `pr-body-advisories` spec and ship here as real renderers that emit
// their gap line. Swapping them in later is a one-line registry change.
//
// Exit codes:
//   0  success (including every degraded / missing-optional-input case)
//   1  NOT_A_GIT_REPO, INVALID_BASE_REF, NO_MERGE_BASE — the only three
//      conditions in brief generation that change the exit code — and,
//      outside brief generation, a usage error: a missing or unknown subverb
//      or a flag that fails to parse.
//
// This module never terminates the process; `run()` returns its exit code so the
// dispatcher owns process termination and the verb stays testable in-process.

import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";

/** Opening marker literal. Contractual — a rename here is a spec change. */
export const OPEN_MARKER = "<!-- adev:pr-brief -->";
/** Closing marker literal. Contractual — a rename here is a spec change. */
export const CLOSE_MARKER = "<!-- /adev:pr-brief -->";

/**
 * Total-size ceiling for the concatenated slot bodies, in utf8 bytes.
 * Assembly owns this. `pr-body-advisories` reuses this constant rather than
 * defining its own.
 */
export const MAX_BRIEF_BYTES = 32768;

const USAGE = "usage: adev pr body [--base <ref>] [--head <ref>]";

// Field separators for `git log` machine output. Git does NOT forbid these
// bytes in a commit message, so a crafted message can still inject a record
// boundary here — input containment is owned by the safety-substrate task, not
// by this separator choice.
const FIELD_SEP = "\x1f";
const RECORD_SEP = "\x1e";

// ---------------------------------------------------------------------------
// Git plumbing
// ---------------------------------------------------------------------------

/**
 * Run git with an argument array. Never a shell string — refs and trailer
 * values reach git as arguments, never as shell input.
 * @param {string[]} args
 * @param {string} cwd
 * @returns {string} stdout, trailing whitespace trimmed
 */
function git(args, cwd) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 32 * 1024 * 1024,
  }).trimEnd();
}

/** git(), but returns null instead of throwing. */
function tryGit(args, cwd) {
  try {
    return git(args, cwd);
  } catch {
    return null;
  }
}

/** Resolve a ref to a commit sha, or null if it does not resolve. */
function revParse(ref, cwd) {
  return tryGit(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], cwd);
}

/**
 * Candidate default branches, most authoritative first. A temp repo has no
 * remote, so origin/HEAD is tried but not required.
 */
function findDefaultBranch(cwd) {
  const symbolic = tryGit(["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"], cwd);
  const candidates = [symbolic, "origin/main", "origin/master", "main", "master"].filter(Boolean);
  for (const candidate of candidates) {
    if (revParse(candidate, cwd)) return candidate;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Resolved context
// ---------------------------------------------------------------------------

/**
 * @typedef {object} PrBriefCommit
 * @property {string} sha      full commit sha
 * @property {string} subject  first line of the commit message
 * @property {string} body     full raw commit message (trailers included)
 */

/**
 * @typedef {object} PrBriefChangedPath
 * @property {string} path            repo-relative path
 * @property {number|null} additions  null for binary files
 * @property {number|null} deletions  null for binary files
 */

/**
 * The resolved context every renderer draws from. Both slot owners read this
 * one structure; `pr-body-advisories` extends it rather than reshaping it.
 *
 * @typedef {object} PrBriefContext
 * @property {string} projectRoot                 absolute repo working directory
 * @property {string} repoRoot                    absolute git toplevel
 * @property {string} baseRef                     the base ref as named on the command line (or the resolved default branch)
 * @property {string} headRef                     the head ref as named on the command line
 * @property {string} base                        resolved base sha — determinism is specified over this
 * @property {string} head                        resolved head sha, or "" when the head ref did not resolve — in which case the cause is named in `degradations` and `commits`/`changedPaths` are empty. Renderers must not assume this is a sha.
 * @property {PrBriefCommit[]} commits            commits in base..head, newest first
 * @property {PrBriefChangedPath[]} changedPaths  changed paths with per-path additions/deletions
 * @property {string[]} degradations              named causes for any input that could not be obtained (Invariant 4)
 * @property {object|null} manifest               the loaded manifest, or null when absent
 */

/**
 * Resolve the (base, head) pair and gather the range inputs.
 *
 * Only three conditions produce `{ ok: false }`: NOT_A_GIT_REPO,
 * INVALID_BASE_REF, and NO_MERGE_BASE. Every other failure to obtain an input
 * is recorded on `context.degradations` and leaves the result ok (Invariant 4).
 *
 * @param {object} params
 * @param {string} params.projectRoot
 * @param {string|undefined} params.base
 * @param {string|undefined} params.head
 * @param {object|null} [params.manifest]
 * @returns {{ ok: true, context: PrBriefContext } | { ok: false, code: string, message: string }}
 */
export function resolvePrContext({ projectRoot, base, head, manifest = null }) {
  const repoRoot = tryGit(["rev-parse", "--show-toplevel"], projectRoot);
  if (!repoRoot) {
    return {
      ok: false,
      code: "NOT_A_GIT_REPO",
      message: `NOT_A_GIT_REPO: ${projectRoot} is not inside a git repository`,
    };
  }

  const degradations = [];

  const headRef = head === undefined ? "HEAD" : head;
  const headSha = revParse(headRef, projectRoot);
  if (!headSha) {
    // Not one of the three exit-code conditions: degrade, do not fail.
    degradations.push(`head ref "${headRef}" does not resolve`);
  }

  let baseRef;
  let baseSha;
  // Presence, not truthiness: `--base ""` is an explicit base that does not
  // resolve, so it must reach the INVALID_BASE_REF row rather than silently
  // falling through to the merge-base default.
  if (base !== undefined) {
    baseRef = base;
    baseSha = revParse(base, projectRoot);
    if (!baseSha) {
      return {
        ok: false,
        code: "INVALID_BASE_REF",
        message: `INVALID_BASE_REF: --base "${base}" does not resolve to a commit`,
      };
    }
  } else {
    const defaultBranch = findDefaultBranch(projectRoot);
    const mergeBase = defaultBranch && headSha
      ? tryGit(["merge-base", defaultBranch, headSha], projectRoot)
      : null;
    if (!mergeBase) {
      // Name what actually failed. An unresolvable head is the more specific
      // cause and would otherwise be reported as a missing merge base.
      const named = defaultBranch ? `"${defaultBranch}"` : "any default branch";
      const cause = headSha
        ? `no merge base between ${named} and "${headRef}"`
        : `head ref "${headRef}" does not resolve, so no merge base could be computed`;
      return {
        ok: false,
        code: "NO_MERGE_BASE",
        message: `NO_MERGE_BASE: ${cause}; pass an explicit --base <ref>`,
      };
    }
    baseRef = defaultBranch;
    baseSha = mergeBase;
  }

  const commits = headSha
    ? readCommits(baseSha, headSha, projectRoot, degradations)
    : [];
  const changedPaths = headSha
    ? readChangedPaths(baseSha, headSha, projectRoot, degradations)
    : [];

  return {
    ok: true,
    context: {
      projectRoot,
      repoRoot,
      baseRef,
      headRef,
      base: baseSha,
      head: headSha || "",
      commits,
      changedPaths,
      degradations,
      manifest,
    },
  };
}

/** Commits reachable from head but not base, newest first. */
function readCommits(base, head, cwd, degradations) {
  const raw = tryGit(
    ["log", `--format=%H${FIELD_SEP}%s${FIELD_SEP}%B${RECORD_SEP}`, `${base}..${head}`],
    cwd,
  );
  if (raw === null) {
    degradations.push(`git log ${base.slice(0, 7)}..${head.slice(0, 7)} failed`);
    return [];
  }
  const commits = [];
  for (const record of raw.split(RECORD_SEP)) {
    const trimmed = record.replace(/^\n+/, "");
    if (!trimmed) continue;
    const [sha, subject, body] = trimmed.split(FIELD_SEP);
    if (!sha) continue;
    commits.push({ sha, subject: subject || "", body: body || "" });
  }
  return commits;
}

/**
 * Changed paths with per-path additions/deletions.
 *
 * `git diff A...B` is the counterpart of `git log A..B`: both are anchored at
 * merge-base(A, B), so the commit list and the file list describe the same
 * work even when the base has advanced.
 */
function readChangedPaths(base, head, cwd, degradations) {
  const raw = tryGit(["diff", "--numstat", "--no-renames", `${base}...${head}`], cwd);
  if (raw === null) {
    degradations.push(`git diff --numstat ${base.slice(0, 7)}...${head.slice(0, 7)} failed`);
    return [];
  }
  const paths = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    const [adds, dels, ...rest] = line.split("\t");
    const path = rest.join("\t");
    if (!path) continue;
    paths.push({
      path,
      additions: adds === "-" ? null : Number(adds),
      deletions: dels === "-" ? null : Number(dels),
    });
  }
  return paths;
}

// ---------------------------------------------------------------------------
// Slot renderers
// ---------------------------------------------------------------------------

/**
 * The cause a slot names when it has nothing to report. A recorded input
 * failure comes first — it explains why the range looks empty and must not be
 * masked by the emptiness it caused (Invariant 4). Then a genuinely empty
 * range, then the slot's own pending reason.
 */
function noDataCause(context, pendingReason) {
  if (context.degradations.length > 0) return context.degradations.join("; ");
  if (context.commits.length === 0) {
    return `the resolved range ${context.base.slice(0, 7)}..${context.head.slice(0, 7)} contains no commits`;
  }
  return pendingReason;
}

/**
 * Render the marker literals inert wherever untrusted text is interpolated
 * into a slot body. Invariant 1 is universally quantified — "whatever any
 * input contains" — and `--head`, ref names, and (later) commit content all
 * reach stdout through the degradation cause.
 *
 * The literals are HTML-escaped rather than stripped: the value stays visible
 * to a reviewer but is no longer an HTML comment, so a marker-based splice of
 * `.github/pull_request_template.md` still sees exactly one pair. Escaping
 * removes the `<`/`>` that make up the literal, so a replacement can never
 * re-form one, and the halves it splits apart are never rejoined.
 *
 * This is a targeted neutralization at the interpolation boundary, not the
 * Invariant 5 encoder — the encoder task supersedes it.
 */
function neutralizeMarkers(text) {
  const escape = (marker) => marker.replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return String(text)
    .replaceAll(OPEN_MARKER, escape(OPEN_MARKER))
    .replaceAll(CLOSE_MARKER, escape(CLOSE_MARKER));
}

/**
 * A section with no data. Absence of data is never presented as absence of
 * risk — the line names what was missing (Invariant 2). `cause` carries
 * untrusted text and is neutralized at this boundary.
 */
function section(title, cause) {
  return `### ${title}\n\n_UNKNOWN — ${title.toLowerCase()} unavailable: ${neutralizeMarkers(cause)}._\n`;
}

function slot(title, cause) {
  const body = section(title, cause);
  return { body, bytes: Buffer.byteLength(body, "utf8") };
}

/** Slot 1 — owned by `pr-body-advisories`; ships here as its gap line. */
function renderSizeAdvisory(context) {
  return slot(
    "Size advisory",
    noDataCause(context, "the size advisory is provided by the pr-body-advisories spec, not yet implemented"),
  );
}

/** Slot 2 — owned by this spec; populated by Task 4. */
function renderAttentionMap(context) {
  return slot(
    "Attention map",
    noDataCause(context, "routing consumption and ranking are not yet implemented"),
  );
}

/** Slot 3 — owned by `pr-body-advisories`; ships here as its gap line. */
function renderReadingOrder(context) {
  return slot(
    "Reading order",
    noDataCause(context, "the reading order is provided by the pr-body-advisories spec, not yet implemented"),
  );
}

/** Slot 4 — owned by this spec; populated by Task 3. */
function renderTraceability(context) {
  return slot(
    "Traceability",
    noDataCause(context, "trailer extraction and the task universe are not yet implemented"),
  );
}

/** Slot 5 — owned by this spec; populated by Task 5. */
function renderVerification(context) {
  return slot(
    "Verification",
    noDataCause(context, "validate-outcome lookup is not yet implemented"),
  );
}

/**
 * The five slots in the spec's fixed order. Each entry is
 * `{ id, title, render }`; `render(context) -> { body, bytes }`.
 *
 * `pr-body-advisories` replaces the `render` function of slots 1 and 3 in
 * place. Assembly is never reopened for that swap.
 *
 * @type {{ id: string, title: string, render: (context: PrBriefContext) => { body: string, bytes: number } }[]}
 */
export const SLOT_REGISTRY = [
  { id: "size-advisory", title: "Size advisory", render: renderSizeAdvisory },
  { id: "attention-map", title: "Attention map", render: renderAttentionMap },
  { id: "reading-order", title: "Reading order", render: renderReadingOrder },
  { id: "traceability", title: "Traceability", render: renderTraceability },
  { id: "verification", title: "Verification", render: renderVerification },
];

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/** Truncate to at most `maxBytes` utf8 bytes without splitting a codepoint. */
function truncateUtf8(text, maxBytes) {
  if (maxBytes <= 0) return "";
  const buf = Buffer.from(text, "utf8");
  if (buf.length <= maxBytes) return text;
  let end = maxBytes;
  while (end > 0 && (buf[end] & 0xc0) === 0x80) end--;
  return buf.subarray(0, end).toString("utf8");
}

/**
 * Truncate a slot body to `keepBytes`, always retaining its heading line so
 * the section cannot vanish (Invariant 2 survives the ceiling).
 */
function truncateSlotBody(body, keepBytes) {
  const nl = body.indexOf("\n");
  const heading = nl === -1 ? body : body.slice(0, nl);
  const rest = nl === -1 ? "" : body.slice(nl + 1);
  const headingBytes = Buffer.byteLength(`${heading}\n`, "utf8");
  return `${heading}\n${truncateUtf8(rest, Math.max(0, keepBytes - headingBytes))}`;
}

/**
 * Assemble the brief: one opening marker, the slot bodies in registry order,
 * one closing marker. Assembly is the only component that sees every slot, so
 * it is the only component that enforces the total-size ceiling.
 *
 * @param {PrBriefContext} context
 * @param {typeof SLOT_REGISTRY} [registry] injectable so a test (and
 *   `pr-body-advisories`) can substitute renderers
 * @param {number} [ceiling]
 * @returns {string}
 */
export function composeBrief(context, registry = SLOT_REGISTRY, ceiling = MAX_BRIEF_BYTES) {
  const rendered = registry.map((entry, index) => {
    const out = entry.render(context);
    return { index, title: entry.title, body: out.body, bytes: out.bytes };
  });

  const notices = enforceCeiling(rendered, ceiling);

  const parts = [OPEN_MARKER, ""];
  for (const entry of rendered) {
    parts.push(entry.body.replace(/\n+$/, ""), "");
  }
  for (const notice of notices) {
    parts.push(notice, "");
  }
  parts.push(CLOSE_MARKER, "");
  return parts.join("\n");
}

/**
 * Shrink the largest slot contributions first until the summed bodies fit
 * `ceiling`.
 *
 * The guarantee is bounded by a floor: every section keeps at least its
 * heading line so no section can vanish (Invariant 2). When the headings alone
 * already exceed `ceiling`, the total cannot be brought under it and the
 * remaining bodies are left intact — the ceiling is enforced only as far as
 * that floor allows.
 *
 * Returns one named degradation line per section that was actually shortened.
 * A section the loop visited but could not shrink gets no notice: a truncation
 * line is a factual claim inside an artifact reviewers are meant to trust.
 */
function enforceCeiling(rendered, ceiling) {
  let total = rendered.reduce((sum, entry) => sum + entry.bytes, 0);
  if (total <= ceiling) return [];

  const notices = [];
  const largestFirst = [...rendered].sort((a, b) => b.bytes - a.bytes || a.index - b.index);
  for (const entry of largestFirst) {
    if (total <= ceiling) break;
    const keep = Math.max(0, entry.bytes - (total - ceiling));
    const body = truncateSlotBody(entry.body, keep);
    const bytes = Buffer.byteLength(body, "utf8");
    const shrank = bytes < entry.bytes;
    total = total - entry.bytes + bytes;
    entry.body = body;
    entry.bytes = bytes;
    if (shrank) {
      notices.push(
        `_TRUNCATED — the ${entry.title} section exceeded the ${ceiling}-byte brief ceiling and was cut short._`,
      );
    }
  }
  return notices;
}

// ---------------------------------------------------------------------------
// CLI surface
// ---------------------------------------------------------------------------

/**
 * @param {object} params
 * @param {string} params.projectRoot
 * @param {string[]} params.argv
 * @param {object|null} [params.manifest]
 * @param {(s: string) => void} [params.out] stdout sink (injectable for tests)
 * @param {(s: string) => void} [params.err] stderr sink (injectable for tests)
 * @returns {Promise<number>} exit code — this module never terminates the process
 */
export async function run({ projectRoot, argv, manifest = null, out, err }) {
  const write = out || ((s) => process.stdout.write(s));
  const diag = err || ((s) => process.stderr.write(s));

  const sub = argv[0];
  if (!sub) {
    diag(`${USAGE}\n`);
    return 1;
  }
  if (sub !== "body") {
    diag(`unknown subverb: ${sub}\n${USAGE}\n`);
    return 1;
  }

  let parsed;
  try {
    parsed = parseArgs({
      args: argv.slice(1),
      options: { base: { type: "string" }, head: { type: "string" } },
      allowPositionals: false,
    });
  } catch (error) {
    diag(`argument error: ${error.message}\n${USAGE}\n`);
    return 1;
  }

  const resolved = resolvePrContext({
    projectRoot,
    base: parsed.values.base,
    head: parsed.values.head,
    manifest,
  });

  if (!resolved.ok) {
    diag(`${resolved.message}\n`);
    return 1;
  }

  write(composeBrief(resolved.context));
  return 0;
}

export function help() {
  console.log("Usage: adev pr <subverb> [flags]");
  console.log("");
  console.log("Subverbs:");
  console.log("  body [--base <ref>] [--head <ref>]   print the PR review brief to stdout");
  console.log("");
  console.log("Flags:");
  console.log("  --base <ref>   base of the range; defaults to the merge base with the default branch");
  console.log("  --head <ref>   head of the range; defaults to HEAD");
  console.log("");
  console.log("Exit codes:");
  console.log("  0  success (including every degraded or missing-optional-input case)");
  console.log("  1  NOT_A_GIT_REPO, INVALID_BASE_REF, NO_MERGE_BASE, or an argument error");
}
