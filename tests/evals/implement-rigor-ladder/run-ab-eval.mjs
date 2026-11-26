#!/usr/bin/env node
// [live] EV-1 three-arm harness for the implement rigor ladder.
//
// Each arm is defined only by the flags it passes to /adev:implement:
//   full  -> --tier full
//   quick -> (none)
//   lite  -> --lite
//
// `--dry-run` prints the arm plan, the fixture's derived counts and the metric
// definitions as JSON, and writes nothing. That is what the `npm test` smoke
// test (tests/lib/evals/implement-rigor-ladder-smoke.test.mjs) exercises; it
// lives outside tests/evals/ because scripts/run-tests.mjs routes that tree to
// `npm run test:evals`.
//
// A live run checks out `--ref` (default HEAD) into a throwaway detached git
// worktree, so the plugin under measurement is the one at that ref, not the
// working tree. Each run copies `fixture/seed/` into a fresh sandbox, drives
// `claude -p "/adev:implement ..."` with `--plugin-dir <worktree>` and an
// `adev` shim that runs that worktree's CLI, and writes one
// `results/<arm>-<ref-short>-<iso>.json`. Only `full` is live today: the
// `quick` and `lite` arms depend on resolver behavior that lands later, so they
// exit with ARM_NOT_YET_AVAILABLE rather than measure the wrong thing.
//
// judge()/renderReport() are hardcoded to three arms (serialA baseline,
// serialB determinism control, parallel variant). Across repeated runs of one
// arm, the first run is serialA, the second serialB and the last the variant,
// so the report states whether the arm is deterministic enough on this fixture
// for a cross-arm comparison to mean anything.

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

import { judge } from '../../../lib/parallel/eval/divergence.mjs';
import { renderReport } from '../../../lib/parallel/eval/report.mjs';
import { lookupRoutingEntry } from '../../../lib/plan-routing-sidecar.mjs';
import { encodeProjectDir } from '../../../lib/session-file-reader.mjs';
import { loadConfiguredSensitivePaths } from '../../../lib/cli/test-policy.mjs';
import { matchGlob } from '../../../lib/test-strategies/manifest.mjs';
import { effectiveSensitivePaths } from '../../../lib/test-strategies/sensitive-paths.mjs';
import { readTaskFiles } from '../../../lib/test-strategies/task-files.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..');
const FIXTURE = join(HERE, 'fixture');
const SEED = join(FIXTURE, 'seed');
const PROBES = join(FIXTURE, 'probes');
const RESULTS_DIR = join(HERE, 'results');
const FIXTURE_SPEC = join(FIXTURE, 'example.spec.md');
const FIXTURE_PLAN = join(FIXTURE, 'example.plan.md');
const FIXTURE_README = join(FIXTURE, 'README.md');

const SANDBOX_SPEC_DIR = '.context-index/specs/features/example';
const SANDBOX_SPEC = `${SANDBOX_SPEC_DIR}/example.spec.md`;
const SANDBOX_PLAN = `${SANDBOX_SPEC_DIR}/example.plan.md`;
const SANDBOX_PROBES = '.ev1-probes';

const ARMS = [
  { id: 'full', implementArgs: ['--tier full'], live: true },
  { id: 'quick', implementArgs: [], live: false },
  { id: 'lite', implementArgs: ['--lite'], live: false },
];

const REUSES = ['lib/parallel/eval/divergence.mjs#judge', 'lib/parallel/eval/report.mjs#renderReport'];

const LITE_THRESHOLD = 0.6;
const SCORE_DIMENSIONS = ['spec_completeness', 'pattern_coverage', 'blast_radius', 'novelty'];
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
  validity: {
    invalid_when: ['implement-exit-nonzero', 'implement-verdict-not-pass', 'no-task-commits', 'no-session-id', 'no-transcripts'],
    note: 'invalid runs are written with valid: false and excluded from the determinism report',
  },
};

