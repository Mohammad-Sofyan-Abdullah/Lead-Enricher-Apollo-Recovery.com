-- ============================================================
-- 004_add_updated_at_triggers.sql
-- Adds updated_at columns (idempotent) and auto-update triggers.
-- Safe to run on databases that already have the columns.
-- ============================================================

ALTER TABLE leadenricher_centers
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE leadenricher_leads
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE leadenricher_batches
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Trigger function (CREATE OR REPLACE is idempotent)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers (CREATE OR REPLACE requires PostgreSQL 14+, which Supabase uses)
CREATE OR REPLACE TRIGGER update_centers_updated_at
  BEFORE UPDATE ON leadenricher_centers
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE OR REPLACE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON leadenricher_leads
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE OR REPLACE TRIGGER update_batches_updated_at
  BEFORE UPDATE ON leadenricher_batches
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Refresh the PostgREST schema cache so Supabase client sees the new columns
NOTIFY pgrst, 'reload schema';
