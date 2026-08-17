/**
 * `/adev:specify --amend <base-spec>` companion library.
 *
 * Task 3 of spec-amendment-artifacts.plan.md. Unlike `lib/specify-revise.mjs`
 * (which bumps a not-yet-shipped, review-BLOCKED spec **in place** N → N+1),
 * `amendSpec` produces a **new co-located artifact** that amends an
 * already-shipped (validated) base spec while leaving the base **immutable**:
 *
 *   - Scaffolds `<base-dir>/<base-stem>-rev-<target>-<descriptor>.spec.md`
 *     (Behavior 1). Keeps the `.spec.md` extension — `slugFromSpec` unchanged.
 *   - Frontmatter (Behavior 2): `amends:` (project-root-relative base path),
 *     `target-revision:`, an explicit `kind:` (inherited from the base,
 *     overridable), `revision: 1`, `status: review-pending`.
 *   - `target-revision` (Behavior 3) defaults to `base.revision + 1`; an
 *     override must be strictly greater than the base revision, else
 *     `INVALID_TARGET_REVISION`.
 *   - Emits a `spec_amended` lifecycle event on the **base** spec's log
 *     (Behavior 4) via `reportSpecAmended`.
 *   - Opens and closes `specify` on the **amendment's own** log via `reportStep`
 *     (`started`, then `completed` with verdict `PASS`), so the amendment has the
 *     lifecycle the scaffold promises it and is reviewable under strict gate mode
 *     (adev-plugin-gkfv.1). The base log gets no `specify` events — the base was
 *     not re-specified.
 *
 * Amendment is a relationship overlay, NOT a 7th `kind:` value — the closed
 * `kind:` enum (`lib/kinds.mjs`) is unchanged (see ADR-0009). `--kind amendment`
 * is rejected at the CLI layer with `INVALID_KIND`.
 *
 * SEC-1: the author-supplied `<descriptor>` is sanitized against a strict
 * kebab-case allowlist BEFORE the filename is constructed, rejecting
 * path-traversal / illegal characters with `INVALID_AMENDMENT_DESCRIPTOR`.
 *
 * Path-containment (SEC-1) is enforced via `assertWithin` on the base spec
 * path. Atomic write: temp-then-rename.
 *
 * Zero external dependencies — `node:fs` + `node:path` + existing helpers.
 *
 * @module lib/specify-amend
 * @see .context-index/specs/cross-cutting/spec-amendment-artifacts.spec.md
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, basename, join, resolve, isAbsolute, relative, sep } from 'node:path';

import { reportSpecAmended, reportStep } from './lifecycle-state.mjs';
import { assertWithin } from './partial-artifact.mjs';
import { defaultKindFor, isValidKind } from './kinds.mjs';
import { codedError as mkErr } from './errors.mjs';

const SPEC_SUFFIX = '.spec.md';

// SEC-1: strict kebab-case allowlist. Lowercase alphanumerics in
// single-hyphen-separated tokens; no leading/trailing hyphen, no `--`, no
// uppercase, no path separators, no traversal sequences.
const DESCRIPTOR_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const FENCE = '---';

/**
 * Minimal frontmatter scalar-field parser (mirrors lib/specify-revise.mjs).
 *
 * @param {string} text
 * @returns {Record<string,string>}
 */
