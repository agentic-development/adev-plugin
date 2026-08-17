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

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative, sep, isAbsolute } from 'node:path';

import { SPEC_STATUSES } from './spec-status.mjs';
import { parseFrontmatterFields } from './frontmatter.mjs';

// The single status that counts toward effective-revision (SA-2). Read from the
// canonical enum by index so it cannot drift and carries no bare literal
// (SPEC_STATUSES index 5 is the terminal validated status; the enum order is
// the single source of truth in lib/spec-status.mjs).
const STATUS_VALIDATED = SPEC_STATUSES[5];

/**
 * Re-exported for backward compatibility — `lib/cli/test-policy.mjs` imports
 * `parseFrontmatterFields` from this module. The implementation now lives in
 * `lib/frontmatter.mjs`, the single shared reader; the local copy that used to
 * sit here broke on multi-line HTML comment preambles and reported no `amends:`
 * relationship for 129 of 254 specs without erroring (akoy.1).
 */
export { parseFrontmatterFields };

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

// ── Task 6: base resolution, effective revision, chain, cycle, audit ─────────

const MAX_CHAIN_DEPTH = 256; // hard cap defending against pathological inputs

function toRel(projectRoot, abs) {
  return relative(resolve(projectRoot), abs).split(sep).join('/');
}

function toAbs(projectRoot, p) {
  return isAbsolute(p) ? p : resolve(projectRoot, p);
}

/**
 * Resolve the chain of base specs reachable from an amendment via `amends:`.
 *
 * Walks `tip → base → base-of-base → …`, halting on a cycle (Behavior 9) with
 * `AMENDMENT_CYCLE` rather than looping. Stops when a spec has no `amends:`
 * link or its base is missing (the missing base is recorded in `danglingAt`).
 *
 * @param {string} projectRoot
 * @param {string} specRel - project-root-relative path to the chain tip
 * @returns {{
 *   chain: string[],        // project-root-relative paths, tip-first
 *   cycle: boolean,
 *   cycleCode: string|null, // 'AMENDMENT_CYCLE' when cycle is true
 *   danglingAt: string|null,// the unresolved `amends:` target, if any
 * }}
 */
export function resolveAmendmentChain(projectRoot, specRel) {
  const root = resolve(projectRoot);
  const chain = [];
  const seen = new Set();
  let currentRel = specRel;
  let cycle = false;
  let danglingAt = null;

  for (let depth = 0; depth < MAX_CHAIN_DEPTH; depth++) {
    if (seen.has(currentRel)) { cycle = true; break; }
    seen.add(currentRel);
    chain.push(currentRel);

    const abs = toAbs(root, currentRel);
    if (!existsSync(abs)) { danglingAt = currentRel; break; }

    let link;
    try {
      link = readAmendmentLink(abs);
    } catch {
      break;
    }
    if (!link.amends) break; // reached a non-amendment base

    const nextAbs = toAbs(root, link.amends);
    const nextRel = toRel(root, nextAbs);
    if (!existsSync(nextAbs)) { danglingAt = link.amends; break; }
    currentRel = nextRel;
  }

  return {
    chain,
    cycle,
    cycleCode: cycle ? 'AMENDMENT_CYCLE' : null,
    danglingAt,
  };
}

/**
 * Find all amendment specs (under `.context-index/`) that directly amend the
 * given base spec.
 *
 * @param {string} projectRoot
 * @param {string} baseRel - project-root-relative path to the base spec
 * @returns {Array<{ path: string } & ReturnType<typeof readAmendmentLink>>}
 */
function findDirectAmendments(projectRoot, baseRel) {
  const root = resolve(projectRoot);
  const baseAbs = toAbs(root, baseRel);
  // Amendments are co-located with their base (Behavior 1). Scan the base
  // directory plus `.context-index/` (deduped) so the search works both for
  // co-located amendments and for the standard context tree.
  const dirs = new Set([
    join(baseAbs, '..'),
    join(root, '.context-index'),
  ]);
  const seenFiles = new Set();
  const out = [];
  for (const dir of dirs) {
    for (const abs of collectSpecFiles(dir)) {
      if (seenFiles.has(abs)) continue;
      seenFiles.add(abs);
      if (abs === baseAbs) continue;
      let link;
      try {
        link = readAmendmentLink(abs);
      } catch {
        continue;
      }
      if (!link.amends) continue;
      if (toAbs(root, link.amends) === baseAbs) {
        out.push({ path: toRel(root, abs), ...link });
      }
    }
  }
  return out;
}

/**
 * Compute a base spec's **effective revision** (SA-2).
 *
 * Effective revision = `max(base.revision, highest target-revision among its
 * VALIDATED amendments)`. Non-validated (in-progress) amendments are reported
 * but EXCLUDED from the max. The base file is never rewritten.
 *
 * @param {string} projectRoot
 * @param {string} baseRel - project-root-relative path to the base spec
 * @returns {{
 *   baseRevision: number|null,
 *   effectiveRevision: number|null,
 *   validatedAmendments: Array<{ path: string, targetRevision: number }>,
 *   pendingAmendments: Array<{ path: string, targetRevision: number|null, status: string|null }>,
 * }}
 */
