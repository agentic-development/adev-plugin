import pg from 'pg';

const { Pool } = pg;

let pool;

/**
 * Get a connection pool to the sandbox Postgres instance.
 * Connection params come from environment variables (standard PG* vars).
 */
export function getPool() {
  if (!pool) {
    pool = new Pool({
      host:     process.env.PGHOST     || 'localhost',
      port:     Number(process.env.PGPORT || 5433),
      database: process.env.PGDATABASE || 'integration_sandbox',
      user:     process.env.PGUSER     || 'sandbox',
      password: process.env.PGPASSWORD || 'sandbox_pass',
    });
  }
  return pool;
}

/** Shut down the pool cleanly. Call in after() hooks. */
export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
