/**
 * Reviewer merge function.
 *
 * Merges domain reviewers + governance reviewers with provenance tracking.
 * Governance reviewers override domain reviewers on matching `id`.
 *
 * Pure function — never mutates inputs, returns new objects.
 *
 * @module lib/domains/merge-reviewers
 */

const REVIEWER_DEFAULTS = {
  dispatch: 'always',
  profile: 'reviewer-capable',
  severity_cap: 'blocker',
  context_pack: 'base',
};

/**
 * Merge domain and governance reviewer overlays.
 *
 * @param {object|null} domainOverlay - Domain reviewer config (with `reviewers` array and optional `merge_strategy`)
 * @param {object|null} governanceOverlay - Governance reviewer config (with `reviewers` array)
 * @returns {{ reviewers: object[], warnings: Array<{ code: string, message: string }> }}
 */
export function mergeReviewers(domainOverlay, governanceOverlay) {
  const warnings = [];

  const domainReviewers = domainOverlay?.reviewers;
  const governanceReviewers = governanceOverlay?.reviewers;
  const mergeStrategy = domainOverlay?.merge_strategy ?? 'append';

  // Handle null inputs
  if (!Array.isArray(domainReviewers) && !Array.isArray(governanceReviewers)) {
    warnings.push({
      code: 'DOMAIN_CONFIG_MERGE_WARN',
      message: 'No domain reviewers and no governance reviewers configured.',
    });
    return { reviewers: [], warnings };
  }

  // Validate merge_strategy
  if (mergeStrategy !== 'append' && mergeStrategy !== 'replace') {
    warnings.push({
      code: 'DOMAIN_CONFIG_MERGE_WARN',
      message: `Unknown merge_strategy '${mergeStrategy}' — treating as 'append'.`,
    });
  }

  // Start with domain reviewers (skip entries missing id)
  const byId = new Map();
  const domainList = Array.isArray(domainReviewers) ? domainReviewers : [];

  if (mergeStrategy === 'replace') {
    warnings.push({
      code: 'DOMAIN_CONFIG_MERGE_WARN',
      message: `Domain replaced base reviewers. Governance overrides still apply.`,
    });
  }

  for (const entry of domainList) {
    if (!entry || typeof entry !== 'object' || !entry.id) {
      warnings.push({
        code: 'DOMAIN_CONFIG_MERGE_WARN',
        message: 'Reviewer entry missing required id field — skipped.',
      });
      continue;
    }
    byId.set(entry.id, {
      ...REVIEWER_DEFAULTS,
      ...entry,
      __source: 'domain',
    });
  }

  // Apply governance reviewers on top (governance wins on id conflict)
  const govList = Array.isArray(governanceReviewers) ? governanceReviewers : [];

  for (const entry of govList) {
    if (!entry || typeof entry !== 'object' || !entry.id) {
      warnings.push({
        code: 'DOMAIN_CONFIG_MERGE_WARN',
        message: 'Governance reviewer entry missing required id field — skipped.',
      });
      continue;
    }
    byId.set(entry.id, {
      ...REVIEWER_DEFAULTS,
      ...(byId.get(entry.id) ?? {}),
      ...entry,
      __source: 'governance',
    });
  }

  return { reviewers: [...byId.values()], warnings };
}
