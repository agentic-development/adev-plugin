/**
 * Diff-scoped review dispatch (BEH-8). Pure helpers — no filesystem, no
 * lifecycle-log reads. `lib/cli/governance.mjs`'s `diff-scope` subcommand
 * owns sourcing `prevText`/`currText` (git-backed, best-effort) and the
 * "is this the spec's first review" lifecycle check; these two functions
 * only ever operate on text already in hand.
 *
 * On a re-review cycle (BLOCK→revise loop, revision N → N+1), most of a
 * spec's body is byte-identical to the prior revision — only the anchors an
 * authoring subagent actually touched changed. Re-dispatching every
 * `triggered` reviewer against the FULL spec on every cycle re-scores
 * keywords against content that didn't change, which is both wasted cost
 * and a source of re-flagging findings the reviewer already accepted last
 * cycle. Scoping `shouldDispatch`'s `specContent` (and each dispatched
 * reviewer's rendered context pack) to just the changed + cross-referenced
 * sections keeps dispatch decisions and context proportional to what
 * actually changed. `dispatch: always` reviewers are unaffected —
 * `shouldDispatch` returns `dispatch: true` for them regardless of
 * `specContent`.
 *
 * @module lib/governance/diff-scope
 */

import { listSections } from '../section-anchors.mjs';

/**
 * Split markdown text into `{ anchor, headingText, level, start, end, text }`
 * sections: a heading line plus everything up to the next heading of the
 * same-or-higher level, or EOF. Content before the first heading is not a
 * section (nothing to anchor it to).
 *
 * @param {string} text
 * @returns {Array<{anchor: string, headingText: string, level: number, start: number, end: number, text: string}>}
 */
function splitIntoSections(text) {
  return listSections(text).map(s => ({
    anchor: s.anchor,
    headingText: s.headingText,
    level: s.level,
    start: s.headingStart,
    end: s.end,
    text: text.slice(s.headingStart, s.end).replace(/\n$/, ''),
  }));
}

/**
 * Return the current text of every heading section whose content differs
 * (or is entirely new) between `prevText` and `currText`. Comparison is
 * over each section's full rendered text (heading line + body), keyed by
 * anchor. A section present in `prevText` but absent from `currText` is
 * NOT reported — nothing to dispatch a reviewer against for content that
 * no longer exists.
 *
 * @param {string} prevText - the spec's text as of the last reviewed revision
 * @param {string} currText - the spec's current text
 * @returns {Map<string, string>} anchor -> current section text (changed anchors only)
 */
export function extractChangedSections(prevText, currText) {
  const prevSections = new Map(splitIntoSections(prevText).map(s => [s.anchor, s.text]));
  const currSections = splitIntoSections(currText);
  const changed = new Map();
  for (const s of currSections) {
    const prior = prevSections.get(s.anchor);
    if (prior === undefined || prior !== s.text) {
      changed.set(s.anchor, s.text);
    }
  }
  return changed;
}

/**
 * Expand a set of changed anchors with every section that CITES one of
 * them: a markdown link `[...](#<anchor>)`, or a literal, case-insensitive
 * mention of the target heading's own text. Literal-text scan only — this
 * is not a general reference resolver (no synonym matching, no fuzzy
 * matching); a section must actually name the changed heading to be pulled
 * in. Always includes the original `changedAnchors` themselves.
 *
 * @param {string} specText - the CURRENT spec text (post-change) to scan for citations
 * @param {Set<string>|Iterable<string>} changedAnchors
 * @returns {Set<string>} changedAnchors plus every citing section's anchor
 */
export function expandWithCrossReferences(specText, changedAnchors) {
  const changed = new Set(changedAnchors);
  const expanded = new Set(changed);
  const sections = splitIntoSections(specText);

  // Map each changed anchor to the heading text it was slugified from, so a
  // literal-text mention can be matched case-insensitively.
  const changedHeadingTexts = new Map();
  for (const s of sections) {
    if (changed.has(s.anchor)) changedHeadingTexts.set(s.anchor, s.headingText.toLowerCase());
  }

  for (const s of sections) {
    if (changed.has(s.anchor)) continue; // already included
    const lowerText = s.text.toLowerCase();
    let cites = false;
    for (const anchor of changed) {
      if (s.text.includes(`(#${anchor})`)) { cites = true; break; }
      const headingText = changedHeadingTexts.get(anchor);
      // Word-boundary match, not a bare substring test — a short heading
      // like "A" or "Notes" must not match as a fragment inside an
      // unrelated word (e.g. "A" inside "unrelated").
      if (headingText && headingText.length > 0) {
        const escaped = headingText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const wordBoundaryRe = new RegExp(`\\b${escaped}\\b`);
        if (wordBoundaryRe.test(lowerText)) { cites = true; break; }
      }
    }
    if (cites) expanded.add(s.anchor);
  }
  return expanded;
}

/**
 * Render the scoped review content for `anchors`: each selected section's
 * current text, in document order, with any section that lies inside another
 * selected section left out. A section's text already includes its
 * sub-sections, so emitting both would hand reviewers the same text twice.
 *
 * @param {string} specText - the CURRENT spec text
 * @param {Iterable<string>} anchors
 * @returns {string}
 */
export function renderScopedContent(specText, anchors) {
  const wanted = new Set(anchors);
  const seen = new Set();
  const selected = [];
  for (const s of splitIntoSections(specText)) {
    if (!wanted.has(s.anchor) || seen.has(s.anchor)) continue;
    seen.add(s.anchor);
    selected.push(s);
  }
  const outermost = selected.filter(s => !selected.some(o => o !== s && o.start <= s.start && s.end <= o.end));
  return outermost.map(s => s.text).join('\n\n');
}
