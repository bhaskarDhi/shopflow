import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';

// Fakes: no real Postgres or Redis needed for unit tests.
function fakeDb(handler = () => ({ rows: [], rowCount: 0 })) {
  return { query: async (text, params) => handler(text, params) };
}
function fakeQueue() {
  const items = [];
  return { items, enqueue: async (id) => items.push(id), ping: async () => 'PONG' };
}

test('GET /healthz is always ok', async () => {
  const app = createApp({ db: fakeDb(), queue: fakeQueue() });
  const res = await request(app).get('/healthz');
  assert.equal(res.status, 200);
});

test('GET /readyz is 503 when the database is down', async () => {
  const db = { query: async () => { throw new Error('db down'); } };
  const app = createApp({ db, queue: fakeQueue() });
  const res = await request(app).get('/readyz');
  assert.equal(res.status, 503);
});

test('GET /api/products returns the rows', async () => {
  const rows = [{ id: 1, name: 'Keyboard', price_cents: 4999 }];
  const app = createApp({ db: fakeDb(() => ({ rows })), queue: fakeQueue() });
  const res = await request(app).get('/api/products');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, rows);
});

test('POST /api/orders rejects a bad body', async () => {
  const app = createApp({ db: fakeDb(), queue: fakeQueue() });
  const res = await request(app).post('/api/orders').send({ productId: 'abc' });
  assert.equal(res.status, 400);
});

test('POST /api/orders saves the order and puts it on the queue', async () => {
  const queue = fakeQueue();
  const db = fakeDb(() => ({ rows: [{ id: 7, product_id: 1, quantity: 2, status: 'pending' }] }));
  const app = createApp({ db, queue });
  const res = await request(app).post('/api/orders').send({ productId: 1, quantity: 2 });
  assert.equal(res.status, 201);
  assert.equal(res.body.id, 7);
  assert.deepEqual(queue.items, [7]);
});

test('GET /metrics exposes Prometheus metrics', async () => {
  const app = createApp({ db: fakeDb(), queue: fakeQueue() });
  await request(app).get('/healthz');
  const res = await request(app).get('/metrics');
  assert.equal(res.status, 200);
  assert.match(res.text, /http_requests_total/);
});
