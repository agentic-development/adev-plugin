import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { createTempDir, cleanupTempDir, PLUGIN_ROOT } from '../../helpers.mjs';
import {
  assertBaselineWritable,
  classifyRun,
  createShim,
  evaluateThresholds,
  EV1_FIXTURE,
  implementPrompt,
  prepareSandbox,
  reviewDepthsFromEvents,
  sessionTranscriptPaths,
  stepResults,
  summarizeArm,
  transcriptUsage,
} from '../../evals/implement-rigor-ladder/run-ab-eval.mjs';
import {
  askedUserQuestion,
  evaluateNonconvergent,
  NONCONVERGENT_FIXTURE,
  prepareNonconvergentSandbox,
} from '../../evals/implement-rigor-ladder/run-nonconvergent.mjs';

const usage = (input, output, create, read) => ({
  input_tokens: input,
  output_tokens: output,
  cache_creation_input_tokens: create,
  cache_read_input_tokens: read,
});

function assistantRow(id, u, content) {
  return JSON.stringify({ type: 'assistant', message: { id, usage: u, content } });
}

test('transcriptUsage counts each message.id once, last split row wins, and sums across files', () => {
  const dir = createTempDir();
  try {
    const main = join(dir, 'main.jsonl');
    writeFileSync(
      main,
      [
        assistantRow('msg_1', usage(10, 1, 100, 1000), [{ type: 'thinking', thinking: '...' }]),
        assistantRow('msg_1', usage(10, 5, 100, 1000), [{ type: 'text', text: 'dispatching' }]),
        assistantRow('msg_1', usage(10, 7, 100, 1000), [{ type: 'tool_use', id: 'tu_1', name: 'Agent', input: {} }]),
        JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tu_1' }] } }),
        assistantRow('msg_2', usage(3, 2, 0, 1200), [{ type: 'tool_use', id: 'tu_2', name: 'Bash', input: {} }]),
        'not json',
      ].join('\n') + '\n',
    );
    const sub = join(dir, 'agent-a.jsonl');
    writeFileSync(
      sub,
      [
        assistantRow('msg_s1', usage(4, 1, 50, 0), [{ type: 'text', text: 'a' }]),
        assistantRow('msg_s1', usage(4, 9, 50, 0), [{ type: 'tool_use', id: 'tu_s1', name: 'Task', input: {} }]),
      ].join('\n') + '\n',
    );

    assert.deepEqual(transcriptUsage([main, sub, join(dir, 'missing.jsonl')]), {
      tokens: usage(10 + 3 + 4, 7 + 2 + 9, 100 + 0 + 50, 1000 + 1200 + 0),
      agentDispatches: 2,
      transcripts: 2,
    });
  } finally {
    cleanupTempDir(dir);
  }
});

test('sessionTranscriptPaths reads the projects root under configDir and includes subagent transcripts', () => {
  const configDir = createTempDir();
  try {
    const projectDir = '/private/var/tmp/adev-ev1-sandbox-abc.d';
    const sessionDir = join(configDir, 'projects', projectDir.replace(/[^a-zA-Z0-9]/g, '-'));
    mkdirSync(join(sessionDir, 'sess-1', 'subagents'), { recursive: true });
    writeFileSync(join(sessionDir, 'sess-1.jsonl'), '');
    writeFileSync(join(sessionDir, 'sess-1', 'subagents', 'agent-x.jsonl'), '');
    writeFileSync(join(sessionDir, 'sess-1', 'subagents', 'notes.txt'), '');

    assert.deepEqual(sessionTranscriptPaths('sess-1', projectDir, { configDir }), [
      join(sessionDir, 'sess-1.jsonl'),
      join(sessionDir, 'sess-1', 'subagents', 'agent-x.jsonl'),
    ]);
    assert.deepEqual(sessionTranscriptPaths('sess-2', projectDir, { configDir }), []);
    assert.deepEqual(sessionTranscriptPaths(null, projectDir, { configDir }), []);
  } finally {
    cleanupTempDir(configDir);
  }
});

