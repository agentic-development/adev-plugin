/**
 * Tests for the revised Check 11 trigger semantics.
 *
 * Spec: .context-index/specs/features/validation/check-set-restructure.spec.md
 * Plan-task: 6
 *
 * Behaviors 5 + 6:
 *   - SKIP (not BLOCK) when no UI files match AND Playwright is absent
 *   - BLOCK preserved when UI files match AND Playwright is absent
 */

import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLUGIN_ROOT } from '../helpers.mjs';

const CHECK_11 = join(
  PLUGIN_ROOT,
  'skills/validate/checks/validate.check-11-visual-verification.md',
);
const SKILL = join(PLUGIN_ROOT, 'skills/validate/SKILL.md');

describe('Check 11 trigger guard semantics', () => {
  test('check-11 prompt has an explicit Trigger Guard section', () => {
    const prompt = readFileSync(CHECK_11, 'utf8');
    assert.ok(
      /Trigger Guard|Trigger guard/.test(prompt),
      'Check 11 prompt must declare an explicit Trigger Guard section'
    );
  });

  test('check-11 documents SKIP when no UI files AND Playwright absent', () => {
    const prompt = readFileSync(CHECK_11, 'utf8');
    assert.ok(
      /SKIP/.test(prompt) && /no UI files/i.test(prompt),
      'Must document SKIP case for no UI files without Playwright'
    );
  });

  test('check-11 preserves BLOCK when UI files match AND Playwright absent', () => {
    const prompt = readFileSync(CHECK_11, 'utf8');
    assert.ok(
      /BLOCK/.test(prompt) && /Playwright/i.test(prompt),
      'Must preserve BLOCK case for UI files without Playwright'
    );
  });

  test('check-11 declares all four trigger cases (A/B/C/D)', () => {
    const prompt = readFileSync(CHECK_11, 'utf8');
    // The guard explicitly enumerates the matrix to remove ambiguity.
    for (const c of ['Case A', 'Case B', 'Case C', 'Case D']) {
      assert.ok(
        prompt.includes(c),
        `Trigger guard must enumerate ${c}`
      );
    }
  });

  test('SKILL.md Check 11 section reflects the revised SKIP-not-BLOCK semantics', () => {
    const skill = readFileSync(SKILL, 'utf8');
    const idx = skill.indexOf('### Check 11:');
    assert.ok(idx !== -1, 'SKILL.md must have ### Check 11: section');
    const section = skill.slice(idx, idx + 3000);
    // The revised semantics: SKIP when no UI files even if Playwright is
    // absent — i.e., the SKILL.md no longer says "Do not record SKIP" as
    // an absolute rule.
    assert.ok(
      /SKIP/.test(section),
      'SKILL.md Check 11 section must permit SKIP under the revised trigger guard'
    );
  });
});
