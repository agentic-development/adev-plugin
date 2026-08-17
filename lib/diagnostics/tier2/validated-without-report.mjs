/**
 * Tier-2 producer: `adev/validated-without-report`.
 *
 * Asserts that a spec claiming `status: validated` in its frontmatter has a
 * co-located validation report at `<spec-stem>.validate.md`. A `validated`
 * status with no report is self-asserted — nothing in the lifecycle proves
 * `/adev:validate` ever ran — yet downstream tooling (status dashboards,
 * milestone rollups, `/adev:build` gating) treats it as ground truth.
 *
 * Tier 2 rather than Tier 1: the check stats a sibling file rather than
 * being a pure in-memory frontmatter inspection, so it belongs on the
 * on-demand surface (`adev diagnose`) rather than the write-time
 * `appendEvent` path. Cost is still one `existsSync` — no directory walk —
 * so it stays well inside the engine's 200 ms soft timing budget.
 *
 * Routing authority: `.context-index/adrs/0010-governance-check-layering.md`
 * decision flow step 5 — "does it inspect an artifact (JSONL event, spec
 * frontmatter, ADR file, lifecycle log) for verifiable invariants? →
 * `diagnostics.yaml`, classify by tier".
 *
 * ── Ownership of the `.validate.md` convention (SA-13) ──────────────────────
 *
 * Two call sites derive `<spec-stem>.validate.md`. They are deliberately
 * distinct, not duplicated logic:
 *
 *   1. `lib/reality-check.mjs:326` — treats report existence as a
 *      CONFIDENCE SIGNAL. It infers an *actual* lifecycle status from
 *      artifacts on disk (`validated` at `CONFIDENCE.HIGH` when the report
 *      exists) so it can report declared-vs-actual drift. It never asserts;
 *      absence simply lowers the inferred status to `implemented` or
 *      `review-passed`.
 *   2. This producer — treats report existence as a HARD INVARIANT. Given a
 *      spec that *declares* `status: validated`, absence of the report is an
 *      error regardless of any confidence weighting. This is the only one of
 *      the two that can fail a run.
 *
 * A third call site — a first-run skip predicate on the validate-side
 * heuristics capture path — was retired along with the dead verb it belonged
 * to; see `.context-index/specs/features/heuristics/failure-capture.spec.md`.
 *
 * The distinction is direction of inference: reality-check derives status
 * FROM artifacts; this producer validates a DECLARED status AGAINST
 * artifacts. Consolidating them behind one helper is deferred — the
 * reality-check module is out of scope for this change, and a shared helper
 * with no second consumer would be premature. `validationReportPathFor` is
 * exported here so a future consolidation has an obvious owner to import.
 *
 * @module lib/diagnostics/tier2/validated-without-report
 */

import { readFileSync, existsSync } from 'node:fs';
import { relative } from 'node:path';

import { parseYaml } from '../../profiles/yaml.mjs';
import { SPEC_STATUSES } from '../../spec-status.mjs';

const DIAGNOSTIC_ID = 'adev/validated-without-report';
const SEVERITY = 'error';

/**
 * The frontmatter status value that requires a backing report.
 *
 * Sourced from the canonical enum by index rather than inlined — the same
 * pattern `lib/reality-check.mjs:28` and `lib/amendment-graph.mjs:44` use,
 * and the one `tests/lib/spec-status-no-bare-literals.test.mjs` enforces
 * across `lib/`. Index 5 is `validated` in the documented lifecycle order.
 */
const VALIDATED_STATUS = SPEC_STATUSES[5];

/** Suffix identifying a spec file. */
const SPEC_SUFFIX = '.spec.md';
/** Suffix of the co-located validation report. */
const REPORT_SUFFIX = '.validate.md';

/**
 * Map a spec path to the path of its co-located validation report.
 *
 * Returns `null` when `specPath` is not a `.spec.md` file — the convention
 * is only defined for specs, and callers should treat a non-spec artifact
 * as out of scope rather than guessing a stem.
 *
 * @param {string} specPath
 * @returns {string|null}
 */
