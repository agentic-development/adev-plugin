// lib/cli/specify.mjs
//
// adev specify revise --spec <path>
//
// CLI entry-point for the /adev:specify --revise workflow axis.
// Dispatches to lib/specify-revise.mjs.
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
import { existsSync } from 'node:fs';
import { isAbsolute, resolve, relative, sep } from 'node:path';

import { reviseSpec } from '../specify-revise.mjs';
import { amendSpec } from '../specify-amend.mjs';

const USAGE = 'usage: adev specify <revise|amend> --spec <path> [...]';
const REVISE_USAGE = 'usage: adev specify revise --spec <path> [--auto]';
const AMEND_USAGE = 'usage: adev specify amend --spec <base-path> [--descriptor <slug>] [--kind <kind>] [--target-revision <N>]';

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
      },
      allowPositionals: false,
    });
  } catch (err) {
    console.error(REVISE_USAGE);
    process.exit(1);
  }

  const { spec, auto } = parsed.values;
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

  let result;
  try {
    result = reviseSpec({
      specPath: relSpec,
      projectRoot: absRoot,
      autoMode: !!auto,
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
  }) + '\n');
  process.exit(0);
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
  console.log('       adev specify revise --spec <path> [--auto]');
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
  console.log('  --spec <path>  Project-root-relative path to the .spec.md file');
  console.log('  --auto         Auto mode — reject if status is not review-blocked');
  console.log('');
  console.log('Exit codes:');
  console.log('  0  Revise succeeded — spec_revised event emitted');
  console.log('  1  Argument error, path traversal, missing sidecars, or other');
  console.log('  2  SPEC_NOT_BLOCKED under --auto');
}
