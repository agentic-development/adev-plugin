import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildJudgePrompt,
  parseJudgeResponse,
  deRandomize,
  blendScores,
  callJudge,
  JUDGE_DIMENSIONS,
  JUDGE_MODEL,
  LLM_BLEND_FACTOR,
  DIMENSION_MAPPING,
} from './llm-judge.mjs';

// --- Fixtures ---

function makeMockReport() {
  return {
    project: 'test-project',
    domain: 'web-api',
    branches: {
      plain_claude: { commit: 'abc1234' },
      adev_built: { commit: 'def5678' },
    },
    dimensions: {
      code_quality: {
        plain_claude: { score: 70, metrics: { files_changed: 5, score: 70 } },
        adev_built: { score: 80, metrics: { files_changed: 8, score: 80 } },
      },
      test_coverage: {
        plain_claude: { score: 90, metrics: { score: 90 } },
        adev_built: { score: 85, metrics: { score: 85 } },
      },
      bug_handling: {
        plain_claude: { score: 75, metrics: { status: 'fixed_incidentally', score: 75 } },
        adev_built: { score: 50, metrics: { status: 'untouched', score: 50 } },
      },
      architectural_coherence: {
        plain_claude: { score: 90, metrics: { score: 90, directory_structure: true } },
        adev_built: { score: 60, metrics: { score: 60, directory_structure: false } },
      },
      commit_hygiene: {
        plain_claude: { score: 50, metrics: { score: 50, commit_count: 1 } },
        adev_built: { score: 100, metrics: { score: 100, commit_count: 8 } },
      },
      spec_compliance: {
        plain_claude: { score: null, metrics: { score: null, status: 'N/A' } },
        adev_built: { score: 80, metrics: { score: 80 } },
      },
      cost: {
        plain_claude: { score: null, metrics: { score: null } },
        adev_built: { score: null, metrics: { score: null } },
      },
    },
    composite: { plain_claude: 75, adev_built: 76 },
    diff_summary: {},
    bug_handling: { plain_claude: 'fixed_incidentally', adev_built: 'untouched' },
    generated_at: new Date().toISOString(),
  };
}

function makeMockLlmScores() {
  return {
    plain_claude: {
      naming_consistency: { score: 85, reasoning: 'Follows camelCase consistently.' },
      directory_structure: { score: 90, reasoning: 'All files in existing dirs.' },
      commit_message_quality: { score: 40, reasoning: 'Single monolithic commit.' },
      overall_code_quality: { score: 75, reasoning: 'Clean but verbose.' },
    },
    adev_built: {
      naming_consistency: { score: 70, reasoning: 'Mixed naming conventions.' },
      directory_structure: { score: 50, reasoning: 'Several new directories.' },
      commit_message_quality: { score: 95, reasoning: 'Atomic, descriptive commits.' },
      overall_code_quality: { score: 80, reasoning: 'Well-structured with clear separation.' },
    },
  };
}

// --- Tests ---

