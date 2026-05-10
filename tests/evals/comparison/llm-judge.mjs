#!/usr/bin/env node

/**
 * LLM Judge module for comparison eval harness.
 *
 * Scores dimensions that require qualitative judgment:
 *   - naming_consistency (within code_quality)
 *   - directory_structure (within architectural_coherence)
 *   - commit_message_quality (within commit_hygiene)
 *   - overall_code_quality (holistic signal)
 *
 * Uses the Anthropic SDK with claude-haiku-4-5-20251001 for fast, cheap scoring.
 * Randomizes which branch is "A" vs "B" to eliminate bias.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const JUDGE_MODEL = 'claude-haiku-4-5-20251001';
const JUDGE_MAX_TOKENS = 2048;

const JUDGE_DIMENSIONS = [
  'naming_consistency',
  'directory_structure',
  'commit_message_quality',
  'overall_code_quality',
];

/**
 * Blend factor: final = (1 - BLEND) * deterministic + BLEND * llm_judge
 * for dimensions that have both scores.
 */
const LLM_BLEND_FACTOR = 0.4;

/**
 * Mapping from LLM judge dimensions to the deterministic report dimensions
 * they augment.
 */
const DIMENSION_MAPPING = {
  naming_consistency: 'code_quality',
  directory_structure: 'architectural_coherence',
  commit_message_quality: 'commit_hygiene',
  overall_code_quality: 'code_quality',
};

/**
 * Extract diff and commit messages for a branch relative to main.
 *
 * @param {string} projectDir - absolute path to the eval project git repo
 * @param {string} branch - branch name (e.g. 'plain-claude')
 * @returns {{ diff: string, commits: string }}
 */
export function extractBranchData(projectDir, branch) {
  const diff = execSync(`git diff main..${branch}`, {
    cwd: projectDir,
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
  });

  const commits = execSync(`git log main..${branch} --format="%H%n%s%n%b%n---"`, {
    cwd: projectDir,
    encoding: 'utf-8',
  });

  return { diff, commits };
}

/**
 * Read the project README from the main branch.
 *
 * @param {string} projectDir - absolute path to the eval project git repo
 * @returns {string}
 */
export function readProjectReadme(projectDir) {
  try {
    return execSync('git show main:README.md', {
      cwd: projectDir,
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024,
    });
  } catch {
    return '(no README.md found on main branch)';
  }
}

/**
 * Build the judge prompt with randomized branch assignment.
 *
 * @param {object} params
 * @param {string} params.readme - project README content
 * @param {string} params.diffA - diff for "Implementation A"
 * @param {string} params.commitsA - commits for "Implementation A"
 * @param {string} params.diffB - diff for "Implementation B"
 * @param {string} params.commitsB - commits for "Implementation B"
 * @returns {string}
 */
