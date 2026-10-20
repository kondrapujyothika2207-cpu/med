import bcrypt from 'bcryptjs';
import { query } from './db.js';

export async function seedDemoUsers() {
  if (process.env.SEED_DEMO_USERS !== 'true') return;
  if (process.env.NODE_ENV === 'production') {
    console.warn('Demo-user seeding disabled in production.');
    return;
  }
  const users = [
    ['admin', 'admin123', 'admin'],
    ['user', 'user123', 'user']
  ];
  for (const [username, password, role] of users) {
    const hash = await bcrypt.hash(password, 12);
    await query(
      `INSERT INTO users (username, password_hash, role, must_change_password)
       VALUES ($1, $2, $3, TRUE)
       ON CONFLICT (username) DO NOTHING`,
      [username, hash, role]
    );
  }
}