test('classifyRun accepts only a clean, committed, measured implement run', () => {
  const ok = { exitCode: 0, verdict: 'PASS', taskCommits: 7, sessionId: 's', transcripts: 3 };
  assert.deepEqual(classifyRun(ok), { valid: true, reasons: [] });
  assert.deepEqual(classifyRun({ ...ok, exitCode: 1 }), { valid: false, reasons: ['implement-exit-nonzero'] });
  assert.deepEqual(classifyRun({ ...ok, exitCode: null }), { valid: false, reasons: ['implement-exit-nonzero'] });
  assert.deepEqual(classifyRun({ ...ok, verdict: 'FAIL' }), { valid: false, reasons: ['implement-verdict-not-pass'] });
  assert.deepEqual(classifyRun({ ...ok, verdict: null }), { valid: false, reasons: ['implement-verdict-not-pass'] });
  assert.deepEqual(classifyRun({ ...ok, taskCommits: 0 }), { valid: false, reasons: ['no-task-commits'] });
  assert.deepEqual(classifyRun({ ...ok, sessionId: null, transcripts: 0 }), { valid: false, reasons: ['no-session-id'] });
  assert.deepEqual(classifyRun({ ...ok, transcripts: 0 }), { valid: false, reasons: ['no-transcripts'] });
  assert.deepEqual(classifyRun({ exitCode: 2, verdict: null, taskCommits: 0, sessionId: 's', transcripts: 0 }), {
    valid: false,
    reasons: ['implement-exit-nonzero', 'implement-verdict-not-pass', 'no-task-commits', 'no-transcripts'],
  });
});

test('implementPrompt puts the slash command and the arm flags alone on the first line', () => {
  const firstLine = (args) => implementPrompt({ implementArgs: args }).split('\n')[0];
  assert.equal(firstLine(['--tier full']), '/adev:implement .context-index/specs/features/example/example.plan.md --tier full');
  assert.equal(firstLine([]), '/adev:implement .context-index/specs/features/example/example.plan.md');
  assert.equal(firstLine(['--lite']), '/adev:implement .context-index/specs/features/example/example.plan.md --lite');
});

test('implementPrompt appends one operator pre-approval, identical for every arm', () => {
  const statements = [['--tier full'], [], ['--lite']].map((args) => {
    const lines = implementPrompt({ implementArgs: args }).split('\n');
    assert.equal(lines[1], '', 'a blank line separates the command from the operator statement');
    return lines.slice(2).join('\n');
  });
  assert.ok(statements[0].length > 0);
  assert.equal(statements[1], statements[0]);
  assert.equal(statements[2], statements[0]);
  assert.match(statements[0], /unattended evaluation run/);
  assert.match(statements[0], /assisted-agent checkpoint/);
  assert.match(statements[0], /REQUIRES HUMAN APPROVAL/);
  assert.match(statements[0], /Do not wait for input/);
});

test('the operator statement names no review depth or tier', () => {
  const statement = implementPrompt({ implementArgs: [] }).split('\n').slice(1).join('\n');
  assert.doesNotMatch(statement, /--lite|--tier|\blite\b|\btier\b|\bquick\b|\bfull\b|review depth/i);
});

function runResult({ arm, wall, escaped = 0, gates = true, valid = true, verdict = 'PASS', depths = {} }) {
  const defects = ['D1', 'D2', 'D3', 'D4'].map((id, i) => ({ id, caught_at: i < escaped ? 'escaped' : 'implement' }));
  return {
    arm,
    valid,
    implement: { verdict },
    metrics: { wall_clock_ms: wall, quality_gates: { pass: gates }, defects },
    review_depths: depths,
  };
}

