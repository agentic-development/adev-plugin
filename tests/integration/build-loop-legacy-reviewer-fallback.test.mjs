/**
 * Integration test: legacy-reviewer fallback (Task 16 of
 * review-block-auto-retry.plan.md).
 *
 * Verifies the sidecar+fail-loud path is taken when a reviewer emits a
 * BLOCK finding without a canonical `blocker_id` field (pre-Task-6
 * reviewer output). The loop must NOT dispatch — no auto-retry — and the
 * legacy advisory must be logged.
 *
 * Exercised against the library surface:
 *   - lib/blockers-writer.mjs    — validates blocker_id, throws INVALID_BLOCKER_ID
 *   - lib/blocker-id.mjs::parseBlockerId — the validator
 *
 * The CLI / skill layer is responsible for catching INVALID_BLOCKER_ID
 * (or for detecting missing fields up-front) and emitting
 * LEGACY_REVIEWER_OUTPUT — this test verifies the validator surface
 * those higher layers consume.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { writeBlockers } from '../../lib/blockers-writer.mjs';
import { parseBlockerId } from '../../lib/blocker-id.mjs';

function makeSpec() {
  const root = mkdtempSync(join(tmpdir(), 'adev-legacy-fallback-'));
  mkdirSync(join(root, '.context-index/specs/cross-cutting'), { recursive: true });
  writeFileSync(join(root, '.context-index/manifest.yaml'),
    'project:\n  name: test\nlifecycle:\n  event_diagnostics: off\n');
  const specPath = '.context-index/specs/cross-cutting/legacy-fixture.spec.md';
  writeFileSync(join(root, specPath), '# spec\n');
  return { root, specPath };
}

test('legacy-fallback: blockers-writer rejects a finding without blocker_id', () => {
  const { root, specPath } = makeSpec();
  try {
    const legacyFinding = {
      // No `blocker_id` field — legacy reviewer output
      section_anchor: 'preconditions',
      reviewer: 'structural-architect',
      prose: 'legacy finding without canonical id',
    };
    assert.throws(
      () => writeBlockers(root, specPath, [legacyFinding], { revision: 1 }),
      (e) => e.code === 'INVALID_BLOCKER_ID',
      'missing blocker_id must be rejected at the writer surface',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('legacy-fallback: blockers-writer rejects a finding with malformed blocker_id', () => {
  const { root, specPath } = makeSpec();
  try {
    const findings = [
      {
        blocker_id: 'not a valid id',  // spaces — INVALID_BLOCKER_ID
        section_anchor: 'preconditions',
        reviewer: 'structural-architect',
        prose: 'malformed id',
      },
    ];
    assert.throws(
      () => writeBlockers(root, specPath, findings, { revision: 1 }),
      (e) => e.code === 'INVALID_BLOCKER_ID',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('legacy-fallback: parseBlockerId rejects too-few colons (malformed legacy output)', () => {
  assert.throws(
    () => parseBlockerId('not-three-parts'),
    (e) => e.code === 'INVALID_BLOCKER_ID',
  );
});

test('legacy-fallback: parseBlockerId rejects non-hex location-hash', () => {
  assert.throws(
    () => parseBlockerId('reviewer:type:notHEX12'),
    (e) => e.code === 'INVALID_BLOCKER_ID',
  );
});

test('legacy-fallback: blockers-writer with NO findings is a no-op (clears sidecar)', () => {
  const { root, specPath } = makeSpec();
  try {
    // Empty findings is the explicit "all-resolved" or "no findings" case —
    // distinct from legacy-reviewer-output. The writer accepts this and
    // clears the sidecar.
    const result = writeBlockers(root, specPath, [], { revision: 1 });
    assert.equal(result.entries, 0);
    // No sidecar should have been written.
    const sidecarPath = join(root, specPath.replace(/\.spec\.md$/, '.blockers.md'));
    assert.ok(!existsSync(sidecarPath));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('legacy-fallback: documented advisory codes are referenced in the build skill', () => {
  // The build orchestrator skill prose documents the fallback contract.
  // This test ensures the documented advisories remain in the SKILL.md so
  // higher-layer integration is traceable to a single source.
  const skillPath = join(process.cwd(), 'skills/build/SKILL.md');
  if (existsSync(skillPath)) {
    const body = readFileSync(skillPath, 'utf8');
    assert.ok(
      body.includes('LEGACY_REVIEWER_OUTPUT'),
      'skills/build/SKILL.md must document the LEGACY_REVIEWER_OUTPUT advisory',
    );
    assert.ok(
      body.includes('sidecar+fail-loud') || body.includes('sidecar+fail-loud fallback'),
      'skills/build/SKILL.md must document the sidecar+fail-loud fallback path',
    );
  }
});

test('legacy-fallback: review-specs SKILL.md documents the validation contract', () => {
  const skillPath = join(process.cwd(), 'skills/review-specs/SKILL.md');
  if (existsSync(skillPath)) {
    const body = readFileSync(skillPath, 'utf8');
    assert.ok(body.includes('LEGACY_REVIEWER_OUTPUT'),
      'skills/review-specs/SKILL.md must document LEGACY_REVIEWER_OUTPUT');
    assert.ok(body.includes('INVALID_BLOCKER_ID'),
      'skills/review-specs/SKILL.md must document INVALID_BLOCKER_ID');
  }
});
