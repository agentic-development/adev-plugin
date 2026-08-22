// lib/cli/specify.mjs
//
// adev specify revise --spec <path>
//
// CLI entry-point for the /adev:specify --revise workflow axis (Task 9 of
// review-block-auto-retry.plan.md). Dispatches to lib/specify-revise.mjs.
//
// Exit codes:
//   0  revise succeeded; rev N → N+1 written, spec_revised event emitted
//   1  argument error, path traversal, or missing sidecars
//   2  spec status is not review-blocked under --auto (SPEC_NOT_BLOCKED)
//
// Path-containment (SEC-1) is enforced via `assertWithin` in the underlying
// library; this CLI re-asserts the contract by resolving paths against
// projectRoot before invocation.

import { parseArgs } from 'node:util';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve, relative, sep } from 'node:path';

import {
  reviseSpec, parseBlockersSidecar, resolveSectionAnchors, groupBlockersByAnchor,
} from '../specify-revise.mjs';
import { amendSpec } from '../specify-amend.mjs';
import { resolveContained } from '../path-safety.mjs';
import { run as runMechanismExistence } from '../diagnostics/tier2/mechanism-existence.mjs';

const USAGE = 'usage: adev specify <revise|amend|group-blockers|check-mechanisms> --spec <path> [...]';
const REVISE_USAGE = 'usage: adev specify revise --spec <path> [--auto] [--authored-sections <json|@path>]';
const AMEND_USAGE = 'usage: adev specify amend --spec <base-path> [--descriptor <slug>] [--kind <kind>] [--target-revision <N>]';
const GROUP_BLOCKERS_USAGE = 'usage: adev specify group-blockers --spec <path>';
const CHECK_MECHANISMS_USAGE = 'usage: adev specify check-mechanisms --spec <path>';

/**
 * Parse `--authored-sections` into a `Map<anchor, body>`. Accepts either a
 * JSON object literal (`{"anchor": "body", ...}`) or `@<path>` naming a JSON
 * file inside the project root — mirrors `parseFindings` in
 * lib/cli/blockers.mjs / `parseGateOutcomes` in lib/cli/report.mjs (per-anchor
 * authored bodies can be long; argv has a size limit a real revision easily
 * exceeds).
 *
 * @param {string} raw
 * @param {string} absRoot
 * @returns {{ok: true, value: Map<string,string>}|{ok: false, error: string}}
 */
function parseAuthoredSections(raw, absRoot) {
  let text = raw;
  let origin = '--authored-sections';

  if (raw.startsWith('@')) {
    const relPath = raw.slice(1);
    if (relPath.length === 0) {
      return { ok: false, error: "--authored-sections @<path> requires a path after '@'" };
    }
    const abs = resolveContained(absRoot, relPath);
    if (!abs) {
      return { ok: false, error: `--authored-sections path escapes project root: ${relPath}` };
    }
    try {
      text = readFileSync(abs, 'utf8');
    } catch (err) {
      return { ok: false, error: `--authored-sections could not read ${relPath}: ${err && err.message ? err.message : String(err)}` };
    }
    origin = `--authored-sections @${relPath}`;
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { ok: false, error: `${origin} is not valid JSON: ${err.message}` };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: `${origin} must be a JSON object mapping anchor -> body` };
  }
  const map = new Map();
  for (const [anchor, body] of Object.entries(parsed)) {
    if (typeof body !== 'string') {
      return { ok: false, error: `${origin}: value for anchor "${anchor}" must be a string` };
    }
    map.set(anchor, body);
  }
  return { ok: true, value: map };
}

// Flags that are mutually exclusive with --revise per AC "mutually
// exclusive with --extract / --refactor / --from-diff / --cross-cutting".
const CONFLICTING_FLAGS = new Set([
  '--extract', '--refactor', '--from-diff', '--cross-cutting',
]);

// Flags mutually exclusive with --amend (AC 7): the other workflow axes.
const AMEND_CONFLICTING_FLAGS = new Set([
  '--revise', '--extract', '--refactor', '--from-diff', '--cross-cutting',
]);

