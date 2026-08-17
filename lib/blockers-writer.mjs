/**
 * `.blockers.md` sidecar writer keyed by canonical blocker_id.
 *
 * Task 5 of review-block-auto-retry.plan.md. Replaces the inline `.blockers.md`
 * fenced-block writer in `skills/build/SKILL.md` with a dedicated library
 * that:
 *
 *   1. Groups entries by `blocker_id` (collisions are deduplicated; both
 *      reviewer prose entries are preserved with a `BLOCKER_ID_COLLISION`
 *      advisory in the return value).
 *   2. Carries `section_anchor` per entry (SA-1 — drives byte-identical
 *      preservation in `lib/specify-revise.mjs`).
 *   3. Applies the existing SEC-3 redaction set on every prose blob.
 *   4. Truncates per-prose at 8 KiB.
 *   5. Writes atomically via temp-then-rename (existing pattern; see
 *      `lib/partial-artifact.mjs` for the long-form companion).
 *
 * The writer is the canonical producer of `.blockers.md` artifacts; the
 * file lives adjacent to its spec at `<spec-dir>/<spec-stem>.blockers.md`.
 *
 * @module lib/blockers-writer
 */

import { writeFileSync, unlinkSync, existsSync, renameSync, mkdirSync } from 'node:fs';
import { dirname, join, basename, resolve } from 'node:path';

import { parseBlockerId } from './blocker-id.mjs';
import { codedError as mkErr } from './errors.mjs';

/**
 * Maximum bytes of reviewer prose preserved verbatim per entry. Anything
 * longer is truncated with a `…[truncated <N> bytes]` marker (mirrors
 * `truncateNotes` in lib/lifecycle-state.mjs).
 */
export const BLOCKER_PROSE_CAP = 8 * 1024;

/** Suffix to append to spec basename to derive sidecar filename. */
const SIDECAR_SUFFIX = '.blockers.md';

/** Spec basename suffix that marks a Live Spec file. */
const SPEC_SUFFIX = '.spec.md';

// ── SEC-3 redaction patterns ────────────────────────────────────────────────

