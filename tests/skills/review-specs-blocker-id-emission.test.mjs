/**
 * Task 6 of review-block-auto-retry.plan.md.
 *
 * Verifies that the three reviewer subagent prompts document the canonical
 * `blocker_id` + `section_anchor` requirements for BLOCK findings, and that
 * the aggregator (skills/review-specs/SKILL.md) documents the validation +
 * fallback contract.
 *
 * These are content checks on the SKILL.md / prompt markdown — the prompts
 * are themselves the contract the reviewer subagents follow.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = resolve(__dirname, '../../skills/review-specs');

function readSkill(name) {
  return readFileSync(resolve(SKILLS_DIR, name), 'utf8');
}

test('structural-architect prompt documents blocker_id + section_anchor for BLOCK findings', () => {
  const body = readSkill('structural-architect-prompt.md');
  assert.ok(body.includes('blocker_id'), 'must mention blocker_id');
  assert.ok(body.includes('section_anchor'), 'must mention section_anchor');
  assert.ok(body.includes('lib/blocker-id.mjs'), 'must reference the canonical emitter');
  assert.ok(body.includes('structural-architect'), 'must document the reviewer-slug');
});

test('security-reviewer prompt documents blocker_id + section_anchor for BLOCK findings', () => {
  const body = readSkill('security-reviewer-prompt.md');
  assert.ok(body.includes('blocker_id'));
  assert.ok(body.includes('section_anchor'));
  assert.ok(body.includes('lib/blocker-id.mjs'));
  assert.ok(body.includes('security-reviewer'));
});

test('consistency-analyzer prompt documents blocker_id + section_anchor for BLOCK findings', () => {
  const body = readSkill('consistency-analyzer-prompt.md');
  assert.ok(body.includes('blocker_id'));
  assert.ok(body.includes('section_anchor'));
  assert.ok(body.includes('lib/blocker-id.mjs'));
  assert.ok(body.includes('consistency-analyzer'));
});

test('review-specs SKILL.md documents aggregator validation rules', () => {
  const body = readSkill('SKILL.md');
  // Validation contract — must mention all three advisory codes
  assert.ok(body.includes('LEGACY_REVIEWER_OUTPUT'),
    'must document the LEGACY_REVIEWER_OUTPUT fallback path');
  assert.ok(body.includes('INVALID_BLOCKER_ID'),
    'must document the INVALID_BLOCKER_ID advisory');
  assert.ok(body.includes('MISSING_SECTION_ANCHOR'),
    'must document the MISSING_SECTION_ANCHOR advisory');
});

test('review-specs SKILL.md references lib/blockers-writer.mjs', () => {
  const body = readSkill('SKILL.md');
  assert.ok(body.includes('lib/blockers-writer.mjs') || body.includes('writeBlockers'),
    'must reference the canonical .blockers.md writer');
});