const LITE_DEPTHS = {
  1: { provisional: { depth: 'lite', source: 'lite-grant' }, final: { depth: 'lite', source: 'lite-grant' } },
  4: { provisional: { depth: 'quick', source: 'default-quick' }, final: { depth: 'quick', source: 'default-quick' } },
  6: { provisional: { depth: 'full', source: 'default-quick' }, final: { depth: 'full', source: 'default-quick' } },
  7: { provisional: { depth: 'lite', source: 'lite-grant' }, final: { depth: 'quick', source: 'lite-tripwire' } },
};
const FIXTURE_ROLES = {
  taskRoles: [
    { id: '1', role: 'lite-eligible' },
    { id: '4', role: 'assisted-agent' },
    { id: '6', role: 'sensitive-path' },
    { id: '7', role: 'tripwire-target' },
  ],
  tripwireTargetTask: { task: '7' },
};

test('summarizeArm takes medians over valid runs and judges quality gates over every run', () => {
  const valid = [
    runResult({ arm: 'full', wall: 100, escaped: 1 }),
    runResult({ arm: 'full', wall: 300, escaped: 0 }),
    runResult({ arm: 'full', wall: 200, escaped: 2 }),
  ];
  assert.deepEqual(summarizeArm([...valid, runResult({ arm: 'full', wall: 9000, escaped: 4, valid: false, gates: false })]), {
    runs: 4,
    valid_runs: 3,
    invalid_runs: 1,
    median_wall_clock_ms: 200,
    median_escaped_defects: 1,
    quality_gates_pass_all: false,
  });
  const failVerdict = runResult({ arm: 'full', wall: 50, valid: false, verdict: 'FAIL' });
  assert.equal(summarizeArm([...valid, failVerdict]).quality_gates_pass_all, false);
  const noSession = runResult({ arm: 'full', wall: 50, valid: false, verdict: null });
  assert.equal(summarizeArm([...valid, noSession]).quality_gates_pass_all, true);
  assert.equal(summarizeArm([runResult({ arm: 'x', wall: 10 }), runResult({ arm: 'x', wall: 30 })]).median_wall_clock_ms, 20);
  assert.deepEqual(summarizeArm([]), {
    runs: 0, valid_runs: 0, invalid_runs: 0, median_wall_clock_ms: null, median_escaped_defects: null, quality_gates_pass_all: false,
  });
});

test('evaluateThresholds fails the quality-gate check on an invalid run whose implement verdict is FAIL', () => {
  const baseline = summarizeArm([1000, 1000, 1000].map((wall) => runResult({ arm: 'full', wall })));
  const arms = {
    quick: [700, 700, 700].map((wall) => runResult({ arm: 'quick', wall })),
    lite: [
      ...[400, 400, 400].map((wall) => runResult({ arm: 'lite', wall, depths: LITE_DEPTHS })),
      runResult({ arm: 'lite', wall: 100, valid: false, verdict: 'FAIL', depths: LITE_DEPTHS }),
    ],
  };
  const out = evaluateThresholds({ baseline, arms, fixture: FIXTURE_ROLES });
  const gates = out.checks.find((c) => c.id === 'quality_gates_every_run');
  assert.equal(gates.pass, false);
  assert.deepEqual(gates.invalid_runs, { baseline: 0, quick: 0, lite: 1 });
  assert.deepEqual(out.checks.filter((c) => !c.pass).map((c) => c.id), ['quality_gates_every_run']);
});

test('no_lite_grant_on_ineligible needs a provisional event per ineligible task and checks both passes', () => {
  const baseline = summarizeArm([1000, 1000, 1000].map((wall) => runResult({ arm: 'full', wall })));
  const quick = [700, 700, 700].map((wall) => runResult({ arm: 'quick', wall }));
  const check = (depths) =>
    evaluateThresholds({
      baseline,
      arms: { quick, lite: [400, 400, 400].map((wall) => runResult({ arm: 'lite', wall, depths })) },
      fixture: FIXTURE_ROLES,
    }).checks.find((c) => c.id === 'no_lite_grant_on_ineligible');
  assert.equal(check(LITE_DEPTHS).pass, true);
  const { 4: _dropped, ...missing4 } = LITE_DEPTHS;
  assert.equal(check(missing4).pass, false);
  assert.deepEqual(check(missing4).missing_provisional, ['4']);
  const finalLite = { ...LITE_DEPTHS, 6: { ...LITE_DEPTHS[6], final: { depth: 'lite', source: 'lite-grant' } } };
  assert.equal(check(finalLite).pass, false);
});

