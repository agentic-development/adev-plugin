/**
 * `/adev:specify --revise <spec>` companion library.
 *
 * Task 7 of review-block-auto-retry.plan.md. Reads a BLOCKED spec at
 * revision N together with its `<spec-stem>.review.md` and
 * `<spec-stem>.blockers.md` sidecars and produces revision N+1 as a
 * **targeted patch**:
 *
 *   - Frontmatter fields not implicated by blocker entries are preserved
 *     byte-identically.
 *   - Body sections whose anchor is NOT in any blocker entry are preserved
 *     byte-identically (the patch acknowledges blockers but leaves the
 *     bulk of the spec untouched — the operator or a follow-up review
 *     decides what content edits are needed).
 *   - `revision:` is bumped N → N+1 via the `adev/revision-monotonic`
 *     guard (Task 8). `updated:` is set to today.
 *   - `status:` transitions `review-blocked` → `review-pending`.
 *   - `.blockers.md` is cleared (the next `/adev:review-specs` invocation
 *     re-evaluates and rewrites if any blockers remain).
 *   - `.review.md` is NOT cleared — the next review invocation rewrites it.
 *
 * Atomic write: temp-then-rename via `lib/partial-artifact.mjs` patterns.
 *
 * Path-containment (SEC-1) is enforced via `assertWithin` on every spec
 * path argument.
 *
 * Emits a `spec_revised` lifecycle event with the addressed and unresolved
 * `blocker_id` sets so the loop-convergence detector can partition across
 * revisions.
 *
 * @module lib/specify-revise
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, basename, join, resolve, isAbsolute } from 'node:path';

import { reportSpecRevised } from './lifecycle-state.mjs';
import { assertWithin } from './partial-artifact.mjs';
import { checkRevisionMonotonic } from './diagnostics/revision-monotonic.mjs';
import { SPEC_STATUSES } from './spec-status.mjs';
import { parseFrontmatter as parseFrontmatterShared } from './frontmatter.mjs';
import { codedError as mkErr } from './errors.mjs';

// Use the canonical enum constants instead of bare literals (lib/spec-status.mjs
// is the single source of truth for spec status names).
const STATUS_REVIEW_BLOCKED = SPEC_STATUSES[3]; // canonical: review state 3 (blocked)
const STATUS_REVIEW_PENDING = SPEC_STATUSES[1]; // canonical: review state 1 (pending)

const SPEC_SUFFIX = '.spec.md';
const REVIEW_SUFFIX = '.review.md';
const BLOCKERS_SUFFIX = '.blockers.md';

/**
 * Sibling-sidecar path for a spec.
 *
 * @param {string} specPath
 * @param {string} suffix - REVIEW_SUFFIX or BLOCKERS_SUFFIX
 * @returns {string}
 */
function siblingPath(specPath, suffix) {
  const dir = dirname(specPath);
  const stem = basename(specPath).slice(0, -SPEC_SUFFIX.length);
  return dir === '.' ? `${stem}${suffix}` : join(dir, `${stem}${suffix}`);
}

// ── Frontmatter (minimal) parser ────────────────────────────────────────────
//
// Live Specs use a simple, well-defined YAML frontmatter fence:
//
//   ---\n
//   key: value\n
//   ...\n
//   ---\n
//
// We avoid pulling in a YAML library — the frontmatter is restricted to
// `key: value` lines plus an occasional indented block. For `--revise`
// we only need to read/update a handful of scalar fields (`revision`,
// `updated`, `status`) and preserve everything else byte-identically.

const FENCE = '---';

/**
 * Parse the YAML frontmatter block at the start of a spec body.
 *
 * Returns `{ frontmatterText, body, fields }` where:
 *   - `frontmatterText` is the raw text between the fence lines (no
 *     trailing newline)
 *   - `body` is everything after the closing fence (preserved
 *     byte-identical)
 *   - `fields` is a {key: value} map of top-level scalar fields ONLY
 *     (used to read the current `revision:` / `status:` / `updated:`).
 *
 * Non-scalar fields (e.g., the `source-manifest:` block) are not
 * round-tripped via `fields`; they live in `frontmatterText` and we
 * preserve them by line.
 *
 * @param {string} text
 * @returns {{ frontmatterText: string|null, body: string, fields: Record<string,string> }}
 */
