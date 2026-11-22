/**
 * Leaf helpers for operator-decision text. Imports only other leaf modules so
 * both `blockers-writer.mjs` and `decisions.mjs` can depend on it without a
 * cycle; the redactor is injected as `{ redact }` for the same reason.
 */

import { parseBlockerId } from './blocker-id.mjs';
import { stripForDisplay } from './governance/remedy-ref-render.mjs';

export const DECISION_TEXT_BOUNDS = Object.freeze({
  question: 500,
  label: 60,
  implications: 300,
  choice: 1000,
  note: 1000,
});

/** Single-line on purpose: a marker containing a newline would itself fail the gate. */
export const SINGLE_LINE_TRUNCATION_MARKER = '…[truncated]';

const HEADER_MAX_CODE_POINTS = 12;

// \p{C} covers Cc/Cf/Cs/Co/Cn (newline, CR, NEL, bidi overrides). U+2028/U+2029
// are Zl/Zp, so they are listed explicitly.
const UNSAFE_CHARS = /[\p{C}\u2028\u2029]/u;
const UNSAFE_START = /^(?:---|#)/;
const UNSAFE_SEQUENCES = ['```', '<!--', '-->', '**'];

/**
 * Refuse (never strip) text that could break out of its markdown/YAML context.
 * Never throws.
 *
 * @param {unknown} value
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function checkUnsafeDecisionText(value) {
  if (typeof value !== 'string') return { ok: false, reason: 'value must be a string' };
  if (UNSAFE_CHARS.test(value)) {
    return { ok: false, reason: 'contains a control, format, or line-separator character' };
  }
  if (UNSAFE_START.test(value)) {
    return { ok: false, reason: 'begins with "---" or "#"' };
  }
  for (const seq of UNSAFE_SEQUENCES) {
    if (value.includes(seq)) return { ok: false, reason: `contains "${seq}"` };
  }
  return { ok: true };
}

/**
 * Cut `value` to `bound` Unicode code points and append the single-line marker.
 *
 * @param {string} value
 * @param {number} bound
 * @returns {string}
 */
export function truncateDecisionText(value, bound) {
  const cps = [...value];
  return cps.length <= bound
    ? value
    : cps.slice(0, bound).join('') + SINGLE_LINE_TRUNCATION_MARKER;
}

/**
 * Redact, truncate, then gate a reviewer-supplied decision field. The returned
 * value is exactly what must be stored; it always passes the gate re-check.
 *
 * @param {unknown} raw
 * @param {'question'|'label'|'implications'|'choice'|'note'} field
 * @param {{ redact: (s: string) => string }} deps
 * @returns {{ value: string } | { rejected: string }}
 */
export function processReviewerDecisionField(raw, field, { redact }) {
  if (typeof raw !== 'string') return { rejected: 'value must be a string' };
  const bound = DECISION_TEXT_BOUNDS[field];
  const value = truncateDecisionText(redact(raw), bound);
  const gate = checkUnsafeDecisionText(value);
  return gate.ok ? { value } : { rejected: gate.reason };
}

/**
 * @param {string} blockerId
 * @returns {string}
 * @throws {Error} `INVALID_BLOCKER_ID` when `blockerId` does not parse.
 */
export function neutralQuestion(blockerId) {
  parseBlockerId(blockerId);
  return `Which option resolves blocker ${blockerId}?`;
}

/**
 * Derive a question from blocker prose: first sentence through
 * redact, truncate, gate. When that is empty or refused, the neutral question
 * is used instead.
 *
 * Returns `fallback: 'neutral'` when the neutral question was substituted
 * (callers emit QUESTION_DERIVED on it), otherwise `fallback: null`.
 *
 * @param {unknown} prose
 * @param {string} blockerId
 * @param {{ redact: (s: string) => string }} deps
 * @returns {{ question: string, fallback: 'neutral' | null }}
 */
export function deriveQuestion(prose, blockerId, { redact }) {
  const neutral = () => ({ question: neutralQuestion(blockerId), fallback: 'neutral' });
  if (typeof prose !== 'string') return neutral();
  const trimmed = prose.trim();
  if (trimmed.length === 0) return neutral();
  const match = /^[\s\S]*?[.!?](?=\s|$)/.exec(trimmed);
  const sentence = match ? match[0] : trimmed;
  const processed = processReviewerDecisionField(sentence, 'question', { redact });
  if ('rejected' in processed) return neutral();
  return { question: processed.value, fallback: null };
}

/**
 * @param {string} question
 * @returns {string}
 */
export function normalizeQuestion(question) {
  return question.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * @param {unknown} headingText
 * @returns {string}
 */
export function headerFor(headingText) {
  return [...stripForDisplay(headingText)].slice(0, HEADER_MAX_CODE_POINTS).join('');
}

const escapeTableCell = (value) =>
  stripForDisplay(value).replace(/\\/g, '\\\\').replace(/\|/g, '\\|');

/**
 * Render the operator-facing decisions table. The options cell lists the
 * option labels in order, joined with `, `. Each cell is stripped for display,
 * then `\` is escaped before `|` so an escaped pipe is not itself re-escaped.
 *
 * @param {Array<{ blocker_id: string, section_anchor: string, question: string, options: Array<{ label: string }> }>} decisionsRequired
 * @returns {string} markdown table, or '' when there is nothing to decide
 */
export function renderDecisionsRequiredTable(decisionsRequired) {
  if (!Array.isArray(decisionsRequired) || decisionsRequired.length === 0) return '';
  const rows = decisionsRequired.map((d) => {
    const labels = (d.options ?? []).map((o) => o.label).join(', ');
    return `| ${[d.blocker_id, d.section_anchor, d.question, labels].map(escapeTableCell).join(' | ')} |`;
  });
  return ['| blocker_id | section | question | options |', '| --- | --- | --- | --- |', ...rows].join('\n');
}
