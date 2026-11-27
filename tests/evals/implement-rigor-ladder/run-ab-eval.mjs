#!/usr/bin/env node
// [live] EV-1 three-arm harness for the implement rigor ladder, plus the
// BEH-15 non-convergence fixture runner.
//
// Each arm is defined only by the flags it passes to /adev:implement:
//   full  -> --tier full
//   quick -> (none)
//   lite  -> --lite
//
// `--dry-run` prints the arm plan, the fixture's derived counts, the release
// thresholds and the metric definitions as JSON, and writes nothing. That is
// what the `npm test` smoke test (tests/lib/evals/implement-rigor-ladder-smoke.test.mjs)
// exercises; it lives outside tests/evals/ because scripts/run-tests.mjs routes
// that tree to `npm run test:evals`.
//
// A live run checks out `--ref` (default HEAD) into a throwaway detached git
// worktree, so the plugin under measurement is the one at that ref, not the
// working tree. Each run copies the fixture's seed into a fresh sandbox,
// drives `claude -p` with `--plugin-dir <worktree>` and an `adev` shim that
// runs that worktree's CLI, and writes one JSON result under `results/`.
//
// The EV-1 baseline is the `full` arm on `main`: a `full` run whose `--ref`
// resolves to the commit `main` names also writes
// `results/baseline-main-<date>.json`. That baseline is the pre-implementation
// measurement, so once one is recorded such a run refuses to start
// (BASELINE_EXISTS) unless `--rebaseline` is passed. The `quick` and `lite` arms, and
// `--evaluate`, refuse to start without it (BASELINE_MISSING), because their
// release thresholds are ratios against it. `--evaluate` judges the runs at
// `--ref`, or, without one, at the ref of the latest recorded quick/lite run.
//
// `--fixture nonconvergent --mode build|direct` hands off to
// run-nonconvergent.mjs, the BEH-15 non-convergence runner. It is imported on
// demand because it imports this module's helpers.
//
// judge()/renderReport() are hardcoded to three arms (serialA baseline,
// serialB determinism control, parallel variant). Across repeated runs of one
// arm, the first run is serialA, the second serialB and the last the variant,
// so the report states whether the arm is deterministic enough on this fixture
// for a cross-arm comparison to mean anything.

import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { liteEligible } from '../../../lib/implement/review-depth.mjs';
import { judge } from '../../../lib/parallel/eval/divergence.mjs';
import { renderReport } from '../../../lib/parallel/eval/report.mjs';
import { lookupRoutingEntry, sidecarPathFor } from '../../../lib/plan-routing-sidecar.mjs';
import { taskIdKey } from '../../../lib/plan-task-id.mjs';
import { encodeProjectDir } from '../../../lib/session-file-reader.mjs';
import { loadConfiguredSensitivePaths } from '../../../lib/cli/test-policy.mjs';
import { matchGlob } from '../../../lib/test-strategies/manifest.mjs';
import { effectiveSensitivePaths } from '../../../lib/test-strategies/sensitive-paths.mjs';
import { readTaskFiles } from '../../../lib/test-strategies/task-files.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..');
const DEFAULT_RESULTS_DIR = join(HERE, 'results');
const SANDBOX_PROBES = '.ev1-probes';

export function fixtureDescriptor({ id, dir, stem, module: mod, branch, reviewFile = null }) {
  const specDir = `.context-index/specs/features/${mod}`;
  return {
    id,
    dir,
    seed: join(dir, 'seed'),
    stem,
    specPath: join(dir, `${stem}.spec.md`),
    planPath: join(dir, `${stem}.plan.md`),
    specDir,
    sandboxSpec: `${specDir}/${stem}.spec.md`,
    sandboxPlan: `${specDir}/${stem}.plan.md`,
    reviewFile,
    branch,
  };
}

export const EV1_FIXTURE = fixtureDescriptor({
  id: 'ev1',
  dir: join(HERE, 'fixture'),
  stem: 'example',
  module: 'example',
  branch: 'eval/rigor-ladder',
});

const FIXTURE_NAMES = ['ev1', 'nonconvergent'];
const PROBES = join(EV1_FIXTURE.dir, 'probes');
const FIXTURE_README = join(EV1_FIXTURE.dir, 'README.md');

// `live: false` would keep an arm in the dry-run plan while runLive refuses it
// with ARM_NOT_AVAILABLE.
const ARMS = [
  { id: 'full', implementArgs: ['--tier full'], live: true },
  { id: 'quick', implementArgs: [], live: true },
  { id: 'lite', implementArgs: ['--lite'], live: true },
];

export const THRESHOLDS = Object.freeze({
  lite_wall_clock_vs_full: 0.5,
  quick_wall_clock_vs_full: 0.8,
  lite_escaped_defects_max_over_full: 1,
});
const MIN_RUNS_PER_ARM = 3;
const BASELINE_REF = 'main';
const BASELINE_FILE = /^baseline-main-\d{4}-\d{2}-\d{2}\.json$/;

const REUSES = ['lib/parallel/eval/divergence.mjs#judge', 'lib/parallel/eval/report.mjs#renderReport'];

const TOKEN_FIELDS = ['input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens'];
const DISPATCH_TOOLS = ['Agent', 'Task'];
const CAUGHT_AT = ['implement', 'validate', 'escaped'];
const QUALITY_GATE = ['npm', 'test'];
const CLAUDE_TIMEOUT_MS = 90 * 60 * 1000;

const METRICS = {
  wall_clock_ms: {
    source: 'lifecycle-event-timestamps',
    from: 'latest implement lifecycle_step started',
    to: 'the implement step_completed or step_failed after it',
  },
  agent_dispatches: { source: 'session-jsonl', tool_use_names: DISPATCH_TOOLS, includes: 'main session and subagents' },
  tokens: {
    source: 'session-jsonl message.usage',
    fields: TOKEN_FIELDS,
    includes: 'main session and subagents',
    dedup: 'one usage per message.id per transcript, last row wins (Claude Code writes one row per content block)',
  },
  quality_gates: { command: QUALITY_GATE.join(' '), cwd: 'sandbox', when: 'after implement' },
  defects: {
    caught_at: CAUGHT_AT,
    meaning: {
      implement: 'probe passes after /adev:implement',
      validate: 'probe failed after implement and passes after /adev:validate ran',
      escaped: 'probe still fails after /adev:validate ran',
    },
    probe: `node --test ${SANDBOX_PROBES}/<probe>`,
  },
  review_depths: {
    source: 'review_depth_resolved events after the latest implement started',
    keyed_by: 'task number, latest event per pass',
  },
  validity: {
    invalid_when: ['implement-exit-nonzero', 'implement-verdict-not-pass', 'no-task-commits', 'no-session-id', 'no-transcripts'],
    note: 'invalid runs are written with valid: false and excluded from the determinism report and the thresholds',
  },
};

