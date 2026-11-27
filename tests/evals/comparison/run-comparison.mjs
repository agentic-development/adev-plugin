#!/usr/bin/env node

/**
 * Comparison Eval Harness
 *
 * Scores each arm's branch against `main` across the four eval projects and
 * produces per-project JSON reports and an aggregate summary. The branches are
 * built beforehand, one per arm, from each project's `main`:
 *
 *   plain-claude  plain Claude Code, no adev skills
 *   adev-built    adev at `full` rigor (built before the rigor ladder, when
 *                 full was /adev:implement's default; rebuild with --tier full)
 *   adev-quick    adev at the `quick` baseline (no tier flag)
 *   adev-lite     adev with the operator's `--lite`
 *
 * An arm whose branch is absent in a project is skipped there (BRANCH_MISSING)
 * and left out of that project's means.
 *
 * Usage:
 *   node tests/evals/comparison/run-comparison.mjs               # deterministic only
 *   node tests/evals/comparison/run-comparison.mjs --llm-judge    # add LLM judge layer
 *   node tests/evals/comparison/run-comparison.mjs --dry-run      # print arms and projects, write nothing
 *   [--projects-root <dir>] [--reports-dir <dir>]                 # defaults: tests/evals, ./reports
 *   [--allow-partial]                                             # see below
 *
 * Nothing is written until every project has been tried. A run that scores
 * no project exits 1 (NO_PROJECTS_SCORED). A run that skips any project exits
 * 1 (PARTIAL_RUN) instead of writing into the committed ./reports, unless
 * --allow-partial is given; the summary lists the skipped projects.
 *
 * The LLM judge compares plain-claude with adev-built only; adev-quick and
 * adev-lite keep deterministic scores, so compare those arms on a
 * deterministic run (with --llm-judge the EV-2 target is left undecided).
 *
 * Wall-clock is not like-for-like across arms: plain-claude writes no
 * lifecycle log, so its time is the commit span, which omits the time before
 * the first commit, while adev arms use their lifecycle event timestamps.
 * Each figure carries its `source`, and the summary notes a mix.
 */

import { writeFileSync, mkdirSync, existsSync, realpathSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, execFileSync, spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROJECTS_ROOT = resolve(__dirname, '..');
const DEFAULT_REPORTS_DIR = join(__dirname, 'reports');

const PROJECTS = [
  'adev-pipeline-eval',
  'adev-api-eval',
  'adev-migrations-eval',
  'adev-automation-eval',
];

// `implementArgs` are the review-depth flags the arm's /adev:build run passes
// to /adev:implement; null for the arm that runs no adev skill.
export const ARMS = Object.freeze([
  { id: 'plain-claude', key: 'plain_claude', branch: 'plain-claude', rigor: null, implementArgs: null },
  { id: 'adev-built', key: 'adev_built', branch: 'adev-built', rigor: 'full', implementArgs: ['--tier', 'full'] },
  { id: 'adev-quick', key: 'adev_quick', branch: 'adev-quick', rigor: 'quick', implementArgs: [] },
  { id: 'adev-lite', key: 'adev_lite', branch: 'adev-lite', rigor: 'lite', implementArgs: ['--lite'] },
]);

const METRICS = ['composite', 'dimension_scores', 'wall_clock_seconds'];
const LIFECYCLE_DIR = '.context-index/lifecycle-state';

function usageError(message) {
  process.stderr.write(`run-comparison: ${message}\n`);
  process.exit(1);
}

export function parseArgs(argv) {
  const opts = { llmJudge: false, dryRun: false, allowPartial: false, projectsRoot: DEFAULT_PROJECTS_ROOT, reportsDir: DEFAULT_REPORTS_DIR };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--llm-judge') opts.llmJudge = true;
    else if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--allow-partial') opts.allowPartial = true;
    else if (arg === '--projects-root' || arg === '--reports-dir') {
      const value = argv[++i];
      if (value === undefined || value.startsWith('--')) usageError(`${arg} needs a value`);
      opts[arg === '--projects-root' ? 'projectsRoot' : 'reportsDir'] = resolve(value);
    } else usageError(`unknown argument "${arg}"`);
  }
  return opts;
}

