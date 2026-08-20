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

test('bugfix-loop SKILL.md fails fast on --github-sync when the bridge is unavailable (AC bullet 11)', () => {
  const md = read('skills/bugfix-loop/SKILL.md');
  assert.match(md, /--github-sync[\s\S]{0,600}(not available|not yet implemented|fail fast)/i);
});
