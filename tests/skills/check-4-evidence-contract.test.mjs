/**
 * Tests for Check 4 evidence-citation authoring contract.
 *
 * Spec: .context-index/specs/features/validation/check-set-restructure.spec.md
 * Plan-task: 9
 *
 * Behavior 4: every Check 4 finding (PASS or FAIL) must cite file:line
 * evidence or a grep result; uncited findings are reported as FAIL with
 * code UNCITED_FINDING.
 */

import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLUGIN_ROOT } from '../helpers.mjs';

const CHECK_4 = join(PLUGIN_ROOT, 'skills/validate/checks/validate.check-4-constitution.md');

describe('Check 4 authoring contract — evidence citations', () => {
  test('check-4 prompt requires file:line evidence for all findings', () => {
    const prompt = readFileSync(CHECK_4, 'utf8');
    assert.ok(
      prompt.includes('file:line'),
      'Check 4 must require file:line evidence in its authoring contract'
    );
  });

  test('check-4 documents UNCITED_FINDING rejection code', () => {
    const prompt = readFileSync(CHECK_4, 'utf8');
    assert.ok(
      prompt.includes('UNCITED_FINDING'),
      'Check 4 must document the UNCITED_FINDING rejection code'
    );
  });

  test('check-4 documents that uncited findings are reported as FAIL', () => {
    const prompt = readFileSync(CHECK_4, 'utf8');
    assert.ok(
      /FAIL/.test(prompt) && /(without evidence|no evidence|uncited)/i.test(prompt),
      'Check 4 must say uncited findings are reported as FAIL'
    );
  });

  test('check-4 accepts grep results as evidence (alternative to file:line)', () => {
    const prompt = readFileSync(CHECK_4, 'utf8');
    assert.ok(
      /grep/i.test(prompt),
      'Check 4 must accept grep results as evidence alongside file:line citations'
    );
  });

  test('check-4 has an explicit Evidence Contract section', () => {
    const prompt = readFileSync(CHECK_4, 'utf8');
    assert.ok(
      /## Evidence Contract|## Authoring Contract|Evidence Contract/.test(prompt),
      'Check 4 should declare an explicit Evidence/Authoring Contract section'
    );
  });
});