export async function run({ projectRoot, argv }) {
  const sub = argv[0];
  if (sub === 'amend') {
    return runAmend({ projectRoot, argv });
  }
  if (sub === 'group-blockers') {
    return runGroupBlockers({ projectRoot, argv });
  }
  if (sub === 'check-mechanisms') {
    return runCheckMechanisms({ projectRoot, argv });
  }
  if (sub !== 'revise') {
    console.error(USAGE);
    process.exit(1);
  }

  // Detect mutually-exclusive flags up front.
  for (const arg of argv.slice(1)) {
    if (CONFLICTING_FLAGS.has(arg)) {
      console.error(`CONFLICTING_FLAGS: --revise is mutually exclusive with ${arg}`);
      process.exit(1);
    }
  }

  let parsed;
  try {
    parsed = parseArgs({
      args: argv.slice(1),
      options: {
        spec: { type: 'string' },
        auto: { type: 'boolean', default: false },
        'authored-sections': { type: 'string' },
      },
      allowPositionals: false,
    });
  } catch (err) {
    console.error(REVISE_USAGE);
    process.exit(1);
  }

  const { spec, auto } = parsed.values;
  const authoredSectionsRaw = parsed.values['authored-sections'];
  if (!spec) {
    console.error(REVISE_USAGE);
    process.exit(1);
  }

  // Path containment (SEC-1).
  const absRoot = resolve(projectRoot);
  const absSpec = isAbsolute(spec) ? spec : resolve(absRoot, spec);
  if (!absSpec.startsWith(absRoot + sep) && absSpec !== absRoot) {
    console.error(`INVALID_SPEC_PATH: spec not inside projectRoot: ${spec}`);
    process.exit(1);
  }
  if (!existsSync(absSpec)) {
    console.error(`INVALID_SPEC_PATH: spec not found: ${spec}`);
    process.exit(1);
  }
  if (!absSpec.endsWith('.spec.md')) {
    console.error(`INVALID_SPEC_PATH: spec path must end with .spec.md: ${spec}`);
    process.exit(1);
  }

  // Re-derive the project-root-relative path the library expects.
  const relSpec = relative(absRoot, absSpec);

  let authoredSections;
  if (authoredSectionsRaw !== undefined) {
    const parsedSections = parseAuthoredSections(authoredSectionsRaw, absRoot);
    if (!parsedSections.ok) {
      console.error(`INVALID_AUTHORED_SECTIONS: ${parsedSections.error}`);
      process.exit(1);
    }
    authoredSections = parsedSections.value;
  }

  let result;
  try {
    result = reviseSpec({
      specPath: relSpec,
      projectRoot: absRoot,
      autoMode: !!auto,
      ...(authoredSections ? { authoredSections } : {}),
    });
  } catch (err) {
    const code = err?.code ?? 'UNKNOWN';
    // SPEC_NOT_BLOCKED is a soft failure under --auto — exit code 2 so the
    // build orchestrator can distinguish it from argument errors.
    if (code === 'SPEC_NOT_BLOCKED') {
      console.error(`SPEC_NOT_BLOCKED: ${err.message}`);
      process.exit(2);
    }
    console.error(`${code}: ${err.message}`);
    process.exit(1);
  }

  // JSON-line output so callers can pipe / parse.
  process.stdout.write(JSON.stringify({
    from_revision: result.fromRevision,
    to_revision: result.toRevision,
    addressed_blocker_ids: result.addressed,
    unresolved_blocker_ids: result.unresolved,
    spec_path: result.specPath,
    blockers_cleared: result.blockersCleared,
    advisories: result.advisories ?? [],
  }) + '\n');
  process.exit(0);
}

/**
 * `adev specify group-blockers --spec <path>` — Task 7. Reads the spec's
 * current body + its `.blockers.md` sidecar, resolves heading anchors, and
 * groups `defect`-classed blocker ids by anchor (via `groupBlockersByAnchor`)
 * so `/adev:specify`'s Revise Mode can dispatch one authoring subagent per
 * anchor without importing lib functions into skill prose (cli-driver-surface
 * charter — SKILL.md names an `adev <verb>`, not a bare lib import).
 *
 * For each grouped anchor, also returns that anchor's CURRENT section text
 * (the exact "current text" BEH-4 says an authoring subagent must receive)
 * and the resolved `blocker_ids` list, so the skill has everything needed to
 * build each subagent's prompt without re-reading files itself.
 */
