-- V1: Schemas + metadata
CREATE SCHEMA IF NOT EXISTS shop;
CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS graph_export;
CREATE SCHEMA IF NOT EXISTS meta;

-- Track ingestion runs (files, jobs, etc.)
CREATE TABLE IF NOT EXISTS meta.ingest_runs (
  ingest_run_id     BIGSERIAL PRIMARY KEY,
  source_system     TEXT NOT NULL,
  source_artifact   TEXT NOT NULL,  -- e.g. filename, export id, api batch id
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at       TIMESTAMPTZ,
  status            TEXT NOT NULL DEFAULT 'STARTED',
  row_counts_json   JSONB,
  notes             TEXT
);

-- Optional: store current watermark for incremental graph sync
CREATE TABLE IF NOT EXISTS meta.graph_sync_state (
  graph_name        TEXT PRIMARY KEY,
  last_synced_at    TIMESTAMPTZ,
  last_run_id       BIGINT REFERENCES meta.ingest_runs(ingest_run_id),
  notes             TEXT
);
