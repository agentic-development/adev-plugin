/**
 * `/adev:specify --revise <spec>` companion library.
 *
 * Reads a BLOCKED spec at revision N together with its `<spec-stem>.review.md` and
 * `<spec-stem>.blockers.md` sidecars and produces revision N+1 as a
 * **targeted patch**:
 *
 *   - Frontmatter fields not implicated by blocker entries are preserved
 *     byte-identically.
 *   - Each implicated section is replaced by the body its per-anchor
 *     authoring subagent wrote (validated, then spliced under an atomicity
 *     gate); every other section is preserved byte-identically. A blocker is
 *     `addressed` only when its section's text actually changed.
 *   - `revision:` is bumped N → N+1 via the `adev/revision-monotonic`
 *     guard (left as-is in same-revision mode). `updated:` is set to today.
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
import { resolveSectionAnchors, listSections, isNestedRange } from './section-anchors.mjs';
import { applyDecisions, findHeadingFenceAware, placeSection } from './decisions-of-record.mjs';
import { resolveDecisionPaths } from './decisions.mjs';
import { _redactForBlockers } from './blockers-writer.mjs';
import { parseBlockerId } from './blocker-id.mjs';
import {
  DECISION_TEXT_BOUNDS,
  SINGLE_LINE_TRUNCATION_MARKER,
  checkUnsafeDecisionText,
  deriveQuestion,
  normalizeQuestion,
} from './decision-text.mjs';

// Use the canonical enum constants instead of bare literals (lib/spec-status.mjs
// is the single source of truth for spec status names).
const STATUS_REVIEW_BLOCKED = SPEC_STATUSES[3]; // canonical: review state 3 (blocked)
const STATUS_REVIEW_PENDING = SPEC_STATUSES[1]; // canonical: review state 1 (pending)

const SPEC_SUFFIX = '.spec.md';
const REVIEW_SUFFIX = '.review.md';
const BLOCKERS_SUFFIX = '.blockers.md';

// Same default `lib/blockers-writer.mjs` applies to an absent finding_class.
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
export function parseFrontmatter(text) {
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
 * `blocker_id` + `section_anchor` + `finding_class` + `remedy_ref`, plus the
 * decision keys (`question`, `options`, `decision_choice`, `decision_note`,
 * `decision_recorded`), from each entry. Legacy entries without the decision
 * keys yield `question: null`, `options: []`, and null answers.
 *
 * Forgiving — silently skips malformed entries. `finding_class` defaults to
 * `'defect'` when the entry's YAML block omits the field entirely, so a
 * sidecar written without the field still parses, matching
 * `lib/blockers-writer.mjs`'s own default-on-absence posture.
 * `remedy_ref` is `null` when absent (only meaningful for `external`-classed
 * entries — `lib/blockers-writer.mjs` only ever writes it for those).
 *
 * @param {string} text
 * @returns {Array<{blocker_id: string, section_anchor: string, finding_class: string, remedy_ref: string|null, question: string|null, options: Array<{label: string, implications: string}>, decision_choice: string|null, decision_note: string|null, decision_recorded: string|null, prose: string|null}>}
 */
/**
 * `remedy_ref` is written as a JSON-quoted string so commas, quotes and
 * colons survive the YAML fence; older sidecars carry it unquoted.
 */
function decodeRemedyRef(raw) {
  if (raw.startsWith('"')) {
    try { return String(JSON.parse(raw)); } catch { /* fall through to raw */ }
  }
  return raw;
}

/**
 * Body of the first plain (non-yaml) fence in one entry's span, or null. The
 * span starts at the entry's `blocker_id:` line, so the leading yaml fence is
 * closed first; a prose block that itself holds a line `\`\`\`` ends early.
 */
function firstProseBlock(span) {
  const lines = span.split('\n');
  let i = 0;
  while (i < lines.length && lines[i] !== '```') i += 1;
  i += 1;
  while (i < lines.length && lines[i] !== '```') i += 1;
  if (i >= lines.length) return null;
  const from = i + 1;
  let to = from;
  while (to < lines.length && lines[to] !== '```') to += 1;
  return to >= lines.length ? null : lines.slice(from, to).join('\n');
}

