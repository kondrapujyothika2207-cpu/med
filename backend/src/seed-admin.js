import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { query, pool } from './db.js';

try {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password || password.length < 12) {
    throw new Error('Set ADMIN_USERNAME and ADMIN_PASSWORD (at least 12 characters).');
  }
  const hash = await bcrypt.hash(password, 12);
  await query(
    `INSERT INTO users (username, password_hash, role, must_change_password)
     VALUES ($1, $2, 'admin', FALSE)
     ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash,
       role = 'admin', must_change_password = FALSE`,
    [username, hash]
  );
  console.log(`Admin account provisioned: ${username}`);
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
