/**
 * Shared amendment-graph traversal consumed by `/adev:status` and
 * `/adev:hygiene`.
 *
 * An *amendment* is a first-class `.spec.md` artifact that amends an
 * already-shipped (validated) base spec via two paired frontmatter fields:
 *
 *   amends:           <project-root-relative path to the base spec>
 *   target-revision:  <integer ≥ 2 — the base revision this amendment targets>
 *
 * These fields are an orthogonal *relationship overlay*; they are NOT a 7th
 * `kind:` value (the closed 6-value `kind:` enum in `lib/kinds.mjs` is
 * unchanged — see ADR-0009). An amendment of a behavioral spec is still
 * behavioral-shaped.
 *
 * This module provides:
 *   - `readAmendmentLink(specPath)` — minimal frontmatter read of the
 *     `amends:` / `target-revision:` pair, with completeness classification
 *     (Task 1: the frontmatter contract).
 *
 * Task 6 extends this module with base resolution, effective-revision
 * computation (validated-amendments-only — SA-2), cycle detection
 * (`AMENDMENT_CYCLE`), and dangling / incomplete-link findings consumed by
 * status and hygiene.
 *
 * Zero external dependencies — `node:fs` + `node:path` only.
 *
 * @module lib/amendment-graph
 * @see .context-index/specs/cross-cutting/spec-amendment-artifacts.spec.md
 * @see .context-index/adrs/0009-lifecycle-artifact-taxonomy.md
 */

import { readFileSync } from 'node:fs';

const FENCE = '---';

/**
 * Parse the top-level scalar frontmatter fields of a spec body.
 *
 * Mirrors the minimal, dependency-free frontmatter reader used across the
 * lifecycle libs (e.g. `lib/specify-revise.mjs`). Only `key: value` lines at
 * indent 0 inside the leading `---` fence are captured.
 *
 * @param {string} text - full spec file contents
 * @returns {Record<string,string>} map of top-level scalar fields
 */
export function parseFrontmatterFields(text) {
  const lines = text.split('\n');
  let openIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    if (lines[i].trim() === FENCE) { openIdx = i; break; }
    if (lines[i].trim() !== '' && !lines[i].startsWith('#') && !lines[i].startsWith('<!--')) {
      break;
    }
  }
  if (openIdx === -1) return {};
  let closeIdx = -1;
  for (let i = openIdx + 1; i < lines.length; i++) {
    if (lines[i].trim() === FENCE) { closeIdx = i; break; }
  }
  if (closeIdx === -1) return {};
  const fields = {};
  for (const line of lines.slice(openIdx + 1, closeIdx)) {
    const m = /^([a-zA-Z][a-zA-Z0-9_-]*):\s*(.*)$/.exec(line);
    if (m) fields[m[1]] = m[2].trim();
  }
  return fields;
}

/**
 * @typedef {object} AmendmentLink
 * @property {string|null} amends         - the project-root-relative base spec path, or null
 * @property {number|null} targetRevision - parsed integer target revision, or null
 * @property {boolean} isAmendment        - true when either field is present
 * @property {boolean} complete           - true when BOTH fields are present (a well-formed amendment)
 * @property {boolean} incomplete         - true when EXACTLY ONE field is present (INCOMPLETE_AMENDMENT_LINK)
 * @property {string|null} status         - the spec's own `status:` field (used by SA-2 effective-revision)
 * @property {number|null} revision       - the spec's own `revision:` field
 */

/**
 * Read the `amends:` / `target-revision:` relationship pair from a spec file.
 *
 * The two fields form a paired contract: a well-formed amendment declares
 * BOTH its base (`amends:`) and the revision it targets (`target-revision:`).
 * Declaring exactly one is an `INCOMPLETE_AMENDMENT_LINK` (Behavior 8) and is
 * surfaced via the `incomplete` flag for the caller to report.
 *
 * @param {string} specPath - absolute path to the spec file on disk
 * @returns {AmendmentLink}
 */
export function readAmendmentLink(specPath) {
  const text = readFileSync(specPath, 'utf8');
  const fields = parseFrontmatterFields(text);

  const amends = typeof fields.amends === 'string' && fields.amends.length > 0
    ? fields.amends
    : null;

  let targetRevision = null;
  if (fields['target-revision'] !== undefined && fields['target-revision'] !== '') {
    const n = parseInt(fields['target-revision'], 10);
    targetRevision = Number.isInteger(n) ? n : null;
  }

  const hasAmends = amends !== null;
  const hasTarget = targetRevision !== null;
  const isAmendment = hasAmends || hasTarget;
  const complete = hasAmends && hasTarget;
  const incomplete = isAmendment && !complete;

  let revision = null;
  if (fields.revision !== undefined && fields.revision !== '') {
    const r = parseInt(fields.revision, 10);
    revision = Number.isInteger(r) ? r : null;
  }

  return {
    amends,
    targetRevision,
    isAmendment,
    complete,
    incomplete,
    status: typeof fields.status === 'string' && fields.status.length > 0 ? fields.status : null,
    revision,
  };
}
