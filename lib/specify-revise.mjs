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
import { codedError as mkErr } from './errors.mjs';

// Use the canonical enum constants instead of bare literals (lib/spec-status.mjs
// is the single source of truth for spec status names).
const STATUS_REVIEW_BLOCKED = SPEC_STATUSES[3]; // canonical: review state 3 (blocked)
const STATUS_REVIEW_PENDING = SPEC_STATUSES[1]; // canonical: review state 1 (pending)

const SPEC_SUFFIX = '.spec.md';
const REVIEW_SUFFIX = '.review.md';
const BLOCKERS_SUFFIX = '.blockers.md';

// Task 7: same closed enum + default `lib/blockers-writer.mjs` uses (BEH-1).
// Kept as a local literal rather than importing that module — this file
// only ever reads the already-validated field back out of a written
// sidecar; re-validating the enum here would duplicate, not share, trust.
const DEFAULT_FINDING_CLASS = 'defect';

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
  const lines = text.split('\n');
  // Find the opening fence — must be the first non-empty line (or one of the
  // first few lines for tolerant spec authoring).
  let openIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    if (lines[i].trim() === FENCE) { openIdx = i; break; }
    if (lines[i].trim() !== '' && !lines[i].startsWith('#') && !lines[i].startsWith('<!--')) {
      // Hit a non-comment, non-empty, non-fence line — no frontmatter.
      break;
    }
  }
  if (openIdx === -1) {
    return { frontmatterText: null, body: text, fields: {} };
  }
  let closeIdx = -1;
  for (let i = openIdx + 1; i < lines.length; i++) {
    if (lines[i].trim() === FENCE) { closeIdx = i; break; }
  }
  if (closeIdx === -1) {
    // Malformed — treat as no frontmatter.
    return { frontmatterText: null, body: text, fields: {} };
  }
  const frontmatterLines = lines.slice(openIdx + 1, closeIdx);
  const frontmatterText = frontmatterLines.join('\n');
  const body = lines.slice(closeIdx + 1).join('\n');
  const fields = {};
  for (const line of frontmatterLines) {
    // Match a `key: value` at indent 0 only. Indented continuations are not
    // captured here — they remain in `frontmatterText` (preserved on write).
    const m = /^([a-zA-Z][a-zA-Z0-9_-]*):\s*(.*)$/.exec(line);
    if (m) fields[m[1]] = m[2].trim();
  }
  return {
    frontmatterText,
    body,
    fields,
    // Bookkeeping for write:
    _openIdx: openIdx,
    _closeIdx: closeIdx,
    _lines: lines,
  };
}

// ── Blockers sidecar parser ────────────────────────────────────────────────

/**
 * Parse `.blockers.md` produced by `lib/blockers-writer.mjs`. Pulls
 * `blocker_id` + `section_anchor` + `finding_class` from each entry.
 *
 * Forgiving — silently skips malformed entries. `finding_class` defaults to
 * `'defect'` when the entry's YAML block omits the field entirely — this
 * covers sidecars written before Task 2 added the field (backward compat),
 * matching `lib/blockers-writer.mjs`'s own default-on-absence posture.
 *
 * @param {string} text
 * @returns {Array<{blocker_id: string, section_anchor: string, finding_class: string}>}
 */
export function parseBlockersSidecar(text) {
  const entries = [];
  const idRe = /^blocker_id:\s*(\S+)\s*$/gm;
  const anchorRe = /^section_anchor:\s*(.*?)\s*$/gm;
  const classRe = /^finding_class:\s*(\S+)\s*$/gm;
  // Walk the file pairing each `blocker_id:` with the immediately-following
  // `section_anchor:`/`finding_class:` lines (all three live in the same
  // per-entry YAML fence — see lib/blockers-writer.mjs's render loop).
  const ids = [];
  for (const m of text.matchAll(idRe)) ids.push({ id: m[1], index: m.index });
  const anchors = [];
  for (const m of text.matchAll(anchorRe)) anchors.push({ anchor: m[1], index: m.index });
  const classes = [];
  for (const m of text.matchAll(classRe)) classes.push({ findingClass: m[1], index: m.index });
  for (const { id, index } of ids) {
    // Find the next anchor/finding_class after this id (within ~500 bytes —
    // the per-entry YAML fence is always short).
    const nextAnchor = anchors.find(a => a.index > index && a.index < index + 500);
    const nextClass = classes.find(c => c.index > index && c.index < index + 500);
    entries.push({
      blocker_id: id,
      section_anchor: nextAnchor?.anchor ?? '',
      finding_class: nextClass?.findingClass ?? DEFAULT_FINDING_CLASS,
    });
  }
  return entries;
}

