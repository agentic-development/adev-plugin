// tests/adrs/0015-decision-table.test.mjs
//
// Spec: .context-index/specs/features/autonomous-bugfix-loop/per-issue-attempt-cap.spec.md
// Plan-task: 6
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const ADR_PATH = '.context-index/adrs/0015-lifecycle-state-dual-format-coexistence.md';

test('ADR-0015 Decision table registers bugfix-loop-attempts.jsonl (WR-7)', () => {
  const md = readFileSync(ADR_PATH, 'utf8');
  assert.match(md, /bugfix-loop-attempts\.jsonl/);
  assert.match(md, /lib\/bugfix-loop-attempts\.mjs/);
  assert.match(md, /per-issue-attempt-cap\.spec\.md/);
});

test('ADR-0015 Decision table registers bugfix-loop-runs-<run_id>.json', () => {
  const md = readFileSync(ADR_PATH, 'utf8');
  assert.match(md, /bugfix-loop-runs-<run_id>\.json/);
  assert.match(md, /lib\/bugfix-loop-run\.mjs/);
  assert.match(md, /bugfix-loop-skill\.spec\.md/);
});
