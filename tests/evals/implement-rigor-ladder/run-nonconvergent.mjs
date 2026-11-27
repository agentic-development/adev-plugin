// [live] BEH-15 non-convergence runner for the implement rigor ladder.
//
// Reached through `run-ab-eval.mjs --fixture nonconvergent --mode build|direct
// [--case <id>]`. Each case of fixture-nonconvergent/ runs once in the given
// mode against a fresh sandbox, and the run's lifecycle log, execution state,
// transcripts and final message are checked for the Step 2g halt.
//
// Each run has one of three outcomes:
//   pass          the halted task's review loop hit its cap (a LOOP_* code is
//                 recorded) and the run ended in BEH-15's terminal shape;
//   fail          the loop hit its cap but the terminal shape is wrong: a BEH-15
//                 defect;
//   halted_other  no LOOP_* code was recorded: the loop never reached its cap
//                 (the implementer stopped with a blocker or a question, the
//                 loop converged, or the run timed out). That is a miss of the
//                 fixture, not evidence about BEH-15, and the case is re-run.
// The runner exits 0 when every run passes, 1 when any fails, and 3 when none
// fails but at least one is halted_other.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readExecutionState } from '../../../lib/execution-state.mjs';
import { sidecarPathFor } from '../../../lib/plan-routing-sidecar.mjs';
import { sameTaskId } from '../../../lib/plan-task-id.mjs';
import {
  awaitTranscripts,
  classifyTasks,
  eventsSinceImplementStart,
  fixtureDescriptor,
  HarnessError,
  lifecycleEvents,
  prepareSandbox,
  readJsonl,
  requireClaudeCli,
  resolveRef,
  runClaude,
  specRiskLevel,
  stepResults,
  transcriptUsage,
  withRefWorktree,
} from './run-ab-eval.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..');

export const NONCONVERGENT_FIXTURE = fixtureDescriptor({
  id: 'nonconvergent',
  dir: join(HERE, 'fixture-nonconvergent'),
  stem: 'inventory',
  module: 'inventory',
  branch: 'eval/rigor-ladder-nonconvergent',
  reviewFile: 'inventory.review.md',
});

export const MODES = ['build', 'direct'];

export const NONCONVERGENT_EXPECT = Object.freeze({
  plan_task: 'blocked',
  execution_state: 'blocked',
  later_task_started: false,
  step_failed: false,
  waits_for_input: false,
  build_status: 'BLOCKED',
});
const LOOP_CODES = ['LOOP_BUDGET_EXHAUSTED', 'LOOP_NO_PROGRESS', 'LOOP_REGRESSED'];
const LOOP_CODE_RE = new RegExp(`\\b(${LOOP_CODES.join('|')})\\b`);
const EXIT_HALTED_OTHER = 3;

function readCases() {
  return JSON.parse(readFileSync(join(NONCONVERGENT_FIXTURE.dir, 'cases.json'), 'utf8'));
}

function readMaxReviewCycles(seedDir) {
  const text = readFileSync(join(seedDir, '.context-index', 'manifest.yaml'), 'utf8');
  const m = /^implement:\s*\n(?:[ \t]+.*\n)*?[ \t]+max_review_cycles:\s*(\d+)\s*$/m.exec(text);
  return m ? Number(m[1]) : null;
}

/**
 * The BEH-15 fixture's tasks and cases. Each case's halted task must have the
 * role its loop needs: an escalated-lite (tripwire-target) task for the
 * code-quality case, a task resolving `full` for the Stage 1 case.
 */