export function parseBlockersSidecar(text) {
  const entries = [];
  const idRe = /^blocker_id:\s*(\S+)\s*$/gm;
  const ids = [];
  for (const m of text.matchAll(idRe)) ids.push({ id: m[1], index: m.index });

  const jsonOr = (fallback) => (raw) => {
    try { return JSON.parse(raw); } catch { return fallback; }
  };
  // Each field is looked up only inside its own entry's fence.
  const fieldTable = {
    section_anchor: { re: /^section_anchor:\s*(.*?)\s*$/gm, decode: (raw) => raw, absent: '' },
    finding_class: { re: /^finding_class:\s*(\S+)\s*$/gm, decode: (raw) => raw, absent: DEFAULT_FINDING_CLASS },
    remedy_ref: { re: /^remedy_ref:\s*(.*?)\s*$/gm, decode: decodeRemedyRef, absent: null },
    question: { re: /^question:\s*(.*?)\s*$/gm, decode: jsonOr(null), absent: null },
    options: { re: /^options:\s*(.*?)\s*$/gm, decode: jsonOr([]), absent: [] },
    decision_choice: { re: /^decision_choice:\s*(.*?)\s*$/gm, decode: jsonOr(null), absent: null },
    decision_note: { re: /^decision_note:\s*(.*?)\s*$/gm, decode: jsonOr(null), absent: null },
    decision_recorded: { re: /^decision_recorded:\s*(.*?)\s*$/gm, decode: (raw) => raw, absent: null },
  };
  const matches = {};
  for (const [key, { re }] of Object.entries(fieldTable)) {
    matches[key] = [...text.matchAll(re)].map((m) => ({ raw: m[1], index: m.index }));
  }
  for (let i = 0; i < ids.length; i++) {
    const { id, index } = ids[i];
    // A field belongs to this entry only if it sits inside this entry's own
    // fence: before the fence's closing ``` and before the next blocker_id.
    // An entry that omits a field must not borrow the next entry's value.
    const fenceClose = text.indexOf('\n```', index);
    const nextId = i + 1 < ids.length ? ids[i + 1].index : text.length;
    const limit = Math.min(fenceClose === -1 ? text.length : fenceClose, nextId);
    const within = (f) => f.index > index && f.index < limit;
    const entry = { blocker_id: id };
    for (const [key, { decode, absent }] of Object.entries(fieldTable)) {
      const hit = matches[key].find(within);
      entry[key] = hit ? decode(hit.raw) : absent;
    }
    entry.prose = firstProseBlock(text.slice(index, nextId));
    entries.push(entry);
  }
  return entries;
}

// ── Heading-anchor resolution ───────────────────────────────────────────────
//
// A section's range is its CONTENT: from just after the heading line to the
// next heading of the same-or-higher level. The heading line itself is never
// part of the range, so splicing preserves headings byte-identically.
// `resolveSectionAnchors` lives in `lib/section-anchors.mjs`, shared with the
// blocker writer and diff-scope so all three agree on the slug rule.

export { resolveSectionAnchors };

/**
 * Group blocker entries (from {@link parseBlockersSidecar}) by their
 * `section_anchor`, for the per-anchor authoring fan-out (BEH-4) and for
 * `reviseSpec`'s own addressed/unresolved computation.
 *
 * Groupable entries are `defect`-classed ones (an entry with no
 * `finding_class` field defaults to `defect`, matching
 * `lib/blockers-writer.mjs`'s own default, so a caller that never sets the
 * field groups every entry as before) and `decision`-classed ones that carry
 * a non-null `decision_choice`: an answered decision is authored into its
 * section like a defect, and its answer is returned in `decisions`
 * (anchor -> `[{blocker_id, choice, note}]`), following the same remap and
 * parent-fold as `grouped`.
 * An unanswered `decision` halts the loop before authoring is ever
 * dispatched, and `external` is excluded from convergence accounting
 * entirely — neither has a meaningful "text diff" resolution, so grouping
 * them here would make them silently `unresolved` forever and never
 * `addressed`.
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
 * Reviewers often anchor to an item inside a section rather than to a
 * heading (`behaviors-2` for the second item under `## Behaviors`). Only
 * headings can be spliced, so when `knownAnchors` is supplied, an anchor of
 * the form `<heading>-<N>` that matches no heading is grouped under
 * `<heading>` when that heading exists, and reported in `remapped`. The
 * authoring step then re-authors the whole parent section. Without this,
 * such blockers land in `anchorsNotFound` every cycle and can never be
 * addressed.
 *
 * @param {Array<{blocker_id: string, section_anchor: string, finding_class?: string, decision_choice?: string|null, decision_note?: string|null}>} blockerEntries
 * @param {Map<string, any>|{has(a:string):boolean}|string[]|null} [knownAnchors]
 * @returns {{grouped: Map<string, string[]>, decisions: Map<string, Array<{blocker_id: string, choice: string, note: string|null}>>, anchorsNotFound: string[], remapped: Array<{from: string, to: string}>}}
 */