async function runGroupBlockers({ projectRoot, argv }) {
  const rest = argv.slice(1);
  let parsed;
  try {
    parsed = parseArgs({
      args: rest,
      options: { spec: { type: 'string' } },
      allowPositionals: false,
    });
  } catch (err) {
    console.error(GROUP_BLOCKERS_USAGE);
    process.exit(1);
  }

  const { spec } = parsed.values;
  if (!spec) {
    console.error(GROUP_BLOCKERS_USAGE);
    process.exit(1);
  }

  const absRoot = resolve(projectRoot);
  const absSpec = isAbsolute(spec) ? spec : resolve(absRoot, spec);
  if (!absSpec.startsWith(absRoot + sep) && absSpec !== absRoot) {
    console.error(`INVALID_SPEC_PATH: spec not inside projectRoot: ${spec}`);
    process.exit(1);
  }
  if (!existsSync(absSpec)) {
    console.error(`INVALID_SPEC_PATH: spec not found: ${spec}`);
    process.exit(1);
  }
  if (!absSpec.endsWith('.spec.md')) {
    console.error(`INVALID_SPEC_PATH: spec path must end with .spec.md: ${spec}`);
    process.exit(1);
  }

  const specText = readFileSync(absSpec, 'utf8');
  // Frontmatter-stripped body: everything after the closing `---` fence.
  const fenceMatches = [...specText.matchAll(/^---\s*$/gm)];
  const body = fenceMatches.length >= 2
    ? specText.slice(fenceMatches[1].index + fenceMatches[1][0].length).replace(/^\n/, '')
    : specText;

  const blockersRelPath = spec.replace(/\.spec\.md$/, '.blockers.md');
  const absBlockers = resolve(absRoot, blockersRelPath);
  let blockerEntries = [];
  if (existsSync(absBlockers)) {
    blockerEntries = parseBlockersSidecar(readFileSync(absBlockers, 'utf8'));
  }

  const sectionAnchors = resolveSectionAnchors(body);
  const { grouped, anchorsNotFound } = groupBlockersByAnchor(blockerEntries, sectionAnchors);

  const anchors = {};
  for (const [anchor, blockerIds] of grouped.entries()) {
    const range = sectionAnchors.get(anchor);
    anchors[anchor] = {
      blocker_ids: blockerIds,
      current_text: range ? body.slice(range.start, range.end) : null,
    };
  }

  // Task 9: finding_class breakdown so skills/build/SKILL.md's Blocker
  // handling loop can branch BEFORE dispatching authoring — decision halts
  // the loop immediately (no authoring dispatched at all); external is
  // excluded from convergence accounting but the loop continues on any
  // remaining defect blockers. Neither ever appears in `anchors` above
  // (groupBlockersByAnchor already filters to defect-only).
  const decisionBlockerIds = blockerEntries
    .filter(e => e.finding_class === 'decision')
    .map(e => e.blocker_id);
  const externalBlockers = blockerEntries
    .filter(e => e.finding_class === 'external')
    .map(e => ({ blocker_id: e.blocker_id, section_anchor: e.section_anchor, remedy_ref: e.remedy_ref }));

  process.stdout.write(JSON.stringify({
    spec_path: spec,
    anchors,
    anchors_not_found: anchorsNotFound,
    decision_blocker_ids: decisionBlockerIds,
    external_blockers: externalBlockers,
  }) + '\n');
  process.exit(0);
}

/**
 * `adev specify check-mechanisms --spec <path>` — Task 8 / BEH-6. Reads the
 * spec's current body (post-splice, when invoked right after `adev specify
 * revise` per `skills/build/SKILL.md`'s ordering) and runs
 * `lib/diagnostics/tier2/mechanism-existence.mjs::run()` against it, gating
 * every authored revision before a reviewer is re-dispatched.
 *
 * Exit 0: every cited file:line/file::symbol referent resolved (or none
 * were cited). Exit 2: at least one referent is unresolved — the caller
 * (`skills/build/SKILL.md`) reads `unresolved` from the JSON output to
 * construct a new `mechanism-existence` blocker per entry.
 */
