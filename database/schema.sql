CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(80) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(16) NOT NULL CHECK (role IN ('admin', 'user')),
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS medicines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(180) NOT NULL,
  strength VARCHAR(80),
  batch_number VARCHAR(100),
  expiry_date DATE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rfid_tags (
  uid VARCHAR(100) PRIMARY KEY,
  medicine_id UUID NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory (
  medicine_id UUID PRIMARY KEY REFERENCES medicines(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS devices (
  id VARCHAR(100) PRIMARY KEY,
  local_ip INET,
  last_seen TIMESTAMPTZ,
  firmware_version VARCHAR(40),
  status VARCHAR(20) NOT NULL DEFAULT 'offline' CHECK (status IN ('online','offline')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scan_events (
  id BIGSERIAL PRIMARY KEY,
  event_id UUID UNIQUE NOT NULL,
  tag_uid VARCHAR(100),
  medicine_id UUID REFERENCES medicines(id) ON DELETE SET NULL,
  device_id VARCHAR(100) NOT NULL,
  event_type VARCHAR(20) NOT NULL DEFAULT 'identify'
    CHECK (event_type IN ('identify','unknown_tag','stock_in','stock_out')),
  quantity INTEGER,
  note TEXT,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS scan_events_scanned_at_idx ON scan_events (scanned_at DESC);
CREATE INDEX IF NOT EXISTS scan_events_medicine_id_idx ON scan_events (medicine_id);
CREATE INDEX IF NOT EXISTS medicines_name_idx ON medicines (name);
