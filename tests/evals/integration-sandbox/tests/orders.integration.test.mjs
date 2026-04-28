import { describe, it, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { getPool, closePool } from '../lib/db.mjs';
import { getOrdersByCustomer } from '../lib/orders.mjs';

// Real connectivity check — attempt to connect to PostgreSQL.
// If the database is not running, canConnect will be false and the suite skips.
let canConnect = false;
try {
  const pool = getPool();
  const client = await pool.connect();
  client.release();
  canConnect = true;
} catch {
  // PostgreSQL is not available — tests will be skipped honestly.
}

describe('getOrdersByCustomer — integration', { skip: !canConnect && 'PostgreSQL is not available — skipping integration tests' }, () => {
  after(async () => {
    await closePool();
  });

  it('returns all orders for customer 1 (2 orders)', async () => {
    const rows = await getOrdersByCustomer(1);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].id, 101);
    assert.equal(rows[1].id, 102);
  });

  it('returns orders ordered by id ascending', async () => {
    const rows = await getOrdersByCustomer(1);
    const ids = rows.map(r => r.id);
    assert.deepStrictEqual(ids, [101, 102]);
  });

  it('returns correct column types', async () => {
    const rows = await getOrdersByCustomer(1);
    const row = rows[0];
    assert.equal(typeof row.id, 'number');
    assert.equal(typeof row.customer_id, 'number');
    assert.equal(typeof row.total_cents, 'number');
    assert.equal(typeof row.status, 'string');
    assert.ok(row.created_at instanceof Date);
  });

  it('returns correct seed data values for customer 1', async () => {
    const rows = await getOrdersByCustomer(1);
    assert.equal(rows[0].total_cents, 4999);
    assert.equal(rows[0].status, 'completed');
    assert.equal(rows[1].total_cents, 1250);
    assert.equal(rows[1].status, 'completed');
  });

  it('returns single order for customer 2', async () => {
    const rows = await getOrdersByCustomer(2);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, 103);
    assert.equal(rows[0].total_cents, 7500);
    assert.equal(rows[0].status, 'pending');
  });

  it('returns single order for customer 3', async () => {
    const rows = await getOrdersByCustomer(3);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, 104);
    assert.equal(rows[0].total_cents, 0);
    assert.equal(rows[0].status, 'cancelled');
  });

  it('returns empty array for non-existent customer', async () => {
    const rows = await getOrdersByCustomer(999);
    assert.deepStrictEqual(rows, []);
  });
});
