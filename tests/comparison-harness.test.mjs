import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Import the functions we want to test
import {
  parseYaml,
  getDiffStats,
  getCommitLog,
  getTestFileCount,
  getTestCaseCount,
  scoreBugHandling,
  scoreCommitHygiene,
  scoreTestCoverage,
  scoreCodeQuality,
  scoreArchitecturalCoherence,
  scoreSpecCompliance,
  scoreCost,
  computeComposite,
  generateProjectReport,
  generateSummary,
} from './evals/comparison/run-comparison.mjs';

// --- YAML parser ---

describe('parseYaml', () => {
  it('parses top-level scalar fields', () => {
    const result = parseYaml('domain: data-pipeline\nproject: adev-pipeline-eval');
    assert.equal(result.domain, 'data-pipeline');
    assert.equal(result.project, 'adev-pipeline-eval');
  });

  it('parses numeric values', () => {
    const result = parseYaml('weight: 20\nthreshold: 30');
    assert.equal(result.weight, 20);
    assert.equal(result.threshold, 30);
  });

  it('parses boolean values', () => {
    const result = parseYaml('adev_only: true\nenabled: false');
    assert.equal(result.adev_only, true);
    assert.equal(result.enabled, false);
  });

  it('parses list of objects', () => {
    const yaml = `dimensions:
  - id: code_quality
    weight: 20
  - id: test_coverage
    weight: 15`;
    const result = parseYaml(yaml);
    assert.equal(result.dimensions.length, 2);
    assert.equal(result.dimensions[0].id, 'code_quality');
    assert.equal(result.dimensions[0].weight, 20);
    assert.equal(result.dimensions[1].id, 'test_coverage');
    assert.equal(result.dimensions[1].weight, 15);
  });

  it('skips comment lines', () => {
    const yaml = '# this is a comment\ndomain: test';
    const result = parseYaml(yaml);
    assert.equal(result.domain, 'test');
  });

  it('parses quoted strings', () => {
    const yaml = 'description: "Average function length under 30 lines"';
    const result = parseYaml(yaml);
    assert.equal(result.description, 'Average function length under 30 lines');
  });
});

// --- Diff stat parser ---

describe('getDiffStats (mock)', () => {
  // getDiffStats calls git, so we test the parsing logic indirectly
  // by verifying it returns the correct structure
  it('returns zeroed stats for non-existent repo', () => {
    const result = getDiffStats('/nonexistent/repo', 'some-branch');
    assert.equal(result.files_changed, 0);
    assert.equal(result.lines_added, 0);
    assert.equal(result.lines_removed, 0);
    assert.deepEqual(result.file_list, []);
  });
});

// --- Scorer logic ---

describe('scoreCommitHygiene', () => {
  it('returns zero score for non-existent repo', () => {
    const result = scoreCommitHygiene('/nonexistent', 'main');
    assert.equal(result.score, 0);
    assert.equal(result.commit_count, 0);
  });
});

describe('scoreBugHandling', () => {
  it('returns no_bug_file_specified when no bug file', () => {
    const result = scoreBugHandling('/nonexistent', 'main', null);
    assert.equal(result.status, 'no_bug_file_specified');
    assert.equal(result.score, 50);
  });

  it('returns untouched for non-existent repo', () => {
    const result = scoreBugHandling('/nonexistent', 'main', 'some/file.py');
    assert.equal(result.status, 'untouched');
    assert.equal(result.score, 50);
  });
});

describe('scoreSpecCompliance', () => {
  it('returns N/A for plain-claude branch', () => {
    const result = scoreSpecCompliance('/nonexistent', 'plain-claude');
    assert.equal(result.score, null);
    assert.equal(result.status, 'N/A');
  });

  it('returns missing for adev-built with no context-index', () => {
    const result = scoreSpecCompliance('/nonexistent', 'adev-built');
    assert.equal(result.score, 0);
    assert.equal(result.status, 'missing');
  });
});

describe('scoreCost', () => {
  it('returns N/A when no cost metadata', () => {
    const result = scoreCost('/nonexistent', 'plain-claude');
    assert.equal(result.score, null);
    assert.equal(result.status, 'N/A');
  });
});

describe('scoreCodeQuality', () => {
  it('returns baseline score with zero stats for missing repo', () => {
    const result = scoreCodeQuality('/nonexistent', 'main');
    assert.equal(result.score, 75);
    assert.equal(result.files_changed, 0);
  });
});

