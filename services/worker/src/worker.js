import http from 'node:http';
import pg from 'pg';
import Redis from 'ioredis';
import { processOrder } from './process.js';

const queueName = process.env.QUEUE_NAME || 'orders';
const healthPort = Number(process.env.HEALTH_PORT || 8080);

const db = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'shopflow',
  user: process.env.DB_USER || 'shopflow',
  password: process.env.DB_PASSWORD || 'shopflow',
  connectionTimeoutMillis: 5000,
});
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
redis.on('error', (err) => console.error('redis error:', err.message || err.code));

let running = true;
let lastLoop = Date.now();

// A tiny HTTP server only for the Kubernetes liveness probe:
// if the loop has not run for 60 s, the worker is stuck → 503 → Kubernetes restarts it.
http
  .createServer((req, res) => {
    const healthy = Date.now() - lastLoop < 60_000;
    res.writeHead(healthy ? 200 : 503).end(healthy ? 'ok' : 'stuck');
  })
  .listen(healthPort, () => console.log(`worker health on port ${healthPort}`));

async function loop() {
  console.log(`worker waiting for jobs on "${queueName}"`);
  while (running) {
    lastLoop = Date.now();
    try {
      const item = await redis.brpop(queueName, 5); // wait up to 5 s for a job
      if (!item) continue;
      const orderId = Number(item[1]);
      await new Promise((r) => setTimeout(r, 500)); // pretend the work takes time
      const done = await processOrder(db, orderId);
      console.log(`order ${orderId} ${done ? 'processed' : 'skipped'}`);
    } catch (err) {
      console.error('worker error:', err.message || err.code);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

function shutdown() {
  console.log('shutting down');
  running = false;
  setTimeout(async () => {
    await Promise.allSettled([db.end(), redis.quit()]);
    process.exit(0);
  }, 100);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

loop();
