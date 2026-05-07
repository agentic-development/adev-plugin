#!/usr/bin/env node

/**
 * Eval Comparison Harness
 *
 * Compares plain-claude vs adev-built branches across eval project repos.
 * Uses non-destructive git operations (diff/show/log) — never checks out branches.
 *
 * Usage:
 *   node tests/evals/comparison/run-comparison.mjs --project adev-api-eval
 *   node tests/evals/comparison/run-comparison.mjs --all
 */

import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

const RUBRICS_DIR = join(__dirname, 'rubrics');
const REPORTS_DIR = join(__dirname, 'reports');
const EVALS_DIR = join(__dirname, '..');

const PROJECTS = {
  'adev-pipeline-eval': 'data-pipeline',
  'adev-api-eval': 'web-api',
  'adev-migrations-eval': 'data-migration',
  'adev-automation-eval': 'process-automation',
};

const BRANCHES = ['plain-claude', 'adev-built'];

// --- CLI args (guarded for import) ---

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

// --- Minimal YAML parser (reused from run-eval.mjs pattern) ---

export function readYaml(filePath) {
  const text = readFileSync(filePath, 'utf-8');
  return parseYaml(text);
}

export function parseYaml(text) {
  const lines = text.split('\n');
  const result = {};
  let currentKey = null;
  let currentList = null;
  let currentObj = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#') || line.trim() === '') continue;

    const topMatch = line.match(/^(\w[\w_]+):\s*(.*)/);
    if (topMatch && !line.startsWith('  ')) {
      currentKey = topMatch[1];
      const val = topMatch[2].trim();
      if (val === '') {
        result[currentKey] = [];
        currentList = result[currentKey];
        currentObj = null;
      } else {
        result[currentKey] = parseScalar(val);
        currentList = null;
        currentObj = null;
      }
      continue;
    }

    const listItemMatch = line.match(/^  - (.*)/);
    if (listItemMatch && currentList !== null) {
      const val = listItemMatch[1].trim();
      if (val.includes(':')) {
        currentObj = {};
        currentList.push(currentObj);
        const [k, v] = val.split(/:\s+(.*)/, 2);
        currentObj[k.trim()] = parseScalar(v || '');
      } else {
        currentList.push(parseScalar(val));
        currentObj = null;
      }
      continue;
    }

    const objPropMatch = line.match(/^    (\w[\w_]+):\s*(.*)/);
    if (objPropMatch && currentObj !== null) {
      const [, k, v] = objPropMatch;
      currentObj[k.trim()] = parseScalar(v.trim());
      continue;
    }
  }

  return result;
}

function parseScalar(val) {
  if (val === 'true') return true;
  if (val === 'false') return false;
  const num = Number(val);
  if (!isNaN(num) && val !== '') return num;
  if (val.startsWith('"') && val.endsWith('"')) {
    return val.slice(1, -1);
  }
  return val;
}

// --- Git helpers (non-destructive) ---

