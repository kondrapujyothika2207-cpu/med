# Medicine RFID Tracking System

Full-stack starter project for ESP32 + PN532 (I²C), React/Vite, Express, PostgreSQL, Socket.IO, and Render.

## Features
- Admin and user portals.
- Demo accounts: `admin / admin123`, `user / user123` (development only).
- Password hashing with bcrypt.
- JWT login and server-side role checks.
- Medicine and RFID UID registration.
- Scan event history and live updates with Socket.IO.
- Explicit stock-in / stock-out actions. Normal identify scans do not change stock.
- ESP32 firmware reads UID, sends scans to the API, and reports heartbeat/local IP.
- Local frontend/API access on the LAN plus public cloud access.
- PostgreSQL schema and Render deployment notes.

## Architecture
- `frontend/`: React/Vite web app.
- `backend/`: Express REST API + Socket.IO.
- `database/schema.sql`: schema.
- `esp32/medicine_rfid.ino`: ESP32 firmware.
- `render.yaml`: Render Blueprint starter.

## Safety and production notes
This is a project starter, not a validated pharmaceutical inventory or patient-safety system. Do not use it as the sole source of truth for regulated dispensing or medicine authenticity.
- Change demo passwords before public deployment.
- Set a long random `JWT_SECRET` and `DEVICE_API_KEY` in Render environment settings.
- The demo account seeder is disabled when `SEED_DEMO_USERS=false`; production should use strong passwords and a controlled account-creation process.
- Use HTTPS for public traffic. Do not expose a local HTTP API directly to the internet.
- RFID UID is an identifier, not cryptographic proof of authenticity.
- Device keys embedded in firmware can be extracted. Use unique per-device keys and rotate them if compromised.
- Keep backups of the Render PostgreSQL database.

## Run locally

Requirements: Node.js 20+, PostgreSQL 14+.

1. Create a PostgreSQL database and run `database/schema.sql`.
2. In `backend/`, copy `.env.example` to `.env` and set `DATABASE_URL`.
3. Run `npm install` then `npm run dev`.
4. In a second terminal, in `frontend/`, run `npm install`, copy `.env.example` to `.env`, and set `VITE_API_URL=http://localhost:4000`.
5. Run `npm run dev -- --host 0.0.0.0`.
6. Open the Vite URL shown in the terminal. From another LAN device, use your computer's LAN IP and Vite port.

To access the backend from a different LAN device, set `HOST=0.0.0.0` and permit the backend port through your local firewall. For the ESP32, use the computer's LAN IP in `API_BASE_URL`, e.g. `http://192.168.1.20:4000`. This HTTP setup is for a trusted LAN test only. For cloud operation, use the Render HTTPS URL.

## Render deployment
1. Push this project to a GitHub repository.
2. In Render, create a PostgreSQL database.
3. Create a Web Service for `backend/` with build command `npm install` and start command `npm start`.
4. Set `DATABASE_URL` to the Render database's **internal** connection URL when API and DB are in the same Render region.
5. Set environment variables:
   - `NODE_ENV=production`
   - `JWT_SECRET` = long random secret
   - `DEVICE_API_KEY` = long random device key
   - `CORS_ORIGIN` = your deployed frontend URL
   - `SEED_DEMO_USERS=false`
   - `DATABASE_URL` = Render PostgreSQL URL
6. Run `database/schema.sql` against the Render database using Render Shell or a database client. The API does not automatically run arbitrary schema migrations at startup.
7. Create a Static Site for `frontend/`, build command `npm install && npm run build`, publish directory `dist`.
8. Set `VITE_API_URL` to the backend URL (for example `https://your-api.onrender.com`) and `VITE_SOCKET_URL` to the same backend URL, then redeploy the frontend.
9. Create strong accounts before exposing the system publicly. For initial admin provisioning, run `npm run seed:admin` in the backend with `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `DATABASE_URL` set, or temporarily use the development seeder only in a private environment.
10. Update the ESP32 firmware with the backend URL and device key, compile/upload it, and confirm the device heartbeat appears in the dashboard.

`render.yaml` is a starting point. For production, create the database and set secrets in Render's dashboard; do not commit `.env` files or secrets.

## PN532 wiring (ESP32 I²C)
Common ESP32 DevKit defaults:
- PN532 SDA -> GPIO 21
- PN532 SCL -> GPIO 22
- PN532 GND -> GND
- PN532 VCC -> voltage supported by your specific PN532 board (check its documentation; 3.3V is the safest choice for ESP32 logic)
- Set the PN532 board's interface switch/jumpers to I²C.

Install Arduino libraries:
- Adafruit PN532
- Adafruit BusIO (dependency)
- ArduinoJson
- WiFi and HTTPClient are included with ESP32 Arduino core.

Some PN532 breakout boards have different switch positions and power requirements. Check the exact board revision.

## Firmware setup
Edit `esp32/medicine_rfid.ino`:
- `WIFI_SSID`, `WIFI_PASSWORD`
- `API_BASE_URL`
- `DEVICE_API_KEY`
- `DEVICE_ID`

Use `https://your-api.onrender.com` for cloud operation. For a local test, `http://<computer-LAN-IP>:4000` is acceptable only on a trusted LAN. Public deployment should use HTTPS.

## API summary
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/medicines`
- `POST /api/medicines` (admin)
- `PUT /api/medicines/:id` (admin)
- `POST /api/rfid/register` (admin)
- `POST /api/scans` (device key; creates identify event)
- `GET /api/scans`
- `POST /api/inventory/adjust` (admin; stock-in or stock-out)
- `GET /api/devices`
- `POST /api/device/heartbeat` (device key)
- `GET /api/health`

## Automatic stock rule
A scan event is an identification event. It does not change stock. Inventory changes happen only through an explicit `stock_in` or `stock_out` action, and the server rejects stock-out quantities that would make stock negative.


## Excel medicine template and product illustrations
- `medicine_rfid_template.xlsx` contains 10 synthetic sample medicines and a yellow `RFID UID (Fill This)` column.
- `medicine_rfid_template.csv` is the CSV alternative.
- `frontend/public/medicines/` contains illustrative, generated-style sample packaging images. They are not real brands or proof of authenticity.
- Copy actual scanned UIDs into the spreadsheet and register them against medicine IDs through the admin portal. This starter does not yet implement a one-click Excel import endpoint; use the spreadsheet as your working register, then enter each UID in the portal. A future import route can bulk-import the rows after validation.

## One-click local launcher (Windows)
1. Install Node.js 20+ and PostgreSQL.
2. Run `database/schema.sql` against your local database.
3. Edit `backend/.env`: set `DATABASE_URL`, `JWT_SECRET`, `DEVICE_API_KEY`, and `SEED_DEMO_USERS=true` for private local development only.
4. Double-click `run.bat`. It opens separate backend and frontend terminal windows.
5. Open `http://localhost:5173`; API health is at `http://localhost:4000/api/health`.
6. If the backend fails, inspect its terminal window. The batch file cannot start PostgreSQL for you.

## Genuine/counterfeit wording
This system can determine whether a scanned UID is registered in your own database. It cannot prove a medicine is genuine based only on UID: UIDs may be copied, and the database must be populated with trusted supply-chain records. The safe default label for an unknown UID is **Unregistered — verification required**, not a definitive counterfeit finding.