export function groupBlockersByAnchor(blockerEntries, knownAnchors = null) {
  const has = !knownAnchors
    ? null
    : typeof knownAnchors.has === 'function'
      ? (a) => knownAnchors.has(a)
      : (a) => Array.isArray(knownAnchors) && knownAnchors.includes(a);
  const remappedPairs = new Map();
  const resolveAnchor = (anchor) => {
    if (!has || has(anchor)) return anchor;
    const m = /^(.+)-\d+$/.exec(anchor);
    if (m && has(m[1])) {
      remappedPairs.set(anchor, m[1]);
      return m[1];
    }
    return anchor;
  };

  const grouped = new Map();
  const decisions = new Map();
  for (const entry of blockerEntries || []) {
    if (!entry || typeof entry.section_anchor !== 'string') continue;
    const findingClass = entry.finding_class ?? DEFAULT_FINDING_CLASS;
    const answered = findingClass === 'decision' && entry.decision_choice != null;
    if (findingClass !== DEFAULT_FINDING_CLASS && !answered) continue; // open decision / external — never authored
    const anchor = resolveAnchor(entry.section_anchor);
    if (!grouped.has(anchor)) grouped.set(anchor, []);
    grouped.get(anchor).push(entry.blocker_id);
    if (answered) {
      if (!decisions.has(anchor)) decisions.set(anchor, []);
      decisions.get(anchor).push({ blocker_id: entry.blocker_id, choice: entry.decision_choice, note: entry.decision_note ?? null });
    }
  }
  // A parent section's range contains its sub-sections. If both a parent and
  // one of its descendants carry blockers, authoring both would rewrite the
  // same bytes twice, so the descendant's blockers fold into the outermost
  // grouped ancestor, which is re-authored as a whole.
  if (knownAnchors instanceof Map) {
    const rangeOf = (a) => knownAnchors.get(a);
    const ranged = [...grouped.keys()].filter(a => rangeOf(a) && typeof rangeOf(a).start === 'number');
    for (const child of ranged) {
      if (!grouped.has(child)) continue;
      let outer = null;
      for (const candidate of ranged) {
        if (candidate === child || !grouped.has(candidate)) continue;
        if (!isNestedRange(rangeOf(child), rangeOf(candidate))) continue;
        if (!outer || isNestedRange(rangeOf(outer), rangeOf(candidate))) outer = candidate;
      }
      if (outer) {
        grouped.get(outer).push(...grouped.get(child));
        grouped.delete(child);
        if (decisions.has(child)) {
          if (!decisions.has(outer)) decisions.set(outer, []);
          decisions.get(outer).push(...decisions.get(child));
          decisions.delete(child);
        }
        remappedPairs.set(child, outer);
      }
    }
    // An earlier `<heading>-<N>` remap may point at a section that was just
    // folded; follow it to the section that now holds the blockers.
    for (const [from, to] of remappedPairs) {
      let target = to;
      while (remappedPairs.has(target) && remappedPairs.get(target) !== target) target = remappedPairs.get(target);
      remappedPairs.set(from, target);
    }
  }
  const anchorsNotFound = has ? [...grouped.keys()].filter(a => !has(a)) : [];
  const remapped = [...remappedPairs].map(([from, to]) => ({ from, to }));
  return { grouped, decisions, anchorsNotFound, remapped };
}

