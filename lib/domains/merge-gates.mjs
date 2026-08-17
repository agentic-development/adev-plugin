/**
 * Gate merge function.
 *
 * Merges domain gates + governance gates by `id`.
 * Governance gates with matching IDs override domain gates.
 * Enforces argv-list format for `command` (SEC-2).
 *
 * Pure function — never mutates inputs, returns new objects.
 *
 * @module lib/domains/merge-gates
 */

/**
 * Validate a gate entry has required fields and valid command format.
 *
 * @param {object} entry
 * @param {Array<{ code: string, message: string }>} warnings
 * @returns {object|null} Validated gate or null if invalid
 */
function validateGate(entry, warnings) {
  if (!entry || typeof entry !== 'object') {
    warnings.push({ code: 'INVALID_GATE', message: 'Gate entry is not an object — skipped.' });
    return null;
  }
  if (!entry.id) {
    warnings.push({ code: 'INVALID_GATE', message: 'Gate entry missing required id field — skipped.' });
    return null;
  }
  if (!entry.command) {
    warnings.push({ code: 'INVALID_GATE', message: `Gate '${entry.id}' missing required command field — skipped.` });
    return null;
  }
  // SEC-2: Reject shell-form command strings
  if (!Array.isArray(entry.command)) {
    warnings.push({
      code: 'INVALID_GATE',
      message: `Gate '${entry.id}' command must be an argv list (array), not a string — skipped.`,
    });
    return null;
  }
  // Every consumer of a merged gate treats `command` as an argv list of
  // strings: `execFile` requires strings, and `computeCommandSha`
  // (lib/gates/gate-sets.mjs) throws INVALID_ARGV on anything else. The YAML
  // parser coerces bare numerics, so `command: ["node", 8080]` arrives here as
  // a mixed array. Dropping the gate — the same treatment a shell-form string
  // gets — keeps one malformed entry from aborting `adev domain load-gates`
  // and `adev gate doctor` for the whole project.
  const badIndex = entry.command.findIndex((token) => typeof token !== 'string');
  if (badIndex !== -1) {
    warnings.push({
      code: 'INVALID_GATE',
      message:
        `Gate '${entry.id}' command must contain only strings; element ${badIndex} is ` +
        `${JSON.stringify(entry.command[badIndex]) ?? String(entry.command[badIndex])} — skipped.`,
    });
    return null;
  }
  return {
    id: entry.id,
    command: [...entry.command],
    ...(entry.description !== undefined ? { description: entry.description } : {}),
    ...(entry.severity !== undefined ? { severity: entry.severity } : {}),
    ...(entry.tier !== undefined ? { tier: entry.tier } : {}),
  };
}

/**
 * Merge domain and governance gate overlays.
 *
 * @param {object|null} domainOverlay - Domain gate config (with `gates` array)
 * @param {object|null} governanceOverlay - Governance gate config (with `gates` array)
 * @returns {{ gates: object[], warnings: Array<{ code: string, message: string }> }}
 */
export function mergeGates(domainOverlay, governanceOverlay) {
  const warnings = [];
  const byId = new Map();

  // Process domain gates
  const domainGates = Array.isArray(domainOverlay?.gates) ? domainOverlay.gates : [];
  for (const entry of domainGates) {
    const validated = validateGate(entry, warnings);
    if (validated) {
      validated.__source = 'domain';
      byId.set(validated.id, validated);
    }
  }

  // Process governance gates (override domain on id match)
  const govGates = Array.isArray(governanceOverlay?.gates) ? governanceOverlay.gates : [];
  for (const entry of govGates) {
    const validated = validateGate(entry, warnings);
    if (validated) {
      if (byId.has(validated.id)) {
        warnings.push({
          code: 'GATE_OVERRIDE',
          message: `Governance gate '${validated.id}' overrides domain gate.`,
        });
      }
      validated.__source = 'governance';
      byId.set(validated.id, validated);
    }
  }

  return { gates: [...byId.values()], warnings };
}
