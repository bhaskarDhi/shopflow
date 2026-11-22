import Redis from 'ioredis';
import { config } from './config.js';

// The API puts new order ids on a Redis list; the worker takes them off (LPUSH → BRPOP).
export function createQueue() {
  const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: 2, connectTimeout: 5000 });
  redis.on('error', (err) => console.error('redis error:', err.message || err.code));
  return {
    enqueue: (orderId) => redis.lpush(config.queueName, String(orderId)),
    ping: () => redis.ping(),
    close: () => redis.quit(),
  };
}
