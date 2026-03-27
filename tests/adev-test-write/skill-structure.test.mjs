import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SKILL_PATH = 'skills/adev-test-write/SKILL.md';

function readSkill() {
  return readFileSync(SKILL_PATH, 'utf-8');
}

test('SKILL.md file exists and is non-empty', () => {
  const content = readSkill();
  assert.ok(content.length > 500, 'SKILL.md should be substantial');
});

test('SKILL.md documents --red invocation mode', () => {
  assert.ok(readSkill().includes('--red'));
});

test('SKILL.md documents --verify invocation mode', () => {
  assert.ok(readSkill().includes('--verify'));
});

test('SKILL.md documents --spec, --file, and free-form description modes', () => {
  const content = readSkill();
  assert.ok(content.includes('--spec'));
  assert.ok(content.includes('--file'));
});

test('SKILL.md documents pre-existing failure protocol (git stash --include-untracked)', () => {
  assert.ok(readSkill().includes('git stash --include-untracked'));
});

test('SKILL.md documents lockfile creation (.test-write.lock)', () => {
  assert.ok(readSkill().includes('.test-write.lock'));
});

test('SKILL.md documents mocking boundary types', () => {
  const content = readSkill();
  assert.ok(content.includes('HTTP'));
  assert.ok(content.includes('external-api'));
  assert.ok(content.includes('MOCK_VIOLATION'));
});

test('SKILL.md documents all 5 tamper classifications', () => {
  const content = readSkill();
  assert.ok(content.includes('REMOVED'));
  assert.ok(content.includes('LOOSENED'));
  assert.ok(content.includes('HARDCODED_TO_PASS'));
  assert.ok(content.includes('SKIPPED'));
  assert.ok(content.includes('CONDITIONAL'));
});

test('SKILL.md documents model tier resolution — no hardcoded model IDs', () => {
  const content = readSkill();
  const hardcoded = ['claude-sonnet', 'claude-opus', 'claude-haiku', 'gpt-4', 'gpt-3', 'gemini'];
  for (const model of hardcoded) {
    assert.ok(!content.toLowerCase().includes(model),
      `SKILL.md must not contain hardcoded model name: ${model}`);
  }
});

test('SKILL.md references capable tier for RED phase dispatch', () => {
  assert.ok(readSkill().includes('capable'));
});

test('SKILL.md references fast tier for verify/gaming dispatch', () => {
  assert.ok(readSkill().includes('fast'));
});

test('SKILL.md documents standalone invocation with preflight summary', () => {
  const content = readSkill();
  assert.ok(content.includes('standalone') || content.includes('Standalone'));
  assert.ok(content.includes('pre-flight') || content.includes('preflight') || content.includes('Pre-flight'));
});

test('SKILL.md documents diff report format (verify report path)', () => {
  assert.ok(readSkill().includes('-verify-report.md'));
});

test('SKILL.md documents GAMING_VIOLATION error code', () => {
  assert.ok(readSkill().includes('GAMING_VIOLATION'));
});

test('SKILL.md documents RED_STATE_FAILED error code', () => {
  assert.ok(readSkill().includes('RED_STATE_FAILED'));
});

test('SKILL.md documents PACKET_NOT_FOUND error code', () => {
  assert.ok(readSkill().includes('PACKET_NOT_FOUND'));
});

test('SKILL.md documents STALE_PACKET error code', () => {
  assert.ok(readSkill().includes('STALE_PACKET'));
});

test('SKILL.md documents DIFF_UNAVAILABLE error code', () => {
  assert.ok(readSkill().includes('DIFF_UNAVAILABLE'));
});

test('SKILL.md documents UNDECLARED_MOCK error code', () => {
  assert.ok(readSkill().includes('UNDECLARED_MOCK'));
});

test('SKILL.md documents REGRESSION_DETECTED error code', () => {
  assert.ok(readSkill().includes('REGRESSION_DETECTED'));
});

test('SKILL.md documents CONCURRENT_EXECUTION error code', () => {
  assert.ok(readSkill().includes('CONCURRENT_EXECUTION'));
});

test('SKILL.md documents .context-index/-free fallback to ./packets/', () => {
  const content = readSkill();
  assert.ok(content.includes('./packets/') || content.includes("'./packets'"));
});

test('SKILL.md documents model tier fallback advisory message', () => {
  assert.ok(readSkill().includes('model_tiers not configured'));
});

test('SKILL.md documents internal module mocking as a violation requiring redirect to external boundary', () => {
  const content = readSkill();
  assert.ok(content.includes('Internal') && content.includes('VIOLATION'));
});
