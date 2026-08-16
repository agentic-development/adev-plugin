/**
 * `enabled` / `disabled_reason` — one rule, read the same way by every
 * governance registry loader.
 *
 * Spec: .context-index/specs/cross-cutting/explicit-governance-registries.spec.md
 * Behavior 5, Invariant 5, Error Case `DISABLED_WITHOUT_REASON`.
 *
 * ## Why this is shared rather than repeated four times
 *
 * Before this module the four loaders disagreed about the same two fields:
 * `validate-config.mjs` honoured `enabled: false` and kept the entry visible,
 * `review-config.mjs` and `boundaries.mjs` DROPPED the entry with no trace, and
 * `lib/diagnostics/index.mjs` did not read the field at all. `disabled_reason`
 * was read by nothing anywhere. A disabled entry was therefore indistinguishable
 * from an absent one in three registries out of four — which is precisely what
 * Invariant 5 forbids: "opting out becomes a statement".
 *
 * ## The shape, and why the entry stays visible
 *
 * A disabled entry is not removed. It stays in its loader's own collection
 * carrying:
 *
 *     { id, enabled: false, disabled_reason: string|null, disabledNote: string }
 *
 * and every loader additionally exposes a `disabled` list holding those same
 * objects. Absent means NO ROW; disabled means a row that says so and says why.
 * A consumer that wants only what runs filters on `enabled !== false` (or reads
 * the `disabled` list and subtracts); a report that must show "deliberately
 * disabled — <reason>" has it directly.
 *
 * ## Two deliberate non-refusals
 *
 * 1. **A missing reason WARNS, it does not refuse.** `DISABLED_WITHOUT_REASON`
 *    is a schema warning and the entry STAYS DISABLED. Refusing would make the
 *    field unusable in the exact case it is reached for — an operator switching
 *    something off in a hurry — and would turn "I did not explain myself" into
 *    "your check is back on", which is a governance change nobody asked for.
 *    An empty or whitespace-only reason is no reason and warns identically.
 *
 * 2. **A non-boolean `enabled` warns and the entry stays ENABLED.** Only the
 *    boolean `false` switches enforcement off. `enabled: 'false'` — the likeliest
 *    typo, and what a quoting mistake in YAML produces — must not silently
 *    disable a check, because a governance check that stopped running without
 *    anyone deciding so is a gate that fails OPEN. Refusing the load outright
 *    was the alternative and is worse: one typo would take the whole registry
 *    down.
 *
 * Zero external dependencies.
 *
 * @module lib/governance/enablement
 */

/** A disabled entry that does not say why. Warning, never a refusal. */
export const DISABLED_WITHOUT_REASON = "DISABLED_WITHOUT_REASON";

/** `enabled` present but not a boolean. Warning; the entry stays enabled. */
export const INVALID_ENABLED_VALUE = "INVALID_ENABLED_VALUE";

/**
 * @typedef {object} Enablement
 * @property {boolean} enabled Whether the entry runs.
 * @property {string|null} disabled_reason The stated reason, trimmed; `null`
 *   when the entry is enabled, or disabled with no usable reason.
 * @property {string|null} disabledNote One-line, operator-facing explanation
 *   suitable for a report row; `null` when the entry is enabled.
 * @property {Array<{code: string, message: string}>} warnings Schema warnings to
 *   merge into the loader's own list. Never empty-checked by the caller — push
 *   them all.
 */

/**
 * Read `enabled` / `disabled_reason` off one raw registry entry.
 *
 * @param {any} raw The entry as parsed from the registry file.
 * @param {{ registryFile: string, id: string }} ctx `registryFile` is the bare
 *   filename (`validate.yaml`); `id` is the entry id, already validated by the
 *   caller, used only in operator-facing text.
 * @returns {Enablement}
 */
export function resolveEnablement(raw, { registryFile, id }) {
  const warnings = [];
  const value = raw?.enabled;

  if (value !== undefined && typeof value !== "boolean") {
    warnings.push({
      code: INVALID_ENABLED_VALUE,
      message:
        `Entry '${id}' in governance/${registryFile}: 'enabled' must be the boolean ` +
        `true or false (got ${describe(value)}). Treated as ENABLED — only a real ` +
        `boolean false switches an entry off, so a quoting mistake cannot silently ` +
        `disable governance.`,
    });
    return enabledResult(warnings);
  }

  if (value !== false) return enabledResult(warnings);

  const stated = raw?.disabled_reason;
  const reason = typeof stated === "string" && stated.trim() !== "" ? stated.trim() : null;
  if (reason === null) {
    warnings.push({
      code: DISABLED_WITHOUT_REASON,
      message:
        `Entry '${id}' in governance/${registryFile} carries 'enabled: false' with no ` +
        `'disabled_reason'. It stays disabled; add a reason so the report can say why ` +
        `it does not run rather than leaving it indistinguishable from an entry nobody ` +
        `ever declared.`,
    });
  }

  return {
    enabled: false,
    disabled_reason: reason,
    disabledNote:
      `'${id}' skipped — disabled by governance/${registryFile}` +
      (reason ? ` (${reason})` : " with no stated reason"),
    warnings,
  };
}

function enabledResult(warnings) {
  return { enabled: true, disabled_reason: null, disabledNote: null, warnings };
}

/** Bounded, injection-safe rendering of an unexpected `enabled` value. */
function describe(value) {
  if (value === null) return "null";
  if (typeof value === "string") return `the string ${JSON.stringify(value.slice(0, 32))}`;
  if (Array.isArray(value)) return "a list";
  if (typeof value === "object") return "a map";
  return `the ${typeof value} ${String(value).slice(0, 32)}`;
}
