/**
 * Tests for review-specs ADR + cross-cutting coverage migration.
 *
 * Spec: .context-index/specs/features/validation/check-set-restructure.spec.md
 * Plan-task: 3
 *
 * Verifies that ADR compliance (formerly validate Check 5) and cross-cutting
 * spec compliance (formerly validate Check 6) now live in /adev:review-specs
 * reviewer prompts.
 */

import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLUGIN_ROOT } from '../helpers.mjs';

const STRUCTURAL = join(PLUGIN_ROOT, 'skills/review-specs/structural-architect-prompt.md');
const CONSISTENCY = join(PLUGIN_ROOT, 'skills/review-specs/consistency-analyzer-prompt.md');

describe('Review-specs ADR and cross-cutting coverage', () => {
  test('structural-architect prompt includes ADR compliance scope', () => {
    const prompt = readFileSync(STRUCTURAL, 'utf8');
    assert.ok(
      prompt.includes('ADR') || prompt.includes('Architecture Decision'),
      'Structural architect must cover ADR compliance'
    );
    assert.ok(
      prompt.toLowerCase().includes('adr'),
      'Structural architect prompt must mention ADR explicitly'
    );
  });

  test('structural-architect prompt references .context-index/adrs/', () => {
    const prompt = readFileSync(STRUCTURAL, 'utf8');
    assert.ok(
      prompt.includes('.context-index/adrs'),
      'Structural architect must point at .context-index/adrs/ for ADR lookups'
    );
  });

  test('consistency-analyzer prompt includes cross-cutting spec compliance scope', () => {
    const prompt = readFileSync(CONSISTENCY, 'utf8');
    assert.ok(
      prompt.toLowerCase().includes('cross-cutting'),
      'Consistency analyzer must cover cross-cutting spec compliance'
    );
  });

  test('consistency-analyzer prompt references .context-index/specs/cross-cutting/', () => {
    const prompt = readFileSync(CONSISTENCY, 'utf8');
    assert.ok(
      prompt.includes('.context-index/specs/cross-cutting'),
      'Consistency analyzer must point at .context-index/specs/cross-cutting/ for cross-cutting lookups'
    );
  });
});