export async function describeNonconvergentFixture() {
  const fixture = NONCONVERGENT_FIXTURE;
  const taskRoles = await classifyTasks(fixture);
  const caseDetails = readCases();
  const role = (id) => taskRoles.find((t) => t.id === id);
  for (const c of caseDetails) {
    const halted = role(c.halted_task);
    const ok = c.loop === 'code-quality'
      ? halted?.role === 'tripwire-target'
      : c.loop === 'spec-compliance' && halted?.liteArm.expectedFinal === 'full';
    if (!ok) throw new HarnessError('FIXTURE_INVALID', `case ${c.id}: task ${c.halted_task} cannot run a ${c.loop} loop`);
    for (const id of [...c.later_tasks, ...c.preseed_done]) {
      if (!role(id)) throw new HarnessError('FIXTURE_INVALID', `case ${c.id} names task ${id}, which the plan lacks`);
    }
    for (const id of c.preseed_done) {
      if (!existsSync(join(fixture.dir, 'preseed', `task-${id}`))) {
        throw new HarnessError('FIXTURE_INVALID', `case ${c.id} preseeds task ${id} but fixture-nonconvergent/preseed/task-${id}/ is missing`);
      }
    }
  }
  return {
    name: fixture.id,
    plan: relative(REPO_ROOT, fixture.planPath),
    sidecar: relative(REPO_ROOT, sidecarPathFor(fixture.planPath)),
    specRiskLevel: specRiskLevel(readFileSync(fixture.specPath, 'utf8')),
    maxReviewCycles: readMaxReviewCycles(fixture.seed),
    cases: caseDetails.map((c) => c.id),
    caseDetails,
    taskRoles,
  };
}

// The build step starts at implement through --resume --from implement: the
// Implement Pipeline would otherwise dispatch /adev:route first, which would
// rewrite the sidecar committed at run_base.
export function nonconvergentPrompt(mode) {
  const f = NONCONVERGENT_FIXTURE;
  if (mode === 'build') return `/adev:build --spec ${f.sandboxSpec} --resume --from implement --auto --lite`;
  return `/adev:implement ${f.sandboxPlan} --lite`;
}

export async function nonconvergentDryRun({ ref = 'HEAD', mode = null } = {}) {
  return {
    fixture: await describeNonconvergentFixture(),
    modes: mode ? [mode] : MODES,
    prompts: Object.fromEntries(MODES.map((m) => [m, nonconvergentPrompt(m)])),
    expect: NONCONVERGENT_EXPECT,
    expectAlso: {
      loop_code: `one of ${LOOP_CODES.join('|')}, in the halted task's plan_task notes or the halt message`,
      halt_message: 'names the loop code and "Task <id>" of the halted task',
      earlier_commits_kept: 'every preseeded task commit is still an ancestor of HEAD',
      build_status: 'build mode only: the implement STEP_RESULT status',
    },
    outcomes: {
      pass: 'the loop hit its cap and the run ended in the BEH-15 terminal shape',
      fail: 'the loop hit its cap and the terminal shape is wrong (a BEH-15 defect)',
      halted_other: 'no LOOP_* code was recorded; a fixture miss to re-run, neither a BEH-15 pass nor a fail',
    },
    ref,
    liveOutput: 'results/nonconvergent-<mode>-<case>-<ref-short>-<iso>.json',
    writes: [],
  };
}

/**
 * A sandbox for one case: in build mode with the PASS review the Implement
 * Pipeline requires, and with the case's preseeded tasks committed and done.
 */
export function prepareNonconvergentSandbox({ pluginRoot, bin, caseId, mode }) {
  const c = readCases().find((x) => x.id === caseId);
  if (!c) throw new HarnessError('USAGE', `unknown --case '${caseId}'`);
  return prepareSandbox({ pluginRoot, bin, fixture: NONCONVERGENT_FIXTURE, preseed: c.preseed_done, withReview: mode === 'build' });
}

/** Whether any transcript holds an AskUserQuestion tool_use. */
export function askedUserQuestion(paths) {
  return paths.some((file) =>
    readJsonl(file).some(
      (row) =>
        row.type === 'assistant' &&
        (row.message?.content ?? []).some((b) => b?.type === 'tool_use' && b.name === 'AskUserQuestion'),
    ),
  );
}

