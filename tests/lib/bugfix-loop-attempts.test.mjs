// Spec: .context-index/specs/features/autonomous-bugfix-loop/per-issue-attempt-cap.spec.md
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readAttemptRecord, resolveAttemptsLogPath } from '../../lib/bugfix-loop-attempts.mjs';

test('readAttemptRecord returns null when no record exists for the issue (BEH-5)', () => {
  const root = mkdtempSync(join(tmpdir(), 'attempts-'));
  mkdirSync(join(root, '.context-index'), { recursive: true });
  assert.equal(readAttemptRecord(root, 'issue-1'), null);
  rmSync(root, { recursive: true, force: true });
});

test('readAttemptRecord fails open (treats as zero attempts) when the log file is corrupted', () => {
  const root = mkdtempSync(join(tmpdir(), 'attempts-'));
  const logPath = resolveAttemptsLogPath(root);
  mkdirSync(join(root, '.context-index', 'lifecycle-state'), { recursive: true });
  writeFileSync(logPath, 'not valid json\n{"issue_id":"issue-1"\n');
  assert.equal(readAttemptRecord(root, 'issue-1'), null);
  rmSync(root, { recursive: true, force: true });
});