export function validationReportPathFor(specPath) {
  if (typeof specPath !== 'string' || !specPath.endsWith(SPEC_SUFFIX)) return null;
  return specPath.slice(0, -SPEC_SUFFIX.length) + REPORT_SUFFIX;
}

/**
 * Extract the frontmatter `status:` scalar from markdown content.
 *
 * Mirrors `lib/diagnostics/tier1/frontmatter-present.mjs`: slice the
 * `---`-delimited block and hand it to the in-tree `parseYaml` helper
 * (zero external deps per Constitution Principle 1).
 *
 * Returns `null` for every "cannot determine" case — absent frontmatter,
 * unterminated block, YAML parse failure, non-string `status`. Those cases
 * belong to `adev/frontmatter-present` (block presence + parseability) and
 * `adev/status-enum-legal` (value legality); this producer stays silent so
 * a malformed spec surfaces one diagnostic, not three.
 *
 * @param {string} content
 * @returns {string|null}
 */
function readFrontmatterStatus(content) {
  const lines = content.split(/\r?\n/);
  let open = 0;
  while (open < lines.length && lines[open].trim() === '') open++;
  if (open >= lines.length || lines[open].trim() !== '---') return null;

  let close = -1;
  for (let i = open + 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') { close = i; break; }
  }
  if (close === -1) return null;

  let parsed;
  try {
    parsed = parseYaml(lines.slice(open + 1, close).join('\n'));
  } catch {
    return null; // adev/frontmatter-present's domain
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const status = parsed.status;
  return typeof status === 'string' ? status.trim() : null;
}

/**
 * Run the validated-without-report producer.
 *
 * Fires `error` only when BOTH conditions hold:
 *   - frontmatter `status` is exactly `validated`, and
 *   - `<spec-stem>.validate.md` does not exist alongside the spec.
 *
 * Every other status (`draft`, `review-pending`, `review-passed`,
 * `review-blocked`, `implemented`, `superseded`) returns `{ fired: false }`,
 * as does a `validated` spec whose report is present.
 *
 * @param {object} ctx
 * @param {string} ctx.spec - Resolved absolute path to a spec file.
 * @param {string} [ctx.projectRoot] - Used to render a relative path in the
 *   message. The engine redacts absolute paths in `message`, so a relative
 *   path reads better there; `citation` keeps the absolute path, matching
 *   the tier-1 producers.
 * @returns {{ fired: boolean, id?: string, severity?: string, message?: string, citation?: string }}
 */
export function run(ctx) {
  const specPath = ctx?.spec;
  if (typeof specPath !== 'string' || !existsSync(specPath)) {
    // No spec to check — silent no-op. The engine's spec-not-found
    // self-diagnostic handles the upstream case.
    return { fired: false };
  }

  const reportPath = validationReportPathFor(specPath);
  if (reportPath === null) return { fired: false }; // not a .spec.md artifact

  let content;
  try {
    content = readFileSync(specPath, 'utf8');
  } catch {
    return { fired: false };
  }

  const status = readFrontmatterStatus(content);
  if (status !== VALIDATED_STATUS) return { fired: false };

  // Single stat — the whole cost of this producer.
  if (existsSync(reportPath)) return { fired: false };

  const projectRoot = typeof ctx?.projectRoot === 'string' ? ctx.projectRoot : null;
  const rel = (p) => (projectRoot ? relative(projectRoot, p) : p);

  // The remedy names the skill as `adev:validate`, NOT `/adev:validate`:
  // the engine's `normaliseMessage` redacts any whitespace-preceded
  // `/`-rooted token to `<external-path-redacted>`, which would eat the
  // leading-slash form and leave the message without an actionable remedy.

  return {
    fired: true,
    id: DIAGNOSTIC_ID,
    severity: SEVERITY,
    message:
      `${rel(specPath)} declares status: validated but has no validation report at ` +
      `${rel(reportPath)}. Either run the adev:validate skill on this spec to produce ` +
      `the report, or set the frontmatter status back to the last status the artifacts ` +
      `support (implemented, or review-passed if it was never implemented).`,
    citation: specPath,
  };
}
