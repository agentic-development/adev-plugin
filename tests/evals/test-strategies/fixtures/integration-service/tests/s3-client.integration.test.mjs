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
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// ── INTEGRATION_NO_CREDENTIALS guard ─────────────────────────────────────────
// Per integration strategy spec: tests MUST fail fast with a clear message when
// credentials are missing. Missing env vars are NOT valid RED — they are setup
// errors that must be resolved before the TDD cycle begins.

const REQUIRED_ENV = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION', 'TEST_BUCKET'];
const missing = REQUIRED_ENV.filter(v => !process.env[v]);
if (missing.length > 0) {
  console.error(
    `INTEGRATION_NO_CREDENTIALS: Integration tests require credentials.\n` +
    `Missing: ${missing.join(', ')}\n` +
    `Set the variables listed in the Infrastructure Requirements block before running.\n` +
    `These tests CANNOT run without real AWS credentials.\n` +
    `To run: AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_REGION=us-east-1 ` +
    `TEST_BUCKET=adev-test-... node --test tests/s3-client.integration.test.mjs`
  );
  process.exit(1);
}

// ── Lazy import — only reached when credentials are present ───────────────────
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
