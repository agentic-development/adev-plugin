#!/usr/bin/env node

/**
 * Token Optimization A/B Eval
 *
 * Runs the EXACT same skill invocations against the integration-sandbox
 * project, comparing baseline (release/0.24.0) vs optimized (current branch).
 *
 * Each variant runs via `claude` CLI with `--plugin-dir` pointing to the
 * appropriate skill version. After ALL runs complete, session JSONL is parsed
 * for REAL token data — no inference, no estimation.
 *
 * Eval tasks (same set of skills the optimization touched):
 *   1. /adev:plan --spec <path>
 *   2. /adev:review-specs --spec <path>
 *   3. /adev:status
 *
 * Usage:
 *   # Run full A/B (runs 6 claude sessions — 3 baseline + 3 optimized)
 *   node tests/evals/token-optimization/run-ab-eval.mjs
 *
 *   # Run only one variant
 *   node tests/evals/token-optimization/run-ab-eval.mjs --baseline-only
 *   node tests/evals/token-optimization/run-ab-eval.mjs --optimized-only
 *
 *   # Analyze previously-run sessions by ID
 *   node tests/evals/token-optimization/run-ab-eval.mjs --analyze
 *
 * Output:
 *   tests/evals/token-optimization/results/eval-<date>.md
 *
 * Requirements:
 *   - `claude` CLI v2+ installed and authenticated
 *   - release/0.24.0 branch exists in repo
 *   - integration-sandbox at tests/evals/integration-sandbox/
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, statSync } from 'fs';
import { join, dirname, resolve, basename } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const SANDBOX = join(REPO_ROOT, 'tests', 'evals', 'integration-sandbox');
const RESULTS_DIR = join(__dirname, 'results');
const WORKTREE_DIR = join(REPO_ROOT, '.eval-worktree-baseline');

// Session JSONL location is derived from the CWD used when running claude.
// Claude hashes the project path to create the session directory.
const SANDBOX_PROJECT_KEY = '-Users-dpavancini-Development-adev-plugin-tests-evals-integration-sandbox';
const SESSIONS_DIR = join(homedir(), '.claude', 'projects', SANDBOX_PROJECT_KEY);

const args = process.argv.slice(2);
const baselineOnly = args.includes('--baseline-only');
const optimizedOnly = args.includes('--optimized-only');
const analyzeOnly = args.includes('--analyze');

// ─── Eval Task Definitions ────────────────────────────────────────────────────
//
// These are the EXACT commands a developer would run. No simulation.

const EVAL_TASKS = [
  {
    id: 'plan',
    name: '/adev:plan',
    prompt: '/adev:plan --spec .context-index/specs/features/orders/revenue-by-customer.md',
    description: 'Plan a spec into implementation tasks',
  },
  {
    id: 'review-specs',
    name: '/adev:review-specs',
    prompt: '/adev:review-specs --spec .context-index/specs/features/orders/customer-orders.md',
    description: 'Run specialist reviews on a spec',
  },
  {
    id: 'validate',
    name: '/adev:validate',
    prompt: '/adev:validate --spec .context-index/specs/features/orders/customer-orders.md',
    description: 'Validate a spec (exercises artifact-to-disk for validation report)',
  },
];

// ─── JSONL Parsing (from REAL session files only) ─────────────────────────────

function parseSessionJsonl(filePath) {
  if (!existsSync(filePath)) return null;
  const lines = readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
  const turns = [];

  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj.type === 'assistant' && obj.message?.usage) {
        const u = obj.message.usage;
        const content = obj.message?.content || [];
        const tools = content.filter(c => c.type === 'tool_use').map(c => c.name);
        const textBlocks = content.filter(c => c.type === 'text');
        const outputChars = textBlocks.reduce((s, c) => s + (c.text?.length || 0), 0);

        turns.push({
          input: u.input_tokens || 0,
          output: u.output_tokens || 0,
          cacheCreate: u.cache_creation_input_tokens || 0,
          cacheRead: u.cache_read_input_tokens || 0,
          tools,
          toolCount: tools.length,
          outputChars,
          isNoTool: tools.length === 0,
          isParallel: tools.length > 1,
          timestamp: obj.timestamp || null,
        });
      }
    } catch { /* skip malformed */ }
  }
  return turns;
}