// ── Splice validation (BEH-5a) ──────────────────────────────────────────────

// Any C0 control character except \t (0x09) and \n (0x0A), plus DEL (0x7F).
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;

// A decision marker is written only by the Decisions of Record writer; an
// authored body carrying one could forge a recorded decision.
const DECISION_MARKER_RE = /<!--\s*adev:decision/;

const DECISIONS_OF_RECORD_ANCHOR = 'decisions-of-record';

/**
 * Validate an authored section body per BEH-5a: refuse (never sanitize) a
 * body containing a line that IS a frontmatter fence (`---`, trimmed), any
 * control character, a `<!-- adev:decision` marker, or a fence-aware level-2
 * `## Decisions of Record` heading. Mirrors `assertSafeScalar`'s refuse-don't-sanitize
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
  if (DECISION_MARKER_RE.test(text)) return { ok: false, reason: 'decision-marker' };
  // The section is never an authoring target: an authored H2 of that title
  // would be found as the section and receive the tooling's entries.
  if (findHeadingFenceAware(text, 2, 'Decisions of Record')) return { ok: false, reason: 'decisions-of-record-heading' };
  return { ok: true };
}

/**
 * Render frontmatter-field updates AND a (possibly replaced) body into a
 * single full spec text. Line-based for the frontmatter portion (byte-
 * identical preservation of every frontmatter line not explicitly updated;
 * a call with `newBody === parsed.body` changes only the updated fields)
 * and a straight string substitution for the body.
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
 * Every heading outside the spliced ranges must survive the splice, in the
 * same order. The frontmatter gate cannot see body damage, so without this a
 * splice applied at a wrong offset could drop or mangle an untouched heading
 * and still be written.
 *
 * @param {string} priorBody
 * @param {string} splicedBody
 * @param {Array<{start: number, end: number}>} ops
 * @returns {{ok: true}|{ok: false, reason: string}}
 */
export function assertHeadingsOutsideSplicesIntact(priorBody, splicedBody, ops) {
  const inSplice = (pos) => ops.some(o => pos >= o.start && pos < o.end);
  const expected = listSections(priorBody).filter(s => !inSplice(s.headingStart)).map(s => `${s.level}:${s.anchor}`);
  const actual = listSections(splicedBody).map(s => `${s.level}:${s.anchor}`);
  let j = 0;
  for (const h of actual) {
    if (j < expected.length && h === expected[j]) j++;
  }
  if (j === expected.length) return { ok: true };
  return { ok: false, reason: `heading-outside-splice-lost:${expected[j]}` };
}

// ── Decisions of Record ─────────────────────────────────────────────

const DECISIONS_SECTION_TITLE = 'Decisions of Record';

// A stored question or implications is truncated to its bound plus the
// single-line marker, so the re-check must admit that stored length.
const MARKER_LENGTH = [...SINGLE_LINE_TRUNCATION_MARKER].length;
const RECHECK_BOUNDS = Object.freeze({
  question: DECISION_TEXT_BOUNDS.question + MARKER_LENGTH,
  implications: DECISION_TEXT_BOUNDS.implications + MARKER_LENGTH,
  choice: DECISION_TEXT_BOUNDS.choice,
  note: DECISION_TEXT_BOUNDS.note,
});

const unsafeDecision = (field, why) => mkErr('UNSAFE_DECISION_TEXT', `${field} refused: ${why}`);

function recheckDecisionText(value, field) {
  if (typeof value !== 'string') throw unsafeDecision(field, 'value must be a string');
  if ([...value].length > RECHECK_BOUNDS[field]) {
    throw unsafeDecision(field, `exceeds ${RECHECK_BOUNDS[field]} characters`);
  }
  const gate = checkUnsafeDecisionText(value);
  if (!gate.ok) throw unsafeDecision(field, gate.reason);
}

