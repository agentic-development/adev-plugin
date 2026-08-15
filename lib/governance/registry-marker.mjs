/**
 * The write-once `materialized_at` marker on a governance registry.
 *
 * A marker says one thing: "this file has been materialized, so what it
 * declares IS what runs." Task 10's fail-closed guard reads it; this module
 * only reads and stamps it.
 *
 * ## The marked set, and why two registries are EXEMPT (DDR-1)
 *
 * `review.yaml`, `diagnostics.yaml` and `gates.yaml` are marked because each
 * has (or had) a second, invisible contributor: gates and reviewers both draw
 * entries from the active domain overlay under `templates/domains/<d>/`, and
 * diagnostics carries bundled `plugin:` rows whose provenance is not stated on
 * the row. Reading any of the three did not tell you what runs.
 *
 * `validate.yaml` and `boundaries.yaml` are EXEMPT:
 *
 *   - both are already explicit single-source registries — the project file is
 *     the only contributor — so a marker would discriminate nothing; and
 *   - exempting them keeps two shipped behaviours working. The reference
 *     extension-install test
 *     (`tests/lib/extensions/example-validation-check-install.test.mjs`)
 *     installs into `validate.yaml` and asserts on the resulting file; and
 *     /adev:validate Check 8 SKIPs over an EMPTY `boundaries.yaml`, which a
 *     fail-closed marker guard would turn into a hard failure for every
 *     project that has not opted into boundary rules.
 *
 * `assertMaterialized` is deliberately NOT here. The guard belongs with the
 * consumers that must fail closed (Task 10); this module must stay importable
 * by the producer without dragging a guard along.
 *
 * Spec: .context-index/specs/cross-cutting/explicit-governance-registries.spec.md
 *
 * @module lib/governance/registry-marker
 */

import { readFileSync } from "node:fs";

/**
 * The bounded set of registry FILENAMES that carry a marker (DDR-1).
 * @type {Set<string>}
 */
export const MARKED_REGISTRIES = new Set(["review.yaml", "diagnostics.yaml", "gates.yaml"]);

/** The top-level YAML key the marker lives under. */
export const MARKER_KEY = "materialized_at";

/**
 * A top-level `materialized_at:` line — column 0, no leading whitespace.
 *
 * The anchoring is the whole point. An ENTRY field named `materialized_at`
 * is indented beneath a `- ` marker and must NOT read as a file marker; a
 * project that stamps its own entries would otherwise satisfy the guard
 * without the file ever having been materialized.
 */
const MARKER_LINE = new RegExp(`^${MARKER_KEY}:(.*)$`);

/** ISO-8601 UTC, the only shape this module writes or accepts back. */
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/**
 * The marker value of `filePath`, or `null`.
 *
 * `null` means "no usable marker": the file is absent or unreadable, the
 * top-level key is missing, or its value is not an ISO-8601 UTC instant. A
 * corrupt value reads as absent so the Task 10 guard fails CLOSED on it —
 * but {@link stampMarker} still refuses to add a second one, so the corruption
 * has to be fixed by hand rather than papered over.
 *
 * @param {string} filePath Absolute path to a governance registry file.
 * @returns {string|null} The ISO-8601 UTC instant, or null.
 */
export function readMarker(filePath) {
  let text;
  try {
    text = readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
  const raw = findMarkerValue(text);
  if (raw === null) return null;
  if (!ISO_UTC.test(raw)) return null;
  if (Number.isNaN(Date.parse(raw))) return null;
  return raw;
}

/**
 * Stamp `text` with a marker, WRITE-ONCE.
 *
 * Returns `text` unchanged (identity, `===`) when a top-level `materialized_at`
 * key is already present, whatever its value. That is what makes a second
 * `adev governance materialize` run byte-identical to the first.
 *
 * The marker is appended at end of file, after a blank line: appending is the
 * only insertion that cannot disturb a sibling key, a comment or an entry
 * block, which is the same reason the splice writer exists.
 *
 * @param {string} text Current file text.
 * @param {string} [isoNow] The instant to stamp; defaults to now.
 * @returns {string} The stamped text, or `text` itself when already marked.
 */
export function stampMarker(text, isoNow = new Date().toISOString()) {
  if (typeof text !== "string") {
    throw coded("MARKER_INPUT_INVALID", `stampMarker requires text, got ${typeof text}.`);
  }
  if (findMarkerValue(text) !== null) return text;
  if (!ISO_UTC.test(isoNow)) {
    throw coded(
      "MARKER_INPUT_INVALID",
      `marker value ${JSON.stringify(isoNow)} is not an ISO-8601 UTC instant.`,
    );
  }

  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const body = text === "" || text.endsWith(eol) ? text : text + eol;
  return (
    body +
    eol +
    `# Stamped by 'adev governance materialize' — write-once. The entries above are${eol}` +
    `# the complete effective set; nothing is contributed from anywhere else.${eol}` +
    `${MARKER_KEY}: ${isoNow}${eol}`
  );
}

/**
 * The raw text after a top-level `materialized_at:`, or null when the key is
 * absent. Shared by {@link readMarker} (which then validates it) and
 * {@link stampMarker} (which only cares that the key exists).
 *
 * @param {string} text
 * @returns {string|null}
 */
function findMarkerValue(text) {
  for (const line of text.split(/\r?\n/)) {
    const hit = line.match(MARKER_LINE);
    if (hit) return hit[1].trim();
  }
  return null;
}

function coded(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}
