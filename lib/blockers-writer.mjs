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

import { buildBlockerId, parseBlockerId } from './blocker-id.mjs';
import { codedError as mkErr } from './errors.mjs';
import { renderRemedyRef } from './governance/remedy-ref-render.mjs';

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

// ── finding_class / remedy_ref / section_anchor scalar safety (BEH-1, BD-1) ─
//
// Every scalar rendered into the sidecar's ```yaml fence is re-read by
// whatever downstream tooling parses `.blockers.md` (`lib/specify-revise.mjs`
// reads all three; `adev specify group-blockers` branches on `finding_class`
// and prints `remedy_ref`). An unescaped newline/quote/`#`/YAML flow indicator or a
// colon-space sequence changes how that value re-parses. This mirrors the
// refuse rule in `lib/extensions/governance-values.mjs`'s `assertSafeScalar`
// (UNSAFE_ANYWHERE / UNSAFE_COLON), but is intentionally a LOCAL, separate
// helper: that module validates extension-supplied governance fields, a
// different trust boundary from reviewer-supplied blocker findings.
//
// Unlike `assertSafeScalar`, this helper never throws — blockers-writer's
// posture is "refuse, don't sanitize" AND "default and keep going", not
// "fail loud". Callers force a safe default and record an advisory.

/** Unsafe anywhere in a scalar: newline, quotes, '#', YAML flow indicators. */
const UNSAFE_SCALAR_ANYWHERE = /[\n\r"'#{}[\],]/;

/** A colon followed by whitespace, or a trailing colon, anywhere in a scalar. */
const UNSAFE_SCALAR_COLON = /:\s|:$/;

/**
 * A plain scalar that a YAML parser re-reads as a non-string: booleans (the
 * YAML 1.1 set, since many parsers still honor it), null, and numeric forms
 * (decimal, float, exponent, hex, octal, .inf/.nan). Rendered unquoted into
 * the sidecar, `remedy_ref: 123` or `remedy_ref: null` would silently come
 * back as a number or null, not the string the reviewer wrote.
 */
const TYPE_COERCING_SCALAR =
  /^(?:true|false|yes|no|on|off|y|n|null|~|[-+]?(?:\d[\d_]*)?\.?\d+(?:[eE][-+]?\d+)?|0x[0-9a-fA-F_]+|0o[0-7_]+|[-+]?\.(?:inf|nan))$/i;

/** A leading YAML indicator character that changes how a plain scalar parses. */
const UNSAFE_SCALAR_LEADING = /^(?:[&*!|>%@`]|[-?]\s)/;

/**
 * Refuse a scalar that could change meaning when the sidecar is re-parsed.
 * Never throws; returns a verdict for the caller to act on.
 *
 * `rejectTypeCoercing` is opt-in: free-text fields a consumer may YAML-parse
 * (`remedy_ref`) need it, while `section_anchor` is a heading slug — a
 * heading like "On" or "2026" slugifies to a value this would refuse, and
 * losing a real anchor would break the per-section splice.
 *
 * @param {*} value
 * @param {string} fieldPath - dotted path used in the rejection reason
 * @param {{rejectTypeCoercing?: boolean}} [opts]
 * @returns {{ safe: boolean, rejectedReason: string|null }}
 */
function refuseUnsafeScalar(value, fieldPath, { rejectTypeCoercing = false } = {}) {
  if (typeof value !== 'string' || value.length === 0) {
    return { safe: false, rejectedReason: `${fieldPath} must be a non-empty string` };
  }
  if (UNSAFE_SCALAR_ANYWHERE.test(value)) {
    return {
      safe: false,
      rejectedReason: `${fieldPath} contains an unsafe character (newline/quote/#/flow-indicator)`,
    };
  }
  if (UNSAFE_SCALAR_COLON.test(value)) {
    return {
      safe: false,
      rejectedReason: `${fieldPath} contains a colon followed by whitespace, or a trailing colon`,
    };
  }
  if (!rejectTypeCoercing) return { safe: true, rejectedReason: null };
  if (TYPE_COERCING_SCALAR.test(value.trim())) {
    return {
      safe: false,
      rejectedReason: `${fieldPath} would re-parse as a non-string YAML scalar (boolean/null/number)`,
    };
  }
  if (UNSAFE_SCALAR_LEADING.test(value)) {
    return {
      safe: false,
      rejectedReason: `${fieldPath} starts with a YAML indicator character`,
    };
  }
  return { safe: true, rejectedReason: null };
}

/** Closed finding_class taxonomy (BEH-1). */
const FINDING_CLASSES = new Set(['defect', 'decision', 'external']);

/** Default finding_class when absent or rejected. */
const DEFAULT_FINDING_CLASS = 'defect';

/** Safe placeholder section_anchor slug used when a supplied anchor is refused (BD-1). */
const DEFAULT_SECTION_ANCHOR = 'unspecified';

/**
 * Resolve `finding_class` for a group's header entry.
 *
 * @param {object} first - first finding in the blocker_id group
 * @param {string} blockerId
 * @param {Array<object>} advisories - mutated in place
 * @returns {string} a value guaranteed to be a member of FINDING_CLASSES
 */
function resolveFindingClass(first, blockerId, advisories) {
  const raw = first.finding_class;
  if (raw === undefined || raw === null) {
    advisories.push({ code: 'FINDING_CLASS_DEFAULTED', blocker_id: blockerId });
    return DEFAULT_FINDING_CLASS;
  }
  const isValidEnum = typeof raw === 'string' && FINDING_CLASSES.has(raw);
  const check = isValidEnum
    ? refuseUnsafeScalar(raw, `${blockerId}.finding_class`)
    : { safe: false, rejectedReason: `finding_class must be one of defect|decision|external, got ${JSON.stringify(raw)}` };
  if (!isValidEnum || !check.safe) {
    advisories.push({ code: 'FINDING_CLASS_REJECTED', blocker_id: blockerId, value: raw, reason: check.rejectedReason });
    return DEFAULT_FINDING_CLASS;
  }
  return raw;
}

/**
 * Resolve `remedy_ref` for a group's header entry. Only relevant when the
 * (already-resolved) finding_class is 'external'.
 *
 * @param {object} first
 * @param {string} findingClass - resolved finding_class (post-default/reject)
 * @param {string} blockerId
 * @param {Array<object>} advisories - mutated in place
 * @returns {string|null} safe remedy_ref, or null when absent/irrelevant/rejected
 */
function resolveRemedyRef(first, findingClass, blockerId, advisories) {
  if (findingClass !== 'external') return null;
  const raw = first.remedy_ref;
  if (raw === undefined || raw === null) return null;
  const check = refuseUnsafeScalar(raw, `${blockerId}.remedy_ref`, { rejectTypeCoercing: true });
  if (!check.safe) {
    advisories.push({ code: 'REMEDY_REF_REJECTED', blocker_id: blockerId, value: raw, reason: check.rejectedReason });
    return null;
  }
  return raw;
}

/**
 * Resolve `section_anchor` for a group's header entry. It is interpolated into
 * the sidecar's YAML fence, so it passes the same scalar-safety gate as
 * `finding_class`/`remedy_ref` before it is written.
 *
 * @param {object} first
 * @param {string} blockerId
 * @param {Array<object>} advisories - mutated in place
 * @returns {string}
 */
function resolveSectionAnchor(first, blockerId, advisories) {
  const raw = first.section_anchor;
  if (raw === undefined || raw === null) return '(none)';
  const check = refuseUnsafeScalar(raw, `${blockerId}.section_anchor`);
  if (!check.safe) {
    advisories.push({ code: 'SECTION_ANCHOR_REJECTED', blocker_id: blockerId, value: raw, reason: check.rejectedReason });
    return DEFAULT_SECTION_ANCHOR;
  }
  return raw;
}

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
 * Give every finding a canonical `blocker_id`.
 *
 * A reviewer LLM cannot compute the SHA-256 location hash, so it emits only
 * `finding_type` + `section_anchor`, and the id must be built here — skill
 * prose has no way to call `buildBlockerId` itself. A finding that already
 * carries `blocker_id` is passed through untouched (the grouping step still
 * validates it). A finding whose id cannot be built (non-kebab
 * `finding_type`, empty anchor or prose) is excluded with an
 * `INVALID_BLOCKER_ID` advisory rather than aborting the write, so the other
 * findings in the round still reach the sidecar.
 *
 * @param {Array<object>} findings
 * @returns {{ findings: Array<object>, advisories: Array<object> }}
 */
function deriveBlockerIds(findings) {
  const out = [];
  const advisories = [];
  for (const f of findings) {
    if (!f || typeof f !== 'object' || f.blocker_id !== undefined || f.finding_type === undefined) {
      out.push(f);
      continue;
    }
    try {
      const blockerId = buildBlockerId({
        reviewer: f.reviewer,
        type: f.finding_type,
        sectionAnchor: f.section_anchor,
        findingText: f.prose,
      });
      out.push({ ...f, blocker_id: blockerId });
    } catch (err) {
      advisories.push({
        code: 'INVALID_BLOCKER_ID',
        reviewer: f.reviewer ?? null,
        finding_type: f.finding_type,
        reason: err?.message ?? String(err),
      });
    }
  }
  return { findings: out, advisories };
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
 * `externalRemedies` lists every `external`-classed entry with its
 * `remedy_ref` already passed through `renderRemedyRef` — the one production
 * render path both the review report and the build loop's progress line use,
 * so the two channels print byte-identical values.
 *
 * @returns {{ sidecarPath: string, entries: number, collisions: Array<{blocker_id: string, count: number}>, advisories: Array<object>, externalRemedies: Array<{blocker_id: string, section_anchor: string, remedy_ref: string}> }}
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

  const { findings: withIds, advisories: derivationAdvisories } = deriveBlockerIds(findings);

  // Empty findings → clear sidecar.
  if (withIds.length === 0) {
    if (existsSync(absSidecar)) {
      try { unlinkSync(absSidecar); } catch { /* best-effort */ }
    }
    return { sidecarPath, entries: 0, collisions: [], advisories: derivationAdvisories, externalRemedies: [] };
  }

  const { grouped, collisions } = groupByBlockerId(withIds);

  // A finding whose prose renders empty after redaction is silent data loss,
  // not a healthy entry: the sidecar would carry a valid-looking blocker_id,
  // section_anchor, and reviewer name over a blank fenced body, recoverable
  // only from the sibling .review.md — defeating .blockers.md's entire
  // purpose as the machine-consumable source of truth (adev-plugin-heba).
  // Checked BEFORE any write so a refusal never mutates a prior sidecar.
  const emptyIds = [];
  for (const [id, entries] of grouped) {
    for (const e of entries) {
      if (truncateProse(e.prose ?? '').trim().length === 0) {
        emptyIds.push(id);
        break;
      }
    }
  }
  if (emptyIds.length > 0) {
    throw mkErr(
      'BLOCKER_BODY_EMPTY',
      `Refusing to write ${sidecarPath}: empty finding prose for blocker_id(s) ${emptyIds.join(', ')} — ` +
        `the finding text is likely supplied under the wrong key (e.g. "message"/"finding"/"body" instead of "prose").`,
    );
  }

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
  const advisories = [...derivationAdvisories];
  const externalRemedies = [];
  const ids = [...grouped.keys()].sort();
  for (const id of ids) {
    const entries = grouped.get(id);
    const first = entries[0];
    const sectionAnchor = resolveSectionAnchor(first, id, advisories);
    const findingClass = resolveFindingClass(first, id, advisories);
    const remedyRef = resolveRemedyRef(first, findingClass, id, advisories);
    if (findingClass === 'external') {
      externalRemedies.push({ blocker_id: id, section_anchor: sectionAnchor, remedy_ref: renderRemedyRef(remedyRef) });
    }
    lines.push(`## ${id}`);
    lines.push('');
    lines.push('```yaml');
    lines.push(`blocker_id: ${id}`);
    lines.push(`section_anchor: ${sectionAnchor}`);
    lines.push(`finding_class: ${findingClass}`);
    if (remedyRef) lines.push(`remedy_ref: ${remedyRef}`);
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

  return { sidecarPath, entries: grouped.size, collisions, advisories, externalRemedies };
}