describe('llm-judge', () => {
  describe('buildJudgePrompt', () => {
    it('includes both implementations and README', () => {
      const prompt = buildJudgePrompt({
        readme: '# My Project\nA test project.',
        diffA: '+added line A',
        commitsA: 'feat: add feature A',
        diffB: '+added line B',
        commitsB: 'feat: add feature B',
      });

      assert.ok(prompt.includes('# My Project'));
      assert.ok(prompt.includes('Implementation A'));
      assert.ok(prompt.includes('Implementation B'));
      assert.ok(prompt.includes('+added line A'));
      assert.ok(prompt.includes('+added line B'));
      assert.ok(prompt.includes('feat: add feature A'));
      assert.ok(prompt.includes('feat: add feature B'));
    });

    it('includes all four scoring dimensions', () => {
      const prompt = buildJudgePrompt({
        readme: '',
        diffA: '',
        commitsA: '',
        diffB: '',
        commitsB: '',
      });

      assert.ok(prompt.includes('naming_consistency'));
      assert.ok(prompt.includes('directory_structure'));
      assert.ok(prompt.includes('commit_message_quality'));
      assert.ok(prompt.includes('overall_code_quality'));
    });

    it('truncates very long diffs', () => {
      const longDiff = 'x'.repeat(20000);
      const prompt = buildJudgePrompt({
        readme: '',
        diffA: longDiff,
        commitsA: '',
        diffB: '',
        commitsB: '',
      });

      assert.ok(prompt.includes('... (truncated)'));
      // Should be shorter than the original
      assert.ok(prompt.length < longDiff.length + 5000);
    });
  });

  describe('parseJudgeResponse', () => {
    it('parses clean JSON', () => {
      const json = JSON.stringify({
        implementation_a: { naming_consistency: { score: 80, reasoning: 'Good.' } },
        implementation_b: { naming_consistency: { score: 70, reasoning: 'OK.' } },
      });

      const result = parseJudgeResponse(json);
      assert.equal(result.implementation_a.naming_consistency.score, 80);
      assert.equal(result.implementation_b.naming_consistency.score, 70);
    });

    it('strips markdown code fences', () => {
      const wrapped = '```json\n{"implementation_a": {}, "implementation_b": {}}\n```';
      const result = parseJudgeResponse(wrapped);
      assert.ok(result.implementation_a !== undefined);
      assert.ok(result.implementation_b !== undefined);
    });

    it('throws on invalid JSON', () => {
      assert.throws(() => parseJudgeResponse('not json at all'), /JSON/);
    });
  });

  describe('deRandomize', () => {
    it('maps A->plain_claude when aIsPlainClaude is true', () => {
      const scores = {
        implementation_a: { naming_consistency: { score: 90, reasoning: 'Great.' } },
        implementation_b: { naming_consistency: { score: 60, reasoning: 'Meh.' } },
      };

      const result = deRandomize(scores, true);
      assert.equal(result.plain_claude.naming_consistency.score, 90);
      assert.equal(result.adev_built.naming_consistency.score, 60);
    });

    it('maps A->adev_built when aIsPlainClaude is false', () => {
      const scores = {
        implementation_a: { naming_consistency: { score: 90, reasoning: 'Great.' } },
        implementation_b: { naming_consistency: { score: 60, reasoning: 'Meh.' } },
      };

      const result = deRandomize(scores, false);
      assert.equal(result.plain_claude.naming_consistency.score, 60);
      assert.equal(result.adev_built.naming_consistency.score, 90);
    });
  });

  describe('blendScores', () => {
    it('creates llm_judge section in report', () => {
      const report = makeMockReport();
      const llmScores = makeMockLlmScores();

      const result = blendScores(report, llmScores);

      assert.ok(result.llm_judge);
      assert.equal(result.llm_judge.model, JUDGE_MODEL);
      assert.equal(result.llm_judge.blend_factor, LLM_BLEND_FACTOR);
      assert.deepEqual(result.llm_judge.judge_scored_dimensions, JUDGE_DIMENSIONS);
    });

    it('blends code_quality scores with naming_consistency and overall_code_quality', () => {
      const report = makeMockReport();
      const llmScores = makeMockLlmScores();

      const result = blendScores(report, llmScores);

      // For plain_claude code_quality: deterministic=70, llm naming=85, llm overall=75
      // The last blend applied wins since both map to code_quality
      const plainCq = result.dimensions.code_quality.plain_claude;
      assert.ok(plainCq.metrics.llm_naming_consistency === 85);
      assert.ok(plainCq.metrics.llm_overall_code_quality === 75);
      assert.ok(plainCq.metrics.deterministic_score !== undefined);
    });

    it('blends architectural_coherence with directory_structure', () => {
      const report = makeMockReport();
      const llmScores = makeMockLlmScores();

      const result = blendScores(report, llmScores);

      const plainAc = result.dimensions.architectural_coherence.plain_claude;
      assert.ok(plainAc.metrics.llm_directory_structure === 90);
    });

    it('blends commit_hygiene with commit_message_quality', () => {
      const report = makeMockReport();
      const llmScores = makeMockLlmScores();

      const result = blendScores(report, llmScores);

      const plainCh = result.dimensions.commit_hygiene.plain_claude;
      assert.ok(plainCh.metrics.llm_commit_message_quality === 40);
    });

    it('does not modify original report', () => {
      const report = makeMockReport();
      const originalScore = report.dimensions.code_quality.plain_claude.score;
      const llmScores = makeMockLlmScores();

      blendScores(report, llmScores);

      assert.equal(report.dimensions.code_quality.plain_claude.score, originalScore);
    });

    it('skips null deterministic scores', () => {
      const report = makeMockReport();
      const llmScores = makeMockLlmScores();

      const result = blendScores(report, llmScores);

      // spec_compliance plain_claude has score: null — should stay null
      assert.equal(result.dimensions.spec_compliance.plain_claude.score, null);
    });

    it('recomputes composite scores', () => {
      const report = makeMockReport();
      const llmScores = makeMockLlmScores();

      const result = blendScores(report, llmScores);

      // Composite should differ from original since scores are blended
      assert.ok(typeof result.composite.plain_claude === 'number');
      assert.ok(typeof result.composite.adev_built === 'number');
    });
  });

  describe('callJudge', () => {
    it('calls the Anthropic API with correct parameters', async () => {
      let capturedParams;

      const mockClient = {
        messages: {
          create: async (params) => {
            capturedParams = params;
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  implementation_a: {
                    naming_consistency: { score: 80, reasoning: 'Good.' },
                    directory_structure: { score: 75, reasoning: 'OK.' },
                    commit_message_quality: { score: 90, reasoning: 'Great.' },
                    overall_code_quality: { score: 85, reasoning: 'Nice.' },
                  },
                  implementation_b: {
                    naming_consistency: { score: 70, reasoning: 'Fair.' },
                    directory_structure: { score: 65, reasoning: 'Mixed.' },
                    commit_message_quality: { score: 60, reasoning: 'Basic.' },
                    overall_code_quality: { score: 72, reasoning: 'Decent.' },
                  },
                }),
              }],
            };
          },
        },
      };

      const result = await callJudge('test prompt', {
        createClient: () => mockClient,
      });

      assert.equal(capturedParams.model, JUDGE_MODEL);
      assert.equal(capturedParams.max_tokens, 2048);
      assert.equal(capturedParams.messages[0].content, 'test prompt');
      assert.equal(result.implementation_a.naming_consistency.score, 80);
      assert.equal(result.implementation_b.overall_code_quality.score, 72);
    });

    it('throws when API returns invalid JSON', async () => {
      const mockClient = {
        messages: {
          create: async () => ({
            content: [{ type: 'text', text: 'This is not JSON' }],
          }),
        },
      };

      await assert.rejects(
        () => callJudge('test', { createClient: () => mockClient }),
        /JSON/
      );
    });
  });

  describe('constants', () => {
    it('exports expected dimensions', () => {
      assert.deepEqual(JUDGE_DIMENSIONS, [
        'naming_consistency',
        'directory_structure',
        'commit_message_quality',
        'overall_code_quality',
      ]);
    });

    it('maps all judge dimensions to report dimensions', () => {
      for (const dim of JUDGE_DIMENSIONS) {
        assert.ok(DIMENSION_MAPPING[dim], `Missing mapping for ${dim}`);
      }
    });

    it('uses correct blend factor', () => {
      assert.equal(LLM_BLEND_FACTOR, 0.4);
    });
  });
});
