/**
 * Markdown heading anchors: the one slug rule and section-range model shared
 * by blocker writing (`lib/blockers-writer.mjs`), revise splicing
 * (`lib/specify-revise.mjs`) and diff-scoped review
 * (`lib/governance/diff-scope.mjs`). A blocker's `section_anchor` is matched
 * against these slugs, so all three must agree byte-for-byte on how a heading
 * becomes an anchor and where its section ends.
 *
 * @module lib/section-anchors
 */

/** ATX heading line: `#`..`######`, then the heading text. */
export const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;

/** GitHub-style-ish heading slug: lowercase, strip non [a-z0-9-], collapse. */
export function slugifyHeading(text) {
  return String(text ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Every ATX heading in `text`, in document order, with character offsets.
 * A section runs from its heading line to the next heading of the same or
 * higher level (or EOF), so a parent section's range contains its
 * sub-sections. Headings whose text slugifies to nothing are skipped.
 *
 * @param {string} text
 * @returns {Array<{anchor: string, headingText: string, level: number, headingStart: number, contentStart: number, end: number}>}
 */
export function listSections(text) {
  if (typeof text !== 'string' || text.length === 0) return [];
  const lines = text.split('\n');
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
    const headingText = m[2].trim();
    const anchor = slugifyHeading(headingText);
    if (!anchor) continue;
    const headingStart = offsets[i];
    const contentStart = Math.min(headingStart + lines[i].length + 1, text.length);
    headings.push({ anchor, headingText, level: m[1].length, headingStart, contentStart });
  }
  return headings.map((h, i) => {
    let end = text.length;
    for (let j = i + 1; j < headings.length; j++) {
      if (headings[j].level <= h.level) { end = headings[j].headingStart; break; }
    }
    return { ...h, end };
  });
}

/**
 * Map each anchor to its section's CONTENT range (after the heading line,
 * up to the section end). The first heading with a given slug wins.
 *
 * @param {string} body - frontmatter-stripped spec body
 * @returns {Map<string, {start: number, end: number}>}
 */
export function resolveSectionAnchors(body) {
  const map = new Map();
  for (const s of listSections(body)) {
    if (!map.has(s.anchor)) map.set(s.anchor, { start: s.contentStart, end: s.end });
  }
  return map;
}

/** True when range `inner` lies within range `outer` and is not the same range. */
export function isNestedRange(inner, outer) {
  return outer.start <= inner.start && inner.end <= outer.end
    && !(outer.start === inner.start && outer.end === inner.end);
}