// Conservative redaction set. Mirrors what the existing review-specs adapters
// and `reportReviewer.notes` truncation already do.
const SECRET_PATTERNS = [
  // Specific token markers: AWS access keys, sk_ live tokens, GitHub PATs.
  /AKIA[0-9A-Z]{12,20}/g,           // AWS access key id
  /sk_live_[A-Za-z0-9]{16,}/g,      // Stripe live key
  /ghp_[A-Za-z0-9]{20,}/g,          // GitHub personal access token
  /xox[abp]-[A-Za-z0-9-]{10,}/g,    // Slack tokens
  // Common .env-style secret assignments: key=value (broad guardrail).
  /\b(aws_secret_access_key|aws_access_key_id|api_key|api_secret|secret_key|access_token|auth_token|bearer|token|password|passwd)\s*[=:]\s*[^\s,;"'`]+/gi,
  /\bAWS_(?:SECRET_ACCESS_KEY|ACCESS_KEY_ID|SESSION_TOKEN)\s*=\s*[^\s,;"'`]+/g,
];

/**
 * Redact known secret patterns from a prose blob. Exported for testing.
 * @param {string} text
 * @returns {string}
 */
export function _redactForBlockers(text) {
  if (typeof text !== 'string' || text.length === 0) return '';
  let out = text;
  for (const pat of SECRET_PATTERNS) {
    out = out.replace(pat, '[REDACTED]');
  }
  return out;
}

function truncateProse(prose) {
  const redacted = _redactForBlockers(String(prose ?? ''));
  if (Buffer.byteLength(redacted, 'utf8') <= BLOCKER_PROSE_CAP) return redacted;
  // Truncate at byte boundary; conservative — slice by char length then trim.
  const head = redacted.slice(0, BLOCKER_PROSE_CAP);
  const dropped = Buffer.byteLength(redacted, 'utf8') - Buffer.byteLength(head, 'utf8');
  return `${head}\n\n…[truncated ${dropped} bytes — see lifecycle log for full text]`;
}

/**
 * Resolve the sidecar path for a given spec.
 *
 * @param {string} specPath - project-root-relative spec path
 * @returns {string} project-root-relative sidecar path
 */
export function sidecarPathForSpec(specPath) {
  if (typeof specPath !== 'string' || specPath.length === 0) {
    throw mkErr('INVALID_SPEC_PATH', 'specPath must be a non-empty string');
  }
  if (!specPath.endsWith(SPEC_SUFFIX)) {
    throw mkErr('INVALID_SPEC_PATH', `spec path must end with ${SPEC_SUFFIX}: ${specPath}`);
  }
  const dir = dirname(specPath);
  const stem = basename(specPath).slice(0, -SPEC_SUFFIX.length);
  return dir === '.' ? `${stem}${SIDECAR_SUFFIX}` : join(dir, `${stem}${SIDECAR_SUFFIX}`);
}

/**
 * Group findings by blocker_id, recording collisions.
 *
 * @param {Array<object>} findings
 * @returns {{ grouped: Map<string, object[]>, collisions: Array<{blocker_id: string, count: number}> }}
 */
function groupByBlockerId(findings) {
  const grouped = new Map();
  for (const finding of findings) {
    if (!finding || typeof finding !== 'object') continue;
    const id = finding.blocker_id;
    // Validate up-front; surface INVALID_BLOCKER_ID from blocker-id.mjs.
    parseBlockerId(id);
    if (!grouped.has(id)) grouped.set(id, []);
    grouped.get(id).push(finding);
  }
  const collisions = [];
  for (const [id, entries] of grouped.entries()) {
    if (entries.length > 1) collisions.push({ blocker_id: id, count: entries.length });
  }
  return { grouped, collisions };
}

/**
 * Write the `.blockers.md` sidecar for a spec.
 *
 * Atomic temp-then-rename. Existing sidecar (if any) is overwritten.
 * When `findings.length === 0`, the sidecar is deleted (or rewritten to an
 * empty marker if deletion is undesirable — current behavior: delete).
 *
 * @param {string} projectRoot
 * @param {string} specPath - project-root-relative spec path
 * @param {Array<{blocker_id: string, section_anchor: string, reviewer: string, prose: string}>} findings
 * @param {object} [options]
 * @param {number} [options.revision] - spec revision at write time (for the header)
 * @param {string} [options.ts] - ISO 8601 timestamp; defaults to now
 * @returns {{ sidecarPath: string, entries: number, collisions: Array<{blocker_id: string, count: number}> }}
 */
export function writeBlockers(projectRoot, specPath, findings, options = {}) {
  if (typeof projectRoot !== 'string' || projectRoot.length === 0) {
    throw mkErr('INVALID_PROJECT_ROOT', 'projectRoot must be a non-empty string');
  }
  if (!Array.isArray(findings)) {
    throw mkErr('INVALID_FINDINGS', 'findings must be an Array');
  }
  const sidecarPath = sidecarPathForSpec(specPath);
  const absSidecar = resolve(projectRoot, sidecarPath);

  // Empty findings → clear sidecar.
  if (findings.length === 0) {
    if (existsSync(absSidecar)) {
      try { unlinkSync(absSidecar); } catch { /* best-effort */ }
    }
    return { sidecarPath, entries: 0, collisions: [] };
  }

  const { grouped, collisions } = groupByBlockerId(findings);
  const ts = options.ts ?? new Date().toISOString();
  const revision = Number.isInteger(options.revision) ? options.revision : null;

  const lines = [];
  lines.push(`<!-- Generated by lib/blockers-writer.mjs — DO NOT EDIT BY HAND -->`);
  lines.push(`# Blockers: ${specPath}`);
  lines.push('');
  lines.push(`> Spec revision: ${revision ?? 'unknown'}`);
  lines.push(`> Generated: ${ts}`);
  lines.push(`> Entries: ${grouped.size}`);
  if (collisions.length > 0) {
    lines.push(`> Collisions: ${collisions.length} (BLOCKER_ID_COLLISION advisory)`);
  }
  lines.push('');

  // Entries keyed by blocker_id (sorted for stable diffs).
  const ids = [...grouped.keys()].sort();
  for (const id of ids) {
    const entries = grouped.get(id);
    const first = entries[0];
    lines.push(`## ${id}`);
    lines.push('');
    lines.push('```yaml');
    lines.push(`blocker_id: ${id}`);
    lines.push(`section_anchor: ${first.section_anchor ?? '(none)'}`);
    lines.push(`reviewer_count: ${entries.length}`);
    lines.push('```');
    lines.push('');
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (entries.length > 1) {
        lines.push(`### Reviewer ${i + 1}: ${e.reviewer ?? 'unknown'}`);
        lines.push('');
      } else {
        lines.push(`**Reviewer:** ${e.reviewer ?? 'unknown'}`);
        lines.push('');
      }
      lines.push('```');
      lines.push(truncateProse(e.prose ?? ''));
      lines.push('```');
      lines.push('');
    }
  }

  const body = lines.join('\n');

  // Atomic write: temp-then-rename.
  mkdirSync(dirname(absSidecar), { recursive: true });
  const tmp = `${absSidecar}.tmp`;
  writeFileSync(tmp, body, 'utf8');
  renameSync(tmp, absSidecar);

  return { sidecarPath, entries: grouped.size, collisions };
}