export function buildJudgePrompt({ readme, diffA, commitsA, diffB, commitsB }) {
  // Truncate diffs if they're very long to stay within token limits
  const maxDiffLen = 15000;
  const truncA = diffA.length > maxDiffLen
    ? diffA.slice(0, maxDiffLen) + '\n... (truncated)'
    : diffA;
  const truncB = diffB.length > maxDiffLen
    ? diffB.slice(0, maxDiffLen) + '\n... (truncated)'
    : diffB;

  return `You are a code review judge. You will evaluate two implementations of the same feature set for a project.

## Project Context (from README)

${readme}

## Implementation A — Diff

\`\`\`diff
${truncA}
\`\`\`

## Implementation A — Commit Messages

\`\`\`
${commitsA}
\`\`\`

## Implementation B — Diff

\`\`\`diff
${truncB}
\`\`\`

## Implementation B — Commit Messages

\`\`\`
${commitsB}
\`\`\`

## Task

Score each implementation (A and B) on the following four dimensions, each on a 0-100 scale.

1. **naming_consistency**: Do new symbols (functions, variables, classes, files) follow the naming conventions already established in the project? Consider camelCase vs snake_case consistency, descriptive names, and alignment with existing patterns.

2. **directory_structure**: Are new files placed in sensible directories? Do new directories follow the existing project layout? Or are files scattered in unexpected locations?

3. **commit_message_quality**: Are the commit messages descriptive, meaningful, and properly scoped? Do they explain the "why" not just the "what"? Are commits atomic and well-organized?

4. **overall_code_quality**: Holistic assessment of code readability, idiomatic patterns, error handling, and general craftsmanship.

## Required Output Format

Return ONLY valid JSON with no additional text, using exactly this structure:

{
  "implementation_a": {
    "naming_consistency": { "score": <0-100>, "reasoning": "<one sentence>" },
    "directory_structure": { "score": <0-100>, "reasoning": "<one sentence>" },
    "commit_message_quality": { "score": <0-100>, "reasoning": "<one sentence>" },
    "overall_code_quality": { "score": <0-100>, "reasoning": "<one sentence>" }
  },
  "implementation_b": {
    "naming_consistency": { "score": <0-100>, "reasoning": "<one sentence>" },
    "directory_structure": { "score": <0-100>, "reasoning": "<one sentence>" },
    "commit_message_quality": { "score": <0-100>, "reasoning": "<one sentence>" },
    "overall_code_quality": { "score": <0-100>, "reasoning": "<one sentence>" }
  }
}`;
}

/**
 * Randomize which branch is A vs B. Returns the assignment and a function
 * to de-randomize the results.
 *
 * @returns {{ aIsPlainClaude: boolean }}
 */
export function randomizeAssignment() {
  return { aIsPlainClaude: Math.random() < 0.5 };
}

/**
 * Parse the judge response JSON. Tolerant of markdown code fences.
 *
 * @param {string} text - raw response text
 * @returns {object} parsed judge scores
 */
export function parseJudgeResponse(text) {
  // Strip markdown code fences if present
  const cleaned = text.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
  return JSON.parse(cleaned);
}

/**
 * De-randomize judge scores back to plain_claude / adev_built.
 *
 * @param {object} judgeScores - parsed judge response with implementation_a / implementation_b
 * @param {boolean} aIsPlainClaude - whether A was plain-claude
 * @returns {{ plain_claude: object, adev_built: object }}
 */
export function deRandomize(judgeScores, aIsPlainClaude) {
  if (aIsPlainClaude) {
    return {
      plain_claude: judgeScores.implementation_a,
      adev_built: judgeScores.implementation_b,
    };
  }
  return {
    plain_claude: judgeScores.implementation_b,
    adev_built: judgeScores.implementation_a,
  };
}

/**
 * Blend LLM judge scores with existing deterministic scores.
 *
 * For dimensions that have a mapping (e.g. naming_consistency -> code_quality),
 * the blended score is: (1 - BLEND) * deterministic + BLEND * llm_judge.
 *
 * @param {object} report - existing per-project report JSON
 * @param {object} llmScores - de-randomized LLM scores { plain_claude, adev_built }
 * @returns {object} updated report with llm_judge section and blended scores
 */
