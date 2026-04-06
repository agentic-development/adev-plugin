import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createTempDir, cleanupTempDir, writeFixture } from '../helpers.mjs';
import { writeHandoff, verifyHandoff } from '../../skills/write-test/write-handoff.mjs';

test('writes handoff block to correct path', async (t) => {
  const dir = await createTempDir();
  t.after(() => cleanupTempDir(dir));
  const testFile = join(dir, 'tests/foo.test.mjs');
  await writeFixture(dir, 'tests/foo.test.mjs', 'test content here');
  await writeHandoff({
    packetsDir: join(dir, 'packets'),
    slug: 'foo-feature',
    spec: 'specs/foo.md',
    testFiles: [testFile],
    verificationCommand: 'node --test tests/foo.test.mjs',
    redStateEvidence: 'AssertionError: expected undefined to equal 42',
    constraints: ['assertion on line 3 must remain'],
    mockingBoundaries: [],
    preexistingCheck: 'skipped (clean tree)',
    gamingCheck: 'passed',
    framework: 'node:test',
  });
  assert.ok(existsSync(join(dir, 'packets', 'foo-feature-tests.md')));
});

test('handoff block contains all required fields', async (t) => {
  const dir = await createTempDir();
  t.after(() => cleanupTempDir(dir));
  const testFile = join(dir, 'tests/bar.test.mjs');
  await writeFixture(dir, 'tests/bar.test.mjs', 'expect(1).toBe(1);');
  await writeHandoff({
    packetsDir: join(dir, 'packets'),
    slug: 'bar-feature',
    spec: 'specs/bar.md',
    testFiles: [testFile],
    verificationCommand: 'node --test tests/bar.test.mjs',
    redStateEvidence: 'Test failed',
    constraints: [],
    mockingBoundaries: [],
    preexistingCheck: 'passed',
    gamingCheck: 'passed',
    framework: 'node:test',
  });
  const content = readFileSync(join(dir, 'packets', 'bar-feature-tests.md'), 'utf-8');
  assert.ok(content.includes('locked: true'));
  assert.ok(content.includes('hash:'));
  assert.ok(content.includes('preexisting_check:'));
  assert.ok(content.includes('gaming_check:'));
  assert.ok(content.includes('## Original Test File Contents'));
  assert.ok(content.includes('expect(1).toBe(1);'));
  assert.ok(content.includes('## Verification Command'));
  assert.ok(content.includes('## RED State Evidence'));
  assert.ok(content.includes('## Locked Constraints'));
});

test('hash is SHA-256 of test files concatenated in path-alphabetical order', async (t) => {
  const dir = await createTempDir();
  t.after(() => cleanupTempDir(dir));
  const { createHash } = await import('node:crypto');
  const contentA = 'file a content';
  const contentB = 'file b content';
  await writeFixture(dir, 'tests/a.test.mjs', contentA);
  await writeFixture(dir, 'tests/b.test.mjs', contentB);
  const filesA = [join(dir, 'tests/a.test.mjs'), join(dir, 'tests/b.test.mjs')];
  const filesB = [join(dir, 'tests/b.test.mjs'), join(dir, 'tests/a.test.mjs')]; // different order
  const r1 = await writeHandoff({ packetsDir: join(dir, 'p1'), slug: 's1', spec: 'x', testFiles: filesA, verificationCommand: 'x', redStateEvidence: 'x', constraints: [], mockingBoundaries: [], preexistingCheck: 'passed', gamingCheck: 'passed', framework: 'node:test' });
  const r2 = await writeHandoff({ packetsDir: join(dir, 'p2'), slug: 's2', spec: 'x', testFiles: filesB, verificationCommand: 'x', redStateEvidence: 'x', constraints: [], mockingBoundaries: [], preexistingCheck: 'passed', gamingCheck: 'passed', framework: 'node:test' });
  // Must produce same hash regardless of input order (sorted alphabetically)
  const content1 = readFileSync(join(dir, 'p1', 's1-tests.md'), 'utf-8');
  const content2 = readFileSync(join(dir, 'p2', 's2-tests.md'), 'utf-8');
  const hash1 = content1.match(/^hash: (.+)$/m)?.[1];
  const hash2 = content2.match(/^hash: (.+)$/m)?.[1];
  assert.equal(hash1, hash2);
});

test('overwrites existing packet and records previous_hash', async (t) => {
  const dir = await createTempDir();
  t.after(() => cleanupTempDir(dir));
  await writeFixture(dir, 'tests/x.test.mjs', 'v1 content');
  const baseArgs = { packetsDir: join(dir, 'packets'), slug: 'x', spec: 's', testFiles: [join(dir, 'tests/x.test.mjs')], verificationCommand: 'c', redStateEvidence: 'e', constraints: [], mockingBoundaries: [], preexistingCheck: 'passed', gamingCheck: 'passed', framework: 'node:test' };
  await writeHandoff(baseArgs);
  // Change content and overwrite
  await writeFixture(dir, 'tests/x.test.mjs', 'v2 content');
  await writeHandoff(baseArgs);
  const content = readFileSync(join(dir, 'packets', 'x-tests.md'), 'utf-8');
  assert.ok(content.includes('previous_hash:'));
});