/**
 * Group the answered `decision` entries for the Decisions of Record writer:
 * entries sharing a section_anchor, a normalized question, a choice and a note
 * become one decision naming every blocker id. Every field that will be
 * rendered into the spec is re-checked here — the sidecar is a committed file
 * and may have been edited since `adev decisions record` validated it.
 *
 * @param {ReturnType<typeof parseBlockersSidecar>} entries
 * @returns {Array<{blockerIds: string[], question: string, choice: string, implications: string|null, note: string|null}>}
 * @throws {Error} `UNSAFE_DECISION_TEXT`
 */
function collectDecisionGroups(entries) {
  const groups = new Map();
  for (const e of entries) {
    if ((e.finding_class ?? DEFAULT_FINDING_CLASS) !== 'decision' || e.decision_choice == null) continue;
    try {
      parseBlockerId(e.blocker_id);
    } catch {
      throw unsafeDecision('blocker_id', 'not a valid blocker id');
    }
    const question = typeof e.question === 'string' && e.question !== ''
      ? e.question
      : deriveQuestion(e.prose, e.blocker_id, { redact: _redactForBlockers }).question;
    const key = JSON.stringify([e.section_anchor, normalizeQuestion(question), e.decision_choice, e.decision_note ?? null]);
    const existing = groups.get(key);
    if (existing) {
      existing.blockerIds.push(e.blocker_id);
      continue;
    }
    const option = Array.isArray(e.options) ? e.options.find((o) => o && o.label === e.decision_choice) : undefined;
    groups.set(key, {
      blockerIds: [e.blocker_id],
      question,
      choice: e.decision_choice,
      implications: option && typeof option.implications === 'string' && option.implications !== '' ? option.implications : null,
      note: e.decision_note ?? null,
    });
  }
  const out = [...groups.values()];
  for (const g of out) {
    recheckDecisionText(g.question, 'question');
    recheckDecisionText(g.choice, 'choice');
    if (g.implications !== null) recheckDecisionText(g.implications, 'implications');
    if (g.note !== null) recheckDecisionText(g.note, 'note');
  }
  return out;
}

function composeDecisionsSection(body, groups) {
  const section = findHeadingFenceAware(body, 2, DECISIONS_SECTION_TITLE);
  const existing = section ? body.slice(section.contentStart, section.end) : '';
  const applied = applyDecisions(existing, groups);
  return { body: placeSection(body, applied.text), written: applied.written, advisories: applied.advisories };
}

/**
 * Post-compose byte-identity: with the Decisions of Record range removed from
 * both, the composed body must equal the body handed to the composer. That
 * body already carries exactly the accepted authored splices, so this proves
 * the composer touched nothing outside its own section — including the
 * authored regions — without recomputing splice offsets against shifted text.
 * When the spec has neither the section nor an Acceptance Criteria heading the
 * section is appended at end of file, and the only permitted outside change is
 * the trailing whitespace that separates it from the previous content.
 *
 * @param {string} priorBody - body before composition
 * @param {string} composedBody
 * @returns {{ok: true}|{ok: false, reason: string}}
 */
export function assertOnlyDecisionsSectionChanged(priorBody, composedBody) {
  const strip = (b) => {
    const s = findHeadingFenceAware(b, 2, DECISIONS_SECTION_TITLE);
    return s ? b.slice(0, s.headingStart) + b.slice(s.end) : b;
  };
  const appendedAtEof = !findHeadingFenceAware(priorBody, 2, DECISIONS_SECTION_TITLE)
    && !findHeadingFenceAware(priorBody, 2, 'Acceptance Criteria');
  const norm = (t) => (appendedAtEof ? t.replace(/\s+$/, '') : t);
  return norm(strip(priorBody)) === norm(strip(composedBody))
    ? { ok: true }
    : { ok: false, reason: 'post-compose byte-identity check failed' };
}

