#!/usr/bin/env node
// [live] EV-1 harness for the implement rigor ladder, plus the BEH-15
// non-convergence fixture runner.
//
// Each adev arm is defined only by the flags it passes to /adev:implement:
//   full  -> --tier full
//   quick -> (none)
//   lite  -> --lite
// The `plain` arm is Claude Code with no adev at all: the same sandbox, seed,
// spec and plan, a plain-language prompt to implement the plan, no
// `--plugin-dir`, no ADEV_ROOT, and an `adev` stub on PATH that exits 127. It
// is informational: `--evaluate`'s thresholds never read it. A plain run is
// valid when claude exits 0, at least one commit follows the seed, and a
// transcript exists; there is no implement verdict, no lifecycle span (its
// wall clock is process time) and no /adev:validate pass, so a seeded defect
// it misses is `escaped`.
//
// Plugin isolation: every claude spawn, every arm, passes
// `--settings {"enabledPlugins":{"<id>":false,...}}` for each installed plugin
// named `adev` (from <config>/plugins/installed_plugins.json and settings.json,
// plus adev@agentic-development). A `--plugin-dir` plugin is the separate
// `adev@inline` id, so the adev arms load only the ref's copy and the plain arm
// loads none. `--check-isolation` prints each arm's argv and env delta;
// `--check-isolation --probe` spends one short `claude -p` per arm and reads
// its init message and transcript to confirm.
//
// After implement, every arm copies `fixture/edge-probes/` into the sandbox
// (as with `fixture/probes/`), records `metrics.edge_probes`, and writes the
// diff runBase..HEAD minus `.context-index/` next to its result as
// `<result>.patch`. `judge-runs.mjs` scores those patches blind; `--compare`
// tabulates every arm present, with judge means when a judge file exists.
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
const EDGE_PROBES = join(EV1_FIXTURE.dir, 'edge-probes');
const SANDBOX_EDGE_PROBES = '.ev1-edge-probes';
const FIXTURE_README = join(EV1_FIXTURE.dir, 'README.md');
const PATCH_EXCLUDES = ['.context-index'];

// `live: false` would keep an arm in the dry-run plan while runLive refuses it
// with ARM_NOT_AVAILABLE. `implementArgs: null` marks the arm that never runs
// /adev:implement.
export const ARMS = [
  { id: 'full', implementArgs: ['--tier full'], adev: true, live: true },
  { id: 'quick', implementArgs: [], adev: true, live: true },
  { id: 'lite', implementArgs: ['--lite'], adev: true, live: true },
  { id: 'plain', implementArgs: null, adev: false, live: true },
];
const ADEV_PLUGIN_NAME = 'adev';
const DEFAULT_ADEV_PLUGIN_IDS = ['adev@agentic-development'];
const TOKEN_WEIGHTS = Object.freeze({
  input_tokens: 1,
  cache_creation_input_tokens: 1.25,
  cache_read_input_tokens: 0.1,
  output_tokens: 5,
});

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
    plain: 'process time of the claude spawn (the plain arm has no lifecycle log)',
    recorded_as: 'metrics.wall_clock_source: lifecycle-event-timestamps | process | none',
  },
  process_wall_clock_ms: { source: 'harness clock around the implement claude spawn', arms: 'every arm, the like-for-like column' },
  agent_dispatches: { source: 'session-jsonl', tool_use_names: DISPATCH_TOOLS, includes: 'main session and subagents' },
  tokens: {
    source: 'session-jsonl message.usage',
    fields: TOKEN_FIELDS,
    includes: 'main session and subagents',
    dedup: 'one usage per message.id per transcript, last row wins (Claude Code writes one row per content block)',
  },
  quality_gates: {
    command: QUALITY_GATE.join(' '),
    cwd: 'sandbox',
    when: 'after implement',
    tests: 'node:test summary counts (tests, pass, fail) parsed from the gate output, null when absent',
  },
  defects: {
    caught_at: CAUGHT_AT,
    meaning: {
      implement: 'probe passes after /adev:implement (plain: after the plain claude run)',
      validate: 'probe failed after implement and passes after /adev:validate ran',
      escaped: 'probe still fails after /adev:validate ran (plain: after the plain run, since it has no validate)',
    },
    probe: `node --test ${SANDBOX_PROBES}/<probe>`,
  },
  edge_probes: {
    source: 'fixture/edge-probes/probes.json',
    when: 'after implement, before any validate',
    probe: `node --test --test-reporter=tap ${SANDBOX_EDGE_PROBES}/<file>`,
    recorded: '{ total, passed, failed: [ids], by_behavior, strict: [ids], passed_excluding_strict, total_excluding_strict }',
  },
  patch: {
    file: '<result-basename>.patch beside the result JSON',
    diff: 'git diff --binary runBase HEAD, excluding .context-index/, taken after validate when it ran',
  },
  review_depths: {
    source: 'review_depth_resolved events after the latest implement started',
    keyed_by: 'task number, latest event per pass',
    plain: 'null (n/a)',
  },
  validity: {
    invalid_when: ['implement-exit-nonzero', 'implement-verdict-not-pass', 'no-task-commits', 'no-session-id', 'no-transcripts'],
    plain_invalid_when: ['implement-exit-nonzero', 'no-task-commits', 'no-session-id', 'no-transcripts'],
    note: 'invalid runs are written with valid: false and excluded from the determinism report and the thresholds',
  },
  validate: { adev_arms: 'runs when the run is valid and a seeded-defect probe failed after implement', plain: 'never runs' },
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
 * spec's risk level and the seed's sensitive-path configuration. Route's
 * eligibility rule is the shipped liteEligible().
 *
 * Each task carries two expectations. `liteArm` is the depth under `--lite`:
 * on a spec that is not high-risk the lite cap gives a sensitive-path task
 * `quick`, an eligible task is granted `lite` and the tripwire target ends at
 * `quick`. `withoutLite` is the depth with no lite authorization, where a
 * sensitive-path task is floored to `full`. Both treat a `human-only` task,
 * and on a high-risk spec any task not routed `auto-agent`, as `full`.
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
    else if (!eligible) role = entry.selected_agent;
    else if (undeclared.length > 0) role = 'tripwire-target';
    else role = 'lite-eligible';

    const uncapped = entry.selected_agent === 'human-only' || (highRisk && entry.selected_agent !== 'auto-agent');
    const withoutLiteDepth = uncapped || sensitive.length > 0 ? 'full' : 'quick';
    let provisional;
    if (uncapped || highRisk) provisional = withoutLiteDepth;
    else if (sensitive.length > 0) provisional = 'quick';
    else provisional = eligible ? 'lite' : 'quick';
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
      withoutLite: { provisional: withoutLiteDepth, expectedFinal: withoutLiteDepth },
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
      routeEligible: "tasks passing route's eligibility rule (liteEligible: auto-agent or assisted-agent, scores not consulted), before floors and the tripwire",
    },
    sensitivePathTask: sensitiveTask ? { task: sensitiveTask.id, paths: sensitiveTask.sensitive } : null,
    tripwireTargetTask: tripwireTask ? { task: tripwireTask.id, undeclared: tripwireTask.undeclared } : null,
    seededDefects: readSeededDefects(),
    taskRoles: tasks,
  };
}

