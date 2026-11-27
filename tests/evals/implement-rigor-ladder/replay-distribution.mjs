#!/usr/bin/env node
// [local] EV-5 distribution replay for the implement rigor ladder.
//
// Deterministic and offline: it makes no model calls, and it reads nothing
// from the working tree. Every input is read from the commit `--ref` (default
// HEAD) names: the routing sidecars under `.context-index/specs/`, their plans
// and specs, and the risk policies, sensitive paths and boundaries. Each task's
// provisional depth comes from the shipped resolver, with `lite` authorized as
// by `--lite`.
//
// Final shares apply each provisionally-`lite` task's historical tripwire
// outcome: the files of every commit whose `Spec:` and `Plan-task:` trailers
// name the task, against its declared `Files:`, with the BEH-7 exemption and
// the regenerated-provider-mirror exemption. A trip is an escalation from
// `lite`, so the corpus trip rate is taken over provisionally-`lite` tasks
// with history, and given as fractional weights to those without; the result
// is an expected distribution rather than a sampled one. A provisionally
// `quick` task can still rise to `full` at the final pass through a touched
// sensitive or boundary path, which its own history (or the rate of that over
// `quick` tasks with history) decides.
//
// Exits 1 with EV5_TARGET_MISSED when the release target (lite >= 45%,
// full <= 20%) is not met, after writing the distribution.
//
//   node tests/evals/implement-rigor-ladder/replay-distribution.mjs [--ref <ref>] [--out <file>] [--project-root <dir>]

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isNeverExempt, isTripwireExempt, resolveImplementReviewDepth } from '../../../lib/implement/review-depth.mjs';
import { provisionalResolverInputs, riskLevelFromSpecText } from '../../../lib/implement/provisional-inputs.mjs';
import { loadGovernanceAtRunBase, readAtCommit } from '../../../lib/implement/run-base.mjs';
import { slugFromSpec } from '../../../lib/lifecycle-state.mjs';
import { parseRoutingSidecarText } from '../../../lib/plan-routing-sidecar.mjs';
import { taskIdKey } from '../../../lib/plan-task-id.mjs';
import { canonicalForMirror, generateMirrorBytes } from '../../../lib/sync/provider-skills.mjs';
import { matchGlob } from '../../../lib/test-strategies/manifest.mjs';
import { effectiveSensitivePaths } from '../../../lib/test-strategies/sensitive-paths.mjs';
import { readTaskFiles } from '../../../lib/test-strategies/task-files.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..');
const DEFAULT_OUT = join(HERE, 'results', 'distribution.json');
const RESOLVER_MODULE = relative(REPO_ROOT, fileURLToPath(new URL('../../../lib/implement/review-depth.mjs', import.meta.url)));

const SPECS_DIR = '.context-index/specs';
const SIDECAR_SUFFIX = '.routing.json';
const DEPTHS = ['lite', 'quick', 'full'];
const TARGET = { lite_min: 0.45, full_max: 0.2 };
const REGULAR_FILE_MODES = new Set(['100644', '100755']);

// loadGovernanceAtRunBase() reads the routing sidecar of the plan it is
// given; the replay reads each sidecar itself, so it passes a plan path that
// exists at no commit and ignores the resulting ROUTING_SIDECAR_MISSING.
// Governance then loads once, and no real sidecar can break it.
const GOVERNANCE_PROBE_PLAN = `${SPECS_DIR}/.ev5-replay-governance-probe.plan.md`;

// Files the orchestrator writes for every task, whatever the task: its own
// spec's lifecycle log, the plan's checkboxes, issue-tracker sync and session
// notes. They say nothing about the task's scope, so a trip on them alone
// would measure the bookkeeping, not the task.
const BOOKKEEPING = [
  'the spec\'s own .context-index/lifecycle-state/<slug>.jsonl',
  'the task\'s plan file',
  '.beads/**',
  '.context-index/sessions/**',
];

