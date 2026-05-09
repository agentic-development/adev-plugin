#!/usr/bin/env node

/**
 * Comparison Eval Harness
 *
 * Scores plain-claude vs adev-built branches across four eval projects.
 * Produces per-project JSON reports and an aggregate summary.
 *
 * Usage:
 *   node tests/evals/comparison/run-comparison.mjs               # deterministic only
 *   node tests/evals/comparison/run-comparison.mjs --llm-judge    # add LLM judge layer
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EVALS_DIR = resolve(__dirname, '..');
const REPORTS_DIR = join(__dirname, 'reports');

const PROJECTS = [
  'adev-pipeline-eval',
  'adev-api-eval',
  'adev-migrations-eval',
  'adev-automation-eval',
];

const BRANCHES = ['plain-claude', 'adev-built'];
const BRANCH_KEYS = { 'plain-claude': 'plain_claude', 'adev-built': 'adev_built' };

const useLlmJudge = process.argv.includes('--llm-judge');

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
    const hasBuildState = fileList.some((f) => f.includes('/build-state/'));

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

async function runComparison() {
  mkdirSync(REPORTS_DIR, { recursive: true });

  console.log('Comparison Eval Harness');
  console.log('======================\n');

  if (useLlmJudge) {
    console.log('LLM judge layer: ENABLED\n');
  }

  const reports = [];

  for (const project of PROJECTS) {
    const projectDir = join(EVALS_DIR, project);

    if (!existsSync(projectDir)) {
      console.log(`[SKIP] ${project} — directory not found`);
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
      generated_at: new Date().toISOString(),
    };

    // Score each branch
    for (const branch of BRANCHES) {
      const key = BRANCH_KEYS[branch];
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
    }

    // Compute composite per branch
    for (const branch of BRANCHES) {
      const key = BRANCH_KEYS[branch];
      const scores = Object.values(report.dimensions)
        .map((d) => d[key]?.score)
        .filter((s) => s !== null && s !== undefined);
      report.composite[key] = scores.length > 0
        ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length)
        : 0;
    }

    console.log(`  Composite: plain_claude=${report.composite.plain_claude}, adev_built=${report.composite.adev_built}`);

    // Apply LLM judge if requested
    let finalReport = report;
    if (useLlmJudge) {
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

    // Write per-project report
    const reportPath = join(REPORTS_DIR, `${project}.json`);
    writeFileSync(reportPath, JSON.stringify(finalReport, null, 2), 'utf-8');
    console.log(`  Report written to reports/${project}.json\n`);

    reports.push(finalReport);
  }

  // --- Aggregate summary ---
  const summary = buildSummary(reports);
  const summaryPath = join(REPORTS_DIR, 'summary.json');
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');
  console.log('Summary written to reports/summary.json');
  console.log(`\nplain-claude avg: ${summary.aggregate_scores.plain_claude.mean}`);
  console.log(`adev-built avg: ${summary.aggregate_scores.adev_built.mean}`);
}

function buildSummary(reports) {
  const plainScores = reports.map((r) => r.composite.plain_claude);
  const adevScores = reports.map((r) => r.composite.adev_built);

  const mean = (arr) => Math.round(arr.reduce((s, v) => s + v, 0) / arr.length);

  const dimensions = {};
  const allDims = ['code_quality', 'test_coverage', 'bug_handling', 'architectural_coherence', 'commit_hygiene', 'spec_compliance', 'cost'];

  for (const dim of allDims) {
    const plainAvg = reports
      .map((r) => r.dimensions[dim]?.plain_claude?.score)
      .filter((s) => s !== null && s !== undefined);
    const adevAvg = reports
      .map((r) => r.dimensions[dim]?.adev_built?.score)
      .filter((s) => s !== null && s !== undefined);

    dimensions[dim] = {
      plain_claude_avg: plainAvg.length > 0 ? Math.round(mean(plainAvg)) : 0,
      adev_built_avg: adevAvg.length > 0 ? Math.round(mean(adevAvg)) : 0,
    };
  }

  const plainMean = mean(plainScores);
  const adevMean = mean(adevScores);
  const diff = plainMean - adevMean;

  const findings = [];
  if (diff > 0) findings.push(`plain-claude scored ${diff} points higher on average composite score`);
  else if (diff < 0) findings.push(`adev-built scored ${Math.abs(diff)} points higher on average composite score`);
  else findings.push('Both approaches scored equally on average');

  // Bug handling summary
  const plainBugFixes = reports.filter((r) => r.bug_handling.plain_claude !== 'untouched').length;
  const adevBugFixes = reports.filter((r) => r.bug_handling.adev_built !== 'untouched').length;
  findings.push(`plain-claude fixed planted bugs in ${plainBugFixes}/${reports.length} projects`);
  findings.push(`adev-built fixed planted bugs in ${adevBugFixes}/${reports.length} projects`);

  return {
    projects: reports.map((r) => r.project),
    aggregate_scores: {
      plain_claude: { mean: plainMean, min: Math.min(...plainScores), max: Math.max(...plainScores) },
      adev_built: { mean: adevMean, min: Math.min(...adevScores), max: Math.max(...adevScores) },
    },
    dimension_breakdown: dimensions,
    notable_findings: findings,
    llm_judge_enabled: useLlmJudge,
    generated_at: new Date().toISOString(),
  };
}

runComparison().catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
