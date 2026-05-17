/**
 * Tests for Check 2 scope-expansion sub-finding + Check 3 registry drop.
 *
 * Spec: .context-index/specs/features/validation/check-set-restructure.spec.md
 * Plan-task: 7
 *
 * Behavior 3 + SA-2 fix: declared scope is pinned to source-manifest.files;
 * CON-3 edge case: empty/absent list yields INFO note, not a scope-expansion finding.
 */

import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLUGIN_ROOT } from '../helpers.mjs';

const CHECK_2 = join(PLUGIN_ROOT, 'skills/validate/checks/validate.check-2-spec-compliance.md');
const STARTER = join(PLUGIN_ROOT, 'templates/domains/software/validate.yaml');

describe('Check 2 scope-expansion sub-finding', () => {
  test('check-2 prompt includes scope-expansion detection language', () => {
    const prompt = readFileSync(CHECK_2, 'utf8');
    assert.ok(
      /scope[- ]expansion/i.test(prompt),
      'Check 2 must document scope-expansion sub-finding'
    );
  });

  test('scope is pinned to source-manifest.files (not a new frontmatter field)', () => {
    const prompt = readFileSync(CHECK_2, 'utf8');
    assert.ok(
      prompt.includes('source-manifest.files'),
      'Must pin scope to source-manifest.files'
    );
    // Forbid introducing a new frontmatter field
    assert.ok(
      !/^\s*scope-files:/m.test(prompt) && !/^\s*declared-files:/m.test(prompt),
      'Must not introduce a new frontmatter field for scope'
    );
  });

  test('empty / absent source-manifest.files produces INFO note, not a scope-expansion finding', () => {
    const prompt = readFileSync(CHECK_2, 'utf8');
    assert.ok(
      /scope verification unavailable/i.test(prompt) || /no source-manifest/i.test(prompt),
      'Must handle missing/empty source-manifest.files with INFO note'
    );
  });

  test('software starter has no active check-3-charter-consistency entry', () => {
    const starter = readFileSync(STARTER, 'utf8');
    assert.ok(
      !/^\s*-\s*id:\s*validate\.check-3-charter-consistency/m.test(starter),
      'Starter must not register check-3-charter-consistency (comments mentioning the removed ID for orientation are allowed)'
    );
  });

  test('no-prior-commit diff fallback documented (SEC-3)', () => {
    const prompt = readFileSync(CHECK_2, 'utf8');
    // The plan calls for a fallback when no plan is available — diff against
    // the spec's last validated commit (or HEAD when no validated commit yet).
    assert.ok(
      /no plan|last[- ]validated|diff/i.test(prompt),
      'Check 2 must document the diff fallback path for SEC-3 (no-plan / no-prior-commit case)'
    );
  });
});
