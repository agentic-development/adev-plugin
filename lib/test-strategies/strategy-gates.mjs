/**
 * Turn manifest `test_strategies[]` entries that declare a `command` into
 * path-scoped gate rows.
 *
 * These rows are composed ONLY on the adoption path
 * (`loadCheck1Gates({ composeDomainOverlay: true })`, i.e.
 * `adev governance materialize --registry gates`), which writes them into
 * `governance/gates.yaml`. No consumer composes them at run time: the
 * governance file stays the single declaration of what runs, so a strategy
 * command runs only after it has a row there.
 *
 * @module lib/test-strategies/strategy-gates
 */

import { parseTestStrategies } from './manifest.mjs';

const VALID_TIERS = new Set(['fast', 'integration', 'e2e']);

/** Gate ids for adopted strategies are namespaced so they cannot collide with hand-named gates. */
export const STRATEGY_GATE_PREFIX = 'strategy-';

/**
 * @param {string} strategyId
 * @returns {string}
 */
export function strategyGateId(strategyId) {
  return `${STRATEGY_GATE_PREFIX}${strategyId}`;
}

/**
 * Build gate rows for every strategy that declares a command and is not
 * already gated by the project.
 *
 * A strategy is "already gated" when the project's gates declare its
 * `strategy-<id>` id, or declare a gate whose argv equals the strategy's
 * command: a project that wrote `dbt test` into gates.yaml by hand must not
 * get a second copy that runs it twice.
 *
 * Every refusal here is a warning, never an `INVALID_GATE`: materialize treats
 * `INVALID_GATE` as a load failure and would refuse to stamp the whole
 * registry over one malformed manifest entry.
 *
 * @param {object|null} manifest Parsed manifest.
 * @param {object[]} [existingGates] Raw gate rows already declared by the project.
 * @returns {{ gates: object[], warnings: Array<{ code: string, message: string }> }}
 */
export function strategyGates(manifest, existingGates = []) {
  const { strategies } = parseTestStrategies(manifest);
  const existing = Array.isArray(existingGates) ? existingGates.filter((g) => g && typeof g === 'object') : [];
  const existingIds = new Set(existing.map((g) => g.id).filter((id) => typeof id === 'string'));
  const existingArgv = new Set(
    existing.filter((g) => Array.isArray(g.command)).map((g) => JSON.stringify(g.command)),
  );

  const gates = [];
  const warnings = [];
  for (const s of strategies) {
    if (s.command === null) continue;
    const id = strategyGateId(s.strategy_id);

    if (s.command.length === 0 || s.command.some((t) => typeof t !== 'string' || t === '')) {
      warnings.push({
        code: 'STRATEGY_GATE_SKIPPED',
        message: `test_strategies '${s.strategy_id}': command must be a non-empty argv list of strings — not adopted as a gate.`,
      });
      continue;
    }
    if (!VALID_TIERS.has(s.tier)) {
      warnings.push({
        code: 'STRATEGY_GATE_SKIPPED',
        message: `test_strategies '${s.strategy_id}': tier '${s.tier}' is not fast, integration or e2e — not adopted as a gate.`,
      });
      continue;
    }
    if (existingIds.has(id) || existingArgv.has(JSON.stringify(s.command))) continue;

    gates.push({
      id,
      command: [...s.command],
      description: `Test strategy ${s.strategy_id} from manifest test_strategies`,
      tier: s.tier,
      paths: [...s.paths],
    });
  }
  return { gates, warnings };
}
