/**
 * Tests for Hygiene Audit Pass 20: Platform Drift.
 *
 * Spec: .context-index/specs/features/validation/check-set-restructure.spec.md
 * Plan-task: 1
 *
 * Verifies that the platform-drift logic formerly in /adev:validate Check 10
 * has been migrated to /adev:hygiene Audit Pass 20.
 */

import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLUGIN_ROOT, readSkillSurface } from '../helpers.mjs';

const SKILL_PATH = join(PLUGIN_ROOT, 'skills/hygiene/SKILL.md');

describe('Hygiene Audit Pass 20: Platform Drift', () => {
  test('SKILL.md contains Audit Pass 20 section', () => {
    const skill = readSkillSurface("hygiene");
    assert.ok(skill.includes('Audit Pass 20'), 'Missing Audit Pass 20');
    assert.ok(skill.includes('Platform Drift'), 'Missing Platform Drift title');
  });

  test('Pass 20 compares platform-context.yaml against package.json', () => {
    const skill = readSkillSurface("hygiene");
    const idx = skill.indexOf('Audit Pass 20');
    assert.ok(idx !== -1, 'Pass 20 section not found');
    const section = skill.slice(idx, idx + 2500);
    assert.ok(section.includes('platform-context.yaml'), 'Missing platform-context.yaml ref');
    assert.ok(section.includes('package.json'), 'Missing package.json ref');
  });

  test('Pass 20 SKIPs when platform-context.yaml does not exist', () => {
    const skill = readSkillSurface("hygiene");
    const idx = skill.indexOf('Audit Pass 20');
    const section = skill.slice(idx, idx + 2500);
    assert.ok(section.includes('SKIP'), 'Must document SKIP case');
  });

  test('description frontmatter no longer says nineteen audit passes', () => {
    const skill = readSkillSurface("hygiene");
    // After adding Pass 20, description should mention twenty passes (was nineteen)
    assert.ok(
      !skill.includes('Runs nineteen audit passes'),
      'Description still says "Runs nineteen audit passes" — must be updated to twenty'
    );
    assert.ok(
      skill.includes('twenty') || skill.includes('Twenty'),
      'Description / body should mention twenty audit passes'
    );
  });
});