async function runCheckMechanisms({ projectRoot, argv }) {
  const rest = argv.slice(1);
  let parsed;
  try {
    parsed = parseArgs({
      args: rest,
      options: { spec: { type: 'string' } },
      allowPositionals: false,
    });
  } catch (err) {
    console.error(CHECK_MECHANISMS_USAGE);
    process.exit(1);
  }

  const { spec } = parsed.values;
  if (!spec) {
    console.error(CHECK_MECHANISMS_USAGE);
    process.exit(1);
  }

  const absRoot = resolve(projectRoot);
  const absSpec = isAbsolute(spec) ? spec : resolve(absRoot, spec);
  if (!absSpec.startsWith(absRoot + sep) && absSpec !== absRoot) {
    console.error(`INVALID_SPEC_PATH: spec not inside projectRoot: ${spec}`);
    process.exit(1);
  }
  if (!existsSync(absSpec)) {
    console.error(`INVALID_SPEC_PATH: spec not found: ${spec}`);
    process.exit(1);
  }
  if (!absSpec.endsWith('.spec.md')) {
    console.error(`INVALID_SPEC_PATH: spec path must end with .spec.md: ${spec}`);
    process.exit(1);
  }

  const specText = readFileSync(absSpec, 'utf8');
  const fenceMatches = [...specText.matchAll(/^---\s*$/gm)];
  const authoredText = fenceMatches.length >= 2
    ? specText.slice(fenceMatches[1].index + fenceMatches[1][0].length).replace(/^\n/, '')
    : specText;

  const result = runMechanismExistence({ projectRoot: absRoot, authoredText, spec });

  process.stdout.write(JSON.stringify({
    spec_path: spec,
    fired: result.fired,
    resolved_count: result.resolvedCount ?? 0,
    unresolved: result.unresolved ?? [],
  }) + '\n');
  process.exit(result.fired ? 2 : 0);
}

async function runAmend({ projectRoot, argv }) {
  const rest = argv.slice(1);

  if (rest.includes('--help') || rest.includes('-h')) {
    help();
    process.exit(0);
  }

  // Detect mutually-exclusive workflow-axis flags up front (AC 7).
  for (const arg of rest) {
    if (AMEND_CONFLICTING_FLAGS.has(arg)) {
      console.error(`CONFLICTING_FLAGS: --amend is mutually exclusive with ${arg}`);
      process.exit(1);
    }
  }

  let parsed;
  try {
    parsed = parseArgs({
      args: rest,
      options: {
        spec: { type: 'string' },
        descriptor: { type: 'string' },
        kind: { type: 'string' },
        'target-revision': { type: 'string' },
      },
      allowPositionals: false,
    });
  } catch (err) {
    console.error(AMEND_USAGE);
    process.exit(1);
  }

  const { spec, descriptor, kind } = parsed.values;
  const targetRevisionRaw = parsed.values['target-revision'];
  if (!spec) {
    console.error(AMEND_USAGE);
    process.exit(1);
  }

  // Reject --kind amendment with the closed-enum INVALID_KIND BEFORE doing any
  // filesystem work (Behavior 10) — "amendment" is not a kind.
  if (kind === 'amendment') {
    console.error('INVALID_KIND: "amendment" is not a spec kind — amendment is a relationship overlay (amends:/target-revision:), not a kind. The closed kind: enum is unchanged. See ADR-0009.');
    process.exit(1);
  }

  // Path containment (SEC-1).
  const absRoot = resolve(projectRoot);
  const absSpec = isAbsolute(spec) ? spec : resolve(absRoot, spec);
  if (!absSpec.startsWith(absRoot + sep) && absSpec !== absRoot) {
    console.error(`INVALID_SPEC_PATH: spec not inside projectRoot: ${spec}`);
    process.exit(1);
  }
  if (!absSpec.endsWith('.spec.md')) {
    console.error(`INVALID_SPEC_PATH: spec path must end with .spec.md: ${spec}`);
    process.exit(1);
  }

  const relSpec = relative(absRoot, absSpec);

  let targetRevision;
  if (targetRevisionRaw !== undefined) {
    targetRevision = parseInt(targetRevisionRaw, 10);
    if (!Number.isInteger(targetRevision)) {
      console.error(`INVALID_TARGET_REVISION: --target-revision must be an integer; got ${JSON.stringify(targetRevisionRaw)}`);
      process.exit(1);
    }
  }

  let result;
  try {
    result = amendSpec({
      specPath: relSpec,
      projectRoot: absRoot,
      descriptor,
      targetRevision,
      kind,
    });
  } catch (err) {
    const code = err?.code ?? 'UNKNOWN';
    console.error(`${code}: ${err.message}`);
    process.exit(1);
  }

  process.stdout.write(JSON.stringify({
    amendment_path: result.amendmentPath,
    amendment_slug: result.amendmentSlug,
    base_spec: result.basePath,
    target_revision: result.targetRevision,
    kind: result.kind,
  }) + '\n');
  process.exit(0);
}

