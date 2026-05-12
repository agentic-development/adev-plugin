/**
 * Child process used by the concurrent-write harness.
 *
 * Reads CLI args: <projectRoot> <specPath> <index>
 * Calls appendEvent once with a unique payload and exits 0.
 */

import { appendEvent } from '../../../lib/lifecycle-state.mjs';

const [, , projectRoot, specPath, indexStr] = process.argv;

if (!projectRoot || !specPath || indexStr === undefined) {
  process.stderr.write('usage: concurrent-writer.mjs <projectRoot> <specPath> <index>\n');
  process.exit(2);
}

const index = Number(indexStr);

try {
  // Payload kept small (well under PIPE_BUF ~4 KB) so O_APPEND atomicity holds.
  appendEvent(projectRoot, specPath, {
    event: 'lifecycle_step',
    step: `concurrent-${index}`,
    status: 'started',
    writer_pid: process.pid,
    writer_index: index,
  });
  process.exit(0);
} catch (err) {
  process.stderr.write(`appendEvent failed for index ${index}: ${err?.message ?? err}\n`);
  process.exit(1);
}