const TASK_HEADING = /^#{2,4}\s+Task\s+(\d+)\b:?\s*(.*)$/;
const FENCE_LINE = /^\s*(`{3,}|~{3,})/;
const FILES_FIELD = /^\s*(?:[-*]\s+)?\*\*(Files|Tests):\*\*/;
const SUB_BULLET = /^\s*[-*]\s+/;
const BACKTICK_SRC_PATH = /`(src\/[^`\s]+\.[A-Za-z0-9]+)`/g;

export class HarnessError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.code = code;
  }
}

function planTaskRegions(planText) {
  const regions = [];
  let current = null;
  let inFence = false;
  for (const line of planText.split('\n')) {
    if (FENCE_LINE.test(line)) inFence = !inFence;
    const m = inFence ? null : TASK_HEADING.exec(line);
    if (m) {
      current = { id: m[1], title: m[2].replace(/\s*\[specialist:[^\]]*\]\s*$/, ''), lines: [] };
      regions.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }
  return regions;
}

// The Files/Tests field lines are where paths are declared; every other line
// of the task body is prose, and a `src/` path named only there is one the task
// must touch without declaring it.
function proseLines(lines) {
  const out = [];
  let inField = false;
  for (const line of lines) {
    if (FILES_FIELD.test(line)) {
      inField = true;
      continue;
    }
    if (inField && SUB_BULLET.test(line) && !/^\s*(?:[-*]\s+)?\*\*/.test(line)) continue;
    inField = false;
    out.push(line);
  }
  return out;
}

export function specRiskLevel(specText) {
  const fm = /^---\n([\s\S]*?)\n---/.exec(specText);
  const m = fm ? /^risk_level:\s*(\S+)\s*$/m.exec(fm[1]) : null;
  return m ? m[1] : null;
}

function readSeededDefects() {
  const text = readFileSync(FIXTURE_README, 'utf8');
  const section = /^## Seeded defects\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(text);
  if (!section) throw new HarnessError('FIXTURE_INVALID', 'fixture/README.md has no "## Seeded defects" section');
  const defects = [];
  for (const line of section[1].split('\n')) {
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length !== 5 || !/^D\d+$/.test(cells[0])) continue;
    const probe = /`probes\/([^`]+)`/.exec(cells[4])?.[1];
    if (!probe || !existsSync(join(PROBES, probe))) {
      throw new HarnessError('FIXTURE_INVALID', `defect ${cells[0]} names no existing probe under fixture/probes/`);
    }
    defects.push({ id: cells[0], task: cells[1], kind: cells[2], probe });
  }
  return defects;
}

/**
 * Classifies every task of a fixture plan from the plan, the sidecar, the
 * spec's risk level and the seed's sensitive-path configuration. Route's easy
 * rule is the shipped liteEligible().
 */
export async function classifyTasks(fixture) {
  const planText = readFileSync(fixture.planPath, 'utf8');
  const highRisk = specRiskLevel(readFileSync(fixture.specPath, 'utf8')) === 'high';
  const sensitiveGlobs = effectiveSensitivePaths(loadConfiguredSensitivePaths(fixture.seed));

  const tasks = [];
  for (const region of planTaskRegions(planText)) {
    const { targetPaths: declared } = await readTaskFiles(fixture.planPath, region.id);
    const entry = lookupRoutingEntry(fixture.planPath, region.id);
    const eligible = liteEligible(entry).eligible;
    const sensitive = declared.filter((p) => sensitiveGlobs.some((g) => matchGlob(g, p)));
    const undeclared = [
      ...new Set(Array.from(proseLines(region.lines).join('\n').matchAll(BACKTICK_SRC_PATH), (m) => m[1])),
    ].filter((p) => !declared.includes(p));

    let role;
    if (sensitive.length > 0) role = 'sensitive-path';
    else if (entry.selected_agent !== 'auto-agent') role = entry.selected_agent;
    else if (!eligible) role = 'low-score';
    else if (undeclared.length > 0) role = 'tripwire-target';
    else role = 'lite-eligible';

    const provisional = sensitive.length > 0 || entry.selected_agent === 'human-only'
      ? 'full'
      : eligible && !highRisk ? 'lite' : 'quick';
    const expectedFinal = provisional === 'lite' && undeclared.length > 0 ? 'quick' : provisional;

    tasks.push({
      id: region.id,
      title: region.title,
      selected_agent: entry.selected_agent,
      routeEligible: eligible,
      declared,
      role,
      ...(sensitive.length > 0 ? { sensitive } : {}),
      ...(undeclared.length > 0 ? { undeclared } : {}),
      liteArm: { provisional, expectedFinal },
    });
  }
  return tasks;
}

export async function describeFixture() {
  const tasks = await classifyTasks(EV1_FIXTURE);

  // liteEligible counts tasks expected to FINISH at lite under --lite, so the
  // tripwire target (granted lite provisionally, escalated at the final pass)
  // is ineligible here but counted in routeEligible.
  const liteEligibleCount = tasks.filter((t) => t.liteArm.expectedFinal === 'lite').length;
  const sensitiveTask = tasks.find((t) => t.role === 'sensitive-path');
  const tripwireTask = tasks.find((t) => t.role === 'tripwire-target');
  return {
    plan: relative(REPO_ROOT, EV1_FIXTURE.planPath),
    sidecar: relative(REPO_ROOT, sidecarPathFor(EV1_FIXTURE.planPath)),
    specRiskLevel: specRiskLevel(readFileSync(EV1_FIXTURE.specPath, 'utf8')),
    tasks: tasks.length,
    liteEligible: liteEligibleCount,
    liteIneligible: tasks.length - liteEligibleCount,
    routeEligible: tasks.filter((t) => t.routeEligible).length,
    counts: {
      liteEligible: 'tasks expected to finish at lite under the lite arm',
      routeEligible: "tasks passing route's easy rule (liteEligible: auto-agent, every score in [0.6, 1]), before floors and the tripwire",
    },
    sensitivePathTask: sensitiveTask ? { task: sensitiveTask.id, paths: sensitiveTask.sensitive } : null,
    tripwireTargetTask: tripwireTask ? { task: tripwireTask.id, undeclared: tripwireTask.undeclared } : null,
    seededDefects: readSeededDefects(),
    taskRoles: tasks,
  };
}

export async function planDryRun({ ref = 'HEAD', runs = 3 } = {}) {
  return {
    arms: ARMS.map((a) => ({ ...a, prompt: implementPrompt(a) })),
    ref,
    runs,
    fixture: await describeFixture(),
    metrics: METRICS,
    thresholds: THRESHOLDS,
    minRunsPerArm: MIN_RUNS_PER_ARM,
    baseline: {
      ref: BASELINE_REF,
      file: 'results/baseline-main-<date>.json',
      writtenBy: `--arm full with a --ref that resolves to ${BASELINE_REF}'s commit`,
      overwrite: 'refused (BASELINE_EXISTS) unless --rebaseline',
    },
    reuses: REUSES,
    liveOutput: 'results/<arm>-<ref-short>-<iso>.json',
    writes: [],
  };
}

