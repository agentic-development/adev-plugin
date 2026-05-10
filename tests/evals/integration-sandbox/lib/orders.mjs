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

/**
 * Compute total revenue (in cents) for completed orders, grouped by customer.
 * Returns rows with { customer_id, name, total_revenue_cents, order_count }.
 */
export async function getRevenueByCustomer() {
  const pool = getPool();
  const { rows } = await pool.query(`
    SELECT
      c.id AS customer_id,
      c.name,
      COALESCE(SUM(o.total_cents), 0)::integer AS total_revenue_cents,
      COUNT(o.id)::integer AS order_count
    FROM customers c
    LEFT JOIN orders o ON o.customer_id = c.id AND o.status = 'completed'
    GROUP BY c.id, c.name
    ORDER BY c.id
  `);
  return rows;
}

/**
 * Create a new order. Returns the inserted row.
 */
export async function createOrder({ customerId, totalCents, status = 'pending' }) {
  const pool = getPool();
  const { rows } = await pool.query(
    'INSERT INTO orders (customer_id, total_cents, status) VALUES ($1, $2, $3) RETURNING *',
    [customerId, totalCents, status]
  );
  return rows[0];
}
