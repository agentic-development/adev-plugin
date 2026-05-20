// tests/skills/retro-session-section.test.mjs
//
// Skill-prose tests for the Session Activity insertion. Tasks 14, 15, 16,
// 17 verified here. Task 18 extends with end-to-end snapshot tests.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLUGIN_ROOT } from '../helpers.mjs';

const RETRO_SKILL = readFileSync(join(PLUGIN_ROOT, 'skills/retro/SKILL.md'), 'utf8');
const INIT_SKILL = readFileSync(join(PLUGIN_ROOT, 'skills/init/SKILL.md'), 'utf8');

// ---- Task 14: § 1.8 Session Activity step inserted into retro skill ----

test('skills/retro: contains § 1.8 Session Activity heading', () => {
  assert.match(RETRO_SKILL, /### 1\.8 Session Activity/);
});

test('skills/retro: § 1.8 invokes the CLI verb', () => {
  assert.match(RETRO_SKILL, /adev retro session-activity/);
});

test('skills/retro: § 1.8 documents --format text', () => {
  assert.match(RETRO_SKILL, /--format text/);
});

test('skills/retro: § 1.8 documents Graceful absence', () => {
  assert.match(RETRO_SKILL, /Graceful absence/);
});

test('skills/retro: contains no inline-Node patterns (Principle 2)', () => {
  // Pre-commit hook also enforces this; defense-in-depth from skill tests.
  assert.equal(RETRO_SKILL.includes('node -e '), false);
  assert.equal(RETRO_SKILL.includes('node --input-type=module -e'), false);
  assert.equal(RETRO_SKILL.includes('Run inline Node'), false);
});

// ---- Task 15: Step 2 Context Gaps removal ----

test('skills/retro: Step 2 "Context Gaps" subsection deleted', () => {
  // The phrase "if session capture is configured" was inside the old
  // conditional grep; absence confirms removal.
  assert.equal(
    RETRO_SKILL.includes('if session capture is configured'),
    false,
    'old conditional phrase still present'
  );
});

test('skills/retro: no "### Context Gaps" subheading under Step 2', () => {
  // The old subheading lived in Step 2; ensure no `### Context Gaps`
  // heading exists (Step 2 had it; Step 1.8 uses "## Session Activity"
  // header and the CLI verb renders the Context Gaps subsection as
  // ### Context Gaps inside the output, but the Step 2 occurrence is
  // gone — verify the location is not in Step 2 by checking it does
  // not appear between "## Step 2" and "## Step 3").
  const step2Start = RETRO_SKILL.indexOf('## Step 2');
  const step3Start = RETRO_SKILL.indexOf('## Step 3');
  assert.ok(step2Start > 0, 'Step 2 not found');
  assert.ok(step3Start > step2Start, 'Step 3 not found after Step 2');
  const step2Section = RETRO_SKILL.slice(step2Start, step3Start);
  assert.equal(
    step2Section.includes('### Context Gaps'),
    false,
    'Step 2 still contains a Context Gaps subheading'
  );
});

// ---- Task 16: Report Format documents Session Activity ordering ----

test('skills/retro: Report Format has ## Session Activity heading', () => {
  // The Report Format markdown template includes the section header so
  // the agent renders it in the right place.
  const reportStart = RETRO_SKILL.indexOf('### Report Format');
  assert.ok(reportStart > 0, 'Report Format heading not found');
  const reportSection = RETRO_SKILL.slice(reportStart);
  assert.match(reportSection, /## Session Activity/);
});

test('skills/retro: Report Format documents the six-subsection ordering', () => {
  const reportStart = RETRO_SKILL.indexOf('### Report Format');
  const section = RETRO_SKILL.slice(reportStart);
  // The Behavior 13 ordering documented in prose.
  assert.match(section, /Tool-Use Distribution/);
  assert.match(section, /Per-Spec Session Counts/);
  assert.match(section, /Cost & Token Trends/);
  assert.match(section, /Sessions . Closed Issues/); // "↔" with regex-safe wildcard
  assert.match(section, /Context Gaps/);
});

test('skills/retro: Report Format places Session Activity before Throughput', () => {
  const reportStart = RETRO_SKILL.indexOf('### Report Format');
  const section = RETRO_SKILL.slice(reportStart);
  const sessionPos = section.indexOf('## Session Activity');
  const throughputPos = section.indexOf('## Throughput');
  assert.ok(sessionPos > 0 && throughputPos > 0, 'sections not found');
  assert.ok(
    sessionPos < throughputPos,
    'Session Activity must precede Throughput in Report Format'
  );
});

// ---- Task 17: skills/init/SKILL.md doc-drift fix ----

test('skills/init: /adev:retro session-consumption claim is accurate', () => {
  // The claim should mention the actual section name (Session Activity)
  // and the step where it lives (§ 1.8 in retro SKILL.md).
  assert.match(INIT_SKILL, /Session Activity/);
  assert.match(INIT_SKILL, /skills\/retro\/SKILL\.md/);
});

test('skills/init: contains no inline-Node patterns', () => {
  // Pre-commit guard; defense-in-depth.
  assert.equal(INIT_SKILL.includes('node -e '), false);
});