test('evaluateThresholds passes when every EV-1 release threshold holds', () => {
  const baseline = summarizeArm([1000, 1000, 1000].map((wall) => runResult({ arm: 'full', wall, escaped: 1 })));
  const arms = {
    quick: [800, 700, 790].map((wall) => runResult({ arm: 'quick', wall })),
    lite: [500, 400, 450].map((wall) => runResult({ arm: 'lite', wall, escaped: 2, depths: LITE_DEPTHS })),
  };
  const out = evaluateThresholds({ baseline, arms, fixture: FIXTURE_ROLES });
  assert.equal(out.pass, true, JSON.stringify(out.checks.filter((c) => !c.pass)));
  assert.deepEqual(Object.fromEntries(out.checks.map((c) => [c.id, c.observed])), {
    baseline_runs: 3,
    quick_runs: 3,
    lite_runs: 3,
    quick_wall_clock_vs_full: 0.79,
    lite_wall_clock_vs_full: 0.45,
    lite_escaped_defects: 2,
    quality_gates_every_run: true,
    tripwire_fires_every_lite_run: true,
    no_lite_grant_on_ineligible: true,
  });
});

test('evaluateThresholds names each threshold that fails', () => {
  const baseline = summarizeArm([1000, 1000, 1000].map((wall) => runResult({ arm: 'full', wall })));
  const badLite = { ...LITE_DEPTHS, 6: { provisional: { depth: 'lite', source: 'lite-grant' } }, 7: LITE_DEPTHS[1] };
  const arms = {
    quick: [900, 900, 900].map((wall) => runResult({ arm: 'quick', wall, gates: false })),
    lite: [600, 600].map((wall) => runResult({ arm: 'lite', wall, escaped: 2, depths: badLite })),
  };
  const out = evaluateThresholds({ baseline, arms, fixture: FIXTURE_ROLES });
  assert.equal(out.pass, false);
  assert.deepEqual(
    out.checks.filter((c) => !c.pass).map((c) => c.id),
    [
      'lite_runs',
      'quick_wall_clock_vs_full',
      'lite_wall_clock_vs_full',
      'lite_escaped_defects',
      'quality_gates_every_run',
      'tripwire_fires_every_lite_run',
      'no_lite_grant_on_ineligible',
    ],
  );
  const noRuns = evaluateThresholds({ baseline, arms: { quick: [], lite: [] }, fixture: FIXTURE_ROLES });
  assert.equal(noRuns.pass, false);
  assert.equal(noRuns.checks.find((c) => c.id === 'lite_wall_clock_vs_full').reason, 'no-runs');
});

test('reviewDepthsFromEvents keeps the latest event per task and pass, keyed by task number', () => {
  const ev = (task_id, pass, depth, source) => ({ event: 'review_depth_resolved', task_id, pass, depth, source });
  assert.deepEqual(
    reviewDepthsFromEvents([
      ev('task-7', 'provisional', 'lite', 'lite-grant'),
      ev('7', 'final', 'quick', 'lite-tripwire'),
      { event: 'plan_task', task_id: '7', status: 'done' },
      ev('1', 'provisional', 'quick', 'default-quick'),
      ev('1', 'provisional', 'lite', 'lite-grant'),
    ]),
    {
      7: { provisional: { depth: 'lite', source: 'lite-grant' }, final: { depth: 'quick', source: 'lite-tripwire' } },
      1: { provisional: { depth: 'lite', source: 'lite-grant' } },
    },
  );
});

