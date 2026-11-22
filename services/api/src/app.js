import express from 'express';
import client from 'prom-client';

// The app gets its database and queue from outside, so tests can pass fakes.
export function createApp({ db, queue }) {
  const app = express();
  app.use(express.json());

  // ---- metrics (Prometheus scrapes GET /metrics) ----
  const registry = new client.Registry();
  client.collectDefaultMetrics({ register: registry });
  const httpRequests = new client.Counter({
    name: 'http_requests_total',
    help: 'HTTP requests',
    labelNames: ['method', 'route', 'status'],
    registers: [registry],
  });
  const httpDuration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration',
    labelNames: ['method', 'route'],
    registers: [registry],
  });
  const ordersCreated = new client.Counter({
    name: 'orders_created_total',
    help: 'Orders created',
    registers: [registry],
  });

  app.use((req, res, next) => {
    const end = httpDuration.startTimer();
    res.on('finish', () => {
      const route = req.route?.path ?? 'unknown';
      httpRequests.inc({ method: req.method, route, status: res.statusCode });
      end({ method: req.method, route });
    });
    next();
  });

  // ---- health ----
  // liveness: "is the process alive?" (no dependencies → a db outage does not restart pods)
  app.get('/healthz', (req, res) => res.json({ status: 'ok' }));

  // readiness: "can I serve traffic?" (checks db + queue)
  app.get('/readyz', async (req, res) => {
    try {
      await db.query('SELECT 1');
      await queue.ping();
      res.json({ status: 'ready' });
    } catch (err) {
      res.status(503).json({ status: 'not ready', error: err.message || err.code || 'unavailable' });
    }
  });

  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', registry.contentType);
    res.send(await registry.metrics());
  });

  // ---- API ----
  app.get('/api/products', async (req, res, next) => {
    try {
      const { rows } = await db.query('SELECT id, name, price_cents FROM products ORDER BY id');
      res.json(rows);
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/orders', async (req, res, next) => {
    const productId = Number(req.body?.productId);
    const quantity = Number(req.body?.quantity ?? 1);
    if (!Number.isInteger(productId) || productId < 1 || !Number.isInteger(quantity) || quantity < 1) {
      return res.status(400).json({ error: 'productId and quantity must be positive integers' });
    }
    try {
      const { rows } = await db.query(
        'INSERT INTO orders (product_id, quantity) VALUES ($1, $2) RETURNING id, product_id, quantity, status',
        [productId, quantity],
      );
      await queue.enqueue(rows[0].id);
      ordersCreated.inc();
      res.status(201).json(rows[0]);
    } catch (err) {
      if (err.code === '23503') return res.status(404).json({ error: 'product not found' });
      next(err);
    }
  });

  app.get('/api/orders/:id', async (req, res, next) => {
    try {
      const { rows } = await db.query(
        'SELECT id, product_id, quantity, status, created_at, processed_at FROM orders WHERE id = $1',
        [req.params.id],
      );
      if (rows.length === 0) return res.status(404).json({ error: 'order not found' });
      res.json(rows[0]);
    } catch (err) {
      next(err);
    }
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  });

  return app;
}
