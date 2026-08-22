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
 *   # Rigor-tier A/B: --tier full vs --tier quick for the gate skills
 *   # (graduated-rigor-tiers.spec.md), N interleaved samples each, totals
 *   # include subagent tokens. No baseline worktree needed.
 *   node tests/evals/token-optimization/run-ab-eval.mjs --tier-ab --samples 3
 *   # add --judge to also score output quality (LLM judge) alongside verdict
 *   # agreement, so the comparison covers quality, not just cost:
 *   node tests/evals/token-optimization/run-ab-eval.mjs --tier-ab --samples 2 --judge
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
import { computeCost } from '../../../lib/token-pricing.mjs';

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
// Rigor-tier A/B mode (graduated-rigor-tiers.spec.md): compare --tier full vs
// --tier quick for the gate skills, N interleaved samples each.
const tierAb = args.includes('--tier-ab');
const samples = (() => {
  const i = args.indexOf('--samples');
  const n = i >= 0 ? parseInt(args[i + 1], 10) : 3;
  return Number.isFinite(n) && n > 0 ? n : 3;
})();
// Quality dimension: capture the verdict from each run's artifact (always, cheap)
// and — with --judge — score output quality via an LLM judge (extra claude call).
const useJudge = args.includes('--judge');

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
          model: obj.message?.model || null,
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

// Cost from REAL per-model rates (lib/token-pricing.mjs), never a fixed
// assumed tier. A session mixes models across turns (main-loop model vs.
// each reviewer subagent's own profile.model.tier — fast/capable/reasoning
// commonly resolve to different models), so cost is summed per turn using
// that turn's own `model` field, not one rate applied to the whole session.
// A model absent from PRICE_TABLE is reported as unpriced rather than
// guessed at with someone else's rate — silently mis-costing one model as
// another is worse than an honest "N tokens unpriced".
function sumTurnsCost(turnsList) {
  let cost = 0;
  let unknownTokens = 0;
  const unknownModels = new Set();
  for (const t of turnsList) {
    const c = t.model
      ? computeCost(t.model, { inputTokens: t.input, outputTokens: t.output, cacheReadTokens: t.cacheRead, cacheCreationTokens: t.cacheCreate })
      : null;
    if (c === null) {
      unknownTokens += t.input + t.output + t.cacheCreate + t.cacheRead;
      unknownModels.add(t.model || '(missing model field)');
    } else {
      cost += c;
    }
  }
  return { cost, unknownTokens, unknownModels: [...unknownModels] };
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
  const mainCost = sumTurnsCost(turns);
  stats.cost = mainCost.cost;
  stats.costUnknownTokens = mainCost.unknownTokens;
  stats.costUnknownModels = mainCost.unknownModels;

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
        const subCost = sumTurnsCost(subTurns);
        const sub = {
          id: f.replace('.jsonl', ''),
          turns: subTurns.length,
          input: subTurns.reduce((s, t) => s + t.input, 0),
          output: subTurns.reduce((s, t) => s + t.output, 0),
          cacheCreate: subTurns.reduce((s, t) => s + t.cacheCreate, 0),
          cacheRead: subTurns.reduce((s, t) => s + t.cacheRead, 0),
          noToolTurns: subTurns.filter(t => t.isNoTool).length,
          cost: subCost.cost,
          costUnknownTokens: subCost.unknownTokens,
          costUnknownModels: subCost.unknownModels,
        };
        stats.subagents.push(sub);
      }
    }
  }
  stats.subagentTurns = stats.subagents.reduce((s, a) => s + a.turns, 0);
  stats.subagentNoToolTurns = stats.subagents.reduce((s, a) => s + a.noToolTurns, 0);
  stats.subagentCount = stats.subagents.length;

  // Fold subagent tokens into an "including subagents" total + cost. The tier
  // comparison lives here (full review = 3 reviewer subagents, quick = 1), so
  // main-session-only totals would miss the entire signal.
  const subIn = stats.subagents.reduce((s, a) => s + a.input, 0);
  const subOut = stats.subagents.reduce((s, a) => s + a.output, 0);
  const subCC = stats.subagents.reduce((s, a) => s + a.cacheCreate, 0);
  const subCR = stats.subagents.reduce((s, a) => s + a.cacheRead, 0);
  stats.totalTokensInclSub = stats.totalTokens + subIn + subOut + subCC + subCR;
  stats.outputInclSub = stats.output + subOut;
  const subCostTotal = stats.subagents.reduce((s, a) => s + a.cost, 0);
  stats.costInclSub = stats.cost + subCostTotal;
  stats.costUnknownTokensInclSub = stats.costUnknownTokens + stats.subagents.reduce((s, a) => s + a.costUnknownTokens, 0);
  stats.costUnknownModelsInclSub = [...new Set([
    ...stats.costUnknownModels,
    ...stats.subagents.flatMap((a) => a.costUnknownModels),
  ])];

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