test('stepResults reads STEP_RESULT blocks from transcript text and tool results', () => {
  const dir = createTempDir();
  try {
    const file = join(dir, 'main.jsonl');
    const block = 'Task 1 halted.\nSTEP_RESULT:\n  status: BLOCKED\n  verdict: LOOP_BUDGET_EXHAUSTED\n';
    writeFileSync(
      file,
      [
        JSON.stringify({ type: 'assistant', message: { id: 'm1', content: [{ type: 'text', text: 'no result here' }] } }),
        JSON.stringify({
          type: 'user',
          message: { content: [{ type: 'tool_result', tool_use_id: 't', content: [{ type: 'text', text: block }] }] },
        }),
        JSON.stringify({ type: 'assistant', message: { id: 'm2', content: [{ type: 'text', text: 'STEP_RESULT:\n  status: FAILED' }] } }),
      ].join('\n') + '\n',
    );
    const results = stepResults([file]);
    assert.deepEqual(results.map((r) => r.status), ['BLOCKED', 'FAILED']);
    assert.match(results[0].text, /LOOP_BUDGET_EXHAUSTED/);
  } finally {
    cleanupTempDir(dir);
  }
});

const HALT_TEXT = 'Task 1 (SKU normalization): code-quality review did not converge — LOOP_BUDGET_EXHAUSTED after 1 cycle.';

function haltEvents(extra = []) {
  return [
    { event: 'lifecycle_step', step: 'implement', status: 'started' },
    { event: 'plan_task', task_id: '1', status: 'in_progress' },
    { event: 'plan_task', task_id: '1', status: 'blocked', notes: 'LOOP_BUDGET_EXHAUSTED: cq-1 open' },
    ...extra,
  ];
}

test('evaluateNonconvergent accepts the BEH-15 halt in both modes', () => {
  const base = {
    events: haltEvents(),
    executionState: { status: 'blocked' },
    haltedTask: '1',
    laterTasks: ['2', '3'],
    earlierCommits: [],
    timedOut: false,
    resultText: HALT_TEXT,
  };
  const direct = evaluateNonconvergent({ ...base, mode: 'direct', stepResult: null });
  assert.equal(direct.pass, true, JSON.stringify(direct.failures));
  assert.equal(direct.outcome, 'pass');
  assert.deepEqual(direct.observed, {
    plan_task: 'blocked',
    execution_state: 'blocked',
    later_task_started: false,
    step_failed: false,
    waits_for_input: false,
    build_status: null,
  });
  assert.equal(direct.loop_code, 'LOOP_BUDGET_EXHAUSTED');

  const build = evaluateNonconvergent({
    ...base,
    mode: 'build',
    resultText: 'Build stopped.',
    stepResult: { status: 'BLOCKED', text: HALT_TEXT },
  });
  assert.equal(build.pass, true, JSON.stringify(build.failures));
  assert.equal(build.observed.build_status, 'BLOCKED');
});

test('evaluateNonconvergent names every departure from the expected terminal shape', () => {
  const out = evaluateNonconvergent({
    mode: 'build',
    events: haltEvents([
      { event: 'plan_task', task_id: 'task-2', status: 'in_progress' },
      { event: 'step_failed', step: 'implement', verdict: 'FAIL' },
    ]),
    executionState: { status: 'in_progress' },
    haltedTask: '1',
    laterTasks: ['2', '3'],
    earlierCommits: [{ sha: 'abc', kept: false }],
    timedOut: false,
    resultText: 'Task 1 hit LOOP_BUDGET_EXHAUSTED. Should I keep going?',
    stepResult: { status: 'FAILED', text: '' },
  });
  assert.equal(out.pass, false);
  assert.equal(out.outcome, 'fail');
  assert.deepEqual(out.failures, [
    'execution_state',
    'later_task_started',
    'step_failed',
    'waits_for_input',
    'build_status',
    'earlier_commits_kept',
  ]);

  const asked = evaluateNonconvergent({
    mode: 'direct',
    events: haltEvents(),
    executionState: { status: 'blocked' },
    haltedTask: '1',
    laterTasks: ['2', '3'],
    earlierCommits: [],
    timedOut: false,
    askedUser: true,
    resultText: HALT_TEXT,
    stepResult: null,
  });
  assert.equal(asked.observed.waits_for_input, true);
  assert.deepEqual(asked.failures, ['waits_for_input']);
});

