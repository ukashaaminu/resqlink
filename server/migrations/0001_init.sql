-- Enable PostGIS if available (required for geography type; comment out if extension not installed yet)
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS sos_events (
  id BIGSERIAL PRIMARY KEY,
  uid TEXT NOT NULL,
  ver TEXT NOT NULL,
  ts_ms BIGINT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  acc DOUBLE PRECISION,
  status TEXT NOT NULL,
  med JSONB NOT NULL,
  payload_hash TEXT NOT NULL,
  relay_meta JSONB,
  inserted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sos_events_uid_ts ON sos_events (uid, ts_ms DESC);
CREATE INDEX IF NOT EXISTS idx_sos_events_uid_hash ON sos_events (uid, payload_hash);

CREATE TABLE IF NOT EXISTS contact_tokens (
  uid TEXT NOT NULL,
  token TEXT PRIMARY KEY,
  platform TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_tokens_uid ON contact_tokens (uid);
