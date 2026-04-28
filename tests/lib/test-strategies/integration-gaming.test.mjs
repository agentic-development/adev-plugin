import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { INTEGRATION_PATTERNS } from '../../../lib/test-strategies/gaming.mjs';

describe('INTEGRATION_PATTERNS export', () => {
  test('is an array with at least 3 patterns', () => {
    assert.ok(Array.isArray(INTEGRATION_PATTERNS));
    assert.ok(INTEGRATION_PATTERNS.length >= 3, 'Expected BOUNDARY_MOCKING, CI_BYPASS, CREDENTIAL_ABSENT_PASS');
  });

  test('each pattern has id, name, description, and detect function', () => {
    for (const p of INTEGRATION_PATTERNS) {
      assert.equal(typeof p.id, 'string', `pattern ${p.id} missing id`);
      assert.equal(typeof p.name, 'string', `pattern ${p.id} missing name`);
      assert.equal(typeof p.description, 'string', `pattern ${p.id} missing description`);
      assert.equal(typeof p.detect, 'function', `pattern ${p.id} missing detect function`);
    }
  });
});

describe('BOUNDARY_MOCKING pattern', () => {
  const pattern = INTEGRATION_PATTERNS.find((p) => p.id === 'BOUNDARY_MOCKING');

  test('detects jest.mock() with module path containing S3Client', () => {
    const content = `jest.mock('@aws-sdk/client-s3', () => ({ S3Client: jest.fn() }));`;
    const violations = pattern.detect(content);
    assert.ok(violations.length > 0, 'Expected a BOUNDARY_MOCKING violation');
  });

  test('detects jest.mock() with sinon.stub patterns on database drivers', () => {
    const content = `const stub = sinon.stub(pool, 'query').resolves([]);`;
    const violations = pattern.detect(content);
    assert.ok(violations.length > 0, 'Expected a BOUNDARY_MOCKING violation for DB driver stub');
  });

  test('does not flag mocking of internal helper functions', () => {
    const content = `jest.mock('../utils/retry', () => ({ retry: jest.fn() }));`;
    const violations = pattern.detect(content);
    assert.equal(violations.length, 0, 'Should not flag internal helper mocks');
  });
});

describe('CI_BYPASS pattern', () => {
  const pattern = INTEGRATION_PATTERNS.find((p) => p.id === 'CI_BYPASS');

  test('detects if (process.env.CI) skip pattern', () => {
    const content = `if (process.env.CI) { test.skip('skips in CI', () => {}); }`;
    const violations = pattern.detect(content);
    assert.ok(violations.length > 0, 'Expected a CI_BYPASS violation');
  });

  test('detects process.env.CI combined with skip/return', () => {
    const content = `if (process.env.CI) return;\nassert.ok(true);`;
    const violations = pattern.detect(content);
    assert.ok(violations.length > 0, 'Expected a CI_BYPASS violation');
  });
});

describe('CREDENTIAL_ABSENT_PASS pattern', () => {
  const pattern = INTEGRATION_PATTERNS.find((p) => p.id === 'CREDENTIAL_ABSENT_PASS');

  test('detects tests that do not check for required env vars', () => {
    const content = `
test('uploads file to S3', async () => {
  const client = new S3Client({ region: 'us-east-1' });
  const result = await client.send(new PutObjectCommand({ Bucket: 'test', Key: 'file' }));
  assert.ok(result);
});`;
    const violations = pattern.detect(content);
    assert.ok(violations.length > 0, 'Expected CREDENTIAL_ABSENT_PASS violation — no env var guard');
  });

  test('does not flag tests that guard for missing credentials', () => {
    const content = `
if (!process.env.AWS_ACCESS_KEY_ID) throw new Error('AWS_ACCESS_KEY_ID is required');
test('uploads file to S3', async () => {
  assert.ok(result);
});`;
    const violations = pattern.detect(content);
    assert.equal(violations.length, 0, 'Should not flag tests with credential guard');
  });
});
