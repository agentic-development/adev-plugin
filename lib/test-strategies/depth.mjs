/**
 * Depth Resolution Protocol
 *
 * Resolves the test depth for a plan task via a strictly ordered, first-match-wins
 * static chain, followed by two monotonic-upward-only passes that may only raise
 * the chain result, never lower it:
 *
 *   Chain (static, first match wins):
 *     1. spec-declared  — spec frontmatter `test_depth:`
 *     2. module         — `modules[].test_depth` override
 *     3. risk-policy     — `risk-policies.yaml` policies[<risk_level>].test_depth
 *     4. domain          — domain `test-config.yaml` default
 *     5. fallback        — built-in `standard`
 *
 *   Escalation pass (Behavior 4) — post-chain, monotonic upward only, gated by
 *   `escalationEnabled` and a routing-score entry for the task.
 *
 *   Floor pass (Behavior 6) — applied last, after chain and escalation, in every
 *   resolution path. Floors depth at `thorough` when any evaluated leg holds:
 *   `risk_level: high`, a crossed boundary, or a target path matching the
 *   effective sensitive-path set (skipped when `targetPaths` is empty).
 */

import { matchGlob } from './manifest.mjs';

const RANK = Object.freeze({ minimal: 0, standard: 1, thorough: 2 });

/**
 * Validates that `depth` is one of `minimal | standard | thorough`, throwing
 * an `INVALID_TEST_DEPTH` error otherwise. Called as early as possible so an
 * invalid escalation-rule `depth` is rejected before it ever reaches a
 * comparison (where `RANK[x]` would be `undefined` and silently win).
 *
 * @param {string} depth
 * @returns {string}
 */
function assertValidDepth(depth) {
  if (!Object.prototype.hasOwnProperty.call(RANK, depth)) {
    throw new Error(
      `INVALID_TEST_DEPTH: '${depth}' (escalation_rules[].depth) — legal set: ${Object.keys(RANK).join(', ')}`,
    );
  }
  return depth;
}

/**
 * Returns whichever of two depths ranks higher (ties keep `a`).
 *
 * @param {string} a
 * @param {string} b
 * @returns {string}
 */
function higherDepth(a, b) {
  assertValidDepth(a);
  assertValidDepth(b);
  return RANK[a] >= RANK[b] ? a : b;
}

/**
 * Static, first-match-wins depth chain. No derived signal occupies a chain
 * stage, so an operator-authored override is always consulted.
 *
 * @param {object} input
 * @returns {{ depth: string, source: string }}
 */
function resolveChain({ spec, moduleOverride, riskLevel, policies, domainDefault }) {
  if (spec?.test_depth) {
    return { depth: spec.test_depth, source: 'spec-declared' };
  }
  if (moduleOverride) {
    return { depth: moduleOverride, source: 'module' };
  }
  if (policies?.[riskLevel]?.test_depth) {
    return { depth: policies[riskLevel].test_depth, source: 'risk-policy' };
  }
  if (domainDefault) {
    return { depth: domainDefault, source: 'domain' };
  }
  return { depth: 'standard', source: 'fallback' };
}

// Pinned grammar (Behavior 9 / policy.mjs owns validation): one comparator
// followed by a 0..1 float, per the .routing.json contract.
const EXPR_RE = /^(<=|>=|<|>|==)\s*([\d.]+)$/;

/**
 * Evaluates a pinned-grammar `when:` expression against a routing-score value.
 * Escalation rules are assumed already validated (policy.mjs); this evaluates
 * by regex/comparison only — never `eval`/`new Function`.
 *
 * @param {string} expr
 * @param {number} value
 * @returns {boolean}
 */
function evalExpr(expr, value) {
  const match = EXPR_RE.exec(expr);
  if (!match) return false;
  const [, op, num] = match;
  const n = Number(num);
  switch (op) {
    case '<=':
      return value <= n;
    case '>=':
      return value >= n;
    case '<':
      return value < n;
    case '>':
      return value > n;
    case '==':
      return value === n;
    default:
      return false;
  }
}

/**
 * Escalation pass (Behavior 4). Monotonic upward only — a matching rule
 * naming a lower depth than the chain produced is a no-op. When two matching
 * rules name different depths, the highest wins and a CONFLICTING_ESCALATION_RULE
 * advisory names both rules.
 *
 * @param {object} input
 * @returns {{ depth: string, escalated: boolean, escalation_skipped: (string|undefined), warnings: object[] }}
 */
