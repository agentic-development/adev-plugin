/**
 * Rendering guards for GitHub issue titles and bodies, which anyone able to
 * file or edit an issue controls. Human output neutralizes titles and fences
 * bodies; `--json` output keeps both byte-raw for parsing consumers and flags
 * them with `untrusted_text` instead.
 *
 * Uses only Node.js built-ins.
 */

import { randomBytes } from "node:crypto";

import { fenceBlock } from "../../governance/context-pack.mjs";

const TITLE_MAX = 200;
const LINE_BREAKS_RE = /[\r\n\t\v\f\u0085\u2028\u2029]+/g;
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069\u200b-\u200d\ufeff]/g;

/**
 * One line, no C0/DEL/C1 controls, line/paragraph separators, bidi
 * overrides/isolates or zero-width characters, with no length cap. Line breaks
 * become a single space so adjacent words stay apart; every other such
 * character is dropped, since each can reorder or hide what a reader sees.
 *
 * @param {unknown} s
 * @returns {string}
 */
export function neutralizeInline(s) {
  const raw = typeof s === "string" ? s : String(s ?? "");
  return raw.replace(LINE_BREAKS_RE, " ").replace(CONTROL_RE, "");
}

/**
 * `neutralizeInline`, then cut to at most 200 UTF-16 code units. The cut
 * never splits a surrogate pair.
 *
 * @param {unknown} s
 * @returns {string}
 */
export function neutralizeTitle(s) {
  let out = neutralizeInline(s);
  if (out.length > TITLE_MAX) {
    out = out.slice(0, TITLE_MAX);
    const last = out.charCodeAt(out.length - 1);
    if (last >= 0xd800 && last <= 0xdbff) out = out.slice(0, -1);
  }
  return out;
}

/**
 * Wrap notes in a pack fence with a nonce drawn fresh per call, so a body can
 * never learn or predict the delimiter that closes it. `fenceBlock` always
 * neutralizes forged fence tokens in the body, so its text is safe to emit
 * whether or not a collision was detected.
 *
 * @param {unknown} s
 * @returns {string}
 */
export function fenceNotes(s) {
  const body = typeof s === "string" ? s : String(s ?? "");
  const nonce = randomBytes(8).toString("hex");
  return fenceBlock({ nonce, attrs: 'role="untrusted-issue-body"', body }).text;
}

/**
 * Return a shallow copy of a JSON issue with `untrusted_text` naming the
 * attacker-editable fields. `title` and `notes` are left byte-raw.
 *
 * @param {object} jsonIssue
 * @returns {object}
 */
export function markUntrusted(jsonIssue) {
  return { ...jsonIssue, untrusted_text: ["title", "notes"] };
}