export function computeEffectiveRevision(projectRoot, baseRel) {
  const root = resolve(projectRoot);
  const baseAbs = toAbs(root, baseRel);
  let baseRevision = null;
  if (existsSync(baseAbs)) {
    const fields = parseFrontmatterFields(readFileSync(baseAbs, 'utf8'));
    if (fields.revision !== undefined && fields.revision !== '') {
      const r = parseInt(fields.revision, 10);
      baseRevision = Number.isInteger(r) ? r : null;
    }
  }

  const direct = findDirectAmendments(root, baseRel);
  const validatedAmendments = [];
  const pendingAmendments = [];
  for (const am of direct) {
    if (am.status === STATUS_VALIDATED && Number.isInteger(am.targetRevision)) {
      validatedAmendments.push({ path: am.path, targetRevision: am.targetRevision });
    } else {
      pendingAmendments.push({ path: am.path, targetRevision: am.targetRevision, status: am.status });
    }
  }

  let effectiveRevision = baseRevision;
  for (const am of validatedAmendments) {
    if (effectiveRevision === null || am.targetRevision > effectiveRevision) {
      effectiveRevision = am.targetRevision;
    }
  }

  return { baseRevision, effectiveRevision, validatedAmendments, pendingAmendments };
}

/**
 * Build a human-readable relationship report line for a spec carrying `amends:`
 * (Behavior 5).
 *
 * @param {string} projectRoot
 * @param {string} specRel - project-root-relative path to the amendment spec
 * @returns {{
 *   isAmendment: boolean,
 *   amends: string|null,
 *   targetRevision: number|null,
 *   amendmentStatus: string|null,
 *   baseExists: boolean,
 *   line: string,
 * }}
 */
export function reportRelationship(projectRoot, specRel) {
  const root = resolve(projectRoot);
  const abs = toAbs(root, specRel);
  const link = readAmendmentLink(abs);
  if (!link.isAmendment) {
    return { isAmendment: false, amends: null, targetRevision: null, amendmentStatus: null, baseExists: false, line: '' };
  }
  const baseExists = link.amends ? existsSync(toAbs(root, link.amends)) : false;
  const line = `amends \`${link.amends ?? '(missing)'}\` targeting rev ${link.targetRevision ?? '(missing)'}, status ${link.status ?? '(unknown)'}`;
  return {
    isAmendment: true,
    amends: link.amends,
    targetRevision: link.targetRevision,
    amendmentStatus: link.status,
    baseExists,
    line,
  };
}

/**
 * Recursively collect `*.spec.md` files under a directory.
 *
 * @param {string} dir - absolute directory path
 * @returns {string[]} absolute spec file paths
 */
function collectSpecFiles(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = join(d, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === 'lifecycle-state') continue;
        stack.push(p);
      } else if (e.isFile() && e.name.endsWith('.spec.md')) {
        try {
          if (statSync(p).size <= 5 * 1024 * 1024) out.push(p);
        } catch { /* skip unreadable */ }
      }
    }
  }
  return out;
}

/**
 * Amendment audit pass for `/adev:hygiene`. Non-blocking — never throws, never
 * sets `process.exitCode`. Emits findings for the three malformed states
 * (Behaviors 7, 8, 9):
 *   - DANGLING_AMENDMENT        (warn) — `amends:` target missing/out-of-root
 *   - INCOMPLETE_AMENDMENT_LINK (error)— exactly one of the paired fields present
 *   - AMENDMENT_CYCLE           (error)— `amends:` chain contains a cycle
 *
 * @param {string} projectRoot
 * @returns {{ findings: Array<{ path: string, code: string, severity: 'error'|'warn'|'info', reason: string }> }}
 */
export function auditAmendments(projectRoot) {
  const root = resolve(projectRoot);
  const findings = [];
  const contextRoot = join(root, '.context-index');
  if (!existsSync(contextRoot)) return { findings };

  for (const abs of collectSpecFiles(contextRoot)) {
    const relPath = toRel(root, abs);
    let link;
    try {
      link = readAmendmentLink(abs);
    } catch {
      continue;
    }
    if (!link.isAmendment) continue;

    // INCOMPLETE_AMENDMENT_LINK — exactly one of the pair present.
    if (link.incomplete) {
      findings.push({
        path: relPath,
        code: 'INCOMPLETE_AMENDMENT_LINK',
        severity: 'error',
        reason: 'spec declares exactly one of amends: / target-revision: — an amendment must declare both its base and the revision it targets',
      });
      continue; // a half-link cannot be traversed further
    }

    // Resolve the chain to detect cycles and dangling bases.
    const chain = resolveAmendmentChain(root, relPath);
    if (chain.cycle) {
      findings.push({
        path: relPath,
        code: 'AMENDMENT_CYCLE',
        severity: 'error',
        reason: `amends: chain contains a cycle: ${chain.chain.join(' → ')}`,
      });
      continue;
    }
    if (chain.danglingAt) {
      findings.push({
        path: relPath,
        code: 'DANGLING_AMENDMENT',
        severity: 'warn',
        reason: `amends: target does not resolve to an existing spec: ${chain.danglingAt}`,
      });
    }
  }

  return { findings };
}
