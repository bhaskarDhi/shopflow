import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import Redis from 'ioredis';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db.js';
import { createQueue } from '../src/queue.js';
import { config } from '../src/config.js';

const db = createDb();          // real Postgres (settings from env vars)
const queue = createQueue();    // real Redis
const redis = new Redis(config.redisUrl);   // a 2nd connection, only to LOOK inside the queue
const app = createApp({ db, queue });

before(async () => {
  await redis.del(config.queueName);        // start with an empty queue
});

after(async () => {
  await Promise.all([db.close(), queue.close(), redis.quit()]);   // close connections → node can exit
});

test('readyz is 200 with a real database and redis', async () => {
  const res = await request(app).get('/readyz');
  assert.equal(res.status, 200);
});

test('products come from the migration seed', async () => {
  const res = await request(app).get('/api/products');
  assert.equal(res.status, 200);
  assert.ok(res.body.some((p) => p.name === 'Keyboard'));
});

test('POST /api/orders saves in postgres and puts the id on redis', async () => {
  const res = await request(app).post('/api/orders').send({ productId: 1, quantity: 2 });
  assert.equal(res.status, 201);

  // look in the REAL database
  const { rows } = await db.query('SELECT status FROM orders WHERE id = $1', [res.body.id]);
  assert.equal(rows[0].status, 'pending');

  // look in the REAL queue
  const items = await redis.lrange(config.queueName, 0, -1);
  assert.ok(items.includes(String(res.body.id)));
});

test('an unknown product gives 404 (real foreign key)', async () => {
  const res = await request(app).post('/api/orders').send({ productId: 9999, quantity: 1 });
  assert.equal(res.status, 404);
});