// A headless `claude -p` run has no operator to answer a checkpoint, so without
// this every arm stops at the first assisted-agent task. It must stay identical
// across arms and name no review depth, or it would bias the comparison. The
// slash command stays alone on the first line so /adev:implement parses its
// arguments from that line only.
const OPERATOR_STATEMENT = [
  'This is an unattended evaluation run.',
  'The operator pre-approves every assisted-agent checkpoint in this plan (the review of the failing RED tests before any production code is written)',
  'and every task or gate marked REQUIRES HUMAN APPROVAL, so continue past each one without stopping.',
  'Implement every plan task; if a task looks already implemented, do not skip it.',
  'Do not wait for input.',
].join(' ');

export function implementPrompt(arm) {
  const command = ['/adev:implement', EV1_FIXTURE.sandboxPlan, ...arm.implementArgs].join(' ');
  return `${command}\n\n${OPERATOR_STATEMENT}`;
}

function parseArgs(argv) {
  const opts = {
    dryRun: false,
    evaluate: false,
    rebaseline: false,
    arm: null,
    ref: 'HEAD',
    refExplicit: false,
    runs: 3,
    fixture: 'ev1',
    mode: null,
    caseId: null,
    resultsDir: DEFAULT_RESULTS_DIR,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--evaluate') opts.evaluate = true;
    else if (a === '--rebaseline') opts.rebaseline = true;
    else if (a === '--arm') opts.arm = argv[++i];
    else if (a === '--ref') {
      opts.ref = argv[++i];
      opts.refExplicit = true;
    }
    else if (a === '--runs') opts.runs = Number(argv[++i]);
    else if (a === '--fixture') opts.fixture = argv[++i];
    else if (a === '--mode') opts.mode = argv[++i];
    else if (a === '--case') opts.caseId = argv[++i];
    else if (a === '--results-dir') opts.resultsDir = resolve(argv[++i] ?? '');
    else throw new HarnessError('USAGE', `unknown argument '${a}'`);
  }
  if (!Number.isInteger(opts.runs) || opts.runs < 1) {
    throw new HarnessError('USAGE', '--runs must be an integer >= 1');
  }
  if (typeof opts.ref !== 'string' || opts.ref === '' || opts.ref.startsWith('-')) {
    throw new HarnessError('USAGE', '--ref must be a git ref that does not begin with "-"');
  }
  if (!FIXTURE_NAMES.includes(opts.fixture)) {
    throw new HarnessError('USAGE', `--fixture must be one of ${FIXTURE_NAMES.join('|')}`);
  }
  return opts;
}

function checkNonconvergentArgs(opts, modes) {
  if (opts.mode !== null && !modes.includes(opts.mode)) {
    throw new HarnessError('USAGE', `--mode must be one of ${modes.join('|')}`);
  }
  if (!opts.dryRun && opts.mode === null) {
    throw new HarnessError('USAGE', `--fixture nonconvergent needs --mode ${modes.join('|')}`);
  }
}

function git(cwd, args, opts = {}) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
}

export function resolveRef(ref) {
  try {
    return git(REPO_ROOT, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]);
  } catch {
    throw new HarnessError('INVALID_REF', `'${ref}' does not resolve to a commit`);
  }
}

export function requireClaudeCli() {
  const r = spawnSync('claude', ['--version'], { encoding: 'utf8' });
  if (r.error || r.status !== 0) {
    throw new HarnessError('CLAUDE_CLI_MISSING', 'the live run needs an installed, authenticated `claude` CLI');
  }
}

// The harness is usually launched from inside a Claude Code session. Inherited
// identity variables would tag every trial as that session's child, whose
// `adev` calls the wrapper then gates behind approval even under
// --dangerously-skip-permissions. PATH, HOME and the rest must survive.
const SESSION_IDENTITY_ENV_KEYS = [
  'CLAUDE_CODE_CHILD_SESSION', 'CLAUDE_CODE_MESSAGING_SOCKET', 'CLAUDE_CODE_SESSION_ID',
  'CLAUDE_PID', 'CLAUDECODE', 'CLAUDE_CODE_EXECPATH', 'AI_AGENT',
  'CMUX_CLAUDE_PID', 'CMUX_AGENT_LAUNCH_KIND', 'CMUX_AGENT_LAUNCH_EXECUTABLE',
  'CMUX_CLAUDE_WRAPPER_SHIM', 'CMUX_CLAUDE_WRAPPER_SHIM_ROOT', 'CMUX_CLAUDE_HOOK_CMUX_BIN',
];

export function createShim(pluginRoot) {
  const bin = mkdtempSync(join(tmpdir(), 'adev-ev1-bin-'));
  const shim = join(bin, 'adev');
  writeFileSync(
    shim,
    `#!/bin/sh\nADEV_ROOT=${JSON.stringify(pluginRoot)} exec node ${JSON.stringify(join(pluginRoot, 'cli', 'index.mjs'))} "$@"\n`,
  );
  chmodSync(shim, 0o755);
  return { bin, shim };
}

