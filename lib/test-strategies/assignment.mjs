/**
 * Strategy Assignment Protocol
 *
 * Resolves the test strategy for a task using a strictly ordered priority chain:
 *   1. spec-declared  — spec frontmatter explicitly names a valid strategy
 *   2. manifest       — manifest test_strategies glob rules match a task file
 *   3. detected       — heuristic file-path detection
 *   4. fallback       — default to 'unit'
 */

import { getStrategy } from './registry.mjs';
import { parseTestStrategies, matchStrategy } from './manifest.mjs';
import { detectTaskStrategy } from './detection.mjs';

/**
 * Resolves the test strategy for a single task.
 *
 * @param {object} task - Task object with `id` (string) and `filePaths` (string[])
 * @param {object|null|undefined} manifest - Parsed manifest object
 * @param {object|null|undefined} spec - Parsed spec frontmatter object
 * @returns {{ strategyId: string, source: string, confidence: string, reason: string|null, warnings: string[] }}
 */
export function resolveStrategy(task, manifest, spec) {
  const warnings = [];

  // ── Level 1: spec-declared ──────────────────────────────────────────────────
  if (spec != null && spec.test_strategy != null) {
    const id = spec.test_strategy;
    if (getStrategy(id)) {
      return {
        strategyId: id,
        source: 'spec-declared',
        confidence: 'high',
        reason: null,
        warnings,
      };
    }
    // Unknown id — warn and fall through
    warnings.push(`Unknown spec test_strategy '${id}' — falling through`);
  }

  // ── Level 2: manifest ───────────────────────────────────────────────────────
  const { strategies, warnings: manifestWarnings } = parseTestStrategies(manifest);
  warnings.push(...manifestWarnings);

  if (strategies.length > 0 && Array.isArray(task.filePaths)) {
    for (const filePath of task.filePaths) {
      const match = matchStrategy(filePath, strategies);
      if (match) {
        return {
          strategyId: match.strategy_id,
          source: 'manifest',
          confidence: 'high',
          reason: null,
          warnings,
        };
      }
    }
  }

  // ── Level 3: detected ───────────────────────────────────────────────────────
  const filePaths = Array.isArray(task.filePaths) ? task.filePaths : [];
  if (filePaths.length > 0) {
    const detected = detectTaskStrategy(filePaths);
    // Only treat as 'detected' if the result is something other than the
    // bare default — detection always returns at least unit/high, so we
    // always honour whatever it reports.
    return {
      strategyId: detected.strategyId,
      source: 'detected',
      confidence: detected.confidence,
      reason: null,
      warnings,
    };
  }

  // ── Level 4: fallback ───────────────────────────────────────────────────────
  return {
    strategyId: 'unit',
    source: 'fallback',
    confidence: 'high',
    reason: null,
    warnings,
  };
}

/**
 * Resolves the test strategy for each task in a batch.
 *
 * @param {object[]} tasks - Array of task objects
 * @param {object|null|undefined} manifest - Parsed manifest object
 * @param {object|null|undefined} spec - Parsed spec frontmatter object
 * @returns {Array<{ strategyId: string, source: string, confidence: string, reason: string|null, warnings: string[] }>}
 */
export function resolveStrategyBatch(tasks, manifest, spec) {
  return tasks.map((task) => resolveStrategy(task, manifest, spec));
}
