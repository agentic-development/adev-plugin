/**
 * Tests for the Step 5/6 ("Collect and Consolidate Findings" / "6b-bis. Write
 * the `.blockers.md` sidecar") consolidation data path documented in
 * `skills/review-specs/SKILL.md`.
 *
 * That step is pure prose — there is no dedicated lib function named
 * "consolidate findings"; the skill's own dispatched agent is documented to
 * (1) construct each finding's canonical `blocker_id` via
 * `buildBlockerId()` (lib/blocker-id.mjs) from the reviewer-supplied
 * `finding_type` + `section_anchor`, while carrying any reviewer-supplied
 * `finding_class` / `remedy_ref` onto that same entry UNMODIFIED, and then
 * (2) hand the resulting array to `writeBlockers` (lib/blockers-writer.mjs),
 * which owns the actual default/reject decision for `finding_class`
 * (Task 2 — already tested in tests/lib/blockers-writer.test.mjs).
 *
 * This file does NOT re-test `writeBlockers`'s internal validation/rejection
 * logic (closed taxonomy, unsafe-scalar refusal, remedy_ref handling — see
 * Task 2's suite for that). It instead proves the *documented consolidation
 * step itself* does not strip `finding_class` before that call, by building
 * entries the way Step 6b-bis describes (finding_type/section_anchor in,
 * blocker_id constructed, finding_class copied across unmodified) and
 * asserting what lands in the sidecar.
 *
 * Spec: .context-index/specs/cross-cutting/review-block-auto-retry.spec.md
 *   (BEH-1: reviewer output may optionally carry `finding_class`; present ->
 *    flows through unmodified; absent -> Task 2's writeBlockers defaults it
 *    to `defect`.)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { writeBlockers } from '../../lib/blockers-writer.mjs';
import { buildBlockerId } from '../../lib/blocker-id.mjs';

function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), 'adev-finding-class-consolidation-'));
  mkdirSync(join(root, '.context-index/specs/cross-cutting'), { recursive: true });
  const specPath = '.context-index/specs/cross-cutting/sample.spec.md';
  writeFileSync(join(root, specPath), '# Sample\n');
  return { root, specPath };
}

/**
 * Simulates the Step 6b-bis aggregator: takes a raw reviewer finding
 * (finding_type + section_anchor, NOT blocker_id) and builds the entry
 * `writeBlockers` expects, per the SKILL.md-documented contract — attaching
 * a constructed `blocker_id` while copying `finding_class`/`remedy_ref`
 * across verbatim when the reviewer supplied them, and omitting the key
 * entirely (never inventing a value) when the reviewer did not.
 */
function consolidateFinding(raw) {
  const entry = {
    blocker_id: buildBlockerId({
      reviewer: raw.reviewer,
      type: raw.finding_type,
      sectionAnchor: raw.section_anchor,
      findingText: raw.prose,
    }),
    section_anchor: raw.section_anchor,
    reviewer: raw.reviewer,
    prose: raw.prose,
  };
  if (Object.prototype.hasOwnProperty.call(raw, 'finding_class')) {
    entry.finding_class = raw.finding_class;
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'remedy_ref')) {
    entry.remedy_ref = raw.remedy_ref;
  }
  return entry;
}

test('consolidation step carries a reviewer-supplied finding_class through unmodified to writeBlockers', () => {
  const { root, specPath } = makeRepo();
  try {
    const rawFinding = {
      reviewer: 'structural-architect',
      finding_type: 'missing-precondition',
      section_anchor: 'preconditions',
      prose: 'No precondition documents the sidecar invariant.',
      finding_class: 'decision',
    };
    const entry = consolidateFinding(rawFinding);
    assert.equal(entry.finding_class, 'decision', 'consolidation must not alter a present finding_class');

    const result = writeBlockers(root, specPath, [entry], { revision: 1 });
    const text = readFileSync(join(root, result.sidecarPath), 'utf8');
    assert.match(text, /finding_class: decision/);
    assert.ok(
      !result.advisories.some((a) => a.code === 'FINDING_CLASS_DEFAULTED' || a.code === 'FINDING_CLASS_REJECTED'),
      'a reviewer-supplied, valid finding_class must survive consolidation without triggering a default/reject advisory',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a BLOCK finding missing finding_class defaults to defect once consolidated and handed to writeBlockers', () => {
  const { root, specPath } = makeRepo();
  try {
    // Current-format reviewer output that simply never populated finding_class
    // (e.g. a reviewer emitting only the mandatory fields for a defect).
    const rawFinding = {
      reviewer: 'security-reviewer',
      finding_type: 'path-traversal',
      section_anchor: 'sec-1',
      prose: 'Unvalidated path segment reaches the filesystem.',
    };
    const entry = consolidateFinding(rawFinding);
    assert.ok(
      !Object.prototype.hasOwnProperty.call(entry, 'finding_class'),
      'consolidation must not invent a finding_class key when the reviewer supplied none',
    );

    const result = writeBlockers(root, specPath, [entry], { revision: 1 });
    const text = readFileSync(join(root, result.sidecarPath), 'utf8');
    assert.match(text, /finding_class: defect/);
    assert.ok(result.advisories.some((a) => a.code === 'FINDING_CLASS_DEFAULTED'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('legacy pre-amendment reviewer output (no finding_class field anywhere) is treated identically to a present-but-absent field', () => {
  const { root, specPath } = makeRepo();
  try {
    // Simulates output produced before BEH-1 existed: the raw finding object
    // has no notion of finding_class/remedy_ref at all, not even undefined.
    const legacyRawFinding = {
      reviewer: 'consistency-analyzer',
      finding_type: 'terminology-drift',
      section_anchor: 'glossary',
      prose: 'Term "blocker" used inconsistently with the spec glossary.',
    };
    assert.deepEqual(Object.keys(legacyRawFinding).sort(), ['finding_type', 'prose', 'reviewer', 'section_anchor']);

    const entry = consolidateFinding(legacyRawFinding);
    const result = writeBlockers(root, specPath, [entry], { revision: 1 });
    const text = readFileSync(join(root, result.sidecarPath), 'utf8');
    assert.match(text, /finding_class: defect/);
    assert.ok(result.advisories.some((a) => a.code === 'FINDING_CLASS_DEFAULTED'));
    assert.equal(result.entries, 1, 'legacy finding must still be written, not dropped');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
