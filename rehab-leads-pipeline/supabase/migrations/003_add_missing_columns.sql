-- ============================================================
-- 003_add_missing_columns.sql  (mirrors db/003_add_missing_columns.sql)
-- Run on an existing DB that already has 001 and 002.
-- ============================================================

alter table leadenricher_centers
  add column if not exists updated_at timestamptz not null default now();

alter table leadenricher_leads
  add column if not exists source_page text,
  add column if not exists updated_at timestamptz not null default now();

alter table leadenricher_batches
  add column if not exists updated_at timestamptz not null default now();

create index if not exists leads_center_id_idx
  on leadenricher_leads(center_id);

create index if not exists batches_created_at_idx
  on leadenricher_batches(created_at desc);