// ─── Rigor-Tier A/B (full vs quick) ───────────────────────────────────────────

const TIER_TASKS = [
  {
    id: 'review-specs',
    name: '/adev:review-specs',
    prompt: (tier) => `/adev:review-specs --spec .context-index/specs/features/orders/customer-orders.md --tier ${tier}`,
  },
  {
    id: 'validate',
    name: '/adev:validate',
    prompt: (tier) => `/adev:validate --spec .context-index/specs/features/orders/customer-orders.md --tier ${tier}`,
  },
];

// Artifact each gate skill writes — read for the QUALITY dimension before the
// next sandbox reset wipes it. Naming is inconsistent across skills (review uses
// `.review.md`, validate uses `-validation.md`), so list candidates.
const TIER_ARTIFACTS = {
  'review-specs': ['.context-index/specs/features/orders/customer-orders.review.md'],
  'validate': [
    '.context-index/specs/features/orders/customer-orders-validation.md',
    '.context-index/specs/features/orders/customer-orders.validation.md',
  ],
};

// Read the produced artifact and extract the verdict + finding counts. Runs
// after each session, before the next resetSandbox(). Returns { verdict, ... }.
function captureArtifact(taskId) {
  const candidates = TIER_ARTIFACTS[taskId] || [];
  const p = candidates.map((rel) => join(SANDBOX, rel)).find((abs) => existsSync(abs));
  if (!p) return { verdict: 'MISSING', raw: '', bytes: 0 };
  const raw = readFileSync(p, 'utf-8');
  let verdict = 'UNKNOWN';
  const m = raw.match(/Verdict:\s*\**\s*(PASS_WITH_NOTES|PASS_PENDING_HUMAN|PASS|BLOCK|FAIL)/i);
  if (m) {
    verdict = m[1].toUpperCase();
  } else if (taskId === 'validate') {
    // Validate reports an overall status rather than a single Verdict: line.
    const om = raw.match(/Overall\s*Status[:\s*]*\**\s*(PASS|FAIL)/i);
    if (om) verdict = om[1].toUpperCase();
    else if (/\bFAIL\b/.test(raw)) verdict = 'FAIL';
    else if (/\bPASS\b/.test(raw)) verdict = 'PASS';
  }
  const fm = raw.match(/Total findings:\s*\**\s*(\d+)\s*\((\d+)\s*blocker/i);
  const findings = fm ? { total: Number(fm[1]), blockers: Number(fm[2]) } : null;
  return { verdict, findings, raw, bytes: raw.length };
}

// LLM-judge the QUALITY of an artifact (0-100). Uses stdin (execSync `input`) to
// avoid shell-escaping the artifact. Returns { score, rationale } or null.
function judgeQuality(taskId, artifactText) {
  if (!artifactText) return null;
  const kind = taskId === 'validate' ? 'post-implementation validation report' : 'spec architecture review';
  const prompt = [
    `You are an impartial evaluator scoring the QUALITY of an adev ${kind}.`,
    `Score 0-100 weighing: thoroughness (examined the artifact comprehensively),`,
    `specificity (concrete section/file references, not vague), correctness (findings`,
    `are valid, no hallucinated issues), and actionability (clear next steps).`,
    `A short, correct review of a clean artifact can still score high.`,
    `Return ONLY compact JSON: {"score": <0-100 integer>, "rationale": "<=200 chars"}.`,
    ``,
    `=== ARTIFACT UNDER REVIEW ===`,
    artifactText.slice(0, 24000),
  ].join('\n');
  try {
    const out = execSync('claude --print --output-format json --dangerously-skip-permissions', {
      input: prompt, encoding: 'utf-8', timeout: 120000, stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: 'cli' },
    });
    const result = (JSON.parse(out).result ?? '').toString();
    const jm = result.match(/\{[\s\S]*\}/);
    if (!jm) return null;
    const parsed = JSON.parse(jm[0]);
    const score = Number(parsed.score);
    return Number.isFinite(score) ? { score, rationale: (parsed.rationale || '').slice(0, 200) } : null;
  } catch {
    return null;
  }
}

function resetSandbox() {
  try {
    execSync('git checkout -- tests/evals/integration-sandbox/', { cwd: REPO_ROOT, stdio: 'pipe' });
    execSync('git clean -fdq tests/evals/integration-sandbox/', { cwd: REPO_ROOT, stdio: 'pipe' });
  } catch { /* best effort */ }
}