test('evaluateNonconvergent reports halted_other when the loop never reached its cap', () => {
  const common = {
    mode: 'direct',
    executionState: { status: 'blocked' },
    haltedTask: '1',
    laterTasks: ['2', '3'],
    earlierCommits: [],
    timedOut: false,
    stepResult: null,
  };
  const implementerBlocked = evaluateNonconvergent({
    ...common,
    events: [
      { event: 'lifecycle_step', step: 'implement', status: 'started' },
      { event: 'plan_task', task_id: '1', status: 'blocked', notes: 'NEEDS_CONTEXT: spec and constitution disagree' },
    ],
    resultText: 'Task 1 is blocked: NEEDS_CONTEXT. Which rule should win?',
  });
  assert.equal(implementerBlocked.outcome, 'halted_other');
  assert.equal(implementerBlocked.pass, false);
  assert.equal(implementerBlocked.loop_code, null);

  const converged = evaluateNonconvergent({
    ...common,
    events: [
      { event: 'lifecycle_step', step: 'implement', status: 'started' },
      { event: 'plan_task', task_id: '1', status: 'done' },
      { event: 'plan_task', task_id: '2', status: 'in_progress' },
    ],
    resultText: 'All done.',
  });
  assert.equal(converged.outcome, 'halted_other');

  const timedOut = evaluateNonconvergent({ ...common, events: [], executionState: null, timedOut: true, resultText: '' });
  assert.equal(timedOut.outcome, 'halted_other');
  assert.equal(timedOut.observed.waits_for_input, true);
  assert.equal(timedOut.observed.plan_task, null);
});

test('evaluateNonconvergent never scores another task\'s LOOP halt against the case\'s task', () => {
  const common = {
    mode: 'direct',
    executionState: { status: 'blocked' },
    haltedTask: '1',
    laterTasks: ['2', '3'],
    earlierCommits: [],
    timedOut: false,
    stepResult: null,
  };
  const task2Halt = 'Task 2 (Audit signing): spec-compliance review did not converge — LOOP_BUDGET_EXHAUSTED after 1 cycle.';
  const doneThenTask2 = evaluateNonconvergent({
    ...common,
    events: [
      { event: 'lifecycle_step', step: 'implement', status: 'started' },
      { event: 'plan_task', task_id: '1', status: 'in_progress' },
      { event: 'plan_task', task_id: '1', status: 'done' },
      { event: 'plan_task', task_id: '2', status: 'in_progress' },
      { event: 'plan_task', task_id: '2', status: 'blocked', notes: 'LOOP_BUDGET_EXHAUSTED: sc-1 open' },
    ],
    resultText: task2Halt,
  });
  assert.equal(doneThenTask2.outcome, 'halted_other');
  assert.equal(doneThenTask2.loop_code, null);

  const otherTaskInText = evaluateNonconvergent({
    ...common,
    events: [
      { event: 'lifecycle_step', step: 'implement', status: 'started' },
      { event: 'plan_task', task_id: '1', status: 'blocked', notes: 'blocked: see halt message' },
    ],
    resultText: task2Halt,
  });
  assert.equal(otherTaskInText.outcome, 'halted_other');
  assert.equal(otherTaskInText.loop_code, null);

  const ownHaltLine = evaluateNonconvergent({
    ...common,
    events: [
      { event: 'lifecycle_step', step: 'implement', status: 'started' },
      { event: 'plan_task', task_id: '1', status: 'blocked', notes: 'blocked: see halt message' },
    ],
    resultText: `Run summary.\n${HALT_TEXT}`,
  });
  assert.equal(ownHaltLine.loop_code, 'LOOP_BUDGET_EXHAUSTED');
  assert.equal(ownHaltLine.outcome, 'pass', JSON.stringify(ownHaltLine.failures));
});