function lastLineAsks(text) {
  const lines = String(text ?? '').trim().split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.length > 0 && lines[lines.length - 1].endsWith('?');
}

const TASK_NAME_RE = /\bTask\s+(\d+(?:\.\d+)*[A-Za-z]?)\b/g;

// The halt-message lines carrying a LOOP_* code, each with the task ids it
// names.
function loopHaltLines(text) {
  return String(text ?? '')
    .split('\n')
    .map((line) => ({ code: LOOP_CODE_RE.exec(line)?.[1] ?? null, tasks: [...line.matchAll(TASK_NAME_RE)].map((m) => m[1]) }))
    .filter((l) => l.code !== null);
}

/**
 * Checks one non-convergence run against the BEH-15 terminal shape. `events`
 * is the sandbox lifecycle log; only events after the latest implement
 * `started` count, so a preseeded task's events are not this run's. A run
 * waits for input when it timed out, called AskUserQuestion, or ended its
 * final message on a question. `build_status` is compared in build mode only.
 *
 * The loop code is attributed to the case's task only from that task's own
 * `plan_task` `blocked` notes, or from a halt line naming both "Task <id>" and
 * the code; a halt elsewhere in the text may be another task's. The run is
 * `halted_other` when no such code exists or when the case's task ended
 * `done`: the loop under test did not reach its cap, so the run says nothing
 * about BEH-15. Once the case's task has halted with an attributed code, a
 * LOOP halt on another task is a later task that started, which BEH-15
 * forbids, so it is judged (`later_task_started`), never excused.
 * `other_task_halted` is reported as a diagnostic only.
 */
export function evaluateNonconvergent({
  mode, events, executionState, haltedTask, laterTasks, earlierCommits, timedOut, askedUser = false, resultText, stepResult,
}) {
  const scope = eventsSinceImplementStart(events ?? []);
  const halted = scope.filter((e) => e.event === 'plan_task' && sameTaskId(e.task_id, haltedTask));
  const last = halted.at(-1) ?? null;
  const haltText = [resultText ?? '', stepResult?.text ?? ''].join('\n');
  const lines = loopHaltLines(haltText);
  const ownLines = lines.filter((l) => l.tasks.some((t) => sameTaskId(t, haltedTask)));
  const fromNotes = last?.status === 'blocked' ? LOOP_CODE_RE.exec(last.notes ?? '')?.[1] ?? null : null;
  const loopCode = fromNotes ?? ownLines[0]?.code ?? null;
  const otherTaskHalted =
    lines.some((l) => l.tasks.length > 0 && !l.tasks.some((t) => sameTaskId(t, haltedTask))) ||
    scope.some(
      (e) => e.event === 'plan_task' && e.status === 'blocked' && !sameTaskId(e.task_id, haltedTask) && LOOP_CODE_RE.test(e.notes ?? ''),
    );

  const isLater = (id) => laterTasks.some((t) => sameTaskId(t, id));
  const observed = {
    plan_task: last?.status ?? null,
    execution_state: executionState?.status ?? null,
    later_task_started: scope.some(
      (e) => isLater(e.task_id) &&
        ((e.event === 'plan_task' && (e.status === 'in_progress' || e.status === 'done')) || e.event === 'review_depth_resolved'),
    ),
    step_failed: scope.some((e) => e.event === 'step_failed' && e.step === 'implement'),
    waits_for_input: timedOut === true || askedUser === true || lastLineAsks(resultText),
    build_status: mode === 'build' ? stepResult?.status ?? null : null,
  };
  const haltMessage = {
    names_loop_code: lines.length > 0,
    names_task: ownLines.length > 0,
  };

  const failures = [];
  for (const key of Object.keys(NONCONVERGENT_EXPECT)) {
    if (key === 'build_status' && mode !== 'build') continue;
    if (observed[key] !== NONCONVERGENT_EXPECT[key]) failures.push(key);
  }
  if (loopCode === null) failures.push('loop_code');
  if (!haltMessage.names_loop_code || !haltMessage.names_task) failures.push('halt_message');
  if (!(earlierCommits ?? []).every((c) => c.kept)) failures.push('earlier_commits_kept');

  const missedCap = loopCode === null || last?.status === 'done';
  const outcome = missedCap ? 'halted_other' : failures.length === 0 ? 'pass' : 'fail';
  return {
    outcome,
    observed,
    loop_code: loopCode,
    other_task_halted: otherTaskHalted,
    halt_message: haltMessage,
    failures,
    pass: outcome === 'pass',
  };
}

