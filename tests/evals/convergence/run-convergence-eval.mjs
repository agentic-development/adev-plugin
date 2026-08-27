#!/usr/bin/env node

/**
 * Review-Block Auto-Retry Convergence Eval
 *
 * Drives the REAL `/adev:build --full --auto` loop — real reviewer
 * dispatch, real `/adev:specify --revise` — against a deliberately broken
 * fixture spec, and measures whether the loop actually converges, and how
 * expensively. No mocked reviewer output, no synthetic blocker sequences:
 * every cycle is a live claude session.
 *
 * Ground truth comes from two places, never from parsing chat prose:
 *   - the fixture's own lifecycle event log
 *     (tests/evals/integration-sandbox/.context-index/lifecycle-state/
 *      broken-loop-fixture.jsonl) for cycle count, reviewer-dispatch count,
 *      and terminal verdict
 *   - the real session JSONL (via analyzeSession, reused from
 *     ../token-optimization/run-ab-eval.mjs) for tokens/cost/duration
 *
 * Two modes:
 *   - Single-arm (no --baseline-ref): N trials against the current branch.
 *     Useful right now, before review-block-auto-retry-rev-2's authoring
 *     step lands, as a smoke run and a source of pre-amendment numbers.
 *   - A/B (--baseline-ref <ref>): N trials per arm, comparing a pre-fix
 *     ref against the current branch — the real comparison this eval
 *     exists for, once the amendment is implemented.
 *
 * Usage:
 *   node tests/evals/convergence/run-convergence-eval.mjs [options]
 *
 *   --samples <n>         Trials per arm (default 2 — each trial is a full
 *                          multi-cycle build, not a single skill call; this
 *                          is expensive, keep n small unless you mean it)
 *   --fixture <name>       Which fixture to drive: `broken` (default — four
 *                          planted defect classes, measures recovery cost)
 *                          or `clean` (no planted defects, measures cost of
 *                          a review that should reach PASS on or near the
 *                          first round — the complementary control).
 *   --baseline-ref <ref>   Git ref/commit to check out as the baseline arm.
 *                          Omit to run single-arm against the current branch.
 *   --tier <full|quick>    Rigor tier passed to /adev:build --tier (default: full)
 *   --timeout-ms <n>       Per-session timeout (default: 1_200_000 = 20 min —
 *                          a multi-cycle build can run long)
 *   --dry-run              Print the plan (arms, trial count, commands) and exit
 *
 * Requirements:
 *   - `claude` CLI v2+ installed and authenticated
 *   - tests/evals/integration-sandbox/.context-index/governance/review.yaml
 *     materialized to match the project's real reviewer set (already done —
 *     copied from the main repo's .context-index/governance/review.yaml so
 *     this eval exercises the actual dispatched reviewers, not bundled
 *     domain defaults)
 *
 * Output:
 *   tests/evals/convergence/results/convergence-eval-<date>-<fixture>.md
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

import { analyzeSession } from '../token-optimization/run-ab-eval.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const SANDBOX = join(REPO_ROOT, 'tests', 'evals', 'integration-sandbox');
const RESULTS_DIR = join(__dirname, 'results');
const WORKTREE_DIR = join(REPO_ROOT, '.eval-worktree-convergence-baseline');

// ─── Fixture selection (--fixture clean|broken, default broken) ───────────
//
// `broken` plants four defect classes (defect/mechanism-existence/decision/
// external) to measure recovery cost. `clean` is the opposite control — no
// planted defects, every citation resolves, nothing depends on an artifact
// outside the fixture — to measure the loop's cost on the case where review
// should reach PASS on (or near) the first round, uncontaminated by
// recovery cost. Comparing the two isolates "cost of a real fix" from
// "baseline cost of a clean pass."
const FIXTURES = {
  broken: {
    specRel: '.context-index/specs/cross-cutting/broken-loop-fixture.spec.md',
    slug: 'broken-loop-fixture',
    libRel: 'lib/loop-fixture/rate-limiter.mjs',
  },
  clean: {
    specRel: '.context-index/specs/cross-cutting/clean-loop-fixture.spec.md',
    slug: 'clean-loop-fixture',
    libRel: 'lib/loop-fixture/idempotency-cache.mjs',
  },
};

const fixtureArgIdx = process.argv.indexOf('--fixture');
const fixtureName = fixtureArgIdx >= 0 ? process.argv[fixtureArgIdx + 1] : 'broken';
if (!Object.prototype.hasOwnProperty.call(FIXTURES, fixtureName)) {
  console.error(`Unknown --fixture '${fixtureName}' — expected one of: ${Object.keys(FIXTURES).join(', ')}`);
  process.exit(1);
}
const FIXTURE_SPEC_REL = FIXTURES[fixtureName].specRel;
const FIXTURE_SLUG = FIXTURES[fixtureName].slug;
const FIXTURE_LIB_REL = FIXTURES[fixtureName].libRel;
const FIXTURE_PATHS_TO_RESET = [
  FIXTURE_SPEC_REL,
  FIXTURE_SPEC_REL.replace(/\.spec\.md$/, '.review.md'),
  FIXTURE_SPEC_REL.replace(/\.spec\.md$/, '.blockers.md'),
  FIXTURE_LIB_REL,
  `.context-index/lifecycle-state/${FIXTURE_SLUG}.jsonl`,
  // /adev:build's own build-state snapshot — separate from the event log
  // above (`<slug>.json`, not `.jsonl`). Found missing from this list via a
  // real run: it survived a full reset cycle and would have made the next
  // trial's build skill see stale prior progress instead of a clean start.
  `.context-index/lifecycle-state/${FIXTURE_SLUG}.json`,
];

// Session JSONL location is derived from the CWD used when running claude —
// Claude hashes the absolute project path to build the session directory
// name by replacing every non-alphanumeric character with a dash, not just
// slashes. A slash-only replacement silently mismatches on any checkout
// path containing another special character (this repo's own worktree path
// contains a literal `.claude` segment, whose dot collapses into an extra
// dash the naive replacement misses) — verified against the real directory
// Claude Code creates for this exact checkout, not assumed. Computed, not
// hardcoded, so this runs on any machine's checkout.
const SANDBOX_PROJECT_KEY = SANDBOX.replace(/[^a-zA-Z0-9]/g, '-');
const SESSIONS_DIR = join(homedir(), '.claude', 'projects', SANDBOX_PROJECT_KEY);

// ─── CLI args ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const samples = Math.max(1, parseInt(flag('--samples', '2'), 10) || 2);
const baselineRef = flag('--baseline-ref', null);
const tier = flag('--tier', 'full');
const timeoutMs = Math.max(60_000, parseInt(flag('--timeout-ms', '1200000'), 10) || 1_200_000);
const dryRun = args.includes('--dry-run');

// ─── `adev` CLI invocation (bypassing the shell-function-only `adev` alias) ─
//
// `adev` on this machine (and any dev checkout following the same install
// pattern) is a zsh FUNCTION wrapping `node <cache>/cli/index.mjs`, defined
// in shell rc — not a binary on PATH. execSync spawns via `/bin/sh -c`,
// which never sources rc files and has no such function, so a bare `adev`
// call fails with "command not found". Invoke the arm's own
// `cli/index.mjs` directly instead, exactly mirroring what the function
// does (`ADEV_ROOT=<root> node <root>/cli/index.mjs <args>`) — and, unlike
// the cached global `adev`, this also keeps the CLI version consistent
// with whichever arm (baseline worktree vs. treatment) is under test.

function runAdev(pluginDir, cwd, cliArgs) {
  execSync(
    `node "${join(pluginDir, 'cli', 'index.mjs')}" ${cliArgs}`,
    { cwd, env: { ...process.env, ADEV_ROOT: pluginDir }, stdio: 'pipe' },
  );
}

// ─── Fixture reset (scoped — never touches the rest of the sandbox) ────────

function resetFixture(pluginDir) {
  for (const rel of FIXTURE_PATHS_TO_RESET) {
    const abs = join(SANDBOX, rel);
    if (!existsSync(abs)) continue;
    // The lib file and the spec are git-tracked — restore from git. The
    // sidecars and the lifecycle log are run-generated — just delete them.
    if (rel === FIXTURE_SPEC_REL || rel === FIXTURE_LIB_REL) {
      try {
        execSync(`git checkout -- "${join('tests/evals/integration-sandbox', rel)}"`, { cwd: REPO_ROOT, stdio: 'pipe' });
      } catch { /* best effort */ }
    } else {
      try { rmSync(abs, { force: true }); } catch { /* best effort */ }
    }
  }
  // The build skill's cross-run state file — stale entries here can make a
  // fresh trial read as "resume" instead of a clean run.
  const execState = join(SANDBOX, '.context-index', '.execution-state.json');
  try { rmSync(execState, { force: true }); } catch { /* best effort */ }

  // The fixture is hand-authored, not produced by /adev:specify, so it has
  // no `specify: completed` lifecycle event — and the lifecycle log was
  // just deleted above regardless. review-specs' Step 0 gate hard-blocks
  // (strict mode) without one: "step 'review' requires prior step 'specify'
  // to be completed with PASS or PASS_WITH_NOTES". Seed it before every
  // trial, mirroring exactly what /adev:specify's own Step 0 / Summary emit.
  try {
    runAdev(pluginDir, SANDBOX, `report --type step --spec "${FIXTURE_SPEC_REL}" --step specify --status started`);
    runAdev(pluginDir, SANDBOX, `report --type step --spec "${FIXTURE_SPEC_REL}" --step specify --status completed --verdict PASS`);
  } catch (err) {
    console.error('  Failed to seed specify lifecycle event — review-specs will gate-block:', err.message);
  }
}