test('evaluateNonconvergent fails a run whose own task halted at the cap but a later task then started and halted too', () => {
  const out = evaluateNonconvergent({
    mode: 'direct',
    events: [
      { event: 'lifecycle_step', step: 'implement', status: 'started' },
      { event: 'plan_task', task_id: '1', status: 'in_progress' },
      { event: 'plan_task', task_id: '1', status: 'blocked', notes: 'LOOP_BUDGET_EXHAUSTED: cq-1 open' },
      { event: 'plan_task', task_id: '2', status: 'in_progress' },
      { event: 'plan_task', task_id: '2', status: 'blocked', notes: 'LOOP_BUDGET_EXHAUSTED: sc-1 open' },
    ],
    executionState: { status: 'blocked' },
    haltedTask: '1',
    laterTasks: ['2', '3'],
    earlierCommits: [],
    timedOut: false,
    resultText: `${HALT_TEXT}\nTask 2 (Audit signing): spec-compliance review did not converge — LOOP_BUDGET_EXHAUSTED after 1 cycle.`,
    stepResult: null,
  });
  assert.equal(out.loop_code, 'LOOP_BUDGET_EXHAUSTED');
  assert.equal(out.other_task_halted, true);
  assert.equal(out.outcome, 'fail');
  assert.deepEqual(out.failures, ['later_task_started']);
});

test('assertBaselineWritable refuses to replace a recorded baseline unless rebaselining', () => {
  const dir = createTempDir();
  try {
    assert.doesNotThrow(() => assertBaselineWritable(dir, { rebaseline: false }));
    writeFileSync(join(dir, 'baseline-main-2026-11-26.json'), '{}\n');
    assert.throws(() => assertBaselineWritable(dir, { rebaseline: false }), (err) => {
      assert.equal(err.code, 'BASELINE_EXISTS');
      assert.match(err.message, /baseline-main-2026-11-26\.json/);
      assert.match(err.message, /--rebaseline/);
      return true;
    });
    assert.doesNotThrow(() => assertBaselineWritable(dir, { rebaseline: true }));
  } finally {
    cleanupTempDir(dir);
  }
});

test('askedUserQuestion finds an AskUserQuestion tool_use in any transcript', () => {
  const dir = createTempDir();
  try {
    const quiet = join(dir, 'quiet.jsonl');
    const asks = join(dir, 'asks.jsonl');
    writeFileSync(quiet, `${JSON.stringify({ type: 'assistant', message: { id: 'a', content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: {} }] } })}\n`);
    writeFileSync(asks, `${JSON.stringify({ type: 'assistant', message: { id: 'b', content: [{ type: 'tool_use', id: 't2', name: 'AskUserQuestion', input: {} }] } })}\n`);
    assert.equal(askedUserQuestion([quiet]), false);
    assert.equal(askedUserQuestion([quiet, asks]), true);
    assert.equal(askedUserQuestion([]), false);
  } finally {
    cleanupTempDir(dir);
  }
});

