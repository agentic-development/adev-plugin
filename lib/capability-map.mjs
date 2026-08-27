/**
 * Shared logic for writing a charter's Capability Map `Status` column.
 *
 * Every lifecycle skill that advances a capability's Status (`specify`,
 * `review-specs`, `plan`, `implement`, `validate`) writes into the same
 * markdown table via this module so the monotonic guard lives in one place
 * instead of being re-implemented (or forgotten) per skill.
 *
 * Canonical order per capability-status-column.spec.md Acceptance Criteria:
 *   "—" → specified → review-passed → planned → implementing → implemented → validated
 *
 * A write only lands when it moves a capability's Status strictly forward in
 * this order. Re-entering an earlier step (e.g. a re-review after
 * `/adev:validate` FAILs and the spec is revised) must not regress a row
 * that has already advanced past that step — see
 * spec-lifecycle/capability-status-column.spec.md Postcondition 2 ("A
 * capability's Status never advances past its spec's status") and the
 * companion regression this module fixes.
 *
 * Zero external dependencies — plain string/regex parsing, consistent with
 * "Skills are primarily markdown" (status lives inline in the charter table,
 * not a side database).
 *
 * @module lib/capability-map
 */

const FENCE = '---';

/**
 * Frozen, order-significant list of legal Capability Map `Status` values.
 * Index position IS the lifecycle rank — do not reorder without updating
 * every caller that depends on rank comparisons.
 *
 * @type {readonly ["—", "specified", "review-passed", "planned", "implementing", "implemented", "validated"]}
 */
export const CAPABILITY_STATUSES = Object.freeze([
  '—',
  'specified',
  'review-passed',
  'planned',
  'implementing',
  'implemented',
  'validated',
]);

/**
 * Rank of a Capability Map status in the canonical lifecycle order.
 *
 * @param {unknown} status
 * @returns {number} index in `CAPABILITY_STATUSES`, or `-1` when `status` is
 *   not a recognized value (including non-strings, empty cells, or free-text
 *   values a human typed into the table).
 */
export function capabilityStatusRank(status) {
  if (typeof status !== 'string') return -1;
  return CAPABILITY_STATUSES.indexOf(status.trim());
}

/**
 * Whether writing `nextStatus` over `currentStatus` is a legal forward move.
 *
 * An unrecognized `currentStatus` (rank `-1` — blank, free text, or a value
 * predating this enum) is treated as pre-lifecycle so a legal write can still
 * land rather than jamming forever on bad data; an unrecognized
 * `nextStatus` is a caller bug, not a data condition, and throws.
 *
 * @param {unknown} currentStatus
 * @param {string} nextStatus
 * @returns {boolean}
 * @throws {Error} `CAPABILITY_STATUS_INVALID` if `nextStatus` is not in `CAPABILITY_STATUSES`.
 */
export function isMonotonicCapabilityAdvance(currentStatus, nextStatus) {
  const nextRank = capabilityStatusRank(nextStatus);
  if (nextRank === -1) {
    const err = new Error(
      `capability status ${JSON.stringify(nextStatus)} is not in CAPABILITY_STATUSES (legal: ${CAPABILITY_STATUSES.join(', ')})`,
    );
    err.code = 'CAPABILITY_STATUS_INVALID';
    throw err;
  }
  const currentRank = capabilityStatusRank(currentStatus);
  if (currentRank === -1) return true;
  return nextRank > currentRank;
}

function todayIso(today) {
  if (typeof today === 'string' && today) return today;
  return new Date().toISOString().slice(0, 10);
}

function splitRow(line) {
  // Markdown table row: strip one leading/trailing "|" then split on "|".
  // Cells are NOT unescaped ("\|") — none of the charter templates use
  // escaped pipes inside Capability Map cells.
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|');
}

function bumpFrontmatterRevisionAndDate(content, today) {
  const lines = content.split('\n');
  if (lines[0] !== undefined && lines[0].trim() !== FENCE) {
    // No frontmatter fence at the top — leave content untouched. Charters
    // are expected to carry frontmatter (charter-status-lifecycle.spec.md),
    // but a missing/malformed fence must not block the table write itself.
    return content;
  }
  let closeIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === FENCE) { closeIdx = i; break; }
  }
  if (closeIdx === -1) return content;

  let sawRevision = false;
  for (let i = 1; i < closeIdx; i++) {
    const revMatch = /^(revision:\s*)(\d+)\s*$/.exec(lines[i]);
    if (revMatch) {
      sawRevision = true;
      const next = Number.parseInt(revMatch[2], 10) + 1;
      lines[i] = `${revMatch[1]}${next}`;
      continue;
    }
    const updatedMatch = /^(updated:\s*).*$/.exec(lines[i]);
    if (updatedMatch) {
      lines[i] = `${updatedMatch[1]}${today}`;
    }
  }
  if (!sawRevision) return content; // malformed frontmatter — leave as-is.
  return lines.join('\n');
}