describe('scoreArchitecturalCoherence', () => {
  it('returns default score for missing repo', () => {
    const result = scoreArchitecturalCoherence('/nonexistent', 'main');
    assert.equal(result.score, 50);
    assert.equal(result.directory_structure, true);
  });
});

// --- Composite scoring ---

describe('computeComposite', () => {
  const rubric = {
    dimensions: [
      { id: 'code_quality', weight: 20 },
      { id: 'test_coverage', weight: 20 },
      { id: 'bug_handling', weight: 15 },
      { id: 'commit_hygiene', weight: 10 },
      { id: 'spec_compliance', weight: 10, adev_only: true },
    ],
  };

  it('computes weighted average of dimension scores', () => {
    const scores = {
      code_quality: { score: 80 },
      test_coverage: { score: 60 },
      bug_handling: { score: 100 },
      commit_hygiene: { score: 50 },
      spec_compliance: { score: 90 },
    };
    const composite = computeComposite(scores, rubric, 'adev-built');
    // (80*20 + 60*20 + 100*15 + 50*10 + 90*10) / (20+20+15+10+10) = (1600+1200+1500+500+900)/75 = 5700/75 = 76
    assert.equal(composite, 76);
  });

  it('skips adev_only dimensions for plain-claude', () => {
    const scores = {
      code_quality: { score: 80 },
      test_coverage: { score: 60 },
      bug_handling: { score: 100 },
      commit_hygiene: { score: 50 },
      spec_compliance: { score: null }, // N/A
    };
    const composite = computeComposite(scores, rubric, 'plain-claude');
    // (80*20 + 60*20 + 100*15 + 50*10) / (20+20+15+10) = (1600+1200+1500+500)/65 = 4800/65 = 73.8 -> 74
    assert.equal(composite, 74);
  });

  it('skips N/A dimensions (null score)', () => {
    const scores = {
      code_quality: { score: 80 },
      test_coverage: { score: null }, // N/A
      bug_handling: { score: 100 },
      commit_hygiene: { score: 50 },
    };
    const composite = computeComposite(scores, rubric, 'adev-built');
    // (80*20 + 100*15 + 50*10) / (20+15+10) = (1600+1500+500)/45 = 3600/45 = 80
    assert.equal(composite, 80);
  });

  it('returns 0 when all dimensions are N/A', () => {
    const scores = {
      code_quality: { score: null },
    };
    const composite = computeComposite(scores, rubric, 'plain-claude');
    assert.equal(composite, 0);
  });
});

// --- Report generation ---

describe('generateProjectReport', () => {
  it('generates a report with all expected fields', () => {
    const branchResults = {
      'plain-claude': {
        headCommit: 'abc123',
        diffStats: { files_changed: 5, lines_added: 100, lines_removed: 10, file_list: [] },
        scores: {
          code_quality: { score: 75, files_changed: 5, lines_added: 100, lines_removed: 10 },
          test_coverage: { score: 60, test_file_count: 2, test_case_count: 8 },
          bug_handling: { status: 'untouched', score: 50 },
          commit_hygiene: { score: 50, commit_count: 1 },
          spec_compliance: { score: null, status: 'N/A' },
          cost: { score: null, status: 'N/A' },
        },
        composite: 62,
      },
      'adev-built': {
        headCommit: 'def456',
        diffStats: { files_changed: 8, lines_added: 200, lines_removed: 15, file_list: [] },
        scores: {
          code_quality: { score: 80, files_changed: 8, lines_added: 200, lines_removed: 15 },
          test_coverage: { score: 70, test_file_count: 4, test_case_count: 15 },
          bug_handling: { status: 'fixed_intentionally', score: 100 },
          commit_hygiene: { score: 75, commit_count: 5 },
          spec_compliance: { score: 90, status: 'complete' },
          cost: { score: null, status: 'N/A' },
        },
        composite: 81,
      },
    };

    const report = generateProjectReport('adev-api-eval', 'web-api', branchResults);

    assert.equal(report.project, 'adev-api-eval');
    assert.equal(report.domain, 'web-api');
    assert.equal(report.composite.plain_claude, 62);
    assert.equal(report.composite.adev_built, 81);
    assert.equal(report.diff_summary.plain_claude.files_changed, 5);
    assert.equal(report.diff_summary.adev_built.lines_added, 200);
    assert.equal(report.bug_handling.plain_claude, 'untouched');
    assert.equal(report.bug_handling.adev_built, 'fixed_intentionally');
    assert.ok(report.generated_at);
  });

  it('handles missing branch gracefully', () => {
    const branchResults = {
      'plain-claude': {
        headCommit: 'abc123',
        diffStats: { files_changed: 5, lines_added: 100, lines_removed: 10, file_list: [] },
        scores: {
          code_quality: { score: 75 },
          bug_handling: { status: 'untouched', score: 50 },
        },
        composite: 62,
      },
      // adev-built is missing
    };

    const report = generateProjectReport('test-project', 'test', branchResults);
    assert.equal(report.branches.adev_built.status, 'BRANCH_MISSING');
    assert.equal(report.composite.adev_built, 0);
  });
});

