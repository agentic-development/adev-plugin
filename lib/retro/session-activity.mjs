// lib/retro/session-activity.mjs
//
// Orchestrator for the Retro Session Activity section.
//
// Globs `.context-index/sessions/*.md` under `projectRoot`, filters by the
// analysis window, classifies each file via `classifyFormat()`, dispatches
// classified sessions to sub-helpers from `session-metrics.mjs`, and
// assembles a structured result object.
//
// Invariants enforced here:
//   - Graceful absence: missing/empty sessions dir → empty result, no error.
//   - SEC-B4 read-scope: every readFile call uses a path under sessionsDir.
//     Path traversal references in body content cannot trigger reads.
//   - SA-2: format-breakdown line is computed in core, not delegated.
//   - SEC-B1: oversize bodies are dropped before sub-helper dispatch.
//
// Source spec: .context-index/specs/features/session-awareness/retro-session-consumption.spec.md
// Behaviors 1, 2, 3, 13.a.

import { readdir, readFile } from 'node:fs/promises';
import { basename, isAbsolute, resolve, sep, join } from 'node:path';
import { readSafeFrontmatter } from './safe-frontmatter.mjs';
import { classifyFormat } from './session-format.mjs';
import { isOversizeBody } from './body-scan.mjs';
import {
  parseToolUseDistribution,
  countPerSpec,
  aggregateCostTokens,
  joinClosedIssueXref,
  scanContextGaps,
} from './session-metrics.mjs';

/**
 * @typedef {Object} SessionActivityResult
 * @property {number} totalSessions
 * @property {{ hook: number, 'post-commit': number, unknown: number }} formatBreakdown
 * @property {Array<{ tool: string, count: number }>} toolUseDistribution
 * @property {Array<{ spec: string, count: number }>} perSpecCounts
 * @property {null|object} costTokens
 * @property {null|Array<object>} issueXrefs
 * @property {Array<{ spec: string, gap: string, count: number }>} contextGaps
 */

/**
 * Default empty result shape returned when sessions dir is missing/empty.
 */
function emptyResult() {
  return {
    totalSessions: 0,
    formatBreakdown: { hook: 0, 'post-commit': 0, unknown: 0 },
    toolUseDistribution: [],
    perSpecCounts: [],
    costTokens: null,
    issueXrefs: null,
    contextGaps: [],
  };
}

/**
 * Defensive containment check: ensure `abs` resolves underneath `root`.
 *
 * @param {string} root - Absolute project sessions directory.
 * @param {string} relName - Filename returned by readdir (NOT a user path).
 * @returns {string|null} Absolute path inside root, or null.
 */
function joinUnder(root, relName) {
  // readdir yields filenames only; defense-in-depth — refuse `..` or absolute.
  if (typeof relName !== 'string' || relName.length === 0) return null;
  if (relName.includes(sep) || relName.includes('/') || relName.includes('\\')) return null;
  if (relName === '.' || relName === '..') return null;
  if (isAbsolute(relName)) return null;
  const abs = resolve(root, relName);
  if (!abs.startsWith(root + sep)) return null;
  return abs;
}

/**
 * Check whether a frontmatter `date` string falls in the [since, until]
 * window. Dates are simple `YYYY-MM-DD` ISO strings (lexicographic compare
 * is correct).
 *
 * @param {string} date
 * @param {{ since: string, until: string }} window
 * @returns {boolean}
 */
function inWindow(date, window) {
  if (typeof date !== 'string' || date.length < 10) return false;
  // Compare only the YYYY-MM-DD prefix; YAML may emit `2026-05-10T00:00:00Z`.
  const d = date.slice(0, 10);
  return d >= window.since && d <= window.until;
}

/**
 * Gather session activity for the analysis window.
 *
 * @param {string} projectRoot
 * @param {{ since: string, until: string }} window
 * @param {{ issueManager?: object }} [opts]
 * @returns {Promise<SessionActivityResult>}
 */
export async function gatherSessionActivity(projectRoot, window, opts = {}) {
  if (typeof projectRoot !== 'string' || projectRoot.length === 0) {
    return emptyResult();
  }
  if (!window || typeof window.since !== 'string' || typeof window.until !== 'string') {
    return emptyResult();
  }

  const sessionsDir = resolve(projectRoot, '.context-index/sessions');

  let entries;
  try {
    entries = await readdir(sessionsDir);
  } catch {
    // Missing dir → graceful absence.
    return emptyResult();
  }

  const result = emptyResult();
  const classifiedSessions = []; // { frontmatter, body, format, file }

  for (const entry of entries) {
    if (!entry.endsWith('.md')) continue;
    const abs = joinUnder(sessionsDir, entry);
    if (!abs) continue; // containment fail: skip silently.

    let raw;
    try {
      raw = await readFile(abs, 'utf8');
    } catch {
      // Unreadable file: classified unknown, counted.
      result.totalSessions++;
      result.formatBreakdown.unknown++;
      continue;
    }

    const fmResult = readSafeFrontmatter(raw);
    if (!fmResult.ok) {
      // Unsafe / malformed frontmatter: classified unknown.
      result.totalSessions++;
      result.formatBreakdown.unknown++;
      continue;
    }
    const frontmatter = fmResult.frontmatter || {};

    // Window filter.
    if (!inWindow(frontmatter.date, window)) continue;

    const format = classifyFormat(frontmatter);
    result.totalSessions++;
    result.formatBreakdown[format] = (result.formatBreakdown[format] || 0) + 1;

    // Extract body for downstream metric helpers. Oversize bodies are
    // dropped — counted in total/breakdown but body excluded from metrics.
    const bodyStart = raw.indexOf('\n---', 4);
    const body = bodyStart === -1 ? '' : raw.slice(bodyStart + 4).replace(/^\n/, '');
    const safeBody = isOversizeBody(body) ? '' : body;

    classifiedSessions.push({
      frontmatter,
      body: safeBody,
      format,
      file: basename(entry),
    });
  }

  // Dispatch to sub-helpers (Tasks 7–11). Each returns a documented shape;
  // stubs return empty results until their tasks land.
  result.toolUseDistribution = parseToolUseDistribution(classifiedSessions) || [];
  result.perSpecCounts = countPerSpec(classifiedSessions) || [];
  result.costTokens = aggregateCostTokens(classifiedSessions);
  result.issueXrefs = await joinClosedIssueXref(classifiedSessions, {
    issueManager: opts.issueManager || null,
    since: window.since,
    until: window.until,
  });
  result.contextGaps = scanContextGaps(classifiedSessions) || [];

  return result;
}
