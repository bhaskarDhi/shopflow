import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processOrder } from '../src/process.js';

test('processOrder marks a pending order as processed', async () => {
  const calls = [];
  const db = { query: async (text, params) => { calls.push(params); return { rowCount: 1 }; } };
  assert.equal(await processOrder(db, 42), true);
  assert.deepEqual(calls, [[42]]);
});

test('processOrder is safe when the order was already processed', async () => {
  const db = { query: async () => ({ rowCount: 0 }) };
  assert.equal(await processOrder(db, 42), false);
});
