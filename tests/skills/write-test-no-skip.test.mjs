// tests/skills/write-test-no-skip.test.mjs
// Regression test for issue-192: write-test SKILL.md must enforce
// "fail hard, never skip" as the default for integration tests.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PLUGIN_ROOT } from '../helpers.mjs';

const SKILL_PATH = join(PLUGIN_ROOT, 'skills', 'write-test', 'SKILL.md');
const skill = readFileSync(SKILL_PATH, 'utf8');

describe('write-test SKILL.md — fail hard principle (issue-192)', () => {
  it("states default behavior is FAILURE not skip (+1 more contract assertions)", () => {
    // states default behavior is FAILURE not skip
    assert.match(
    skill,
    /[Dd]efault.*(?:behavior|behaviour).*(?:FAILURE|fail|failing).*not skip/i,
    'Must state that default when infra is unavailable is failure, not skip'
    );

    // prohibits agent from adding skip guards
    assert.match(
    skill,
    /agent must.*NEVER.*skip guard|NEVER add skip guard/i,
    'Must explicitly prohibit the agent from adding skip guards'
    );
  });

  it('mentions on_fail: skip as the only way to enable skipping', () => {
    assert.match(
      skill,
      /on_fail.*skip/i,
      'Must mention on_fail: skip as the explicit user configuration for skip behavior'
    );
  });

  it('lists specific prohibited patterns', () => {
    assert.match(skill, /describe\.skipIf/i, 'Must list describe.skipIf as prohibited');
    assert.match(skill, /describe\.skip/i, 'Must list describe.skip as prohibited');
    assert.match(skill, /canConnect/i, 'Must list canConnect as prohibited');
    assert.match(skill, /process\.exit/i, 'Must list process.exit as prohibited');
  });
});