// Run one claude session, capturing session_id from --output-format json so we
// analyze the EXACT session (main + subagents) — no fragile mtime matching.
function runClaudeCapture(prompt, label) {
  console.log(`  [${label}] ${prompt}`);
  const startTime = Date.now();
  try {
    const out = execSync(
      `claude --print --output-format json --dangerously-skip-permissions --plugin-dir "${REPO_ROOT}" -p "${prompt}"`,
      { cwd: SANDBOX, encoding: 'utf-8', timeout: 300000, env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: 'cli' }, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    const durationMs = Date.now() - startTime;
    let sessionId = null;
    try { sessionId = JSON.parse(out).session_id || null; } catch { /* non-JSON */ }
    console.log(`  [${label}] ✓ ${(durationMs / 1000).toFixed(1)}s  session=${sessionId?.slice(0, 8) || '?'}`);
    return { success: true, sessionId, durationMs };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    console.log(`  [${label}] ✗ failed after ${(durationMs / 1000).toFixed(1)}s`);
    return { success: false, sessionId: null, durationMs, error: err.message?.slice(0, 200) };
  }
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

async function runTierAb() {
  mkdirSync(RESULTS_DIR, { recursive: true });
  console.log('═══ Rigor-Tier A/B (full vs quick) ═══');
  console.log(`Samples per (task, tier): ${samples}. Tier order interleaved to balance cache warming.\n`);

  const collected = {};
  for (const task of TIER_TASKS) collected[task.id] = { full: [], quick: [] };

  for (const task of TIER_TASKS) {
    console.log(`━━━ ${task.name} ━━━`);
    for (let s = 0; s < samples; s++) {
      // Alternate which tier runs first each sample so neither consistently
      // benefits from a warm 5-min prompt cache.
      const order = s % 2 === 0 ? ['full', 'quick'] : ['quick', 'full'];
      for (const tier of order) {
        resetSandbox();
        const run = runClaudeCapture(task.prompt(tier), `${task.id}:${tier}#${s + 1}`);
        if (!run.success || !run.sessionId) { console.log('    (skipped — no session id)'); continue; }
        const stats = analyzeSession(join(SESSIONS_DIR, run.sessionId + '.jsonl'));
        if (!stats) continue;
        stats.durationMs = run.durationMs;
        // Quality dimension — read the artifact this run produced BEFORE the next
        // iteration's resetSandbox() wipes it.
        const art = captureArtifact(task.id);
        stats.verdict = art.verdict;
        stats.findings = art.findings;
        if (useJudge && art.raw) {
          const q = judgeQuality(task.id, art.raw);
          stats.qualityScore = q ? q.score : null;
          stats.qualityRationale = q ? q.rationale : null;
          console.log(`    verdict=${art.verdict}  quality=${q ? q.score : 'n/a'}`);
        } else {
          console.log(`    verdict=${art.verdict}`);
        }
        collected[task.id][tier].push(stats);
      }
    }
  }
  resetSandbox();

  const report = generateTierReport(collected);
  const reportPath = join(RESULTS_DIR, `tier-eval-${new Date().toISOString().replace(/[:.]/g, '-').split('T')[0]}.md`);
  writeFileSync(reportPath, report);
  console.log('\n' + report);
  console.log(`Report saved: ${reportPath}`);
  writeFileSync(join(RESULTS_DIR, 'last-tier-run.json'), JSON.stringify({ collected, samples, timestamp: new Date().toISOString() }, null, 2));
}

function generateTierReport(collected) {
  const agg = (runs, field) => mean(runs.map(r => r[field] || 0));
  let report = `# Rigor-Tier A/B Eval (full vs quick)\n\n`;
  report += `**Date:** ${new Date().toISOString().split('T')[0]}\n`;
  report += `**Spec:** graduated-rigor-tiers.spec.md\n`;
  report += `**Sandbox:** tests/evals/integration-sandbox/\n\n`;
  report += `Means over N samples per (task, tier), interleaved order. Totals **include subagent tokens** (the tier signal). Cost uses Opus pricing (in $15, out $75, cache-create $18.75, cache-read $1.5 /Mtok). **Quality** = verdict parsed from each run's artifact + (with --judge) an LLM 0-100 output-quality score. A cheaper tier is only a win if quality/verdict hold.\n\n`;

  let sumFull = 0, sumQuick = 0;
  for (const task of TIER_TASKS) {
    const full = collected[task.id].full, quick = collected[task.id].quick;
    if (!full.length || !quick.length) { report += `## ${task.name}\n\nMissing runs (full=${full.length}, quick=${quick.length}).\n\n`; continue; }
    const d = (f) => { const bf = agg(full, f); return bf === 0 ? 'N/A' : `${Math.round(((agg(quick, f) - bf) / bf) * 100)}%`; };
    const costFull = agg(full, 'costInclSub'), costQuick = agg(quick, 'costInclSub');
    sumFull += costFull; sumQuick += costQuick;
    report += `## ${task.name}  (n=${full.length} full / ${quick.length} quick)\n\n`;
    report += `| Metric (mean, incl. subagents) | full | quick | Δ |\n|---|---:|---:|---:|\n`;
    report += `| Subagents dispatched | ${agg(full, 'subagentCount').toFixed(1)} | ${agg(quick, 'subagentCount').toFixed(1)} | ${d('subagentCount')} |\n`;
    report += `| Output tokens | ${Math.round(agg(full, 'outputInclSub')).toLocaleString()} | ${Math.round(agg(quick, 'outputInclSub')).toLocaleString()} | ${d('outputInclSub')} |\n`;
    report += `| Total tokens | ${Math.round(agg(full, 'totalTokensInclSub')).toLocaleString()} | ${Math.round(agg(quick, 'totalTokensInclSub')).toLocaleString()} | ${d('totalTokensInclSub')} |\n`;
    report += `| Duration (ms) | ${Math.round(agg(full, 'durationMs')).toLocaleString()} | ${Math.round(agg(quick, 'durationMs')).toLocaleString()} | ${d('durationMs')} |\n`;
    // Quality row (mean LLM-judge score), when --judge was used.
    const qFull = full.filter(r => typeof r.qualityScore === 'number').map(r => r.qualityScore);
    const qQuick = quick.filter(r => typeof r.qualityScore === 'number').map(r => r.qualityScore);
    if (qFull.length || qQuick.length) {
      const mf = qFull.length ? mean(qFull).toFixed(0) : 'n/a';
      const mq = qQuick.length ? mean(qQuick).toFixed(0) : 'n/a';
      const dq = (qFull.length && qQuick.length && mean(qFull) !== 0)
        ? `${Math.round(((mean(qQuick) - mean(qFull)) / mean(qFull)) * 100)}%` : 'N/A';
      report += `| Output quality (LLM judge 0-100) | ${mf} | ${mq} | ${dq} |\n`;
    }
    report += `| **Cost** | **$${costFull.toFixed(3)}** | **$${costQuick.toFixed(3)}** | **${d('costInclSub')}** |\n\n`;

    // Verdict agreement — the key safety check: did quick under-call vs full?
    const vFull = full.map(r => r.verdict || '?');
    const vQuick = quick.map(r => r.verdict || '?');
    report += `**Verdicts** — full: [${vFull.join(', ')}] · quick: [${vQuick.join(', ')}]\n\n`;
    const strictness = { PASS: 0, PASS_WITH_NOTES: 1, PASS_PENDING_HUMAN: 1, FAIL: 2, BLOCK: 2, UNKNOWN: -1, MISSING: -1 };
    const maxFull = Math.max(-1, ...vFull.map(v => strictness[v] ?? -1));
    const maxQuick = Math.max(-1, ...vQuick.map(v => strictness[v] ?? -1));
    if (maxFull >= 2 && maxQuick < maxFull) {
      report += `> ⚠ QUALITY REGRESSION: full reached a blocking verdict but quick did not — quick may miss issues full catches on this spec.\n\n`;
    } else if (maxFull >= 0 && maxQuick >= 0) {
      report += `> Verdict parity: quick did not under-call relative to full on this spec.\n\n`;
    }
  }
  if (sumFull > 0) {
    report += `## Aggregate cost (both tasks)\n\n| | full | quick | Δ |\n|---|---:|---:|---:|\n`;
    report += `| Mean cost/run | $${sumFull.toFixed(3)} | $${sumQuick.toFixed(3)} | ${Math.round(((sumQuick - sumFull) / sumFull) * 100)}% |\n\n`;
  }
  report += `## Methodology\n\n`;
  report += `- Each (task, tier) run N times; tier order interleaved per sample to balance the 5-min prompt-cache warming.\n`;
  report += `- Sandbox reset (\`git checkout\` + \`git clean\`) before every run.\n`;
  report += `- Session identified by \`session_id\` from \`--output-format json\` (exact, not mtime-matched).\n`;
  report += `- Totals include subagent JSONL (\`<session-id>/subagents/\`) — full dispatches 3 reviewers / 5 validate checks, quick dispatches 1 each.\n`;
  report += `- Quality: verdict parsed from each run's artifact (.review.md / .validation.md); \`--judge\` adds an LLM 0-100 output-quality score. "Verdict parity" means quick did not under-call vs full; a regression flag fires if full blocks and quick does not.\n`;
  report += `- Single-run noise remains; read the mean over n≥3, not any one run.\n`;
  return report;
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

  // Rigor-tier A/B (full vs quick) is a self-contained mode.
  if (tierAb) { await runTierAb(); return; }

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

// Only run the eval when executed directly (`node run-ab-eval.mjs ...`), not
// when imported (e.g. by a smoke test of the analysis functions).
const isDirect = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  main().catch(err => {
    console.error('Eval failed:', err.message);
    cleanupBaseline();
    process.exit(1);
  });
}

export { analyzeSession, generateTierReport, TIER_TASKS };