// claude takes its working directory from PWD, which spawnSync's `cwd` does
// not reset. SHELL=/bin/bash keeps an rc-defined `adev` function (copied into
// Claude Code's shell snapshot, where it beats PATH) from shadowing the shim.
function trialEnv({ pluginRoot, bin, cwd }) {
  const env = { ...process.env, CLAUDE_CODE_ENTRYPOINT: 'cli' };
  for (const key of SESSION_IDENTITY_ENV_KEYS) delete env[key];
  env.PWD = cwd;
  env.SHELL = '/bin/bash';
  env.ADEV_ROOT = pluginRoot;
  env.PATH = `${bin}:${process.env.PATH}`;
  return env;
}

function assertArmCli({ pluginRoot, bin, shim }) {
  const cwd = realpathSync(tmpdir());
  const r = spawnSync('/bin/bash', ['-lc', 'command -v adev && adev help >/dev/null'], {
    cwd,
    env: trialEnv({ pluginRoot, bin, cwd }),
    encoding: 'utf8',
  });
  const resolved = (r.stdout || '').trim().split('\n')[0] ?? '';
  if (r.status !== 0 || resolved !== shim) {
    throw new HarnessError(
      'ARM_CLI_UNRESOLVED',
      `a trial shell resolves adev to ${JSON.stringify(resolved)}, expected ${shim} (stderr: ${(r.stderr || '').trim().slice(0, 200)})`,
    );
  }
}

function reportStepPair(root, env, specPath, step) {
  for (const status of [['--status', 'started'], ['--status', 'completed', '--verdict', 'PASS']]) {
    execFileSync('adev', ['report', '--type', 'step', '--spec', specPath, '--step', step, ...status], {
      cwd: root,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }
}

/**
 * A fresh sandbox git repository holding the fixture's seed, spec, plan and
 * routing sidecar, with the lifecycle steps implement's gate needs recorded
 * and committed. The sidecar is committed at the plan's sidecarPathFor() path:
 * lite is granted only from a sidecar committed at run_base, which
 * check-flags captures as this HEAD.
 *
 * `withReview` adds the fixture's PASS review and its step pair, which the
 * `/adev:build` Implement Pipeline requires. Each `preseed` task id is
 * committed from `preseed/task-<id>/` with its `Spec:`/`Plan-task:` trailers
 * and marked `done`; those shas are returned as `earlierCommits`. `runBase` is
 * the final HEAD, the commit check-flags will capture.
 */
export function prepareSandbox({ pluginRoot, bin, fixture = EV1_FIXTURE, preseed = [], withReview = false }) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), `adev-ev1-${fixture.id}-sandbox-`)));
  try {
    const env = trialEnv({ pluginRoot, bin, cwd: root });
    cpSync(fixture.seed, root, { recursive: true });
    mkdirSync(join(root, fixture.specDir), { recursive: true });
    cpSync(fixture.specPath, join(root, fixture.sandboxSpec));
    cpSync(fixture.planPath, join(root, fixture.sandboxPlan));
    const sidecar = sidecarPathFor(fixture.sandboxPlan);
    cpSync(sidecarPathFor(fixture.planPath), join(root, sidecar));
    if (withReview && fixture.reviewFile) {
      const reviewText = readFileSync(join(fixture.dir, fixture.reviewFile), 'utf8');
      const fileSha = createHash('sha256').update(readFileSync(fixture.specPath)).digest('hex');
      writeFileSync(
        join(root, fixture.specDir, fixture.reviewFile),
        reviewText.replace(/^reviewed:/m, `file-sha: ${fileSha}\nreviewed:`),
      );
    }
    git(root, ['init', '-q', '-b', fixture.branch]);
    git(root, ['config', 'user.name', 'adev-ev1']);
    git(root, ['config', 'user.email', 'adev-ev1@localhost']);
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'seed']);

    // /adev:implement's gate requires a passing plan step; the fixture plan is
    // pre-authored, so the step pair is recorded through the ref's own CLI.
    if (withReview && fixture.reviewFile) reportStepPair(root, env, fixture.sandboxSpec, 'review');
    reportStepPair(root, env, fixture.sandboxSpec, 'plan');
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'record plan step']);

    const earlierCommits = [];
    for (const taskId of preseed) {
      cpSync(join(fixture.dir, 'preseed', `task-${taskId}`), root, { recursive: true });
      git(root, ['add', '-A']);
      git(root, ['commit', '-q', '-m', `feat: preseeded task ${taskId}`, '-m', `Spec: ${fixture.sandboxSpec}\nPlan-task: ${taskId}`]);
      earlierCommits.push(git(root, ['rev-parse', 'HEAD']));
      for (const status of ['in_progress', 'done']) {
        execFileSync('adev', [
          'report', '--type', 'plan-task', '--spec', fixture.sandboxSpec, '--plan', fixture.sandboxPlan,
          '--task-id', taskId, '--status', status,
        ], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
      }
      git(root, ['add', '-A']);
      git(root, ['commit', '-q', '-m', `record task ${taskId} done`]);
    }

    const runBase = git(root, ['rev-parse', 'HEAD']);
    if (spawnSync('git', ['cat-file', '-e', `${runBase}:${sidecar}`], { cwd: root }).status !== 0) {
      throw new HarnessError('SANDBOX_INVALID', `${sidecar} is not committed at ${runBase}; every task would be denied lite`);
    }
    return { root, env, runBase, earlierCommits };
  } catch (err) {
    rmSync(root, { recursive: true, force: true });
    throw err;
  }
}

