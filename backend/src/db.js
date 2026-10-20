import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

const isRender = process.env.DATABASE_URL?.includes('render.com') ||
  process.env.DATABASE_URL?.includes('dpg-') ||
  process.env.NODE_ENV === 'production';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isRender ? { rejectUnauthorized: false } : undefined
});

export async function query(text, params = []) {
  return pool.query(text, params);
}
