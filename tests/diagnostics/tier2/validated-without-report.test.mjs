/**
 * Producer-level tests for lib/diagnostics/tier2/validated-without-report.mjs.
 *
 * Invariant under test (issue-563): a spec declaring `status: validated`
 * MUST have a co-located `<spec-stem>.validate.md`. The status is otherwise
 * self-asserted, and downstream tooling treats it as ground truth.
 *
 * Routing rationale lives in ADR-0010 decision-flow step 5 (artifact-level
 * verifiable invariant → diagnostics.yaml, tier 2 because it stats a
 * sibling file).
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  run,
  validationReportPathFor,
} from '../../../lib/diagnostics/tier2/validated-without-report.mjs';
import { SPEC_STATUSES } from '../../../lib/spec-status.mjs';

const DIAGNOSTIC_ID = 'adev/validated-without-report';

/**
 * Create a throwaway project containing one spec (and optionally its
 * validation report). Returns `{ dir, spec, report }` with absolute paths.
 */
function makeSpec({ status, withReport = false, name = 'thing', body = '# thing\n' }) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'adev-vwr-')));
  const specDir = join(dir, '.context-index', 'specs', 'features', 'm');
  mkdirSync(specDir, { recursive: true });
  const spec = join(specDir, `${name}.spec.md`);
  const frontmatter = status === null ? '' : `---\ncharter: m\nstatus: ${status}\n---\n`;
  writeFileSync(spec, frontmatter + body);
  const report = join(specDir, `${name}.validate.md`);
  if (withReport) {
    writeFileSync(report, '---\nverdict: PASS\n---\n# validation\n');
  }
  return { dir, spec, report };
}

function cleanup(dir) {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

// ── Enum index lock ─────────────────────────────────────────────────────────

test('SPEC_STATUSES[5] is still "validated" (the producer indexes the enum)', () => {
  // The producer derives its trigger status as SPEC_STATUSES[5] rather than
  // inlining the literal (enforced by tests/lib/spec-status-no-bare-literals).
  // If the enum is ever reordered, this lock fails loudly instead of the
  // diagnostic silently watching the wrong status.
  assert.equal(SPEC_STATUSES[5], 'validated');
});

// ── The defect: validated with no backing report ────────────────────────────

test('fires error when status is validated and no co-located .validate.md exists', () => {
  const { dir, spec } = makeSpec({ status: 'validated' });
  try {
    const result = run({ spec, projectRoot: dir });
    assert.equal(result.fired, true, 'must fire on a self-asserted validated status');
    assert.equal(result.id, DIAGNOSTIC_ID);
    assert.equal(result.severity, 'error');
    assert.equal(result.citation, spec, 'citation must be the absolute spec path');
  } finally {
    cleanup(dir);
  }
});

test('message names the spec path, the expected report path, and both remedies', () => {
  const { dir, spec } = makeSpec({ status: 'validated', name: 'lonely' });
  try {
    const result = run({ spec, projectRoot: dir });
    assert.equal(result.fired, true);
    const relSpec = '.context-index/specs/features/m/lonely.spec.md';
    const relReport = '.context-index/specs/features/m/lonely.validate.md';
    assert.ok(
      result.message.includes(relSpec),
      `message must name the spec path; got: ${result.message}`,
    );
    assert.ok(
      result.message.includes(relReport),
      `message must name the expected report path; got: ${result.message}`,
    );
    assert.match(result.message, /adev:validate/, 'message must name the produce-the-report remedy');
    assert.match(result.message, /status/, 'message must name the downgrade-the-status remedy');
  } finally {
    cleanup(dir);
  }
});

test('message stays free of leading-slash tokens the engine would redact', () => {
  // normaliseMessage() rewrites whitespace-preceded `/`-rooted tokens to
  // <external-path-redacted>. A message written as "/adev:validate" loses
  // its remedy in the surfaced output.
  const { dir, spec } = makeSpec({ status: 'validated' });
  try {
    const result = run({ spec, projectRoot: dir });
    assert.doesNotMatch(
      result.message,
      /(^|\s)\//,
      `message must not contain a whitespace-preceded absolute-looking token; got: ${result.message}`,
    );
  } finally {
    cleanup(dir);
  }
});

// ── Does NOT fire when the report exists ────────────────────────────────────

test('does not fire when status is validated and the report exists', () => {
  const { dir, spec } = makeSpec({ status: 'validated', withReport: true });
  try {
    assert.deepEqual(run({ spec, projectRoot: dir }), { fired: false });
  } finally {
    cleanup(dir);
  }
});

// ── Does NOT fire for any other status ──────────────────────────────────────

for (const status of SPEC_STATUSES.filter((s) => s !== 'validated')) {
  test(`does not fire for status: ${status} (no report present)`, () => {
    const { dir, spec } = makeSpec({ status });
    try {
      assert.deepEqual(
        run({ spec, projectRoot: dir }),
        { fired: false },
        `status ${status} must never trip the validated-without-report invariant`,
      );
    } finally {
      cleanup(dir);
    }
  });
}

test('does not fire for an illegal status value (status-enum-legal owns that)', () => {
  const { dir, spec } = makeSpec({ status: 'definitely-not-a-real-status' });
  try {
    assert.deepEqual(run({ spec, projectRoot: dir }), { fired: false });
  } finally {
    cleanup(dir);
  }
});

test('does not fire for a status that merely contains "validated" as a substring', () => {
  const { dir, spec } = makeSpec({ status: 'not-validated' });
  try {
    assert.deepEqual(run({ spec, projectRoot: dir }), { fired: false });
  } finally {
    cleanup(dir);
  }
});

// ── Quoted / commented scalars still resolve to `validated` ─────────────────

test('fires when the status scalar is quoted', () => {
  const { dir, spec } = makeSpec({ status: '"validated"' });
  try {
    const result = run({ spec, projectRoot: dir });
    assert.equal(result.fired, true, 'quoted scalars must resolve to the same status');
  } finally {
    cleanup(dir);
  }
});

// ── Malformed / non-spec inputs stay silent (other producers own them) ──────

test('does not fire when frontmatter is absent (frontmatter-present owns that)', () => {
  const { dir, spec } = makeSpec({ status: null, body: '# no frontmatter\nstatus: validated\n' });
  try {
    assert.deepEqual(run({ spec, projectRoot: dir }), { fired: false });
  } finally {
    cleanup(dir);
  }
});

test('does not fire when the frontmatter block is unterminated', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'adev-vwr-')));
  try {
    const specDir = join(dir, 'specs');
    mkdirSync(specDir, { recursive: true });
    const spec = join(specDir, 'broken.spec.md');
    writeFileSync(spec, '---\nstatus: validated\n# never closed\n');
    assert.deepEqual(run({ spec, projectRoot: dir }), { fired: false });
  } finally {
    cleanup(dir);
  }
});