// ─── Ground truth: read the fixture's own lifecycle event log ─────────────

function readLifecycleEvents() {
  const p = join(SANDBOX, '.context-index', 'lifecycle-state', `${FIXTURE_SLUG}.jsonl`);
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((line) => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);
}

// Terminal verdicts this eval recognizes on the `review` step, forward-
// compatible with the amendment's new verdicts (NOT_CONVERGING,
// DECISION_REQUIRED, EXTERNAL_REMEDY) even before they're implemented —
// an unamended run simply never emits them, and the field reads as null.
// `BLOCK` is the unamended (pre-this-spec) loop's own terminal verdict: the
// base spec's sidecar+fail-loud path on the first BLOCK never rewrites the
// step_completed event to one of the loop-convergence verdicts below, so a
// baseline-arm trial's true terminal state IS a plain `BLOCK` — omitting it
// here left every baseline trial's terminalVerdict silently null.
const TERMINAL_VERDICTS = [
  'PASS', 'PASS_WITH_NOTES', 'PASS_PENDING_HUMAN',
  'NO_PROGRESS', 'REGRESSED', 'BUDGET_EXHAUSTED',
  'NOT_CONVERGING', 'DECISION_REQUIRED', 'EXTERNAL_REMEDY', 'BLOCK',
];

