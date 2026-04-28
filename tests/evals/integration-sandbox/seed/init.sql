-- Seed data for integration-sandbox.
-- Loaded automatically by docker-compose on first run.

CREATE TABLE IF NOT EXISTS customers (
  id         SERIAL PRIMARY KEY,
  name       TEXT    NOT NULL,
  email      TEXT    NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id          SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  status      TEXT    NOT NULL DEFAULT 'pending',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Deterministic seed data — tests assert against these exact values.
INSERT INTO customers (id, name, email) VALUES
  (1, 'Alice',   'alice@example.com'),
  (2, 'Bob',     'bob@example.com'),
  (3, 'Charlie', 'charlie@example.com');

INSERT INTO orders (id, customer_id, total_cents, status) VALUES
  (101, 1, 4999,  'completed'),
  (102, 1, 1250,  'completed'),
  (103, 2, 7500,  'pending'),
  (104, 3, 0,     'cancelled');

-- Reset sequences to avoid collision with seed IDs.
SELECT setval('customers_id_seq', 100);
SELECT setval('orders_id_seq',    200);