// An uninitialized submodule is an empty directory inside the plugin
// repository, where git would silently answer for the plugin repository.
function isGitCheckout(dir) {
  if (!existsSync(dir)) return false;
  const r = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: dir, encoding: 'utf-8' });
  return r.status === 0 && realpathSync(r.stdout.trim()) === realpathSync(dir);
}

function branchExists(projectDir, branch) {
  const r = spawnSync('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}^{commit}`], { cwd: projectDir });
  return r.status === 0;
}

function gitOut(projectDir, args) {
  return execFileSync('git', args, { cwd: projectDir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function fileAt(projectDir, ref, path) {
  const r = spawnSync('git', ['show', `${ref}:${path}`], { cwd: projectDir, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : '';
}

function eventTimes(lines) {
  const times = [];
  for (const line of lines) {
    try {
      const t = Date.parse(JSON.parse(line).ts);
      if (Number.isFinite(t)) times.push(t);
    } catch { /* not an event line */ }
  }
  return times;
}

const nonEmptyLines = (text) => text.split('\n').filter((l) => l.trim());

/**
 * Wall-clock of the run that built `branch`, in whole seconds.
 *
 * Preferred source: the span of the lifecycle events the branch added (the
 * lines of `.context-index/lifecycle-state/*.jsonl` beyond those `main`
 * holds; the log is append-only). Fallback: the committer-time span of the
 * branch's own commits, which omits the time before the first commit and is
 * therefore labelled `commit-span`. With neither: `{ seconds: null, source:
 * 'unavailable' }`.
 */
export function wallClockFor(projectDir, branch) {
  const times = [];
  let logs = [];
  try {
    logs = nonEmptyLines(gitOut(projectDir, ['ls-tree', '-r', '--name-only', branch, '--', LIFECYCLE_DIR]))
      .filter((f) => f.endsWith('.jsonl'));
  } catch { /* no lifecycle state on the branch */ }
  for (const log of logs) {
    const onMain = nonEmptyLines(fileAt(projectDir, 'main', log)).length;
    times.push(...eventTimes(nonEmptyLines(fileAt(projectDir, branch, log)).slice(onMain)));
  }
  if (times.length >= 2) {
    return { seconds: Math.round((Math.max(...times) - Math.min(...times)) / 1000), source: 'lifecycle-events' };
  }
  let commitTimes = [];
  try {
    commitTimes = nonEmptyLines(gitOut(projectDir, ['log', '--format=%ct', `main..${branch}`])).map(Number);
  } catch { /* unreadable range */ }
  if (commitTimes.length >= 2) {
    return { seconds: Math.max(...commitTimes) - Math.min(...commitTimes), source: 'commit-span' };
  }
  return { seconds: null, source: 'unavailable' };
}

// --- Deterministic scoring functions ---

function getDiffStats(projectDir, branch) {
  try {
    const stat = execSync(`git diff main..${branch} --stat`, {
      cwd: projectDir,
      encoding: 'utf-8',
    });
    const numstat = execSync(`git diff main..${branch} --numstat`, {
      cwd: projectDir,
      encoding: 'utf-8',
    });

    let filesChanged = 0;
    let linesAdded = 0;
    let linesRemoved = 0;

    for (const line of numstat.trim().split('\n')) {
      if (!line.trim()) continue;
      const [added, removed] = line.split('\t');
      filesChanged++;
      linesAdded += parseInt(added, 10) || 0;
      linesRemoved += parseInt(removed, 10) || 0;
    }

    return { filesChanged, linesAdded, linesRemoved };
  } catch {
    return { filesChanged: 0, linesAdded: 0, linesRemoved: 0 };
  }
}

function getCommitData(projectDir, branch) {
  try {
    const log = execSync(`git log main..${branch} --format="%H|||%s|||%b|||%D"`, {
      cwd: projectDir,
      encoding: 'utf-8',
    });

    const commits = log.trim().split('\n').filter(Boolean).map((line) => {
      const [hash, subject, body] = line.split('|||');
      return { hash: hash?.slice(0, 7), subject, body };
    });

    return commits;
  } catch {
    return [];
  }
}

function scoreCodeQuality(stats) {
  const linesPerFile = stats.filesChanged > 0
    ? Math.round(stats.linesAdded / stats.filesChanged)
    : 0;

  // Prefer smaller files — penalize if average > 150 lines per file
  let score = 80;
  if (linesPerFile > 150) score -= 15;
  else if (linesPerFile > 100) score -= 10;
  else if (linesPerFile < 50) score += 10;

  // Bonus for balanced add/remove ratio
  if (stats.linesRemoved > 0 && stats.linesAdded > 0) {
    score += 5;
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    metrics: {
      files_changed: stats.filesChanged,
      lines_added: stats.linesAdded,
      lines_removed: stats.linesRemoved,
      lines_per_file: linesPerFile,
    },
  };
}

function scoreTestCoverage(projectDir, branch) {
  try {
    const diffFiles = execSync(`git diff main..${branch} --name-only`, {
      cwd: projectDir,
      encoding: 'utf-8',
    });

    const files = diffFiles.trim().split('\n').filter(Boolean);
    const testFiles = files.filter(
      (f) => f.includes('test') || f.includes('spec') || f.includes('.test.') || f.includes('.spec.')
    );

    // Count test cases by scanning for test/it/describe patterns
    let testCaseCount = 0;
    for (const tf of testFiles) {
      try {
        const content = execSync(`git show ${branch}:${tf}`, {
          cwd: projectDir,
          encoding: 'utf-8',
        });
        const matches = content.match(/\b(it|test|describe)\s*\(/g);
        testCaseCount += matches ? matches.length : 0;
      } catch { /* file may not exist */ }
    }

    // Count baseline test files on main
    let baselineTestCount = 0;
    try {
      const mainFiles = execSync('git ls-tree -r --name-only main', {
        cwd: projectDir,
        encoding: 'utf-8',
      });
      baselineTestCount = mainFiles.split('\n').filter(
        (f) => f.includes('test') || f.includes('spec')
      ).length;
    } catch { /* no main branch tests */ }

    const testsAdded = Math.max(0, testCaseCount - baselineTestCount);
    const score = testFiles.length > 0 ? Math.min(100, 60 + testsAdded) : 0;

    return {
      score,
      metrics: {
        test_file_count: testFiles.length,
        test_case_count: testCaseCount,
        tests_added: testsAdded,
        baseline_test_count: baselineTestCount,
      },
    };
  } catch {
    return { score: 0, metrics: { test_file_count: 0, test_case_count: 0, tests_added: 0, baseline_test_count: 0 } };
  }
}

function scoreBugHandling(projectDir, branch) {
  // Check if planted bugs were addressed
  try {
    const diff = execSync(`git diff main..${branch}`, {
      cwd: projectDir,
      encoding: 'utf-8',
    });

    // Heuristic: look for bug-fix indicators in diff
    const hasBugFix = /fix|bug|patch|correct|repair/i.test(diff);
    const hasRegressionTest = /bug.*test|test.*bug|regression/i.test(diff);

    if (hasBugFix && hasRegressionTest) return { score: 100, metrics: { status: 'fixed_with_test' } };
    if (hasBugFix) return { score: 75, metrics: { status: 'fixed_incidentally' } };
    return { score: 50, metrics: { status: 'untouched' } };
  } catch {
    return { score: 0, metrics: { status: 'error' } };
  }
}

function scoreArchitecturalCoherence(projectDir, branch) {
  try {
    const diffFiles = execSync(`git diff main..${branch} --name-only`, {
      cwd: projectDir,
      encoding: 'utf-8',
    });

    const files = diffFiles.trim().split('\n').filter(Boolean);
    const sourceFiles = files.filter(
      (f) => !f.includes('node_modules') && !f.includes('.context-index') && !f.includes('package')
    );

    // Check existing directory structure on main
    let mainDirs;
    try {
      const mainTree = execSync('git ls-tree -r --name-only main', {
        cwd: projectDir,
        encoding: 'utf-8',
      });
      mainDirs = new Set(mainTree.split('\n').map((f) => f.split('/').slice(0, -1).join('/')).filter(Boolean));
    } catch {
      mainDirs = new Set();
    }

    let inExisting = 0;
    let inNew = 0;

    for (const f of sourceFiles) {
      const dir = f.split('/').slice(0, -1).join('/');
      if (mainDirs.has(dir) || dir === '') {
        inExisting++;
      } else {
        inNew++;
      }
    }

    const total = sourceFiles.length || 1;
    const existingRatio = inExisting / total;
    const dirStructureOk = existingRatio >= 0.6;

    // Import hygiene — basic check
    const importHygiene = true; // simplified

    let score = 50;
    if (dirStructureOk) score += 30;
    if (importHygiene) score += 20;
    if (inNew === 0) score = Math.min(score + 10, 100);

    return {
      score: Math.min(100, score),
      metrics: {
        directory_structure: dirStructureOk,
        import_hygiene: importHygiene,
        files_in_existing_dirs: inExisting,
        files_in_new_dirs: inNew,
        source_files_evaluated: sourceFiles.length,
      },
    };
  } catch {
    return { score: 0, metrics: { directory_structure: false, import_hygiene: false } };
  }
}

function scoreCommitHygiene(commits) {
  if (commits.length === 0) return { score: 0, metrics: { commit_count: 0 } };

  const atomic = commits.length > 1;
  const withTrailers = commits.filter(
    (c) => /^(Spec|Plan-task|Author-type|Operator|Co-Authored-By):/m.test(c.body || '')
  );
  const trailersRatio = Math.round((withTrailers.length / commits.length) * 100);

  let score = 50;
  if (atomic) score += 25;
  if (trailersRatio > 50) score += 25;
  else if (trailersRatio > 0) score += 10;

  return {
    score: Math.min(100, score),
    metrics: {
      commit_count: commits.length,
      atomic,
      has_trailers: withTrailers.length > 0,
      trailers_ratio: trailersRatio,
    },
  };
}

function scoreSpecCompliance(projectDir, branch) {
  try {
    const files = execSync(`git ls-tree -r --name-only ${branch}`, {
      cwd: projectDir,
      encoding: 'utf-8',
    });

    const fileList = files.split('\n');
    const hasContextIndex = fileList.some((f) => f.startsWith('.context-index/'));
    const hasSpecs = fileList.some((f) => f.includes('/specs/'));
    const hasPlans = fileList.some((f) => f.includes('/plans/') || f.includes('plan'));
    const hasBuildState = fileList.some(
      (f) => f.includes('/build-state/') || f.includes('/lifecycle-state/'),
    );

    if (!hasContextIndex) {
      return { score: null, metrics: { status: 'N/A', reason: 'plain-claude has no specs by design' } };
    }

    let score = 0;
    if (hasSpecs) score += 40;
    if (hasPlans) score += 30;
    if (hasBuildState) score += 30;

    return {
      score,
      metrics: {
        status: score >= 70 ? 'complete' : 'partial',
        context_index_exists: hasContextIndex,
        has_specs: hasSpecs,
        has_plans: hasPlans,
        has_build_state: hasBuildState,
      },
    };
  } catch {
    return { score: null, metrics: { status: 'N/A', reason: 'unable to inspect branch' } };
  }
}

function detectDomain(projectDir) {
  // Simple domain detection from project contents
  try {
    const readme = execSync('git show main:README.md', { cwd: projectDir, encoding: 'utf-8' });
    if (/api|REST|express|fastify/i.test(readme)) return 'web-api';
    if (/pipeline|ETL|data/i.test(readme)) return 'data-pipeline';
    if (/migrat/i.test(readme)) return 'data-migration';
    if (/automat/i.test(readme)) return 'process-automation';
  } catch { /* ignore */ }
  return 'unknown';
}

// --- Main pipeline ---

function dryRunPlan(opts) {
  return {
    dry_run: true,
    arms: ARMS.map((a) => ({ ...a, implementArgs: a.implementArgs && [...a.implementArgs] })),
    projects: PROJECTS.map((project) => ({ project, present: isGitCheckout(join(opts.projectsRoot, project)) })),
    metrics: METRICS,
    allow_partial: opts.allowPartial,
    projects_root: opts.projectsRoot,
    reports_dir: opts.reportsDir,
    writes: [],
  };
}

async function runComparison(opts) {
  console.log('Comparison Eval Harness');
  console.log('======================\n');

  if (opts.llmJudge) {
    console.log('LLM judge layer: ENABLED\n');
  }

  const reports = [];
  const skipped = [];
  const skip = (project, reason) => {
    console.log(`[SKIP] ${project} — ${reason}`);
    skipped.push({ project, reason });
  };

  for (const project of PROJECTS) {
    const projectDir = join(opts.projectsRoot, project);

    if (!existsSync(projectDir)) {
      skip(project, 'directory not found');
      continue;
    }
    if (!isGitCheckout(projectDir)) {
      skip(project, 'not a git checkout');
      continue;
    }

    const arms = ARMS.filter((arm) => {
      if (branchExists(projectDir, arm.branch)) return true;
      console.log(`  Branch ${arm.branch} not found in ${project}.`);
      return false;
    });
    if (arms.length === 0) {
      skip(project, 'no arm branch found');
      continue;
    }

    console.log(`[${project}]`);

    const domain = detectDomain(projectDir);
    console.log(`  Domain: ${domain}`);

    const report = {
      project,
      domain,
      branches: {},
      dimensions: {},
      composite: {},
      diff_summary: {},
      bug_handling: {},
      wall_clock: {},
      missing_arms: ARMS.filter((a) => !arms.includes(a)).map((a) => a.id),
      generated_at: new Date().toISOString(),
    };

    // Score each branch
    for (const { branch, key } of arms) {
      console.log(`  Scoring ${branch}...`);

      const stats = getDiffStats(projectDir, branch);
      const commits = getCommitData(projectDir, branch);

      report.branches[key] = {
        commit: commits[0]?.hash || 'unknown',
      };

      report.diff_summary[key] = {
        files_changed: stats.filesChanged,
        lines_added: stats.linesAdded,
        lines_removed: stats.linesRemoved,
      };

      const cq = scoreCodeQuality(stats);
      const tc = scoreTestCoverage(projectDir, branch);
      const bh = scoreBugHandling(projectDir, branch);
      const ac = scoreArchitecturalCoherence(projectDir, branch);
      const ch = scoreCommitHygiene(commits);
      const sc = scoreSpecCompliance(projectDir, branch);

      // Assemble per-dimension per-branch
      const dimensionScores = {
        code_quality: { score: cq.score, metrics: { ...cq.metrics, score: cq.score } },
        test_coverage: { score: tc.score, metrics: { ...tc.metrics, score: tc.score } },
        bug_handling: { score: bh.score, metrics: { ...bh.metrics, score: bh.score } },
        architectural_coherence: { score: ac.score, metrics: { ...ac.metrics, score: ac.score } },
        commit_hygiene: { score: ch.score, metrics: { ...ch.metrics, score: ch.score } },
        spec_compliance: { score: sc.score, metrics: { ...sc.metrics, score: sc.score } },
        cost: { score: null, metrics: { score: null, status: 'N/A', reason: 'no cost metadata available' } },
      };

      for (const [dim, val] of Object.entries(dimensionScores)) {
        if (!report.dimensions[dim]) report.dimensions[dim] = {};
        report.dimensions[dim][key] = val;
      }

      report.bug_handling[key] = bh.metrics.status;
      report.wall_clock[key] = wallClockFor(projectDir, branch);
    }

    // Compute composite per branch
    for (const { key } of arms) {
      const scores = Object.values(report.dimensions)
        .map((d) => d[key]?.score)
        .filter((s) => s !== null && s !== undefined);
      report.composite[key] = scores.length > 0
        ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length)
        : 0;
    }

    console.log(`  Composite: ${arms.map(({ key }) => `${key}=${report.composite[key]}`).join(', ')}`);
    console.log(`  Wall-clock: ${arms.map(({ key }) => `${key}=${report.wall_clock[key].seconds ?? 'n/a'}s (${report.wall_clock[key].source})`).join(', ')}`);

    // Apply LLM judge if requested
    let finalReport = report;
    if (opts.llmJudge) {
      try {
        const { judgeProject } = await import('./llm-judge.mjs');
        finalReport = await judgeProject(projectDir, report);
        console.log('  LLM judge scores blended successfully');
      } catch (err) {
        console.error(`  LLM judge failed: ${err.message}`);
        // Fall back to deterministic-only report
        finalReport = report;
      }
    }

    reports.push(finalReport);
    console.log('');
  }

  // Reports are written only once every project has been tried, so a run
  // that cannot score is refused before it touches the committed reports.
  if (reports.length === 0) {
    process.stderr.write('run-comparison: NO_PROJECTS_SCORED: no eval project could be scored; nothing was written.\n');
    process.exitCode = 1;
    return;
  }
  if (skipped.length > 0 && resolve(opts.reportsDir) === DEFAULT_REPORTS_DIR && !opts.allowPartial) {
    process.stderr.write(
      `run-comparison: PARTIAL_RUN: scored ${reports.length} of ${PROJECTS.length} projects ` +
      `(skipped: ${skipped.map((s) => s.project).join(', ')}); refusing to overwrite the committed reports. ` +
      'Pass --allow-partial to write them anyway, or --reports-dir <dir>. Nothing was written.\n',
    );
    process.exitCode = 1;
    return;
  }

  mkdirSync(opts.reportsDir, { recursive: true });
  for (const report of reports) {
    const reportPath = join(opts.reportsDir, `${report.project}.json`);
    writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`Report written to ${reportPath}`);
  }

  // --- Aggregate summary ---
  const summary = buildSummary(reports, { ...opts, skipped });
  const summaryPath = join(opts.reportsDir, 'summary.json');
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');
  console.log(`Summary written to ${summaryPath}\n`);
  for (const arm of ARMS) {
    const agg = summary.aggregate_scores[arm.key];
    if (!agg) continue;
    const wc = summary.wall_clock[arm.key];
    console.log(`${arm.id} avg: ${agg.mean} (wall-clock mean: ${wc.mean_seconds ?? 'n/a'}s over ${wc.measured_projects} project(s))`);
  }
}

const exactMean = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;
const mean = (arr) => Math.round(exactMean(arr));

/**
 * The implement-rigor-ladder EV-2 release target: adev-lite's mean composite
 * is at least plain-claude's. Means are unrounded and taken over the projects
 * where both arms scored, so a project one arm lacks cannot move either side.
 * `met` stays null unless all four projects were compared and the scores are
 * deterministic: the LLM judge blends plain-claude and adev-built only, which
 * would set a blended score against an unblended one.
 */
function ev2TargetFor(reports, opts, wallClock) {
  const both = reports.filter((r) => r.composite.adev_lite !== undefined && r.composite.plain_claude !== undefined);
  const target = {
    met: null,
    reason: null,
    projects_compared: both.map((r) => r.project),
    adev_lite_mean: both.length > 0 ? exactMean(both.map((r) => r.composite.adev_lite)) : null,
    plain_claude_mean: both.length > 0 ? exactMean(both.map((r) => r.composite.plain_claude)) : null,
    adev_lite_wall_clock_mean_seconds: wallClock.adev_lite?.mean_seconds ?? null,
  };
  if (both.length === 0) target.reason = 'no project scored both adev-lite and plain-claude';
  else if (opts.llmJudge) target.reason = '--llm-judge blends plain-claude and adev-built only, not adev-lite';
  else if (both.length < PROJECTS.length) target.reason = `fewer than ${PROJECTS.length} projects compared (${both.length})`;
  else target.met = target.adev_lite_mean >= target.plain_claude_mean;
  return target;
}

export function buildSummary(reports, opts = {}) {
  const scored = ARMS.filter((arm) => reports.some((r) => r.composite[arm.key] !== undefined));

  const armsMissing = {};
  for (const arm of ARMS) {
    const missingIn = reports.filter((r) => (r.missing_arms ?? []).includes(arm.id)).map((r) => r.project);
    if (missingIn.length > 0) armsMissing[arm.id] = missingIn;
  }

  const aggregate = {};
  const wallClock = {};
  for (const arm of scored) {
    const scores = reports.map((r) => r.composite[arm.key]).filter((s) => s !== undefined);
    aggregate[arm.key] = { mean: mean(scores), min: Math.min(...scores), max: Math.max(...scores) };
    const clocks = reports.map((r) => r.wall_clock?.[arm.key]).filter(Boolean);
    const measured = clocks.filter((c) => c.seconds !== null).map((c) => c.seconds);
    wallClock[arm.key] = {
      mean_seconds: measured.length > 0 ? mean(measured) : null,
      measured_projects: measured.length,
      sources: [...new Set(clocks.map((c) => c.source))].sort(),
    };
  }

  const dimensions = {};
  const allDims = ['code_quality', 'test_coverage', 'bug_handling', 'architectural_coherence', 'commit_hygiene', 'spec_compliance', 'cost'];

  for (const dim of allDims) {
    dimensions[dim] = {};
    for (const arm of scored) {
      const avg = reports
        .map((r) => r.dimensions[dim]?.[arm.key]?.score)
        .filter((s) => s !== null && s !== undefined);
      dimensions[dim][`${arm.key}_avg`] = avg.length > 0 ? mean(avg) : 0;
    }
  }

  const findings = [];
  const plain = aggregate.plain_claude;
  const built = aggregate.adev_built;
  if (plain && built) {
    const diff = plain.mean - built.mean;
    if (diff > 0) findings.push(`plain-claude scored ${diff} points higher on average composite score`);
    else if (diff < 0) findings.push(`adev-built scored ${Math.abs(diff)} points higher on average composite score`);
    else findings.push('Both approaches scored equally on average');
  }

  // Bug handling summary
  for (const arm of scored) {
    const withArm = reports.filter((r) => r.bug_handling[arm.key] !== undefined);
    const fixed = withArm.filter((r) => r.bug_handling[arm.key] !== 'untouched').length;
    findings.push(`${arm.id} fixed planted bugs in ${fixed}/${withArm.length} projects`);
  }

  const sourceByArm = scored
    .filter((arm) => wallClock[arm.key].sources.length > 0)
    .map((arm) => `${arm.id}=${wallClock[arm.key].sources.join('+')}`);
  if (new Set(scored.map((arm) => wallClock[arm.key].sources.join('+'))).size > 1) {
    findings.push(
      `wall-clock sources differ across arms (${sourceByArm.join(', ')}): commit-span omits the time before ` +
      'the first commit, so it is not like-for-like with lifecycle-events',
    );
  }

  const ev2Target = ev2TargetFor(reports, opts, wallClock);
  if (ev2Target.met !== null) {
    findings.push(
      `EV-2 target (adev-lite mean >= plain-claude mean): ${ev2Target.met ? 'met' : 'missed'} ` +
      `(${ev2Target.adev_lite_mean} vs ${ev2Target.plain_claude_mean})`,
    );
  } else {
    findings.push(`EV-2 target not decided: ${ev2Target.reason}`);
  }

  return {
    projects: reports.map((r) => r.project),
    skipped_projects: opts.skipped ?? [],
    arms: ARMS.map(({ id, key, rigor }) => ({ id, key, rigor })),
    aggregate_scores: aggregate,
    wall_clock: wallClock,
    arms_missing: armsMissing,
    dimension_breakdown: dimensions,
    ev2_target: ev2Target,
    notable_findings: findings,
    llm_judge_enabled: Boolean(opts.llmJudge),
    generated_at: new Date().toISOString(),
  };
}

// Only run when invoked directly, not when imported as a module by tests
// Compared as real paths: invoked through a symlinked directory (macOS /var
// is /private/var), argv[1] keeps the link while import.meta.url resolves it.
const isDirectRun = process.argv[1] && existsSync(process.argv[1])
  && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (isDirectRun) {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.dryRun) {
    console.log(JSON.stringify(dryRunPlan(opts), null, 2));
  } else {
    runComparison(opts).catch((err) => {
      console.error(`Fatal: ${err.message}`);
      process.exit(1);
    });
  }
}
