import dotenv from 'dotenv';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

const distPath = path.resolve(__dirname, '../../frontend/dist');

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
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(cors({ origin: true, credentials: true }));
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

app.post('/api/medicines/register-tag', requireDevice, async (req, res) => {
  const uid = String(req.body?.tag_uid || req.body?.uid || '').trim().toUpperCase();
  const medicineName = String(req.body?.medicine_name || '').trim();
  if (!uid) return res.status(400).json({ error: 'tag_uid is required' });

  try {
    let medId = null;
    if (medicineName) {
      const match = await query('SELECT id FROM medicines WHERE LOWER(name) = LOWER($1) LIMIT 1', [medicineName]);
      if (match.rows[0]) {
        medId = match.rows[0].id;
      } else {
        const newMed = await query(
          'INSERT INTO medicines (name, strength, batch_number) VALUES ($1, $2, $3) RETURNING id',
          [medicineName, 'Standard', 'BATCH-AUTO-' + Date.now().toString().slice(-4)]
        );
        medId = newMed.rows[0].id;
      }
    } else {
      const fallback = await query('SELECT id FROM medicines ORDER BY name LIMIT 1');
      medId = fallback.rows[0]?.id;
    }

    if (!medId) return res.status(400).json({ error: 'No medicine available' });

    await query(
      `INSERT INTO rfid_tags (uid, medicine_id, active) VALUES ($1, $2, TRUE)
       ON CONFLICT (uid) DO UPDATE SET medicine_id = EXCLUDED.medicine_id, active = TRUE`,
      [uid, medId]
    );

    res.json({ ok: true, tag_uid: uid, medicine_id: medId, message: 'Tag registered' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not register tag' });
  }
});

app.get('/api/rfid/tags', requireAuth, requireRole('admin'), async (_req, res) => {
  try {
    const result = await query(
      `SELECT t.uid, t.medicine_id, t.active, t.created_at, m.name as medicine_name, m.strength, m.batch_number
       FROM rfid_tags t
       LEFT JOIN medicines m ON m.id = t.medicine_id
       ORDER BY t.created_at DESC`
    );
    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not fetch RFID tags' });
  }
});

app.delete('/api/rfid/:uid', requireAuth, requireRole('admin'), async (req, res) => {
  const uid = decodeURIComponent(String(req.params.uid || '')).trim().toUpperCase();
  if (!uid) return res.status(400).json({ error: 'UID is required' });
  try {
    const result = await query('DELETE FROM rfid_tags WHERE UPPER(uid) = $1 RETURNING uid', [uid]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Tag not found' });
    res.json({ ok: true, deleted_uid: uid });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not delete tag' });
  }
});

app.get('/api/scans', async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const result = await query(
    `SELECT s.id, s.event_id, s.tag_uid, s.device_id, s.event_type, s.quantity, s.note, s.scanned_at,
      m.name AS medicine_name, m.strength
     FROM scan_events s LEFT JOIN medicines m ON m.id=s.medicine_id
     ORDER BY s.scanned_at DESC LIMIT $1`, [limit]
  );
  res.json(result.rows);
});

// 10-Second Dispense Window State
let pendingDispense = null;

app.post('/api/dispense/confirm', async (req, res) => {
  const medicineId = req.body?.medicine_id || pendingDispense?.medicineId;
  if (!medicineId) return res.status(400).json({ error: 'No active medicine to dispense' });
  try {
    const client = await pool.connect();
    let remaining = 0;
    let medName = 'Medicine';
    try {
      await client.query('BEGIN');
      const medRes = await client.query('SELECT name, strength FROM medicines WHERE id=$1', [medicineId]);
      if (medRes.rows[0]) medName = medRes.rows[0].name;
      const inv = await client.query('SELECT quantity FROM inventory WHERE medicine_id=$1 FOR UPDATE', [medicineId]);
      if (inv.rows[0]) {
        remaining = Math.max(0, Number(inv.rows[0].quantity) - 1);
        await client.query('UPDATE inventory SET quantity=$1, updated_at=NOW() WHERE medicine_id=$2', [remaining, medicineId]);
      }
      const eventId = randomUUID();
      await client.query(
        `INSERT INTO scan_events (event_id,tag_uid,medicine_id,device_id,event_type,quantity,note)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [eventId, '7D:F0:AE:26', medicineId, 'web-client', 'stock_out', 1, 'RFID Keycard 7D:F0:AE:26 confirmed dispense (-1)']
      );
      await client.query('COMMIT');
      pendingDispense = null;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    io.emit('dispense:success', {
      medicine_id: medicineId,
      medicine_name: medName,
      quantity: 1,
      remaining_quantity: remaining,
      tag_uid: '7D:F0:AE:26'
    });
    io.emit('inventory:updated', { medicine_id: medicineId, quantity: remaining, action: 'stock_out' });
    res.json({ ok: true, medicine_id: medicineId, medicine_name: medName, remaining_quantity: remaining });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Dispense failed' });
  }
});

app.post('/api/scans', requireDevice, async (req, res) => {
  const uid = String(req.body?.tag_uid || '').trim().toUpperCase();
  const cleanUid = uid.replace(/[^A-F0-9]/gi, '');
  const isMasterDispenseCard = (uid === '7D:F0:AE:26' || cleanUid === '7DF0AE26');
  const deviceId = String(req.body?.device_id || 'esp32-01').trim().slice(0, 100);
  const eventId = String(req.body?.event_id || '');
  if (!uid || !/^[a-f0-9-]{8,100}$/i.test(eventId)) {
    return res.status(400).json({ error: 'tag_uid and a valid UUID event_id are required' });
  }
  try {
    const existing = await query('SELECT id FROM scan_events WHERE event_id=$1', [eventId]);
    if (existing.rows[0]) return res.json({ ok: true, duplicate: true });

    // Handle 7D:F0:AE:26 as the Master Stock-Removing Card
    if (isMasterDispenseCard) {
      const now = Date.now();
      if (pendingDispense && (now - pendingDispense.timestamp <= 10000)) {
        // Card placed within 10 seconds of medicine scan! Execute stock reduction (-1)
        const targetMedId = pendingDispense.medicineId;
        const targetMedName = pendingDispense.medicineName;
        const targetStrength = pendingDispense.strength;
        pendingDispense = null;

        const client = await pool.connect();
        let remaining = 0;
        try {
          await client.query('BEGIN');
          const inv = await client.query('SELECT quantity FROM inventory WHERE medicine_id=$1 FOR UPDATE', [targetMedId]);
          if (inv.rows[0]) {
            remaining = Math.max(0, Number(inv.rows[0].quantity) - 1);
            await client.query('UPDATE inventory SET quantity=$1, updated_at=NOW() WHERE medicine_id=$2', [remaining, targetMedId]);
          }
          await client.query(
            `INSERT INTO scan_events (event_id,tag_uid,medicine_id,device_id,event_type,quantity,note)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [eventId, uid, targetMedId, deviceId, 'stock_out', 1, `Master Keycard 7D:F0:AE:26 dispense (-1) within 10s`]
          );
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }

        const payload = {
          event_id: eventId,
          tag_uid: uid,
          medicine_id: targetMedId,
          medicine_name: targetMedName,
          strength: targetStrength,
          device_id: deviceId,
          event_type: 'stock_out',
          quantity: 1,
          remaining_quantity: remaining,
          scanned_at: new Date().toISOString(),
          action: 'stock_out',
          note: `Dispensed 1 unit of ${targetMedName}. Remaining stock: ${remaining}`
        };

        io.emit('scan:new', payload);
        io.emit('dispense:success', {
          medicine_id: targetMedId,
          medicine_name: targetMedName,
          quantity: 1,
          remaining_quantity: remaining,
          tag_uid: uid
        });
        io.emit('inventory:updated', { medicine_id: targetMedId, quantity: remaining, action: 'stock_out' });

        return res.status(200).json({
          ok: true,
          is_genuine: true,
          action: 'stock_out',
          medicine_name: targetMedName,
          remaining_quantity: remaining,
          message: `Stock reduced by 1 for ${targetMedName}. Remaining: ${remaining}`,
          scan: payload
        });
      } else {
        // Dispenser card tapped with no prior medicine within 10s
        const payload = {
          event_id: eventId,
          tag_uid: uid,
          medicine_id: null,
          medicine_name: 'Master Dispense Keycard (7D:F0:AE:26)',
          device_id: deviceId,
          event_type: 'identify',
          scanned_at: new Date().toISOString(),
          action: 'dispenser_ready',
          note: 'Master Dispenser Card ready. Scan a medicine first, then tap this card within 10s to deduct stock.'
        };
        io.emit('scan:new', payload);
        return res.status(200).json({
          ok: true,
          is_genuine: true,
          action: 'dispenser_ready',
          medicine_name: 'Master Dispense Keycard (7D:F0:AE:26)',
          message: 'Dispenser card ready. Tap medicine card first, then tap this within 10s to deduct stock.',
          scan: payload
        });
      }
    }

    const match = await query('SELECT medicine_id FROM rfid_tags WHERE uid=$1 AND active=TRUE', [uid]);
    const medicineId = match.rows[0]?.medicine_id || null;
    const eventType = medicineId ? 'identify' : 'unknown_tag';
    const inserted = await query(
      `INSERT INTO scan_events (event_id,tag_uid,medicine_id,device_id,event_type)
       VALUES ($1,$2,$3,$4,$5) RETURNING id,event_id,tag_uid,medicine_id,device_id,event_type,scanned_at`,
      [eventId, uid, medicineId, deviceId, eventType]
    );
    const payload = { ...inserted.rows[0], medicine_name: null, current_stock: null };
    if (medicineId) {
      const m = await query('SELECT name,strength FROM medicines WHERE id=$1', [medicineId]);
      payload.medicine_name = m.rows[0]?.name || null;
      payload.strength = m.rows[0]?.strength || null;

      const inv = await query('SELECT quantity FROM inventory WHERE medicine_id=$1', [medicineId]);
      const currentStock = inv.rows[0] ? Number(inv.rows[0].quantity) : 0;
      payload.current_stock = currentStock;

      // Start 10-second dispense countdown window!
      pendingDispense = {
        medicineId,
        medicineName: payload.medicine_name,
        strength: payload.strength,
        currentStock,
        timestamp: Date.now(),
        tagUid: uid
      };
      payload.dispense_window_active = true;
      payload.seconds_left = 10;
    }
    io.emit('scan:new', payload);
    res.status(201).json({
      ok: true,
      is_genuine: !!medicineId,
      status: medicineId ? 'genuine' : 'fake',
      medicine_name: payload.medicine_name,
      current_stock: payload.current_stock,
      dispense_window_active: !!medicineId,
      scan: payload
    });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Could not save scan' }); }
});

app.post('/api/scans/simulate', async (req, res) => {
  const uid = String(req.body?.tag_uid || '').trim().toUpperCase();
  const cleanUid = uid.replace(/[^A-F0-9]/gi, '');
  const isMasterDispenseCard = (uid === '7D:F0:AE:26' || cleanUid === '7DF0AE26');
  const sampleName = req.body?.sample_name || null;
  const isFake = Boolean(req.body?.is_fake);
  const note = req.body?.note || (isFake ? 'Counterfeit / Fraudulent sample flagged' : 'Virtual test scan');
  const eventId = randomUUID();

  try {
    if (isMasterDispenseCard) {
      const now = Date.now();
      if (pendingDispense && (now - pendingDispense.timestamp <= 10000)) {
        const targetMedId = pendingDispense.medicineId;
        const targetMedName = pendingDispense.medicineName;
        const targetStrength = pendingDispense.strength;
        pendingDispense = null;

        const client = await pool.connect();
        let remaining = 0;
        try {
          await client.query('BEGIN');
          const inv = await client.query('SELECT quantity FROM inventory WHERE medicine_id=$1 FOR UPDATE', [targetMedId]);
          if (inv.rows[0]) {
            remaining = Math.max(0, Number(inv.rows[0].quantity) - 1);
            await client.query('UPDATE inventory SET quantity=$1, updated_at=NOW() WHERE medicine_id=$2', [remaining, targetMedId]);
          }
          await client.query(
            `INSERT INTO scan_events (event_id,tag_uid,medicine_id,device_id,event_type,quantity,note)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [eventId, uid, targetMedId, 'virtual-terminal', 'stock_out', 1, `Master Keycard 7D:F0:AE:26 simulated dispense (-1)`]
          );
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }

        const payload = {
          event_id: eventId,
          tag_uid: uid,
          medicine_id: targetMedId,
          medicine_name: targetMedName,
          strength: targetStrength,
          device_id: 'virtual-terminal',
          event_type: 'stock_out',
          quantity: 1,
          remaining_quantity: remaining,
          scanned_at: new Date().toISOString(),
          action: 'stock_out',
          note: `Dispensed 1 unit of ${targetMedName}. Remaining stock: ${remaining}`
        };

        io.emit('scan:new', payload);
        io.emit('dispense:success', {
          medicine_id: targetMedId,
          medicine_name: targetMedName,
          quantity: 1,
          remaining_quantity: remaining,
          tag_uid: uid
        });
        io.emit('inventory:updated', { medicine_id: targetMedId, quantity: remaining, action: 'stock_out' });

        return res.status(201).json({
          ok: true,
          scan: payload,
          is_genuine: true,
          action: 'stock_out',
          remaining_quantity: remaining,
          alert: 'genuine'
        });
      }
    }

    const match = await query('SELECT medicine_id FROM rfid_tags WHERE uid=$1 AND active=TRUE', [uid]);
    const medicineId = match.rows[0]?.medicine_id || null;
    const eventType = isFake ? 'unknown_tag' : (medicineId ? 'identify' : 'unknown_tag');

    const inserted = await query(
      `INSERT INTO scan_events (event_id,tag_uid,medicine_id,device_id,event_type,note)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,event_id,tag_uid,medicine_id,device_id,event_type,scanned_at,note`,
      [eventId, uid, medicineId, 'nfc-terminal', eventType, note]
    );

    let medicineName = sampleName;
    let strength = null;
    let currentStock = null;
    if (medicineId) {
      const m = await query('SELECT name,strength FROM medicines WHERE id=$1', [medicineId]);
      medicineName = m.rows[0]?.name || sampleName;
      strength = m.rows[0]?.strength || null;
      const inv = await query('SELECT quantity FROM inventory WHERE medicine_id=$1', [medicineId]);
      currentStock = inv.rows[0] ? Number(inv.rows[0].quantity) : 0;

      if (!isFake) {
        pendingDispense = {
          medicineId,
          medicineName,
          strength,
          currentStock,
          timestamp: Date.now(),
          tagUid: uid
        };
      }
    }

    const payload = {
      ...inserted.rows[0],
      medicine_name: medicineName,
      strength,
      current_stock: currentStock,
      dispense_window_active: !isFake && !!medicineId,
      seconds_left: (!isFake && !!medicineId) ? 10 : undefined
    };
    io.emit('scan:new', payload);
    res.status(201).json({ ok: true, scan: payload, alert: isFake ? 'warning' : 'genuine' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Simulation failed' });
  }
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

// Continuous Host & Local IP Detection
let lastDetectedHostIp = null;

function detectLocalIp() {
  try {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          return net.address;
        }
      }
    }
  } catch {}
  return '127.0.0.1';
}

// Background network watchdog: continuously monitors host local IP every 3s
setInterval(async () => {
  const currentIp = detectLocalIp();
  if (currentIp && currentIp !== lastDetectedHostIp) {
    const prev = lastDetectedHostIp;
    lastDetectedHostIp = currentIp;
    console.log(`[NETWORK WATCHDOG] Local Host IP updated: ${prev} -> ${currentIp}`);

    try {
      await query(
        `INSERT INTO devices (id, local_ip, last_seen, firmware_version, status)
         VALUES ('laptop-server', $1, NOW(), 'host-server', 'online')
         ON CONFLICT (id) DO UPDATE SET local_ip = EXCLUDED.local_ip, last_seen = NOW(), status = 'online'`,
        [currentIp]
      );
    } catch {}

    io.emit('network:ip_changed', {
      local_ip: currentIp,
      device_id: 'laptop-server',
      timestamp: new Date().toISOString()
    });
  }
}, 3000);

app.get('/api/network/local-ip', async (_req, res) => {
  const hostIp = detectLocalIp();
  let devIp = null;
  try {
    const dev = await query("SELECT local_ip FROM devices WHERE local_ip IS NOT NULL AND status='online' ORDER BY last_seen DESC LIMIT 1");
    devIp = dev.rows[0]?.local_ip || null;
  } catch {}
  res.json({
    host_ip: hostIp,
    device_ip: devIp,
    active_ip: devIp || hostIp,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/devices/public', async (_req, res) => {
  try {
    const result = await query('SELECT id,local_ip,last_seen,firmware_version,status FROM devices ORDER BY last_seen DESC NULLS LAST');
    res.json(result.rows);
  } catch {
    res.json([]);
  }
});

app.get('/api/devices', async (req, res, next) => {
  // Allow unauthenticated fallback for public telemetry
  const result = await query('SELECT id,local_ip,last_seen,firmware_version,status FROM devices ORDER BY last_seen DESC NULLS LAST');
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
  const payload = { id, local_ip: localIp, last_seen: new Date().toISOString(), status: 'online' };
  io.emit('device:heartbeat', payload);
  if (localIp) {
    io.emit('network:ip_changed', { local_ip: localIp, device_id: id, timestamp: new Date().toISOString() });
  }
  res.json({ ok: true, active_ip: localIp });
});

// Serve static frontend in production if built
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      return next();
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

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
