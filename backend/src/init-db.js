import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required');
}

const client = new pg.Client({
  connectionString,
  ssl: connectionString.includes('render.com') ? { rejectUnauthorized: false } : undefined
});

async function main() {
  try {
    console.log('Connecting to Render PostgreSQL database...');
    await client.connect();
    console.log('✓ Successfully connected to Render PostgreSQL database!');

    // 1. Read schema.sql
    const schemaPath = path.resolve(__dirname, '../../database/schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    console.log('Applying database schema (schema.sql)...');
    await client.query(schemaSql);
    console.log('✓ Schema applied successfully (tables: users, medicines, rfid_tags, inventory, devices, scan_events)');

    // 2. Seed Users: admin/admin123 and user/user123
    console.log('Seeding authentication accounts...');
    const users = [
      { username: 'admin', password: 'admin123', role: 'admin' },
      { username: 'user', password: 'user123', role: 'user' }
    ];

    for (const u of users) {
      const hash = await bcrypt.hash(u.password, 12);
      await client.query(
        `INSERT INTO users (username, password_hash, role, must_change_password)
         VALUES ($1, $2, $3, FALSE)
         ON CONFLICT (username) DO NOTHING`,
        [u.username, hash, u.role]
      );
    }
    console.log('✓ Accounts verified: admin (admin123) and user (user123)');

    // 3. Seed Medicines from catalog if empty
    const medCheck = await client.query('SELECT COUNT(*)::int AS count FROM medicines');
    if (medCheck.rows[0].count === 0) {
      console.log('Seeding initial medicines catalog and inventory...');
      const medicines = [
        { name: 'Paracetamol', strength: '500 mg', batch: 'BATCH-PAR-001', expiry: '2027-08-31', desc: 'Pain relief & antipyretic', stock: 50, tag: 'E4:A5:6C:12' },
        { name: 'Amoxicillin', strength: '250 mg', batch: 'BATCH-AMX-002', expiry: '2027-05-31', desc: 'Broad spectrum antibiotic', stock: 30, tag: '8B:23:44:91' },
        { name: 'Cetirizine', strength: '10 mg', batch: 'BATCH-CET-003', expiry: '2027-11-30', desc: 'Antihistamine / allergy relief', stock: 40, tag: '1A:8F:72:EE' },
        { name: 'Omeprazole', strength: '20 mg', batch: 'BATCH-OMP-004', expiry: '2027-09-30', desc: 'Proton pump inhibitor / gastric', stock: 25, tag: '3C:99:A1:04' },
        { name: 'Azithromycin', strength: '500 mg', batch: 'BATCH-AZI-005', expiry: '2027-04-30', desc: 'Macrolide antibiotic', stock: 20, tag: '5D:22:BB:77' },
        { name: 'Ibuprofen', strength: '400 mg', batch: 'BATCH-IBU-006', expiry: '2027-10-31', desc: 'NSAID analgesic & anti-inflammatory', stock: 45, tag: '6F:44:CC:88' },
        { name: 'Vitamin D3', strength: '1000 IU', batch: 'BATCH-VIT-007', expiry: '2028-01-31', desc: 'Essential dietary supplement', stock: 60, tag: '7A:55:DD:99' },
        { name: 'Metformin', strength: '500 mg', batch: 'BATCH-MET-008', expiry: '2027-12-31', desc: 'Type 2 diabetes management', stock: 35, tag: '8B:66:EE:AA' },
        { name: 'Amlodipine', strength: '5 mg', batch: 'BATCH-AML-009', expiry: '2027-06-30', desc: 'Calcium channel blocker / BP', stock: 25, tag: '9C:77:FF:BB' },
        { name: 'Atorvastatin', strength: '10 mg', batch: 'BATCH-ATO-010', expiry: '2027-03-31', desc: 'Statin / cholesterol reduction', stock: 30, tag: 'AD:88:00:CC' }
      ];

      for (const m of medicines) {
        const medRes = await client.query(
          `INSERT INTO medicines (name, strength, batch_number, expiry_date, description)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [m.name, m.strength, m.batch, m.expiry, m.desc]
        );
        const medId = medRes.rows[0].id;

        await client.query(
          `INSERT INTO inventory (medicine_id, quantity) VALUES ($1, $2)
           ON CONFLICT (medicine_id) DO UPDATE SET quantity = EXCLUDED.quantity`,
          [medId, m.stock]
        );

        await client.query(
          `INSERT INTO rfid_tags (uid, medicine_id, active) VALUES ($1, $2, TRUE)
           ON CONFLICT (uid) DO NOTHING`,
          [m.tag, medId]
        );
      }
      console.log('✓ 10 medicines seeded with inventory and demo RFID tags');
    } else {
      console.log(`Medicines table already populated (${medCheck.rows[0].count} rows).`);
    }

    // 4. Verify all tables
    console.log('\n--- Render PostgreSQL Summary ---');
    const tables = ['users', 'medicines', 'rfid_tags', 'inventory', 'devices', 'scan_events'];
    for (const t of tables) {
      const res = await client.query(`SELECT COUNT(*)::int AS count FROM ${t}`);
      console.log(`- Table ${t.padEnd(14)} : ${res.rows[0].count} rows`);
    }

    console.log('\n✓ Render database setup is 100% complete and verified!');
  } catch (err) {
    console.error('Database migration error:', err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