function parseFrontmatterFields(text) {
  const lines = text.split('\n');
  let openIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    if (lines[i].trim() === FENCE) { openIdx = i; break; }
    if (lines[i].trim() !== '' && !lines[i].startsWith('#') && !lines[i].startsWith('<!--')) break;
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
 * Scaffold an amendment artifact for a shipped base spec.
 *
 * @param {object} args
 * @param {string} args.specPath            - base spec path (relative or absolute, inside projectRoot)
 * @param {string} args.projectRoot         - absolute project root
 * @param {string} args.descriptor          - kebab-case descriptor slug (SEC-1 sanitized)
 * @param {number} [args.targetRevision]    - optional override; must be > base.revision
 * @param {string} [args.kind]              - optional kind override (defaults to base kind)
 * @returns {{
 *   amendmentPath: string,   // project-root-relative
 *   amendmentSlug: string,
 *   basePath: string,        // project-root-relative
 *   targetRevision: number,
 *   kind: string,
 * }}
 * @throws {Error} INVALID_PROJECT_ROOT INVALID_SPEC_PATH INVALID_AMENDMENT_BASE
 *                 INVALID_AMENDMENT_DESCRIPTOR INVALID_TARGET_REVISION INVALID_KIND
 */
export function amendSpec({ specPath, projectRoot, descriptor, targetRevision, kind } = {}) {
  // ── Validate project root + base path ──────────────────────────────────────
  if (typeof projectRoot !== 'string' || projectRoot.length === 0) {
    throw mkErr('INVALID_PROJECT_ROOT', 'projectRoot must be a non-empty string');
  }
  if (typeof specPath !== 'string' || specPath.length === 0) {
    throw mkErr('INVALID_SPEC_PATH', 'specPath must be a non-empty string');
  }
  if (!specPath.endsWith(SPEC_SUFFIX)) {
    throw mkErr('INVALID_SPEC_PATH', `spec path must end with ${SPEC_SUFFIX}: ${specPath}`);
  }
  const absRoot = resolve(projectRoot);
  const absBase = isAbsolute(specPath) ? specPath : resolve(absRoot, specPath);
  try {
    assertWithin(absRoot, absBase, 'INVALID_SPEC_PATH');
  } catch {
    throw mkErr('INVALID_SPEC_PATH', `spec path must be inside projectRoot: ${specPath}`);
  }
  if (!existsSync(absBase)) {
    throw mkErr('INVALID_AMENDMENT_BASE', `base spec not found on disk: ${specPath}`);
  }

  // ── SEC-1: sanitize descriptor BEFORE building any path ────────────────────
  if (typeof descriptor !== 'string' || !DESCRIPTOR_RE.test(descriptor)) {
    throw mkErr(
      'INVALID_AMENDMENT_DESCRIPTOR',
      `descriptor must be a kebab-case slug matching ${DESCRIPTOR_RE} (lowercase, single-hyphen-separated, no traversal/illegal chars); got ${JSON.stringify(descriptor)}`,
    );
  }

  // ── Parse base frontmatter ─────────────────────────────────────────────────
  const baseText = readFileSync(absBase, 'utf8');
  const baseFields = parseFrontmatterFields(baseText);
  const baseRevision = parseInt(baseFields.revision, 10);
  if (!Number.isInteger(baseRevision) || baseRevision < 1) {
    throw mkErr('INVALID_AMENDMENT_BASE', `base spec missing/malformed revision: (got ${JSON.stringify(baseFields.revision)})`);
  }

  // ── Resolve kind (inherited from base, overridable) ────────────────────────
  const baseKind = isValidKind('spec', baseFields.kind) ? baseFields.kind : defaultKindFor('spec');
  let resolvedKind = baseKind;
  if (kind !== undefined && kind !== null && kind !== '') {
    if (!isValidKind('spec', kind)) {
      throw mkErr('INVALID_KIND', `invalid kind ${JSON.stringify(kind)}; not a member of the closed spec-kind enum`);
    }
    resolvedKind = kind;
  }

  // ── Compute target revision (Behavior 3) ───────────────────────────────────
  let target;
  if (targetRevision === undefined || targetRevision === null) {
    target = baseRevision + 1;
  } else {
    const t = typeof targetRevision === 'number' ? targetRevision : parseInt(targetRevision, 10);
    if (!Number.isInteger(t) || t <= baseRevision) {
      throw mkErr(
        'INVALID_TARGET_REVISION',
        `target-revision must be an integer strictly greater than the base revision (${baseRevision}); got ${JSON.stringify(targetRevision)}`,
      );
    }
    target = t;
  }

  // ── Compute co-located amendment path (Behavior 1) ─────────────────────────
  const baseDir = dirname(absBase);
  const baseStem = basename(absBase).slice(0, -SPEC_SUFFIX.length);
  const amendmentSlug = `${baseStem}-rev-${target}-${descriptor}`;
  const absAmendment = join(baseDir, `${amendmentSlug}${SPEC_SUFFIX}`);
  // Defense-in-depth: the constructed path must still stay inside projectRoot.
  try {
    assertWithin(absRoot, absAmendment, 'INVALID_SPEC_PATH');
  } catch {
    throw mkErr('INVALID_SPEC_PATH', `amendment path escapes projectRoot: ${absAmendment}`);
  }
  if (existsSync(absAmendment)) {
    throw mkErr('AMENDMENT_EXISTS', `amendment already exists: ${relative(absRoot, absAmendment)}`);
  }

  const relBase = relative(absRoot, absBase).split(sep).join('/');
  const relAmendment = relative(absRoot, absAmendment).split(sep).join('/');

  // ── Render amendment body (Behavior 2) ─────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const charter = baseFields.charter ?? '';
  const charterRevision = baseFields['charter-revision'] ?? '1';
  const baseTitle = (/^#\s+(.+)$/m.exec(baseText)?.[1] ?? baseStem).trim();

  const body = [
    FENCE,
    `charter: ${charter}`,
    `kind: ${resolvedKind}`,
    `status: review-pending`,
    `risk_level: ${baseFields.risk_level ?? 'medium'}`,
    `revision: 1`,
    `charter-revision: ${charterRevision}`,
    `amends: ${relBase}`,
    `target-revision: ${target}`,
    `created: ${today}`,
    `updated: ${today}`,
    FENCE,
    '',
    `# Amendment: ${baseTitle} (targeting rev ${target})`,
    '',
    `> This spec **amends** \`${relBase}\` targeting revision ${target}.`,
    `> The base spec is immutable; this artifact carries the delta and is`,
    `> reviewed, planned, and validated on its own lifecycle.`,
    '',
    `## Amendment Rationale`,
    '',
    `<!-- Why the shipped base spec needs a coordinated revision. -->`,
    '',
    `## Behavioral Delta`,
    '',
    `<!-- The specific behavioral changes this amendment introduces relative to`,
    `     the base spec's Behavioral Contract. -->`,
    '',
    `## Acceptance Criteria`,
    '',
    `- [ ] ...`,
    '',
  ].join('\n');

  // ── Atomic write (temp-then-rename) ────────────────────────────────────────
  mkdirSync(baseDir, { recursive: true });
  const tmp = `${absAmendment}.tmp`;
  writeFileSync(tmp, body, 'utf8');
  renameSync(tmp, absAmendment);

  // ── Open and close `specify` on the AMENDMENT's OWN log ────────────────────
  // The scaffold body above promises the amendment "is reviewed, planned, and
  // validated on its own lifecycle". That requires a lifecycle to exist: without
  // these two events the amendment has no log at all, `currentState` projects
  // `specify` as `{status: "missing"}`, and `requireGate(state, "review")`
  // hard-blocks under the default strict mode — every amendment unreviewable
  // (adev-plugin-gkfv.1).
  //
  // Reviewing against the base path is not an alternative: /adev:review-specs
  // rewrites the `status:` frontmatter of whatever spec it is handed, so that
  // would flip the immutable validated base to review-passed/review-blocked.
  //
  // Both events are required, in this order. A terminal with no matching
  // `started` is exactly what ORPHAN_STEP_TERMINAL rejects
  // (lifecycle-event-log rev-5 BEH-7), and a terminal without an explicit
  // string verdict is overwritten by the verdict synthesized from actor reports
  // — so the `PASS` is load-bearing, not decorative.
  reportStep(absRoot, relAmendment, { step: 'specify', status: 'started' });
  reportStep(absRoot, relAmendment, { step: 'specify', status: 'completed', verdict: 'PASS' });

  // ── Emit spec_amended on the BASE log (Behavior 4) ─────────────────────────
  // Stays on the base log: it records that the base gained an amendment. The
  // base was not re-specified, so its log must not gain `specify` events.
  reportSpecAmended(absRoot, relBase, {
    amendment_slug: amendmentSlug,
    amendment_path: relAmendment,
    target_revision: target,
  });

  return {
    amendmentPath: relAmendment,
    amendmentSlug,
    basePath: relBase,
    targetRevision: target,
    kind: resolvedKind,
  };
}
