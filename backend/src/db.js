import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

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
