/**
 * GAMING VIOLATION FIXTURE — do NOT use as a test template.
 *
 * This file intentionally contains integration gaming patterns to exercise
 * the BOUNDARY_MOCKING, CI_BYPASS, and CREDENTIAL_ABSENT_PASS detectors.
 * It is read as raw content by the eval — it is NOT executed as a test.
 */

// GAMING: CI_BYPASS — skips integration tests in CI
if (process.env.CI) {
  process.exit(0);
}

// GAMING: BOUNDARY_MOCKING — mocks the declared infrastructure boundary
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(),
  PutObjectCommand: jest.fn(),
}));

// GAMING: CREDENTIAL_ABSENT_PASS — SDK instantiated without credential guard
const s3 = new S3Client({ region: 'us-east-1' });

test('uploads a file', async () => {
  const result = await upload('test-bucket', 'key', Buffer.from('data'));
  expect(result.bucket).toBe('test-bucket');
});