const TASK_HEADING = /^#{2,4}\s+Task\s+(\d+)\b:?\s*(.*)$/;
const FENCE_LINE = /^\s*(`{3,}|~{3,})/;
const FILES_FIELD = /^\s*(?:[-*]\s+)?\*\*(Files|Tests):\*\*/;
const SUB_BULLET = /^\s*[-*]\s+/;
const BACKTICK_SRC_PATH = /`(src\/[^`\s]+\.[A-Za-z0-9]+)`/g;

class HarnessError extends Error {
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

function routeEasy(entry) {
  if (entry?.selected_agent !== 'auto-agent') return false;
  return SCORE_DIMENSIONS.every((dim) => {
    const v = entry.scores?.[dim];
    return typeof v === 'number' && Number.isFinite(v) && v >= LITE_THRESHOLD && v <= 1;
  });
}

function specRiskLevel(specText) {
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
 * Classifies every fixture task from the plan, the sidecar, the spec's risk
 * level and the seed's sensitive-path configuration.
 */
export async function describeFixture() {
  const planText = readFileSync(FIXTURE_PLAN, 'utf8');
  const highRisk = specRiskLevel(readFileSync(FIXTURE_SPEC, 'utf8')) === 'high';
  const sensitiveGlobs = effectiveSensitivePaths(loadConfiguredSensitivePaths(SEED));

  const tasks = [];
  for (const region of planTaskRegions(planText)) {
    const { targetPaths: declared } = await readTaskFiles(FIXTURE_PLAN, region.id);
    const entry = lookupRoutingEntry(FIXTURE_PLAN, region.id);
    const sensitive = declared.filter((p) => sensitiveGlobs.some((g) => matchGlob(g, p)));
    const undeclared = [
      ...new Set(Array.from(proseLines(region.lines).join('\n').matchAll(BACKTICK_SRC_PATH), (m) => m[1])),
    ].filter((p) => !declared.includes(p));

    let role;
    if (sensitive.length > 0) role = 'sensitive-path';
    else if (entry.selected_agent !== 'auto-agent') role = entry.selected_agent;
    else if (!routeEasy(entry)) role = 'low-score';
    else if (undeclared.length > 0) role = 'tripwire-target';
    else role = 'lite-eligible';

    const provisional = sensitive.length > 0 || entry.selected_agent === 'human-only'
      ? 'full'
      : routeEasy(entry) && !highRisk ? 'lite' : 'quick';
    const expectedFinal = provisional === 'lite' && undeclared.length > 0 ? 'quick' : provisional;

    tasks.push({
      id: region.id,
      title: region.title,
      selected_agent: entry.selected_agent,
      routeEligible: routeEasy(entry),
      declared,
      role,
      ...(sensitive.length > 0 ? { sensitive } : {}),
      ...(undeclared.length > 0 ? { undeclared } : {}),
      liteArm: { provisional, expectedFinal },
    });
  }

  // liteEligible counts tasks expected to FINISH at lite under --lite, so the
  // tripwire target (granted lite provisionally, escalated at the final pass)
  // is ineligible here but counted in routeEligible.
  const liteEligible = tasks.filter((t) => t.liteArm.expectedFinal === 'lite').length;
  const sensitiveTask = tasks.find((t) => t.role === 'sensitive-path');
  const tripwireTask = tasks.find((t) => t.role === 'tripwire-target');
  return {
    plan: relative(REPO_ROOT, FIXTURE_PLAN),
    sidecar: relative(REPO_ROOT, FIXTURE_PLAN.replace(/\.plan\.md$/, '.routing.json')),
    specRiskLevel: specRiskLevel(readFileSync(FIXTURE_SPEC, 'utf8')),
    tasks: tasks.length,
    liteEligible,
    liteIneligible: tasks.length - liteEligible,
    routeEligible: tasks.filter((t) => t.routeEligible).length,
    counts: {
      liteEligible: 'tasks expected to finish at lite under the lite arm',
      routeEligible: "tasks passing route's easy rule (auto-agent, every score in [0.6, 1]), before floors and the tripwire",
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
    reuses: REUSES,
    liveOutput: 'results/<arm>-<ref-short>-<iso>.json',
    writes: [],
  };
}

export function implementPrompt(arm) {
  return ['/adev:implement', SANDBOX_PLAN, ...arm.implementArgs].join(' ');
}

function parseArgs(argv) {
  const opts = { dryRun: false, arm: null, ref: 'HEAD', runs: 3 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--arm') opts.arm = argv[++i];
    else if (a === '--ref') opts.ref = argv[++i];
    else if (a === '--runs') opts.runs = Number(argv[++i]);
    else throw new HarnessError('USAGE', `unknown argument '${a}'`);
  }
  if (!Number.isInteger(opts.runs) || opts.runs < 1) {
    throw new HarnessError('USAGE', '--runs must be an integer >= 1');
  }
  if (typeof opts.ref !== 'string' || opts.ref === '' || opts.ref.startsWith('-')) {
    throw new HarnessError('USAGE', '--ref must be a git ref that does not begin with "-"');
  }
  return opts;
}

function git(cwd, args, opts = {}) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
}

function resolveRef(ref) {
  try {
    return git(REPO_ROOT, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]);
  } catch {
    throw new HarnessError('INVALID_REF', `'${ref}' does not resolve to a commit`);
  }
}

function requireClaudeCli() {
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

function createShim(pluginRoot) {
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

function prepareSandbox({ pluginRoot, bin }) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'adev-ev1-sandbox-')));
  try {
    const env = trialEnv({ pluginRoot, bin, cwd: root });
    cpSync(SEED, root, { recursive: true });
    mkdirSync(join(root, SANDBOX_SPEC_DIR), { recursive: true });
    for (const f of ['example.spec.md', 'example.plan.md', 'example.routing.json']) {
      cpSync(join(FIXTURE, f), join(root, SANDBOX_SPEC_DIR, f));
    }
    git(root, ['init', '-q', '-b', 'eval/rigor-ladder']);
    git(root, ['config', 'user.name', 'adev-ev1']);
    git(root, ['config', 'user.email', 'adev-ev1@localhost']);
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'seed']);

    // /adev:implement's gate requires a passing plan step; the fixture plan is
    // pre-authored, so the step pair is recorded through the ref's own CLI.
    for (const status of [['--status', 'started'], ['--status', 'completed', '--verdict', 'PASS']]) {
      execFileSync('adev', ['report', '--type', 'step', '--spec', SANDBOX_SPEC, '--step', 'plan', ...status], {
        cwd: root,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    }
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'record plan step']);
    return { root, env, seedSha: git(root, ['rev-parse', 'HEAD']) };
  } catch (err) {
    rmSync(root, { recursive: true, force: true });
    throw err;
  }
}

