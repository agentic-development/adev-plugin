/**
 * Parse a `renderPack` output into its nonce-fenced sections.
 *
 * Shared by every suite that asserts on pack section structure rather than on
 * substrings: anchoring on the render's OWN per-run nonce is what makes the
 * assertions non-forgeable, because the nonce cannot appear in any file on disk.
 *
 * The attribute parser deliberately distinguishes "attribute absent" from
 * "attribute present but empty": BEH-10 says a manifest section whose include
 * has neither a declared title nor a glob omits `title` ENTIRELY, and that is
 * not the same header as `title=""`.
 */

/**
 * @typedef {object} PackSection
 * @property {Record<string, string>} attrs  header attributes; a key is present
 *   only when the header actually carried it
 * @property {string} header  the raw attribute string from the opening fence
 * @property {string} body    everything between the fence lines, verbatim
 * @property {string} raw     the whole section including both fence lines
 */

/**
 * @param {string} rendered  the `rendered` string returned by `renderPack`
 * @param {string} nonce     the `nonce` returned by the SAME `renderPack` call
 * @returns {PackSection[]} sections in emission order
 */
export function parseSections(rendered, nonce) {
  if (!nonce) throw new Error("parseSections requires the render's own nonce");
  if (!rendered) return [];
  const pattern = new RegExp(
    `^<<<ADEV-PACK-${escapeRegex(nonce)}(?: ([^\\n]*?))?>>>\\n([\\s\\S]*?)\\n<<<END-ADEV-PACK-${escapeRegex(nonce)}>>>$`,
    "gm",
  );
  const sections = [];
  let match;
  while ((match = pattern.exec(rendered)) !== null) {
    const header = match[1] ?? "";
    sections.push({
      attrs: parseAttrs(header),
      header,
      body: match[2],
      raw: match[0],
    });
  }
  return sections;
}

/**
 * Parse `key="value"` pairs out of a fence header.
 *
 * A key appears in the result ONLY when the header carried it, so
 * `"title" in attrs` is a faithful test of presence.
 *
 * @param {string} header
 * @returns {Record<string, string>}
 */
export function parseAttrs(header) {
  const attrs = {};
  const pattern = /([A-Za-z_][\w-]*)="([^"]*)"/g;
  let match;
  while ((match = pattern.exec(header)) !== null) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