export function runClaude(sandbox, pluginRoot, prompt) {
  const started = Date.now();
  const r = spawnSync(
    'claude',
    ['--print', '--output-format', 'json', '--dangerously-skip-permissions', '--plugin-dir', pluginRoot, '-p', prompt],
    {
      cwd: sandbox.root,
      env: sandbox.env,
      encoding: 'utf8',
      timeout: CLAUDE_TIMEOUT_MS,
      killSignal: 'SIGKILL',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  let parsed = null;
  try {
    parsed = JSON.parse(r.stdout);
  } catch {
    parsed = null;
  }
  return {
    prompt,
    exitCode: r.status,
    sessionId: parsed?.session_id ?? null,
    resultText: typeof parsed?.result === 'string' ? parsed.result : '',
    timedOut: r.error?.code === 'ETIMEDOUT' || r.signal === 'SIGKILL',
    processMs: Date.now() - started,
  };
}

export function readJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

/**
 * The session's main transcript plus its subagent transcripts, under
 * `<configDir>/projects/`. Claude Code honors CLAUDE_CONFIG_DIR, so the default
 * follows it. Both project-key encodings are tried: every non-alphanumeric
 * character to `-`, and the `/`+`.` form of lib/session-file-reader.mjs.
 */
export function sessionTranscriptPaths(sessionId, projectDir, { configDir = defaultConfigDir() } = {}) {
  if (!sessionId) return [];
  const projectsRoot = join(configDir, 'projects');
  const keys = [...new Set([projectDir.replace(/[^a-zA-Z0-9]/g, '-'), encodeProjectDir(projectDir)])];
  for (const key of keys) {
    const main = join(projectsRoot, key, `${sessionId}.jsonl`);
    if (!existsSync(main)) continue;
    const subDir = join(projectsRoot, key, sessionId, 'subagents');
    const subs = existsSync(subDir)
      ? readdirSync(subDir).filter((f) => f.endsWith('.jsonl')).sort().map((f) => join(subDir, f))
      : [];
    return [main, ...subs];
  }
  return [];
}

function defaultConfigDir() {
  return process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
}

/**
 * Sums token usage and Agent/Task dispatches over transcript files. Claude
 * Code writes one row per content block of an assistant message, each
 * repeating that message's usage, so within a file usage is kept once per
 * message.id (the last row wins) and tool_use blocks once per block id.
 */
export function transcriptUsage(paths) {
  const tokens = Object.fromEntries(TOKEN_FIELDS.map((f) => [f, 0]));
  let agentDispatches = 0;
  let transcripts = 0;
  for (const file of paths) {
    const rows = readJsonl(file);
    if (rows.length === 0) continue;
    transcripts++;
    const usageByMessage = new Map();
    const dispatchIds = new Set();
    rows.forEach((row, i) => {
      if (row.type !== 'assistant' || !row.message) return;
      if (row.message.usage) usageByMessage.set(row.message.id ?? `row-${i}`, row.message.usage);
      for (const block of row.message.content ?? []) {
        if (block?.type === 'tool_use' && DISPATCH_TOOLS.includes(block.name)) dispatchIds.add(block.id ?? `row-${i}`);
      }
    });
    for (const usage of usageByMessage.values()) {
      for (const f of TOKEN_FIELDS) tokens[f] += usage[f] ?? 0;
    }
    agentDispatches += dispatchIds.size;
  }
  return { tokens, agentDispatches, transcripts };
}

function rowTexts(row) {
  const content = row?.message?.content;
  if (typeof content === 'string') return [content];
  if (!Array.isArray(content)) return [];
  const out = [];
  for (const block of content) {
    if (block?.type === 'text' && typeof block.text === 'string') out.push(block.text);
    else if (block?.type === 'tool_result') {
      if (typeof block.content === 'string') out.push(block.content);
      else if (Array.isArray(block.content)) {
        for (const inner of block.content) if (inner?.type === 'text' && typeof inner.text === 'string') out.push(inner.text);
      }
    }
  }
  return out;
}

/**
 * Every `STEP_RESULT:` block in the transcripts, in file then row order, with
 * its `status` and the text that carried it. A build step's result reaches
 * the build session as an Agent tool result, so tool results are read too.
 */
export function stepResults(paths) {
  const out = [];
  for (const file of paths) {
    for (const row of readJsonl(file)) {
      for (const text of rowTexts(row)) {
        for (const m of text.matchAll(/STEP_RESULT:\s*\n\s*status:\s*([A-Z_]+)/g)) out.push({ status: m[1], text });
      }
    }
  }
  return out;
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// The session writer's final flush can land a beat after `claude` exits, so a
// read straight after the spawn can see no transcript yet.
export function awaitTranscripts(sessionId, projectDir, { timeoutMs = 5000, pollMs = 250 } = {}) {
  const deadline = Date.now() + timeoutMs;
  if (!sessionId) return [];
  while (true) {
    const paths = sessionTranscriptPaths(sessionId, projectDir);
    if (paths.length > 0 || Date.now() >= deadline) return paths;
    sleepMs(pollMs);
  }
}

function sessionUsage(sessionId, projectDir) {
  return transcriptUsage(awaitTranscripts(sessionId, projectDir));
}

/**
 * A run counts only when implement exited cleanly with a PASS verdict, made at
 * least one commit after the seed, and left a transcript to measure.
 */
export function classifyRun({ exitCode, verdict, taskCommits, sessionId, transcripts }) {
  const reasons = [];
  if (exitCode !== 0) reasons.push('implement-exit-nonzero');
  if (verdict !== 'PASS') reasons.push('implement-verdict-not-pass');
  if (!(taskCommits > 0)) reasons.push('no-task-commits');
  if (!sessionId) reasons.push('no-session-id');
  else if (!(transcripts > 0)) reasons.push('no-transcripts');
  return { valid: reasons.length === 0, reasons };
}

export function lifecycleEvents(projectDir, fixture) {
  return readJsonl(join(projectDir, '.context-index', 'lifecycle-state', `${fixture.stem}.jsonl`));
}

export function eventsSinceImplementStart(events) {
  const startIdx = events.findLastIndex(
    (e) => e.event === 'lifecycle_step' && e.step === 'implement' && e.status === 'started',
  );
  return startIdx === -1 ? events : events.slice(startIdx + 1);
}

function implementWallClock(events) {
  const startIdx = events.findLastIndex(
    (e) => e.event === 'lifecycle_step' && e.step === 'implement' && e.status === 'started',
  );
  if (startIdx === -1) return { wallClockMs: null, verdict: null };
  const end = events
    .slice(startIdx + 1)
    .find((e) => (e.event === 'step_completed' || e.event === 'step_failed') && e.step === 'implement');
  if (!end) return { wallClockMs: null, verdict: null };
  return { wallClockMs: Date.parse(end.ts) - Date.parse(events[startIdx].ts), verdict: end.verdict ?? null };
}

/**
 * The latest `review_depth_resolved` per task and pass, keyed by the task
 * number so `7`, `t7` and `task-7` are one task.
 */
export function reviewDepthsFromEvents(events) {
  const out = {};
  for (const e of events) {
    if (e?.event !== 'review_depth_resolved') continue;
    const key = taskIdKey(e.task_id);
    if (!key) continue;
    out[key] = { ...out[key], [e.pass]: { depth: e.depth, source: e.source } };
  }
  return out;
}

function runQualityGates(sandbox) {
  const r = spawnSync(QUALITY_GATE[0], QUALITY_GATE.slice(1), { cwd: sandbox.root, env: sandbox.env, encoding: 'utf8' });
  return { command: QUALITY_GATE.join(' '), exit_code: r.status, pass: r.status === 0 };
}

function probeResults(sandbox, defects, ids) {
  const dir = join(sandbox.root, SANDBOX_PROBES);
  mkdirSync(dir, { recursive: true });
  const out = {};
  try {
    for (const d of defects.filter((x) => ids.includes(x.id))) {
      cpSync(join(PROBES, d.probe), join(dir, d.probe));
      const r = spawnSync('node', ['--test', join(SANDBOX_PROBES, d.probe)], { cwd: sandbox.root, encoding: 'utf8' });
      out[d.id] = r.status === 0 ? 'pass' : 'fail';
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return out;
}

function srcSurface(projectDir) {
  const out = [];
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(relative(projectDir, p));
    }
  };
  walk(join(projectDir, 'src'));
  return out.sort();
}

function liveRun({ arm, pluginRoot, bin, refSha, refName, runIndex, fixture }) {
  const sandbox = prepareSandbox({ pluginRoot, bin, fixture: EV1_FIXTURE });
  try {
    const implement = runClaude(sandbox, pluginRoot, implementPrompt(arm));
    const implUsage = sessionUsage(implement.sessionId, sandbox.root);
    const events = lifecycleEvents(sandbox.root, EV1_FIXTURE);
    const { wallClockMs, verdict } = implementWallClock(events);
    const taskCommits = Number(git(sandbox.root, ['rev-list', '--count', `${sandbox.runBase}..HEAD`]));
    const validity = classifyRun({
      exitCode: implement.exitCode,
      verdict,
      taskCommits,
      sessionId: implement.sessionId,
      transcripts: implUsage.transcripts,
    });
    const qualityGates = runQualityGates(sandbox);
    const touched = git(sandbox.root, ['diff', '--name-only', sandbox.runBase, 'HEAD']).split('\n').filter(Boolean);

    const defectIds = fixture.seededDefects.map((d) => d.id);
    const afterImplement = probeResults(sandbox, fixture.seededDefects, defectIds);
    const missed = defectIds.filter((id) => afterImplement[id] !== 'pass');
    let validate = null;
    let afterValidate = {};
    if (validity.valid && missed.length > 0) {
      const v = runClaude(sandbox, pluginRoot, `/adev:validate --spec ${EV1_FIXTURE.sandboxSpec}`);
      validate = { ...v, ...sessionUsage(v.sessionId, sandbox.root) };
      afterValidate = probeResults(sandbox, fixture.seededDefects, missed);
    }
    const defects = fixture.seededDefects.map((d) => ({
      ...d,
      caught_at: afterImplement[d.id] === 'pass' ? 'implement' : afterValidate[d.id] === 'pass' ? 'validate' : 'escaped',
    }));

    return {
      arm: arm.id,
      implementArgs: arm.implementArgs,
      ref: refSha,
      ref_name: refName,
      run: runIndex,
      finished_at: new Date().toISOString(),
      valid: validity.valid,
      invalid_reasons: validity.reasons,
      implement: {
        exit_code: implement.exitCode,
        session_id: implement.sessionId,
        verdict,
        process_ms: implement.processMs,
        task_commits: taskCommits,
        transcripts: implUsage.transcripts,
      },
      metrics: {
        wall_clock_ms: wallClockMs,
        agent_dispatches: implUsage.agentDispatches,
        tokens: implUsage.tokens,
        quality_gates: qualityGates,
        defects,
      },
      review_depths: reviewDepthsFromEvents(eventsSinceImplementStart(events)),
      validate: validate && {
        exit_code: validate.exitCode,
        session_id: validate.sessionId,
        process_ms: validate.processMs,
        transcripts: validate.transcripts,
        agent_dispatches: validate.agentDispatches,
        tokens: validate.tokens,
      },
      tripwire_target: fixture.tripwireTargetTask && {
        task: fixture.tripwireTargetTask.task,
        undeclared_touched: fixture.tripwireTargetTask.undeclared.filter((p) => touched.includes(p)),
      },
      touched_files: touched,
      behavior: { tests: afterImplement, surface: srcSurface(sandbox.root) },
    };
  } finally {
    rmSync(sandbox.root, { recursive: true, force: true });
  }
}

function armSignal(result) {
  return {
    tests: result.behavior.tests,
    surface: result.behavior.surface,
    wallClockMs: result.metrics.wall_clock_ms ?? result.implement.process_ms,
    tokens: Object.values(result.metrics.tokens).reduce((a, b) => a + b, 0),
  };
}

function determinismReport(results) {
  if (results.length < 2) return null;
  const arms = {
    serialA: armSignal(results[0]),
    serialB: armSignal(results[1]),
    parallel: armSignal(results[results.length - 1]),
  };
  const verdict = judge(arms);
  return renderReport({
    date: new Date().toISOString().slice(0, 10),
    arms,
    verdict: verdict.verdict,
    divergence_kind: verdict.divergence_kind,
    d_ctrl: verdict.d_ctrl,
    d_par: verdict.d_par,
    overlapOk: true,
    orphaned: { worktrees: [], branches: [], lock: false },
    implDiffSummary: null,
  });
}

function median(values) {
  const xs = values.filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 === 1 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

const escapedCount = (r) => (r.metrics?.defects ?? []).filter((d) => d.caught_at === 'escaped').length;
const round4 = (x) => Math.round(x * 1e4) / 1e4;

/**
 * One arm's medians, over its valid runs, and its quality-gate result, over
 * every run: an invalid run is excluded from the timing comparison, but a run
 * whose gates failed, or whose implement verdict was FAIL, still fails EV-1's
 * "quality gates pass in every run".
 */
export function summarizeArm(results) {
  const valid = results.filter((r) => r.valid);
  return {
    runs: results.length,
    valid_runs: valid.length,
    invalid_runs: results.length - valid.length,
    median_wall_clock_ms: median(valid.map((r) => r.metrics?.wall_clock_ms)),
    median_escaped_defects: median(valid.map(escapedCount)),
    quality_gates_pass_all:
      results.length > 0 &&
      results.every((r) => r.metrics?.quality_gates?.pass === true && r.implement?.verdict !== 'FAIL'),
  };
}

/**
 * The EV-1 release thresholds, each as one check, against the `main`
 * baseline summary. Ratios are median wall clock over the baseline's median;
 * escaped defects compare medians; both use valid runs only. A check whose
 * arm has no valid runs fails with `reason: 'no-runs'`.
 */
export function evaluateThresholds({ baseline, arms, fixture }) {
  const quick = arms.quick ?? [];
  const lite = arms.lite ?? [];
  const quickSummary = summarizeArm(quick);
  const liteSummary = summarizeArm(lite);
  const validLite = lite.filter((r) => r.valid);
  const checks = [];
  const add = (id, observed, pass, limit, reason, extra = {}) =>
    checks.push({ id, pass, observed, limit, ...(reason ? { reason } : {}), ...extra });

  add('baseline_runs', baseline.valid_runs, baseline.valid_runs >= MIN_RUNS_PER_ARM, `>= ${MIN_RUNS_PER_ARM}`);
  add('quick_runs', quickSummary.valid_runs, quickSummary.valid_runs >= MIN_RUNS_PER_ARM, `>= ${MIN_RUNS_PER_ARM}`);
  add('lite_runs', liteSummary.valid_runs, liteSummary.valid_runs >= MIN_RUNS_PER_ARM, `>= ${MIN_RUNS_PER_ARM}`);

  const ratio = (s) =>
    s.median_wall_clock_ms === null || !baseline.median_wall_clock_ms ? null : round4(s.median_wall_clock_ms / baseline.median_wall_clock_ms);
  for (const [id, summary, limit] of [
    ['quick_wall_clock_vs_full', quickSummary, THRESHOLDS.quick_wall_clock_vs_full],
    ['lite_wall_clock_vs_full', liteSummary, THRESHOLDS.lite_wall_clock_vs_full],
  ]) {
    const r = ratio(summary);
    add(id, r, r !== null && r <= limit, `<= ${limit}`, summary.valid_runs === 0 ? 'no-runs' : undefined);
  }

  const escapedLimit = baseline.median_escaped_defects === null
    ? null
    : baseline.median_escaped_defects + THRESHOLDS.lite_escaped_defects_max_over_full;
  add(
    'lite_escaped_defects',
    liteSummary.median_escaped_defects,
    liteSummary.median_escaped_defects !== null && escapedLimit !== null && liteSummary.median_escaped_defects <= escapedLimit,
    `<= ${escapedLimit}`,
    liteSummary.valid_runs === 0 ? 'no-runs' : undefined,
  );

  const gatesAll = baseline.quality_gates_pass_all === true && quickSummary.quality_gates_pass_all && liteSummary.quality_gates_pass_all;
  add('quality_gates_every_run', gatesAll, gatesAll, 'true in every baseline, quick and lite run, valid or not', undefined, {
    invalid_runs: { baseline: baseline.invalid_runs ?? 0, quick: quickSummary.invalid_runs, lite: liteSummary.invalid_runs },
  });

  const target = fixture?.tripwireTargetTask?.task ?? null;
  const fires = validLite.length > 0 && target !== null &&
    validLite.every((r) => r.review_depths?.[taskIdKey(target)]?.final?.source === 'lite-tripwire');
  add('tripwire_fires_every_lite_run', fires, fires, `task ${target} final source lite-tripwire`, validLite.length === 0 ? 'no-runs' : undefined);

  // A task with no provisional event was never resolved, so the run cannot
  // show it was denied lite; that counts against the check, not for it.
  const ineligible = (fixture?.taskRoles ?? [])
    .filter((t) => t.role !== 'lite-eligible' && t.role !== 'tripwire-target')
    .map((t) => taskIdKey(t.id));
  const missing = new Set();
  let liteSeen = false;
  for (const r of validLite) {
    for (const k of ineligible) {
      const d = r.review_depths?.[k];
      if (!d?.provisional) missing.add(k);
      else if (d.provisional.depth === 'lite' || d.final?.depth === 'lite') liteSeen = true;
    }
  }
  const noLite = validLite.length > 0 && missing.size === 0 && !liteSeen;
  add(
    'no_lite_grant_on_ineligible',
    noLite,
    noLite,
    `a provisional event, and no lite on either pass, for tasks ${ineligible.join(', ')}`,
    validLite.length === 0 ? 'no-runs' : undefined,
    { missing_provisional: [...missing].sort() },
  );

  return {
    thresholds: THRESHOLDS,
    baseline,
    arms: { quick: quickSummary, lite: liteSummary },
    checks,
    pass: checks.every((c) => c.pass),
  };
}

function baselineFiles(resultsDir) {
  if (!existsSync(resultsDir)) return [];
  return readdirSync(resultsDir).filter((f) => BASELINE_FILE.test(f)).sort();
}

/**
 * Refuses, before any live run, to record a new `main` baseline over one
 * already in `resultsDir`: the recorded one is the pre-implementation
 * measurement every threshold is a ratio against. `rebaseline` is the
 * operator's explicit override; the newer file then becomes the latest.
 */
export function assertBaselineWritable(resultsDir, { rebaseline = false } = {}) {
  const existing = baselineFiles(resultsDir);
  if (existing.length > 0 && rebaseline !== true) {
    throw new HarnessError(
      'BASELINE_EXISTS',
      `${existing[existing.length - 1]} is already recorded in ${resultsDir}; pass --rebaseline to record a new main baseline`,
    );
  }
}

function latestBaseline(resultsDir) {
  const files = baselineFiles(resultsDir);
  if (files.length === 0) return null;
  const file = join(resultsDir, files[files.length - 1]);
  return { file, ...JSON.parse(readFileSync(file, 'utf8')) };
}

function requireBaseline(resultsDir) {
  const baseline = latestBaseline(resultsDir);
  if (!baseline) {
    throw new HarnessError(
      'BASELINE_MISSING',
      `no baseline-main-<date>.json in ${resultsDir}; record it first with --arm full --ref main --runs 3`,
    );
  }
  return baseline;
}

function writeBaseline(resultsDir, { refSha, results, files }) {
  const recordedAt = new Date().toISOString();
  const out = join(resultsDir, `baseline-main-${recordedAt.slice(0, 10)}.json`);
  const body = { ref: BASELINE_REF, sha: refSha, recorded_at: recordedAt, files, ...summarizeArm(results) };
  writeFileSync(out, `${JSON.stringify(body, null, 2)}\n`);
  return out;
}

// Whether `refSha` is the commit `main` names, so a `full` run there is the
// baseline whatever spelling `--ref` used (`main`, `origin/main`, a sha).
function isBaselineCommit(refSha) {
  try {
    return resolveRef(BASELINE_REF) === refSha;
  } catch {
    return false;
  }
}

function armResults(resultsDir, armId) {
  if (!existsSync(resultsDir)) return [];
  return readdirSync(resultsDir)
    .filter((f) => f.startsWith(`${armId}-`) && f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(resultsDir, f), 'utf8')))
    .filter((r) => r.arm === armId);
}

async function thresholdReport(resultsDir, refSha, refSource) {
  const baseline = requireBaseline(resultsDir);
  const quick = armResults(resultsDir, 'quick').filter((r) => r.ref === refSha);
  const lite = armResults(resultsDir, 'lite').filter((r) => r.ref === refSha);
  return {
    ref: refSha,
    ref_source: refSource,
    matched_runs: { quick: quick.length, lite: lite.length },
    ...evaluateThresholds({ baseline, arms: { quick, lite }, fixture: await describeFixture() }),
  };
}

// Without --ref, the runs to judge are the latest ones recorded: their ref is
// that of the quick or lite run with the newest finished_at.
async function runEvaluate(opts) {
  requireBaseline(opts.resultsDir);
  let refSha;
  let refSource;
  if (opts.refExplicit) {
    refSha = resolveRef(opts.ref);
    refSource = 'flag';
  } else {
    const latest = [...armResults(opts.resultsDir, 'quick'), ...armResults(opts.resultsDir, 'lite')]
      .filter((r) => typeof r.ref === 'string' && typeof r.finished_at === 'string')
      .sort((a, b) => a.finished_at.localeCompare(b.finished_at))
      .at(-1);
    if (!latest) {
      throw new HarnessError('NO_ARM_RESULTS', `no quick or lite results in ${opts.resultsDir}; run those arms, or pass --ref`);
    }
    refSha = latest.ref;
    refSource = 'latest-results';
  }
  const report = await thresholdReport(opts.resultsDir, refSha, refSource);
  console.log(JSON.stringify(report, null, 2));
  return report.pass ? 0 : 1;
}

function addRefWorktree(refSha) {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), 'adev-ev1-ref-')));
  const worktree = join(parent, 'plugin');
  try {
    git(REPO_ROOT, ['worktree', 'add', '--detach', worktree, refSha]);
  } catch (err) {
    rmSync(parent, { recursive: true, force: true });
    throw new HarnessError('WORKTREE_ADD_FAILED', `git worktree add for ${refSha} failed: ${err.stderr?.toString().trim() || err.message}`);
  }
  return { parent, worktree };
}