function runClaude(sandbox, pluginRoot, prompt) {
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
  let sessionId = null;
  try {
    sessionId = JSON.parse(r.stdout).session_id ?? null;
  } catch {
    sessionId = null;
  }
  return { prompt, exitCode: r.status, sessionId, processMs: Date.now() - started };
}

function readJsonl(path) {
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

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// The session writer's final flush can land a beat after `claude` exits, so a
// read straight after the spawn can see no transcript yet.
function sessionUsage(sessionId, projectDir, { timeoutMs = 5000, pollMs = 250 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let usage = transcriptUsage([]);
  if (!sessionId) return usage;
  while (true) {
    usage = transcriptUsage(sessionTranscriptPaths(sessionId, projectDir));
    if (usage.transcripts > 0 || Date.now() >= deadline) return usage;
    sleepMs(pollMs);
  }
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

function implementWallClock(projectDir) {
  const events = readJsonl(join(projectDir, '.context-index', 'lifecycle-state', 'example.jsonl'));
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

function liveRun({ arm, pluginRoot, bin, refSha, runIndex, fixture }) {
  const sandbox = prepareSandbox({ pluginRoot, bin });
  try {
    const implement = runClaude(sandbox, pluginRoot, implementPrompt(arm));
    const implUsage = sessionUsage(implement.sessionId, sandbox.root);
    const { wallClockMs, verdict } = implementWallClock(sandbox.root);
    const taskCommits = Number(git(sandbox.root, ['rev-list', '--count', `${sandbox.seedSha}..HEAD`]));
    const validity = classifyRun({
      exitCode: implement.exitCode,
      verdict,
      taskCommits,
      sessionId: implement.sessionId,
      transcripts: implUsage.transcripts,
    });
    const qualityGates = runQualityGates(sandbox);
    const touched = git(sandbox.root, ['diff', '--name-only', sandbox.seedSha, 'HEAD']).split('\n').filter(Boolean);

    const defectIds = fixture.seededDefects.map((d) => d.id);
    const afterImplement = probeResults(sandbox, fixture.seededDefects, defectIds);
    const missed = defectIds.filter((id) => afterImplement[id] !== 'pass');
    let validate = null;
    let afterValidate = {};
    if (validity.valid && missed.length > 0) {
      const v = runClaude(sandbox, pluginRoot, `/adev:validate --spec ${SANDBOX_SPEC}`);
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

async function runLive(opts) {
  const arm = ARMS.find((a) => a.id === opts.arm);
  if (!arm) throw new HarnessError('USAGE', `--arm must be one of ${ARMS.map((a) => a.id).join('|')}`);
  if (!arm.live) {
    throw new HarnessError(
      'ARM_NOT_YET_AVAILABLE',
      `the '${arm.id}' arm needs the rigor-ladder resolver; use --dry-run to preview it, or --arm full`,
    );
  }
  const refSha = resolveRef(opts.ref);
  requireClaudeCli();
  const fixture = await describeFixture();

  spawnSync('git', ['worktree', 'prune'], { cwd: REPO_ROOT });
  const { parent, worktree } = addRefWorktree(refSha);
  let shim = null;
  const results = [];
  try {
    shim = createShim(worktree);
    assertArmCli({ pluginRoot: worktree, ...shim });
    mkdirSync(RESULTS_DIR, { recursive: true });
    for (let i = 1; i <= opts.runs; i++) {
      console.log(`[ev1] ${arm.id} run ${i}/${opts.runs} at ${refSha.slice(0, 12)}`);
      const result = liveRun({ arm, pluginRoot: worktree, bin: shim.bin, refSha, runIndex: i, fixture });
      const out = join(RESULTS_DIR, `${arm.id}-${refSha.slice(0, 12)}-${result.finished_at.replace(/[:.]/g, '-')}.json`);
      writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
      results.push(result);
      const status = result.valid ? 'valid' : `INVALID (${result.invalid_reasons.join(', ')})`;
      console.log(`[ev1] wrote ${relative(REPO_ROOT, out)}: ${status}, quality gates ${result.metrics.quality_gates.pass ? 'pass' : 'FAIL'}`);
    }
  } finally {
    if (shim) rmSync(shim.bin, { recursive: true, force: true });
    spawnSync('git', ['worktree', 'remove', '--force', worktree], { cwd: REPO_ROOT });
    rmSync(parent, { recursive: true, force: true });
    spawnSync('git', ['worktree', 'prune'], { cwd: REPO_ROOT });
  }
  const report = determinismReport(results.filter((r) => r.valid));
  if (report) console.log(report.markdown);
  return results.every((r) => r.valid && r.metrics.quality_gates.pass) ? 0 : 1;
}

async function main(argv) {
  const opts = parseArgs(argv);
  if (opts.dryRun) {
    console.log(JSON.stringify(await planDryRun(opts), null, 2));
    return 0;
  }
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
