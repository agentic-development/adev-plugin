/**
 * `adev tracker-sync <inbound|outbound>` — CLI surface for
 * `lib/tracker-provider-bridge/{inbound-sync,outbound-writeback}.mjs`.
 *
 * Mirrors `adev bugfix-loop`'s shape so `skills/bugfix-loop/SKILL.md` can
 * call this verb directly instead of embedding inline Node (`cli-driver-surface`
 * charter).
 *
 * Subcommands: inbound | outbound
 *
 * Spec: .context-index/specs/features/autonomous-bugfix-loop/tracker-provider-bridge.spec.md
 * Plan-task: 9
 *
 * Contract:
 *   - `run({ projectRoot, argv, manifest })` returns a numeric exit code.
 *
 * Uses only Node.js built-ins.
 */

import { parseArgs } from 'node:util';
import { runInboundSync } from '../tracker-provider-bridge/inbound-sync.mjs';
import { runOutboundWriteback } from '../tracker-provider-bridge/outbound-writeback.mjs';

const USAGE = 'usage: adev tracker-sync <inbound|outbound> [flags]';

export async function run({ projectRoot, argv, manifest }) {
  const [sub, ...rest] = argv;
  if (!sub) {
    console.error(USAGE);
    return 1;
  }

  if (sub === 'inbound') {
    let parsed;
    try {
      parsed = parseArgs({ args: rest, options: { 'run-id': { type: 'string' }, json: { type: 'boolean' } } });
    } catch (err) {
      console.error(USAGE);
      console.error(err.message);
      return 1;
    }
    const { values } = parsed;
    if (!values['run-id']) {
      console.error(USAGE);
      console.error('inbound requires --run-id <id>');
      return 1;
    }
    let result;
    try {
      result = await runInboundSync({ projectRoot, manifest, runId: values['run-id'] });
    } catch (err) {
      console.error(err.message);
      return 1;
    }
    console.log(values.json ? JSON.stringify(result) : `linked=${result.linked} degraded=${result.degraded}`);
    return 0;
  }

  if (sub === 'outbound') {
    let parsed;
    try {
      parsed = parseArgs({
        args: rest,
        options: {
          'local-issue-id': { type: 'string' },
          verdict: { type: 'string' },
          'completed-at': { type: 'string' },
          json: { type: 'boolean' },
        },
      });
    } catch (err) {
      console.error(USAGE);
      console.error(err.message);
      return 1;
    }
    const { values } = parsed;
    if (!values['local-issue-id'] || !values.verdict || !values['completed-at']) {
      console.error(USAGE);
      console.error('outbound requires --local-issue-id <id> --verdict <FIXED|PARKED|UNREPRODUCIBLE> --completed-at <iso-ts>');
      return 1;
    }
    let result;
    try {
      result = await runOutboundWriteback({
        projectRoot,
        manifest,
        localIssueId: values['local-issue-id'],
        verdict: values.verdict,
        completedAt: values['completed-at'],
      });
    } catch (err) {
      console.error(err.message);
      return 1;
    }
    console.log(values.json ? JSON.stringify(result) : `posted=${result.posted}${result.reason ? ` reason=${result.reason}` : ''}`);
    return 0;
  }

  console.error(USAGE);
  console.error(`  unknown subcommand: ${sub}`);
  return 1;
}

export function help() {
  console.log(USAGE);
  console.log('');
  console.log('Subcommands:');
  console.log('  inbound --run-id <id> [--json]');
  console.log('    Run one turn of inbound sync (Interaction Contract inbound steps 1-5).');
  console.log('');
  console.log('  outbound --local-issue-id <id> --verdict <FIXED|PARKED|UNREPRODUCIBLE> --completed-at <iso-ts> [--json]');
  console.log('    Post the outcome comment for a completed attempt (Interaction Contract outbound steps 1-4).');
}

export default { run, help };