function summarizeTrial(events) {
  const reviewerDispatches = events.filter((e) => e.event === 'reviewer_report').length;
  const cycles = events.filter((e) => e.event === 'spec_revised').length;
  // `adev report --type step` discriminates by --status: started -> lifecycle_step,
  // completed -> step_completed, failed -> step_failed. Only step_completed
  // carries a verdict; lifecycle_step is entry-only and never has one.
  const stepCompletions = events.filter((e) => e.event === 'step_completed' && e.step === 'review');
  let terminalVerdict = null;
  for (const e of stepCompletions) {
    if (e.verdict && TERMINAL_VERDICTS.includes(e.verdict)) terminalVerdict = e.verdict;
  }
  // finding_class routing (only present once the amendment lands — reads
  // as 0/0 on an unamended run, which is itself a meaningful data point).
  const decisionHalts = events.filter((e) => e.event === 'step_completed' && e.verdict === 'DECISION_REQUIRED').length;
  const externalRemedies = events.filter((e) => e.event === 'external_remedy').length;
  return { reviewerDispatches, cycles, terminalVerdict, decisionHalts, externalRemedies, rawEventCount: events.length };
}

// ─── Session-file flush wait ────────────────────────────────────────────────
//
// Reading the session JSONL immediately after `execSync` returns can race
// the session writer's final flush — analyzeSession returns null (or a
// near-empty stats object) on a file read a beat too early, even though the
// exact same read succeeds moments later. Poll briefly rather than trusting
// process-exit as a completeness signal.