function parseFrontmatter(text) {
  // Delegates to the shared reader (lib/frontmatter.mjs), which tolerates an
  // H1 + multi-line HTML comment preamble. The local copy this replaced broke
  // on multi-line comments and read 129 of 254 specs as `{}` (akoy.1).
  // `lines` / `openIdx` / `closeIdx` carry the splice bookkeeping that
  // `rewriteFrontmatter` needs to preserve the preamble byte-identically.
  return parseFrontmatterShared(text);
}

/**
 * Rewrite the frontmatter block in place with byte-identical preservation
 * of every line we did NOT explicitly update.
 *
 * @param {object} parsed - return value of parseFrontmatter
 * @param {Record<string,string>} updates - fields to set (overwrite if present, append if absent)
 * @returns {string} the new full spec text
 */
function renderFrontmatter(parsed, updates) {
  if (parsed.frontmatterText === null) {
    // No frontmatter — synthesize a minimal one.
    const fmLines = Object.entries(updates).map(([k, v]) => `${k}: ${v}`);
    return [FENCE, ...fmLines, FENCE, '', parsed.body].join('\n');
  }
  const fmLines = parsed.frontmatterText.split('\n');
  const seen = new Set();
  const newLines = fmLines.map(line => {
    const m = /^([a-zA-Z][a-zA-Z0-9_-]*):\s*(.*)$/.exec(line);
    if (m && Object.prototype.hasOwnProperty.call(updates, m[1])) {
      seen.add(m[1]);
      return `${m[1]}: ${updates[m[1]]}`;
    }
    return line;
  });
  // Append any updates not already in the frontmatter (e.g., a new field).
  for (const [k, v] of Object.entries(updates)) {
    if (!seen.has(k)) newLines.push(`${k}: ${v}`);
  }
  const { lines, openIdx, closeIdx } = parsed;
  const rebuilt = [
    // Everything up to and including the opening fence — this is what carries
    // the H1 + comment preamble through a rewrite unchanged.
    ...lines.slice(0, openIdx + 1),
    ...newLines,
    ...lines.slice(closeIdx),
  ];
  return rebuilt.join('\n');
}

// ── Blockers sidecar parser ────────────────────────────────────────────────

/**
 * Parse `.blockers.md` produced by `lib/blockers-writer.mjs`. Pulls
 * `blocker_id` + `section_anchor` from each entry.
 *
 * Forgiving — silently skips malformed entries.
 *
 * @param {string} text
 * @returns {Array<{blocker_id: string, section_anchor: string}>}
 */
