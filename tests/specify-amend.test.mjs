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
