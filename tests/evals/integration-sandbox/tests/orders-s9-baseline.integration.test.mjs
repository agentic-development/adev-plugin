import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { getOrdersByCustomer } from '../lib/orders-s9-baseline.mjs';
import { getPool, closePool } from '../lib/db.mjs';

describe('getOrdersByCustomer (s9-baseline)', () => {
  after(async () => {
    await closePool();
  });

  // AC1 + AC5: Returns all orders for customer 1 (expects 2 rows: ids 101, 102)
  it('returns all orders for customer 1', async () => {
    const rows = await getOrdersByCustomer(1);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].id, 101);
    assert.equal(rows[1].id, 102);
  });

  // AC3: Returns rows with correct column types
  it('returns correct column types', async () => {
    const rows = await getOrdersByCustomer(1);
    const row = rows[0];
    assert.equal(typeof row.id, 'number');
    assert.equal(typeof row.customer_id, 'number');
    assert.equal(typeof row.total_cents, 'number');
    assert.equal(typeof row.status, 'string');
    assert.ok(row.created_at instanceof Date);
  });

  // AC1: Returns orders ordered by id ascending
  it('returns orders ordered by id ascending', async () => {
    const rows = await getOrdersByCustomer(1);
    for (let i = 1; i < rows.length; i++) {
      assert.ok(rows[i].id > rows[i - 1].id, `row ${i} id should be greater than row ${i - 1} id`);
    }
  });

  // AC2: Returns empty array for customer with no orders
  it('returns empty array for non-existent customer', async () => {
    const rows = await getOrdersByCustomer(999);
    assert.deepEqual(rows, []);
  });

  // AC5: Returns single order for customer 2 (expects 1 row: id 103)
  it('returns single order for customer 2', async () => {
    const rows = await getOrdersByCustomer(2);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, 103);
    assert.equal(rows[0].customer_id, 2);
    assert.equal(rows[0].total_cents, 7500);
    assert.equal(rows[0].status, 'pending');
  });

  // AC5: Verifies seed data values for customer 1
  it('returns correct seed data values for customer 1 orders', async () => {
    const rows = await getOrdersByCustomer(1);
    assert.equal(rows[0].total_cents, 4999);
    assert.equal(rows[0].status, 'completed');
    assert.equal(rows[1].total_cents, 1250);
    assert.equal(rows[1].status, 'completed');
  });

  // AC4: Parameterized query (SQL injection protection)
  it('safely handles string input without SQL injection', async () => {
    const rows = await getOrdersByCustomer('1 OR 1=1');
    assert.deepEqual(rows, []);
  });
});