function resolveEscalation({ depth, escalationEnabled, escalationRules, routingScore }) {
  const warnings = [];

  if (!escalationEnabled) {
    return { depth, escalated: false, escalation_skipped: 'disabled', warnings };
  }
  if (!routingScore) {
    return { depth, escalated: false, escalation_skipped: 'no-routing-entry', warnings };
  }

  const matched = [];
  let winner = null;
  for (const rule of escalationRules ?? []) {
    const dims = Object.entries(rule.when ?? {});
    const allMatch = dims.every(
      ([dim, expr]) => routingScore[dim] !== undefined && evalExpr(expr, routingScore[dim]),
    );
    if (allMatch) {
      matched.push(rule);
      winner = winner === null ? rule.depth : higherDepth(winner, rule.depth);
    }
  }

  if (matched.length === 0) {
    return { depth, escalated: false, escalation_skipped: 'no-match', warnings };
  }

  if (matched.length > 1 && new Set(matched.map((r) => r.depth)).size > 1) {
    warnings.push({
      code: 'CONFLICTING_ESCALATION_RULE',
      message: `${matched.length} matching escalation rules named different depths; the highest (${winner}) was used`,
      rules: matched.map((r) => r.when),
    });
  }

  const finalDepth = higherDepth(depth, winner);
  return { depth: finalDepth, escalated: finalDepth !== depth, escalation_skipped: undefined, warnings };
}

/**
 * Floor pass (Behavior 6). Applied last, after chain and escalation, in every
 * resolution path — escalating only. Three legs: `risk_level: high`, a crossed
 * boundary, and a target path matching the effective sensitive-path set (this
 * last leg is skipped when `targetPaths` is empty — Behavior 8's degraded mode).
 *
 * @param {object} input
 * @returns {{ depth: string, floor_applied: boolean, floor_legs: string[], floor_inputs: string, warnings: object[] }}
 */
function resolveFloor({ depth, riskLevel, boundaryCrossing, targetPaths, sensitivePaths }) {
  const paths = targetPaths ?? [];
  const legs = [];

  if (riskLevel === 'high') legs.push('risk-level');
  if (boundaryCrossing) legs.push('boundary');
  if (paths.length > 0 && paths.some((p) => sensitivePaths.some((pattern) => matchGlob(pattern, p)))) {
    legs.push('sensitive-path');
  }

  const floor_applied = legs.length > 0;
  const finalDepth = floor_applied ? higherDepth(depth, 'thorough') : depth;
  const floor_inputs = paths.length > 0 ? 'available' : 'unavailable';

  // A DEPTH_FLOOR_APPLIED advisory is emitted whenever any evaluated floor
  // condition held, whether or not the floor changed the resolved value
  // (Behavior 6) — e.g. escalation already reached `thorough` before the
  // floor pass ran.
  const warnings = floor_applied
    ? [{ code: 'DEPTH_FLOOR_APPLIED', message: `depth floored to thorough (${legs.join(', ')})`, legs }]
    : [];

  return { depth: finalDepth, floor_applied, floor_legs: legs, floor_inputs, warnings };
}

/**
 * Resolves the test depth for a single plan task: static chain, then the
 * monotonic-upward escalation pass, then the monotonic-upward floor pass.
 * Pure — no I/O.
 *
 * @param {object} input
 * @param {object} [input.spec] - Spec frontmatter (`test_depth:` wins over every other source).
 * @param {string} [input.moduleOverride] - `modules[].test_depth` override.
 * @param {string} input.riskLevel - `"low" | "medium" | "high"`.
 * @param {object} input.policies - `risk-policies.yaml` `policies` map.
 * @param {string} [input.domainDefault] - Domain `test-config.yaml` default.
 * @param {object} [input.routingScore] - This task's `.routing.json` entry, if any.
 * @param {object[]} [input.escalationRules] - `test_policy.escalation_rules`.
 * @param {boolean} input.escalationEnabled - `test_policy.escalation`.
 * @param {boolean} input.boundaryCrossing - Whether a `boundaries.yaml` rule is crossed.
 * @param {string[]} input.targetPaths - Parsed task paths; may be empty (Behavior 8).
 * @param {string[]} input.sensitivePaths - The already-unioned effective sensitive-path set.
 * @returns {{ depth: string, source: string, escalated: boolean, escalation_skipped: (string|undefined), floor_applied: boolean, floor_legs: string[], floor_inputs: string, warnings: object[] }}
 */
export function resolveTestDepth(input) {
  const chainResult = resolveChain(input);
  const escalationResult = resolveEscalation({ ...input, depth: chainResult.depth });
  const floorResult = resolveFloor({ ...input, depth: escalationResult.depth });

  return {
    depth: floorResult.depth,
    source: chainResult.source,
    escalated: escalationResult.escalated,
    escalation_skipped: escalationResult.escalation_skipped,
    floor_applied: floorResult.floor_applied,
    floor_legs: floorResult.floor_legs,
    floor_inputs: floorResult.floor_inputs,
    warnings: [...escalationResult.warnings, ...floorResult.warnings],
  };
}