export function blendScores(report, llmScores) {
  const updated = JSON.parse(JSON.stringify(report)); // deep clone

  // Add raw LLM judge section
  updated.llm_judge = {
    model: JUDGE_MODEL,
    blend_factor: LLM_BLEND_FACTOR,
    scores: llmScores,
    judge_scored_dimensions: [...JUDGE_DIMENSIONS],
    deterministic_only_dimensions: Object.keys(report.dimensions).filter(
      (d) => !Object.values(DIMENSION_MAPPING).includes(d)
    ),
  };

  // Blend into deterministic dimensions
  for (const [judgeDim, reportDim] of Object.entries(DIMENSION_MAPPING)) {
    if (!updated.dimensions[reportDim]) continue;

    for (const branch of ['plain_claude', 'adev_built']) {
      const branchDimData = updated.dimensions[reportDim]?.[branch];
      const llmBranchData = llmScores[branch]?.[judgeDim];

      if (!branchDimData || branchDimData.score === null || !llmBranchData) continue;

      const deterministicScore = branchDimData.score;
      const llmScore = llmBranchData.score;
      const blended = Math.round(
        (1 - LLM_BLEND_FACTOR) * deterministicScore + LLM_BLEND_FACTOR * llmScore
      );

      // Store both the original and blended
      if (!branchDimData.metrics) branchDimData.metrics = {};
      branchDimData.metrics[`llm_${judgeDim}`] = llmScore;
      branchDimData.metrics[`llm_${judgeDim}_reasoning`] = llmBranchData.reasoning;
      branchDimData.metrics.deterministic_score = deterministicScore;
      branchDimData.score = blended;
    }
  }

  // Recompute composite scores
  const dims = Object.keys(updated.dimensions);
  for (const branch of ['plain_claude', 'adev_built']) {
    const scores = dims
      .map((d) => updated.dimensions[d]?.[branch]?.score)
      .filter((s) => s !== null && s !== undefined);
    if (scores.length > 0) {
      updated.composite[branch] = Math.round(
        scores.reduce((sum, s) => sum + s, 0) / scores.length
      );
    }
  }

  return updated;
}

/**
 * Call the Anthropic API to get judge scores.
 *
 * @param {string} prompt - the judge prompt
 * @param {object} [options]
 * @param {Function} [options.createClient] - factory for Anthropic client (for testing)
 * @returns {Promise<object>} parsed judge scores
 */
export async function callJudge(prompt, options = {}) {
  let client;

  if (options.createClient) {
    client = options.createClient();
  } else {
    // Lazy import so tests and non-judge runs don't need the SDK installed
    let Anthropic;
    try {
      ({ default: Anthropic } = await import('@anthropic-ai/sdk'));
    } catch (e) {
      throw new Error(
        `llm-judge: @anthropic-ai/sdk is not installed. Run 'npm install @anthropic-ai/sdk' in the plugin root, then retry.\n(original: ${e.message})`
      );
    }
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('llm-judge: ANTHROPIC_API_KEY environment variable is not set.');
    client = new Anthropic({ apiKey });
  }

  const response = await client.messages.create({
    model: JUDGE_MODEL,
    max_tokens: JUDGE_MAX_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('\n');

  return parseJudgeResponse(text);
}

/**
 * Run the LLM judge for a single project.
 *
 * @param {string} projectDir - absolute path to the eval project git repo
 * @param {object} existingReport - existing deterministic report JSON
 * @param {object} [options]
 * @param {Function} [options.createClient] - factory for Anthropic client (for testing)
 * @returns {Promise<object>} updated report with LLM judge scores blended in
 */
export async function judgeProject(projectDir, existingReport, options = {}) {
  const readme = readProjectReadme(projectDir);

  const plainData = extractBranchData(projectDir, 'plain-claude');
  const adevData = extractBranchData(projectDir, 'adev-built');

  const { aIsPlainClaude } = randomizeAssignment();

  const diffA = aIsPlainClaude ? plainData.diff : adevData.diff;
  const commitsA = aIsPlainClaude ? plainData.commits : adevData.commits;
  const diffB = aIsPlainClaude ? adevData.diff : plainData.diff;
  const commitsB = aIsPlainClaude ? adevData.commits : plainData.commits;

  const prompt = buildJudgePrompt({ readme, diffA, commitsA, diffB, commitsB });

  console.log(`  Calling LLM judge (${JUDGE_MODEL})...`);
  console.log(`  Branch assignment: A=${aIsPlainClaude ? 'plain-claude' : 'adev-built'}, B=${aIsPlainClaude ? 'adev-built' : 'plain-claude'}`);

  const judgeScores = await callJudge(prompt, options);
  const deRandomized = deRandomize(judgeScores, aIsPlainClaude);

  return blendScores(existingReport, deRandomized);
}

export { JUDGE_DIMENSIONS, JUDGE_MODEL, LLM_BLEND_FACTOR, DIMENSION_MAPPING };
