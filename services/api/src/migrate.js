// Runs the SQL files in migrations/ once each, in order.
// Run it as a separate step (npm run migrate) — in Kubernetes this becomes a Job / Helm hook,
// so the app pods never change the database schema themselves.
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createDb } from './db.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const db = createDb();

try {
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const { rowCount } = await db.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
    if (rowCount > 0) {
      console.log(`skip    ${file}`);
      continue;
    }
    const sql = await readFile(path.join(dir, file), 'utf8');
    await db.query('BEGIN');
    await db.query(sql);
    await db.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    await db.query('COMMIT');
    console.log(`applied ${file}`);
  }
  console.log('migrations done');
} catch (err) {
  await db.query('ROLLBACK').catch(() => {});
  console.error('migration failed:', err.message || err.code || err);
  process.exitCode = 1;
} finally {
  await db.close();
}
