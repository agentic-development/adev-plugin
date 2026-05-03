import { getPool } from './db.mjs';

/**
 * Fetch all orders for a customer, ordered by order ID.
 * Returns rows with { id, customer_id, total_cents, status, created_at }.
 */
export async function getOrdersByCustomer(customerId) {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT id, customer_id, total_cents, status, created_at FROM orders WHERE customer_id = $1 ORDER BY id',
    [customerId]
  );
  return rows;
}
