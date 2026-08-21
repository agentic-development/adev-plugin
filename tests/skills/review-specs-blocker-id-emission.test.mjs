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

test('consistency-analyzer prompt documents section_anchor + finding-type, no hash instruction', () => {
  const body = readSkill('consistency-analyzer-prompt.md');
  assert.ok(body.includes('section_anchor'));
  assert.ok(body.includes('finding-type') || body.includes('finding_type'));
  assert.ok(!body.includes('lib/blocker-id.mjs'), 'must not instruct hash computation');
  assert.ok(!/sha-?256/i.test(body), 'must not name a cryptographic digest');
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

test('review-specs SKILL.md invokes the blockers write CLI verb (adev-plugin-heba)', () => {
  const body = readSkill('SKILL.md');
  // The skill was migrated off a bare lib-function reference to the CLI
  // driver surface per CLAUDE.md — SKILL.md must name the `adev` verb an
  // agent actually invokes, not the lib internals behind it.
  assert.ok(body.includes('adev blockers write'),
    'must invoke the blockers write CLI verb, not name the lib writer directly');
});

test('referent-integrity prompt documents section_anchor + finding-type, no hash instruction', () => {
  const body = readSkill('referent-integrity-prompt.md');
  assert.ok(body.includes('section_anchor'));
  assert.ok(body.includes('finding-type') || body.includes('finding_type'));
  assert.ok(!body.includes('lib/blocker-id.mjs'), 'must not instruct hash computation');
  assert.ok(!/sha-?256/i.test(body), 'must not name a cryptographic digest');
});

test('wiring-reviewer prompt states PRODUCER/CONSUMER/TRIGGER/TEST scope and flags no-caller as blocker', () => {
  const body = readSkill('wiring-reviewer-prompt.md');
  assert.ok(/producer/i.test(body) && /consumer/i.test(body) && /trigger/i.test(body));
  assert.ok(/no caller/i.test(body) || /write-only/i.test(body));
  assert.ok(!body.includes('lib/blocker-id.mjs'));
});

test('boundary-reviewer prompt embeds the six measured issue classes and dispatches always', () => {
  const body = readSkill('boundary-reviewer-prompt.md');
  for (const term of ['path containment', 'subprocess interpolation', 'input trust', 'privilege', 'artifact leakage', 'destructive']) {
    assert.ok(body.toLowerCase().includes(term), `missing checklist item: ${term}`);
  }
  assert.ok(!body.includes('lib/blocker-id.mjs'));
});

test('termination-reviewer prompt flags missing iteration cap, cap-trip verdict, unattended default', () => {
  const body = readSkill('termination-reviewer-prompt.md');
  assert.ok(/iteration cap/i.test(body));
  assert.ok(/cap-trip/i.test(body) || /trip/i.test(body));
  assert.ok(/unattended/i.test(body));
  assert.ok(!body.includes('lib/blocker-id.mjs'));
});