export function parseBlockersSidecar(text) {
  const entries = [];
  const idRe = /^blocker_id:\s*(\S+)\s*$/gm;
  const anchorRe = /^section_anchor:\s*(.*?)\s*$/gm;
  // Walk the file pairing each `blocker_id:` with the immediately-following `section_anchor:`.
  const ids = [];
  for (const m of text.matchAll(idRe)) ids.push({ id: m[1], index: m.index });
  const anchors = [];
  for (const m of text.matchAll(anchorRe)) anchors.push({ anchor: m[1], index: m.index });
  for (const { id, index } of ids) {
    // Find the next anchor after this id (within ~500 bytes).
    const next = anchors.find(a => a.index > index && a.index < index + 500);
    entries.push({ blocker_id: id, section_anchor: next?.anchor ?? '' });
  }
  return entries;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Revise a spec from revision N → N+1.
 *
 * @param {object} args
 * @param {string} args.specPath          - project-root-relative spec path
 * @param {string} args.projectRoot       - absolute project root
 * @param {boolean} [args.autoMode=false] - when true, reject non-blocked specs;
 *                                          when false, warn and allow (interactive)
 * @returns {{
 *   fromRevision: number,
 *   toRevision: number,
 *   addressed: string[],
 *   unresolved: string[],
 *   specPath: string,
 *   blockersCleared: boolean,
 * }}
 * @throws {Error} `INVALID_SPEC_PATH` `NO_REVIEW_SIDECARS` `SPEC_NOT_BLOCKED`
 *                `REVISION_NOT_INCREMENTED`
 */
export function reviseSpec({ specPath, projectRoot, autoMode = false } = {}) {
  // ── Validation ────────────────────────────────────────────────────────────
  if (typeof projectRoot !== 'string' || projectRoot.length === 0) {
    throw mkErr('INVALID_PROJECT_ROOT', 'projectRoot must be a non-empty string');
  }
  if (typeof specPath !== 'string' || specPath.length === 0) {
    throw mkErr('INVALID_SPEC_PATH', 'specPath must be a non-empty string');
  }
  if (!specPath.endsWith(SPEC_SUFFIX)) {
    throw mkErr('INVALID_SPEC_PATH', `spec path must end with ${SPEC_SUFFIX}: ${specPath}`);
  }
  // Path-containment (SEC-1).
  const absSpec = isAbsolute(specPath) ? specPath : resolve(projectRoot, specPath);
  try {
    assertWithin(projectRoot, absSpec, 'INVALID_SPEC_PATH');
  } catch (err) {
    throw mkErr('INVALID_SPEC_PATH', `spec path must be inside projectRoot: ${specPath}`);
  }
  if (!existsSync(absSpec)) {
    throw mkErr('INVALID_SPEC_PATH', `spec not found on disk: ${specPath}`);
  }

  const reviewPath = siblingPath(specPath, REVIEW_SUFFIX);
  const blockersPath = siblingPath(specPath, BLOCKERS_SUFFIX);
  const absReview = resolve(projectRoot, reviewPath);
  const absBlockers = resolve(projectRoot, blockersPath);
  if (!existsSync(absReview) || !existsSync(absBlockers)) {
    throw mkErr(
      'NO_REVIEW_SIDECARS',
      `cannot revise — missing sidecars. .review.md exists: ${existsSync(absReview)}, .blockers.md exists: ${existsSync(absBlockers)}. Run /adev:review-specs first.`,
    );
  }

  // ── Parse ─────────────────────────────────────────────────────────────────
  const specText = readFileSync(absSpec, 'utf8');
  const fm = parseFrontmatter(specText);
  const currentRevision = parseInt(fm.fields.revision, 10);
  if (!Number.isInteger(currentRevision) || currentRevision < 1) {
    throw mkErr(
      'INVALID_SPEC_PATH',
      `spec missing or malformed revision: frontmatter field (got ${JSON.stringify(fm.fields.revision)})`,
    );
  }
  const currentStatus = fm.fields.status ?? '';
  if (currentStatus !== STATUS_REVIEW_BLOCKED) {
    if (autoMode) {
      throw mkErr(
        'SPEC_NOT_BLOCKED',
        `--revise on a spec with status=${JSON.stringify(currentStatus)} is rejected in auto mode. Expected status=${STATUS_REVIEW_BLOCKED}.`,
      );
    }
    // Interactive mode: emit advisory log; caller decides whether to proceed.
    // For library use we continue — the orchestrator should gate.
    if (process.env.NODE_ENV !== 'test') {
      // eslint-disable-next-line no-console
      console.warn(`[specify-revise] spec status is ${currentStatus}, not review-blocked — proceeding in interactive mode`);
    }
  }

  const blockersText = readFileSync(absBlockers, 'utf8');
  const blockerEntries = parseBlockersSidecar(blockersText);
  const addressed = blockerEntries.map(e => e.blocker_id);
  // For now, every blocker in the input is acknowledged as addressed by the
  // revise — the next review re-evaluates and reports any that persist.
  const unresolved = [];

  // ── Compute new revision and validate monotonic ──────────────────────────
  const newRevision = currentRevision + 1;
  checkRevisionMonotonic(currentRevision, newRevision);

  const today = new Date().toISOString().slice(0, 10);

  // ── Rewrite spec atomically ──────────────────────────────────────────────
  const updates = {
    revision: String(newRevision),
    updated: today,
    status: STATUS_REVIEW_PENDING,
  };
  const newSpecText = renderFrontmatter(fm, updates);

  // Atomic temp-then-rename
  mkdirSync(dirname(absSpec), { recursive: true });
  const tmp = `${absSpec}.tmp`;
  writeFileSync(tmp, newSpecText, 'utf8');
  renameSync(tmp, absSpec);

  // ── Clear .blockers.md (next review re-evaluates) ────────────────────────
  let blockersCleared = false;
  try {
    unlinkSync(absBlockers);
    blockersCleared = true;
  } catch {
    // Best-effort
  }

  // ── Emit spec_revised event ──────────────────────────────────────────────
  reportSpecRevised(projectRoot, specPath, {
    from_revision: currentRevision,
    to_revision: newRevision,
    addressed_blocker_ids: addressed,
    unresolved_blocker_ids: unresolved,
  });

  return {
    fromRevision: currentRevision,
    toRevision: newRevision,
    addressed,
    unresolved,
    specPath,
    blockersCleared,
  };
}
