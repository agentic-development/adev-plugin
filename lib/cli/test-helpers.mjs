// lib/cli/test-helpers.mjs
//
// `adev test-helpers <inventory|check>` — emits the project's shared test-helper /
// fixture / golden-test-sample inventory for injection into write-test and implement
// subagent prompts, and reports advisory helper-duplication findings for test files.
//
// Contract (driver-substrate):
//   - Exports `run({ projectRoot, argv, manifest })` and `help()`.
//   - Does NOT export LIFECYCLE_STEP — the inventory is an observational helper inside
//     a lifecycle step, not a step boundary, so tests/cli-driver-pattern.test.mjs does
//     not assert requireGate-first here. Same posture as lib/cli/context.mjs.
//
// Exit codes (per hook protocol):
//   0  success — JSON or text written to stdout. Findings are DATA, not failures:
//      `check` exits 0 whether or not it found duplicates (see the spec's Scope
//      Decision — this capability ships no gate).
//   1  argument error, containment violation, missing file, unreadable project root
//
// Zero external deps — Node built-ins plus the project's own lib modules.

import { parseArgs } from 'node:util';
import { existsSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import {
  buildInventory,
  findDuplicateHelpers,
  renderInventoryText,
} from '../test-strategies/helper-inventory.mjs';

const USAGE =
  'usage: adev test-helpers inventory [--format json|text] [--budget <n>]\n' +
  '       adev test-helpers check --file <path> [--file <path> ...] [--format json|text]';

/**
 * Containment check (mirrors lib/cli/context.mjs and lib/cli/test-policy.mjs):
 * resolve `relPath` against `absRoot` and reject anything escaping the tree.
 * Returns the repo-relative POSIX path, or null when out of bounds.
 */
function containedRelative(absRoot, relPath) {
  const abs = isAbsolute(relPath) ? relPath : resolve(absRoot, relPath);
  if (abs !== absRoot && !abs.startsWith(absRoot + sep)) return null;
  return relative(absRoot, abs).split(sep).join('/');
}

function fail(message) {
  console.error(message);
  return 1;
}

// NOTE: this parameter deliberately carries no default value. `Function.length` counts
// only parameters before the first default, and cli/index.mjs's dispatcher branches on
// `mod.run.length === 0` to decide whether a module is a legacy adapter that reads
// process.argv itself. A `= {}` default here silently routes every invocation down the
// legacy path with no arguments.
export async function run({ projectRoot, argv, manifest }) {
  const args = Array.isArray(argv) ? argv : [];
  const sub = args[0];
  if (!sub || sub.startsWith('-')) return fail(USAGE);

  const rest = args.slice(1);
  let parsed;
  try {
    parsed = parseArgs({
      args: rest,
      options: {
        format: { type: 'string' },
        budget: { type: 'string' },
        file: { type: 'string', multiple: true },
      },
      allowPositionals: false,
      strict: true,
    });
  } catch (err) {
    return fail(`${err.message}\n${USAGE}`);
  }

  const { format = 'json', budget, file } = parsed.values;
  if (format !== 'json' && format !== 'text') {
    return fail(`invalid --format '${format}' — expected json or text\n${USAGE}`);
  }

  const root = resolve(projectRoot ?? process.cwd());
  if (!existsSync(root)) return fail(`PROJECT_ROOT_NOT_FOUND: ${root}`);

  if (sub === 'inventory') {
    let maxLines;
    if (budget !== undefined) {
      maxLines = Number(budget);
      if (!Number.isInteger(maxLines) || maxLines <= 0) {
        return fail(`invalid --budget '${budget}' — expected a positive integer\n${USAGE}`);
      }
    }
    const inventory = buildInventory(root, { manifest: manifest ?? null });
    if (format === 'text') {
      console.log(renderInventoryText(inventory, maxLines ? { maxLines } : {}));
    } else {
      console.log(JSON.stringify(inventory, null, 2));
    }
    return 0;
  }

  if (sub === 'check') {
    const files = Array.isArray(file) ? file : [];
    if (files.length === 0) return fail(`check requires at least one --file\n${USAGE}`);

    // Build the inventory ONCE, no matter how many files are checked — the RED phase
    // always hands over several test files and N tree walks would be N times the cost.
    const inventory = buildInventory(root, { manifest: manifest ?? null });

    const results = [];
    for (const raw of files) {
      const rel = containedRelative(root, raw);
      if (rel === null) return fail(`PATH_OUTSIDE_ROOT: '${raw}' resolves outside the project root`);
      if (!existsSync(resolve(root, rel))) return fail(`FILE_NOT_FOUND: ${rel}`);
      try {
        results.push(findDuplicateHelpers(root, rel, { inventory }));
      } catch (err) {
        return fail(err.message);
      }
    }

    if (format === 'text') {
      const lines = [];
      for (const result of results) {
        if (result.findings.length === 0) {
          lines.push(`${result.file}: no shared-helper duplication detected (${result.checked} helper symbols compared)`);
          continue;
        }
        lines.push(`${result.file}: ${result.findings.length} possible duplicate(s) of existing shared helpers —`);
        for (const f of result.findings) {
          lines.push(`  line ${f.line}: ${f.name} — already available as ${f.helper.symbol} in ${f.helper.path}`);
        }
      }
      lines.push('Advisory only — reuse the shared helper if it fits, otherwise ignore this.');
      console.log(lines.join('\n'));
    } else {
      console.log(JSON.stringify({ results }, null, 2));
    }
    return 0;
  }

  return fail(`unknown subcommand '${sub}'\n${USAGE}`);
}

export function help() {
  console.log(USAGE);
  console.log('');
  console.log('  inventory   Emit the shared test-helper / fixture / golden-test-sample inventory.');
  console.log('              --format json (default) | text   --budget <n> caps the text render (default 60 lines)');
  console.log('  check       Report symbols in a test file that duplicate an existing shared helper.');
  console.log('              --file is repeatable; the inventory is built once per invocation.');
  console.log('              Findings are advisory: this verb exits 0 whether or not it finds any.');
}
