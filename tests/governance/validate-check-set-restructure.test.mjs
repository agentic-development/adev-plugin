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

  test('software starter has no active check-12-heuristic-extraction entry', () => {
    const starter = readFileSync(STARTER_PATH, 'utf8');
    assert.ok(
      !/^\s*-\s*id:\s*validate\.check-12-heuristic-extraction/m.test(starter),
      'Starter must not register check-12-heuristic-extraction (now runs via post-validate hook)'
    );
  });

  test('SKILL.md no longer contains Check 13 Success Heuristic Extraction section', () => {
    const skill = readFileSync(join(PLUGIN_ROOT, 'skills/validate/SKILL.md'), 'utf8');
    assert.ok(
      !/^### Check 13: Success Heuristic Extraction/m.test(skill),
      'SKILL.md must not retain the ### Check 13 prose section (relocated to post-validate hook)'
    );
  });

  test('SKILL.md report template references relocation destinations', () => {
    const skill = readFileSync(join(PLUGIN_ROOT, 'skills/validate/SKILL.md'), 'utf8');
    // Task 11: the migration-orientation footer cites the three skills that
    // now own the relocated checks.
    assert.ok(skill.includes('/adev:hygiene'), 'Report template must reference /adev:hygiene');
    assert.ok(skill.includes('/adev:reconcile'), 'Report template must reference /adev:reconcile');
    assert.ok(skill.includes('/adev:review-specs'), 'Report template must reference /adev:review-specs');
  });

  test('SKILL.md report template mentions relocated checks for migration orientation', () => {
    const skill = readFileSync(join(PLUGIN_ROOT, 'skills/validate/SKILL.md'), 'utf8');
    // The footer enumerates Checks 3, 5, 6, 7, 10, 11 (conditional), 12, 13
    // so users comparing with historic .validate.md reports can find the new
    // home of each relocated check.
    assert.ok(
      /Check[s]? 3/.test(skill) || /check-3/.test(skill),
      'Report template should mention Check 3 in the orientation footer'
    );
  });

  test('SKILL.md "Overall Status" no longer claims all 13 checks pass', () => {
    const skill = readFileSync(join(PLUGIN_ROOT, 'skills/validate/SKILL.md'), 'utf8');
    // Task 11: stale "All 13 checks passed" / "Skip any of the 13 checks"
    // language gets updated to reflect the trimmed inventory.
    assert.ok(
      !/All 13 checks passed/.test(skill),
      'Overall Status / report copy must not claim "All 13 checks passed" after restructure'
    );
  });

  test('project governance/validate.yaml referencing a removed check ID emits RESURRECTED_CHECK_ID WARN', () => {
    const repo = tmp();
    const starterBase = readFileSync(STARTER_PATH, 'utf8');
    // Append a removed check ID to the project override.
    const withResurrected =
      starterBase +
      '\n  - id: validate.check-3-charter-consistency\n    enabled: true\n';
    writeFixture(repo, '.context-index/governance/validate.yaml', withResurrected);
    const r = loadValidateConfig(repo, { pluginRoot: PLUGIN_ROOT });
    // No errors — RESURRECTED is a WARN, not a hard fail.
    assert.equal(
      r.errors.length,
      0,
      `expected no errors; got ${JSON.stringify(r.errors)}`
    );
    assert.ok(
      r.warnings.some(
        (w) => w.code === 'RESURRECTED_CHECK_ID' && /check-3/.test(w.message),
      ),
      `expected RESURRECTED_CHECK_ID warning for check-3; got ${JSON.stringify(r.warnings)}`
    );
    // The entry is skipped — not present in the final check list.
    assert.ok(
      !r.checks.some((c) => c.id === 'validate.check-3-charter-consistency'),
      'Resurrected check must be skipped from the final check list'
    );
  });

  test('RESURRECTED_CHECK_ID covers every dropped ID', () => {
    const droppedIds = [
      'validate.check-3-charter-consistency',
      'validate.check-5-adrs',
      'validate.check-6-cross-cutting',
      'validate.check-7-specialist-review',
      'validate.check-10-platform-drift',
      'validate.check-12-lifecycle-reconciliation',
      'validate.check-12-heuristic-extraction',
    ];
    for (const id of droppedIds) {
      const repo = tmp();
      const starterBase = readFileSync(STARTER_PATH, 'utf8');
      const withResurrected = starterBase + `\n  - id: ${id}\n    enabled: true\n`;
      writeFixture(repo, '.context-index/governance/validate.yaml', withResurrected);
      const r = loadValidateConfig(repo, { pluginRoot: PLUGIN_ROOT });
      assert.ok(
        r.warnings.some((w) => w.code === 'RESURRECTED_CHECK_ID' && w.message.includes(id.replace('validate.', ''))),
        `expected RESURRECTED_CHECK_ID warning for ${id}; got ${JSON.stringify(r.warnings)}`
      );
    }
  });

  test('validation charter Skills section no longer uses pre-restructure check counts', () => {
    const charter = readFileSync(
      join(PLUGIN_ROOT, '.context-index/specs/features/validation/charter.md'),
      'utf8',
    );
    assert.ok(!/11 ordered checks/.test(charter), 'Charter must not say "11 ordered checks"');
    assert.ok(!/12 ordered checks/.test(charter), 'Charter must not say "12 ordered checks"');
    assert.ok(!/13 ordered checks/.test(charter), 'Charter must not say "13 ordered checks"');
  });

  test('validation charter Skills section enumerates the post-restructure surviving checks', () => {
    const charter = readFileSync(
      join(PLUGIN_ROOT, '.context-index/specs/features/validation/charter.md'),
      'utf8',
    );
    assert.ok(charter.includes('Check 1.5'), 'Charter Skills must mention Check 1.5');
    assert.ok(/Check 2/.test(charter), 'Charter Skills must mention Check 2');
    assert.ok(/Check 4/.test(charter), 'Charter Skills must mention Check 4');
    assert.ok(
      /relocated|relocated to/.test(charter),
      'Charter Skills should describe relocation of the dropped checks'
    );
  });

  test('SEC-4: RESURRECTED_CHECK_ID message shows only the check ID, not the full entry content', () => {
    const repo = tmp();
    const starterBase = readFileSync(STARTER_PATH, 'utf8');
    // Include extra fields with a potential sensitive label to verify the
    // diagnostic does not echo it.
    const withResurrected =
      starterBase +
      `\n  - id: validate.check-5-adrs\n    enabled: true\n    name: "internal-codename-do-not-leak"\n`;
    writeFixture(repo, '.context-index/governance/validate.yaml', withResurrected);
    const r = loadValidateConfig(repo, { pluginRoot: PLUGIN_ROOT });
    const warn = r.warnings.find((w) => w.code === 'RESURRECTED_CHECK_ID');
    assert.ok(warn, 'expected a RESURRECTED_CHECK_ID warning');
    assert.ok(
      !warn.message.includes('internal-codename-do-not-leak'),
      'SEC-4: diagnostic must not echo other fields (name, prompt, context_pack) — only the check ID'
    );
  });
});
