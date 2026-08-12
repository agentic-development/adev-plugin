/**
 * Test Depth Policy — schema, parsing, and granularity resolution.
 *
 * Parses and validates the `test_policy` block of a manifest, and resolves
 * the effective granularity via a strictly ordered priority chain:
 *   1. module override — `modules[].test_policy.granularity`
 *   2. manifest         — `test_policy.granularity`
 *   3. domain default   — domain-level fallback
 *   4. fallback         — built-in default ('per-behavior')
 */

const GRANULARITIES = new Set(['per-task', 'per-behavior', 'per-spec']);
const DIMENSIONS = new Set(['spec_completeness', 'pattern_coverage', 'blast_radius', 'novelty']);
const RULE_EXPR = /^(<=|>=|<|>|==)\s*(0(\.\d+)?|1(\.0+)?)$/;
const MAX_RULES = 32;

/**
 * Parse and validate the test_policy section of a manifest.
 *
 * @param {object} manifest - Parsed manifest object (already parsed YAML)
 * @returns {{ policy: { granularity: string, escalation: boolean, escalation_rules: object[] }, warnings: string[] }}
 */
export function parseTestPolicy(manifest) {
  const block = manifest?.test_policy ?? {};

  const granularity = block.granularity ?? 'per-behavior';
  if (!GRANULARITIES.has(granularity)) {
    throw new Error(
      `INVALID_TEST_GRANULARITY: '${granularity}' (manifest.yaml test_policy.granularity) — legal set: ${[...GRANULARITIES].join(', ')}`
    );
  }

  const escalation = block.escalation ?? true;
  if (typeof escalation !== 'boolean') {
    throw new Error(
      `INVALID_ESCALATION_FLAG: '${escalation}' (manifest.yaml test_policy.escalation) — must be boolean`
    );
  }

  const rules = block.escalation_rules ?? [];
  if (rules.length > MAX_RULES) {
    throw new Error(
      `ESCALATION_RULES_LIMIT_EXCEEDED: ${rules.length} rules exceeds cap of ${MAX_RULES}`
    );
  }

  for (const rule of rules) {
    for (const [dim, expr] of Object.entries(rule.when ?? {})) {
      if (!DIMENSIONS.has(dim)) {
        throw new Error(
          `UNKNOWN_ROUTING_DIMENSION: '${dim}' — legal dimensions: ${[...DIMENSIONS].join(', ')}`
        );
      }
      if (!RULE_EXPR.test(expr)) {
        throw new Error(
          `INVALID_ESCALATION_RULE_EXPRESSION: '${expr}' for dimension '${dim}' — must match ${RULE_EXPR}`
        );
      }
    }
  }

  return { policy: { granularity, escalation, escalation_rules: rules }, warnings: [] };
}

/**
 * Resolve the effective granularity via the module → manifest → domain →
 * fallback priority chain.
 *
 * @param {object} [options]
 * @param {string} [options.moduleOverride] - `modules[].test_policy.granularity`
 * @param {string} [options.manifestPolicy] - `test_policy.granularity`
 * @param {string} [options.domainDefault] - domain-level default granularity
 * @returns {{ granularity: string, source: string }}
 */
export function resolveGranularity({ moduleOverride, manifestPolicy, domainDefault } = {}) {
  if (moduleOverride) return { granularity: moduleOverride, source: 'module' };
  if (manifestPolicy) return { granularity: manifestPolicy, source: 'manifest' };
  if (domainDefault) return { granularity: domainDefault, source: 'domain' };
  return { granularity: 'per-behavior', source: 'fallback' };
}