export async function withRefWorktree(refSha, fn) {
  spawnSync('git', ['worktree', 'prune'], { cwd: REPO_ROOT });
  const { parent, worktree } = addRefWorktree(refSha);
  let shim = null;
  try {
    shim = createShim(worktree);
    assertArmCli({ pluginRoot: worktree, ...shim });
    return await fn({ worktree, shim });
  } finally {
    if (shim) rmSync(shim.bin, { recursive: true, force: true });
    spawnSync('git', ['worktree', 'remove', '--force', worktree], { cwd: REPO_ROOT });
    rmSync(parent, { recursive: true, force: true });
    spawnSync('git', ['worktree', 'prune'], { cwd: REPO_ROOT });
  }
}

async function runLive(opts) {
  const arm = ARMS.find((a) => a.id === opts.arm);
  if (!arm) throw new HarnessError('USAGE', `--arm must be one of ${ARMS.map((a) => a.id).join('|')}`);
  if (!arm.live) throw new HarnessError('ARM_NOT_AVAILABLE', `the '${arm.id}' arm is dry-run only`);
  if (arm.id !== 'full') requireBaseline(opts.resultsDir);
  const refSha = resolveRef(opts.ref);
  const recordsBaseline = arm.id === 'full' && isBaselineCommit(refSha);
  if (recordsBaseline) assertBaselineWritable(opts.resultsDir, { rebaseline: opts.rebaseline });
  requireClaudeCli();
  const fixture = await describeFixture();

  const results = [];
  const files = [];
  await withRefWorktree(refSha, async ({ worktree, shim }) => {
    mkdirSync(opts.resultsDir, { recursive: true });
    for (let i = 1; i <= opts.runs; i++) {
      console.log(`[ev1] ${arm.id} run ${i}/${opts.runs} at ${refSha.slice(0, 12)}`);
      const result = liveRun({ arm, pluginRoot: worktree, bin: shim.bin, refSha, refName: opts.ref, runIndex: i, fixture });
      const out = join(opts.resultsDir, `${arm.id}-${refSha.slice(0, 12)}-${result.finished_at.replace(/[:.]/g, '-')}.json`);
      writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
      results.push(result);
      files.push(relative(opts.resultsDir, out));
      const status = result.valid ? 'valid' : `INVALID (${result.invalid_reasons.join(', ')})`;
      console.log(`[ev1] wrote ${relative(REPO_ROOT, out)}: ${status}, quality gates ${result.metrics.quality_gates.pass ? 'pass' : 'FAIL'}`);
    }
  });
  const report = determinismReport(results.filter((r) => r.valid));
  if (report) console.log(report.markdown);

  if (recordsBaseline) {
    const out = writeBaseline(opts.resultsDir, { refSha, results, files });
    console.log(`[ev1] wrote baseline ${relative(REPO_ROOT, out)}`);
  } else if (arm.id !== 'full') {
    console.log(JSON.stringify(await thresholdReport(opts.resultsDir, refSha, 'run'), null, 2));
  }
  return results.every((r) => r.valid && r.metrics.quality_gates.pass) ? 0 : 1;
}

async function main(argv) {
  const opts = parseArgs(argv);
  if (opts.fixture === 'nonconvergent') {
    const nc = await import('./run-nonconvergent.mjs');
    checkNonconvergentArgs(opts, nc.MODES);
    if (opts.dryRun) {
      console.log(JSON.stringify(await nc.nonconvergentDryRun(opts), null, 2));
      return 0;
    }
    return nc.runNonconvergent(opts);
  }
  if (opts.dryRun) {
    console.log(JSON.stringify(await planDryRun(opts), null, 2));
    return 0;
  }
  if (opts.evaluate) return runEvaluate(opts);
  return runLive(opts);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      process.stderr.write(`run-ab-eval: ${err.message}\n`);
      process.exitCode = 1;
    },
  );
}
