/**
 * `adev bugfix-loop <subcommand>` — CLI surface for `lib/bugfix-loop-run.mjs`.
 *
 * Mirrors `adev build-state`'s shape exactly so `skills/bugfix-loop/SKILL.md`
 * can be pure markdown per the `cli-driver-surface` charter (no inline Node).
 *
 * Subcommands: create | guard | record-attempt | complete-turn | finish | latest | check-freshness | commit-pr
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
  resolveWorktreeBaseRef, recordWorktreeBranch,
} from '../bugfix-loop-run.mjs';
import { computeFreshness } from '../bugfix-loop-freshness.mjs';
import { commitAndOpenPr } from '../bugfix-loop-commit.mjs';

const USAGE = 'usage: adev bugfix-loop <create|guard|record-attempt|complete-turn|finish|latest|check-freshness|commit-pr> [flags]';

// Default soft threshold: "meaningfully behind" the remote default branch.
// hard_threshold defaults to null (unset/disabled) so no existing
// invocation's pass/fail behavior changes until an operator opts into a
// hard block (spec BEH-1/BEH-2, Improvement 1: warn-only by default).
const DEFAULT_SOFT_THRESHOLD = 50;
const DEFAULT_HARD_THRESHOLD = null;

export async function run({ projectRoot, argv, manifest }) {
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
        options: {
          'max-bugs': { type: 'string' },
          'max-turns': { type: 'string' },
          'starting-branch': { type: 'string' },
          json: { type: 'boolean' },
        },
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
        startingBranch: values['starting-branch'] ?? null,
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
    const worktreeBaseRef = resolveWorktreeBaseRef(state);
    const statusResult = checkStatusGuard(state);
    if (!statusResult.ok) {
      const result = { proceed: false, reason: 'terminal_status', status: statusResult.status, worktree_base_ref: worktreeBaseRef };
      console.log(values.json ? JSON.stringify(result) : `refused: run already terminal (${statusResult.status})`);
      return 0;
    }
    const budget = checkBudget(state);
    if (budget.exhausted) {
      const result = { proceed: false, reason: 'budget_exhausted', budget_reason: budget.reason, worktree_base_ref: worktreeBaseRef };
      console.log(values.json ? JSON.stringify(result) : `budget exhausted: ${budget.reason}`);
      return 0;
    }
    const result = { proceed: true, worktree_base_ref: worktreeBaseRef };
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

  if (sub === 'check-freshness') {
    let parsed;
    try {
      parsed = parseArgs({ args: rest, options: { json: { type: 'boolean' } } });
    } catch (err) {
      console.error(USAGE);
      console.error(err.message);
      return 1;
    }
    const { values } = parsed;

    const softThreshold = manifest?.tasks?.bugfix_loop?.freshness?.soft_threshold ?? DEFAULT_SOFT_THRESHOLD;
    const hardThreshold = manifest?.tasks?.bugfix_loop?.freshness?.hard_threshold ?? DEFAULT_HARD_THRESHOLD;

    const freshness = computeFreshness({ cwd: projectRoot });

    let result;
    if (freshness.degraded) {
      result = { status: 'degraded', reason: freshness.reason };
    } else {
      const { ahead, behind } = freshness;
      if (hardThreshold != null && behind >= hardThreshold) {
        result = { status: 'blocked', ahead, behind };
      } else if (softThreshold != null && behind >= softThreshold) {
        result = { status: 'warn', ahead, behind };
      } else {
        result = { status: 'ok', ahead, behind };
      }
    }

    if (values.json) {
      console.log(JSON.stringify(result));
    } else if (result.status === 'degraded') {
      console.log(`degraded: ${result.reason}`);
    } else {
      console.log(`${result.status} (ahead=${result.ahead}, behind=${result.behind})`);
    }
    return 0;
  }

  if (sub === 'commit-pr') {
    let parsed;
    try {
      parsed = parseArgs({
        args: rest,
        options: {
          'run-id': { type: 'string' },
          issue: { type: 'string' },
          title: { type: 'string' },
          notes: { type: 'string' },
          'spec-path': { type: 'string' },
          'pr-base': { type: 'string' },
          json: { type: 'boolean' },
        },
      });
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
    // BEH-4: the skill (Step 4.5) always passes --pr-base explicitly,
    // resolved from the Step 1 guard's worktree_base_ref — that is the real
    // resolution path. The resolveWorktreeBaseRef(state) fallback below only
    // serves direct/manual CLI use outside the skill, where no --pr-base was
    // given; it is not how the skill itself resolves the base.
    const prBase = values['pr-base'] ?? resolveWorktreeBaseRef(state) ?? 'main';

    // commit-pr degrades gracefully by design (BEH-7, COMMIT_PR_SKIPPED) —
    // commitAndOpenPr() never throws, so this call is not wrapped in its own
    // try/catch the way other subcommands' lib calls are; a thrown error
    // here would be a genuine bug in commitAndOpenPr, not an expected path.
    const result = commitAndOpenPr({
      cwd: projectRoot,
      issueId: values.issue,
      title: values.title,
      notes: values.notes ?? null,
      specPath: values['spec-path'],
      prBase,
    });

    if (!result.skipped) {
      // Stack the next bug's worktree on this bug's completed branch.
      recordWorktreeBranch(projectRoot, values['run-id'], result.branch);
    }

    console.log(values.json ? JSON.stringify(result) : (result.skipped ? `skipped: ${result.reason}` : `opened PR: ${result.prUrl}`));
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
  console.log('  create [--max-bugs N] [--max-turns N] [--starting-branch <ref>] [--json]');
  console.log('    Create a fresh BugfixLoopRun. Stdout: created run state.');
  console.log('    --starting-branch persists the loop\'s starting branch, used as the');
  console.log('    --worktree-per-bug base-ref fallback for the first bug of the run.');
  console.log('');
  console.log('  guard --run-id <id> [--json]');
  console.log('    Status guard + per-turn budget check. Stdout: {proceed, reason?, status?,');
  console.log('    budget_reason?, worktree_base_ref}. worktree_base_ref is always present —');
  console.log('    last_worktree_branch if a prior bug this run completed one, else starting_branch.');
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
  console.log('');
  console.log('  check-freshness [--json]');
  console.log('    Report how far HEAD is behind/ahead of the remote default branch.');
  console.log('    Stdout: {status: "ok"|"warn"|"blocked"|"degraded", ahead?, behind?, reason?}.');
  console.log('    Reads tasks.bugfix_loop.freshness.{soft_threshold,hard_threshold} from');
  console.log('    manifest (defaults: soft=50, hard=unset/warn-only). Always exits 0.');
  console.log('');
  console.log('  commit-pr --run-id <id> --issue <id> [--title <t>] [--notes <n>]');
  console.log('             [--spec-path <p>] [--pr-base <ref>] [--json]');
  console.log('    Commit the isolated diff, push adev/bugfix-<issue-id>, and open a PR');
  console.log('    against --pr-base. On success, updates run-state last_worktree_branch so');
  console.log('    the next bug stacks on this one. --title/--notes are untrusted WorkItem');
  console.log('    content (BEH-11); unsafe content is refused, never sanitized, and falls');
  console.log('    back to a generic templated message. Degrades to {skipped: true, reason}');
  console.log('    on any commit/push/gh failure (BEH-7) — always exits 0.');
}

export default { run, help };