export async function runNonconvergent(opts) {
  const described = await describeNonconvergentFixture();
  const cases = opts.caseId === null ? described.caseDetails : described.caseDetails.filter((c) => c.id === opts.caseId);
  if (cases.length === 0) throw new HarnessError('USAGE', `--case must be one of ${described.cases.join('|')}`);
  const refSha = resolveRef(opts.ref);
  requireClaudeCli();

  const outcomes = [];
  await withRefWorktree(refSha, async ({ worktree, shim }) => {
    mkdirSync(opts.resultsDir, { recursive: true });
    for (const c of cases) {
      console.log(`[beh15] ${opts.mode} ${c.id} at ${refSha.slice(0, 12)}`);
      const sandbox = prepareNonconvergentSandbox({ pluginRoot: worktree, bin: shim.bin, caseId: c.id, mode: opts.mode });
      try {
        const run = runClaude(sandbox, worktree, nonconvergentPrompt(opts.mode));
        const transcripts = awaitTranscripts(run.sessionId, sandbox.root);
        let executionState = null;
        try {
          executionState = readExecutionState(sandbox.root);
        } catch {
          executionState = null;
        }
        const earlierCommits = sandbox.earlierCommits.map((sha) => ({
          sha,
          kept: spawnSync('git', ['merge-base', '--is-ancestor', sha, 'HEAD'], { cwd: sandbox.root }).status === 0,
        }));
        const verdict = evaluateNonconvergent({
          mode: opts.mode,
          events: lifecycleEvents(sandbox.root, NONCONVERGENT_FIXTURE),
          executionState,
          haltedTask: c.halted_task,
          laterTasks: c.later_tasks,
          earlierCommits,
          timedOut: run.timedOut,
          askedUser: askedUserQuestion(transcripts),
          resultText: run.resultText,
          stepResult: opts.mode === 'build' ? stepResults(transcripts).at(-1) ?? null : null,
        });
        const result = {
          fixture: NONCONVERGENT_FIXTURE.id,
          case: c.id,
          mode: opts.mode,
          ref: refSha,
          ref_name: opts.ref,
          prompt: run.prompt,
          finished_at: new Date().toISOString(),
          exit_code: run.exitCode,
          timed_out: run.timedOut,
          session_id: run.sessionId,
          process_ms: run.processMs,
          expect: NONCONVERGENT_EXPECT,
          ...verdict,
          earlier_commits: earlierCommits,
          result_tail: run.resultText.slice(-2000),
          usage: transcriptUsage(transcripts),
        };
        const out = join(
          opts.resultsDir,
          `nonconvergent-${opts.mode}-${c.id}-${refSha.slice(0, 12)}-${result.finished_at.replace(/[:.]/g, '-')}.json`,
        );
        writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
        outcomes.push(result);
        const label = verdict.outcome === 'halted_other'
          ? 'HALTED_OTHER (fixture miss; re-run this case)'
          : verdict.pass ? 'PASS' : `FAIL (${verdict.failures.join(', ')})`;
        console.log(`[beh15] wrote ${relative(REPO_ROOT, out)}: ${label}`);
      } finally {
        rmSync(sandbox.root, { recursive: true, force: true });
      }
    }
  });
  if (outcomes.some((o) => o.outcome === 'fail')) return 1;
  if (outcomes.some((o) => o.outcome === 'halted_other')) return EXIT_HALTED_OTHER;
  return 0;
}
