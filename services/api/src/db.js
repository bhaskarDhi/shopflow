import pg from 'pg';
import { config } from './config.js';

export function createDb() {
  const pool = new pg.Pool(config.db);
  return {
    query: (text, params) => pool.query(text, params),
    close: () => pool.end(),
  };
}