function git(cwd, args, { encoding = 'utf8' } = {}) {
  return execFileSync('git', args, { cwd, encoding, maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

function round4(x) {
  return Math.round(x * 1e4) / 1e4;
}

function zeroDepths() {
  return { lite: 0, quick: 0, full: 0 };
}

function oneHot(depth) {
  return { ...zeroDepths(), [depth]: 1 };
}

function tally(map, key) {
  map[key] = (map[key] ?? 0) + 1;
}

function normalizePath(p) {
  return p.replace(/^\.\//, '');
}

function sidecarsAt(projectRoot, sha) {
  return git(projectRoot, ['ls-tree', '-r', '--name-only', '-z', sha, '--', SPECS_DIR])
    .split('\0')
    .filter((p) => p.endsWith(SIDECAR_SUFFIX))
    .sort();
}

function specPathForPlan(planText, planRel) {
  const m = /^>\s*\*\*Spec:\*\*\s*(\S+)/m.exec(planText);
  if (m) return normalizePath(m[1].replace(/^`+|`+$/g, ''));
  return planRel.replace(/\.plan\.md$/, '.spec.md');
}

// A sidecar whose entries fail validation (a score on route's 1–5 scale, say)
// is still replayed from its raw entries: liteEligible() then denies those
// tasks `routing-scores`, which is BEH-5 (b)'s verdict on an invalid score.
function sidecarEntries(text, label, planRel, invalid) {
  try {
    return parseRoutingSidecarText(text, label);
  } catch (err) {
    if (err?.code !== 'INVALID_ROUTING_ENTRY') throw err;
    invalid.push({ plan: planRel, code: err.code });
    const raw = JSON.parse(text);
    return Array.isArray(raw?.entries) ? raw.entries : [];
  }
}

/** Commits carrying both a `Spec:` and a `Plan-task:` trailer, newest first. */
function trailerCommits(projectRoot, sha) {
  const out = [];
  for (const chunk of git(projectRoot, ['log', '--no-merges', '--format=%x1e%H%x1f%B', sha]).split('\x1e')) {
    if (!chunk.trim()) continue;
    const [hash, body = ''] = chunk.split('\x1f');
    const spec = /^Spec:\s*(\S+)\s*$/m.exec(body)?.[1];
    const tasks = [...body.matchAll(/^Plan-task:\s*(.+?)\s*$/gm)]
      .flatMap((m) => m[1].split(/[,\s]+/))
      .map(taskIdKey)
      .filter(Boolean);
    if (spec && tasks.length > 0) out.push({ sha: hash.trim(), spec: normalizePath(spec), tasks: [...new Set(tasks)] });
  }
  return out;
}

/** git's own records of a commit's changes, in computeTouchedFiles()'s shape. */
function commitRecords(projectRoot, sha) {
  const fields = git(projectRoot, ['diff-tree', '-r', '--root', '--no-commit-id', '--no-renames', '--raw', '-z', sha]).split('\0');
  const records = [];
  for (let i = 0; i + 1 < fields.length; i += 2) {
    const [src_mode, mode, , , status] = fields[i].slice(1).split(' ');
    records.push({ path: fields[i + 1], status, mode, src_mode });
  }
  return records;
}

function bookkeepingFilter(specRel, planRel) {
  let ownLog = null;
  try {
    ownLog = `.context-index/lifecycle-state/${slugFromSpec(specRel)}.jsonl`;
  } catch {
    ownLog = null;
  }
  return (p) =>
    p === ownLog || p === planRel || p.startsWith('.beads/') || p.startsWith('.context-index/sessions/');
}

function makeTreeReader(projectRoot) {
  const entries = new Map();
  const blobs = new Map();
  const entry = (sha, path) => {
    const key = `${sha}\0${path}`;
    if (!entries.has(key)) {
      const line = git(projectRoot, ['ls-tree', '-z', sha, '--', path]).split('\0')[0];
      const m = /^(\d{6}) (\w+) ([0-9a-f]+)\t(.*)$/.exec(line ?? '');
      entries.set(key, m && m[4] === path ? { mode: m[1], type: m[2], oid: m[3] } : null);
    }
    return entries.get(key);
  };
  const blob = (oid) => {
    if (!blobs.has(oid)) blobs.set(oid, git(projectRoot, ['cat-file', 'blob', oid], { encoding: 'buffer' }));
    return blobs.get(oid);
  };
  return { entry, blob };
}

/**
 * The resolver's regenerated-provider-mirror rule, applied to history instead
 * of the working tree. The runtime tripwire sees the task's combined diff at
 * the end of the task, so the mirror and its canonical file are read from the
 * task's newest commit (`endSha`): a mirror regenerated in an early commit and
 * left stale by a later canonical edit is not exempt. There the mirror blob
 * must equal generateMirrorBytes() of the canonical blob, and its git mode
 * must equal the canonical's, because the sync propagates the canonical's
 * executable bit: a mode move away from the canonical trips, and a chmod that
 * brings a drifted mirror back to the canonical's mode does not.
 * Returns null when the mirror is exempt, or the reason it is not.
 */
function mirrorVerdict(record, { declared, touched, tree, endSha }) {
  const { status } = record;
  if (status !== 'A' && status !== 'M' && status !== 'D') return 'provider-mirror-not-exact';
  const mode = status === 'D' ? record.src_mode : record.mode;
  if (isNeverExempt(record.path, mode) || !REGULAR_FILE_MODES.has(mode)) return 'provider-mirror-not-exact';
  const source = canonicalForMirror(record.path);
  if (!source) return 'providers-other';
  const canonical = touched.get(source.canonicalPath);
  if (!declared.has(source.canonicalPath) && !canonical) return 'provider-mirror-canonical-out-of-scope';
  if (status === 'D') return canonical?.status === 'D' ? null : 'provider-mirror-not-exact';
  if (canonical && canonical.status !== 'A' && canonical.status !== 'M') return 'provider-mirror-not-exact';
  const skillMd = tree.entry(endSha, `skills/${source.skillName}/SKILL.md`);
  const canon = tree.entry(endSha, source.canonicalPath);
  const mirror = tree.entry(endSha, record.path);
  if (![skillMd, canon, mirror].every((e) => e && e.type === 'blob' && REGULAR_FILE_MODES.has(e.mode))) {
    return 'provider-mirror-not-exact';
  }
  if (mirror.mode !== canon.mode) return 'provider-mirror-mode';
  return tree.blob(mirror.oid).equals(generateMirrorBytes(record.path, tree.blob(canon.oid)))
    ? null
    : 'provider-mirror-not-exact';
}

function scopeCause(path, mode) {
  if (mode === '120000') return 'symlink';
  const lower = path.toLowerCase();
  if (lower.startsWith('.context-index/specs/')) return 'context-index-specs';
  if (lower.startsWith('.context-index/lifecycle-state/')) return 'context-index-other-lifecycle-log';
  if (lower.split('/').includes('.context-index')) return 'context-index-other';
  if (lower.endsWith('.spec.md')) return 'spec-md';
  const segments = path.split('/');
  return segments.length === 1 ? '(root)' : segments[0];
}

/**
 * The tripwire's verdict on a task's historical changes, in liteTripwire()'s
 * leg order: a boundary or sensitive touched path gives `full`; else an
 * undeclared path that neither isTripwireExempt() nor the mirror rule exempts
 * gives `quick`. Each path's status is its newest touch across the task's
 * commits, and mirrors are judged at the task's newest commit, `endSha`.
 */
function tripOutcome(records, { declared, isBookkeeping, governance, sensitive, tree, endSha }) {
  const touched = new Map();
  for (const r of records) if (!isBookkeeping(r.path) && !touched.has(r.path)) touched.set(r.path, r);
  const kept = [...touched.values()];
  const paths = kept.map((r) => r.path);
  const legs = [];
  if (paths.length > 0 && governance.boundaryCheck(paths) === true) legs.push('boundary');
  if (paths.some((p) => sensitive.some((g) => matchGlob(g, p)))) legs.push('sensitive-path');
  if (legs.length > 0) return { outcome: 'full', legs, offending: [] };

  const declaredSet = new Set(declared);
  const offending = [];
  for (const r of kept) {
    const mode = r.status === 'D' ? r.src_mode : r.mode;
    if (declaredSet.has(r.path) || isTripwireExempt(r.path, mode)) continue;
    if (r.path.startsWith('providers/') && !isNeverExempt(r.path, mode)) {
      const reason = mirrorVerdict(r, { declared: declaredSet, touched, tree, endSha });
      if (reason !== null) offending.push({ path: r.path, cause: reason });
      continue;
    }
    offending.push({ path: r.path, cause: scopeCause(r.path, mode) });
  }
  return offending.length > 0
    ? { outcome: 'quick', legs: ['scope-mismatch'], offending }
    : { outcome: 'lite', legs: [], offending };
}

function shareOf(totals, n) {
  return Object.fromEntries(DEPTHS.map((d) => [d, n === 0 ? 0 : round4(totals[d] / n)]));
}

function rateOver(tasks, outcome) {
  return tasks.length === 0 ? 0 : round4(tasks.filter((t) => t.history.outcome === outcome).length / tasks.length);
}

/**
 * Replays the shipped resolver over every routing sidecar committed at `ref`.
 *
 * @param {{ projectRoot?: string, ref?: string }} [options]
 * @returns {Promise<object>} the distribution written to `results/distribution.json`
 */
export async function runReplay({ projectRoot = REPO_ROOT, ref = 'HEAD' } = {}) {
  const head = git(projectRoot, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]).trim();
  const governance = loadGovernanceAtRunBase({ projectRoot, runBase: head, planPath: GOVERNANCE_PROBE_PLAN });
  const sensitive = effectiveSensitivePaths(governance.sensitivePaths ?? []);
  const scratch = mkdtempSync(join(tmpdir(), 'adev-ev5-plans-'));

  const tasks = [];
  const plans = [];
  const invalidSidecars = [];
  try {
    for (const sidecarRel of sidecarsAt(projectRoot, head)) {
      const planRel = sidecarRel.slice(0, -SIDECAR_SUFFIX.length) + '.plan.md';
      const planText = readAtCommit(projectRoot, head, planRel);
      if (planText === null) continue;
      plans.push(planRel);
      const specRel = specPathForPlan(planText, planRel);
      const specText = readAtCommit(projectRoot, head, specRel);
      const riskLevel = specText === null ? 'medium' : riskLevelFromSpecText(specText);
      const entries = sidecarEntries(
        readAtCommit(projectRoot, head, sidecarRel),
        `${head}:${sidecarRel}`,
        planRel,
        invalidSidecars,
      );
      // readTaskFiles() reads a plan file, so the committed text is staged in
      // a scratch copy rather than read from the working tree.
      const planCopy = join(scratch, `${plans.length}.plan.md`);
      writeFileSync(planCopy, planText);
      for (const entry of entries) {
        const input = await provisionalResolverInputs({
          projectRoot,
          specPath: specRel,
          riskLevel,
          planPath: planCopy,
          taskId: entry.task_id,
          governance: { ...governance, routingEntries: entries },
          liteFlag: true,
        });
        const resolved = resolveImplementReviewDepth(input);
        tasks.push({
          plan: planRel,
          spec: specRel,
          risk_level: riskLevel,
          task_id: String(entry.task_id),
          key: taskIdKey(entry.task_id),
          selected_agent: entry.selected_agent ?? null,
          declared: (await readTaskFiles(planCopy, entry.task_id)).targetPaths,
          provisional: {
            depth: resolved.depth,
            source: resolved.source,
            floor_legs: resolved.floor_legs,
            lite_denied: resolved.lite_denied,
          },
        });
      }
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }

  const bySpecTask = new Map();
  for (const t of tasks) {
    const k = `${t.spec}\0${t.key}`;
    if (!bySpecTask.has(k)) bySpecTask.set(k, []);
    bySpecTask.get(k).push(t);
  }
  const commits = trailerCommits(projectRoot, head);
  const history = new Map();
  let matchedCommits = 0;
  // `commits` is newest first, so a task's first matching commit is its newest.
  for (const c of commits) {
    const targets = c.tasks.flatMap((key) => bySpecTask.get(`${c.spec}\0${key}`) ?? []);
    if (targets.length === 0) continue;
    matchedCommits++;
    const records = commitRecords(projectRoot, c.sha);
    for (const t of targets) {
      if (!history.has(t)) history.set(t, { commits: 0, records: [], endSha: c.sha });
      const h = history.get(t);
      h.commits++;
      h.records.push(...records);
    }
  }

  const tree = makeTreeReader(projectRoot);
  for (const t of tasks) {
    const h = history.get(t);
    t.history = h
      ? {
          commits: h.commits,
          ...tripOutcome(h.records, {
            declared: t.declared,
            isBookkeeping: bookkeepingFilter(t.spec, t.plan),
            governance,
            sensitive,
            tree,
            endSha: h.endSha,
          }),
        }
      : null;
  }

  const matchedLite = tasks.filter((t) => t.history !== null && t.provisional.depth === 'lite');
  const matchedQuick = tasks.filter((t) => t.history !== null && t.provisional.depth === 'quick');
  const rate = { matched_tasks: matchedLite.length, quick: rateOver(matchedLite, 'quick'), full: rateOver(matchedLite, 'full') };
  const quickFloorRate = { matched_tasks: matchedQuick.length, full: rateOver(matchedQuick, 'full') };

  const floorLegs = { provisional: {}, tripwire: {} };
  const liteDenied = {};
  const tripCauses = {};
  for (const t of tasks) {
    for (const leg of t.provisional.floor_legs) tally(floorLegs.provisional, leg);
    if (t.provisional.lite_denied) tally(liteDenied, t.provisional.lite_denied);
    const p = t.provisional.depth;
    if (p === 'full') {
      t.final = oneHot('full');
      t.final_basis = 'provisional';
    } else if (t.history) {
      t.final_basis = 'history';
      if (p === 'lite') {
        t.final = oneHot(t.history.outcome);
        for (const leg of t.history.legs) tally(floorLegs.tripwire, leg);
        for (const cause of new Set(t.history.offending.map((o) => o.cause))) tally(tripCauses, cause);
      } else {
        t.final = oneHot(t.history.outcome === 'full' ? 'full' : 'quick');
      }
    } else {
      t.final_basis = 'corpus-rate';
      t.final = p === 'lite'
        ? { lite: round4(1 - rate.quick - rate.full), quick: rate.quick, full: rate.full }
        : { lite: 0, quick: round4(1 - quickFloorRate.full), full: quickFloorRate.full };
    }
  }

  const perPlan = [];
  for (const planRel of plans) {
    const mine = tasks.filter((t) => t.plan === planRel);
    if (mine.length === 0) continue;
    const provisional = zeroDepths();
    const final = zeroDepths();
    for (const t of mine) {
      provisional[t.provisional.depth]++;
      for (const d of DEPTHS) final[d] += t.final[d];
    }
    for (const d of DEPTHS) final[d] = round4(final[d]);
    perPlan.push({ plan: planRel, spec: mine[0].spec, risk_level: mine[0].risk_level, tasks: mine.length, provisional, final });
  }

  const provisionalTotals = zeroDepths();
  const finalTotals = zeroDepths();
  for (const t of tasks) {
    provisionalTotals[t.provisional.depth]++;
    for (const d of DEPTHS) finalTotals[d] += t.final[d];
  }
  const shares = shareOf(finalTotals, tasks.length);

  return {
    resolverModule: RESOLVER_MODULE,
    head,
    corpus: { plans: perPlan.length, tasks: tasks.length, trailer_commits: commits.length, matched_commits: matchedCommits },
    invalid_sidecars: invalidSidecars,
    bookkeeping: BOOKKEEPING,
    trip_rate: rate,
    quick_floor_rate: quickFloorRate,
    provisional_shares: shareOf(provisionalTotals, tasks.length),
    shares,
    target: { ...TARGET, met: shares.lite >= TARGET.lite_min && shares.full <= TARGET.full_max },
    floor_legs: floorLegs,
    trip_causes: tripCauses,
    lite_denied: liteDenied,
    per_plan: perPlan,
    per_task: tasks.map((t) => ({
      plan: t.plan,
      task_id: t.task_id,
      selected_agent: t.selected_agent,
      provisional: t.provisional,
      history: t.history,
      final: t.final,
      final_basis: t.final_basis,
    })),
  };
}

function parseArgs(argv) {
  const opts = { projectRoot: REPO_ROOT, ref: 'HEAD', out: DEFAULT_OUT };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith('-')) throw new Error(`USAGE: ${a} needs a value`);
      return v;
    };
    if (a === '--project-root') opts.projectRoot = resolve(value());
    else if (a === '--ref') opts.ref = value();
    else if (a === '--out') opts.out = resolve(value());
    else throw new Error(`USAGE: unknown argument '${a}'`);
  }
  return opts;
}

const pct = (x) => `${(x * 100).toFixed(1)}%`;

async function main(argv) {
  const opts = parseArgs(argv);
  const result = await runReplay(opts);
  mkdirSync(dirname(opts.out), { recursive: true });
  writeFileSync(opts.out, `${JSON.stringify(result, null, 2)}\n`);
  const { shares, target } = result;
  console.log(
    `[ev5] ${result.corpus.tasks} tasks in ${result.corpus.plans} plans at ${result.head.slice(0, 12)}: ` +
      `lite ${pct(shares.lite)} | quick ${pct(shares.quick)} | full ${pct(shares.full)} ` +
      `(target lite >= ${pct(target.lite_min)}, full <= ${pct(target.full_max)}: ${target.met ? 'met' : 'NOT met'})`,
  );
  console.log(`[ev5] wrote ${opts.out}`);
  if (!target.met) {
    process.stderr.write(
      `replay-distribution: EV5_TARGET_MISSED: lite ${pct(shares.lite)} (min ${pct(target.lite_min)}), ` +
        `full ${pct(shares.full)} (max ${pct(target.full_max)})\n`,
    );
    return 1;
  }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      process.stderr.write(`replay-distribution: ${err.message}\n`);
      process.exitCode = 1;
    },
  );
}
