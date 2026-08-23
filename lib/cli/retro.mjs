// lib/cli/retro.mjs
//
// `adev retro <subcommand>` — sub-dispatch for retro-related CLI verbs.
// Currently exposes one subcommand:
//
//   session-activity --since <YYYY-MM-DD> --until <YYYY-MM-DD>
//                    [--project-root <dir>] [--format json|text]
//
// Wraps lib/retro/session-activity.mjs::gatherSessionActivity() so that
// skills/retro/SKILL.md can invoke a single CLI verb instead of inline-Node.
//
// Contract (driver-substrate):
//   - Exports `run({ projectRoot, argv, manifest })` and `help()`.
//   - Stdout: single JSON object (--format json, default) OR rendered
//     markdown (--format text).
//   - Exit codes: 0 on success, 1 on argument/usage error.

import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { gatherSessionActivity } from '../retro/session-activity.mjs';
import { getIssueManager } from '../issues/registry.mjs';

const USAGE = 'usage: adev retro <session-activity> [flags]';

export function help() {
  console.log(USAGE);
  console.log('');
  console.log('Subcommands:');
  console.log('  session-activity   Gather session activity for an analysis window');
  console.log('');
  console.log('Flags (session-activity):');
  console.log('  --since <YYYY-MM-DD>   Start of analysis window (required)');
  console.log('  --until <YYYY-MM-DD>   End of analysis window (required)');
  console.log('  --project-root <dir>   Project root (default: cwd)');
  console.log('  --format json|text     Output format (default: json)');
}

export async function run({ projectRoot, argv, manifest }) {
  const sub = argv[0];
  if (sub === undefined || sub === '--help' || sub === '-h') {
    help();
    process.exit(sub === undefined ? 1 : 0);
  }

  if (sub === 'session-activity') {
    return await runSessionActivity({ projectRoot, argv: argv.slice(1), manifest });
  }

  console.error(USAGE);
  console.error(`  unknown subcommand: ${sub}`);
  process.exit(1);
}

async function runSessionActivity({ projectRoot, argv, manifest }) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        since: { type: 'string' },
        until: { type: 'string' },
        'project-root': { type: 'string' },
        format: { type: 'string', default: 'json' },
        help: { type: 'boolean', default: false },
      },
      allowPositionals: false,
    });
  } catch (err) {
    console.error(USAGE);
    if (err && err.message) console.error(`  ${err.message}`);
    process.exit(1);
  }

  const v = parsed.values;
  if (v.help) {
    help();
    process.exit(0);
  }
  if (!v.since) {
    console.error(USAGE);
    console.error('  retro session-activity requires --since');
    process.exit(1);
  }
  if (!v.until) {
    console.error(USAGE);
    console.error('  retro session-activity requires --until');
    process.exit(1);
  }
  if (v.format !== 'json' && v.format !== 'text') {
    console.error(USAGE);
    console.error(`  unknown --format: ${v.format} (expected json or text)`);
    process.exit(1);
  }

  const targetRoot = v['project-root']
    ? resolve(v['project-root'])
    : resolve(projectRoot);

  // Optional: best-effort issue manager wiring for cross-reference. If the
  // manifest is absent or the manager fails to initialize, the orchestrator
  // gracefully degrades (issueXrefs → null).
  let issueManager = null;
  if (manifest) {
    try {
      issueManager = getIssueManager(manifest);
    } catch {
      issueManager = null;
    }
  }

  let result;
  try {
    result = await gatherSessionActivity(
      targetRoot,
      { since: v.since, until: v.until },
      { issueManager }
    );
  } catch (err) {
    console.error(`retro session-activity failed: ${err && err.message ? err.message : err}`);
    process.exit(1);
  }

  if (v.format === 'json') {
    console.log(JSON.stringify(result));
    process.exit(0);
  }
  // text
  const rendered = renderMarkdown(result);
  if (rendered.length > 0) {
    console.log(rendered);
  }
  process.exit(0);
}

