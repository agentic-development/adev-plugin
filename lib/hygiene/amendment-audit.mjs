/**
 * Amendment-audit pass for `/adev:hygiene`.
 *
 * Thin wrapper over `lib/amendment-graph.mjs::auditAmendments` that conforms to
 * the hygiene-pass contract used by `runKindValidityPass`: it never throws and
 * never sets `process.exitCode`. The returned `findings` array is the sole
 * signal; severity conveys human-triage priority only.
 *
 * Findings (per spec-amendment-artifacts.spec.md Behaviors 7, 8, 9):
 *   - DANGLING_AMENDMENT        (warn)  — `amends:` target missing/out-of-root
 *   - INCOMPLETE_AMENDMENT_LINK (error) — exactly one of the paired fields present
 *   - AMENDMENT_CYCLE           (error) — `amends:` chain contains a cycle
 *
 * @module lib/hygiene/amendment-audit
 * @see .context-index/specs/cross-cutting/spec-amendment-artifacts.spec.md
 */

import { auditAmendments } from '../amendment-graph.mjs';

/**
 * @typedef {Object} AmendmentAuditFinding
 * @property {string} path - project-root-relative path to the amendment spec
 * @property {string} code - DANGLING_AMENDMENT | INCOMPLETE_AMENDMENT_LINK | AMENDMENT_CYCLE
 * @property {'error'|'warn'|'info'} severity
 * @property {string} reason - short human-readable explanation
 */

/**
 * Run the amendment-audit pass.
 *
 * @param {string} projectRoot
 * @returns {Promise<{ findings: AmendmentAuditFinding[], headerNotes: string[] }>}
 */
export async function runAmendmentAuditPass(projectRoot) {
  let findings = [];
  const headerNotes = [];
  try {
    ({ findings } = auditAmendments(projectRoot));
  } catch (err) {
    // Defense-in-depth: the audit is already non-throwing, but never let a
    // pathological input escalate into a hygiene-run crash.
    headerNotes.push(`amendment-audit pass degraded: ${err?.message ?? String(err)}`);
    findings = [];
  }
  return { findings, headerNotes };
}
