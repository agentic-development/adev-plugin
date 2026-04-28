// tests/test-strategies/gaming-agent-skip.test.mjs
// Regression tests for AGENT_SKIP gaming pattern (issue-192).
// Verifies that the detector catches agent-initiated skip guards
// that bypass infrastructure unavailability.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { INTEGRATION_PATTERNS } from '../../lib/test-strategies/gaming.mjs';

const AGENT_SKIP = INTEGRATION_PATTERNS.find(p => p.id === 'AGENT_SKIP');

describe('AGENT_SKIP gaming pattern (issue-192)', () => {
  it('is registered in INTEGRATION_PATTERNS', () => {
    assert.ok(AGENT_SKIP, 'AGENT_SKIP pattern must exist in INTEGRATION_PATTERNS');
  });

  it('detects describe.skipIf()', () => {
    const code = `
      describe.skipIf(!canConnect)('orders integration', () => {
        it('queries the database', async () => {});
      });
    `;
    const violations = AGENT_SKIP.detect(code);
    assert.ok(violations.length > 0, 'Should detect describe.skipIf');
    assert.match(violations[0].message, /skip/i);
  });

  it('detects it.skipIf()', () => {
    const code = `
      it.skipIf(!pgReady)('inserts a row', async () => {});
    `;
    const violations = AGENT_SKIP.detect(code);
    assert.ok(violations.length > 0, 'Should detect it.skipIf');
  });

  it('detects canConnect guard variable', () => {
    const code = `
      let canConnect = false;
      try { await pool.connect(); canConnect = true; } catch {}
      describe('db tests', { skip: !canConnect && 'offline' }, () => {});
    `;
    const violations = AGENT_SKIP.detect(code);
    assert.ok(violations.length > 0, 'Should detect canConnect variable');
  });

  it('detects skipUnless guard', () => {
    const code = `
      skipUnless(hasCredentials, 'AWS credentials missing');
    `;
    const violations = AGENT_SKIP.detect(code);
    assert.ok(violations.length > 0, 'Should detect skipUnless');
  });

  it('detects infra-keyword skip option on describe', () => {
    const code = `
      describe('orders', { skip: !dbUp && 'PostgreSQL is not available — skipping' }, () => {});
    `;
    const violations = AGENT_SKIP.detect(code);
    assert.ok(violations.length > 0, 'Should detect infra-keyword skip');
    assert.match(violations[0].message, /infrastructure-conditional/i);
  });

  it('detects database-keyword skip option', () => {
    const code = `
      describe('repo tests', { skip: 'database connection refused' }, () => {});
    `;
    const violations = AGENT_SKIP.detect(code);
    assert.ok(violations.length > 0, 'Should detect database skip keyword');
  });

  it('does NOT flag non-infra skip reasons', () => {
    const code = `
      describe('slow tests', { skip: 'takes too long for CI' }, () => {});
    `;
    const violations = AGENT_SKIP.detect(code);
    assert.strictEqual(violations.length, 0, 'Non-infra skip reasons should not be flagged');
  });

  it('does NOT flag canConnect in comments', () => {
    const code = `
      // Do not use canConnect as a skip guard
      /* canConnect is prohibited */
      describe('db tests', () => {
        it('queries directly', async () => {});
      });
    `;
    const violations = AGENT_SKIP.detect(code);
    assert.strictEqual(violations.length, 0, 'Comments should not trigger violations');
  });

  it('does NOT flag clean integration tests with no skip guards', () => {
    const code = `
      import { getPool, closePool } from '../lib/db.mjs';
      import { getOrdersByCustomer } from '../lib/orders.mjs';

      describe('orders integration', () => {
        after(async () => { await closePool(); });

        it('returns orders for customer 1', async () => {
          const rows = await getOrdersByCustomer(1);
          assert.equal(rows.length, 2);
        });
      });
    `;
    const violations = AGENT_SKIP.detect(code);
    assert.strictEqual(violations.length, 0, 'Clean integration tests should not be flagged');
  });
});
