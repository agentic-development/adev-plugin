import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { readSkillSurface } from "../helpers.mjs";

test('brainstorm SKILL.md contains Step 3b prototype dispatch', () => {
  const content = readSkillSurface("brainstorm");
  assert.ok(content.includes('## Step 3b') || content.includes('### Step 3b'), 'Step 3b section missing');
  assert.ok(content.includes('module'), 'context field module missing');
  assert.ok(content.includes('approach_summary'), 'context field approach_summary missing');
  assert.ok(content.includes('platform_context'), 'context field platform_context missing');
  assert.ok(content.includes('constitution_constraints'), 'context field constitution_constraints missing');
  assert.ok(content.includes('/adev:prototype'), 'prototype dispatch reference missing');
});

test('prototype SKILL.md handles brainstorm context reception', () => {
  const content = readSkillSurface("prototype");
  assert.ok(content.includes('BRAINSTORM_CONTEXT') || content.includes('brainstorm context'),
    'brainstorm context reception missing');
  assert.ok(content.includes('approach_summary') && content.includes('seed'),
    'approach_summary seeding instruction missing');
  assert.ok(content.includes('skip') && (content.includes('charter lookup') || content.includes('Step 0')),
    'charter lookup skip instruction missing');
});

test('prototype SKILL.md standalone mode still loads charter and extracts approach', () => {
  const content = readSkillSurface("prototype");
  // Standalone path (Step 0) must still exist
  assert.ok(content.includes('Step 0') || content.includes('Standalone'), 'Step 0 standalone entry missing');
  assert.ok(content.includes('--module'), 'standalone --module argument handling missing');
  assert.ok(content.includes('discoverCharters') || content.includes('charter discovery'),
    'charter discovery for no-module case missing');
  // Standalone must skip return-to-brainstorm
  assert.ok(content.includes('standalone') && content.includes('skip'),
    'standalone skip-return instruction missing');
});

test('prototype SKILL.md defines return contract to brainstorm', () => {
  const content = readSkillSurface("prototype");
  assert.ok(content.includes('PROTOTYPE_RESULT') || (content.includes('return') && content.includes('brainstorm')),
    'return-to-brainstorm result missing');
  // Check all return fields
  for (const field of ['status', 'tier', 'visual_references', 'heuristics_saved', 'persistence']) {
    assert.ok(content.includes(field), `return field ${field} missing`);
  }
});

test('brainstorm SKILL.md handles prototype return result', () => {
  const content = readSkillSurface("brainstorm");
  assert.ok(content.includes('PROTOTYPE_RESULT') ||
    (content.includes('prototype') && content.includes('return') && content.includes('result')),
    'prototype result handling in brainstorm missing');
});

test('prototype SKILL.md has detailed heuristics capture prompt', () => {
  const content = readSkillSurface("prototype");
  // Must ask for 2-4 design decisions
  assert.ok(content.includes('2-4') || content.includes('2 to 4'),
    'heuristics prompt should ask for 2-4 design decisions');
  // Must handle skip
  assert.ok(content.includes('skip') || content.includes('none'),
    'heuristics skip handling missing');
  // Must handle excess (>4)
  assert.ok(content.includes('prioritize') || content.includes('more than 4'),
    'excess heuristics prioritization missing');
});

test('prototype SKILL.md invokes /adev:learn for each heuristic', () => {
  const content = readSkillSurface("prototype");
  assert.ok(content.includes('/adev:learn'), 'must invoke /adev:learn skill');
  assert.ok(content.includes('source: prototype') || content.includes('source:prototype'),
    'must tag heuristics with source: prototype');
  assert.ok(content.includes('module') && content.includes('scope'),
    'must scope heuristics to current module');
  // Failure must not block
  assert.ok(content.includes('Heuristic capture failed') || content.includes('non-blocking'),
    'learn failure must not block session');
});

test('prototype SKILL.md loads and surfaces existing heuristics before tier selection', () => {
  const content = readSkillSurface("prototype");
  assert.ok(content.includes('Step 1') && content.includes('Step 2'), 'Steps 1 and 2 must exist');

  // Step 1's body is its own companion under progressive disclosure, so the
  // whole file IS the "before tier selection" region. Slicing the concatenated
  // surface between the Step 1 and Step 2 headings would return only stubs.
  const betweenSteps = readFileSync(
    new URL('../../skills/prototype/references/steps/step-1-load-context.md', import.meta.url),
    'utf8',
  );
  assert.ok(betweenSteps.includes('retrieveHeuristics'),
    'Step 1 must call retrieveHeuristics');
  assert.ok(betweenSteps.includes('Previous design learnings') || betweenSteps.includes('heuristic'),
    'Step 1 must surface existing heuristics to user');
});

// === Cross-file integration tests (Task 8) ===

test('brainstorm and prototype SKILL.md files have matching context contracts', () => {
  const brainstorm = readSkillSurface("brainstorm");
  const prototype = readSkillSurface("prototype");

  // Both must reference the same context fields
  const contextFields = ['module', 'approach_summary', 'platform_context', 'constitution_constraints'];
  for (const field of contextFields) {
    assert.ok(brainstorm.includes(field), `brainstorm missing context field: ${field}`);
    assert.ok(prototype.includes(field), `prototype missing context field: ${field}`);
  }

  // Both must reference the same return fields
  const returnFields = ['status', 'tier', 'visual_references', 'heuristics_saved', 'persistence'];
  for (const field of returnFields) {
    assert.ok(prototype.includes(field), `prototype missing return field: ${field}`);
  }
});

test('prototype SKILL.md error codes match spec error table', () => {
  const content = readSkillSurface("prototype");
  const expectedCodes = ['INCOMPLETE_CONTEXT', 'HEURISTIC_SAVE_ERROR'];
  for (const code of expectedCodes) {
    assert.ok(content.includes(code), `error code ${code} missing from prototype SKILL.md`);
  }
});

test('no executable logic in SKILL.md files (constitution compliance)', () => {
  const brainstorm = readSkillSurface("brainstorm");
  const prototype = readSkillSurface("prototype");

  // SKILL.md files should start with frontmatter or heading (markdown, not code)
  assert.ok(brainstorm.startsWith('---') || brainstorm.startsWith('#'),
    'brainstorm SKILL.md should start with frontmatter or heading');
  assert.ok(prototype.startsWith('---') || prototype.startsWith('#'),
    'prototype SKILL.md should start with frontmatter or heading');
});
