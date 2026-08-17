// tests/specify-amend.test.mjs
//
// Task 3 of spec-amendment-artifacts.plan.md — lib/specify-amend.mjs scaffolder.
// Task 4 appends CLI-level cases (adev specify amend subcommand).
//
// Covers Behaviors 1-4 and the error cases: INVALID_AMENDMENT_BASE,
// INVALID_SPEC_PATH, INVALID_TARGET_REVISION, INVALID_AMENDMENT_DESCRIPTOR (SEC-1).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';

import { createTempDir, cleanupTempDir } from './helpers.mjs';
import { amendSpec } from '../lib/specify-amend.mjs';
import { currentState, requireGate } from '../lib/lifecycle-state.mjs';

function seedRoot(root) {
  mkdirSync(join(root, '.context-index'), { recursive: true });
  writeFileSync(join(root, '.context-index', 'manifest.yaml'), 'lifecycle:\n  gate_mode: advisory\n', 'utf8');
  return root;
}

function writeBase(root, rel, fields) {
  const abs = join(root, rel);
  mkdirSync(join(abs, '..'), { recursive: true });
  const fm = Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join('\n');
  writeFileSync(abs, `---\n${fm}\n---\n\n# Base Spec\n\nBody.\n`, 'utf8');
  return abs;
}

const BASE_REL = '.context-index/specs/cross-cutting/checkout.spec.md';

function baseFields() {
  return { charter: 'cross-cutting', kind: 'behavioral', status: 'validated', revision: '3', 'charter-revision': '1' };
}

function readBaseLog(root) {
  const dir = join(root, '.context-index', 'lifecycle-state');
  if (!existsSync(dir)) return [];
  const out = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.jsonl')) continue;
    for (const line of readFileSync(join(dir, f), 'utf8').split('\n')) {
      if (line.trim()) out.push(JSON.parse(line));
    }
  }
  return out;
}

test('amendSpec: happy path — co-located file, frontmatter, spec_amended on base log', () => {
  const root = seedRoot(createTempDir());
  try {
    writeBase(root, BASE_REL, baseFields());
    const baseBefore = readFileSync(join(root, BASE_REL), 'utf8');

    const result = amendSpec({ specPath: BASE_REL, projectRoot: root, descriptor: 'drop-coupon' });

    // Behavior 1: co-located naming <base-stem>-rev-<target>-<descriptor>.spec.md
    const expectedRel = '.context-index/specs/cross-cutting/checkout-rev-4-drop-coupon.spec.md';
    assert.equal(result.amendmentPath, expectedRel);
    assert.ok(existsSync(join(root, expectedRel)), 'amendment file created on disk');

    // Behavior 2 + 3: frontmatter
    const text = readFileSync(join(root, expectedRel), 'utf8');
    assert.match(text, /amends:\s*\.context-index\/specs\/cross-cutting\/checkout\.spec\.md/);
    assert.match(text, /target-revision:\s*4/);
    assert.match(text, /kind:\s*behavioral/);        // inherited
    assert.match(text, /revision:\s*1/);
    assert.match(text, /status:\s*review-pending/);
    assert.ok(text.endsWith('\n'));
    assert.equal(result.targetRevision, 4);          // base.revision (3) + 1

    // Behavior 4: spec_amended on the BASE log
    const evs = readBaseLog(root).filter(e => e.event === 'spec_amended');
    assert.equal(evs.length, 1);
    assert.equal(evs[0].amendment_path, expectedRel);
    assert.equal(evs[0].target_revision, 4);
    assert.equal(evs[0].amendment_slug, 'checkout-rev-4-drop-coupon');

    // base spec is NOT modified
    assert.equal(readFileSync(join(root, BASE_REL), 'utf8'), baseBefore);
  } finally {
    cleanupTempDir(root);
  }
});

