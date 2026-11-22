// All settings come from environment variables (12-factor app). No passwords in code.
export const config = {
  port: Number(process.env.PORT || 3000),
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'shopflow',
    user: process.env.DB_USER || 'shopflow',
    password: process.env.DB_PASSWORD || 'shopflow',
    connectionTimeoutMillis: 5000, // never hang forever (lesson from the todo app)
  },
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  queueName: process.env.QUEUE_NAME || 'orders',
};
