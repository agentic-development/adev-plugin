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
 * Split markdown text into `{ anchor, headingText, level, text }` sections.
 * A "section" is a heading line plus every line up to (not including) the
 * next heading of the same-or-higher level, or EOF. Content before the
 * first heading is not returned as a section (nothing to anchor it to).
 *
 * @param {string} text
 * @returns {Array<{anchor: string, headingText: string, level: number, text: string}>}
 */
function splitIntoSections(text) {
  if (typeof text !== 'string' || text.length === 0) return [];
  const lines = text.split('\n');
  const headings = [];
  for (let i = 0; i < lines.length; i++) {
    const m = HEADING_RE.exec(lines[i]);
    if (!m) continue;
    const headingText = m[2].trim();
    const anchor = slugifyHeading(headingText);
    if (!anchor) continue;
    headings.push({ anchor, headingText, level: m[1].length, lineIndex: i });
  }
  const sections = [];
  for (let i = 0; i < headings.length; i++) {
    const h = headings[i];
    let endLine = lines.length;
    for (let j = i + 1; j < headings.length; j++) {
      if (headings[j].level <= h.level) { endLine = headings[j].lineIndex; break; }
    }
    sections.push({
      anchor: h.anchor,
      headingText: h.headingText,
      level: h.level,
      text: lines.slice(h.lineIndex, endLine).join('\n'),
    });
  }
  return sections;
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