test('amendSpec: explicit target-revision override (must be > base.revision)', () => {
  const root = seedRoot(createTempDir());
  try {
    writeBase(root, BASE_REL, baseFields());
    const result = amendSpec({ specPath: BASE_REL, projectRoot: root, descriptor: 'big-jump', targetRevision: 7 });
    assert.equal(result.targetRevision, 7);
    assert.ok(existsSync(join(root, '.context-index/specs/cross-cutting/checkout-rev-7-big-jump.spec.md')));
  } finally {
    cleanupTempDir(root);
  }
});

test('amendSpec: kind override is honored', () => {
  const root = seedRoot(createTempDir());
  try {
    writeBase(root, BASE_REL, baseFields());
    const result = amendSpec({ specPath: BASE_REL, projectRoot: root, descriptor: 'refac', kind: 'refactor' });
    const text = readFileSync(join(root, result.amendmentPath), 'utf8');
    assert.match(text, /kind:\s*refactor/);
  } finally {
    cleanupTempDir(root);
  }
});

test('amendSpec: INVALID_AMENDMENT_BASE when base does not exist', () => {
  const root = seedRoot(createTempDir());
  try {
    assert.throws(
      () => amendSpec({ specPath: '.context-index/specs/cross-cutting/nope.spec.md', projectRoot: root, descriptor: 'x' }),
      (e) => e.code === 'INVALID_AMENDMENT_BASE',
    );
  } finally {
    cleanupTempDir(root);
  }
});

test('amendSpec: INVALID_TARGET_REVISION when override <= base.revision', () => {
  const root = seedRoot(createTempDir());
  try {
    writeBase(root, BASE_REL, baseFields()); // revision 3
    assert.throws(
      () => amendSpec({ specPath: BASE_REL, projectRoot: root, descriptor: 'x', targetRevision: 3 }),
      (e) => e.code === 'INVALID_TARGET_REVISION',
    );
    assert.throws(
      () => amendSpec({ specPath: BASE_REL, projectRoot: root, descriptor: 'x', targetRevision: 2 }),
      (e) => e.code === 'INVALID_TARGET_REVISION',
    );
  } finally {
    cleanupTempDir(root);
  }
});

test('amendSpec: INVALID_SPEC_PATH when base path escapes project root', () => {
  const root = seedRoot(createTempDir());
  try {
    assert.throws(
      () => amendSpec({ specPath: '../../etc/passwd.spec.md', projectRoot: root, descriptor: 'x' }),
      (e) => e.code === 'INVALID_SPEC_PATH',
    );
  } finally {
    cleanupTempDir(root);
  }
});

test('amendSpec: INVALID_AMENDMENT_DESCRIPTOR for illegal / traversal descriptors (SEC-1)', () => {
  const root = seedRoot(createTempDir());
  try {
    writeBase(root, BASE_REL, baseFields());
    for (const bad of ['../evil', 'foo/bar', 'Foo_Bar', '', 'has space', '-leading', 'trailing-', 'a--b', 'UPPER']) {
      assert.throws(
        () => amendSpec({ specPath: BASE_REL, projectRoot: root, descriptor: bad }),
        (e) => e.code === 'INVALID_AMENDMENT_DESCRIPTOR',
        `descriptor ${JSON.stringify(bad)} must be rejected`,
      );
    }
    // no amendment file should have been created
    const files = readdirSync(join(root, '.context-index/specs/cross-cutting'));
    assert.deepEqual(files.filter(f => f.includes('-rev-')), []);
  } finally {
    cleanupTempDir(root);
  }
});

test('amendSpec: valid kebab descriptor accepted', () => {
  const root = seedRoot(createTempDir());
  try {
    writeBase(root, BASE_REL, baseFields());
    const result = amendSpec({ specPath: BASE_REL, projectRoot: root, descriptor: 'drop-coupon-v2' });
    assert.ok(existsSync(join(root, result.amendmentPath)));
  } finally {
    cleanupTempDir(root);
  }
});