function gitExec(repoDir, cmd) {
  try {
    return execSync(`git ${cmd}`, { cwd: repoDir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    return null;
  }
}

function branchExists(repoDir, branch) {
  const result = gitExec(repoDir, `rev-parse --verify ${branch}`);
  return result !== null;
}

export function getDiffStats(repoDir, branch) {
  const raw = gitExec(repoDir, `diff --stat main..${branch}`);
  if (!raw) return { files_changed: 0, lines_added: 0, lines_removed: 0, file_list: [] };

  const lines = raw.split('\n');
  const summaryLine = lines[lines.length - 1] || '';
  const filesMatch = summaryLine.match(/(\d+) files? changed/);
  const addMatch = summaryLine.match(/(\d+) insertions?\(\+\)/);
  const delMatch = summaryLine.match(/(\d+) deletions?\(-\)/);

  const file_list = [];
  for (let i = 0; i < lines.length - 1; i++) {
    const m = lines[i].match(/^\s*(.+?)\s+\|/);
    if (m) file_list.push(m[1].trim());
  }

  return {
    files_changed: filesMatch ? parseInt(filesMatch[1]) : 0,
    lines_added: addMatch ? parseInt(addMatch[1]) : 0,
    lines_removed: delMatch ? parseInt(delMatch[1]) : 0,
    file_list,
  };
}

export function getCommitLog(repoDir, branch) {
  const raw = gitExec(repoDir, `log main..${branch} --format="%H|||%s|||%b---END---"`);
  if (!raw) return [];

  const entries = raw.split('---END---').filter(e => e.trim());
  return entries.map(entry => {
    const parts = entry.trim().split('|||');
    return {
      hash: (parts[0] || '').trim(),
      subject: (parts[1] || '').trim(),
      body: (parts[2] || '').trim(),
    };
  });
}

export function getTestFileCount(repoDir, branch) {
  const raw = gitExec(repoDir, `ls-tree -r --name-only ${branch}`);
  if (!raw) return { test_files: [], test_file_count: 0 };
  const allFiles = raw.split('\n');
  const testFiles = allFiles.filter(f =>
    f.includes('test') || f.includes('spec') || f.match(/tests?\//)
  ).filter(f =>
    f.endsWith('.py') || f.endsWith('.ts') || f.endsWith('.js') || f.endsWith('.mjs')
  );
  return { test_files: testFiles, test_file_count: testFiles.length };
}

export function getTestCaseCount(repoDir, branch) {
  const { test_files } = getTestFileCount(repoDir, branch);
  let total = 0;
  for (const f of test_files) {
    const content = gitExec(repoDir, `show ${branch}:${f}`);
    if (!content) continue;
    // Count test patterns across languages
    const patterns = [
      /\bit\s*\(/g,         // JS/TS: it(
      /\btest\s*\(/g,       // JS/TS: test(
      /\bdescribe\s*\(/g,   // JS/TS: describe( (count as grouping, not test)
      /\bdef test_/g,       // Python: def test_
      /\bclass Test/g,      // Python: class Test
    ];
    // Count individual test cases (it, test, def test_)
    const testPatterns = [/\bit\s*\(/g, /\btest\s*\(/g, /\bdef test_/g];
    for (const p of testPatterns) {
      const matches = content.match(p);
      if (matches) total += matches.length;
    }
  }
  return total;
}

function getFileContent(repoDir, branch, filePath) {
  return gitExec(repoDir, `show ${branch}:${filePath}`);
}

function getFileOnBranch(repoDir, branch, filePath) {
  return gitExec(repoDir, `diff main..${branch} -- ${filePath}`);
}

// --- Scoring functions ---

export function scoreBugHandling(repoDir, branch, bugFile) {
  if (!bugFile) return { status: 'no_bug_file_specified', score: 50 };

  const diff = getFileOnBranch(repoDir, branch, bugFile);
  const commits = getCommitLog(repoDir, branch);

  if (!diff || diff.trim() === '') {
    return { status: 'untouched', score: 50 };
  }

  // Check if any commit message references bug/fix for this file
  const bugKeywords = /\bbug\b|\bfix\b|\bplanted\b|\bdefect\b/i;
  const intentionalFix = commits.some(c =>
    bugKeywords.test(c.subject) && (c.subject.toLowerCase().includes(basename(bugFile).toLowerCase().replace(/\.\w+$/, '')) || c.body.toLowerCase().includes('bug'))
  );

  if (intentionalFix) {
    return { status: 'fixed_intentionally', score: 100 };
  }

  return { status: 'fixed_incidentally', score: 75 };
}

export function scoreCommitHygiene(repoDir, branch) {
  const commits = getCommitLog(repoDir, branch);
  if (commits.length === 0) return { score: 0, commit_count: 0, atomic: false, has_trailers: false };

  const isAdev = branch === 'adev-built';

  // Atomic: more than 1 commit suggests structured work (not monolithic)
  const atomic = commits.length > 1;

  // Check for trailers (Spec:, Plan-task:) — meaningful for adev-built
  let trailersFound = 0;
  for (const c of commits) {
    if (/Spec:|Plan-task:/i.test(c.body) || /Spec:|Plan-task:/i.test(c.subject)) {
      trailersFound++;
    }
  }
  const hasTrailers = isAdev ? trailersFound > 0 : true; // not penalized for plain-claude

  let score = 50; // base
  if (atomic) score += 25;
  if (hasTrailers) score += 25;

  return {
    score,
    commit_count: commits.length,
    atomic,
    has_trailers: trailersFound > 0,
    trailers_ratio: commits.length > 0 ? Math.round((trailersFound / commits.length) * 100) : 0,
  };
}

export function scoreTestCoverage(repoDir, branch) {
  const { test_file_count, test_files } = getTestFileCount(repoDir, branch);
  const testCaseCount = getTestCaseCount(repoDir, branch);
  const diffStats = getDiffStats(repoDir, branch);

  // Count test lines vs impl lines from diff
  let testLinesAdded = 0;
  let implLinesAdded = 0;
  for (const f of diffStats.file_list) {
    const isTest = f.includes('test') || f.includes('spec') || f.match(/tests?\//);
    if (isTest) {
      testLinesAdded += diffStats.lines_added; // approximation
    } else {
      implLinesAdded += diffStats.lines_added;
    }
  }

  return {
    test_file_count,
    test_case_count: testCaseCount,
    test_to_impl_ratio: implLinesAdded > 0 ? Math.round((testLinesAdded / implLinesAdded) * 100) / 100 : 0,
  };
}

export function scoreCodeQuality(repoDir, branch) {
  const diffStats = getDiffStats(repoDir, branch);

  return {
    files_changed: diffStats.files_changed,
    lines_added: diffStats.lines_added,
    lines_removed: diffStats.lines_removed,
    score: 75, // baseline deterministic score; LLM judge would refine
  };
}

export function scoreArchitecturalCoherence(repoDir, branch) {
  // Check if new files follow existing directory patterns
  const diffStats = getDiffStats(repoDir, branch);
  const mainFiles = gitExec(repoDir, `ls-tree -r --name-only main`);
  if (!mainFiles) return { score: 50, directory_structure: true, import_hygiene: true };

  const mainDirs = new Set();
  for (const f of mainFiles.split('\n')) {
    const dir = dirname(f);
    if (dir !== '.') mainDirs.add(dir);
  }

  // Check if new files are in existing directories or sensible new ones
  let inExistingDirs = 0;
  let newDirFiles = 0;
  for (const f of diffStats.file_list) {
    const dir = dirname(f);
    if (dir === '.' || mainDirs.has(dir)) {
      inExistingDirs++;
    } else {
      newDirFiles++;
    }
  }

  const total = inExistingDirs + newDirFiles;
  const dirScore = total > 0 ? Math.round((inExistingDirs / total) * 100) : 100;

  return {
    score: dirScore,
    directory_structure: dirScore >= 70,
    import_hygiene: true, // simplified; full circular dep detection needs import graph
    files_in_existing_dirs: inExistingDirs,
    files_in_new_dirs: newDirFiles,
  };
}

export function scoreSpecCompliance(repoDir, branch) {
  if (branch !== 'adev-built') {
    return { score: null, status: 'N/A', reason: 'plain-claude has no specs by design' };
  }

  // Check for .context-index/ presence on the branch
  const contextIndex = gitExec(repoDir, `ls-tree ${branch} .context-index/`);
  if (!contextIndex || contextIndex.trim() === '') {
    return { score: 0, status: 'missing', context_index_exists: false };
  }

  // Check for specs, plans within .context-index/
  const allFiles = gitExec(repoDir, `ls-tree -r --name-only ${branch} .context-index/`);
  if (!allFiles) return { score: 25, status: 'partial', context_index_exists: true };

  const files = allFiles.split('\n');
  const hasSpecs = files.some(f => f.includes('spec'));
  const hasPlans = files.some(f => f.includes('plan'));
  const hasBuildState = files.some(f => f.includes('build-state'));

  let score = 25; // base for having .context-index
  if (hasSpecs) score += 25;
  if (hasPlans) score += 25;
  if (hasBuildState) score += 25;

  return {
    score,
    status: score === 100 ? 'complete' : 'partial',
    context_index_exists: true,
    has_specs: hasSpecs,
    has_plans: hasPlans,
    has_build_state: hasBuildState,
  };
}

export function scoreCost(repoDir, branch) {
  // Cost metadata is optional; check for build state files
  const buildState = gitExec(repoDir, `ls-tree -r --name-only ${branch} .context-index/build-state/ 2>/dev/null`);
  if (!buildState || buildState.trim() === '') {
    return { score: null, status: 'N/A', reason: 'no cost metadata available' };
  }

  return { score: null, status: 'N/A', reason: 'cost metadata parsing not yet implemented' };
}

// --- Composite scoring ---

export function computeComposite(dimensionScores, rubric, branch) {
  const dimensions = rubric.dimensions || [];
  let totalWeight = 0;
  let weightedSum = 0;

  for (const dim of dimensions) {
    const dimScore = dimensionScores[dim.id];
    if (!dimScore || dimScore.score === null || dimScore.score === undefined) {
      // Skip N/A dimensions — redistribute weight
      continue;
    }
    // For plain-claude, skip adev_only dimensions
    if (dim.adev_only && branch === 'plain-claude') {
      continue;
    }
    totalWeight += dim.weight;
    weightedSum += dimScore.score * dim.weight;
  }

  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
}

// --- Report generation ---

export function generateProjectReport(project, domain, branchResults) {
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

  for (const branch of BRANCHES) {
    const brKey = branch.replace('-', '_');
    const br = branchResults[branch];

    if (!br) {
      report.branches[brKey] = { status: 'BRANCH_MISSING' };
      report.composite[brKey] = 0;
      continue;
    }

    report.branches[brKey] = {
      commit: br.headCommit || 'unknown',
    };

    report.diff_summary[brKey] = {
      files_changed: br.diffStats.files_changed,
      lines_added: br.diffStats.lines_added,
      lines_removed: br.diffStats.lines_removed,
    };

    report.bug_handling[brKey] = br.scores.bug_handling?.status || 'unknown';

    for (const [dimId, dimScore] of Object.entries(br.scores)) {
      if (!report.dimensions[dimId]) report.dimensions[dimId] = {};
      report.dimensions[dimId][brKey] = {
        score: dimScore.score,
        metrics: dimScore,
      };
    }

    report.composite[brKey] = br.composite;
  }

  return report;
}

export function generateSummary(projectReports) {
  const projects = Object.keys(projectReports);
  const summary = {
    projects,
    aggregate_scores: {
      plain_claude: { mean: 0, min: Infinity, max: -Infinity },
      adev_built: { mean: 0, min: Infinity, max: -Infinity },
    },
    dimension_breakdown: {},
    notable_findings: [],
    generated_at: new Date().toISOString(),
  };

  const branchKeys = ['plain_claude', 'adev_built'];
  const branchTotals = { plain_claude: [], adev_built: [] };
  const dimTotals = {};

  for (const report of Object.values(projectReports)) {
    for (const brKey of branchKeys) {
      const score = report.composite[brKey];
      if (typeof score === 'number') {
        branchTotals[brKey].push(score);
      }
    }

    for (const [dimId, dimData] of Object.entries(report.dimensions)) {
      if (!dimTotals[dimId]) dimTotals[dimId] = { plain_claude: [], adev_built: [] };
      for (const brKey of branchKeys) {
        const s = dimData[brKey]?.score;
        if (typeof s === 'number') {
          dimTotals[dimId][brKey].push(s);
        }
      }
    }
  }

  for (const brKey of branchKeys) {
    const scores = branchTotals[brKey];
    if (scores.length > 0) {
      summary.aggregate_scores[brKey] = {
        mean: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
        min: Math.min(...scores),
        max: Math.max(...scores),
      };
    } else {
      summary.aggregate_scores[brKey] = { mean: 0, min: 0, max: 0 };
    }
  }

  for (const [dimId, data] of Object.entries(dimTotals)) {
    summary.dimension_breakdown[dimId] = {};
    for (const brKey of branchKeys) {
      const scores = data[brKey];
      summary.dimension_breakdown[dimId][`${brKey}_avg`] =
        scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    }
  }

  // Generate findings
  const pcAvg = summary.aggregate_scores.plain_claude.mean;
  const abAvg = summary.aggregate_scores.adev_built.mean;
  if (abAvg > pcAvg) {
    summary.notable_findings.push(`adev-built scored ${abAvg - pcAvg} points higher on average composite score`);
  } else if (pcAvg > abAvg) {
    summary.notable_findings.push(`plain-claude scored ${pcAvg - abAvg} points higher on average composite score`);
  }

  // Check bug handling across projects
  let pcBugFixes = 0;
  let abBugFixes = 0;
  for (const report of Object.values(projectReports)) {
    if (report.bug_handling.plain_claude === 'fixed_intentionally' || report.bug_handling.plain_claude === 'fixed_incidentally') pcBugFixes++;
    if (report.bug_handling.adev_built === 'fixed_intentionally' || report.bug_handling.adev_built === 'fixed_incidentally') abBugFixes++;
  }
  if (pcBugFixes > 0) summary.notable_findings.push(`plain-claude fixed planted bugs in ${pcBugFixes}/${projects.length} projects`);
  if (abBugFixes > 0) summary.notable_findings.push(`adev-built fixed planted bugs in ${abBugFixes}/${projects.length} projects`);

  return summary;
}

// --- Main evaluation ---

export function evaluateProject(projectName) {
  const domain = PROJECTS[projectName];
  if (!domain) {
    console.error(`Unknown project: ${projectName}`);
    return null;
  }

  const repoDir = join(EVALS_DIR, projectName);
  if (!existsSync(repoDir)) {
    console.error(`  REPO_NOT_FOUND: ${repoDir}`);
    return { error: 'REPO_NOT_FOUND', project: projectName };
  }

  // Load rubric
  const rubricFile = join(RUBRICS_DIR, `${domain}.yaml`);
  let rubric;
  if (existsSync(rubricFile)) {
    rubric = readYaml(rubricFile);
  } else {
    console.warn(`  RUBRIC_MISSING: using default weights for ${domain}`);
    rubric = { dimensions: [] };
  }

  const branchResults = {};

  for (const branch of BRANCHES) {
    if (!branchExists(repoDir, branch)) {
      console.error(`  BRANCH_MISSING: ${branch} in ${projectName}`);
      continue;
    }

    const headCommit = gitExec(repoDir, `rev-parse --short ${branch}`);
    const diffStats = getDiffStats(repoDir, branch);

    // Bug file is a top-level rubric field
    const bugFile = rubric.bug_file || null;

    const scores = {
      code_quality: scoreCodeQuality(repoDir, branch),
      test_coverage: scoreTestCoverage(repoDir, branch),
      bug_handling: scoreBugHandling(repoDir, branch, bugFile),
      architectural_coherence: scoreArchitecturalCoherence(repoDir, branch),
      commit_hygiene: scoreCommitHygiene(repoDir, branch),
      spec_compliance: scoreSpecCompliance(repoDir, branch),
      cost: scoreCost(repoDir, branch),
    };

    const composite = computeComposite(scores, rubric, branch);

    branchResults[branch] = { headCommit, diffStats, scores, composite };

    console.log(`  [${branch}] composite=${composite} files=${diffStats.files_changed} +${diffStats.lines_added}/-${diffStats.lines_removed} tests=${scores.test_coverage.test_case_count} commits=${scores.commit_hygiene.commit_count}`);
  }

  return generateProjectReport(projectName, domain, branchResults);
}

// --- Run (only when invoked directly) ---

if (isMainModule) {
  const args = process.argv.slice(2);
  const projectFlag = args.includes('--project') ? args[args.indexOf('--project') + 1] : null;
  const runAll = args.includes('--all');

  if (!projectFlag && !runAll) {
    console.error('Usage: run-comparison.mjs --project <repo-name> | --all');
    process.exit(1);
  }

  console.log('Eval Comparison Harness');
  console.log('========================\n');

  mkdirSync(REPORTS_DIR, { recursive: true });

  const projectsToRun = runAll ? Object.keys(PROJECTS) : [projectFlag];
  const allReports = {};

  for (const project of projectsToRun) {
    console.log(`\nProject: ${project}`);
    const report = evaluateProject(project);
    if (report && !report.error) {
      allReports[project] = report;
      const reportPath = join(REPORTS_DIR, `${project}.json`);
      writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
      console.log(`  Report: tests/evals/comparison/reports/${project}.json`);
    }
  }

  if (runAll && Object.keys(allReports).length > 0) {
    const summary = generateSummary(allReports);
    const summaryPath = join(REPORTS_DIR, 'summary.json');
    writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');
    console.log(`\nSummary: tests/evals/comparison/reports/summary.json`);
    console.log(`\nAggregate: plain-claude=${summary.aggregate_scores.plain_claude.mean} adev-built=${summary.aggregate_scores.adev_built.mean}`);
  }

  console.log('\nDone.');
}
