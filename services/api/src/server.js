import { createApp } from './app.js';
import { createDb } from './db.js';
import { createQueue } from './queue.js';
import { config } from './config.js';

const db = createDb();
const queue = createQueue();
const app = createApp({ db, queue });

const server = app.listen(config.port, () => console.log(`api listening on port ${config.port}`));

// Graceful shutdown: Kubernetes sends SIGTERM before it stops a pod.
function shutdown() {
  console.log('shutting down');
  server.close(async () => {
    await Promise.allSettled([db.close(), queue.close()]);
    process.exit(0);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