// ── adev-plugin-gkfv.1 ─────────────────────────────────────────────────────
//
// `amendSpec` used to emit `spec_amended` on the BASE log and nothing else, so
// the amendment had no lifecycle log of its own and no `specify` step. Under
// strict gate mode `requireGate(state, "review")` on the amendment therefore
// read `{status: "missing"}` and hard-blocked — making every amendment
// unreviewable, which contradicts the scaffold's own promise that the artifact
// "is reviewed, planned, and validated on its own lifecycle".
//
// Reviewing against the BASE path is not the alternative: /adev:review-specs
// rewrites the `status:` frontmatter of whatever --spec it is handed, so that
// would flip the immutable validated base to review-passed/review-blocked.

/** Read one spec's log by slug, so base and amendment logs stay distinguishable. */
function readLogBySlug(root, slug) {
  const p = join(root, '.context-index', 'lifecycle-state', `${slug}.jsonl`);
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
}

test('amendSpec: emits the specify step pair on the AMENDMENT own log (gkfv.1)', () => {
  const root = seedRoot(createTempDir());
  try {
    writeBase(root, BASE_REL, baseFields());
    const result = amendSpec({ specPath: BASE_REL, projectRoot: root, descriptor: 'drop-coupon' });

    const events = readLogBySlug(root, result.amendmentSlug);
    assert.ok(events.length > 0, 'the amendment must have a lifecycle log of its own');

    const specify = events.filter(e => e.step === 'specify');
    assert.equal(specify.length, 2, `expected exactly 2 specify events, got ${specify.length}`);

    // Ordering matters: a terminal with no matching `started` is precisely what
    // ORPHAN_STEP_TERMINAL (lifecycle-event-log rev-5 BEH-7) will reject.
    assert.equal(specify[0].event, 'lifecycle_step', 'first specify event must open the step');
    assert.equal(specify[0].status, 'started');
    assert.equal(specify[1].event, 'step_completed', 'second specify event must close the step');
    assert.equal(specify[1].verdict, 'PASS', 'terminal must carry an explicit verdict');
  } finally {
    cleanupTempDir(root);
  }
});

test('amendSpec: specify events do NOT land on the base log (gkfv.1)', () => {
  const root = seedRoot(createTempDir());
  try {
    writeBase(root, BASE_REL, baseFields());
    const result = amendSpec({ specPath: BASE_REL, projectRoot: root, descriptor: 'drop-coupon' });

    const baseEvents = readLogBySlug(root, 'checkout');
    assert.ok(
      baseEvents.some(e => e.event === 'spec_amended'),
      'spec_amended still belongs on the base log',
    );
    assert.equal(
      baseEvents.filter(e => e.step === 'specify').length, 0,
      'the base spec was not re-specified — its log must not gain specify events',
    );
    // And the amendment log must not carry spec_amended.
    const amendEvents = readLogBySlug(root, result.amendmentSlug);
    assert.equal(
      amendEvents.filter(e => e.event === 'spec_amended').length, 0,
      'spec_amended is a base-log event only',
    );
  } finally {
    cleanupTempDir(root);
  }
});

test('amendSpec: the amendment passes the review gate under strict mode (gkfv.1)', () => {
  const root = seedRoot(createTempDir());
  try {
    writeBase(root, BASE_REL, baseFields());
    const result = amendSpec({ specPath: BASE_REL, projectRoot: root, descriptor: 'drop-coupon' });

    // The end-to-end property this issue is about.
    const state = currentState(root, result.amendmentPath);
    assert.equal(state.steps?.specify?.status, 'completed');
    assert.equal(state.steps?.specify?.verdict, 'PASS');
    assert.doesNotThrow(
      () => requireGate(state, 'review', { mode: 'strict' }),
      'a freshly scaffolded amendment must be reviewable without a manual event fixup',
    );
  } finally {
    cleanupTempDir(root);
  }
});
