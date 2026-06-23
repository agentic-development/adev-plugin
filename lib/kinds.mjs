/**
 * Closed enumerations of spec kinds and charter kinds, plus validation helpers.
 *
 * This is the foundational primitive of the lifecycle-artifacts charter
 * (ADR-0009). Every downstream capability — frontmatter discriminator parsing,
 * template resolution, kind-aware authoring in /adev:specify and
 * /adev:brainstorm, and /adev:hygiene's kind-validity audit — consumes the
 * arrays and validators exported here.
 *
 * The arrays are frozen module-level constants (not factory output), so
 * identity equality holds across re-imports.
 *
 * @module lib/kinds
 * @see .context-index/specs/features/lifecycle-artifacts/kind-enumeration.spec.md
 * @see .context-index/adrs/0009-lifecycle-artifact-taxonomy.md §1
 */

/**
 * Closed enumeration of spec kinds in stable order.
 *
 * Adding, removing, or renaming a value requires an ADR amendment to ADR-0009
 * (or a successor ADR) plus matching template files in `templates/`.
 *
 * NOTE: "amendment" is deliberately NOT a member of this enum. `kind:` denotes
 * an artifact's *shape*, and an amendment of (e.g.) a behavioral spec is still
 * behavioral-shaped. Amendment is modeled as an orthogonal *relationship
 * overlay* via the `amends:` + `target-revision:` frontmatter pair (see
 * `lib/amendment-graph.mjs` and ADR-0009), so the closed enum stays at 6 and
 * `--kind amendment` is intentionally rejected with `INVALID_KIND`.
 *
 * @type {readonly ['behavioral', 'refactor', 'action', 'skill', 'integration', 'artifact']}
 */
export const SPEC_KINDS = Object.freeze([
  "behavioral",
  "refactor",
  "action",
  "skill",
  "integration",
  "artifact",
]);

/**
 * Closed enumeration of charter kinds in stable order.
 *
 * Adding, removing, or renaming a value requires an ADR amendment to ADR-0009
 * (or a successor ADR) plus matching template files in `templates/`.
 *
 * @type {readonly ['module', 'feature', 'cross-cutting', 'initiative']}
 */
export const CHARTER_KINDS = Object.freeze([
  "module",
  "feature",
  "cross-cutting",
  "initiative",
]);

/**
 * Internal lookup from layer name to its frozen enumeration.
 *
 * Used by `isValidKind` and `defaultKindFor` to dispatch on layer. Frozen so
 * the module's invariants cannot be undermined from inside.
 */
const KINDS_BY_LAYER = Object.freeze({
  spec: SPEC_KINDS,
  charter: CHARTER_KINDS,
});

/**
 * Internal lookup from layer name to its default kind.
 */
const DEFAULT_KIND_BY_LAYER = Object.freeze({
  spec: "behavioral",
  charter: "feature",
});

/**
 * Build an Error tagged with `code: 'INVALID_LAYER'` whose message names the
 * offending layer value.
 *
 * @param {unknown} layer - The value the caller passed for `layer`.
 * @returns {Error}
 */
function invalidLayerError(layer) {
  const rendered =
    typeof layer === "string" ? JSON.stringify(layer) : String(layer);
  const err = new Error(
    `INVALID_LAYER: expected 'spec' or 'charter', received ${rendered}`,
  );
  err.code = "INVALID_LAYER";
  return err;
}

/**
 * Return `true` iff `kind` is a member of the closed enumeration for `layer`.
 *
 * Behavior:
 *   - Valid `layer` ∈ {'spec', 'charter'} with `kind` in that layer's
 *     enumeration → `true`.
 *   - Valid `layer` with any other `kind` (unknown string, cross-layer string,
 *     empty string) → `false`.
 *   - Valid `layer` with non-string `kind` (number, object, null, undefined,
 *     array) → `false`. Never throws on the `kind` argument.
 *   - Invalid `layer` (anything other than 'spec' or 'charter') → throws
 *     `Error` tagged `code: 'INVALID_LAYER'` whose message names the offending
 *     value.
 *
 * @param {string} layer - 'spec' or 'charter'.
 * @param {unknown} kind - Candidate kind value (validated, may be any type).
 * @returns {boolean}
 * @throws {Error} `code: 'INVALID_LAYER'` if `layer` is not in the closed set.
 */
export function isValidKind(layer, kind) {
  const enumeration = KINDS_BY_LAYER[layer];
  if (!enumeration) {
    throw invalidLayerError(layer);
  }
  if (typeof kind !== "string") {
    return false;
  }
  return enumeration.includes(kind);
}

/**
 * Return the documented default kind for the given layer.
 *
 * Defaults: `'behavioral'` for `'spec'`, `'feature'` for `'charter'`. These
 * are the legacy-read-time defaults defined in ADR-0009 §3 and consumed by the
 * frontmatter discriminator's read-time defaulting behavior.
 *
 * @param {string} layer - 'spec' or 'charter'.
 * @returns {string}
 * @throws {Error} `code: 'INVALID_LAYER'` if `layer` is not in the closed set.
 */
export function defaultKindFor(layer) {
  const fallback = DEFAULT_KIND_BY_LAYER[layer];
  if (!fallback) {
    throw invalidLayerError(layer);
  }
  return fallback;
}
