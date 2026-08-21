/**
 * `adev bugfix-loop <subcommand>` — CLI surface for `lib/bugfix-loop-run.mjs`.
 *
 * Mirrors `adev build-state`'s shape exactly so `skills/bugfix-loop/SKILL.md`
 * can be pure markdown per the `cli-driver-surface` charter (no inline Node).
 *
 * Subcommands: create | guard | record-attempt | complete-turn | finish | latest
 *
 * Spec: .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-skill.spec.md
 * Plan-task: 5
 *
 * Contract:
 *   - `run({ projectRoot, argv, manifest })` returns a numeric exit code.
 *
 * Uses only Node.js built-ins.
 */

import { parseArgs } from 'node:util';
import {
  createRun, readRunState, checkStatusGuard, checkBudget,
  appendAttempt, completeTurn, finishRun, findLatestRunState,
} from '../bugfix-loop-run.mjs';

const USAGE = 'usage: adev bugfix-loop <create|guard|record-attempt|complete-turn|finish|latest> [flags]';

export async function run({ projectRoot, argv }) {
  const [sub, ...rest] = argv;
  if (!sub) {
    console.error(USAGE);
    return 1;
  }

  if (sub === 'create') {
    let parsed;
    try {
      parsed = parseArgs({
        args: rest,
        options: { 'max-bugs': { type: 'string' }, 'max-turns': { type: 'string' }, json: { type: 'boolean' } },
      });
    } catch (err) {
      console.error(USAGE);
      console.error(err.message);
      return 1;
    }
    const { values } = parsed;
    let state;
    try {
      state = createRun(projectRoot, {
        maxBugs: values['max-bugs'] != null ? Number(values['max-bugs']) : null,
        maxTurns: values['max-turns'] != null ? Number(values['max-turns']) : 20,
      });
    } catch (err) {
      console.error(err.message);
      return 1;
    }
    console.log(values.json ? JSON.stringify(state) : `created run ${state.run_id}`);
    return 0;
  }

  if (sub === 'guard') {
    let parsed;
    try {
      parsed = parseArgs({ args: rest, options: { 'run-id': { type: 'string' }, json: { type: 'boolean' } } });
    } catch (err) {
      console.error(USAGE);
      console.error(err.message);
      return 1;
    }
    const { values } = parsed;
    let state;
    try {
      state = readRunState(projectRoot, values['run-id']);
    } catch (err) {
      console.error(err.message);
      return 1;
    }
    const statusResult = checkStatusGuard(state);
    if (!statusResult.ok) {
      const result = { proceed: false, reason: 'terminal_status', status: statusResult.status };
      console.log(values.json ? JSON.stringify(result) : `refused: run already terminal (${statusResult.status})`);
      return 0;
    }
    const budget = checkBudget(state);
    if (budget.exhausted) {
      const result = { proceed: false, reason: 'budget_exhausted', budget_reason: budget.reason };
      console.log(values.json ? JSON.stringify(result) : `budget exhausted: ${budget.reason}`);
      return 0;
    }
    const result = { proceed: true };
    console.log(values.json ? JSON.stringify(result) : 'proceed');
    return 0;
  }

  if (sub === 'record-attempt') {
    let parsed;
    try {
      parsed = parseArgs({ args: rest, options: { 'run-id': { type: 'string' }, issue: { type: 'string' }, json: { type: 'boolean' } } });
    } catch (err) {
      console.error(USAGE);
      console.error(err.message);
      return 1;
    }
    const { values } = parsed;
    let state;
    try {
      state = appendAttempt(projectRoot, values['run-id'], values.issue);
    } catch (err) {
      console.error(err.message);
      return 1;
    }
    console.log(values.json ? JSON.stringify(state) : `recorded attempt on ${values.issue}`);
    return 0;
  }

  if (sub === 'complete-turn') {
    let parsed;
    try {
      parsed = parseArgs({ args: rest, options: { 'run-id': { type: 'string' }, json: { type: 'boolean' } } });
    } catch (err) {
      console.error(USAGE);
      console.error(err.message);
      return 1;
    }
    const { values } = parsed;
    let state;
    try {
      state = completeTurn(projectRoot, values['run-id']);
    } catch (err) {
      console.error(err.message);
      return 1;
    }
    console.log(values.json ? JSON.stringify(state) : `turns_completed=${state.turns_completed}`);
    return 0;
  }

  if (sub === 'finish') {
    let parsed;
    try {
      parsed = parseArgs({
        args: rest,
        options: { 'run-id': { type: 'string' }, status: { type: 'string' }, note: { type: 'string' }, json: { type: 'boolean' } },
      });
    } catch (err) {
      console.error(USAGE);
      console.error(err.message);
      return 1;
    }
    const { values } = parsed;
    let outcome;
    try {
      outcome = finishRun(projectRoot, values['run-id'], { status: values.status, note: values.note });
    } catch (err) {
      console.error(err.message);
      return 1;
    }
    const { state, token } = outcome;
    const result = { status: state.status, token, degraded_sync_note: state.degraded_sync_note ?? null };
    console.log(values.json ? JSON.stringify(result) : `ADEV-BUGFIXLOOP: ${token}`);
    return 0;
  }

  if (sub === 'latest') {
    let parsed;
    try {
      parsed = parseArgs({ args: rest, options: { json: { type: 'boolean' } } });
    } catch (err) {
      console.error(USAGE);
      console.error(err.message);
      return 1;
    }
    const { values } = parsed;
    const state = findLatestRunState(projectRoot);
    console.log(values.json ? JSON.stringify({ run: state }) : (state ? `latest run: ${state.run_id}` : 'no runs found'));
    return 0;
  }

  console.error(USAGE);
  console.error(`  unknown subcommand: ${sub}`);
  return 1;
}

export function help() {
  console.log(USAGE);
  console.log('');
  console.log('Subcommands:');
  console.log('  create [--max-bugs N] [--max-turns N] [--json]');
  console.log('    Create a fresh BugfixLoopRun. Stdout: created run state.');
  console.log('');
  console.log('  guard --run-id <id> [--json]');
  console.log('    Status guard + per-turn budget check. Stdout: {proceed, reason?, status?, budget_reason?}.');
  console.log('');
  console.log('  record-attempt --run-id <id> --issue <id> [--json]');
  console.log('    Append a completed attempt to bugs_attempted[].');
  console.log('');
  console.log('  complete-turn --run-id <id> [--json]');
  console.log('    Increment turns_completed by 1.');
  console.log('');
  console.log('  finish --run-id <id> --status <complete|budget_exhausted|blocked> [--note <n>] [--json]');
  console.log('    Persist the terminal status and print the matching ADEV-BUGFIXLOOP token.');
  console.log('');
  console.log('  latest [--json]');
  console.log('    Find the most-recently-modified valid run-state file (or null).');
}

export default { run, help };