/**
 * Render the gatherSessionActivity result as a markdown section. Returns
 * the empty string when totalSessions is 0 (Graceful absence — section
 * omitted entirely).
 *
 * Section ordering per Behavior 13:
 *   (a) Total + format-breakdown line
 *   (b) Tool-Use Distribution
 *   (c) Per-Spec Session Counts
 *   (d) Cost & Token Trends (if applicable)
 *   (e) Sessions ↔ Closed Issues (if applicable)
 *   (f) Context Gaps
 *
 * @param {object} r
 * @returns {string}
 */
function renderMarkdown(r) {
  if (!r || r.totalSessions === 0) return '';

  const out = [];
  out.push('## Session Activity');
  out.push('');
  const bd = r.formatBreakdown;
  out.push(
    `Total: ${r.totalSessions} (hook: ${bd.hook}, post-commit: ${bd['post-commit']}, unknown: ${bd.unknown})`
  );
  out.push('');

  // (b) Tool-Use Distribution
  if (r.toolUseDistribution && r.toolUseDistribution.length > 0) {
    out.push('### Tool-Use Distribution');
    out.push('');
    out.push('| Tool | Count |');
    out.push('|---|---|');
    for (const row of r.toolUseDistribution) {
      out.push(`| ${row.tool} | ${row.count} |`);
    }
    out.push('');
  }

  // (c) Per-Spec Session Counts
  if (r.perSpecCounts && r.perSpecCounts.length > 0) {
    out.push('### Per-Spec Session Counts');
    out.push('');
    out.push('| Spec | Sessions |');
    out.push('|---|---|');
    for (const row of r.perSpecCounts) {
      out.push(`| ${row.spec} | ${row.count} |`);
    }
    out.push('');
  }

  // (d) Cost & Token Trends
  if (r.costTokens) {
    out.push('### Cost & Token Trends');
    out.push('');
    const t = r.costTokens.totals;
    out.push(`Total cost: $${t.cost_usd.toFixed(4)}`);
    out.push(`Total input tokens: ${t.input_tokens}`);
    out.push(`Total output tokens: ${t.output_tokens}`);
    out.push('');
    const models = Object.keys(r.costTokens.perModel);
    if (models.length > 0) {
      out.push('#### Per-Model');
      out.push('');
      out.push('| Model | Cost | Input | Output |');
      out.push('|---|---|---|---|');
      for (const m of models.sort()) {
        const b = r.costTokens.perModel[m];
        out.push(`| ${m} | $${b.cost_usd.toFixed(4)} | ${b.input_tokens} | ${b.output_tokens} |`);
      }
      out.push('');
    }
    const specs = Object.keys(r.costTokens.perSpec);
    if (specs.length > 0) {
      out.push('#### Per-Spec');
      out.push('');
      out.push('| Spec | Cost | Input | Output |');
      out.push('|---|---|---|---|');
      for (const s of specs.sort()) {
        const b = r.costTokens.perSpec[s];
        out.push(`| ${s} | $${b.cost_usd.toFixed(4)} | ${b.input_tokens} | ${b.output_tokens} |`);
      }
      out.push('');
    }
  }

  // (e) Sessions ↔ Closed Issues
  if (r.issueXrefs && r.issueXrefs.length > 0) {
    out.push('### Sessions ↔ Closed Issues');
    out.push('');
    out.push('| Issue | Title | Closed | Sessions |');
    out.push('|---|---|---|---|');
    for (const row of r.issueXrefs) {
      const sessions = row.sessionIds.join(', ');
      const closed = row.closedAt || '—';
      out.push(`| ${row.id} | ${row.title} | ${closed} | ${sessions} |`);
    }
    out.push('');
  }

  // (f) Context Gaps
  if (r.contextGaps && r.contextGaps.length > 0) {
    out.push('### Context Gaps');
    out.push('');
    out.push('| Spec | Gap | Count |');
    out.push('|---|---|---|');
    for (const row of r.contextGaps) {
      out.push(`| ${row.spec} | ${row.gap} | ${row.count} |`);
    }
    out.push('');
  }

  return out.join('\n');
}