test('does not fire when frontmatter has no status key', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'adev-vwr-')));
  try {
    const specDir = join(dir, 'specs');
    mkdirSync(specDir, { recursive: true });
    const spec = join(specDir, 'nostatus.spec.md');
    writeFileSync(spec, '---\ncharter: m\n---\n# body\n');
    assert.deepEqual(run({ spec, projectRoot: dir }), { fired: false });
  } finally {
    cleanup(dir);
  }
});

test('does not fire for a non-.spec.md artifact even when it declares validated', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'adev-vwr-')));
  try {
    const specDir = join(dir, 'specs');
    mkdirSync(specDir, { recursive: true });
    const charter = join(specDir, 'charter.md');
    writeFileSync(charter, '---\nstatus: validated\n---\n# charter\n');
    assert.deepEqual(run({ spec: charter, projectRoot: dir }), { fired: false });
  } finally {
    cleanup(dir);
  }
});

test('returns { fired: false } when ctx.spec is missing or does not exist', () => {
  assert.deepEqual(run({}), { fired: false });
  assert.deepEqual(run({ spec: null }), { fired: false });
  assert.deepEqual(run({ spec: '/nonexistent/path/to.spec.md' }), { fired: false });
});

test('falls back to the absolute path in the message when projectRoot is absent', () => {
  const { dir, spec } = makeSpec({ status: 'validated' });
  try {
    const result = run({ spec });
    assert.equal(result.fired, true);
    assert.ok(result.message.includes(spec), 'message must still name the spec');
  } finally {
    cleanup(dir);
  }
});

// ── validationReportPathFor (the exported convention owner, SA-13) ──────────

test("validationReportPathFor maps a spec path to its co-located report (+1 more contract assertions)", () => {
  // validationReportPathFor maps a spec path to its co-located report
  assert.equal(validationReportPathFor('/a/b/c.spec.md'), '/a/b/c.validate.md');

  // validationReportPathFor returns null for non-spec inputs
  assert.equal(validationReportPathFor('/a/b/c.md'), null);
  assert.equal(validationReportPathFor('/a/b/c.validate.md'), null);
  assert.equal(validationReportPathFor(null), null);
  assert.equal(validationReportPathFor(42), null);
});