test('creates packets directory if absent', async (t) => {
  const dir = await createTempDir();
  t.after(() => cleanupTempDir(dir));
  await writeFixture(dir, 'tests/y.test.mjs', 'content');
  const newPacketsDir = join(dir, 'does', 'not', 'exist');
  await writeHandoff({ packetsDir: newPacketsDir, slug: 'y', spec: 's', testFiles: [join(dir, 'tests/y.test.mjs')], verificationCommand: 'c', redStateEvidence: 'e', constraints: [], mockingBoundaries: [], preexistingCheck: 'passed', gamingCheck: 'passed', framework: 'node:test' });
  assert.ok(existsSync(join(newPacketsDir, 'y-tests.md')));
});

test('RED State Evidence redacts common secret patterns', async (t) => {
  const dir = await createTempDir();
  t.after(() => cleanupTempDir(dir));
  await writeFixture(dir, 'tests/z.test.mjs', 'content');
  await writeHandoff({ packetsDir: join(dir, 'packets'), slug: 'z', spec: 's', testFiles: [join(dir, 'tests/z.test.mjs')], verificationCommand: 'c', redStateEvidence: 'Error: PASSWORD=supersecret TOKEN=abc123', constraints: [], mockingBoundaries: [], preexistingCheck: 'passed', gamingCheck: 'passed', framework: 'node:test' });
  const content = readFileSync(join(dir, 'packets', 'z-tests.md'), 'utf-8');
  assert.ok(!content.includes('supersecret'));
  assert.ok(!content.includes('abc123'));
});

test('verifyHandoff returns PASS when hash matches', async (t) => {
  const dir = await createTempDir();
  t.after(() => cleanupTempDir(dir));
  await writeFixture(dir, 'tests/v.test.mjs', 'stable content');
  const packetPath = join(dir, 'packets', 'v-tests.md');
  await writeHandoff({ packetsDir: join(dir, 'packets'), slug: 'v', spec: 's', testFiles: [join(dir, 'tests/v.test.mjs')], verificationCommand: 'c', redStateEvidence: 'e', constraints: [], mockingBoundaries: [], preexistingCheck: 'passed', gamingCheck: 'passed', framework: 'node:test' });
  const result = await verifyHandoff(packetPath);
  assert.equal(result.status, 'PASS');
});

test('verifyHandoff returns HASH_MISMATCH when file content changed', async (t) => {
  const dir = await createTempDir();
  t.after(() => cleanupTempDir(dir));
  await writeFixture(dir, 'tests/w.test.mjs', 'original content');
  const packetPath = join(dir, 'packets', 'w-tests.md');
  await writeHandoff({ packetsDir: join(dir, 'packets'), slug: 'w', spec: 's', testFiles: [join(dir, 'tests/w.test.mjs')], verificationCommand: 'c', redStateEvidence: 'e', constraints: [], mockingBoundaries: [], preexistingCheck: 'passed', gamingCheck: 'passed', framework: 'node:test' });
  await writeFixture(dir, 'tests/w.test.mjs', 'modified content');
  const result = await verifyHandoff(packetPath);
  assert.equal(result.status, 'HASH_MISMATCH');
  assert.ok(result.storedHash);
  assert.ok(result.computedHash);
});

test('verifyHandoff throws PACKET_NOT_FOUND error when packet does not exist', async (t) => {
  const dir = await createTempDir();
  t.after(() => cleanupTempDir(dir));
  const missing = join(dir, 'packets', 'no-such-packet-tests.md');
  await assert.rejects(
    () => verifyHandoff(missing),
    (err) => {
      assert.ok(err.message.includes('Packet not found'));
      return true;
    }
  );
});

test('verifyHandoff throws STALE_PACKET error when a listed test file no longer exists', async (t) => {
  const dir = await createTempDir();
  t.after(() => cleanupTempDir(dir));
  const testFile = join(dir, 'tests/gone.test.mjs');
  await writeFixture(dir, 'tests/gone.test.mjs', 'original');
  const packetPath = join(dir, 'packets', 'gone-tests.md');
  await writeHandoff({ packetsDir: join(dir, 'packets'), slug: 'gone', spec: 's', testFiles: [testFile], verificationCommand: 'c', redStateEvidence: 'e', constraints: [], mockingBoundaries: [], preexistingCheck: 'passed', gamingCheck: 'passed', framework: 'node:test' });
  // Delete the test file after writing the packet
  const { unlinkSync } = await import('node:fs');
  unlinkSync(testFile);
  await assert.rejects(
    () => verifyHandoff(packetPath),
    (err) => {
      assert.ok(err.message.includes('Test file missing'), `expected "Test file missing" in: ${err.message}`);
      return true;
    }
  );
});

test('writeHandoff records mocking boundaries with target, type, and justification', async (t) => {
  const dir = await createTempDir();
  t.after(() => cleanupTempDir(dir));
  await writeFixture(dir, 'tests/m.test.mjs', 'content');
  await writeHandoff({
    packetsDir: join(dir, 'packets'),
    slug: 'm',
    spec: 's',
    testFiles: [join(dir, 'tests/m.test.mjs')],
    verificationCommand: 'c',
    redStateEvidence: 'e',
    constraints: [],
    mockingBoundaries: [
      { target: 'node-fetch', type: 'HTTP', justification: 'fetches external API' },
      { target: 'pg', type: 'DB', justification: 'reads user records' },
    ],
    preexistingCheck: 'passed',
    gamingCheck: 'passed',
    framework: 'node:test',
  });
  const content = readFileSync(join(dir, 'packets', 'm-tests.md'), 'utf-8');
  assert.ok(content.includes('node-fetch'));
  assert.ok(content.includes('HTTP'));
  assert.ok(content.includes('fetches external API'));
  assert.ok(content.includes('pg'));
  assert.ok(content.includes('DB'));
  assert.ok(content.includes('reads user records'));
});