function waitForSessionStats(sessionPath, timeoutMs = 5000, pollMs = 250) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    if (existsSync(sessionPath)) {
      const stats = analyzeSession(sessionPath);
      if (stats && stats.totalTurns > 0) return stats;
      last = stats;
    }
    try { execSync(`sleep ${pollMs / 1000}`); } catch { /* ignore */ }
  }
  return last;
}

// ─── Spawn one real claude session ─────────────────────────────────────────

function runBuildSession(pluginDir, label) {
  const prompt = `/adev:build --full --auto --tier ${tier} --spec ${FIXTURE_SPEC_REL}`;
  console.log(`  [${label}] ${prompt}`);
  const startTime = Date.now();
  try {
    const out = execSync(
      `claude --print --output-format json --dangerously-skip-permissions --plugin-dir "${pluginDir}" -p "${prompt}"`,
      { cwd: SANDBOX, encoding: 'utf-8', timeout: timeoutMs, env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: 'cli' }, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    const durationMs = Date.now() - startTime;
    let sessionId = null;
    try { sessionId = JSON.parse(out).session_id || null; } catch { /* non-JSON */ }
    console.log(`  [${label}] done in ${(durationMs / 1000).toFixed(0)}s  session=${sessionId?.slice(0, 8) || '?'}`);
    return { success: true, sessionId, durationMs };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    console.log(`  [${label}] FAILED after ${(durationMs / 1000).toFixed(0)}s: ${err.message?.slice(0, 200)}`);
    return { success: false, sessionId: null, durationMs, error: err.message?.slice(0, 200) };
  }
}

// ─── Worktree management for the baseline arm ──────────────────────────────

function setupBaselineWorktree(ref) {
  if (existsSync(WORKTREE_DIR)) {
    try { execSync(`git worktree remove --force "${WORKTREE_DIR}"`, { cwd: REPO_ROOT, stdio: 'pipe' }); } catch { /* best effort */ }
  }
  execSync(`git worktree add "${WORKTREE_DIR}" "${ref}"`, { cwd: REPO_ROOT, stdio: 'pipe' });
}

function cleanupBaselineWorktree() {
  if (existsSync(WORKTREE_DIR)) {
    try { execSync(`git worktree remove --force "${WORKTREE_DIR}"`, { cwd: REPO_ROOT, stdio: 'pipe' }); } catch { /* best effort */ }
  }
}

// ─── One arm, N trials ──────────────────────────────────────────────────────

function runArm(pluginDir, armLabel, n) {
  const trials = [];
  for (let i = 0; i < n; i++) {
    resetFixture(pluginDir);
    const run = runBuildSession(pluginDir, `${armLabel}#${i + 1}`);
    if (!run.success || !run.sessionId) {
      trials.push({ ok: false, error: run.error, durationMs: run.durationMs });
      continue;
    }
    const events = readLifecycleEvents();
    const summary = summarizeTrial(events);
    const sessionPath = join(SESSIONS_DIR, `${run.sessionId}.jsonl`);
    const stats = waitForSessionStats(sessionPath);
    trials.push({
      ok: true,
      ...summary,
      durationMs: run.durationMs,
      cost: stats?.costInclSub ?? null,
      totalTokens: stats?.totalTokensInclSub ?? null,
      subagentCount: stats?.subagentCount ?? null,
    });
    console.log(`    cycles=${summary.cycles} reviewerDispatches=${summary.reviewerDispatches} verdict=${summary.terminalVerdict} cost=$${(stats?.costInclSub ?? 0).toFixed(3)}`);
  }
  resetFixture(pluginDir);
  return trials;
}

// ─── Stats helpers ──────────────────────────────────────────────────────────

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return null;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function spread(xs) {
  if (xs.length < 2) return 0;
  return Math.max(...xs) - Math.min(...xs);
}
function field(trials, key) {
  return trials.filter((t) => t.ok && typeof t[key] === 'number').map((t) => t[key]);
}

// ─── Report ─────────────────────────────────────────────────────────────────

function armSummary(trials) {
  const ok = trials.filter((t) => t.ok);
  return {
    n: trials.length,
    okN: ok.length,
    cycles: { median: median(field(trials, 'cycles')), spread: spread(field(trials, 'cycles')) },
    reviewerDispatches: { median: median(field(trials, 'reviewerDispatches')), spread: spread(field(trials, 'reviewerDispatches')) },
    cost: { median: median(field(trials, 'cost')), spread: spread(field(trials, 'cost')) },
    totalTokens: { median: median(field(trials, 'totalTokens')), spread: spread(field(trials, 'totalTokens')) },
    durationMs: { median: median(field(trials, 'durationMs')), spread: spread(field(trials, 'durationMs')) },
    verdicts: ok.map((t) => t.terminalVerdict || 'UNKNOWN'),
    decisionHalts: ok.reduce((s, t) => s + (t.decisionHalts || 0), 0),
    externalRemedies: ok.reduce((s, t) => s + (t.externalRemedies || 0), 0),
    failures: trials.length - ok.length,
  };
}

function fmtNum(v, digits = 1) { return v === null || v === undefined ? 'n/a' : v.toFixed(digits); }

function generateReport({ single, baseline, treatment }) {
  let report = `# Review-Block Auto-Retry Convergence Eval\n\n`;
  report += `**Date:** ${new Date().toISOString().split('T')[0]}\n`;
  report += `**Fixture:** tests/evals/integration-sandbox/${FIXTURE_SPEC_REL}\n`;
  report += `**Spec under test:** review-block-auto-retry.spec.md (base) / review-block-auto-retry-rev-2-targeted-author-verify-loop.spec.md (amendment)\n`;
  report += `**Tier:** ${tier}  **Samples/arm:** ${samples}\n\n`;
  report += `Real \`/adev:build --full --auto\` sessions — real reviewer dispatch (referent-integrity, wiring-reviewer, consistency-analyzer, boundary-reviewer, termination-reviewer, matching the project's actual materialized registry), real \`/adev:specify --revise\`. No mocked output. Ground truth from the fixture's own lifecycle event log, not chat-prose parsing.\n\n`;

  const row = (label, s) => (
    `| ${label} | ${fmtNum(s.cycles.median, 1)} (±${fmtNum(s.cycles.spread, 1)}) ` +
    `| ${fmtNum(s.reviewerDispatches.median, 1)} (±${fmtNum(s.reviewerDispatches.spread, 1)}) ` +
    `| $${fmtNum(s.cost.median, 3)} (±$${fmtNum(s.cost.spread, 3)}) ` +
    `| ${Math.round(s.totalTokens.median || 0).toLocaleString()} ` +
    `| ${s.decisionHalts} | ${s.externalRemedies} | ${s.failures}/${s.n} |\n`
  );
  const header = `| Arm | Cycles | Reviewer dispatches | Cost | Tokens (median) | DECISION_REQUIRED halts | EXTERNAL_REMEDY exits | Failed trials |\n|---|---:|---:|---:|---:|---:|---:|---:|\n`;

  if (single) {
    report += `## Single-arm (current branch)\n\n${header}${row('current', single)}\n`;
    report += `Verdicts observed: ${single.verdicts.join(', ') || 'none'}\n\n`;
    report += `> Single-arm run — no \`--baseline-ref\` was given. This is a smoke run / pre-amendment baseline capture, not an A/B comparison. Re-run with \`--baseline-ref <pre-implementation-commit>\` once review-block-auto-retry-rev-2's authoring step (BEH-4 through BEH-11) is implemented, to get the real before/after.\n\n`;
  } else {
    report += `## Baseline (\`${baselineRef}\`) vs Treatment (current branch)\n\n${header}${row('baseline', baseline)}${row('treatment', treatment)}\n`;
    report += `Baseline verdicts: ${baseline.verdicts.join(', ') || 'none'}\n`;
    report += `Treatment verdicts: ${treatment.verdicts.join(', ') || 'none'}\n\n`;
    const cyclesDelta = baseline.cycles.median && treatment.cycles.median !== null
      ? Math.round(((treatment.cycles.median - baseline.cycles.median) / baseline.cycles.median) * 100) : null;
    const costDelta = baseline.cost.median && treatment.cost.median !== null
      ? Math.round(((treatment.cost.median - baseline.cost.median) / baseline.cost.median) * 100) : null;
    report += `**Cycles Δ:** ${cyclesDelta === null ? 'n/a' : `${cyclesDelta}%`}  **Cost Δ:** ${costDelta === null ? 'n/a' : `${costDelta}%`}\n\n`;
    if (treatment.verdicts.some((v) => v === 'PASS' || v === 'PASS_WITH_NOTES') && !baseline.verdicts.some((v) => v === 'PASS' || v === 'PASS_WITH_NOTES')) {
      report += `> Treatment converged to PASS on at least one trial where baseline did not — the amendment's authoring step is doing real work, not just bookkeeping.\n\n`;
    }
  }

  report += `## Methodology\n\n`;
  report += `- Fixture reset (\`git checkout\` + lifecycle-log delete, scoped to the fixture only) before every trial.\n`;
  report += `- Cycle count and reviewer-dispatch count come from the fixture's own \`.context-index/lifecycle-state/${FIXTURE_SLUG}.jsonl\` (\`spec_revised\` and \`reviewer_report\` event counts) — never inferred from session transcript text.\n`;
  report += `- Cost/tokens from the real session JSONL (\`analyzeSession\`, includes subagent rollup — every dispatched reviewer and authoring subagent).\n`;
  report += `- \`DECISION_REQUIRED\`/\`EXTERNAL_REMEDY\` columns read 0 on an unamended build — that is expected, not a failure, until BEH-2/BEH-3 land.\n`;
  report += `- Single-run noise is real: read the median over n≥2, not any one trial. The fixture plants four defect classes (a genuine textual contradiction, a mechanism-existence gap, an unresolved design decision, and an externally-owned fix) — which class(es) a given trial's reviewers actually flag is itself non-deterministic and part of what this eval observes.\n`;
  return report;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  mkdirSync(RESULTS_DIR, { recursive: true });

  if (dryRun) {
    console.log('Dry run — plan:');
    console.log(`  Mode: ${baselineRef ? `A/B (baseline=${baselineRef})` : 'single-arm (current branch)'}`);
    console.log(`  Samples/arm: ${samples}`);
    console.log(`  Tier: ${tier}`);
    console.log(`  Fixture: ${FIXTURE_SPEC_REL}`);
    console.log(`  Command per trial: claude --print --output-format json --dangerously-skip-permissions --plugin-dir <arm> -p "/adev:build --full --auto --tier ${tier} --spec ${FIXTURE_SPEC_REL}"`);
    console.log(`  Timeout/session: ${timeoutMs}ms`);
    return;
  }

  let single = null, baseline = null, treatment = null;
  try {
    if (baselineRef) {
      console.log(`═══ Convergence Eval — A/B (baseline=${baselineRef}) ═══\n`);
      setupBaselineWorktree(baselineRef);
      console.log(`━━━ baseline (${baselineRef}) ━━━`);
      const baseTrials = runArm(WORKTREE_DIR, 'baseline', samples);
      console.log(`━━━ treatment (current branch) ━━━`);
      const treatTrials = runArm(REPO_ROOT, 'treatment', samples);
      baseline = armSummary(baseTrials);
      treatment = armSummary(treatTrials);
    } else {
      console.log('═══ Convergence Eval — single-arm (current branch) ═══\n');
      const trials = runArm(REPO_ROOT, 'current', samples);
      single = armSummary(trials);
    }
  } finally {
    if (baselineRef) cleanupBaselineWorktree();
  }

  const report = generateReport({ single, baseline, treatment });
  const dateStamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
  const reportPath = join(RESULTS_DIR, `convergence-eval-${dateStamp}-${fixtureName}.md`);
  writeFileSync(reportPath, report);
  console.log('\n' + report);
  console.log(`Report saved: ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
