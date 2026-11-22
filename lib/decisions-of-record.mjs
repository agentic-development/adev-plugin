/**
 * Pure text model of the `## Decisions of Record` spec section: fence-aware
 * heading lookup, entry parsing, entry composition, and in-place
 * replacement/append of operator decisions. No I/O.
 *
 * An entry is exactly a well-formed marker line
 * `<!-- adev:decision DEC-<n> blockers=<id>,<id> -->` plus the immediately
 * following line `- **DEC-<n>** — ...` carrying the same `<n>`. Any other
 * shape is malformed: preserved byte-for-byte, reported as
 * `DECISION_MARKER_MALFORMED`, and never replaced. The tooling never deletes
 * an entry; it only appends or replaces in place.
 *
 * Entry ids (`dec`) are the string form `DEC-<n>`; `maxDec` is a number.
 *
 * @module lib/decisions-of-record
 */

import { HEADING_RE } from './section-anchors.mjs';
import { parseBlockerId } from './blocker-id.mjs';

const MARKER_PREFIX = '<!-- adev:decision';
const MARKER_RE = /^<!-- adev:decision DEC-(\d+) blockers=([^\s]+) -->$/;
const BULLET_NUM_RE = /^- \*\*DEC-(\d+)\*\* — /;
const FENCE_OPEN_RE = /^ {0,3}(`{3,}|~{3,})/;
const SECTION_TITLE = 'Decisions of Record';

const entryRe = (n) => new RegExp(`^- \\*\\*DEC-${n}\\*\\* — `);

function scanLines(text) {
  const lines = [];
  let offset = 0;
  for (const line of text.split('\n')) {
    lines.push({ text: line, start: offset, end: offset + line.length });
    offset += line.length + 1;
  }
  return lines;
}

/**
 * Locate an ATX heading outside fenced code blocks. A fence closes only on the
 * same fence character at >= the opening length with nothing after it.
 *
 * @param {string} text
 * @param {number} level - heading level (1-6)
 * @param {string} title - exact heading text
 * @returns {{headingStart: number, contentStart: number, end: number} | null}
 *   `end` is the next same-or-higher-level heading outside a fence, or `text.length`.
 */
export function findHeadingFenceAware(text, level, title) {
  const lines = scanLines(text);
  let fence = null;
  let found = null;
  for (const line of lines) {
    if (fence) {
      const m = /^ {0,3}(`+|~+)\s*$/.exec(line.text);
      if (m && m[1][0] === fence.char && m[1].length >= fence.len) fence = null;
      continue;
    }
    const open = FENCE_OPEN_RE.exec(line.text);
    if (open) {
      fence = { char: open[1][0], len: open[1].length };
      continue;
    }
    const h = HEADING_RE.exec(line.text);
    if (!h) continue;
    if (found) {
      if (h[1].length <= level) return { ...found, end: line.start };
      continue;
    }
    if (h[1].length === level && h[2].trim() === title) {
      found = {
        headingStart: line.start,
        contentStart: Math.min(line.end + 1, text.length),
      };
    }
  }
  return found ? { ...found, end: text.length } : null;
}

function malformedAdvisory(reason, line) {
  return {
    code: 'DECISION_MARKER_MALFORMED',
    reason,
    message: `Decision marker preserved verbatim (${reason}): ${line}`,
  };
}

/**
 * Parse the content of a `## Decisions of Record` section.
 *
 * `maxDec` is the highest DEC number on any line starting `<!-- adev:decision`
 * (malformed included) or any `- **DEC-<n>** — ` bullet, so a new allocation
 * can never collide with a line the tooling refuses to touch. Offsets are
 * relative to `sectionText`; an entry's range spans marker line through bullet
 * line (excluding the trailing newline).
 *
 * @param {string} sectionText
 * @returns {{
 *   entries: Array<{dec: string, blockerIds: string[], start: number, end: number}>,
 *   malformed: Array<{start: number, end: number, reason: string}>,
 *   maxDec: number,
 *   advisories: Array<{code: string, reason: string, message: string}>
 * }}
 */
export function parseDecisionsOfRecord(sectionText) {
  const lines = scanLines(sectionText ?? '');
  const entries = [];
  const malformed = [];
  const advisories = [];
  let maxDec = 0;
  const bump = (n) => { if (n > maxDec) maxDec = n; };

  lines.forEach((line, i) => {
    const bullet = BULLET_NUM_RE.exec(line.text);
    if (bullet) bump(Number(bullet[1]));
    if (!line.text.startsWith(MARKER_PREFIX)) return;
    for (const m of line.text.matchAll(/DEC-(\d+)/g)) bump(Number(m[1]));

    const flag = (reason) => {
      malformed.push({ start: line.start, end: line.end, reason });
      advisories.push(malformedAdvisory(reason, line.text));
    };
    const m = MARKER_RE.exec(line.text);
    if (!m) return flag('marker line does not parse');
    const ids = m[2].split(',');
    try {
      ids.forEach((id) => parseBlockerId(id));
    } catch {
      return flag('blockers= contains an invalid blocker id');
    }
    const next = lines[i + 1];
    if (!next || !entryRe(m[1]).test(next.text)) {
      return flag(`marker is not followed by a "- **DEC-${m[1]}** — " line`);
    }
    entries.push({ dec: `DEC-${m[1]}`, blockerIds: ids, start: line.start, end: next.end });
  });
  return { entries, malformed, maxDec, advisories };
}

