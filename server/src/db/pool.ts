import { Pool } from 'pg';
import { DATABASE_URL, PGSSL } from '../config';

export const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: PGSSL ? { rejectUnauthorized: false } : undefined
});

export const query = async <T = unknown>(text: string, params?: unknown[]): Promise<T[]> => {
  const result = await pool.query<T>(text, params);
  return result.rows;
};
