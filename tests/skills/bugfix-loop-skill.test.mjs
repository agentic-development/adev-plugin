// tests/skills/bugfix-loop-skill.test.mjs
//
// Spec: .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-skill.spec.md
// Plan-task: 8, 10, 11
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');
const TOKEN_GRAMMAR = /^ADEV-[A-Z]+: [A-Z_]+$/;

test('bugfix-loop SKILL.md declares --max-bugs, --max-turns, --github-sync, --resume, --resume-run-id', () => {
  const md = read('skills/bugfix-loop/SKILL.md');
  for (const flag of ['--max-bugs', '--max-turns', '--github-sync', '--resume', '--resume-run-id']) {
    assert.ok(md.includes(flag), `Arguments must document ${flag}`);
  }
});

test('bugfix-loop SKILL.md includes a Load Skill Extensions block (AC bullet 5)', () => {
  const md = read('skills/bugfix-loop/SKILL.md');
  assert.match(md, /adev skill-ext load --skill bugfix-loop/);
});

test('bugfix-loop SKILL.md emits ADEV-BUGFIXLOOP for all three terminal states, final line (AC bullet 6)', () => {
  const md = read('skills/bugfix-loop/SKILL.md');
  for (const tok of ['ADEV-BUGFIXLOOP: COMPLETE', 'ADEV-BUGFIXLOOP: BUDGET_EXHAUSTED', 'ADEV-BUGFIXLOOP: BLOCKED']) {
    assert.ok(TOKEN_GRAMMAR.test(tok));
    assert.ok(md.includes(tok), `must instruct emitting "${tok}"`);
  }
  assert.match(md, /(final line|last line)/i);
});

test('bugfix-loop SKILL.md self-re-invokes via the Skill tool between non-terminal turns', () => {
  const md = read('skills/bugfix-loop/SKILL.md');
  assert.match(md, /--resume --resume-run-id/);
  assert.match(md, /Skill tool/);
});

test('bugfix-loop SKILL.md reads the status guard before calling adev issues next (AC bullet 8)', () => {
  const md = read('skills/bugfix-loop/SKILL.md');
  const guardIdx = md.indexOf('bugfix-loop guard');
  const nextIdx = md.indexOf('issues next');
  assert.ok(guardIdx !== -1 && nextIdx !== -1 && guardIdx < nextIdx, 'guard must be called before issues next');
});

test('bugfix-loop SKILL.md bounds claim-failure retries to 3 within a turn (AC bullet 14)', () => {
  const md = read('skills/bugfix-loop/SKILL.md');
  assert.match(md, /\b3\b[\s\S]{0,80}retr|retr[\s\S]{0,80}\b3\b/i);
});

test('bugfix-loop SKILL.md wires --github-sync to adev tracker-sync inbound/outbound (no longer fails fast)', () => {
  const md = read('skills/bugfix-loop/SKILL.md');
  assert.match(md, /adev tracker-sync inbound/);
  assert.match(md, /adev tracker-sync outbound/);
  assert.doesNotMatch(md, /GitHub sync not available/);
});

test('bugfix-loop SKILL.md calls tracker-sync inbound before Step 2 bug selection', () => {
  const md = read('skills/bugfix-loop/SKILL.md');
  const inboundIdx = md.indexOf('tracker-sync inbound');
  const step2Idx = md.indexOf('## Step 2: Select a bug');
  assert.ok(inboundIdx !== -1 && step2Idx !== -1 && inboundIdx < step2Idx, 'inbound sync must run before Step 2');
});

test('bugfix-loop SKILL.md calls tracker-sync outbound after the Step 4 attempt completes', () => {
  const md = read('skills/bugfix-loop/SKILL.md');
  const step4Idx = md.indexOf('## Step 4: Attempt via /adev:debug --auto');
  const outboundIdx = md.indexOf('tracker-sync outbound');
  const step5Idx = md.indexOf('## Step 5: Finish');
  assert.ok(step4Idx !== -1 && outboundIdx !== -1 && step5Idx !== -1);
  assert.ok(step4Idx < outboundIdx && outboundIdx < step5Idx, 'outbound writeback must run within Step 4, before Step 5');
});

test('bugfix-loop SKILL.md Step 0/1 calls adev bugfix-loop check-freshness before the status/budget guard (Plan-task 3)', () => {
  const md = read('skills/bugfix-loop/SKILL.md');
  assert.match(md, /adev bugfix-loop check-freshness/);
  const freshnessIdx = md.indexOf('adev bugfix-loop check-freshness');
  const guardIdx = md.indexOf('adev bugfix-loop guard');
  assert.ok(freshnessIdx !== -1 && guardIdx !== -1 && freshnessIdx < guardIdx, 'check-freshness must be called before the guard');
});

test('bugfix-loop SKILL.md documents BRANCH_STALE_BLOCKED halting before bug selection (Plan-task 3)', () => {
  const md = read('skills/bugfix-loop/SKILL.md');
  assert.match(md, /BRANCH_STALE_BLOCKED/);
  assert.match(md, /FRESHNESS_CHECK_DEGRADED/);
});

test('using-adev gateway table lists /adev:bugfix-loop', () => {
  const md = read('skills/using-adev/SKILL.md');
  assert.match(md, /\/adev:bugfix-loop/);
});

test('using-adev persona overlay names ADEV-BUGFIXLOOP as persona-exempt', () => {
  const md = read('skills/using-adev/SKILL.md');
  assert.match(md, /ADEV-BUGFIXLOOP/);
});

test('work SKILL.md routing table lists /adev:bugfix-loop', () => {
  const md = read('skills/work/SKILL.md');
  assert.match(md, /\/adev:bugfix-loop/);
});