function sandboxGit(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function sandboxAdev(sandbox, args) {
  return JSON.parse(execFileSync('adev', args, { cwd: sandbox.root, env: sandbox.env, encoding: 'utf8' }));
}

test('the EV-1 sandbox commits the routing sidecar at run_base, so the lite arm is granted lite', () => {
  const shim = createShim(PLUGIN_ROOT);
  const sandbox = prepareSandbox({ pluginRoot: PLUGIN_ROOT, bin: shim.bin, fixture: EV1_FIXTURE });
  try {
    const head = sandboxGit(sandbox.root, ['rev-parse', 'HEAD']);
    sandboxGit(sandbox.root, ['cat-file', '-e', `${head}:.context-index/specs/features/example/example.routing.json`]);
    const flags = sandboxAdev(sandbox, ['implement', 'check-flags', '--spec', EV1_FIXTURE.sandboxSpec, '--lite']);
    assert.equal(flags.run_base, head);
    assert.equal(flags.lite_authorized, true);
    const depths = ['1', '2', '3', '4', '5', '6', '7'].map((task) =>
      sandboxAdev(sandbox, [
        'implement', 'resolve-depth', '--spec', EV1_FIXTURE.sandboxSpec, '--plan', EV1_FIXTURE.sandboxPlan,
        '--task-id', task, '--run-base', head, '--lite', '--pass', 'provisional',
      ]));
    assert.deepEqual(
      depths.map((d) => [d.depth, d.lite_denied]),
      [
        ['lite', null], ['lite', null], ['lite', null],
        ['quick', 'routing-scores'], ['quick', 'routing-scores'], ['full', 'floor:sensitive-path'],
        ['lite', null],
      ],
    );
    const batches = sandboxAdev(sandbox, ['implement', 'batches', '--plan', EV1_FIXTURE.sandboxPlan, '--lite', '--run-base', head]);
    // Group A (3 → 5 → 7) is split by its lite tasks 3 and 7, leaving 5 alone
    // ("size"); the single-task groups B–E never batch.
    assert.deepEqual(batches.batches, []);
    assert.deepEqual(batches.solo, [
      { taskId: '3', reason: 'lite' },
      { taskId: '5', reason: 'size' },
      { taskId: '7', reason: 'lite' },
      { taskId: '1', reason: null },
      { taskId: '2', reason: null },
      { taskId: '4', reason: null },
      { taskId: '6', reason: null },
    ]);
  } finally {
    rmSync(sandbox.root, { recursive: true, force: true });
    rmSync(shim.bin, { recursive: true, force: true });
  }
});

test('nonconvergent sandboxes resolve as designed with the shipped verbs, per case and mode', () => {
  const shim = createShim(PLUGIN_ROOT);
  const specDir = '.context-index/specs/features/inventory';
  try {
    for (const [caseId, mode] of [
      ['escalated-lite-code-quality-nonconvergent', 'build'],
      ['stage1-spec-compliance-nonconvergent', 'direct'],
    ]) {
      const sandbox = prepareNonconvergentSandbox({ pluginRoot: PLUGIN_ROOT, bin: shim.bin, caseId, mode });
      try {
        const head = sandboxGit(sandbox.root, ['rev-parse', 'HEAD']);
        sandboxGit(sandbox.root, ['cat-file', '-e', `${head}:${specDir}/inventory.routing.json`]);
        const depth = (task) =>
          sandboxAdev(sandbox, [
            'implement', 'resolve-depth',
            '--spec', NONCONVERGENT_FIXTURE.sandboxSpec,
            '--plan', NONCONVERGENT_FIXTURE.sandboxPlan,
            '--task-id', task, '--run-base', head, '--lite', '--pass', 'provisional',
          ]);
        const [d1, d2, d3] = ['1', '2', '3'].map(depth);
        assert.deepEqual([d1.depth, d2.depth, d3.depth], ['lite', 'full', 'lite']);
        assert.equal(d2.review_cycles, 1);

        const reviewAtHead = () => sandboxGit(sandbox.root, ['cat-file', '-e', `${head}:${specDir}/inventory.review.md`]);
        if (mode === 'build') reviewAtHead();
        else assert.throws(reviewAtHead);

        if (caseId.startsWith('stage1')) {
          assert.equal(sandbox.earlierCommits.length, 1);
          const body = sandboxGit(sandbox.root, ['log', '-1', '--format=%B', sandbox.earlierCommits[0]]);
          assert.match(body, /^Plan-task: 1$/m);
          const log = sandboxGit(sandbox.root, ['show', 'HEAD:.context-index/lifecycle-state/inventory.jsonl']);
          const task1 = log.split('\n').map((l) => JSON.parse(l)).filter((e) => e.event === 'plan_task' && e.task_id === '1');
          assert.equal(task1.at(-1).status, 'done');
        } else {
          assert.deepEqual(sandbox.earlierCommits, []);
        }
      } finally {
        rmSync(sandbox.root, { recursive: true, force: true });
      }
    }
  } finally {
    rmSync(shim.bin, { recursive: true, force: true });
  }
});