export function help() {
  console.log('Usage: adev specify amend --spec <base-path> [--descriptor <slug>] [--kind <kind>] [--target-revision <N>]');
  console.log('       adev specify revise --spec <path> [--auto] [--authored-sections <json|@path>]');
  console.log('       adev specify group-blockers --spec <path>');
  console.log('');
  console.log('amend: scaffold a co-located amendment of an already-shipped (validated)');
  console.log('spec without mutating the base. Produces');
  console.log('<base-stem>-rev-<target>-<descriptor>.spec.md with amends: + target-revision:');
  console.log('frontmatter and emits a spec_amended event on the base log.');
  console.log('Mutually exclusive with --revise / --extract / --refactor / --from-diff /');
  console.log('--cross-cutting. --kind amendment is rejected (INVALID_KIND).');
  console.log('');
  console.log('Flags:');
  console.log('  --spec <path>            Project-root-relative path to the base .spec.md');
  console.log('  --descriptor <slug>      kebab-case descriptor (prompted by the skill if omitted)');
  console.log('  --kind <kind>            Spec kind override (defaults to the base spec kind)');
  console.log('  --target-revision <N>    Override target revision (must be > base revision)');
  console.log('');
  console.log('Usage: adev specify revise --spec <path> [--auto]');
  console.log('');
  console.log('Revise a BLOCKED spec from revision N to N+1 using the spec\'s');
  console.log('.review.md + .blockers.md sidecars. The sixth workflow axis of');
  console.log('/adev:specify (alongside default / --extract / --refactor /');
  console.log('--from-diff / --cross-cutting; mutually exclusive with all four).');
  console.log('');
  console.log('Flags:');
  console.log('  --spec <path>                        Project-root-relative path to the .spec.md file');
  console.log('  --auto                                Auto mode — reject if status is not review-blocked');
  console.log('  --authored-sections <json|@path>      anchor -> rewritten body map (JSON object literal or');
  console.log('                                         @<path> to a JSON file), as produced by the skill\'s');
  console.log('                                         per-anchor authoring subagent fan-out (BEH-4). Omit');
  console.log('                                         for a no-op revise (every loop-eligible blocker stays');
  console.log('                                         unresolved).');
  console.log('');
  console.log('Exit codes:');
  console.log('  0  Revise succeeded — spec_revised event emitted');
  console.log('  1  Argument error, path traversal, missing sidecars, or other');
  console.log('  2  SPEC_NOT_BLOCKED under --auto');
  console.log('');
  console.log('Usage: adev specify group-blockers --spec <path>');
  console.log('');
  console.log('Reads the spec\'s current body + .blockers.md sidecar, resolves heading');
  console.log('anchors, and groups defect-classed blocker ids by anchor (decision/');
  console.log('external-classed blockers are never authored — excluded). For each');
  console.log('grouped anchor, returns its current section text + blocker_ids, so the');
  console.log('skill can dispatch one authoring subagent per anchor without importing');
  console.log('lib functions into skill prose.');
  console.log('');
  console.log('Flags:');
  console.log('  --spec <path>  Project-root-relative path to the .spec.md file');
  console.log('');
  console.log('Exit codes:');
  console.log('  0  Succeeded — JSON printed to stdout');
  console.log('  1  Argument error or path traversal');
  console.log('');
  console.log('Usage: adev specify check-mechanisms --spec <path>');
  console.log('');
  console.log('Extracts file:line / file::symbol referents from the spec\'s current body');
  console.log('and verifies each resolves inside projectRoot (BEH-6). Gates every');
  console.log('authored revision before a reviewer is re-dispatched.');
  console.log('');
  console.log('Flags:');
  console.log('  --spec <path>  Project-root-relative path to the .spec.md file');
  console.log('');
  console.log('Exit codes:');
  console.log('  0  All cited referents resolved (or none cited)');
  console.log('  2  At least one referent unresolved — see `unresolved` in JSON output');
  console.log('  1  Argument error or path traversal');
}