/**
 * Apply a monotonic Status update to one capability row in a charter's
 * Capability Map table.
 *
 * @param {string} charterContent - full text of the charter markdown file.
 * @param {string} capabilityName - exact `Capability` column value to match (trimmed).
 * @param {string} nextStatus - one of `CAPABILITY_STATUSES` to write.
 * @param {{ today?: string }} [options] - `today` overrides the ISO date stamp (tests).
 * @returns {{
 *   content: string,
 *   updated: boolean,
 *   reason?: "CAPABILITY_NOT_FOUND"|"PARSE_ERROR"|"NOT_MONOTONIC",
 *   previousStatus?: string,
 *   newStatus?: string,
 * }}
 */
export function applyCapabilityStatus(charterContent, capabilityName, nextStatus, options = {}) {
  // Validate nextStatus up front — a caller bug, so fail loud before parsing.
  if (capabilityStatusRank(nextStatus) === -1) {
    const err = new Error(
      `capability status ${JSON.stringify(nextStatus)} is not in CAPABILITY_STATUSES (legal: ${CAPABILITY_STATUSES.join(', ')})`,
    );
    err.code = 'CAPABILITY_STATUS_INVALID';
    throw err;
  }

  const lines = charterContent.split('\n');
  const headingIdx = lines.findIndex((l) => l.trim() === '## Capability Map');
  if (headingIdx === -1) {
    return { content: charterContent, updated: false, reason: 'PARSE_ERROR' };
  }

  // Header row: first non-blank line after the heading that looks like a
  // table row ("| ... |").
  let headerIdx = -1;
  for (let i = headingIdx + 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '') continue;
    if (trimmed.startsWith('|')) { headerIdx = i; break; }
    // Hit non-table content before any table — no table under this heading.
    break;
  }
  if (headerIdx === -1 || lines[headerIdx + 1] === undefined || !/^\|?[\s:-]+\|/.test(lines[headerIdx + 1].trim())) {
    return { content: charterContent, updated: false, reason: 'PARSE_ERROR' };
  }

  const headerCells = splitRow(lines[headerIdx]).map((c) => c.trim());
  const capabilityColIdx = headerCells.indexOf('Capability');
  const statusColIdx = headerCells.indexOf('Status');
  if (capabilityColIdx === -1 || statusColIdx === -1) {
    return { content: charterContent, updated: false, reason: 'PARSE_ERROR' };
  }

  const bodyStart = headerIdx + 2; // skip header + separator row
  let matchLineIdx = -1;
  let matchCells = null;
  for (let i = bodyStart; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed.startsWith('|')) break; // table ends at first non-row line
    const cells = splitRow(lines[i]);
    if (cells.length <= Math.max(capabilityColIdx, statusColIdx)) continue;
    if (cells[capabilityColIdx].trim() === capabilityName.trim()) {
      matchLineIdx = i;
      matchCells = cells;
      break;
    }
  }

  if (matchLineIdx === -1) {
    return { content: charterContent, updated: false, reason: 'CAPABILITY_NOT_FOUND' };
  }

  const previousStatus = matchCells[statusColIdx].trim();
  if (!isMonotonicCapabilityAdvance(previousStatus, nextStatus)) {
    return {
      content: charterContent,
      updated: false,
      reason: 'NOT_MONOTONIC',
      previousStatus,
      newStatus: nextStatus,
    };
  }

  // Preserve the cell's original padding style by re-using its surrounding
  // whitespace where present, defaulting to a single space each side.
  const original = matchCells[statusColIdx];
  const leading = /^\s*/.exec(original)[0] || ' ';
  const trailing = /\s*$/.exec(original)[0] || ' ';
  matchCells[statusColIdx] = `${leading}${nextStatus}${trailing}`;
  lines[matchLineIdx] = `|${matchCells.join('|')}|`;

  const today = todayIso(options.today);
  const rewritten = bumpFrontmatterRevisionAndDate(lines.join('\n'), today);

  return {
    content: rewritten,
    updated: true,
    previousStatus,
    newStatus: nextStatus,
  };
}