function analyzeSession(filePath) {
  const turns = parseSessionJsonl(filePath);
  if (!turns || turns.length === 0) return null;

  const stats = {
    sessionFile: filePath,
    totalTurns: turns.length,
    toolTurns: turns.filter(t => t.toolCount > 0).length,
    noToolTurns: turns.filter(t => t.isNoTool).length,
    parallelTurns: turns.filter(t => t.isParallel).length,
    input: turns.reduce((s, t) => s + t.input, 0),
    output: turns.reduce((s, t) => s + t.output, 0),
    cacheCreate: turns.reduce((s, t) => s + t.cacheCreate, 0),
    cacheRead: turns.reduce((s, t) => s + t.cacheRead, 0),
    outputChars: turns.reduce((s, t) => s + t.outputChars, 0),
  };
  stats.totalTokens = stats.input + stats.output + stats.cacheCreate + stats.cacheRead;
  stats.cost = (
    (stats.input / 1e6) * 15 +
    (stats.output / 1e6) * 75 +
    (stats.cacheCreate / 1e6) * 18.75 +
    (stats.cacheRead / 1e6) * 1.5
  );

  // Tool usage breakdown
  const toolCounts = {};
  for (const t of turns) {
    for (const tool of t.tools) {
      toolCounts[tool] = (toolCounts[tool] || 0) + 1;
    }
  }
  stats.toolBreakdown = toolCounts;

  // Subagent analysis
  const sessionId = basename(filePath, '.jsonl');
  const subDir = join(dirname(filePath), sessionId, 'subagents');
  stats.subagents = [];
  if (existsSync(subDir)) {
    for (const f of readdirSync(subDir).filter(f => f.endsWith('.jsonl'))) {
      const subTurns = parseSessionJsonl(join(subDir, f));
      if (subTurns) {
        const sub = {
          id: f.replace('.jsonl', ''),
          turns: subTurns.length,
          output: subTurns.reduce((s, t) => s + t.output, 0),
          cacheRead: subTurns.reduce((s, t) => s + t.cacheRead, 0),
          noToolTurns: subTurns.filter(t => t.isNoTool).length,
        };
        stats.subagents.push(sub);
      }
    }
  }
  stats.subagentTurns = stats.subagents.reduce((s, a) => s + a.turns, 0);
  stats.subagentNoToolTurns = stats.subagents.reduce((s, a) => s + a.noToolTurns, 0);

  return stats;
}

// ─── Run Claude ───────────────────────────────────────────────────────────────

function runClaude(task, pluginDir, variant) {
  console.log(`  [${variant}] Running: ${task.prompt}`);

  const startTime = Date.now();
  try {
    const output = execSync(
      `claude --print --dangerously-skip-permissions --plugin-dir "${pluginDir}" -p "${task.prompt}"`,
      {
        cwd: SANDBOX,
        encoding: 'utf-8',
        timeout: 300000, // 5 minutes per task
        env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: 'cli' },
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );
    const durationMs = Date.now() - startTime;
    console.log(`  [${variant}] ✓ ${task.id} completed in ${(durationMs / 1000).toFixed(1)}s`);
    return { success: true, output, durationMs };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    console.log(`  [${variant}] ✗ ${task.id} failed after ${(durationMs / 1000).toFixed(1)}s`);
    return { success: false, error: err.message?.substring(0, 200), output: err.stdout || '', durationMs };
  }
}

// ─── Worktree Management ──────────────────────────────────────────────────────

function setupBaseline() {
  if (existsSync(WORKTREE_DIR)) {
    execSync(`git worktree remove --force "${WORKTREE_DIR}"`, { cwd: REPO_ROOT, stdio: 'pipe' });
  }
  execSync(`git worktree add "${WORKTREE_DIR}" release/0.24.0`, { cwd: REPO_ROOT, stdio: 'pipe' });
}

