/**
 * Child process used by the crash-safety harness.
 *
 * Writes a partial line to the lifecycle log directly using a byte-by-byte
 * write loop so the parent can SIGKILL mid-write to simulate a crash.
 *
 * Production code never does this — `appendEvent` uses a single
 * `appendFileSync` call. This fixture exists solely to manufacture a
 * truncated tail for `readEvents` to recover from.
 *
 * Reads CLI args: <logPath>
 * Writes one byte every 5 ms until killed.
 */

import { openSync, writeSync, closeSync } from 'node:fs';

const [, , logPath] = process.argv;

if (!logPath) {
  process.stderr.write('usage: crash-writer.mjs <logPath>\n');
  process.exit(2);
}

const fd = openSync(logPath, 'a');
// Construct a giant fake-event payload — never terminated by a newline
// because the parent will kill us partway through.
const payload = '{"event":"lifecycle_step","step":"crash","filler":"' + 'x'.repeat(100_000) + '"}';

let i = 0;

function tick() {
  if (i >= payload.length) {
    closeSync(fd);
    process.exit(0);
  }
  writeSync(fd, payload[i]);
  i += 1;
  setTimeout(tick, 5);
}

// Signal readiness once we have opened the fd.
process.stdout.write('READY\n');
tick();

// Idle-loop-safe: do not let Node exit while the timer is pending.
