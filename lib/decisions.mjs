/**
 * Operator-decision queries and recording over a spec's `.blockers.md`
 * sidecar: `computePending` (read-only), `recordDecisions` (sole writer of the
 * answer keys), and the path/input containment both depend on.
 *
 * Two constraints govern what may be stored. The sidecar is a committed
 * artifact, and nothing reaches it unredacted: every `choice`/`note` passes
 * the unsafe-text gate and `_redactForBlockers` before storage, so neither
 * the sidecar nor, through revise, the committed spec can carry a secret an
 * operator pasted into an answer. Over-long or gate-failing text is refused,
 * never truncated, so the stored answer is always exactly what was approved.
 *
 * @module lib/decisions
 */

import { lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

import { codedError as mkErr } from './errors.mjs';
import { assertContained } from './extensions/exec-payload.mjs';
import {
  _redactForBlockers,
  readSidecarRevision,
  sidecarPathForSpec,
  writeDecisionAnswers,
} from './blockers-writer.mjs';
import { parseBlockersSidecar, parseFrontmatter } from './specify-revise.mjs';
import { listSections } from './section-anchors.mjs';
import { findHeadingFenceAware, parseDecisionsOfRecord } from './decisions-of-record.mjs';
import {
  DECISION_TEXT_BOUNDS,
  checkUnsafeDecisionText,
  deriveQuestion,
  headerFor,
  normalizeQuestion,
} from './decision-text.mjs';
import { stripForDisplay } from './governance/remedy-ref-render.mjs';

export const ASK_ROUND_GROUP_LIMIT = 16;

const ANSWERS_MAX_BYTES = 64 * 1024;
const SPEC_SUFFIX = '.spec.md';
const SIDECAR_SUFFIX = '.blockers.md';
const OPTIONS_MIN = 2;
const OPTIONS_MAX = 4;

const codePoints = (s) => [...s].length;

function resolveSpecsRoot(projectRoot) {
  try {
    return realpathSync(join(projectRoot, '.context-index', 'specs'));
  } catch {
    throw mkErr('INVALID_SPEC_PATH', 'the project has no .context-index/specs/ directory');
  }
}

/**
 * Resolve and contain the spec and its derived sidecar.
 *
 * The spec's realpath must sit under `<root>/.context-index/specs/` and end in
 * `.spec.md`. The sidecar is resolved from the spec's real directory: when it
 * exists its realpath must stay inside the root (a dangling or escaping
 * symlink is refused); when absent, the parent directory is already contained
 * and only the derived file name is checked. Messages name the path only,
 * never file content.
 *
 * @param {string} projectRoot
 * @param {string} specPath
 * @returns {{ absSpec: string, relSpec: string, absSidecar: string, sidecarExists: boolean }}
 * @throws {Error} `INVALID_SPEC_PATH`
 */
export function resolveDecisionPaths(projectRoot, specPath) {
  const bad = (what) => mkErr('INVALID_SPEC_PATH', `${what}: ${String(specPath)}`);
  if (typeof projectRoot !== 'string' || projectRoot === '') {
    throw mkErr('INVALID_SPEC_PATH', 'projectRoot must be a non-empty string');
  }
  if (typeof specPath !== 'string' || specPath === '' || !specPath.endsWith(SPEC_SUFFIX)) {
    throw bad(`spec path must be a non-empty path ending with ${SPEC_SUFFIX}`);
  }
  let absSpec;
  try {
    absSpec = assertContained(projectRoot, specPath, { label: specPath });
  } catch {
    throw bad('spec path is unresolvable or escapes the project root');
  }
  const specsRoot = resolveSpecsRoot(projectRoot);
  if (!absSpec.startsWith(specsRoot + sep) || !absSpec.endsWith(SPEC_SUFFIX)) {
    throw bad('spec path must resolve to a *.spec.md under .context-index/specs/');
  }
  const realRoot = realpathSync(resolve(projectRoot));
  const relSpec = relative(realRoot, absSpec).split(sep).join('/');
  const stem = basename(absSpec).slice(0, -SPEC_SUFFIX.length);
  const sidecarName = `${stem}${SIDECAR_SUFFIX}`;
  const candidate = join(dirname(absSpec), sidecarName);

  let present = true;
  try {
    lstatSync(candidate);
  } catch (e) {
    if (e.code !== 'ENOENT') throw bad('sidecar path cannot be inspected');
    present = false;
  }
  if (!present) {
    return { absSpec, relSpec, absSidecar: candidate, sidecarExists: false };
  }
  let absSidecar;
  try {
    absSidecar = assertContained(projectRoot, candidate, { label: sidecarName });
  } catch {
    throw bad('sidecar path is unresolvable or escapes the project root');
  }
  return { absSpec, relSpec, absSidecar, sidecarExists: true };
}

const invalidAnswers = (why) => mkErr('INVALID_DECISION_ANSWERS', `invalid --answers: ${why}`);

function validateAnswersShape(parsed) {
  if (!Array.isArray(parsed) || parsed.length === 0) throw invalidAnswers('expected a non-empty JSON array');
  const seen = new Set();
  return parsed.map((a, i) => {
    if (!a || typeof a !== 'object' || Array.isArray(a)) throw invalidAnswers(`entry ${i} must be an object`);
    if (!Array.isArray(a.blocker_ids) || a.blocker_ids.length === 0 ||
        !a.blocker_ids.every((id) => typeof id === 'string' && id !== '')) {
      throw invalidAnswers(`entry ${i} needs a non-empty blocker_ids array of strings`);
    }
    if (typeof a.choice !== 'string' || a.choice === '') {
      throw invalidAnswers(`entry ${i} needs a non-empty string choice`);
    }
    if (a.note !== undefined && a.note !== null && typeof a.note !== 'string') {
      throw invalidAnswers(`entry ${i} note must be a string`);
    }
    for (const id of a.blocker_ids) {
      if (seen.has(id)) throw invalidAnswers(`blocker_id ${id} appears more than once`);
      seen.add(id);
    }
    const out = { blocker_ids: [...a.blocker_ids], choice: a.choice };
    if (typeof a.note === 'string') out.note = a.note;
    return out;
  });
}

/**
 * Read and validate the `--answers` value: inline JSON or `@path` (contained
 * in the project root). Capped at 64 KiB either way. No input content appears
 * in any message.
 *
 * @param {string} projectRoot
 * @param {string} raw
 * @returns {Array<{ blocker_ids: string[], choice: string, note?: string }>}
 * @throws {Error} `INVALID_DECISION_ANSWERS`
 */
export function readAnswersInput(projectRoot, raw) {
  if (typeof raw !== 'string' || raw === '') throw invalidAnswers('a value is required');
  let text = raw;
  if (raw.startsWith('@')) {
    const path = raw.slice(1);
    let real;
    try {
      real = assertContained(projectRoot, path, { label: path });
    } catch {
      throw invalidAnswers(`file path is unresolvable or escapes the project root: ${path}`);
    }
    let size;
    try {
      size = statSync(real).size;
    } catch {
      throw invalidAnswers(`file cannot be read: ${path}`);
    }
    if (size > ANSWERS_MAX_BYTES) throw invalidAnswers(`file exceeds ${ANSWERS_MAX_BYTES} bytes`);
    try {
      text = readFileSync(real, 'utf8');
    } catch {
      throw invalidAnswers(`file cannot be read: ${path}`);
    }
  }
  if (Buffer.byteLength(text, 'utf8') > ANSWERS_MAX_BYTES) {
    throw invalidAnswers(`input exceeds ${ANSWERS_MAX_BYTES} bytes`);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw invalidAnswers('input is not valid JSON');
  }
  return validateAnswersShape(parsed);
}

function readSpec(path) {
  const fm = parseFrontmatter(readFileSync(path, 'utf8'));
  const revision = parseInt(fm.fields.revision, 10);
  return { revision: Number.isInteger(revision) ? revision : null, body: fm.body };
}

const isDecision = (e) => e.finding_class === 'decision';

function storedQuestion(entry, advisories) {
  if (entry.question === null || entry.question === undefined) return null;
  const gate = typeof entry.question === 'string' ? checkUnsafeDecisionText(entry.question) : { ok: false, reason: 'value must be a string' };
  if (gate.ok) return entry.question;
  advisories.push({ code: 'DECISION_TEXT_REJECTED', blocker_id: entry.blocker_id, field: 'question', reason: gate.reason });
  return null;
}

function storedOptions(entry, advisories) {
  const raw = entry.options;
  if (!Array.isArray(raw) || raw.length === 0) return [];
  for (const o of raw) {
    const fields = o && typeof o === 'object' ? [o.label, o.implications ?? ''] : [null];
    for (const f of fields) {
      const gate = checkUnsafeDecisionText(f);
      if (!gate.ok) {
        advisories.push({ code: 'DECISION_TEXT_REJECTED', blocker_id: entry.blocker_id, field: 'options', reason: gate.reason });
        return [];
      }
    }
  }
  return raw.map((o) => ({ label: stripForDisplay(o.label), implications: stripForDisplay(o.implications ?? '') }));
}

/**
 * Read-only view of a spec's open and answered operator decisions.
 *
 * @param {string} projectRoot
 * @param {string} specPath
 * @returns {{ spec: string, pending: Array<object>, answered: Array<object>, decided: Array<{dec: string, blocker_ids: string[]}>, ask_round: {limit: number, asked: number, overflow: number}, advisories: Array<object> }}
 * @throws {Error} `INVALID_SPEC_PATH`
 */
export function computePending(projectRoot, specPath) {
  const { absSpec, relSpec, absSidecar, sidecarExists } = resolveDecisionPaths(projectRoot, specPath);
  const { body } = readSpec(absSpec);
  const advisories = [];

  const sections = listSections(body);
  const position = new Map();
  sections.forEach((s, i) => { if (!position.has(s.anchor)) position.set(s.anchor, { index: i, heading: s.headingText }); });

  const sidecarText = sidecarExists ? readFileSync(absSidecar, 'utf8') : '';
  const entries = parseBlockersSidecar(sidecarText).filter(isDecision);

  const open = entries
    .filter((e) => e.decision_choice === null)
    .sort((a, b) => {
      const pa = position.get(a.section_anchor)?.index ?? Infinity;
      const pb = position.get(b.section_anchor)?.index ?? Infinity;
      if (pa !== pb) return pa < pb ? -1 : 1;
      return a.blocker_id < b.blocker_id ? -1 : a.blocker_id > b.blocker_id ? 1 : 0;
    });

  const firstByKey = new Map();
  const pending = open.map((e) => {
    let question = storedQuestion(e, advisories);
    if (question === null) {
      const d = deriveQuestion(e.prose, e.blocker_id, { redact: _redactForBlockers });
      question = d.question;
      advisories.push({ code: 'QUESTION_DERIVED', blocker_id: e.blocker_id, fallback: d.fallback });
    }
    question = stripForDisplay(question);
    const options = storedOptions(e, advisories);
    const heading = position.get(e.section_anchor)?.heading ?? e.section_anchor;
    const item = {
      blocker_id: e.blocker_id,
      section_anchor: e.section_anchor,
      question,
      options,
      header: headerFor(heading),
      structured: options.length >= OPTIONS_MIN && options.length <= OPTIONS_MAX,
    };
    const key = `${e.section_anchor}\u0000${normalizeQuestion(question)}`;
    if (firstByKey.has(key)) item.duplicate_of = firstByKey.get(key);
    else firstByKey.set(key, e.blocker_id);
    return item;
  });

  let groups = 0;
  const groupAsk = new Map();
  for (const item of pending) {
    if (item.duplicate_of === undefined) {
      groups += 1;
      groupAsk.set(item.blocker_id, groups <= ASK_ROUND_GROUP_LIMIT);
    }
  }
  for (const item of pending) item.ask = groupAsk.get(item.duplicate_of ?? item.blocker_id);
  const asked = Math.min(groups, ASK_ROUND_GROUP_LIMIT);

  const answered = entries
    .filter((e) => e.decision_choice !== null)
    .map((e) => ({
      blocker_id: e.blocker_id,
      section_anchor: e.section_anchor,
      decision_choice: stripForDisplay(e.decision_choice),
      decision_note: e.decision_note === null ? null : stripForDisplay(e.decision_note),
      decision_recorded: e.decision_recorded,
    }));

  const section = findHeadingFenceAware(body, 2, 'Decisions of Record');
  let decided = [];
  if (section) {
    const parsed = parseDecisionsOfRecord(body.slice(section.contentStart, section.end));
    decided = parsed.entries.map((d) => ({ dec: d.dec, blocker_ids: d.blockerIds }));
    advisories.push(...parsed.advisories);
  }

  return {
    spec: relSpec,
    pending,
    answered,
    decided,
    ask_round: { limit: ASK_ROUND_GROUP_LIMIT, asked, overflow: groups - asked },
    advisories,
  };
}

const unsafe = (field, why) => mkErr('UNSAFE_DECISION_TEXT', `${field} refused: ${why}`);

function checkAnswerText(value, field) {
  if (codePoints(value) > DECISION_TEXT_BOUNDS[field]) {
    throw unsafe(field, `exceeds ${DECISION_TEXT_BOUNDS[field]} characters`);
  }
  const gate = checkUnsafeDecisionText(value);
  if (!gate.ok) throw unsafe(field, gate.reason);
}

/**
 * Record operator answers on the sidecar. Every answer is validated before
 * anything is written; one `writeDecisionAnswers` call then applies them all.
 *
 * @param {string} projectRoot
 * @param {string} specPath
 * @param {Array<{ blocker_ids: string[], choice: string, note?: string|null }>} answers
 * @param {{ now?: () => string }} [options] - `now` is a test-only clock override
 * @returns {{ recorded: string[], advisories: Array<object> }}
 * @throws {Error} INVALID_SPEC_PATH, NO_REVIEW_SIDECARS, BLOCKERS_REVISION_MISMATCH,
 *   INVALID_DECISION_ANSWERS, UNKNOWN_DECISION_BLOCKER, NOT_A_DECISION_BLOCKER, UNSAFE_DECISION_TEXT
 */
export function recordDecisions(projectRoot, specPath, answers, options = {}) {
  const shaped = validateAnswersShape(answers);
  const { absSpec, relSpec, absSidecar, sidecarExists } = resolveDecisionPaths(projectRoot, specPath);
  if (!sidecarExists) {
    throw mkErr('NO_REVIEW_SIDECARS', `no ${basename(sidecarPathForSpec(relSpec))} for ${relSpec}; run /adev:review-specs first`);
  }
  const sidecarText = readFileSync(absSidecar, 'utf8');
  const { revision } = readSpec(absSpec);
  const sidecarRevision = readSidecarRevision(sidecarText);
  if (revision === null || sidecarRevision !== revision) {
    throw mkErr(
      'BLOCKERS_REVISION_MISMATCH',
      `sidecar was written for spec revision ${sidecarRevision ?? 'unknown'} but the spec is at revision ${revision ?? 'unknown'}; re-run review`,
    );
  }
  const byId = new Map(parseBlockersSidecar(sidecarText).map((e) => [e.blocker_id, e]));
  for (const a of shaped) {
    for (const id of a.blocker_ids) {
      const entry = byId.get(id);
      if (!entry) throw mkErr('UNKNOWN_DECISION_BLOCKER', `no blocker ${id} in the sidecar`);
      if (!isDecision(entry)) throw mkErr('NOT_A_DECISION_BLOCKER', `blocker ${id} is not decision-classed`);
    }
    checkAnswerText(a.choice, 'choice');
    if (a.note !== undefined) checkAnswerText(a.note, 'note');
  }

  const recorded = (options.now ?? (() => new Date().toISOString()))();
  const rows = shaped.flatMap((a) => {
    const choice = _redactForBlockers(a.choice);
    const note = a.note === undefined ? null : _redactForBlockers(a.note);
    return a.blocker_ids.map((id) => ({ blocker_id: id, choice, note, recorded }));
  });
  writeDecisionAnswers(projectRoot, relSpec, rows);
  return { recorded: rows.map((r) => r.blocker_id), advisories: [] };
}