const decLabel = (dec) => (typeof dec === 'number' ? `DEC-${dec}` : String(dec));
const markerLine = (dec, ids) => `${MARKER_PREFIX} ${decLabel(dec)} blockers=${ids.join(',')} -->`;
// Sentences are terminated with a period only when they do not already end in
// terminal punctuation, so the entry never reads "..".
const terminate = (s) => (/[.!?]$/.test(s) ? s : `${s}.`);

/**
 * Compose the two-line entry. The implications sentence is included only when
 * non-null (the caller passes it only when the choice matches an option
 * label); likewise the note.
 *
 * @param {{dec: string|number, blockerIds: string[], question: string, choice: string, implications?: string|null, note?: string|null}} p
 * @returns {string} marker line + newline + bullet line (no trailing newline)
 */
export function composeEntry({ dec, blockerIds, question, choice, implications = null, note = null }) {
  let bullet = `- **${decLabel(dec)}** — ${question} → **${choice}**.`;
  if (implications) bullet += ` ${terminate(implications)}`;
  if (note) bullet += ` ${terminate(note)}`;
  return `${markerLine(dec, blockerIds)}\n${bullet}`;
}

function applyOne(text, parsed, decision) {
  const ids = new Set(decision.blockerIds);
  const touched = parsed.entries.filter((e) => e.blockerIds.some((id) => ids.has(id)));
  const fullEntries = touched.filter((e) => e.blockerIds.every((id) => ids.has(id)));
  const edits = [];
  const written = [];
  let append = null;

  if (fullEntries.length > 0) {
    const covered = new Set(fullEntries.flatMap((e) => e.blockerIds));
    const added = decision.blockerIds.filter((id) => !covered.has(id));
    fullEntries.forEach((e, i) => {
      const blockerIds = i === 0 ? [...e.blockerIds, ...added] : e.blockerIds;
      edits.push({ start: e.start, end: e.end, text: composeEntry({ ...decision, dec: e.dec, blockerIds }) });
      written.push({ dec: e.dec, blockerIds });
    });
  } else {
    const dec = `DEC-${parsed.maxDec + 1}`;
    append = composeEntry({ ...decision, dec });
    written.push({ dec, blockerIds: [...decision.blockerIds] });
  }
  for (const e of touched) {
    if (fullEntries.includes(e)) continue;
    const remaining = e.blockerIds.filter((id) => !ids.has(id));
    const markerEnd = text.indexOf('\n', e.start);
    edits.push({ start: e.start, end: markerEnd, text: markerLine(e.dec, remaining) });
  }

  let out = text;
  for (const ed of edits.sort((x, y) => y.start - x.start)) {
    out = out.slice(0, ed.start) + ed.text + out.slice(ed.end);
  }
  if (append) {
    const core = out.replace(/\s+$/, '');
    const tail = out.slice(core.length);
    out = core === '' ? `${append}\n` : `${core}\n${append}${tail === '' ? '\n' : tail}`;
  }
  return { text: out, written };
}

/**
 * Apply operator decisions to the section content, one at a time.
 *
 * For a decision over blocker-id set S, well-formed entries intersecting S are
 * classified:
 * - fully covered (entry ids all in S): every such entry is replaced in place
 *   with the decision text, keeps its own DEC number and its own ids. Ids of S
 *   named by no fully-covered entry are appended, in S order, to the first
 *   fully-covered entry's marker (document order).
 * - partially covered: the marker is rewritten to drop S's ids and the bullet
 *   stays byte-identical.
 * - no entry fully covered: the decision is appended under a new DEC number
 *   naming all of S.
 * Invariants: no entry is deleted, no marker is left with an empty blockers=
 * list, each id of S ends up in exactly one entry, and malformed lines and
 * untouched entries are copied byte-for-byte. `written` lists every entry the
 * decision was written to.
 *
 * @param {string} sectionText
 * @param {Array<{blockerIds: string[], question: string, choice: string, implications?: string|null, note?: string|null}>} decisions
 * @returns {{text: string, written: Array<{dec: string, blockerIds: string[]}>, advisories: Array<object>}}
 */
export function applyDecisions(sectionText, decisions) {
  let text = sectionText ?? '';
  const written = [];
  // Malformed lines are never mutated, so the input text yields the same advisories as the output.
  const advisories = parseDecisionsOfRecord(text).advisories;
  for (const decision of decisions) {
    const res = applyOne(text, parseDecisionsOfRecord(text), decision);
    text = res.text;
    written.push(...res.written);
  }
  return { text, written, advisories };
}

/**
 * Place the section into a spec body. An existing `## Decisions of Record`
 * (fence-aware) has its content range replaced; otherwise the section is
 * inserted immediately before the fence-aware `## Acceptance Criteria`
 * heading, or appended at end of file.
 *
 * @param {string} body
 * @param {string} sectionText - section content, without the heading
 * @returns {string}
 */
export function placeSection(body, sectionText) {
  const core = sectionText.replace(/^\n+/, '').replace(/\s+$/, '');
  const existing = findHeadingFenceAware(body, 2, SECTION_TITLE);
  if (existing) {
    const trailing = existing.end < body.length ? '\n\n' : '\n';
    return `${body.slice(0, existing.contentStart)}\n${core}${trailing}${body.slice(existing.end)}`;
  }
  const section = `## ${SECTION_TITLE}\n\n${core}\n`;
  const ac = findHeadingFenceAware(body, 2, 'Acceptance Criteria');
  if (ac) return `${body.slice(0, ac.headingStart)}${section}\n${body.slice(ac.headingStart)}`;
  if (body === '') return section;
  const sep = body.endsWith('\n\n') ? '' : body.endsWith('\n') ? '\n' : '\n\n';
  return `${body}${sep}${section}`;
}