describe('generateSummary', () => {
  it('aggregates scores across projects', () => {
    const projectReports = {
      'project-a': {
        composite: { plain_claude: 70, adev_built: 85 },
        dimensions: {
          code_quality: {
            plain_claude: { score: 75 },
            adev_built: { score: 80 },
          },
        },
        bug_handling: { plain_claude: 'untouched', adev_built: 'fixed_intentionally' },
      },
      'project-b': {
        composite: { plain_claude: 60, adev_built: 75 },
        dimensions: {
          code_quality: {
            plain_claude: { score: 65 },
            adev_built: { score: 85 },
          },
        },
        bug_handling: { plain_claude: 'fixed_incidentally', adev_built: 'untouched' },
      },
    };

    const summary = generateSummary(projectReports);

    assert.deepEqual(summary.projects, ['project-a', 'project-b']);
    assert.equal(summary.aggregate_scores.plain_claude.mean, 65);
    assert.equal(summary.aggregate_scores.plain_claude.min, 60);
    assert.equal(summary.aggregate_scores.plain_claude.max, 70);
    assert.equal(summary.aggregate_scores.adev_built.mean, 80);
    assert.equal(summary.aggregate_scores.adev_built.min, 75);
    assert.equal(summary.aggregate_scores.adev_built.max, 85);
    assert.equal(summary.dimension_breakdown.code_quality.plain_claude_avg, 70);
    assert.equal(summary.dimension_breakdown.code_quality.adev_built_avg, 83); // (80+85)/2 = 82.5 -> 83
    assert.ok(summary.notable_findings.length > 0);
    assert.ok(summary.generated_at);
  });

  it('handles empty project reports', () => {
    const summary = generateSummary({});
    assert.deepEqual(summary.projects, []);
    assert.equal(summary.aggregate_scores.plain_claude.mean, 0);
    assert.equal(summary.aggregate_scores.adev_built.mean, 0);
  });
});

// --- Rubric file validation ---

describe('rubric files', () => {
  const rubricDir = join(__dirname, 'evals', 'comparison', 'rubrics');

  for (const domain of ['data-pipeline', 'web-api', 'data-migration', 'process-automation']) {
    it(`${domain}.yaml is valid and has required dimensions`, () => {
      const rubric = parseYaml(readFileSync(join(rubricDir, `${domain}.yaml`), 'utf-8'));
      assert.ok(rubric.domain, `domain field missing in ${domain}.yaml`);
      assert.ok(rubric.project, `project field missing in ${domain}.yaml`);
      assert.ok(Array.isArray(rubric.dimensions), `dimensions must be an array in ${domain}.yaml`);

      const dimIds = rubric.dimensions.map(d => d.id);
      assert.ok(dimIds.includes('code_quality'), 'missing code_quality dimension');
      assert.ok(dimIds.includes('test_coverage'), 'missing test_coverage dimension');
      assert.ok(dimIds.includes('bug_handling'), 'missing bug_handling dimension');
      assert.ok(dimIds.includes('commit_hygiene'), 'missing commit_hygiene dimension');
      assert.ok(dimIds.includes('cost'), 'missing cost dimension');

      // Check weights sum to 100
      const totalWeight = rubric.dimensions.reduce((sum, d) => sum + (d.weight || 0), 0);
      assert.equal(totalWeight, 100, `dimension weights must sum to 100, got ${totalWeight}`);
    });
  }
});
