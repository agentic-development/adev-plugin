import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../../..');

describe('hardcoded constant removal', () => {
  it('review-config.mjs should not contain BUNDLED_REVIEWER_IDS', () => {
    const src = readFileSync(resolve(root, 'lib/governance/review-config.mjs'), 'utf8');
    assert.ok(!src.includes('BUNDLED_REVIEWER_IDS'), 'BUNDLED_REVIEWER_IDS still present');
  });

  it('validate-config.mjs should not contain DEFAULT_SEVERITY_BY_KIND', () => {
    const src = readFileSync(resolve(root, 'lib/governance/validate-config.mjs'), 'utf8');
    assert.ok(!src.includes('DEFAULT_SEVERITY_BY_KIND'), 'DEFAULT_SEVERITY_BY_KIND still present');
  });

  it('lifecycle-gate-config.mjs should not contain DEFAULT_FILE_EXCLUSIONS or DEFAULT_BASH_PASSTHROUGH', () => {
    const src = readFileSync(resolve(root, 'lib/lifecycle-gate-config.mjs'), 'utf8');
    assert.ok(!src.includes('DEFAULT_FILE_EXCLUSIONS'), 'DEFAULT_FILE_EXCLUSIONS still present');
    assert.ok(!src.includes('DEFAULT_BASH_PASSTHROUGH'), 'DEFAULT_BASH_PASSTHROUGH still present');
  });

  it('profiles.mjs should not hardcode permitted_tools in UNIT_PROFILE', () => {
    const src = readFileSync(resolve(root, 'lib/test-strategies/profiles.mjs'), 'utf8');
    // Check that the permitted_tools array is not hardcoded inline in UNIT_PROFILE
    const unitBlock = src.substring(src.indexOf('UNIT_PROFILE'), src.indexOf('REQUIRED_FIELDS'));
    assert.ok(!unitBlock.includes("'node:test'"), 'Hardcoded permitted_tools still in UNIT_PROFILE');
  });
});