export function findArm(id) {
  const arm = ARMS.find((a) => a.id === id);
  if (!arm) throw new HarnessError('USAGE', `--arm must be one of ${ARMS.map((a) => a.id).join('|')}`);
  return arm;
}

export async function planDryRun({ ref = 'HEAD', runs = 3, arm = null, model = null } = {}) {
  const arms = arm ? [findArm(arm)] : ARMS;
  return {
    arms: arms.map((a) => ({ ...a, prompt: armPrompt(a) })),
    ref,
    runs,
    model: model ?? 'session default',
    isolation: { settings: isolationSettings(installedAdevPluginIds()), check: '--check-isolation [--arm <id>] [--probe]' },
    fixture: await describeFixture(),
    edgeProbes: summarizeEdgeManifest(edgeProbeManifest()),
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
    patchOutput: 'results/<arm>-<ref-short>-<iso>.patch',
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

// The plain arm's counterpart of OPERATOR_STATEMENT: the same unattended
// pre-approval, without the adev checkpoint vocabulary a plain session has no
// referent for.
const PLAIN_OPERATOR_STATEMENT = [
  'This is an unattended evaluation run.',
  'The operator pre-approves every task and step in this plan, so continue past each one without stopping.',
  'Implement every plan task; if a task looks already implemented, do not skip it.',
  'Do not wait for input.',
].join(' ');

export function plainPrompt(fixture = EV1_FIXTURE) {
  return [
    `Implement every task in the plan at ${fixture.sandboxPlan}, following the spec at ${fixture.sandboxSpec}. Commit each task separately.`,
    '',
    PLAIN_OPERATOR_STATEMENT,
  ].join('\n');
}

export function armPrompt(arm) {
  return arm.adev === false ? plainPrompt() : implementPrompt(arm);
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
    compare: false,
    checkIsolation: false,
    probe: false,
    json: false,
    model: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--evaluate') opts.evaluate = true;
    else if (a === '--compare') opts.compare = true;
    else if (a === '--check-isolation') opts.checkIsolation = true;
    else if (a === '--probe') opts.probe = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--model') opts.model = argv[++i];
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
  if (opts.model !== null && (typeof opts.model !== 'string' || opts.model === '' || opts.model.startsWith('-'))) {
    throw new HarnessError('USAGE', '--model needs a model name or alias');
  }
  if (opts.probe && !opts.checkIsolation) {
    throw new HarnessError('USAGE', '--probe only applies to --check-isolation');
  }
  if (opts.arm !== null) findArm(opts.arm);
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

function readJsonFile(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Every plugin id named `adev` that the Claude config dir knows about, from
 * installed_plugins.json and the user settings' enabledPlugins, plus the
 * marketplace id the plugin is published under. Disabling an id that is not
 * installed is a no-op, so the default stays in even when nothing is found.
 */
export function installedAdevPluginIds(configDir = defaultConfigDir()) {
  const ids = new Set(DEFAULT_ADEV_PLUGIN_IDS);
  const installed = readJsonFile(join(configDir, 'plugins', 'installed_plugins.json'));
  const enabled = readJsonFile(join(configDir, 'settings.json'))?.enabledPlugins;
  for (const id of [...Object.keys(installed?.plugins ?? {}), ...Object.keys(enabled ?? {})]) {
    if (id.split('@')[0] === ADEV_PLUGIN_NAME) ids.add(id);
  }
  return [...ids].sort();
}

// `--settings` is merged over the user, project and local settings, and
// enabledPlugins merges per key, so `false` here wins over an install at any
// scope. A `--plugin-dir` plugin is `<name>@inline`, never one of these ids.
export function isolationSettings(adevPluginIds) {
  return { enabledPlugins: Object.fromEntries(adevPluginIds.map((id) => [id, false])) };
}

// A plain run must not reach the operator's own `adev` (e.g. ~/.local/bin), so
// a stub that behaves like an absent command comes first on PATH.
export function createPlainBin() {
  const bin = mkdtempSync(join(tmpdir(), 'adev-ev1-plain-bin-'));
  writeFileSync(join(bin, 'adev'), '#!/bin/sh\necho "adev: command not found" >&2\nexit 127\n');
  chmodSync(join(bin, 'adev'), 0o755);
  return { bin };
}

const PLAIN_REMOVED_ENV = /^(ADEV_|CLAUDE_PLUGIN_)/;

export function plainTrialEnv({ plainBin, cwd }) {
  const env = { ...process.env, CLAUDE_CODE_ENTRYPOINT: 'cli' };
  for (const key of SESSION_IDENTITY_ENV_KEYS) delete env[key];
  for (const key of Object.keys(env)) if (PLAIN_REMOVED_ENV.test(key)) delete env[key];
  env.PWD = cwd;
  env.SHELL = '/bin/bash';
  env.PATH = plainBin ? `${plainBin}:${process.env.PATH}` : process.env.PATH;
  return env;
}

/**
 * The argv of one claude spawn. Every arm passes the isolation settings; only
 * an adev arm passes `--plugin-dir`. `stream` selects the stream-json output
 * the isolation probe reads the init message from.
 */
export function claudeArgv({ prompt, pluginRoot = null, adev = true, settings, model = null, stream = false }) {
  if (adev && !pluginRoot) throw new HarnessError('USAGE', 'an adev spawn needs the plugin root');
  return [
    '--print',
    '--output-format', stream ? 'stream-json' : 'json',
    ...(stream ? ['--verbose'] : []),
    '--dangerously-skip-permissions',
    '--settings', JSON.stringify(settings),
    ...(model ? ['--model', model] : []),
    ...(adev ? ['--plugin-dir', pluginRoot] : []),
    '-p', prompt,
  ];
}

/** The exact spawn of one arm: argv, env and the settings it carries. */
export function armSpawnSpec({ arm, pluginRoot, shimBin, plainBin, cwd, model = null, configDir = defaultConfigDir(), prompt = armPrompt(arm), stream = false }) {
  const settings = isolationSettings(installedAdevPluginIds(configDir));
  const env = arm.adev === false ? plainTrialEnv({ plainBin, cwd }) : trialEnv({ pluginRoot, bin: shimBin, cwd });
  return {
    command: 'claude',
    argv: claudeArgv({ prompt, pluginRoot, adev: arm.adev !== false, settings, model, stream }),
    env,
    settings,
  };
}

// What a spawn's env changes relative to the harness's own, for printing.
export function envDelta(env, base = process.env) {
  const set = {};
  for (const [k, v] of Object.entries(env)) {
    if (base[k] === v) continue;
    set[k] = k === 'PATH' && base.PATH && v.endsWith(`:${base.PATH}`) ? `${v.slice(0, -base.PATH.length - 1)}:$PATH` : v;
  }
  const removed = Object.keys(base).filter((k) => !(k in env)).sort();
  return { set, removed };
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

export function runClaude(
  sandbox,
  pluginRoot,
  prompt,
  { adev = true, env = sandbox.env, model = null, settings = isolationSettings(installedAdevPluginIds()) } = {},
) {
  const started = Date.now();
  const r = spawnSync(
    'claude',
    claudeArgv({ prompt, pluginRoot, adev, settings, model }),
    {
      cwd: sandbox.root,
      env,
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
 * least one commit after the seed, and left a transcript to measure. The plain
 * arm has no lifecycle log to carry a verdict, so it passes
 * `requireVerdict: false` and is judged on the other three.
 */
export function classifyRun({ exitCode, verdict, taskCommits, sessionId, transcripts }, { requireVerdict = true } = {}) {
  const reasons = [];
  if (exitCode !== 0) reasons.push('implement-exit-nonzero');
  if (requireVerdict && verdict !== 'PASS') reasons.push('implement-verdict-not-pass');
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

/**
 * The node:test summary counts in a test command's output, from the spec
 * reporter (`ℹ tests 8`) or TAP (`# tests 8`). The last occurrence wins, so a
 * nested summary printed earlier does not mask the run's own.
 */
export function parseTestCounts(output) {
  const counts = {};
  for (const m of String(output ?? '').matchAll(/^\s*(?:ℹ|#)\s+(tests|pass|fail)\s+(\d+)\s*$/gm)) counts[m[1]] = Number(m[2]);
  if (!('tests' in counts)) return null;
  return { total: counts.tests, pass: counts.pass ?? null, fail: counts.fail ?? null };
}

function runQualityGates(sandbox) {
  const r = spawnSync(QUALITY_GATE[0], QUALITY_GATE.slice(1), { cwd: sandbox.root, env: sandbox.env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  return {
    command: QUALITY_GATE.join(' '),
    exit_code: r.status,
    pass: r.status === 0,
    tests: parseTestCounts(`${r.stdout ?? ''}\n${r.stderr ?? ''}`),
  };
}

export function edgeProbeManifest(dir = EDGE_PROBES) {
  const manifest = JSON.parse(readFileSync(join(dir, 'probes.json'), 'utf8'));
  for (const p of manifest.probes) {
    if (!manifest.files[p.file]) throw new HarnessError('FIXTURE_INVALID', `edge probe ${p.id} names an unlisted file ${p.file}`);
    p.behavior = manifest.files[p.file];
  }
  return manifest;
}

function summarizeEdgeManifest(manifest) {
  const byBehavior = {};
  for (const p of manifest.probes) byBehavior[p.behavior] = (byBehavior[p.behavior] ?? 0) + 1;
  return {
    total: manifest.probes.length,
    by_behavior: byBehavior,
    strict: manifest.probes.filter((p) => p.strict).map((p) => p.id),
    when: METRICS.edge_probes.when,
  };
}

/**
 * Top-level `ok`/`not ok` lines of a TAP stream whose test name starts with a
 * probe id (`P1: ...`). A file that fails to load reports no such line, so
 * every probe it holds is absent and counts as failed.
 */
export function parseTapIds(tap) {
  const out = {};
  for (const m of String(tap ?? '').matchAll(/^(not ok|ok) \d+ - ([A-Z]+\d+):/gm)) out[m[2]] = m[1] === 'ok' ? 'pass' : 'fail';
  return out;
}

export function summarizeEdgeProbes(manifest, outcomes) {
  const strict = manifest.probes.filter((p) => p.strict).map((p) => p.id);
  const failed = manifest.probes.filter((p) => outcomes[p.id] !== 'pass').map((p) => p.id);
  const byBehavior = {};
  for (const p of manifest.probes) {
    const b = (byBehavior[p.behavior] ??= { total: 0, passed: 0, failed: [] });
    b.total++;
    if (outcomes[p.id] === 'pass') b.passed++;
    else b.failed.push(p.id);
  }
  const nonStrict = manifest.probes.filter((p) => !p.strict);
  return {
    total: manifest.probes.length,
    passed: manifest.probes.length - failed.length,
    failed,
    by_behavior: byBehavior,
    strict,
    total_excluding_strict: nonStrict.length,
    passed_excluding_strict: nonStrict.filter((p) => outcomes[p.id] === 'pass').length,
  };
}

/**
 * Copies the edge-probe battery into `root`, runs each file there with the TAP
 * reporter, removes it again, and summarizes every probe id. The probes import
 * `../src/...`, so they run against whatever the implementer left in `src/`.
 */
export function edgeProbeResults(root, { dir = EDGE_PROBES, timeoutMs = 60_000 } = {}) {
  const manifest = edgeProbeManifest(dir);
  const target = join(root, SANDBOX_EDGE_PROBES);
  mkdirSync(target, { recursive: true });
  const outcomes = {};
  // An inherited NODE_TEST_CONTEXT (set when the caller itself runs under
  // node --test) switches the child's reporter to the parent's binary channel.
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  try {
    cpSync(dir, target, { recursive: true });
    for (const file of Object.keys(manifest.files)) {
      const r = spawnSync('node', ['--test', '--test-reporter=tap', join(SANDBOX_EDGE_PROBES, file)], {
        cwd: root,
        env,
        encoding: 'utf8',
        timeout: timeoutMs,
        killSignal: 'SIGKILL',
      });
      Object.assign(outcomes, parseTapIds(r.stdout));
    }
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
  return summarizeEdgeProbes(manifest, outcomes);
}

/**
 * The run's final code as a patch: `git diff --binary <runBase> HEAD` minus
 * the excluded trees, plus the tracked-or-untracked paths left uncommitted
 * (which the patch does not carry).
 */
export function runPatch(root, runBase, { excludes = PATCH_EXCLUDES } = {}) {
  const pathspec = ['--', '.', ...excludes.map((p) => `:(exclude)${p}`)];
  const text = execFileSync('git', ['diff', '--binary', runBase, 'HEAD', ...pathspec], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const files = git(root, ['diff', '--name-only', runBase, 'HEAD', ...pathspec]).split('\n').filter(Boolean);
  // Not git(): its trim() would eat the first porcelain line's leading status column.
  const uncommitted = execFileSync('git', ['status', '--porcelain', '--untracked-files=all', ...pathspec], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .map((l) => l.slice(3));
  return { text, files, uncommitted, head: git(root, ['rev-parse', 'HEAD']) };
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

/**
 * One run's wall clock: the implement lifecycle span for an adev arm, process
 * time for the plain arm, which has no lifecycle log. The source is recorded
 * so a reader never compares one against the other unknowingly.
 */
export function runWallClock({ arm, lifecycleMs, processMs }) {
  if (arm.adev === false) return { wall_clock_ms: processMs, wall_clock_source: 'process' };
  return { wall_clock_ms: lifecycleMs, wall_clock_source: lifecycleMs === null ? 'none' : 'lifecycle-event-timestamps' };
}

function liveRun({ arm, pluginRoot, bin, plainBin, model, refSha, refName, runIndex, fixture }) {
  const sandbox = prepareSandbox({ pluginRoot, bin, fixture: EV1_FIXTURE });
  try {
    const plain = arm.adev === false;
    const implement = runClaude(sandbox, pluginRoot, armPrompt(arm), {
      adev: !plain,
      env: plain ? plainTrialEnv({ plainBin, cwd: sandbox.root }) : sandbox.env,
      model,
    });
    const implUsage = sessionUsage(implement.sessionId, sandbox.root);
    const events = lifecycleEvents(sandbox.root, EV1_FIXTURE);
    const { wallClockMs, verdict } = plain ? { wallClockMs: null, verdict: null } : implementWallClock(events);
    const taskCommits = Number(git(sandbox.root, ['rev-list', '--count', `${sandbox.runBase}..HEAD`]));
    const validity = classifyRun(
      {
        exitCode: implement.exitCode,
        verdict,
        taskCommits,
        sessionId: implement.sessionId,
        transcripts: implUsage.transcripts,
      },
      { requireVerdict: !plain },
    );
    const qualityGates = runQualityGates(sandbox);
    const touched = git(sandbox.root, ['diff', '--name-only', sandbox.runBase, 'HEAD']).split('\n').filter(Boolean);
    const implementHead = git(sandbox.root, ['rev-parse', 'HEAD']);

    const defectIds = fixture.seededDefects.map((d) => d.id);
    const afterImplement = probeResults(sandbox, fixture.seededDefects, defectIds);
    const edgeProbes = edgeProbeResults(sandbox.root);
    const missed = defectIds.filter((id) => afterImplement[id] !== 'pass');
    let validate = null;
    let afterValidate = {};
    if (!plain && validity.valid && missed.length > 0) {
      const v = runClaude(sandbox, pluginRoot, `/adev:validate --spec ${EV1_FIXTURE.sandboxSpec}`, { model });
      validate = { ...v, ...sessionUsage(v.sessionId, sandbox.root) };
      afterValidate = probeResults(sandbox, fixture.seededDefects, missed);
    }
    const defects = fixture.seededDefects.map((d) => ({
      ...d,
      caught_at: afterImplement[d.id] === 'pass' ? 'implement' : afterValidate[d.id] === 'pass' ? 'validate' : 'escaped',
    }));
    const patch = runPatch(sandbox.root, sandbox.runBase);

    const result = {
      arm: arm.id,
      implementArgs: arm.implementArgs,
      adev: !plain,
      model: model ?? null,
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
        ...runWallClock({ arm, lifecycleMs: wallClockMs, processMs: implement.processMs }),
        process_wall_clock_ms: implement.processMs,
        agent_dispatches: implUsage.agentDispatches,
        tokens: implUsage.tokens,
        quality_gates: qualityGates,
        defects,
        edge_probes: edgeProbes,
      },
      review_depths: plain ? null : reviewDepthsFromEvents(eventsSinceImplementStart(events)),
      ...(plain ? { validate_skipped: 'the plain arm has no /adev:validate' } : {}),
      patch: {
        path: null,
        base: sandbox.runBase,
        head: patch.head,
        implement_head: implementHead,
        includes_validate_commits: patch.head !== implementHead,
        excluded: PATCH_EXCLUDES.map((p) => `${p}/`),
        files: patch.files,
        bytes: Buffer.byteLength(patch.text),
        uncommitted_paths: patch.uncommitted,
      },
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
    return { result, patchText: patch.text };
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

/** Tokens weighted by relative price: input 1, cache write 1.25, cache read 0.1, output 5. */
export function costWeightedTokens(tokens) {
  if (!tokens) return null;
  return Object.entries(TOKEN_WEIGHTS).reduce((sum, [field, w]) => sum + (tokens[field] ?? 0) * w, 0);
}

const processMsOf = (r) => r.metrics?.process_wall_clock_ms ?? r.implement?.process_ms ?? null;
// Results written before wall_clock_source existed are adev runs, whose
// wall_clock_ms was always the lifecycle span.
const lifecycleMsOf = (r) => (r.adev === false || r.metrics?.wall_clock_source === 'process' ? null : r.metrics?.wall_clock_ms ?? null);
const caughtCount = (r, pred) => (r.metrics?.defects ?? []).filter(pred).length;

/**
 * One informational row per arm present. Medians are over valid runs; the
 * quality-gate rate is over every run, as in summarizeArm. The edge-probe
 * rate pools passed/total over the valid runs that recorded edge probes.
 */
export function compareArms(resultsByArm, { judgeByArm = {} } = {}) {
  const rows = [];
  for (const arm of ARMS.map((a) => a.id)) {
    const results = resultsByArm[arm] ?? [];
    if (results.length === 0) continue;
    const valid = results.filter((r) => r.valid);
    const withEdge = valid.filter((r) => r.metrics?.edge_probes?.total > 0);
    const edgeTotal = withEdge.reduce((s, r) => s + r.metrics.edge_probes.total, 0);
    const edgePassed = withEdge.reduce((s, r) => s + r.metrics.edge_probes.passed, 0);
    const withValidate = (r) => {
      const impl = costWeightedTokens(r.metrics?.tokens) ?? 0;
      return impl + (r.validate ? costWeightedTokens(r.validate.tokens) ?? 0 : 0);
    };
    rows.push({
      arm,
      runs: results.length,
      valid_runs: valid.length,
      refs: [...new Set(results.map((r) => String(r.ref ?? '').slice(0, 12)))].sort(),
      median_process_wall_clock_ms: median(valid.map(processMsOf)),
      median_lifecycle_wall_clock_ms: median(valid.map(lifecycleMsOf)),
      median_weighted_tokens: median(valid.map((r) => costWeightedTokens(r.metrics?.tokens))),
      median_weighted_tokens_incl_validate: median(valid.map(withValidate)),
      median_output_tokens: median(valid.map((r) => r.metrics?.tokens?.output_tokens)),
      median_dispatches: median(valid.map((r) => r.metrics?.agent_dispatches)),
      quality_gates_pass_rate: round4(results.filter((r) => r.metrics?.quality_gates?.pass === true).length / results.length),
      validate_runs: valid.filter((r) => r.validate).length,
      median_defects_missed_at_implement: median(valid.map((r) => caughtCount(r, (d) => d.caught_at !== 'implement'))),
      median_defects_escaped: median(valid.map((r) => caughtCount(r, (d) => d.caught_at === 'escaped'))),
      edge_probe_runs: withEdge.length,
      edge_probe_pass_rate: edgeTotal > 0 ? round4(edgePassed / edgeTotal) : null,
      median_tests: median(valid.map((r) => r.metrics?.quality_gates?.tests?.total)),
      judge_overall_mean: judgeByArm[arm]?.overall ?? null,
      judge_patches: judgeByArm[arm]?.patches ?? 0,
    });
  }
  return rows;
}

const fmtMin = (ms) => (ms === null ? 'n/a' : `${(ms / 60000).toFixed(1)}m`);
const fmtNum = (n) => {
  if (n === null || n === undefined) return 'n/a';
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(Math.round(n * 10) / 10);
};
const fmtPct = (x) => (x === null ? 'n/a' : `${Math.round(x * 1000) / 10}%`);

export function renderCompareTable(rows) {
  const header = [
    'arm', 'runs/valid', 'process wall', 'lifecycle wall', 'weighted tok', 'weighted tok +validate', 'output tok',
    'dispatches', 'gates pass', 'D missed@impl', 'D escaped', 'edge probes', 'tests', 'judge overall',
  ];
  const lines = [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`];
  for (const r of rows) {
    lines.push(`| ${[
      r.arm,
      `${r.runs}/${r.valid_runs}`,
      fmtMin(r.median_process_wall_clock_ms),
      fmtMin(r.median_lifecycle_wall_clock_ms),
      fmtNum(r.median_weighted_tokens),
      fmtNum(r.median_weighted_tokens_incl_validate),
      fmtNum(r.median_output_tokens),
      fmtNum(r.median_dispatches),
      fmtPct(r.quality_gates_pass_rate),
      fmtNum(r.median_defects_missed_at_implement),
      fmtNum(r.median_defects_escaped),
      r.edge_probe_pass_rate === null ? 'n/a' : `${fmtPct(r.edge_probe_pass_rate)} (${r.edge_probe_runs} runs)`,
      fmtNum(r.median_tests),
      r.judge_overall_mean === null ? 'n/a' : `${r.judge_overall_mean.toFixed(2)} (${r.judge_patches} patches)`,
    ].join(' | ')} |`);
  }
  return [
    ...lines,
    '',
    'Medians over valid runs; gates pass over every run. Process wall is the implement claude spawn (every arm);',
    'lifecycle wall is the implement lifecycle span (adev arms only). Weighted tokens: input 1, cache write 1.25,',
    'cache read 0.1, output 5, implement session; "+validate" adds the validate session. D escaped is after validate,',
    'which the plain arm never runs, so compare D missed@impl across all four arms. Informational only: --evaluate',
    'thresholds are unchanged and never read the plain arm.',
  ].join('\n');
}

async function runCompare(opts) {
  const refSha = opts.refExplicit ? resolveRef(opts.ref) : null;
  const resultsByArm = {};
  for (const { id } of ARMS) {
    resultsByArm[id] = armResults(opts.resultsDir, id).filter((r) => refSha === null || r.ref === refSha);
  }
  const judge = await import('./judge-runs.mjs');
  const judgeFile = judge.latestJudgeFile(opts.resultsDir);
  const judgeByArm = judgeFile ? judge.judgeOverallByArm(JSON.parse(readFileSync(judgeFile, 'utf8'))) : {};
  const rows = compareArms(resultsByArm, { judgeByArm });
  if (opts.json) {
    console.log(JSON.stringify({ ref: refSha, judge_file: judgeFile && relative(opts.resultsDir, judgeFile), rows }, null, 2));
  } else {
    if (judgeFile) console.log(`judge file: ${relative(opts.resultsDir, judgeFile)}`);
    console.log(rows.length === 0 ? `no arm results in ${opts.resultsDir}` : renderCompareTable(rows));
  }
  return 0;
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

const THRESHOLD_ARMS = ['quick', 'lite'];

async function runLive(opts) {
  if (opts.arm === null) throw new HarnessError('USAGE', `--arm must be one of ${ARMS.map((a) => a.id).join('|')}`);
  const arm = findArm(opts.arm);
  if (!arm.live) throw new HarnessError('ARM_NOT_AVAILABLE', `the '${arm.id}' arm is dry-run only`);
  if (THRESHOLD_ARMS.includes(arm.id)) requireBaseline(opts.resultsDir);
  const refSha = resolveRef(opts.ref);
  const recordsBaseline = arm.id === 'full' && isBaselineCommit(refSha);
  if (recordsBaseline) assertBaselineWritable(opts.resultsDir, { rebaseline: opts.rebaseline });
  requireClaudeCli();
  const fixture = await describeFixture();

  const results = [];
  const files = [];
  const plainBin = arm.adev === false ? createPlainBin() : null;
  try {
    await withRefWorktree(refSha, async ({ worktree, shim }) => {
      mkdirSync(opts.resultsDir, { recursive: true });
      for (let i = 1; i <= opts.runs; i++) {
        console.log(`[ev1] ${arm.id} run ${i}/${opts.runs} at ${refSha.slice(0, 12)}`);
        const { result, patchText } = liveRun({
          arm,
          pluginRoot: worktree,
          bin: shim.bin,
          plainBin: plainBin?.bin ?? null,
          model: opts.model,
          refSha,
          refName: opts.ref,
          runIndex: i,
          fixture,
        });
        const stem = `${arm.id}-${refSha.slice(0, 12)}-${result.finished_at.replace(/[:.]/g, '-')}`;
        const out = join(opts.resultsDir, `${stem}.json`);
        writeFileSync(join(opts.resultsDir, `${stem}.patch`), patchText);
        result.patch.path = `${stem}.patch`;
        writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
        results.push(result);
        files.push(relative(opts.resultsDir, out));
        const status = result.valid ? 'valid' : `INVALID (${result.invalid_reasons.join(', ')})`;
        console.log(`[ev1] wrote ${relative(REPO_ROOT, out)}: ${status}, quality gates ${result.metrics.quality_gates.pass ? 'pass' : 'FAIL'}`);
      }
    });
  } finally {
    if (plainBin) rmSync(plainBin.bin, { recursive: true, force: true });
  }
  const report = determinismReport(results.filter((r) => r.valid));
  if (report) console.log(report.markdown);

  if (recordsBaseline) {
    const out = writeBaseline(opts.resultsDir, { refSha, results, files });
    console.log(`[ev1] wrote baseline ${relative(REPO_ROOT, out)}`);
  } else if (THRESHOLD_ARMS.includes(arm.id)) {
    console.log(JSON.stringify(await thresholdReport(opts.resultsDir, refSha, 'run'), null, 2));
  }
  return results.every((r) => r.valid && r.metrics.quality_gates.pass) ? 0 : 1;
}

export const ISOLATION_PROBE_PROMPT = [
  'List every skill and slash command available in this session whose name starts with "adev" (for example adev:implement),',
  'one per line, exactly as named. If there are none, reply with the single word NONE. Do not use any tools.',
].join(' ');

const PLACEHOLDERS = { pluginRoot: '<ref-worktree>', shimBin: '<adev-shim-bin>', plainBin: '<plain-bin>', cwd: '<sandbox>' };

function installedAdevScopes(configDir) {
  const installed = readJsonFile(join(configDir, 'plugins', 'installed_plugins.json'))?.plugins ?? {};
  const enabled = readJsonFile(join(configDir, 'settings.json'))?.enabledPlugins ?? {};
  return installedAdevPluginIds(configDir).map((id) => ({
    id,
    installs: (installed[id] ?? []).map((i) => ({ scope: i.scope ?? null, projectPath: i.projectPath ?? null })),
    user_settings_enabled: id in enabled ? enabled[id] : null,
  }));
}

/**
 * Each arm's spawn as `--check-isolation` prints it: the run argv and the
 * probe argv, with placeholder paths, and the env delta against the
 * harness's own environment.
 */
export function isolationPlan({ arms = ARMS, configDir = defaultConfigDir(), model = null } = {}) {
  return {
    config_dir: configDir,
    installed_adev: installedAdevScopes(configDir),
    settings: isolationSettings(installedAdevPluginIds(configDir)),
    arms: arms.map((arm) => {
      const run = armSpawnSpec({ arm, ...PLACEHOLDERS, model, configDir });
      const probe = armSpawnSpec({ arm, ...PLACEHOLDERS, model, configDir, prompt: ISOLATION_PROBE_PROMPT, stream: true });
      return {
        arm: arm.id,
        command: run.command,
        run_argv: run.argv,
        probe_argv: probe.argv,
        env: envDelta(run.env),
        expect: arm.adev === false
          ? 'no adev plugin, skill, slash command or SessionStart context'
          : 'exactly one adev plugin, at the ref worktree; adev skills present once each; no installed copy',
      };
    }),
    probe: 'add --probe to spend one short claude -p per arm (in a fresh sandbox) and check the init message and transcript',
  };
}

export function parseStreamJson(stdout) {
  const messages = [];
  for (const line of String(stdout ?? '').split('\n')) {
    if (!line.trim()) continue;
    try {
      messages.push(JSON.parse(line));
    } catch {
      // A partial last line from a killed process carries nothing to read.
    }
  }
  return {
    init: messages.find((m) => m.type === 'system' && m.subtype === 'init') ?? null,
    result: messages.findLast((m) => m.type === 'result') ?? null,
  };
}

const stripSlash = (s) => String(s).replace(/^\//, '');
const isAdevName = (s) => /^adev(?::|$)/.test(stripSlash(s));
const INSTALLED_ADEV_PATH = /plugins\/cache\/[^/"\\]+\/adev\//;

/**
 * What an arm's session actually loaded, from the stream-json init message
 * (plugins, slash commands, skills) and the transcript (skill_listing and
 * SessionStart additional context, and any path into the installed plugin
 * cache's adev copy).
 */
export function isolationEvidence({ init = null, transcriptPaths = [] } = {}) {
  const dupes = (names) => [...new Set(names.filter((n, i) => names.indexOf(n) !== i))].sort();
  const listing = [];
  const listingDupes = [];
  let usingAdevContexts = 0;
  let installedCopyReferenced = false;
  let sawListing = false;
  for (const file of transcriptPaths) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (!line) continue;
      if (INSTALLED_ADEV_PATH.test(line)) installedCopyReferenced = true;
      let row;
      try {
        row = JSON.parse(line);
      } catch {
        continue;
      }
      const a = row?.attachment;
      if (a?.type === 'skill_listing' && typeof a.content === 'string') {
        sawListing = true;
        // A session can carry several listings (one per delta), so a name is a
        // duplicate only when one listing names it twice.
        const names = [];
        for (const l of a.content.split('\n')) {
          const m = /^- ([^:\s]+(?::[^:\s]+)?):/.exec(l);
          if (m && isAdevName(m[1])) names.push(m[1]);
        }
        listing.push(...names);
        listingDupes.push(...dupes(names));
      }
      if (a?.type === 'hook_additional_context' && JSON.stringify(a.content ?? '').includes('name: using-adev')) usingAdevContexts++;
    }
  }
  const initNames = init ? [...(init.slash_commands ?? []), ...(init.skills ?? [])].map(stripSlash).filter(isAdevName) : [];
  const plugins = Array.isArray(init?.plugins) ? init.plugins : null;
  return {
    init_available: init !== null,
    listing_available: sawListing,
    adev_plugins: plugins === null ? null : plugins.filter((p) => p?.name === ADEV_PLUGIN_NAME).map((p) => p.path ?? null),
    adev_commands: [...new Set(initNames)].sort(),
    adev_listing: [...new Set(listing)].sort(),
    duplicate_adev_names: [...new Set([...dupes(init?.slash_commands?.map(stripSlash).filter(isAdevName) ?? []), ...listingDupes])].sort(),
    using_adev_contexts: usingAdevContexts,
    installed_copy_referenced: installedCopyReferenced,
  };
}

function samePath(a, b) {
  const real = (p) => {
    try {
      return realpathSync(p);
    } catch {
      return resolve(p);
    }
  };
  return real(a) === real(b);
}

export function judgeIsolation({ arm, evidence, pluginRoot }) {
  const failures = [];
  if (!evidence.init_available && !evidence.listing_available) failures.push('no-evidence: neither an init message nor a skill listing');
  if (evidence.installed_copy_referenced) failures.push('the installed adev copy (plugins/cache/.../adev/) is referenced');
  if (arm.adev === false) {
    if (evidence.adev_plugins?.length) failures.push(`adev plugin loaded: ${evidence.adev_plugins.join(', ')}`);
    if (evidence.adev_commands.length) failures.push(`adev commands/skills present: ${evidence.adev_commands.join(', ')}`);
    if (evidence.adev_listing.length) failures.push(`adev skills listed: ${evidence.adev_listing.join(', ')}`);
    if (evidence.using_adev_contexts > 0) failures.push('the adev SessionStart context was injected');
  } else {
    if (evidence.adev_plugins !== null) {
      if (evidence.adev_plugins.length !== 1) failures.push(`expected one adev plugin, saw ${evidence.adev_plugins.length}`);
      else if (!evidence.adev_plugins[0] || !samePath(evidence.adev_plugins[0], pluginRoot)) {
        failures.push(`the adev plugin loaded from ${evidence.adev_plugins[0]}, not ${pluginRoot}`);
      }
    }
    if (evidence.adev_commands.length === 0 && evidence.adev_listing.length === 0) failures.push('no adev skills or commands present');
    if (evidence.duplicate_adev_names.length) failures.push(`adev names listed twice: ${evidence.duplicate_adev_names.join(', ')}`);
    if (evidence.using_adev_contexts > 1) failures.push(`the adev SessionStart context was injected ${evidence.using_adev_contexts} times`);
  }
  return { arm: arm.id, ok: failures.length === 0, failures };
}

async function runIsolationProbe(opts) {
  const arms = opts.arm ? [findArm(opts.arm)] : ARMS;
  const refSha = resolveRef(opts.ref);
  requireClaudeCli();
  const plainBin = createPlainBin();
  const report = { ref: refSha, model: opts.model ?? 'session default', arms: [] };
  try {
    await withRefWorktree(refSha, async ({ worktree, shim }) => {
      for (const arm of arms) {
        const sandbox = prepareSandbox({ pluginRoot: worktree, bin: shim.bin, fixture: EV1_FIXTURE });
        try {
          const spec = armSpawnSpec({
            arm, pluginRoot: worktree, shimBin: shim.bin, plainBin: plainBin.bin, cwd: sandbox.root,
            model: opts.model, prompt: ISOLATION_PROBE_PROMPT, stream: true,
          });
          console.error(`[ev1] isolation probe: ${arm.id}`);
          const r = spawnSync(spec.command, spec.argv, {
            cwd: sandbox.root, env: spec.env, encoding: 'utf8', timeout: 5 * 60 * 1000, killSignal: 'SIGKILL',
            stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024,
          });
          const { init, result } = parseStreamJson(r.stdout);
          const sessionId = result?.session_id ?? init?.session_id ?? null;
          const evidence = isolationEvidence({ init, transcriptPaths: awaitTranscripts(sessionId, sandbox.root) });
          report.arms.push({
            ...judgeIsolation({ arm, evidence, pluginRoot: worktree }),
            exit_code: r.status,
            session_id: sessionId,
            answer: typeof result?.result === 'string' ? result.result.trim() : null,
            cost_usd: result?.total_cost_usd ?? null,
            evidence,
          });
        } finally {
          rmSync(sandbox.root, { recursive: true, force: true });
        }
      }
    });
  } finally {
    rmSync(plainBin.bin, { recursive: true, force: true });
  }
  report.ok = report.arms.every((a) => a.ok);
  console.log(JSON.stringify(report, null, 2));
  return report.ok ? 0 : 1;
}

async function main(argv) {
  const opts = parseArgs(argv);
  if (opts.checkIsolation) {
    if (opts.probe) return runIsolationProbe(opts);
    const arms = opts.arm ? [findArm(opts.arm)] : ARMS;
    console.log(JSON.stringify(isolationPlan({ arms, model: opts.model }), null, 2));
    return 0;
  }
  if (opts.compare) return runCompare(opts);
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
