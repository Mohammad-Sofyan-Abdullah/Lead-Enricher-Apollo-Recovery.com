-- ============================================================
-- 001_initial.sql
-- Run this once in Supabase SQL editor (or psql) to bootstrap
-- the rehab leads pipeline schema.
-- All tables are prefixed with leadenricher_
-- ============================================================

create table leadenricher_centers (
  id            uuid        primary key default gen_random_uuid(),
  name          text        not null,
  website       text,                                    -- actual center website (may be null)
  source_page   text,                                    -- recovery.com / rehabpath listing URL
  domain        text,                                    -- extracted from website
  no_website    boolean     not null default false,      -- true when website was empty or unextractable
  raw_url       text,                                    -- original URL before cleaning
  status        text        not null default 'pending',  -- pending | skipped | enriched | not_found
  skip_reason   text,
  source_method text        not null default 'domain_search',
  batch_id      text,
  created_at    timestamptz not null default now()
);

create table leadenricher_leads (
  id           uuid        primary key default gen_random_uuid(),
  apollo_id    text        unique not null,
  center_id    uuid        references leadenricher_centers(id),
  center_name  text,
  website      text,
  full_name    text        not null,
  email        text,
  linkedin_url text,
  title        text,
  organization text,
  email_status text,
  created_at   timestamptz not null default now()
);

create table leadenricher_batches (
  id             text        primary key,
  label          text,
  total_centers  int         not null default 0,
  enriched       int         not null default 0,
  not_found      int         not null default 0,
  skipped        int         not null default 0,
  created_at     timestamptz not null default now()
);

create unique index leadenricher_leads_apollo_id_idx  on leadenricher_leads(apollo_id);
create        index leadenricher_centers_batch_id_idx on leadenricher_centers(batch_id);
create        index leadenricher_centers_status_idx   on leadenricher_centers(status);

-- ============================================================
-- Row Level Security
-- Service role bypasses RLS automatically (service_role key).
-- Anon/authenticated users have no access.
-- ============================================================

alter table leadenricher_centers enable row level security;
alter table leadenricher_leads   enable row level security;
alter table leadenricher_batches enable row level security;
