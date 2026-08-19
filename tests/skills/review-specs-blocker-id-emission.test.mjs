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
import { readSkillSurface } from '../helpers.mjs';

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

test('consistency-analyzer prompt documents section_anchor + finding_type, no hash instruction TO the reviewer (adev-plugin-xf5d)', () => {
  const body = readSkill('consistency-analyzer-prompt.md');
  assert.ok(body.includes('section_anchor'));
  assert.ok(body.includes('finding-type') || body.includes('finding_type'));
  // lib/blocker-id.mjs and SHA-256 ARE named — informationally, as part of
  // explaining that the AGGREGATOR (not the reviewer) computes the hash, the
  // same consistent pattern the other three reviewer prompts use. What must
  // never appear is an INSTRUCTION for the reviewer itself to compute one.
  assert.ok(body.includes('lib/blocker-id.mjs'), 'must reference the aggregator-side constructor');
  assert.match(
    body,
    /do not compute `?blocker_id`? yourself/i,
    'must explicitly tell the reviewer not to compute blocker_id',
  );
  assert.ok(body.includes('consistency-analyzer'));
});

test('review-specs SKILL.md documents aggregator validation rules', () => {
  // Whole instruction surface: the aggregator contract moved into a Step
  // companion under progressive disclosure. The reviewer-prompt assertions
  // below still read their individual prompt files, which did not move.
  const body = readSkillSurface('review-specs');
  // Validation contract — must mention all three advisory codes
  assert.ok(body.includes('LEGACY_REVIEWER_OUTPUT'),
    'must document the LEGACY_REVIEWER_OUTPUT fallback path');
  assert.ok(body.includes('INVALID_BLOCKER_ID'),
    'must document the INVALID_BLOCKER_ID advisory');
  assert.ok(body.includes('MISSING_SECTION_ANCHOR'),
    'must document the MISSING_SECTION_ANCHOR advisory');
});

test('review-specs SKILL.md invokes the blockers write CLI verb (adev-plugin-heba)', () => {
  const body = readSkillSurface('review-specs');
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

// ── adev-plugin-xf5d: reviewers emit finding_type, never compute blocker_id ──
//
// The reviewer prompts used to instruct an LLM to compute the 8-hex-char
// SHA-256 location-hash itself — something an LLM cannot do deterministically.
// Live evidence: round 1 of a real review, all 5 blockers omitted blocker_id
// entirely (LEGACY_REVIEWER_OUTPUT, no auto-retry armed). Round 2 fixed it by
// having the ORCHESTRATOR construct the id from reviewer-supplied finding_type
// + section_anchor via buildBlockerId() — the reviewer never touches the hash.

const XF5D_REVIEWER_PROMPTS = [
  'structural-architect-prompt.md',
  'security-reviewer-prompt.md',
  'consistency-analyzer-prompt.md',
  'quick-synthesized-reviewer-prompt.md',
];

for (const name of XF5D_REVIEWER_PROMPTS) {
  test(`${name} asks for finding_type, not a computed blocker_id`, () => {
    const body = readSkill(name);
    assert.ok(body.includes('finding_type'), `${name} must require finding_type`);
    assert.doesNotMatch(
      body,
      /computed via `?lib\/blocker-id\.mjs::buildBlockerId`?\s*\)?\s*\.\s*Reviewer-slug/,
      `${name} must not instruct the reviewer to compute blocker_id itself`,
    );
    assert.match(
      body,
      /do not compute `?blocker_id`? yourself/i,
      `${name} must explicitly tell the reviewer not to compute blocker_id`,
    );
  });
}

test('review-specs SKILL.md documents the aggregator CONSTRUCTING blocker_id, not accepting one from reviewers', () => {
  const body = readSkillSurface('review-specs');
  assert.ok(body.includes('buildBlockerId'), 'must reference the constructor function');
  assert.ok(body.includes('finding_type'), 'must document finding_type as the reviewer-supplied field');
  assert.match(
    body,
    /never accept a `?blocker_id`? supplied directly by a reviewer/i,
    'must explicitly refuse a reviewer-supplied blocker_id even when well-formed — a fabricated-but-plausible id is not reproducible across revisions and silently poisons the retry partition',
  );
});

test('lib/blocker-id.mjs module doc does not claim reviewers emit blocker_id', () => {
  const body = readFileSync(resolve(__dirname, '../../lib/blocker-id.mjs'), 'utf8');
  assert.doesNotMatch(
    body,
    /Reviewer subagents emit findings with a stable, deterministic/,
    'the module doc must not claim reviewer subagents emit blocker_id directly',
  );
});
