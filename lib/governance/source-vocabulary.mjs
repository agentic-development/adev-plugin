/**
 * DDR-4 — the ONE mapping from the run-time provenance vocabulary onto the
 * on-disk `source` enum.
 *
 * Two vocabularies exist and they are deliberately different:
 *
 *   - **run-time `__source`** — where THIS load saw the entry: `bundled`,
 *     `project`, `governance`, `project-override`, `manifest-specialist`,
 *     `domain`. It is recomputed on every load and never written to disk
 *     (`lib/extensions/governance-registry.mjs` refuses a supplied one).
 *   - **on-disk `source`** — `project` | `bundled` | `domain:<slug>` |
 *     `extension:<name>`. Written once, at materialization or at extension
 *     install, and never revised.
 *
 * This module is the only place the first is translated into the second. It
 * lives apart from both callers — `lib/governance/materialize.mjs` (the
 * producer) and `lib/governance/review-config.mjs` (the reviewer loader) —
 * because a second copy of the table is exactly the failure it exists to
 * prevent: Migration Step 6's drift exclusion matches the on-disk enum, so a
 * run-time value that maps to a fifth spelling in one caller and to `project`
 * in the other gives that pass undefined behaviour for the entry.
 *
 * Zero external dependencies; no imports at all, so neither caller pulls the
 * other's dependency tree in to reach the table.
 *
 * Spec: .context-index/specs/cross-cutting/explicit-governance-registries.spec.md
 *
 * @module lib/governance/source-vocabulary
 */

/**
 * The on-disk `source` enum, anchored.
 *
 * Anchoring is load-bearing, not decoration: the drift pass and the
 * `enabled: false` audit both test membership, and an unanchored pattern would
 * accept `project ` (trailing space) or `domain:Bad Slug` — values that read as
 * enum members to a human and as non-members to the next matcher someone
 * writes. {@link mapSourceVocabulary} therefore validates its OWN output
 * against this pattern rather than trusting its inputs.
 *
 * `extension:<name>` is stamped by the installer, never derived here; it is
 * named so consumers have one pattern to test against.
 *
 * @type {RegExp}
 */
export const ON_DISK_SOURCE = /^(project|bundled|domain:[a-z0-9-]+|extension:.+)$/;

/**
 * Run-time values that collapse to `project`.
 *
 * They differ only in HOW the project expressed the entry — a row in
 * `governance/review.yaml`, a row overriding a bundled one, a legacy
 * `manifest.yaml:specialists` entry — not in WHO owns it, and ownership is the
 * only question the drift pass and the `enabled: false` audit ask.
 *
 * `project-override` in particular must NOT become a fifth on-disk value: an
 * entry the project authored to override a bundled one is project-authored, and
 * the drift pass has to keep seeing it.
 *
 * @type {Set<string>}
 */
const PROJECT_FLAVOURED = new Set([
  "project",
  "governance",
  "project-override",
  "manifest-specialist",
]);

function coded(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/**
 * Map one run-time provenance value onto its on-disk `source` value.
 *
 *   | run-time `__source`   | on-disk `source` |
 *   |-----------------------|------------------|
 *   | `bundled`             | `bundled`        |
 *   | `project`             | `project`        |
 *   | `governance`          | `project`        |
 *   | `project-override`    | `project`        |
 *   | `manifest-specialist` | `project`        |
 *   | `domain`              | `domain:<slug>`  |
 *
 * An UNKNOWN value throws rather than defaulting to `project`: a wrong `source`
 * is worse than a refusal, because the whole point of the field is that the
 * drift pass can trust it. Adding a run-time value is therefore a deliberate
 * edit here, not a silent widening.
 *
 * @param {unknown} runtimeSource The `__source` value.
 * @param {string|null} [domainSlug] Resolved domain slug, for the `domain:` form.
 * @returns {string} A value guaranteed to match {@link ON_DISK_SOURCE}.
 * @throws {Error} `MATERIALIZE_SOURCE_UNMAPPED`.
 */
export function mapSourceVocabulary(runtimeSource, domainSlug = null) {
  let mapped;
  if (runtimeSource === "domain") {
    // Interpolating a non-string first would let `null` and `undefined`
    // stringify into `domain:null` / `domain:undefined`, both of which are
    // enum-SHAPED and therefore survive the output check below. Refusing the
    // non-string before it becomes a plausible-looking slug is what keeps that
    // check honest.
    mapped = typeof domainSlug === "string" ? `domain:${domainSlug}` : "domain:";
  } else if (typeof runtimeSource === "string" && PROJECT_FLAVOURED.has(runtimeSource)) {
    mapped = "project";
  } else if (runtimeSource === "bundled") mapped = "bundled";
  else {
    throw coded(
      "MATERIALIZE_SOURCE_UNMAPPED",
      `provenance ${JSON.stringify(runtimeSource)} is not in DDR-4's mapping table ` +
        `(bundled, project, governance, project-override, manifest-specialist, ` +
        `domain). A new vocabulary value must be mapped deliberately rather than ` +
        `defaulting to 'project'.`,
    );
  }

  // Output validation, not input validation: the only way to produce a
  // non-member above is a domain slug that is not enum-shaped, and emitting
  // `domain:Bad Slug` would write a value the drift pass silently skips.
  if (!ON_DISK_SOURCE.test(mapped)) {
    throw coded(
      "MATERIALIZE_SOURCE_UNMAPPED",
      `provenance ${JSON.stringify(runtimeSource)} with domain slug ` +
        `${JSON.stringify(domainSlug)} maps to ${JSON.stringify(mapped)}, which is ` +
        `not a member of the on-disk source enum ` +
        `(project | bundled | domain:<slug> | extension:<name>, slug matching ` +
        `[a-z0-9-]+). Writing it would produce a row the drift pass cannot ` +
        `classify.`,
    );
  }
  return mapped;
}