/**
 * Revise a spec from revision N → N+1, or — with `sameRevision` — re-author
 * sections of the revision the previous call already produced.
 *
 * `sameRevision` exists for the build loop's mechanism-existence inner retry:
 * after `revise` has produced N+1 (status `review-pending`), `check-mechanisms`
 * may turn up unresolved citations that must be fixed *on that same revision*
 * before any reviewer runs. A second plain revise would both refuse the
 * `review-pending` status (SPEC_NOT_BLOCKED under --auto) and bump the
 * revision again. In `sameRevision` mode the spec must be `review-pending`,
 * `revision:` is left as-is, and no `spec_revised` event is emitted — no
 * revision transition happened, and the convergence detector partitions on
 * reviewer blocker sets, not on this call's addressed/unresolved.
 *
 * @param {object} args
 * @param {string} args.specPath          - project-root-relative spec path
 * @param {string} args.projectRoot       - absolute project root
 * @param {boolean} [args.autoMode=false] - when true, reject non-blocked specs;
 *                                          when false, warn and allow (interactive)
 * @param {boolean} [args.sameRevision=false] - splice into the current
 *   revision instead of producing N+1; requires status `review-pending`
 * @param {Map<string,string>} [args.authoredSections] - anchor -> rewritten
 *   section body, as produced by BEH-4's per-anchor authoring subagents.
 *   Defaults to an empty Map: nothing is spliced, so every loop-eligible
 *   blocker is reported `unresolved`.
 * @param {(body: string, groups: Array<object>) => {body: string, written: Array<{dec: string, blockerIds: string[]}>, advisories: Array<object>}} [args._composeDecisions]
 *   TEST-ONLY seam replacing the Decisions of Record composer, so the
 *   post-compose byte-identity abort can be exercised with a faulty composer.
 * @returns {{
 *   fromRevision: number,
 *   toRevision: number,
 *   sameRevision: boolean,
 *   addressed: string[],
 *   unresolved: string[],
 *   specPath: string,
 *   blockersCleared: boolean,
 *   advisories: Array<{code: string, anchor?: string, reason?: string}>,
 *   decisions_written: Array<{dec: string, blocker_ids: string[]}>,
 * }}
 * @throws {Error} `INVALID_SPEC_PATH` `NO_REVIEW_SIDECARS` `SPEC_NOT_BLOCKED`
 *                `SPEC_NOT_PENDING` `REVISION_NOT_INCREMENTED` `NOTHING_TO_REVISE`
 *                `UNSAFE_DECISION_TEXT` (an answered decision's text fails the
 *                re-check; all-or-nothing, nothing written)
 *                `SPLICE_VALIDATION_FAILED` — thrown only for the fatal
 *                post-compose byte-identity abort (a byte outside the Decisions
 *                of Record section differs from the spliced body; nothing
 *                written). The same code is also an advisory (never thrown)
 *                scoped to one anchor when that anchor's authored body is
 *                refused or the post-splice reparse rolls the splices back.
 */