function cleanupBaseline() {
  if (existsSync(WORKTREE_DIR)) {
    try {
      execSync(`git worktree remove --force "${WORKTREE_DIR}"`, { cwd: REPO_ROOT, stdio: 'pipe' });
    } catch { /* best effort */ }
  }
}

// ─── Find Sessions by Timestamp ───────────────────────────────────────────────

function findSessionsAfter(afterTimestamp) {
  if (!existsSync(SESSIONS_DIR)) return [];
  return readdirSync(SESSIONS_DIR)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => ({ name: f, path: join(SESSIONS_DIR, f), mtime: statSync(join(SESSIONS_DIR, f)).mtimeMs }))
    .filter(f => f.mtime > afterTimestamp)
    .sort((a, b) => a.mtime - b.mtime);
}

// ─── Report ───────────────────────────────────────────────────────────────────

function generateReport(results) {
  let report = `# Token Optimization A/B Eval Results

**Date:** ${new Date().toISOString().split('T')[0]}
**Sandbox:** tests/evals/integration-sandbox/
**Baseline:** release/0.24.0 (before optimization)
**Optimized:** current branch (feat/token-optimization/cross-cutting-efficiency)

## Summary

`;

  for (const task of EVAL_TASKS) {
    const b = results.baseline?.[task.id];
    const o = results.optimized?.[task.id];

    if (!b || !o) {
      report += `### ${task.name}\n\nData missing for one or both variants.\n\n`;
      continue;
    }

    const delta = (field) => {
      const bv = b[field] || 0;
      const ov = o[field] || 0;
      if (bv === 0) return 'N/A';
      return `${Math.round(((ov - bv) / bv) * 100)}%`;
    };

    report += `### ${task.name} — ${task.description}

| Metric | Baseline | Optimized | Delta |
|--------|:---:|:---:|:---:|
| Total turns | ${b.totalTurns} | ${o.totalTurns} | ${delta('totalTurns')} |
| No-tool turns (narration) | ${b.noToolTurns} | ${o.noToolTurns} | ${delta('noToolTurns')} |
| Parallel tool turns | ${b.parallelTurns} | ${o.parallelTurns} | ${delta('parallelTurns')} |
| Subagent turns | ${b.subagentTurns} | ${o.subagentTurns} | ${delta('subagentTurns')} |
| Subagent no-tool turns | ${b.subagentNoToolTurns} | ${o.subagentNoToolTurns} | ${delta('subagentNoToolTurns')} |
| Output tokens | ${b.output.toLocaleString()} | ${o.output.toLocaleString()} | ${delta('output')} |
| Cache reads | ${b.cacheRead.toLocaleString()} | ${o.cacheRead.toLocaleString()} | ${delta('cacheRead')} |
| Total tokens | ${b.totalTokens.toLocaleString()} | ${o.totalTokens.toLocaleString()} | ${delta('totalTokens')} |
| Output chars (artifact echo) | ${b.outputChars.toLocaleString()} | ${o.outputChars.toLocaleString()} | ${delta('outputChars')} |
| Duration (ms) | ${b.durationMs?.toLocaleString() || 'N/A'} | ${o.durationMs?.toLocaleString() || 'N/A'} | ${delta('durationMs')} |
| **Cost** | **$${b.cost.toFixed(3)}** | **$${o.cost.toFixed(3)}** | **${delta('cost')}** |

`;
  }

  // Aggregate
  const allBaseline = Object.values(results.baseline || {}).filter(Boolean);
  const allOptimized = Object.values(results.optimized || {}).filter(Boolean);
  if (allBaseline.length > 0 && allOptimized.length > 0) {
    const sumB = {
      totalTurns: allBaseline.reduce((s, r) => s + r.totalTurns, 0),
      noToolTurns: allBaseline.reduce((s, r) => s + r.noToolTurns, 0),
      output: allBaseline.reduce((s, r) => s + r.output, 0),
      cacheRead: allBaseline.reduce((s, r) => s + r.cacheRead, 0),
      totalTokens: allBaseline.reduce((s, r) => s + r.totalTokens, 0),
      cost: allBaseline.reduce((s, r) => s + r.cost, 0),
    };
    const sumO = {
      totalTurns: allOptimized.reduce((s, r) => s + r.totalTurns, 0),
      noToolTurns: allOptimized.reduce((s, r) => s + r.noToolTurns, 0),
      output: allOptimized.reduce((s, r) => s + r.output, 0),
      cacheRead: allOptimized.reduce((s, r) => s + r.cacheRead, 0),
      totalTokens: allOptimized.reduce((s, r) => s + r.totalTokens, 0),
      cost: allOptimized.reduce((s, r) => s + r.cost, 0),
    };
    const ad = (field) => {
      if (sumB[field] === 0) return 'N/A';
      return `${Math.round(((sumO[field] - sumB[field]) / sumB[field]) * 100)}%`;
    };

    report += `## Aggregate (all ${EVAL_TASKS.length} tasks combined)

| Metric | Baseline | Optimized | Delta |
|--------|:---:|:---:|:---:|
| Total turns | ${sumB.totalTurns} | ${sumO.totalTurns} | ${ad('totalTurns')} |
| No-tool turns | ${sumB.noToolTurns} | ${sumO.noToolTurns} | ${ad('noToolTurns')} |
| Output tokens | ${sumB.output.toLocaleString()} | ${sumO.output.toLocaleString()} | ${ad('output')} |
| Cache reads | ${sumB.cacheRead.toLocaleString()} | ${sumO.cacheRead.toLocaleString()} | ${ad('cacheRead')} |
| Total tokens | ${sumB.totalTokens.toLocaleString()} | ${sumO.totalTokens.toLocaleString()} | ${ad('totalTokens')} |
| **Total cost** | **$${sumB.cost.toFixed(3)}** | **$${sumO.cost.toFixed(3)}** | **${ad('cost')}** |

`;
  }

  report += `## Methodology

- Both variants run the EXACT same slash commands against the same project.
- Baseline uses skills from \`release/0.24.0\` via \`--plugin-dir\` (git worktree).
- Optimized uses skills from current branch via \`--plugin-dir\` (repo root).
- Token data is parsed from real session JSONL files — no estimation or inference.
- Each session runs in isolation with \`--print\` mode (non-interactive, single response).
- Subagent JSONL is included when available (nested in \`<session-id>/subagents/\`).
`;

  return report;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  mkdirSync(RESULTS_DIR, { recursive: true });

  console.log('═══════════════════════════════════════════════');
  console.log('  Token Optimization A/B Eval');
  console.log('═══════════════════════════════════════════════\n');
  console.log(`Tasks: ${EVAL_TASKS.map(t => t.id).join(', ')}`);
  console.log(`Sandbox: ${SANDBOX}`);
  console.log(`Sessions: ${SESSIONS_DIR}\n`);

  const results = { baseline: {}, optimized: {} };
  const runMeta = { baseline: {}, optimized: {} };

  // ─── Baseline Runs ───
  if (!optimizedOnly && !analyzeOnly) {
    console.log('━━━ BASELINE (release/0.24.0) ━━━\n');
    setupBaseline();
    const beforeBaseline = Date.now();

    for (const task of EVAL_TASKS) {
      const result = runClaude(task, WORKTREE_DIR, 'baseline');
      runMeta.baseline[task.id] = { ...result, startedAt: beforeBaseline };
    }

    cleanupBaseline();
    runMeta.baseline._completedAt = Date.now();
    console.log('');
  }

  // ─── Optimized Runs ───
  if (!baselineOnly && !analyzeOnly) {
    console.log('━━━ OPTIMIZED (current branch) ━━━\n');
    const beforeOptimized = Date.now();

    for (const task of EVAL_TASKS) {
      const result = runClaude(task, REPO_ROOT, 'optimized');
      runMeta.optimized[task.id] = { ...result, startedAt: beforeOptimized };
    }

    runMeta.optimized._completedAt = Date.now();
    console.log('');
  }

  // ─── Analyze Sessions ───
  console.log('━━━ ANALYZING SESSION JSONL ━━━\n');

  // Find sessions created during each variant's run window
  if (!analyzeOnly) {
    // Wait a moment for file system to flush
    execSync('sleep 2');
  }

  const allSessions = findSessionsAfter(0);
  console.log(`Found ${allSessions.length} total sessions in project dir.\n`);

  // For --analyze mode, use the most recent sessions
  // For run mode, find sessions created during our run windows
  if (analyzeOnly) {
    // Take the 6 most recent sessions (3 baseline + 3 optimized)
    const recent = allSessions.slice(-6);
    if (recent.length < 6) {
      console.log(`Warning: expected 6 recent sessions, found ${recent.length}`);
      console.log('Run the eval first, then use --analyze.\n');
    }
    // First 3 = baseline, last 3 = optimized (by time order)
    const half = Math.floor(recent.length / 2);
    for (let i = 0; i < Math.min(half, EVAL_TASKS.length); i++) {
      const stats = analyzeSession(recent[i].path);
      if (stats) {
        stats.durationMs = runMeta.baseline[EVAL_TASKS[i]?.id]?.durationMs || null;
        results.baseline[EVAL_TASKS[i].id] = stats;
        console.log(`  Baseline ${EVAL_TASKS[i].id}: ${stats.totalTurns} turns, $${stats.cost.toFixed(3)}`);
      }
    }
    for (let i = half; i < Math.min(recent.length, half + EVAL_TASKS.length); i++) {
      const taskIdx = i - half;
      const stats = analyzeSession(recent[i].path);
      if (stats) {
        stats.durationMs = runMeta.optimized[EVAL_TASKS[taskIdx]?.id]?.durationMs || null;
        results.optimized[EVAL_TASKS[taskIdx].id] = stats;
        console.log(`  Optimized ${EVAL_TASKS[taskIdx].id}: ${stats.totalTurns} turns, $${stats.cost.toFixed(3)}`);
      }
    }
  } else {
    // Match sessions to tasks by creation time
    for (const variant of ['baseline', 'optimized']) {
      if ((variant === 'baseline' && optimizedOnly) || (variant === 'optimized' && baselineOnly)) continue;

      const variantSessions = allSessions.filter(s =>
        s.mtime > (runMeta[variant]._completedAt - 600000) && // within 10 min before completion
        s.mtime <= runMeta[variant]._completedAt + 5000
      ).slice(-EVAL_TASKS.length); // take the last N

      for (let i = 0; i < variantSessions.length && i < EVAL_TASKS.length; i++) {
        const stats = analyzeSession(variantSessions[i].path);
        if (stats) {
          stats.durationMs = runMeta[variant][EVAL_TASKS[i].id]?.durationMs || null;
          results[variant][EVAL_TASKS[i].id] = stats;
          console.log(`  ${variant} ${EVAL_TASKS[i].id}: ${stats.totalTurns} turns, $${stats.cost.toFixed(3)}`);
        }
      }
    }
  }

  // ─── Generate Report ───
  console.log('\n━━━ REPORT ━━━\n');
  const report = generateReport(results);
  const reportPath = join(RESULTS_DIR, `eval-${new Date().toISOString().replace(/[:.]/g, '-').split('T')[0]}.md`);
  writeFileSync(reportPath, report);
  console.log(report);
  console.log(`\nReport saved: ${reportPath}`);

  // Save raw data for reproducibility
  writeFileSync(
    join(RESULTS_DIR, 'last-run.json'),
    JSON.stringify({ results, runMeta, timestamp: new Date().toISOString() }, null, 2)
  );
}

main().catch(err => {
  console.error('Eval failed:', err.message);
  cleanupBaseline();
  process.exit(1);
});
