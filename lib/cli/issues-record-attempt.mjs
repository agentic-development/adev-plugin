/**
 * `adev issues record-attempt` — CLI wrapper for the already-existing
 * `recordDebugAttempt()` export in `lib/bugfix-loop-attempts.mjs` (built by
 * the sibling `per-issue-attempt-cap` plan, but never given a CLI-callable
 * entry point). Without this wrapper, a markdown-only skill has no way to
 * write an `AttemptRecord`.
 *
 * Registered as a `record-attempt` subcommand of `adev issues`, since an
 * `AttemptRecord` is issue-scoped, not run-scoped.
 *
 * Spec: .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-skill.spec.md
 * Plan-task: 6
 *
 * Exit codes:
 *   0  success — JSON (or text) AttemptRecord on stdout
 *   1  usage error (missing --issue, unknown --outcome) or unexpected exception
 *
 * Uses only Node.js built-ins.
 */

import { parseArgs } from 'node:util';
import { recordDebugAttempt } from '../bugfix-loop-attempts.mjs';

const USAGE = 'usage: adev issues record-attempt --issue <id> --outcome FIXED|PARKED|UNREPRODUCIBLE [--check-ids <csv>] [--raw-output <text>] [--json]';
const VALID_OUTCOMES = new Set(['FIXED', 'PARKED', 'UNREPRODUCIBLE']);

export async function run({ projectRoot, argv, manifest }) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        issue: { type: 'string' },
        outcome: { type: 'string' },
        'check-ids': { type: 'string' },
        'raw-output': { type: 'string' },
        json: { type: 'boolean' },
      },
    });
  } catch (err) {
    console.error(USAGE);
    console.error(err.message);
    return 1;
  }

  const { values } = parsed;

  if (!values.issue || !VALID_OUTCOMES.has(values.outcome)) {
    console.error(USAGE);
    return 1;
  }

  const checkIds = values['check-ids'] ? values['check-ids'].split(',').map((s) => s.trim()).filter(Boolean) : undefined;

  let record;
  try {
    record = recordDebugAttempt(projectRoot, manifest, {
      issueId: values.issue,
      outcome: values.outcome,
      checkIds,
      rawOutput: values['raw-output'],
    });
  } catch (err) {
    console.error(err.message);
    return 1;
  }

  console.log(values.json ? JSON.stringify(record) : `recorded ${values.outcome} for ${values.issue}: last_verdict=${record.last_verdict}`);
  return 0;
}

export function help() {
  console.log(USAGE);
  console.log('');
  console.log('Write an AttemptRecord for a completed /adev:debug --auto attempt.');
  console.log('Wraps recordDebugAttempt() (lib/bugfix-loop-attempts.mjs).');
}

export default { run, help };
