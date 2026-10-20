import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { Server } from 'socket.io';
import { pool, query } from './db.js';
import { requireAuth, requireRole, requireDevice } from './auth.js';
import { seedDemoUsers } from './seed.js';

const app = express();
const server = http.createServer(app);
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',').map(x => x.trim()).filter(Boolean);

const io = new Server(server, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST'] }
});

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin(origin, cb) {
  if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
  return cb(new Error('Origin not allowed by CORS'));
}}));
app.use(express.json({ limit: '64kb' }));

app.get('/api/health', async (_req, res) => {
  try { await query('SELECT 1'); res.json({ ok: true, database: 'connected' }); }
  catch { res.status(503).json({ ok: false, database: 'unavailable' }); }
});

app.post('/api/auth/login', async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
  try {
    const result = await query('SELECT id, username, password_hash, role, must_change_password FROM users WHERE username=$1', [username]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    const token = jwt.sign({ sub: user.id, username: user.username, role: user.role }, process.env.JWT_SECRET, { expiresIn: '8h' });
    res.json({ token, user: { id: user.id, username: user.username, role: user.role, mustChangePassword: user.must_change_password } });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Login failed' }); }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  const result = await query('SELECT id, username, role, must_change_password FROM users WHERE id=$1', [req.user.sub]);
  if (!result.rows[0]) return res.status(401).json({ error: 'Account not found' });
  const u = result.rows[0];
  res.json({ id: u.id, username: u.username, role: u.role, mustChangePassword: u.must_change_password });
});

app.post('/api/auth/change-password', requireAuth, async (req, res) => {
  const password = String(req.body?.password || '');
  if (password.length < 12) return res.status(400).json({ error: 'Password must be at least 12 characters' });
  const hash = await bcrypt.hash(password, 12);
  await query('UPDATE users SET password_hash=$1, must_change_password=FALSE WHERE id=$2', [hash, req.user.sub]);
  res.json({ ok: true });
});

app.get('/api/medicines', requireAuth, async (_req, res) => {
  const result = await query(`
    SELECT m.id, m.name, m.strength, m.batch_number, m.expiry_date, m.description,
      COALESCE(i.quantity,0)::int AS quantity,
      (SELECT uid FROM rfid_tags t WHERE t.medicine_id=m.id AND t.active=TRUE ORDER BY t.created_at LIMIT 1) AS tag_uid
    FROM medicines m LEFT JOIN inventory i ON i.medicine_id=m.id
    ORDER BY m.name`);
  res.json(result.rows);
});

app.post('/api/medicines', requireAuth, requireRole('admin'), async (req, res) => {
  const { name, strength = '', batch_number = '', expiry_date = null, description = '', quantity = 0 } = req.body || {};
  if (!String(name || '').trim()) return res.status(400).json({ error: 'Medicine name is required' });
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 0) return res.status(400).json({ error: 'Quantity must be a non-negative integer' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const m = await client.query(
      `INSERT INTO medicines (name,strength,batch_number,expiry_date,description) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [String(name).trim(), strength, batch_number, expiry_date || null, description]
    );
    await client.query('INSERT INTO inventory (medicine_id,quantity) VALUES ($1,$2)', [m.rows[0].id, qty]);
    await client.query('COMMIT');
    res.status(201).json({ ...m.rows[0], quantity: qty });
  } catch (e) {
    await client.query('ROLLBACK'); console.error(e); res.status(500).json({ error: 'Could not create medicine' });
  } finally { client.release(); }
});

app.put('/api/medicines/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const { name, strength = '', batch_number = '', expiry_date = null, description = '' } = req.body || {};
  if (!String(name || '').trim()) return res.status(400).json({ error: 'Medicine name is required' });
  const result = await query(
    `UPDATE medicines SET name=$1,strength=$2,batch_number=$3,expiry_date=$4,description=$5,updated_at=NOW()
     WHERE id=$6 RETURNING *`,
    [String(name).trim(), strength, batch_number, expiry_date || null, description, req.params.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Medicine not found' });
  res.json(result.rows[0]);
});

app.post('/api/rfid/register', requireAuth, requireRole('admin'), async (req, res) => {
  const uid = String(req.body?.uid || '').trim().toUpperCase();
  const medicineId = String(req.body?.medicine_id || '');
  if (!uid || !medicineId) return res.status(400).json({ error: 'uid and medicine_id are required' });
  try {
    const result = await query(
      `INSERT INTO rfid_tags (uid,medicine_id) VALUES ($1,$2)
       ON CONFLICT (uid) DO UPDATE SET medicine_id=EXCLUDED.medicine_id, active=TRUE
       RETURNING *`, [uid, medicineId]
    );
    res.status(201).json(result.rows[0]);
  } catch { res.status(400).json({ error: 'Invalid medicine ID or tag registration failed' }); }
});

app.get('/api/scans', requireAuth, async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const result = await query(
    `SELECT s.id, s.event_id, s.tag_uid, s.device_id, s.event_type, s.quantity, s.note, s.scanned_at,
      m.name AS medicine_name, m.strength
     FROM scan_events s LEFT JOIN medicines m ON m.id=s.medicine_id
     ORDER BY s.scanned_at DESC LIMIT $1`, [limit]
  );
  res.json(result.rows);
});

app.post('/api/scans', requireDevice, async (req, res) => {
  const uid = String(req.body?.tag_uid || '').trim().toUpperCase();
  const deviceId = String(req.body?.device_id || 'esp32-01').trim().slice(0, 100);
  const eventId = String(req.body?.event_id || '');
  if (!uid || !/^[a-f0-9-]{8,100}$/i.test(eventId)) {
    return res.status(400).json({ error: 'tag_uid and a valid UUID event_id are required' });
  }
  try {
    const existing = await query('SELECT id FROM scan_events WHERE event_id=$1', [eventId]);
    if (existing.rows[0]) return res.json({ ok: true, duplicate: true });
    const match = await query('SELECT medicine_id FROM rfid_tags WHERE uid=$1 AND active=TRUE', [uid]);
    const medicineId = match.rows[0]?.medicine_id || null;
    const eventType = medicineId ? 'identify' : 'unknown_tag';
    const inserted = await query(
      `INSERT INTO scan_events (event_id,tag_uid,medicine_id,device_id,event_type)
       VALUES ($1,$2,$3,$4,$5) RETURNING id,event_id,tag_uid,medicine_id,device_id,event_type,scanned_at`,
      [eventId, uid, medicineId, deviceId, eventType]
    );
    const payload = { ...inserted.rows[0], medicine_name: null };
    if (medicineId) {
      const m = await query('SELECT name,strength FROM medicines WHERE id=$1', [medicineId]);
      payload.medicine_name = m.rows[0]?.name || null;
      payload.strength = m.rows[0]?.strength || null;
    }
    io.emit('scan:new', payload);
    res.status(201).json({ ok: true, scan: payload });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Could not save scan' }); }
});

app.post('/api/inventory/adjust', requireAuth, requireRole('admin'), async (req, res) => {
  const medicineId = String(req.body?.medicine_id || '');
  const action = String(req.body?.action || '');
  const quantity = Number(req.body?.quantity);
  const note = String(req.body?.note || '').slice(0, 500);
  if (!medicineId || !['stock_in','stock_out'].includes(action) || !Number.isInteger(quantity) || quantity <= 0) {
    return res.status(400).json({ error: 'medicine_id, action stock_in/stock_out, and positive integer quantity are required' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inv = await client.query('SELECT quantity FROM inventory WHERE medicine_id=$1 FOR UPDATE', [medicineId]);
    if (!inv.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Inventory record not found' }); }
    const current = inv.rows[0].quantity;
    if (action === 'stock_out' && current < quantity) {
      await client.query('ROLLBACK'); return res.status(409).json({ error: 'Insufficient stock' });
    }
    const next = action === 'stock_in' ? current + quantity : current - quantity;
    await client.query('UPDATE inventory SET quantity=$1,updated_at=NOW() WHERE medicine_id=$2', [next, medicineId]);
    const eventId = randomUUID();
    await client.query(
      `INSERT INTO scan_events (event_id,medicine_id,device_id,event_type,quantity,note)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [eventId, medicineId, 'admin-portal', action, quantity, note]
    );
    await client.query('COMMIT');
    const payload = { medicine_id: medicineId, quantity: next, action };
    io.emit('inventory:updated', payload);
    res.json({ ok: true, ...payload });
  } catch (e) {
    await client.query('ROLLBACK'); console.error(e); res.status(500).json({ error: 'Inventory update failed' });
  } finally { client.release(); }
});

app.get('/api/devices', requireAuth, async (_req, res) => {
  const result = await query('SELECT id,local_ip,last_seen,firmware_version,status FROM devices ORDER BY id');
  res.json(result.rows);
});

app.post('/api/device/heartbeat', requireDevice, async (req, res) => {
  const id = String(req.body?.device_id || 'esp32-01').slice(0,100);
  const localIp = req.body?.local_ip ? String(req.body.local_ip) : null;
  const firmware = String(req.body?.firmware_version || 'unknown').slice(0,40);
  await query(
    `INSERT INTO devices (id,local_ip,last_seen,firmware_version,status) VALUES ($1,$2,NOW(),$3,'online')
     ON CONFLICT (id) DO UPDATE SET local_ip=EXCLUDED.local_ip,last_seen=NOW(),firmware_version=EXCLUDED.firmware_version,status='online'`,
    [id, localIp, firmware]
  );
  io.emit('device:heartbeat', { id, local_ip: localIp, last_seen: new Date().toISOString(), status: 'online' });
  res.json({ ok: true });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Unexpected server error' });
});

const port = Number(process.env.PORT || 4000);
const host = process.env.HOST || '0.0.0.0';
try {
  await seedDemoUsers();
  server.listen(port, host, () => console.log(`Medicine API listening on ${host}:${port}`));
} catch (e) {
  console.error('Startup failed. Ensure database/schema.sql has been applied.', e);
  process.exit(1);
}
