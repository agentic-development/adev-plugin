import { getPool } from './db.mjs';

/**
 * Fetch all orders for a customer, ordered by order ID ascending.
 * Returns rows with { id, customer_id, total_cents, status, created_at }.
 *
 * @param {number} customerId - The customer ID to query orders for
 * @returns {Promise<Array<{id: number, customer_id: number, total_cents: number, status: string, created_at: Date}>>}
 */
export async function getOrdersByCustomer(customerId) {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT id, customer_id, total_cents, status, created_at FROM orders WHERE customer_id = $1 ORDER BY id ASC',
    [customerId]
  );
  return rows;
}