export function reviseSpec({ specPath, projectRoot, autoMode = false, sameRevision = false, authoredSections = new Map(), _composeDecisions = composeDecisionsSection } = {}) {
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
  if (sameRevision) {
    if (currentStatus !== STATUS_REVIEW_PENDING) {
      throw mkErr(
        'SPEC_NOT_PENDING',
        `same-revision re-authoring requires status=${STATUS_REVIEW_PENDING} (the status the preceding revise leaves); got ${JSON.stringify(currentStatus)}.`,
      );
    }
  } else if (currentStatus !== STATUS_REVIEW_BLOCKED) {
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

  // A blocker is `addressed` only when its anchor's text actually changed —
  // never by acknowledging the input set.
  const sectionAnchors = resolveSectionAnchors(fm.body);
  const { grouped: anchorToBlockerIds, anchorsNotFound, remapped } = groupBlockersByAnchor(blockerEntries, sectionAnchors);

  const advisories = [];
  for (const { from, to } of remapped) {
    advisories.push({ code: 'ANCHOR_REMAPPED', anchor: from, to });
  }
  for (const anchor of anchorsNotFound) {
    advisories.push({ code: 'ANCHOR_NOT_FOUND', anchor });
  }

  const authored = authoredSections instanceof Map ? authoredSections : new Map();
  const changedAnchors = new Set();
  const spliceOps = [];
  for (const [anchor, authoredBody] of authored.entries()) {
    if (anchor === DECISIONS_OF_RECORD_ANCHOR) {
      advisories.push({ code: 'SPLICE_VALIDATION_FAILED', anchor, reason: 'decisions-of-record-not-authorable' });
      continue;
    }
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
  }

  // Splices are applied with offsets taken from the original body, which is
  // only sound when no two ranges overlap. A parent section's range contains
  // its sub-sections, so when both are authored the outer one wins and the
  // inner one is refused rather than applied against stale offsets.
  const acceptedOps = [];
  for (const op of [...spliceOps].sort((a, b) => (b.end - b.start) - (a.end - a.start))) {
    const clash = acceptedOps.find(o => op.start < o.end && o.start < op.end);
    if (clash) {
      advisories.push({ code: 'SPLICE_OVERLAP', anchor: op.anchor, reason: `range overlaps the re-authored section '${clash.anchor}'` });
      continue;
    }
    acceptedOps.push(op);
    changedAnchors.add(op.anchor);
  }

  // ── Compute target revision ───────────────────────────────────────────────
  const newRevision = sameRevision ? currentRevision : currentRevision + 1;
  if (!sameRevision) checkRevisionMonotonic(currentRevision, newRevision);

  const today = new Date().toISOString().slice(0, 10);
  const updates = {
    revision: String(newRevision),
    updated: today,
    status: STATUS_REVIEW_PENDING,
  };

  // ── Splice + BEH-5 atomicity gate ────────────────────────────────────────
  // The frontmatter update (revision/updated/status) always happens. Only
  // the BODY portion of what gets written is conditional on the
  // splice succeeding: if nothing validated+changed, or the post-splice
  // full-document reparse gate fails, the body written is the ORIGINAL body
  // (byte-identical) and every anchor that was part of the failed/rolled-
  // back attempt is reported `unresolved`, never partially applied (BEH-5).
  let finalBody = fm.body;
  if (acceptedOps.length > 0) {
    let splicedBody = fm.body;
    const ordered = [...acceptedOps].sort((a, b) => b.start - a.start);
    for (const op of ordered) {
      splicedBody = splicedBody.slice(0, op.start) + op.text + splicedBody.slice(op.end);
    }
    const candidateFullText = renderFullText(fm, updates, splicedBody);
    let gate = assertFrontmatterIntact(candidateFullText, { revision: newRevision, status: STATUS_REVIEW_PENDING });
    if (gate.ok) gate = assertHeadingsOutsideSplicesIntact(fm.body, splicedBody, acceptedOps);
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

  // In the build loop (--auto, or an inner --same-revision pass) a revise
  // that changed no section produces a revision the reviewers have already
  // seen, so re-reviewing it costs a full cycle and cannot make progress.
  // Refuse before writing anything; the loop stops with NO_PROGRESS.
  if ((autoMode || sameRevision) && changedAnchors.size === 0) {
    const notFound = anchorsNotFound.length > 0 ? ` Anchors with no matching heading: ${anchorsNotFound.join(', ')}.` : '';
    throw mkErr(
      'NOTHING_TO_REVISE',
      `no section changed, so ${unresolved.length} blocker(s) would stay unresolved on an unchanged revision.${notFound}`,
    );
  }

  let decisionsWritten = [];
  const decisionGroups = collectDecisionGroups(blockerEntries);
  if (decisionGroups.length > 0) {
    resolveDecisionPaths(projectRoot, specPath);
    const composed = _composeDecisions(finalBody, decisionGroups);
    const identity = assertOnlyDecisionsSectionChanged(finalBody, composed.body);
    if (!identity.ok) throw mkErr('SPLICE_VALIDATION_FAILED', identity.reason);
    finalBody = composed.body;
    decisionsWritten = composed.written.map((w) => ({ dec: w.dec, blocker_ids: w.blockerIds }));
    advisories.push(...composed.advisories);
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

  // ── Emit spec_revised event (revision transitions only) ─────────────────
  if (!sameRevision) {
    reportSpecRevised(projectRoot, specPath, {
      from_revision: currentRevision,
      to_revision: newRevision,
      addressed_blocker_ids: addressed,
      unresolved_blocker_ids: unresolved,
    });
  }

  return {
    fromRevision: currentRevision,
    toRevision: newRevision,
    sameRevision,
    addressed,
    unresolved,
    specPath,
    blockersCleared,
    advisories,
    decisions_written: decisionsWritten,
  };
}
