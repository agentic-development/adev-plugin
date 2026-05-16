/**
 * Tests for the post-restructure validate registry.
 *
 * Spec: .context-index/specs/features/validation/check-set-restructure.spec.md
 *
 * Verifies that the software-domain starter and project override no longer
 * register the dropped check IDs and that loadValidateConfig returns only the
 * surviving check set.
 */

import { test, describe, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadValidateConfig } from '../../lib/governance/validate-config.mjs';
import { createTempDir, cleanupTempDir, writeFixture, PLUGIN_ROOT } from '../helpers.mjs';

const STARTER_PATH = join(PLUGIN_ROOT, 'templates/domains/software/validate.yaml');
const PROJECT_OVERRIDE_PATH = join(PLUGIN_ROOT, '.context-index/governance/validate.yaml');

const tempDirs = [];
function tmp() { const d = createTempDir(); tempDirs.push(d); return d; }
afterEach(() => { while (tempDirs.length) cleanupTempDir(tempDirs.pop()); });

describe('Validate check set restructure — registry trim', () => {
  test('software starter has no active check-10-platform-drift entry', () => {
    const starter = readFileSync(STARTER_PATH, 'utf8');
    // Assert the registry entry itself is gone (orientation comments mentioning
    // the removed ID for migration context are allowed and expected).
    assert.ok(
      !/^\s*-\s*id:\s*validate\.check-10-platform-drift/m.test(starter),
      'Starter must not register check-10-platform-drift (comments referencing the removed ID for migration orientation are allowed)'
    );
  });

  test('software starter has no active check-12-lifecycle-reconciliation entry', () => {
    const starter = readFileSync(STARTER_PATH, 'utf8');
    assert.ok(
      !/^\s*-\s*id:\s*validate\.check-12-lifecycle-reconciliation/m.test(starter),
      'Starter must not register check-12-lifecycle-reconciliation'
    );
  });

  test('project governance/validate.yaml no longer disables removed check IDs', () => {
    // After Task 5, the project override file removes the disabled entries
    // for check-10 and check-11 — those IDs are gone from the starter, so
    // disabling them would trigger RESURRECTED_CHECK_ID once Task 12 lands.
    const project = readFileSync(PROJECT_OVERRIDE_PATH, 'utf8');
    assert.ok(
      !/^\s*-\s*id:\s*validate\.check-10-platform-drift/m.test(project),
      'Project override must not list check-10-platform-drift'
    );
  });

  test('loadValidateConfig with post-restructure starter returns only surviving checks', () => {
    const repo = tmp();
    const starterContent = readFileSync(STARTER_PATH, 'utf8');
    writeFixture(repo, '.context-index/governance/validate.yaml', starterContent);
    // Profiles file required by loadValidateConfig (reviewer-capable, etc.)
    // is bundled in the plugin; we don't need to fixture-write it because
    // loadProfiles resolves from pluginRoot.
    const r = loadValidateConfig(repo, { pluginRoot: PLUGIN_ROOT });
    assert.equal(
      r.errors.length,
      0,
      `loadValidateConfig should succeed on post-restructure starter; got errors: ${JSON.stringify(r.errors)}`
    );
    const ids = r.checks.map((c) => c.id);
    assert.ok(
      !ids.includes('validate.check-10-platform-drift'),
      'check-10 must be gone from loader result'
    );
    assert.ok(
      !ids.includes('validate.check-12-lifecycle-reconciliation'),
      'check-12-lifecycle must be gone from loader result'
    );
    assert.ok(
      ids.includes('validate.check-1.5-source-manifest'),
      'check-1.5 must survive'
    );
    assert.ok(
      ids.includes('validate.check-2-spec-compliance'),
      'check-2 must survive'
    );
    assert.ok(
      ids.includes('validate.check-4-constitution'),
      'check-4 must survive'
    );
  });

  test('SKILL.md no longer contains Check 10 Platform Drift section', () => {
    const skill = readFileSync(join(PLUGIN_ROOT, 'skills/validate/SKILL.md'), 'utf8');
    // The per-check prose section (### Check 10: ...) is removed; the migration
    // footer may still reference "Check 10" in informational language but
    // there should be no per-check prose section.
    assert.ok(
      !/^### Check 10:/m.test(skill),
      'SKILL.md must not retain the ### Check 10: prose section'
    );
  });

  test('SKILL.md no longer contains Check 12 Lifecycle Reconciliation section', () => {
    const skill = readFileSync(join(PLUGIN_ROOT, 'skills/validate/SKILL.md'), 'utf8');
    assert.ok(
      !/^### Check 12: Lifecycle Reconciliation/m.test(skill),
      'SKILL.md must not retain the ### Check 12: Lifecycle Reconciliation prose section'
    );
  });

  test('software starter has no active check-5, check-6, check-7 entries', () => {
    const starter = readFileSync(STARTER_PATH, 'utf8');
    assert.ok(
      !/^\s*-\s*id:\s*validate\.check-5-adrs/m.test(starter),
      'Starter must not register check-5-adrs'
    );
    assert.ok(
      !/^\s*-\s*id:\s*validate\.check-6-cross-cutting/m.test(starter),
      'Starter must not register check-6-cross-cutting'
    );
    assert.ok(
      !/^\s*-\s*id:\s*validate\.check-7-specialist-review/m.test(starter),
      'Starter must not register check-7-specialist-review'
    );
  });

  test('SKILL.md no longer contains Check 5, 6, 7 prose sections', () => {
    const skill = readFileSync(join(PLUGIN_ROOT, 'skills/validate/SKILL.md'), 'utf8');
    assert.ok(!/^### Check 5: /m.test(skill), 'SKILL.md must not retain ### Check 5 prose');
    assert.ok(!/^### Check 6: /m.test(skill), 'SKILL.md must not retain ### Check 6 prose');
    assert.ok(!/^### Check 7: /m.test(skill), 'SKILL.md must not retain ### Check 7 prose');
  });
});
