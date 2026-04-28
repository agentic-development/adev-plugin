/**
 * Integration test: S3 adapter — real AWS infrastructure required.
 *
 * Strategy: integration
 *
 * Infrastructure Requirements:
 *   External systems: AWS S3
 *   Credentials: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION
 *   Pre-provisioned state: S3 bucket named in TEST_BUCKET env var
 *   Run with: node --test --test-name-pattern "integration"
 *
 * Default behavior: tests FAIL if credentials are missing or host is
 * unreachable. This is correct — a test that cannot reach its infrastructure
 * is a failing test, not a skipped test.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// ── Direct import — no skip guards ──────────────────────────────────────────
// Tests connect directly to AWS. If credentials are missing, the SDK throws
// on the first API call and the test fails. This is the expected behavior.
const { upload, download, remove } = await import('../adapters/s3-client.mjs');

const BUCKET = process.env.TEST_BUCKET;

describe('S3 adapter — integration', () => {
  let testKey;

  before(() => {
    // Use UUID suffix to prevent cross-run collisions (spec: seed data rule)
    testKey = `adev-test/${randomUUID()}/sample.txt`;
  });

  after(async () => {
    // Idempotent teardown — spec: tests must clean up all state they create
    try { await remove(BUCKET, testKey); } catch { /* already deleted */ }
  });

  it('integration: upload creates object in S3', async () => {
    const result = await upload(BUCKET, testKey, 'hello from adev integration test');
    assert.strictEqual(result.bucket, BUCKET);
    assert.strictEqual(result.key, testKey);
  });

  it('integration: download retrieves the uploaded content', async () => {
    const body = await download(BUCKET, testKey);
    // body is a readable stream — collect it
    const chunks = [];
    for await (const chunk of body) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString('utf8');
    assert.strictEqual(text, 'hello from adev integration test');
  });

  it('integration: remove deletes the object', async () => {
    await remove(BUCKET, testKey);
    // Verify deletion by attempting download — should throw NoSuchKey
    await assert.rejects(
      () => download(BUCKET, testKey),
      (err) => err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404
    );
  });
});
