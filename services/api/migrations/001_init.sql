CREATE TABLE IF NOT EXISTS products (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  price_cents INT  NOT NULL CHECK (price_cents >= 0)
);

CREATE TABLE IF NOT EXISTS orders (
  id           SERIAL PRIMARY KEY,
  product_id   INT  NOT NULL REFERENCES products(id),
  quantity     INT  NOT NULL CHECK (quantity > 0),
  status       TEXT NOT NULL DEFAULT 'pending',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

INSERT INTO products (name, price_cents) VALUES
  ('Keyboard', 4999),
  ('Mouse', 1999),
  ('Monitor', 18999)
ON CONFLICT (name) DO NOTHING;
