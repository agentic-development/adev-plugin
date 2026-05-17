/**
 * Tests for /adev:reconcile lifecycle-sync section + --fix default mode.
 *
 * Spec: .context-index/specs/features/validation/check-set-restructure.spec.md
 * Plan-task: 2
 *
 * Verifies that the lifecycle reconciliation formerly in /adev:validate Check 12
 * has been migrated to /adev:reconcile, with --fix as the default mode and
 * reportPlanTask as the authoritative channel for plan-task state.
 */

import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLUGIN_ROOT } from '../helpers.mjs';

const SKILL_PATH = join(PLUGIN_ROOT, 'skills/reconcile/SKILL.md');

describe('Reconcile lifecycle-sync section', () => {
  test('SKILL.md documents --fix and --no-fix flags', () => {
    const skill = readFileSync(SKILL_PATH, 'utf8');
    assert.ok(skill.includes('--fix'), 'Missing --fix flag documentation');
    assert.ok(skill.includes('--no-fix'), 'Missing --no-fix flag documentation');
  });

  test('--fix is described as default mode', () => {
    const skill = readFileSync(SKILL_PATH, 'utf8');
    assert.ok(
      /--fix[^.\n]*default|default[^.\n]*--fix/i.test(skill),
      '--fix should be described as default'
    );
  });

  test('lifecycle-sync section present', () => {
    const skill = readFileSync(SKILL_PATH, 'utf8');
    assert.ok(
      skill.toLowerCase().includes('lifecycle') && skill.toLowerCase().includes('sync'),
      'Missing lifecycle-sync section'
    );
  });

  test('--fix mode uses reportPlanTask (not markdown checkbox writes)', () => {
    const skill = readFileSync(SKILL_PATH, 'utf8');
    // The new lifecycle-sync section must reference reportPlanTask as the
    // authoritative channel for plan-task state.
    assert.ok(
      skill.includes('reportPlanTask'),
      'Must reference reportPlanTask for plan-task reconciliation'
    );
  });

  test('lifecycle-sync section references former Check 12 origin', () => {
    const skill = readFileSync(SKILL_PATH, 'utf8');
    assert.ok(
      skill.match(/Check 12|check-12/i),
      'Lifecycle-sync section should cite its Check 12 origin for migration orientation'
    );
  });
});