// ── Heading-anchor resolution (Task 6) ──────────────────────────────────────
//
// Maps a `section_anchor` (as emitted by a reviewer / carried in
// `.blockers.md`) to the byte range of that heading's CONTENT — i.e. from
// just after the heading line itself to just before the next heading of the
// same-or-higher level (or EOF). The heading line itself is never part of
// the range: BEH-4's authoring subagents are given "that section's current
// text" (content under a heading), not the heading label, and splicing
// preserves headings byte-identically, only replacing what is under them.

/** GitHub-style-ish heading slug: lowercase, strip non [a-z0-9-], collapse. */
function slugifyHeading(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;

/**
 * Resolve every ATX heading (`#`..`######`) in a frontmatter-stripped spec
 * body to its content byte range. The FIRST heading whose slug matches a
 * given anchor wins on duplicate slugs (later duplicates are ignored — a
 * spec with genuinely duplicate heading text is a pre-existing authoring
 * smell outside this task's scope).
 *
 * @param {string} body - frontmatter-stripped spec body (`parseFrontmatter().body`)
 * @returns {Map<string, {start: number, end: number}>} anchor -> content range
 */
export function resolveSectionAnchors(body) {
  const map = new Map();
  if (typeof body !== 'string' || body.length === 0) return map;
  const lines = body.split('\n');
  const offsets = [];
  let cum = 0;
  for (const line of lines) {
    offsets.push(cum);
    cum += line.length + 1;
  }
  const headings = [];
  for (let i = 0; i < lines.length; i++) {
    const m = HEADING_RE.exec(lines[i]);
    if (!m) continue;
    const anchor = slugifyHeading(m[2]);
    if (!anchor) continue;
    const lineStart = offsets[i];
    const lineEnd = lineStart + lines[i].length;
    const contentStart = Math.min(lineEnd + 1, body.length);
    headings.push({ anchor, level: m[1].length, lineIndex: i, contentStart });
  }
  for (let i = 0; i < headings.length; i++) {
    const h = headings[i];
    let end = body.length;
    for (let j = i + 1; j < headings.length; j++) {
      if (headings[j].level <= h.level) { end = offsets[headings[j].lineIndex]; break; }
    }
    if (!map.has(h.anchor)) map.set(h.anchor, { start: h.contentStart, end });
  }
  return map;
}

/**
 * Group blocker entries (from {@link parseBlockersSidecar}) by their
 * `section_anchor`, for the per-anchor authoring fan-out (BEH-4) and for
 * `reviseSpec`'s own addressed/unresolved computation.
 *
 * Task 7: only `defect`-classed entries are grouped (an entry with no
 * `finding_class` field defaults to `defect`, matching
 * `lib/blockers-writer.mjs`'s own default — this is what keeps every
 * pre-Task-7 caller/test that never set `finding_class` unaffected).
 * `decision`/`external`-classed blockers are never authored: `decision`
 * halts the loop before authoring is ever dispatched (Task 9), and
 * `external` is excluded from convergence accounting entirely — neither
 * has a meaningful "text diff" resolution, so grouping them here would
 * make them silently `unresolved` forever and never `addressed`.
 *
 * Grouping never drops an eligible entry — even a `defect` blocker whose
 * anchor matches no known heading is recorded in `grouped` (so it still
 * counts as loop-eligible / unresolved). When `knownAnchors` (typically the
 * `Map` from {@link resolveSectionAnchors}, or any object/collection with a
 * `.has()` method or an array) is supplied, `anchorsNotFound` lists every
 * distinct anchor present in the (already-filtered) entries that has no
 * matching heading — the ANCHOR_NOT_FOUND case from BEH-4 / the error-codes
 * table.
 *
 * @param {Array<{blocker_id: string, section_anchor: string, finding_class?: string}>} blockerEntries
 * @param {Map<string, any>|{has(a:string):boolean}|string[]|null} [knownAnchors]
 * @returns {{grouped: Map<string, string[]>, anchorsNotFound: string[]}}
 */
export function groupBlockersByAnchor(blockerEntries, knownAnchors = null) {
  const grouped = new Map();
  for (const entry of blockerEntries || []) {
    if (!entry || typeof entry.section_anchor !== 'string') continue;
    const findingClass = entry.finding_class ?? DEFAULT_FINDING_CLASS;
    if (findingClass !== DEFAULT_FINDING_CLASS) continue; // decision/external — never authored
    const anchor = entry.section_anchor;
    if (!grouped.has(anchor)) grouped.set(anchor, []);
    grouped.get(anchor).push(entry.blocker_id);
  }
  let anchorsNotFound = [];
  if (knownAnchors) {
    const has = typeof knownAnchors.has === 'function'
      ? (a) => knownAnchors.has(a)
      : (a) => Array.isArray(knownAnchors) && knownAnchors.includes(a);
    anchorsNotFound = [...grouped.keys()].filter(a => !has(a));
  }
  return { grouped, anchorsNotFound };
}

// ── Splice validation (BEH-5a) ──────────────────────────────────────────────

// Any C0 control character except \t (0x09) and \n (0x0A), plus DEL (0x7F).
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;

/**
 * Validate an authored section body per BEH-5a: refuse (never sanitize) a
 * body containing a line that IS a frontmatter fence (`---`, trimmed) or any
 * control character. Mirrors `assertSafeScalar`'s refuse-don't-sanitize
 * posture (lib/extensions/governance-values.mjs), applied here to a
 * multi-line body instead of a single scalar.
 *
 * @param {*} text
 * @returns {{ok: true}|{ok: false, reason: string}}
 */
function validateAuthoredBody(text) {
  if (typeof text !== 'string') return { ok: false, reason: 'not-a-string' };
  for (const line of text.split('\n')) {
    if (line.trim() === FENCE) return { ok: false, reason: 'frontmatter-fence-line' };
  }
  if (CONTROL_CHAR_RE.test(text)) return { ok: false, reason: 'control-character' };
  return { ok: true };
}

/**
 * Render frontmatter-field updates AND a (possibly replaced) body into a
 * single full spec text. Line-based for the frontmatter portion (byte-
 * identical preservation of every frontmatter line not explicitly updated,
 * the same approach the pre-Task-6 single-purpose frontmatter-only rewrite
 * used — a call with `newBody === parsed.body` reproduces that output
 * exactly) and a straight string substitution for the body.
 *
 * @param {object} parsed - return value of parseFrontmatter
 * @param {Record<string,string>} updates
 * @param {string} newBody
 * @returns {string}
 */
function renderFullText(parsed, updates, newBody) {
  if (parsed.frontmatterText === null) {
    const fmLines = Object.entries(updates).map(([k, v]) => `${k}: ${v}`);
    return [FENCE, ...fmLines, FENCE, '', newBody].join('\n');
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
  for (const [k, v] of Object.entries(updates)) {
    if (!seen.has(k)) newLines.push(`${k}: ${v}`);
  }
  const { _lines, _openIdx, _closeIdx } = parsed;
  const rebuilt = [
    ..._lines.slice(0, _openIdx + 1),
    ...newLines,
    _lines[_closeIdx],
    ...newBody.split('\n'),
  ];
  return rebuilt.join('\n');
}

/**
 * BEH-5's final atomicity gate: re-parse the FULL post-splice candidate text
 * and confirm the frontmatter still parses. This is a tolerant, whole-
 * document re-parse — NOT a census of every `---`-only line in the document.
 * A pre-existing, legitimate markdown horizontal rule (or an embedded
 * frontmatter example) elsewhere in the body is common in real specs and
 * must never trip this gate: splices are always strictly bounded to content
 * after the closing frontmatter fence (see {@link resolveSectionAnchors}),
 * so such content cannot actually corrupt the frontmatter block itself.
 * The gate instead re-derives the frontmatter block the same way the
 * top-of-function parse did, and confirms it still parses AND still carries
 * the revision/status values this call intended to write — the concrete,
 * checkable form of "the frontmatter still parses" BEH-5 requires.
 *
 * @param {string} candidateText
 * @param {{revision: number, status: string}} expected
 * @returns {{ok: true}|{ok: false, reason: string}}
 */
export function assertFrontmatterIntact(candidateText, expected) {
  const reparsed = parseFrontmatter(candidateText);
  if (reparsed.frontmatterText === null) return { ok: false, reason: 'frontmatter-missing' };
  if (String(reparsed.fields.revision) !== String(expected.revision)) {
    return { ok: false, reason: 'revision-mismatch' };
  }
  if (reparsed.fields.status !== expected.status) return { ok: false, reason: 'status-mismatch' };
  return { ok: true };
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
 * @param {Map<string,string>} [args.authoredSections] - anchor -> rewritten
 *   section body, as produced by BEH-4's per-anchor authoring subagents.
 *   Defaults to an empty Map (no-op: nothing is spliced, so every
 *   loop-eligible blocker is `unresolved` — this is the real-diff
 *   replacement for the pre-Task-6 blanket-acknowledgement defect).
 * @returns {{
 *   fromRevision: number,
 *   toRevision: number,
 *   addressed: string[],
 *   unresolved: string[],
 *   specPath: string,
 *   blockersCleared: boolean,
 *   advisories: Array<{code: string, anchor: string, reason?: string}>,
 * }}
 * @throws {Error} `INVALID_SPEC_PATH` `NO_REVIEW_SIDECARS` `SPEC_NOT_BLOCKED`
 *                `REVISION_NOT_INCREMENTED`
 */
export function reviseSpec({ specPath, projectRoot, autoMode = false, authoredSections = new Map() } = {}) {
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

  // ── Task 6: real per-anchor diff, not blanket acknowledgement ────────────
  const sectionAnchors = resolveSectionAnchors(fm.body);
  const { grouped: anchorToBlockerIds, anchorsNotFound } = groupBlockersByAnchor(blockerEntries, sectionAnchors);

  const advisories = [];
  for (const anchor of anchorsNotFound) {
    advisories.push({ code: 'ANCHOR_NOT_FOUND', anchor });
  }

  const authored = authoredSections instanceof Map ? authoredSections : new Map();
  const changedAnchors = new Set();
  const spliceOps = [];
  for (const [anchor, authoredBody] of authored.entries()) {
    if (!sectionAnchors.has(anchor)) {
      // No matching heading — cannot splice (already reported above if it
      // has blockers attached; authoring is skipped per BEH-4).
      continue;
    }
    const validation = validateAuthoredBody(authoredBody);
    if (!validation.ok) {
      advisories.push({ code: 'SPLICE_VALIDATION_FAILED', anchor, reason: validation.reason });
      continue;
    }
    const range = sectionAnchors.get(anchor);
    const priorText = fm.body.slice(range.start, range.end);
    if (priorText.trim() === authoredBody.trim()) {
      continue; // unchanged -> stays unresolved, nothing to splice
    }
    const spliceText = authoredBody.endsWith('\n') ? authoredBody : `${authoredBody}\n`;
    spliceOps.push({ anchor, start: range.start, end: range.end, text: spliceText });
    changedAnchors.add(anchor);
  }

  // ── Compute new revision and validate monotonic ──────────────────────────
  const newRevision = currentRevision + 1;
  checkRevisionMonotonic(currentRevision, newRevision);

  const today = new Date().toISOString().slice(0, 10);
  const updates = {
    revision: String(newRevision),
    updated: today,
    status: STATUS_REVIEW_PENDING,
  };

  // ── Splice + BEH-5 atomicity gate ────────────────────────────────────────
  // The frontmatter bump (revision/updated/status) always happens — that is
  // the unchanged base-spec Behavior 2 mechanic this amendment does not
  // touch. Only the BODY portion of what gets written is conditional on the
  // splice succeeding: if nothing validated+changed, or the post-splice
  // full-document reparse gate fails, the body written is the ORIGINAL body
  // (byte-identical) and every anchor that was part of the failed/rolled-
  // back attempt is reported `unresolved`, never partially applied (BEH-5).
  let finalBody = fm.body;
  if (spliceOps.length > 0) {
    let splicedBody = fm.body;
    const ordered = [...spliceOps].sort((a, b) => b.start - a.start);
    for (const op of ordered) {
      splicedBody = splicedBody.slice(0, op.start) + op.text + splicedBody.slice(op.end);
    }
    const candidateFullText = renderFullText(fm, updates, splicedBody);
    const gate = assertFrontmatterIntact(candidateFullText, { revision: newRevision, status: STATUS_REVIEW_PENDING });
    if (gate.ok) {
      finalBody = splicedBody;
    } else {
      // Roll back: nothing spliced commits. Every anchor that passed
      // per-anchor validation is now unresolved too, since it was never
      // actually written (BEH-5's "never partially applied" guarantee).
      for (const anchor of changedAnchors) {
        advisories.push({ code: 'SPLICE_VALIDATION_FAILED', anchor, reason: `post-splice-reparse-failed:${gate.reason}` });
      }
      changedAnchors.clear();
    }
  }

  const addressed = [];
  const unresolved = [];
  for (const [anchor, ids] of anchorToBlockerIds.entries()) {
    if (changedAnchors.has(anchor)) {
      addressed.push(...ids);
    } else {
      unresolved.push(...ids);
    }
  }

  const newSpecText = renderFullText(fm, updates, finalBody);

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
    advisories,
  };
}
