-- ============================================================
-- 002_add_country_source_method.sql
-- Adds country + source_method to leadenricher_leads,
-- and discarded count to leadenricher_batches.
-- Run after 001_initial.sql.
-- ============================================================

alter table leadenricher_leads
  add column if not exists country       text,
  add column if not exists source_method text not null default 'domain_search';

alter table leadenricher_batches
  add column if not exists discarded int not null default 0;
