/**
 * `adev issues pr-resolved` — CLI wrapper for `recordPrResolved()`
 * (`lib/bugfix-loop-attempts.mjs`). Reports that a PR `adev bugfix-loop
 * commit-pr` opened and recorded (`recordPrOpened`, `pr_state: "open"`) has
 * merged or closed without merging, so `isOpenPrExcluded`
 * (`lib/issues/eligibility.mjs`) stops excluding the issue from `adev
 * issues next` (issue-ypa68o / adev-plugin-hg4n).
 *
 * Registered as a `pr-resolved` subcommand of `adev issues`, not `adev
 * bugfix-loop`, for the same reason `record-attempt` is: an `AttemptRecord`
 * is issue-scoped, not run-scoped.
 *
 * This repo has no live PR-state poll (see per-issue-attempt-cap.spec.md
 * BEH-8) — the caller (a human, the orchestrating session, or a future
 * tracker-sync poller) must already know the PR's outcome.
 *
 * Spec: .context-index/specs/features/autonomous-bugfix-loop/per-issue-attempt-cap.spec.md
 *
 * Exit codes:
 *   0  success — JSON (or text) AttemptRecord on stdout
 *   1  usage error (missing --issue/--status, unknown --status), or no
 *      tracked PR exists for the issue (NO_TRACKED_PR)
 *
 * Uses only Node.js built-ins.
 */

import { parseArgs } from 'node:util';
import { recordPrResolved } from '../bugfix-loop-attempts.mjs';

const USAGE = 'usage: adev issues pr-resolved --issue <id> --status merged|closed [--json]';
const VALID_STATUSES = new Set(['merged', 'closed']);

export async function run({ projectRoot, argv, manifest }) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        issue: { type: 'string' },
        status: { type: 'string' },
        json: { type: 'boolean' },
      },
    });
  } catch (err) {
    console.error(USAGE);
    console.error(err.message);
    return 1;
  }

  const { values } = parsed;

  if (!values.issue || !VALID_STATUSES.has(values.status)) {
    console.error(USAGE);
    return 1;
  }

  let record;
  try {
    record = recordPrResolved(projectRoot, values.issue, { status: values.status });
  } catch (err) {
    console.error(err.message);
    return 1;
  }

  console.log(values.json ? JSON.stringify(record) : `recorded PR ${values.status} for ${values.issue}: pr_state=${record.pr_state}`);
  return 0;
}

export function help() {
  console.log(USAGE);
  console.log('');
  console.log('Report that a tracked PR (opened by `adev bugfix-loop commit-pr`) has');
  console.log('merged or closed without merging, so the issue stops being excluded');
  console.log('from `adev issues next` (isOpenPrExcluded). Exits 1 (NO_TRACKED_PR)');
  console.log('if the issue has no tracked PR recorded.');
}

export default { run, help };
